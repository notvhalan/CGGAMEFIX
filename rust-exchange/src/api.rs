use axum::{
    extract::{Path, Query, State},
    http::{StatusCode, HeaderMap},
    Json,
    response::IntoResponse,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use crate::types::*;
use crate::AppState;

/// Quote endpoint - UI uses this to show user what they'll get
#[derive(Deserialize)]
pub struct QuoteRequest {
    side: Side,
    risk_pence: i64,
    limit_yes_pts: Option<i64>, // If None, use best available
}

pub async fn get_quote(
    State(app): State<AppState>,
    Path(market_id): Path<Uuid>,
    Query(req): Query<QuoteRequest>,
) -> Result<Json<QuoteResponse>, AppError> {
    // Validate price
    let limit_yes_pts = req.limit_yes_pts.unwrap_or(5_000_000); // Default 50%
    if limit_yes_pts < 1 || limit_yes_pts >= PRICE_SCALE {
        return Err(AppError::InvalidPrice);
    }

    // Calculate contracts from risk
    let contracts_micros = match req.side {
        Side::BuyYes => buyyes_contracts_from_risk(req.risk_pence, limit_yes_pts),
        Side::SellYes => sellyes_contracts_from_risk(req.risk_pence, limit_yes_pts),
    };

    // Calculate actual risk after rounding
    let actual_risk_pence = match req.side {
        Side::BuyYes => calculate_risk_buyyes(contracts_micros, limit_yes_pts),
        Side::SellYes => calculate_risk_sellyes(contracts_micros, limit_yes_pts),
    };

    // Calculate profit if win
    let profit_if_win = calculate_profit_if_win(actual_risk_pence, contracts_micros);

    // Calculate fee
    let fee_pence = calculate_fee(actual_risk_pence);

    Ok(Json(QuoteResponse {
        contracts_micros,
        risk_pence: actual_risk_pence,
        profit_if_win_pence: profit_if_win,
        fee_pence,
        limit_yes_pts,
    }))
}

/// Create order request
#[derive(Deserialize)]
pub struct CreateOrderRequest {
    market_id: Uuid,
    side: Side,
    risk_pence: i64,
    limit_yes_pts: i64,
    time_in_force: Option<TimeInForce>,
}

#[derive(Serialize)]
pub struct CreateOrderResponse {
    order_id: Uuid,
    status: String,
    contracts_micros: i64,
    actual_risk_pence: i64,
}

pub async fn create_order(
    State(app): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<CreateOrderRequest>,
) -> Result<Json<CreateOrderResponse>, AppError> {
    // Extract user_id from X-User-Id header or use default
    let user_id = headers
        .get("X-User-Id")
        .and_then(|h| h.to_str().ok())
        .and_then(|s| Uuid::parse_str(s).ok())
        .unwrap_or_else(|| Uuid::parse_str("97344faa-ff14-498e-af84-88639c24edf6").unwrap());
    
    tracing::info!("Creating order for user_id: {}, market: {}, side: {:?}, risk: {} pence, price: {} pts", 
        user_id, req.market_id, req.side, req.risk_pence, req.limit_yes_pts);
    
    // Validate
    if req.risk_pence < 100 {
        tracing::warn!("Order rejected: risk {} pence < minimum 100 pence", req.risk_pence);
        return Err(AppError::BadRequest(format!("Minimum risk is £1.00, got {} pence", req.risk_pence)));
    }
    if req.limit_yes_pts < 1 || req.limit_yes_pts >= PRICE_SCALE {
        tracing::warn!("Order rejected: invalid price {} (must be 1 <= price < {})", req.limit_yes_pts, PRICE_SCALE);
        return Err(AppError::BadRequest(format!("Invalid price: {} (must be between 1 and {})", req.limit_yes_pts, PRICE_SCALE - 1)));
    }

    // Calculate contracts
    let contracts_micros = match req.side {
        Side::BuyYes => buyyes_contracts_from_risk(req.risk_pence, req.limit_yes_pts),
        Side::SellYes => sellyes_contracts_from_risk(req.risk_pence, req.limit_yes_pts),
    };

    if contracts_micros < 10_000 { // Minimum 0.01 contracts
        return Err(AppError::BadRequest("Order too small".to_string()));
    }

    // Calculate reserve needed (at limit price)
    let reserve_pence = match req.side {
        Side::BuyYes => calculate_risk_buyyes(contracts_micros, req.limit_yes_pts),
        Side::SellYes => calculate_risk_sellyes(contracts_micros, req.limit_yes_pts),
    };

    let order_id = Uuid::new_v4();
    let time_in_force = req.time_in_force.unwrap_or(TimeInForce::Gtc);

    // Start DB transaction
    let mut tx = app.db.begin().await?;

    // 1. Reserve funds
    app.wallet.reserve_for_order(&mut tx, user_id, reserve_pence).await?;

    // 2. Insert order
    let side_str = match req.side {
        Side::BuyYes => "BUY_YES",
        Side::SellYes => "SELL_YES",
    };
    let tif_str = match time_in_force {
        TimeInForce::Gtc => "GTC",
        TimeInForce::Ioc => "IOC",
    };
    
    sqlx::query!(
        r#"
        INSERT INTO orders (
            id, user_id, market_id, side, p_pts, limit_price_yes_pts,
            liability_pence, status, qty_original_micros, qty_remaining_micros,
            time_in_force
        )
        VALUES ($1, $2, $3, $4::order_side_new, $5, $6, $7, 'OPEN', $8, $8, $9)
        "#,
        order_id,
        user_id,
        req.market_id,
        side_str as &str,
        req.limit_yes_pts as i32,
        req.limit_yes_pts as i32,
        reserve_pence,
        contracts_micros,
        tif_str as &str
    )
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    // 3. Send command to matching engine
    app.match_tx.send(MatchCommand {
        order_id,
        market_id: req.market_id,
        side: req.side,
        limit_yes_pts: req.limit_yes_pts,
        qty_micros: contracts_micros,
        time_in_force,
    })?;

    Ok(Json(CreateOrderResponse {
        order_id,
        status: "PENDING".to_string(),
        contracts_micros,
        actual_risk_pence: reserve_pence,
    }))
}

#[derive(Debug)]
pub enum AppError {
    BadRequest(String),
    InvalidPrice,
    Database(sqlx::Error),
    Internal(String),
}

impl From<sqlx::Error> for AppError {
    fn from(e: sqlx::Error) -> Self {
        AppError::Database(e)
    }
}

impl From<anyhow::Error> for AppError {
    fn from(e: anyhow::Error) -> Self {
        AppError::Internal(e.to_string())
    }
}

impl From<tokio::sync::mpsc::error::SendError<MatchCommand>> for AppError {
    fn from(e: tokio::sync::mpsc::error::SendError<MatchCommand>) -> Self {
        AppError::Internal(e.to_string())
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> axum::response::Response {
        let (status, message) = match self {
            AppError::BadRequest(msg) => (StatusCode::BAD_REQUEST, msg),
            AppError::InvalidPrice => (StatusCode::BAD_REQUEST, "Invalid price".to_string()),
            AppError::Database(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
            AppError::Internal(msg) => (StatusCode::INTERNAL_SERVER_ERROR, msg),
        };

        (status, message).into_response()
    }
}
