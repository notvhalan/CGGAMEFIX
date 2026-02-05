mod types;
mod wallet;
mod orderbook;
mod engine;
mod api;
mod clearing;
mod websocket;

use axum::{
    routing::{get, post},
    Router,
};
use sqlx::PgPool;
use tokio::sync::mpsc;
use std::sync::Arc;
use crate::types::*;
use crate::wallet::WalletService;
use crate::engine::MatchingEngine;
use crate::clearing::ClearingService;
use crate::websocket::WsBroadcaster;

#[derive(Clone)]
pub struct AppState {
    db: PgPool,
    wallet: Arc<WalletService>,
    match_tx: mpsc::UnboundedSender<MatchCommand>,
    ws_broadcaster: WsBroadcaster,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Initialize tracing
    tracing_subscriber::fmt()
        .with_env_filter("info,betting_exchange=debug")
        .init();

    // Load config
    dotenvy::dotenv().ok();
    let database_url = std::env::var("DATABASE_URL")
        .expect("DATABASE_URL must be set");

    // Connect to database
    let pool = PgPool::connect(&database_url).await?;
    tracing::info!("Connected to database");

    // Create channels
    let (match_tx, match_rx) = mpsc::unbounded_channel::<MatchCommand>();
    let (fill_tx, fill_rx) = mpsc::unbounded_channel::<Vec<Fill>>();

    // Create services
    let wallet = Arc::new(WalletService::new(pool.clone()));
    let ws_broadcaster = WsBroadcaster::new(pool.clone());
    
    // Spawn matching engine task
    let engine = MatchingEngine::new(match_rx, fill_tx, pool.clone());
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
        .route("/api/orders", post(api::create_order))
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
