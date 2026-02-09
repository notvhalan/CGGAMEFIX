use axum::{
    extract::{ws::{Message, WebSocket, WebSocketUpgrade}, State},
    response::IntoResponse,
};
use futures::{sink::SinkExt, stream::StreamExt};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{mpsc, RwLock};
use uuid::Uuid;
use crate::types::*;

/// WebSocket message types
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum WsMessage {
    Subscribe { market_id: Uuid },
    Unsubscribe { market_id: Uuid },
    Ping,
    Pong,
    OrderbookSnapshot { market_id: Uuid, bids: Vec<Level>, asks: Vec<Level> },
    OrderbookDelta { market_id: Uuid, side: Side, price_yes_pts: i64, size_delta_micros: i64 },
    Trade { 
        trade_id: Uuid,
        market_id: Uuid,
        maker_order_id: Uuid,
        taker_order_id: Uuid,
        maker_user_id: Uuid,
        taker_user_id: Uuid,
        price_yes_pts: i64,
        qty_micros: i64,
        notional_pence: i64,
        taker_side: Side,
        maker_fee_pence: i32,
        taker_fee_pence: i32,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Level {
    pub price_yes_pts: i64,
    pub qty_micros: i64,
}

/// Client subscription info
#[derive(Debug)]
struct Client {
    sender: mpsc::UnboundedSender<Message>,
    subscriptions: Vec<Uuid>, // Market IDs
}

/// WebSocket broadcast hub
#[derive(Clone)]
pub struct WsBroadcaster {
    clients: Arc<RwLock<HashMap<Uuid, Client>>>,
    db: sqlx::PgPool,
}

impl WsBroadcaster {
    pub fn new(db: sqlx::PgPool) -> Self {
        Self {
            clients: Arc::new(RwLock::new(HashMap::new())),
            db,
        }
    }

    /// Register a new client
    async fn register(&self, client_id: Uuid, sender: mpsc::UnboundedSender<Message>) {
        let client = Client {
            sender,
            subscriptions: Vec::new(),
        };
        self.clients.write().await.insert(client_id, client);
        tracing::info!("WebSocket client registered: {}", client_id);
    }

    /// Unregister a client
    async fn unregister(&self, client_id: &Uuid) {
        self.clients.write().await.remove(client_id);
        tracing::info!("WebSocket client unregistered: {}", client_id);
    }

    /// Subscribe client to a market
    async fn subscribe(&self, client_id: &Uuid, market_id: Uuid) {
        let should_send_snapshot = {
            let mut clients = self.clients.write().await;
            if let Some(client) = clients.get_mut(client_id) {
                if !client.subscriptions.contains(&market_id) {
                    client.subscriptions.push(market_id);
                    tracing::info!("Client {} subscribed to market {}", client_id, market_id);
                    true
                } else {
                    false
                }
            } else {
                false
            }
        }; // Write lock dropped here
        
        // Send snapshot after releasing the lock
        if should_send_snapshot {
            if let Err(e) = self.send_orderbook_snapshot_to_client(client_id, market_id).await {
                tracing::error!("Failed to send orderbook snapshot: {}", e);
            }
        }
    }
    
    /// Send orderbook snapshot to a specific client
    async fn send_orderbook_snapshot_to_client(&self, client_id: &Uuid, market_id: Uuid) -> Result<(), Box<dyn std::error::Error>> {
        tracing::debug!("Querying orderbook for market_id: {}", market_id);
        
        // Debug: Check what orders exist
        let all_orders: Vec<(Uuid, String, String)> = sqlx::query_as(
            "SELECT id, side::text, status FROM orders WHERE market_id = $1 LIMIT 10"
        )
        .bind(market_id)
        .fetch_all(&self.db)
        .await?;
        tracing::debug!("Found {} orders for market {}: {:?}", all_orders.len(), market_id, all_orders);
        
        // Query database for open orders
        let bids_raw: Vec<(i64, i64)> = sqlx::query_as(
            "SELECT limit_price_yes_pts, SUM(qty_remaining_micros)::bigint as total_qty 
             FROM orders 
             WHERE market_id = $1 
               AND side::text = 'BUY_YES' 
               AND status IN ('OPEN', 'PARTIALLY_MATCHED')
             GROUP BY limit_price_yes_pts 
             ORDER BY limit_price_yes_pts DESC 
             LIMIT 50"
        )
        .bind(market_id)
        .fetch_all(&self.db)
        .await?;
        
        tracing::debug!("Bids query returned {} rows", bids_raw.len());
        
        let asks_raw: Vec<(i64, i64)> = sqlx::query_as(
            "SELECT limit_price_yes_pts, SUM(qty_remaining_micros)::bigint as total_qty 
             FROM orders 
             WHERE market_id = $1 
               AND side::text = 'SELL_YES' 
               AND status IN ('OPEN', 'PARTIALLY_MATCHED')
             GROUP BY limit_price_yes_pts 
             ORDER BY limit_price_yes_pts ASC 
             LIMIT 50"
        )
        .bind(market_id)
        .fetch_all(&self.db)
        .await?;
        
        tracing::debug!("Asks query returned {} rows", asks_raw.len());
        
        let bids: Vec<Level> = bids_raw.into_iter()
            .map(|(price, qty)| Level { price_yes_pts: price, qty_micros: qty })
            .collect();
            
        let asks: Vec<Level> = asks_raw.into_iter()
            .map(|(price, qty)| Level { price_yes_pts: price, qty_micros: qty })
            .collect();
        
        let snapshot = WsMessage::OrderbookSnapshot {
            market_id,
            bids: bids.clone(),
            asks: asks.clone(),
        };
        
        tracing::info!("Sending orderbook snapshot to client {}: {} bids, {} asks", client_id, bids.len(), asks.len());
        
        let json = serde_json::to_string(&snapshot)?;
        tracing::debug!("Snapshot JSON: {}", json);
        
        // Send to specific client
        let clients = self.clients.read().await;
        if let Some(client) = clients.get(client_id) {
            tracing::debug!("Found client {}, attempting to send {} bytes", client_id, json.len());
            if let Err(e) = client.sender.send(Message::Text(json)) {
                tracing::error!("Failed to send message to client {}: {}", client_id, e);
                return Err(Box::new(e));
            }
            tracing::info!("Successfully sent orderbook snapshot to client {}", client_id);
        } else {
            tracing::warn!("Client {} not found when trying to send snapshot", client_id);
        }
        
        Ok(())
    }

    /// Unsubscribe client from a market
    async fn unsubscribe(&self, client_id: &Uuid, market_id: &Uuid) {
        if let Some(client) = self.clients.write().await.get_mut(client_id) {
            client.subscriptions.retain(|id| id != market_id);
            tracing::info!("Client {} unsubscribed from market {}", client_id, market_id);
        }
    }

    /// Broadcast message to all clients subscribed to a market
    pub async fn broadcast_to_market(&self, market_id: Uuid, message: WsMessage) {
        let json = match serde_json::to_string(&message) {
            Ok(j) => j,
            Err(e) => {
                tracing::error!("Failed to serialize WS message: {}", e);
                return;
            }
        };

        let clients = self.clients.read().await;
        let mut failed_clients = Vec::new();

        for (client_id, client) in clients.iter() {
            if client.subscriptions.contains(&market_id) {
                if let Err(_) = client.sender.send(Message::Text(json.clone())) {
                    failed_clients.push(*client_id);
                }
            }
        }

        // Clean up failed clients
        drop(clients);
        if !failed_clients.is_empty() {
            let mut clients_write = self.clients.write().await;
            for client_id in failed_clients {
                clients_write.remove(&client_id);
                tracing::warn!("Removed disconnected client: {}", client_id);
            }
        }
    }

    /// Send orderbook snapshot to all clients subscribed to a market
    /// Used after order fills to update all clients with new orderbook state
    pub async fn send_orderbook_snapshot(&self, market_id: Uuid) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        // Query orderbook from database
        let bids = sqlx::query!(
            r#"
            SELECT
                limit_price_yes_pts,
                SUM(qty_remaining_micros)::bigint as "total_qty!"
            FROM orders
            WHERE market_id = $1
                AND side::text = 'BUY_YES'
                AND status IN ('OPEN', 'PARTIALLY_MATCHED')
            GROUP BY limit_price_yes_pts
            ORDER BY limit_price_yes_pts DESC
            LIMIT 50
            "#,
            market_id
        )
        .fetch_all(&self.db)
        .await?;

        let asks = sqlx::query!(
            r#"
            SELECT
                limit_price_yes_pts,
                SUM(qty_remaining_micros)::bigint as "total_qty!"
            FROM orders
            WHERE market_id = $1
                AND side::text = 'SELL_YES'
                AND status IN ('OPEN', 'PARTIALLY_MATCHED')
            GROUP BY limit_price_yes_pts
            ORDER BY limit_price_yes_pts ASC
            LIMIT 50
            "#,
            market_id
        )
        .fetch_all(&self.db)
        .await?;

        let bid_levels: Vec<Level> = bids
            .into_iter()
            .map(|r| Level {
                price_yes_pts: r.limit_price_yes_pts,
                qty_micros: r.total_qty,
            })
            .collect();

        let ask_levels: Vec<Level> = asks
            .into_iter()
            .map(|r| Level {
                price_yes_pts: r.limit_price_yes_pts,
                qty_micros: r.total_qty,
            })
            .collect();

        // Create snapshot message
        let snapshot = WsMessage::OrderbookSnapshot {
            market_id,
            bids: bid_levels,
            asks: ask_levels,
        };

        // Broadcast to all subscribed clients
        self.broadcast_to_market(market_id, snapshot).await;

        Ok(())
    }

    /// Broadcast orderbook update to all subscribed clients
    /// This is a convenience wrapper for send_orderbook_snapshot
    pub async fn broadcast_orderbook_update(&self, market_id: Uuid) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        self.send_orderbook_snapshot(market_id).await
    }
}

