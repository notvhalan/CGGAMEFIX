use std::collections::HashMap;
use std::time::{Duration, Instant};
use sqlx::PgPool;
use tokio::sync::mpsc;
use uuid::Uuid;
use crate::orderbook::{OrderBook, BookOrder};
use crate::types::*;
use crate::wallet::WalletService;
use crate::websocket::WsBroadcaster;

/// Matching engine that owns orderbooks and processes commands deterministically
pub struct MatchingEngine {
    books: HashMap<Uuid, OrderBook>,
    command_rx: mpsc::UnboundedReceiver<EngineCommand>,
    fill_tx: mpsc::UnboundedSender<Vec<Fill>>,
    db: PgPool,
    wallet: WalletService,
    ws_broadcaster: WsBroadcaster,
    last_broadcast: HashMap<Uuid, Instant>,
}

impl MatchingEngine {
    pub fn new(
        command_rx: mpsc::UnboundedReceiver<EngineCommand>,
        fill_tx: mpsc::UnboundedSender<Vec<Fill>>,
        db: PgPool,
        wallet: WalletService,
        ws_broadcaster: WsBroadcaster,
    ) -> Self {
        Self {
            books: HashMap::new(),
            command_rx,
            fill_tx,
            db,
            wallet,
            ws_broadcaster,
            last_broadcast: HashMap::new(),
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

    /// Request orderbook broadcast with throttling (minimum 100ms between updates)
    fn request_orderbook_broadcast(&mut self, market_id: Uuid) {
        const MIN_INTERVAL: Duration = Duration::from_millis(100);
        
        let now = Instant::now();
        let should_broadcast = self.last_broadcast
            .get(&market_id)
            .map(|last| now.duration_since(*last) >= MIN_INTERVAL)
            .unwrap_or(true);
        
        if should_broadcast {
            self.last_broadcast.insert(market_id, now);
            let ws = self.ws_broadcaster.clone();
            tokio::spawn(async move {
                if let Err(e) = ws.broadcast_orderbook_update(market_id).await {
                    tracing::error!("Failed to broadcast orderbook update: {}", e);
                }
            });
        }
    }

    /// Run the matching engine (single-threaded per market for determinism)
    pub async fn run(mut self) {
        // Load existing orders first
        if let Err(e) = self.load_existing_orders().await {
            tracing::error!("Failed to load existing orders: {}", e);
        }
        
        while let Some(cmd) = self.command_rx.recv().await {
            if let Err(e) = self.process_command(cmd).await {
                tracing::error!("Failed to process engine command: {}", e);
            }
        }
    }

    async fn process_command(&mut self, cmd: EngineCommand) -> anyhow::Result<()> {
        match cmd {
            EngineCommand::Submit(submit) => self.process_submit(submit).await,
            EngineCommand::Cancel(cancel) => self.handle_cancel(cancel).await,
        }
    }

    async fn process_submit(&mut self, cmd: MatchCommand) -> anyhow::Result<()> {
        tracing::info!("Processing order: order_id={}, market_id={}, side={:?}, limit_yes_pts={}, qty_micros={}", 
            cmd.order_id, cmd.market_id, cmd.side, cmd.limit_yes_pts, cmd.qty_micros);
        
        let market_id = cmd.market_id;
        let book = self.books
            .entry(market_id)
            .or_insert_with(|| OrderBook::new(market_id));

        tracing::info!("Book state before match: bids={}, asks={}", book.bids_count(), book.asks_count());
        
        let (fills, remaining) = book.match_order(
            cmd.order_id,
            cmd.user_id,
            cmd.side,
            cmd.limit_yes_pts,
            cmd.qty_micros,
            cmd.ioc_budget_pence,
        );

        // Track if orderbook changed
        let mut orderbook_changed = false;

        // Send fills to clearing
        if !fills.is_empty() {
            tracing::info!("Order matched! Generated {} fills", fills.len());
            let _ = self.fill_tx.send(fills);
            orderbook_changed = true;
        } else {
            tracing::info!("No matches found for order");
        }

        // Add remaining to book (if GTC and above minimum size)
        // Dust (< 0.001 contracts) is treated as trading fee, not added to book
        const MIN_CONTRACT_MICROS: i64 = 1_000;
        if remaining >= MIN_CONTRACT_MICROS && cmd.time_in_force == TimeInForce::Gtc {
            tracing::info!("Adding remaining qty {} to book at price {}", remaining, cmd.limit_yes_pts);
            book.add_order(
                crate::orderbook::BookOrder {
                    order_id: cmd.order_id,
                    user_id: cmd.user_id,
                    qty_remaining_micros: remaining,
                    created_at: chrono::Utc::now().timestamp_millis(),
                },
                cmd.side,
                cmd.limit_yes_pts,
            );
            tracing::info!("Book state after add: bids={}, asks={}", book.bids_count(), book.asks_count());
            orderbook_changed = true;
        } else if remaining > 0 && remaining < MIN_CONTRACT_MICROS {
            tracing::info!("Dust remaining {} micros treated as trading fee", remaining);
        }

        // IOC orders must never rest on book; if nothing filled they should become terminal immediately.
        if cmd.time_in_force == TimeInForce::Ioc && remaining == cmd.qty_micros {
            self.finalize_unfilled_ioc(cmd.order_id).await?;
        }

        // Broadcast orderbook update if it changed (throttled)
        if orderbook_changed {
            self.request_orderbook_broadcast(market_id);
        }

        Ok(())
    }

    async fn finalize_unfilled_ioc(&mut self, order_id: Uuid) -> anyhow::Result<()> {
        let order = sqlx::query!(
            r#"
            SELECT
                user_id,
                market_id,
                qty_remaining_micros,
                qty_original_micros,
                COALESCE(liability_pence, 0)::bigint as "liability_pence!",
                COALESCE(status::text, 'OPEN') as "status!"
            FROM orders
            WHERE id = $1
            "#,
            order_id
        )
        .fetch_optional(&self.db)
        .await?;

        let Some(order) = order else {
            tracing::warn!("IOC cleanup skipped: order not found ({})", order_id);
            return Ok(());
        };

        if (order.status != "OPEN" && order.status != "PARTIALLY_MATCHED")
            || order.qty_remaining_micros <= 0
        {
            return Ok(());
        }

        let mut tx = self.db.begin().await?;
        let update_result = sqlx::query!(
            r#"
            UPDATE orders
            SET status = 'CANCELLED',
                qty_remaining_micros = 0,
                updated_at = NOW()
            WHERE id = $1
              AND status IN ('OPEN', 'PARTIALLY_MATCHED')
              AND qty_remaining_micros > 0
            "#,
            order_id
        )
        .execute(&mut *tx)
        .await?;

        if update_result.rows_affected() == 0 {
            tx.rollback().await?;
            return Ok(());
        }

        let release_pence = if order.liability_pence > 0 && order.qty_original_micros > 0 {
            ((order.liability_pence as i128 * order.qty_remaining_micros as i128)
                / order.qty_original_micros as i128) as i64
        } else {
            0
        };

        if release_pence > 0 {
            self.wallet
                .release_order_lock(&mut tx, order.user_id, release_pence)
                .await?;
        }

        tx.commit().await?;
        tracing::info!(
            "IOC order {} cancelled unfilled and {}p released",
            order_id,
            release_pence
        );
        Ok(())
    }

    async fn handle_cancel(&mut self, cmd: CancelCommand) -> anyhow::Result<()> {
        tracing::info!(
            "Processing cancel: order_id={}, user_id={}",
            cmd.order_id,
            cmd.user_id
        );

        let order = sqlx::query!(
            r#"
            SELECT
                user_id,
                market_id,
                side as "side: Side",
                limit_price_yes_pts,
                qty_remaining_micros,
                qty_original_micros,
                COALESCE(liability_pence, 0)::bigint as "liability_pence!",
                COALESCE(status::text, 'OPEN') as "status!"
            FROM orders
            WHERE id = $1
            "#,
            cmd.order_id
        )
        .fetch_optional(&self.db)
        .await?;

        let Some(order) = order else {
            tracing::warn!("Cancel ignored: order not found ({})", cmd.order_id);
            return Ok(());
        };

        if order.user_id != cmd.user_id {
            tracing::warn!(
                "Cancel rejected: user mismatch for order {} (requested={}, actual={})",
                cmd.order_id,
                cmd.user_id,
                order.user_id
            );
            return Ok(());
        }

        let mut should_broadcast = false;
        if let Some(book) = self.books.get_mut(&order.market_id) {
            if book
                .cancel_order(cmd.order_id, order.side, order.limit_price_yes_pts)
                .is_some()
            {
                should_broadcast = true;
                tracing::info!("Removed order {} from in-memory book", cmd.order_id);
            }
        }

        if order.status != "OPEN" && order.status != "PARTIALLY_MATCHED" {
            tracing::info!(
                "Cancel skipped for order {} because status is {}",
                cmd.order_id,
                order.status
            );
            if should_broadcast {
                self.request_orderbook_broadcast(order.market_id);
            }
            return Ok(());
        }

        let mut tx = self.db.begin().await?;

        let update_result = sqlx::query!(
            r#"
            UPDATE orders
            SET status = 'CANCELLED',
                qty_remaining_micros = 0,
                updated_at = NOW()
            WHERE id = $1
              AND status IN ('OPEN', 'PARTIALLY_MATCHED')
            "#,
            cmd.order_id
        )
        .execute(&mut *tx)
        .await?;

        if update_result.rows_affected() == 0 {
            tx.rollback().await?;
            tracing::info!(
                "Cancel became no-op for order {} (already terminal in DB)",
                cmd.order_id
            );
            if should_broadcast {
                self.request_orderbook_broadcast(order.market_id);
            }
            return Ok(());
        }

        let release_pence = if order.liability_pence > 0 && order.qty_original_micros > 0 {
            ((order.liability_pence as i128 * order.qty_remaining_micros as i128)
                / order.qty_original_micros as i128) as i64
        } else {
            0
        };

        if release_pence > 0 {
            self.wallet
                .release_order_lock(&mut tx, order.user_id, release_pence)
                .await?;
        }

        tx.commit().await?;
        tracing::info!(
            "Order {} cancelled and {}p released",
            cmd.order_id,
            release_pence
        );

        self.request_orderbook_broadcast(order.market_id);
        Ok(())
    }
}
