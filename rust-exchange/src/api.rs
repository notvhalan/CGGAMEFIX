use axum::{
    extract::{Path, Query, State},
    http::{StatusCode, HeaderMap},
    Json,
    response::IntoResponse,
};
use chrono::Utc;
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
    State(_app): State<AppState>,
    Path(_market_id): Path<Uuid>,
    Query(req): Query<QuoteRequest>,
) -> Result<Json<QuoteResponse>, AppError> {
    // Validate price
    const MIN_PRICE_PTS: i64 = 10_000;      // 0.1%
    const MAX_PRICE_PTS: i64 = 9_990_000;   // 99.9%
    let limit_yes_pts = req.limit_yes_pts.unwrap_or(5_000_000); // Default 50%
    if limit_yes_pts < MIN_PRICE_PTS || limit_yes_pts > MAX_PRICE_PTS {
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
    reduce_only: Option<bool>,
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
    let user_id = require_user_id(&headers)?;
    
    tracing::info!(
        "Creating order for user_id: {}, market: {}, side: {:?}, risk: {} pence, price: {} pts, reduce_only: {}",
        user_id,
        req.market_id,
        req.side,
        req.risk_pence,
        req.limit_yes_pts,
        req.reduce_only.unwrap_or(false)
    );
    
    // Validate
    if req.risk_pence < 100 {
        tracing::warn!("Order rejected: risk {} pence < minimum 100 pence", req.risk_pence);
        return Err(AppError::BadRequest(format!("Minimum risk is £1.00, got {} pence", req.risk_pence)));
    }
    // Enforce price range: 0.1% to 99.9% (10000 pts to 9990000 pts)
    const MIN_PRICE_PTS: i64 = 10_000;      // 0.1%
    const MAX_PRICE_PTS: i64 = 9_990_000;   // 99.9%
    if req.limit_yes_pts < MIN_PRICE_PTS || req.limit_yes_pts > MAX_PRICE_PTS {
        tracing::warn!("Order rejected: invalid price {} (must be {} <= price <= {})", req.limit_yes_pts, MIN_PRICE_PTS, MAX_PRICE_PTS);
        return Err(AppError::BadRequest(format!("Price must be between 0.1% and 99.9%, got {:.4}%", req.limit_yes_pts as f64 / 100_000.0)));
    }

    // Calculate contracts
    let base_contracts_micros = match req.side {
        Side::BuyYes => buyyes_contracts_from_risk(req.risk_pence, req.limit_yes_pts),
        Side::SellYes => sellyes_contracts_from_risk(req.risk_pence, req.limit_yes_pts),
    };

    if base_contracts_micros < 10_000 { // Minimum 0.01 contracts
        return Err(AppError::BadRequest("Order too small".to_string()));
    }

    let order_id = Uuid::new_v4();
    let time_in_force = req.time_in_force.unwrap_or(TimeInForce::Gtc);
    let reduce_only = req.reduce_only.unwrap_or(false);

    // For IOC (market) non-reduce-only orders, use budget-aware matching:
    // Double the quantity headroom so the budget (not quantity) is the binding
    // constraint when fills happen at better-than-limit prices.
    let is_ioc_budget = time_in_force == TimeInForce::Ioc && !reduce_only;
    let contracts_micros = if is_ioc_budget {
        base_contracts_micros * 2
    } else {
        base_contracts_micros
    };

    if reduce_only && time_in_force != TimeInForce::Ioc {
        return Err(AppError::BadRequest(
            "reduce_only orders must use IOC".to_string(),
        ));
    }

    if reduce_only {
        // Validate against the gross qty of the lots that will actually be consumed,
        // not the net position. This allows closing e.g. 105 BUY_YES lots with a
        // SELL_YES reduce_only order even when 38 SELL_YES lots make the net only 67.
        let consumed_side_str = match req.side {
            Side::SellYes => "BUY_YES",
            Side::BuyYes  => "SELL_YES",
        };

        let gross_qty_micros = sqlx::query_scalar!(
            r#"
            SELECT COALESCE(SUM(qty_remaining_micros), 0)::bigint as "total!"
            FROM position_lots
            WHERE user_id = $1
              AND market_id = $2
              AND side::text = $3
              AND qty_remaining_micros > 0
            "#,
            user_id,
            req.market_id,
            consumed_side_str
        )
        .fetch_one(&app.db)
        .await?;

        if gross_qty_micros == 0 {
            return Err(AppError::BadRequest(
                "No open position for reduce-only close".to_string(),
            ));
        }

        if contracts_micros > gross_qty_micros {
            return Err(AppError::BadRequest(format!(
                "reduce_only size exceeds position (requested {}, position {})",
                contracts_micros,
                gross_qty_micros
            )));
        }
    }

    // Calculate reserve needed (at limit price).
    // reduce_only IOC closes consume existing exposure; they do not reserve fresh order collateral.
    // IOC budget orders reserve the exact budget so the user's full stake is utilised.
    let reserve_pence = if reduce_only {
        0
    } else if is_ioc_budget {
        req.risk_pence
    } else {
        match req.side {
            Side::BuyYes => calculate_risk_buyyes(contracts_micros, req.limit_yes_pts),
            Side::SellYes => calculate_risk_sellyes(contracts_micros, req.limit_yes_pts),
        }
    };

    // Start DB transaction
    let mut tx = app.db.begin().await?;

    // 1. Reserve funds for non-reduce-only orders
    if reserve_pence > 0 {
        app.wallet
            .reserve_for_order(&mut tx, user_id, reserve_pence)
            .await?;
    }

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
    app.match_tx.send(EngineCommand::Submit(MatchCommand {
        order_id,
        user_id,
        market_id: req.market_id,
        side: req.side,
        limit_yes_pts: req.limit_yes_pts,
        qty_micros: contracts_micros,
        time_in_force,
        ioc_budget_pence: if is_ioc_budget { Some(req.risk_pence) } else { None },
    }))?;

    Ok(Json(CreateOrderResponse {
        order_id,
        status: "PENDING".to_string(),
        contracts_micros,
        actual_risk_pence: reserve_pence,
    }))
}

#[derive(Serialize)]
pub struct CancelOrderResponse {
    order_id: Uuid,
    status: String,
    market_id: Uuid,
}

pub async fn cancel_order(
    State(app): State<AppState>,
    headers: HeaderMap,
    Path(order_id): Path<Uuid>,
) -> Result<Json<CancelOrderResponse>, AppError> {
    let user_id = require_user_id(&headers)?;

    let order = sqlx::query!(
        r#"
        SELECT market_id, COALESCE(status::text, 'OPEN') as "status!"
        FROM orders
        WHERE id = $1 AND user_id = $2
        "#,
        order_id,
        user_id
    )
    .fetch_optional(&app.db)
    .await?;

    let Some(order) = order else {
        return Err(AppError::BadRequest("Order not found".to_string()));
    };

    if order.status != "OPEN" && order.status != "PARTIALLY_MATCHED" {
        return Ok(Json(CancelOrderResponse {
            order_id,
            status: order.status,
            market_id: order.market_id,
        }));
    }

    app.match_tx.send(EngineCommand::Cancel(CancelCommand {
        order_id,
        user_id,
    }))?;

    Ok(Json(CancelOrderResponse {
        order_id,
        status: "PENDING_CANCEL".to_string(),
        market_id: order.market_id,
    }))
}

fn require_user_id(headers: &HeaderMap) -> Result<Uuid, AppError> {
    headers
        .get("X-User-Id")
        .and_then(|h| h.to_str().ok())
        .and_then(|s| Uuid::parse_str(s).ok())
        .ok_or_else(|| AppError::Unauthorized("Missing X-User-Id".to_string()))
}

#[derive(Deserialize)]
pub struct OrdersQuery {
    #[serde(alias = "marketId")]
    market_id: Option<Uuid>,
    #[serde(alias = "includeHistory")]
    include_history: Option<bool>,
    limit: Option<i64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OrderSummary {
    pub id: Uuid,
    pub market_id: Uuid,
    pub side: Side,
    pub p_pts: i64,
    pub yes_pts: i64,
    pub liability_pence: i64,
    pub original_contracts: String,
    pub remaining_contracts: String,
    pub status: String,
    pub time_in_force: String,
    pub created_at: String,
}

#[derive(Serialize)]
pub struct OrdersResponse {
    pub orders: Vec<OrderSummary>,
}

pub async fn get_orders(
    State(app): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<OrdersQuery>,
) -> Result<Json<OrdersResponse>, AppError> {
    let user_id = require_user_id(&headers)?;
    let include_history = query.include_history.unwrap_or(false);
    let limit = query.limit.unwrap_or(200).max(1).min(1000);

    let rows = sqlx::query!(
        r#"
        SELECT
            id,
            market_id,
            side as "side: Side",
            p_pts,
            limit_price_yes_pts,
            COALESCE(liability_pence, 0)::bigint as "liability_pence!",
            COALESCE(status::text, 'OPEN') as "status!",
            qty_original_micros,
            qty_remaining_micros,
            COALESCE(time_in_force::text, 'GTC') as "time_in_force!",
            created_at
        FROM orders
        WHERE user_id = $1
          AND ($2::uuid IS NULL OR market_id = $2)
          AND ($3::bool OR status IN ('OPEN', 'PARTIALLY_MATCHED'))
        ORDER BY created_at DESC
        LIMIT $4
        "#,
        user_id,
        query.market_id,
        include_history,
        limit
    )
    .fetch_all(&app.db)
    .await?;

    let orders = rows
        .into_iter()
        .map(|r| OrderSummary {
            id: r.id,
            market_id: r.market_id,
            side: r.side,
            p_pts: r.p_pts as i64,
            yes_pts: r.limit_price_yes_pts as i64,
            liability_pence: r.liability_pence,
            original_contracts: r.qty_original_micros.to_string(),
            remaining_contracts: r.qty_remaining_micros.to_string(),
            status: r.status,
            time_in_force: r.time_in_force,
            created_at: r
                .created_at
                .map(|dt| dt.to_rfc3339())
                .unwrap_or_else(|| Utc::now().to_rfc3339()),
        })
        .collect();

    Ok(Json(OrdersResponse { orders }))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TradePosition {
    pub size_pence: i64,
    pub yes_price_pts: i64,
    pub fee_pence: i64,
    pub executed_at: String,
    pub contracts_micros: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PositionResponse {
    pub market_id: Uuid,
    pub net_yes_pence: i64,
    pub net_contracts_micros: String,
    pub avg_entry_yes_pts: i64,
    pub mark_yes_pts: i64,
    pub unrealized_pnl_pence: i64,
    pub total_fees_pence: i64,
    pub can_cash_out: bool,
    pub buy_positions: Vec<TradePosition>,
    pub sell_positions: Vec<TradePosition>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PositionSummary {
    pub market_id: Uuid,
    pub market_question: String,
    pub net_yes_pence: i64,
    pub net_contracts_micros: String,
    pub avg_entry_yes_pts: i64,
    pub mark_yes_pts: i64,
    pub unrealized_pnl_pence: i64,
    pub total_fees_pence: i64,
    pub can_cash_out: bool,
}

pub async fn get_positions(
    State(app): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Vec<PositionSummary>>, AppError> {
    let user_id = require_user_id(&headers)?;

    let rows = sqlx::query!(
        r#"
        SELECT
            p.market_id,
            COALESCE(p.net_qty_micros, 0)::bigint as "net_qty_micros!",
            COALESCE(p.avg_open_price_yes_pts, 0) as "avg_open_price_yes_pts!",
            COALESCE(p.realized_pnl_pence, 0) as "realized_pnl_pence!",
            COALESCE(p.fees_paid_pence, 0) as "fees_paid_pence!",
            m.name as market_question
        FROM positions p
        JOIN markets m ON p.market_id = m.id
        WHERE p.user_id = $1
          AND COALESCE(p.net_qty_micros, 0) <> 0
        ORDER BY p.updated_at DESC
        "#,
        user_id
    )
    .fetch_all(&app.db)
    .await?;

    let positions = rows
        .into_iter()
        .map(|r| PositionSummary {
            market_id: r.market_id,
            market_question: r.market_question,
            net_yes_pence: 0,
            net_contracts_micros: r.net_qty_micros.to_string(),
            avg_entry_yes_pts: r.avg_open_price_yes_pts as i64,
            mark_yes_pts: PRICE_SCALE / 2,
            unrealized_pnl_pence: 0,
            total_fees_pence: r.fees_paid_pence as i64,
            can_cash_out: true,
        })
        .collect();

    Ok(Json(positions))
}

pub async fn get_position_for_market(
    State(app): State<AppState>,
    headers: HeaderMap,
    Path(market_id): Path<Uuid>,
) -> Result<Json<PositionResponse>, AppError> {
    let user_id = require_user_id(&headers)?;

    let lots = sqlx::query!(
        r#"
        SELECT 
            side::text as "side!",
            entry_price_yes_pts,
            qty_remaining_micros,
            opened_at
        FROM position_lots
        WHERE user_id = $1 AND market_id = $2 AND qty_remaining_micros > 0
        ORDER BY opened_at ASC
        "#,
        user_id,
        market_id
    )
    .fetch_all(&app.db)
    .await?;

    let position = sqlx::query!(
        r#"
        SELECT 
            COALESCE(net_qty_micros, 0) as "net_qty_micros!",
            COALESCE(avg_open_price_yes_pts, 0) as "avg_open_price_yes_pts!",
            COALESCE(realized_pnl_pence, 0) as "realized_pnl_pence!",
            COALESCE(fees_paid_pence, 0) as "fees_paid_pence!"
        FROM positions
        WHERE market_id = $1 AND user_id = $2
        "#,
        market_id,
        user_id
    )
    .fetch_optional(&app.db)
    .await?;

    if lots.is_empty() && position.is_none() {
        return Ok(Json(PositionResponse {
            market_id,
            net_yes_pence: 0,
            net_contracts_micros: "0".to_string(),
            avg_entry_yes_pts: 0,
            mark_yes_pts: PRICE_SCALE / 2,
            unrealized_pnl_pence: 0,
            total_fees_pence: 0,
            can_cash_out: false,
            buy_positions: Vec::new(),
            sell_positions: Vec::new(),
        }));
    }

    let mut net_contracts_micros: i128 = position
        .as_ref()
        .map(|p| p.net_qty_micros as i128)
        .unwrap_or(0);

    if net_contracts_micros == 0 {
        for lot in &lots {
            let qty = lot.qty_remaining_micros as i128;
            if lot.side == "BUY_YES" {
                net_contracts_micros += qty;
            } else {
                net_contracts_micros -= qty;
            }
        }
    }

    let avg_entry_yes_pts = position
        .as_ref()
        .map(|p| p.avg_open_price_yes_pts as i64)
        .unwrap_or(0);
    let total_fees_pence = position
        .as_ref()
        .map(|p| p.fees_paid_pence as i64)
        .unwrap_or(0);

    let mut buy_positions = Vec::new();
    let mut sell_positions = Vec::new();

    for lot in lots {
        // Include all lots regardless of net direction — both BUY_YES and SELL_YES are
        // returned independently so the frontend can display them as separate groups.

        let qty = lot.qty_remaining_micros as i128;
        let price = lot.entry_price_yes_pts as i64;
        let notional_pence = (price as i128 * qty * PAYOUT_PENCE_PER_CONTRACT as i128)
            / (PRICE_SCALE as i128 * CONTRACT_SCALE_MICROS as i128);
        let executed_at = lot.opened_at.and_utc().to_rfc3339();

        let tp = TradePosition {
            size_pence: notional_pence as i64,
            yes_price_pts: price,
            fee_pence: 0,
            executed_at,
            contracts_micros: if lot.side == "BUY_YES" {
                qty.to_string()
            } else {
                format!("-{}", qty)
            },
        };

        if lot.side == "BUY_YES" {
            buy_positions.push(tp);
        } else {
            sell_positions.push(tp);
        }
    }

    let best_bid_yes = sqlx::query_scalar!(
        r#"
        SELECT MAX(limit_price_yes_pts)
        FROM orders
        WHERE market_id = $1
          AND side::text = 'BUY_YES'
          AND status IN ('OPEN', 'PARTIALLY_MATCHED')
        "#,
        market_id
    )
    .fetch_one(&app.db)
    .await?
    .unwrap_or(0);

    let best_ask_yes = sqlx::query_scalar!(
        r#"
        SELECT MIN(limit_price_yes_pts)
        FROM orders
        WHERE market_id = $1
          AND side::text = 'SELL_YES'
          AND status IN ('OPEN', 'PARTIALLY_MATCHED')
        "#,
        market_id
    )
    .fetch_one(&app.db)
    .await?
    .unwrap_or(PRICE_SCALE);

    let mark_yes_pts = if best_bid_yes > 0 && best_ask_yes < PRICE_SCALE {
        (best_bid_yes + best_ask_yes) / 2
    } else if avg_entry_yes_pts > 0 {
        avg_entry_yes_pts
    } else {
        PRICE_SCALE / 2
    };

    let abs_contracts_micros = net_contracts_micros.abs() as i128;
    let net_yes_pence = (abs_contracts_micros * PAYOUT_PENCE_PER_CONTRACT as i128)
        / CONTRACT_SCALE_MICROS as i128;

    if net_contracts_micros != 0 && buy_positions.is_empty() && sell_positions.is_empty() {
        // Fallback for legacy data drift: synthesize one lot from positions snapshot.
        let synthetic_price = if avg_entry_yes_pts > 0 {
            avg_entry_yes_pts
        } else {
            mark_yes_pts
        };
        let synthetic_notional = (synthetic_price as i128
            * abs_contracts_micros
            * PAYOUT_PENCE_PER_CONTRACT as i128)
            / (PRICE_SCALE as i128 * CONTRACT_SCALE_MICROS as i128);
        let synthetic = TradePosition {
            size_pence: synthetic_notional as i64,
            yes_price_pts: synthetic_price,
            fee_pence: 0,
            executed_at: Utc::now().to_rfc3339(),
            contracts_micros: if net_contracts_micros > 0 {
                abs_contracts_micros.to_string()
            } else {
                format!("-{}", abs_contracts_micros)
            },
        };

        if net_contracts_micros > 0 {
            buy_positions.push(synthetic);
        } else {
            sell_positions.push(synthetic);
        }
    }

    let is_open = net_contracts_micros != 0;
    let mut unrealized_pnl_pence: i128 = 0;
    if is_open && avg_entry_yes_pts > 0 && abs_contracts_micros > 0 {
        let pnl_per_contract_pence = if net_contracts_micros > 0 {
            ((mark_yes_pts - avg_entry_yes_pts) as i128 * PAYOUT_PENCE_PER_CONTRACT as i128)
                / PRICE_SCALE as i128
        } else {
            ((avg_entry_yes_pts - mark_yes_pts) as i128 * PAYOUT_PENCE_PER_CONTRACT as i128)
                / PRICE_SCALE as i128
        };

        unrealized_pnl_pence = (pnl_per_contract_pence * abs_contracts_micros)
            / CONTRACT_SCALE_MICROS as i128;
    }

    let can_cash_out = net_contracts_micros != 0 && (best_bid_yes > 0 || best_ask_yes < PRICE_SCALE);

    Ok(Json(PositionResponse {
        market_id,
        net_yes_pence: net_yes_pence as i64,
        net_contracts_micros: net_contracts_micros.to_string(),
        avg_entry_yes_pts,
        mark_yes_pts,
        unrealized_pnl_pence: (unrealized_pnl_pence as i64) - total_fees_pence,
        total_fees_pence,
        can_cash_out,
        buy_positions,
        sell_positions,
    }))
}

#[derive(Debug)]
pub enum AppError {
    BadRequest(String),
    InvalidPrice,
    Unauthorized(String),
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

impl From<tokio::sync::mpsc::error::SendError<EngineCommand>> for AppError {
    fn from(e: tokio::sync::mpsc::error::SendError<EngineCommand>) -> Self {
        AppError::Internal(e.to_string())
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> axum::response::Response {
        let (status, message) = match self {
            AppError::BadRequest(msg) => (StatusCode::BAD_REQUEST, msg),
            AppError::InvalidPrice => (StatusCode::BAD_REQUEST, "Invalid price".to_string()),
            AppError::Unauthorized(msg) => (StatusCode::UNAUTHORIZED, msg),
            AppError::Database(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
            AppError::Internal(msg) => (StatusCode::INTERNAL_SERVER_ERROR, msg),
        };

        (status, message).into_response()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::HeaderValue;

    #[test]
    fn require_user_id_rejects_missing_header() {
        let headers = HeaderMap::new();

        assert!(matches!(
            require_user_id(&headers),
            Err(AppError::Unauthorized(_))
        ));
    }

    #[test]
    fn require_user_id_rejects_invalid_uuid() {
        let mut headers = HeaderMap::new();
        headers.insert("X-User-Id", HeaderValue::from_static("not-a-uuid"));

        assert!(matches!(
            require_user_id(&headers),
            Err(AppError::Unauthorized(_))
        ));
    }

    #[test]
    fn require_user_id_accepts_valid_uuid() {
        let expected = Uuid::new_v4();
        let mut headers = HeaderMap::new();
        headers.insert(
            "X-User-Id",
            HeaderValue::from_str(&expected.to_string()).unwrap(),
        );

        assert_eq!(require_user_id(&headers).unwrap(), expected);
    }
}