/// WebSocket upgrade handler
pub async fn ws_handler(
    ws: WebSocketUpgrade,
    State(app): State<crate::AppState>,
) -> impl IntoResponse {
    ws.on_upgrade(|socket| handle_socket(socket, app.ws_broadcaster))
}

/// Handle individual WebSocket connection
async fn handle_socket(socket: WebSocket, broadcaster: WsBroadcaster) {
    let client_id = Uuid::new_v4();
    let (mut sender, mut receiver) = socket.split();
    let (tx, mut rx) = mpsc::unbounded_channel::<Message>();

    // Register client
    broadcaster.register(client_id, tx).await;

    // Spawn task to forward messages from channel to WebSocket
    let mut send_task = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if sender.send(msg).await.is_err() {
                break;
            }
        }
    });

    // Spawn task to handle incoming messages from WebSocket
    let broadcaster_clone = broadcaster.clone();
    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = receiver.next().await {
            match msg {
                Message::Text(text) => {
                    tracing::info!("Received WebSocket text message: {}", text);
                    if let Ok(ws_msg) = serde_json::from_str::<WsMessage>(&text) {
                        tracing::info!("Parsed WebSocket message: {:?}", ws_msg);
                        match ws_msg {
                            WsMessage::Subscribe { market_id } => {
                                broadcaster_clone.subscribe(&client_id, market_id).await;
                            }
                            WsMessage::Unsubscribe { market_id } => {
                                broadcaster_clone.unsubscribe(&client_id, &market_id).await;
                            }
                            WsMessage::Ping => {
                                // Send pong response
                                let pong = WsMessage::Pong;
                                if let Ok(json) = serde_json::to_string(&pong) {
                                    if let Some(client) = broadcaster_clone.clients.read().await.get(&client_id) {
                                        let _ = client.sender.send(Message::Text(json));
                                    }
                                }
                            }
                            _ => {}
                        }
                    } else {
                        tracing::warn!("Failed to parse WebSocket message: {}", text);
                    }
                }
                Message::Ping(_) => {
                    // Axum handles pong automatically
                }
                Message::Close(_) => {
                    break;
                }
                _ => {}
            }
        }
    });

    // Wait for either task to finish
    tokio::select! {
        _ = &mut send_task => {
            recv_task.abort();
        }
        _ = &mut recv_task => {
            send_task.abort();
        }
    }

    // Unregister client
    broadcaster.unregister(&client_id).await;
}
