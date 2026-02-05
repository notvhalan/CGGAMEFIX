use std::collections::HashMap;
use tokio::sync::mpsc;
use uuid::Uuid;
use sqlx::PgPool;
use crate::types::*;
use crate::orderbook::{OrderBook, BookOrder};

/// Matching engine that owns orderbooks and processes commands deterministically
pub struct MatchingEngine {
    books: HashMap<Uuid, OrderBook>,
    command_rx: mpsc::UnboundedReceiver<MatchCommand>,
    fill_tx: mpsc::UnboundedSender<Vec<Fill>>,
    db: PgPool,
}

impl MatchingEngine {
    pub fn new(
        command_rx: mpsc::UnboundedReceiver<MatchCommand>,
        fill_tx: mpsc::UnboundedSender<Vec<Fill>>,
        db: PgPool,
    ) -> Self {
        Self {
            books: HashMap::new(),
            command_rx,
            fill_tx,
            db,
        }
    }

    /// Load existing open orders from database into orderbooks
    async fn load_existing_orders(&mut self) -> anyhow::Result<()> {
        tracing::info!("Loading existing open orders from database...");
        
        // Minimum contract size threshold (0.001 contracts = 1000 micros)
        const MIN_CONTRACT_MICROS: i64 = 1000;
        
        let orders = sqlx::query!(
            r#"
            SELECT id, user_id, market_id, side as "side: Side", 
                   limit_price_yes_pts, qty_remaining_micros, created_at
            FROM orders
            WHERE status IN ('OPEN', 'PARTIALLY_MATCHED')
              AND qty_remaining_micros >= 1000
            ORDER BY created_at ASC
            "#
        )
        .fetch_all(&self.db)
        .await?;

        tracing::info!("Found {} existing open orders (filtered out dust)", orders.len());

        let mut dust_count = 0;
        for order in orders {
            // Double-check to prevent dust orders from being added
            if order.qty_remaining_micros < MIN_CONTRACT_MICROS {
                dust_count += 1;
                tracing::debug!(
                    "Skipping dust order: id={}, qty={}",
                    order.id, order.qty_remaining_micros
                );
                continue;
            }
            
            let book = self.books
                .entry(order.market_id)
                .or_insert_with(|| OrderBook::new(order.market_id));

            book.add_order(
                BookOrder {
                    order_id: order.id,
                    user_id: order.user_id,
                    qty_remaining_micros: order.qty_remaining_micros,
                    created_at: order.created_at.map(|dt| dt.timestamp_millis()).unwrap_or_else(|| chrono::Utc::now().timestamp_millis()),
                },
                order.side,
                order.limit_price_yes_pts,
            );

            tracing::debug!(
                "Loaded order: id={}, market={}, side={:?}, price={}, qty={}",
                order.id, order.market_id, order.side, order.limit_price_yes_pts, order.qty_remaining_micros
            );
        }

        if dust_count > 0 {
            tracing::info!("Skipped {} dust orders during load", dust_count);
        }

        for (market_id, book) in &self.books {
            tracing::info!(
                "Market {}: loaded {} bids, {} asks",
                market_id, book.bids_count(), book.asks_count()
            );
        }

        Ok(())
    }

    /// Run the matching engine (single-threaded per market for determinism)
    pub async fn run(mut self) {
        // Load existing orders first
        if let Err(e) = self.load_existing_orders().await {
            tracing::error!("Failed to load existing orders: {}", e);
        }
        
        while let Some(cmd) = self.command_rx.recv().await {
            self.process_command(cmd);
        }
    }

    fn process_command(&mut self, cmd: MatchCommand) {
        tracing::info!("Processing order: order_id={}, market_id={}, side={:?}, limit_yes_pts={}, qty_micros={}", 
            cmd.order_id, cmd.market_id, cmd.side, cmd.limit_yes_pts, cmd.qty_micros);
        
        let book = self.books
            .entry(cmd.market_id)
            .or_insert_with(|| OrderBook::new(cmd.market_id));

        tracing::info!("Book state before match: bids={}, asks={}", book.bids_count(), book.asks_count());
        
        let (fills, remaining) = book.match_order(
            cmd.order_id,
            Uuid::nil(), // Will be filled by DB lookup in clearing
            cmd.side,
            cmd.limit_yes_pts,
            cmd.qty_micros,
        );

        // Send fills to clearing
        if !fills.is_empty() {
            tracing::info!("Order matched! Generated {} fills", fills.len());
            let _ = self.fill_tx.send(fills);
        } else {
            tracing::info!("No matches found for order");
        }

        // Add remaining to book (if GTC and above minimum size)
        // Dust (< 1 contract) is treated as trading fee, not added to book
        const MIN_CONTRACT_MICROS: i64 = 1_000_000;
        if remaining >= MIN_CONTRACT_MICROS && cmd.time_in_force == TimeInForce::Gtc {
            tracing::info!("Adding remaining qty {} to book at price {}", remaining, cmd.limit_yes_pts);
            book.add_order(
                crate::orderbook::BookOrder {
                    order_id: cmd.order_id,
                    user_id: Uuid::nil(), // Will be looked up
                    qty_remaining_micros: remaining,
                    created_at: chrono::Utc::now().timestamp_millis(),
                },
                cmd.side,
                cmd.limit_yes_pts,
            );
            tracing::info!("Book state after add: bids={}, asks={}", book.bids_count(), book.asks_count());
        } else if remaining > 0 && remaining < MIN_CONTRACT_MICROS {
            tracing::info!("Dust remaining {} micros treated as trading fee", remaining);
        }
    }
}
