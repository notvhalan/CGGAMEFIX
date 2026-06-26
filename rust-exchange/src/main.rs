mod types;
mod wallet;
mod orderbook;
mod engine;
mod api;
mod clearing;
mod websocket;

use axum::{
    routing::{delete, get},
    Router,
};
use sqlx::{postgres::PgPoolOptions, PgPool};
use tokio::sync::mpsc;
use std::sync::Arc;
use std::time::Duration;
use tracing_subscriber::EnvFilter;
use crate::types::*;
use crate::wallet::WalletService;
use crate::engine::MatchingEngine;
use crate::clearing::ClearingService;
use crate::websocket::WsBroadcaster;

#[derive(Clone)]
pub struct AppState {
    db: PgPool,
    wallet: Arc<WalletService>,
    match_tx: mpsc::UnboundedSender<EngineCommand>,
    ws_broadcaster: WsBroadcaster,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Initialize tracing. Set RUST_LOG=info, debug, or trace when diagnosing locally.
    let env_filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("warn,betting_exchange=warn"));

    tracing_subscriber::fmt()
        .with_env_filter(env_filter)
        .init();

    // Load config
    dotenvy::dotenv().ok();
    let database_url = std::env::var("DATABASE_URL")
        .expect("DATABASE_URL must be set");

    // Connect to database
    let max_connections = std::env::var("RUST_EXCHANGE_DB_MAX_CONNECTIONS")
        .ok()
        .and_then(|value| value.parse::<u32>().ok())
        .unwrap_or(50);
    let pool = PgPoolOptions::new()
        .max_connections(max_connections)
        .acquire_timeout(Duration::from_secs(3))
        .connect(&database_url)
        .await?;
    ensure_hot_path_indexes(&pool).await?;
    tracing::info!("Connected to database");

    // Create channels
    let (match_tx, match_rx) = mpsc::unbounded_channel::<EngineCommand>();
    let (fill_tx, fill_rx) = mpsc::unbounded_channel::<FillBatch>();

    // Create services
    let wallet = Arc::new(WalletService::new(pool.clone()));
    let ws_broadcaster = WsBroadcaster::new(pool.clone());
    
    // Spawn matching engine task
    let engine = MatchingEngine::new(
        match_rx,
        fill_tx,
        pool.clone(),
        (*wallet).clone(),
        ws_broadcaster.clone(),
    );
    tokio::spawn(async move {
        tracing::info!("Matching engine started");
        engine.run().await;
    });

    // Spawn clearing service task
    let clearing = ClearingService::new(pool.clone(), (*wallet).clone(), fill_rx, ws_broadcaster.clone());
    tokio::spawn(async move {
        tracing::info!("Clearing service started");
        clearing.run().await;
    });

    // Create app state
    let state = AppState {
        db: pool,
        wallet,
        match_tx,
        ws_broadcaster: ws_broadcaster.clone(),
    };

    // Build router
    let app = Router::new()
        .route("/api/markets/:market_id/quote", get(api::get_quote))
        .route("/api/orders", get(api::get_orders).post(api::create_order))
        .route("/api/orders/:order_id", delete(api::cancel_order))
        .route("/api/positions/me", get(api::get_positions))
        .route("/api/positions/markets/:market_id/me", get(api::get_position_for_market))
        .route("/ws", get(websocket::ws_handler))
        .with_state(state);

    // Start server
    let listener = tokio::net::TcpListener::bind("0.0.0.0:3001")
        .await?;
    
    tracing::info!("Server listening on http://0.0.0.0:3001");
    tracing::info!("WebSocket endpoint: ws://localhost:3001/ws");
    
    axum::serve(listener, app).await?;

    Ok(())
}

async fn ensure_hot_path_indexes(pool: &PgPool) -> anyhow::Result<()> {
    sqlx::query(
        r#"
        CREATE INDEX IF NOT EXISTS idx_orders_open_bid_market_price
        ON orders (market_id, limit_price_yes_pts DESC)
        WHERE status IN ('OPEN', 'PARTIALLY_MATCHED') AND side = 'BUY_YES'::order_side_new
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        CREATE INDEX IF NOT EXISTS idx_orders_open_ask_market_price
        ON orders (market_id, limit_price_yes_pts ASC)
        WHERE status IN ('OPEN', 'PARTIALLY_MATCHED') AND side = 'SELL_YES'::order_side_new
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        CREATE INDEX IF NOT EXISTS idx_positions_user_updated_nonzero
        ON positions (user_id, updated_at DESC)
        WHERE COALESCE(net_qty_micros, 0) <> 0
        "#,
    )
    .execute(pool)
    .await?;

    Ok(())
}
