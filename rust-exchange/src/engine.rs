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
    fill_tx: mpsc::UnboundedSender<FillBatch>,
    db: PgPool,
    wallet: WalletService,
    ws_broadcaster: WsBroadcaster,
    last_broadcast: HashMap<Uuid, Instant>,
}

impl MatchingEngine {
    pub fn new(
        command_rx: mpsc::UnboundedReceiver<EngineCommand>,
        fill_tx: mpsc::UnboundedSender<FillBatch>,
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

        // ── Uncross books: match any resting orders that should have been matched ──
        let market_ids: Vec<Uuid> = self.books.keys().copied().collect();
        for market_id in market_ids {
            self.uncross_book(market_id).await?;
        }

        Ok(())
    }

    /// Uncross a book by matching resting orders that cross (best_bid >= best_ask)
    /// This handles orders that survived an engine restart or a self-trade skip
    async fn uncross_book(&mut self, market_id: Uuid) -> anyhow::Result<()> {
        let book = match self.books.get_mut(&market_id) {
            Some(b) => b,
            None => return Ok(()),
        };

        let mut total_uncross_fills: Vec<Fill> = Vec::new();
        let mut expired_orders: Vec<Uuid> = Vec::new();
        let mut cancel_after_settlement: Vec<Uuid> = Vec::new();

        // Keep matching while the book is crossed
        loop {
            let (best_bid, best_ask) = match book.check_crossed() {
                Some(pair) => pair,
                None => break, // Book is healthy
            };

            tracing::debug!(
                "Market {} is crossed: best_bid={} >= best_ask={}. Running uncross.",
                market_id, best_bid, best_ask
            );

            // Take the best bid as synthetic taker against the ask side
            let bid_queue = match book.bids.get(&best_bid) {
                Some(q) => q,
                None => break,
            };
            let taker = bid_queue.front().unwrap().clone();

            // Remove taker from bids before matching
            book.cancel_order(taker.order_id, Side::BuyYes, best_bid);

            let (fills, remaining, skipped) = book.match_order(
                taker.order_id,
                taker.user_id,
                Side::BuyYes,
                best_bid,
                taker.qty_remaining_micros,
                None,
            );

            // Re-rest any unfilled portion
            if remaining > 0 && skipped.is_empty() {
                book.add_order(
                    crate::orderbook::BookOrder {
                        order_id: taker.order_id,
                        user_id: taker.user_id,
                        qty_remaining_micros: remaining,
                        created_at: taker.created_at,
                    },
                    Side::BuyYes,
                    best_bid,
                );
            } else if remaining > 0 {
                tracing::debug!(
                    "Uncross expired {} micros for order {} because it was blocked by self-trade prevention",
                    remaining,
                    taker.order_id
                );
                if fills.is_empty() {
                    expired_orders.push(taker.order_id);
                } else {
                    cancel_after_settlement.push(taker.order_id);
                }
            }

            if fills.is_empty() {
                if remaining > 0 && !skipped.is_empty() {
                    continue;
                }
                break; // No more matches possible (empty book or budget exhausted)
            }

            total_uncross_fills.extend(fills);
        }

        if !total_uncross_fills.is_empty() {
            tracing::info!(
                "Market {} uncrossed: generated {} fills",
                market_id, total_uncross_fills.len()
            );
            let _ = self.fill_tx.send(FillBatch {
                fills: total_uncross_fills,
                cancel_after_settlement,
            });
            self.request_orderbook_broadcast(market_id);
        } else {
            expired_orders.extend(cancel_after_settlement);
        }

        for order_id in expired_orders {
            self.cancel_unbooked_order(order_id).await?;
        }

        Ok(())
    }

    async fn cancel_unbooked_order(&self, order_id: Uuid) -> anyhow::Result<()> {
        let order = sqlx::query!(
            r#"
            SELECT
                user_id,
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
            return Ok(());
        };

        if (order.status != "OPEN" && order.status != "PARTIALLY_MATCHED")
            || order.qty_remaining_micros <= 0
        {
            return Ok(());
        }

        let mut tx = self.db.begin().await?;
        let updated = sqlx::query!(
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

        if updated.rows_affected() == 0 {
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
        tracing::debug!(
            "Cancelled unbooked self-trade-blocked order {} and released {}p",
            order_id,
            release_pence
        );
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
            let Some(book) = self.books.get(&market_id) else {
                return;
            };
            let bids = book.levels(Side::BuyYes, 50);
            let asks = book.levels(Side::SellYes, 50);
            let ws = self.ws_broadcaster.clone();
            tokio::spawn(async move {
                if let Err(e) = ws.broadcast_orderbook_levels(market_id, bids, asks).await {
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
        tracing::debug!("Processing order: order_id={}, market_id={}, side={:?}, limit_yes_pts={}, qty_micros={}", 
            cmd.order_id, cmd.market_id, cmd.side, cmd.limit_yes_pts, cmd.qty_micros);
        
        let market_id = cmd.market_id;

        // Scoped block for book borrow — must end before we call self methods
        let (fills, remaining, self_trade_skipped) = {
            let book = self.books
                .entry(market_id)
                .or_insert_with(|| OrderBook::new(market_id));

            tracing::trace!("Book state before match: bids={}, asks={}", book.bids_count(), book.asks_count());
            
            let (fills, remaining, self_trade_skipped) = book.match_order(
                cmd.order_id,
                cmd.user_id,
                cmd.side,
                cmd.limit_yes_pts,
                cmd.qty_micros,
                cmd.ioc_budget_pence,
            );

            // Add remaining to book (if GTC and above minimum size)
            // Dust (< 0.001 contracts) is treated as trading fee, not added to book
            const MIN_CONTRACT_MICROS: i64 = 1_000;
            if remaining >= MIN_CONTRACT_MICROS
                && cmd.time_in_force == TimeInForce::Gtc
                && self_trade_skipped.is_empty()
            {
                tracing::debug!("Adding remaining qty {} to book at price {}", remaining, cmd.limit_yes_pts);
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
                tracing::trace!("Book state after add: bids={}, asks={}", book.bids_count(), book.asks_count());
            } else if remaining >= MIN_CONTRACT_MICROS
                && cmd.time_in_force == TimeInForce::Gtc
                && !self_trade_skipped.is_empty()
            {
                tracing::debug!(
                    "Self-trade prevention expired {} micros instead of resting crossed remainder for order {}",
                    remaining,
                    cmd.order_id
                );
            } else if remaining > 0 && remaining < MIN_CONTRACT_MICROS {
                tracing::debug!("Dust remaining {} micros treated as trading fee", remaining);
            }

            (fills, remaining, self_trade_skipped)
        }; // book borrow dropped here

        // Track if orderbook changed
        let mut orderbook_changed = false;

        // Self-trade prevention leaves the skipped resting orders on the book.
        // Do not cancel another open order as a side effect of submitting a
        // crossing order from the same user.
        if !self_trade_skipped.is_empty() {
            tracing::debug!(
                "Self-trade prevention: {} own orders skipped for user {}",
                self_trade_skipped.len(), cmd.user_id
            );
        }

        let had_fills = !fills.is_empty();

        // Send fills to clearing
        if had_fills {
            tracing::debug!("Order matched: generated {} fills", fills.len());
            let _ = self.fill_tx.send(FillBatch {
                fills,
                cancel_after_settlement: Vec::new(),
            });
            orderbook_changed = true;
        } else {
            tracing::trace!("No matches found for order");
        }

        // Handle remaining qty
        const MIN_CONTRACT_MICROS_OUTER: i64 = 1_000;
        if remaining >= MIN_CONTRACT_MICROS_OUTER
            && cmd.time_in_force == TimeInForce::Gtc
            && self_trade_skipped.is_empty()
        {
            orderbook_changed = true;
        }

        // IOC orders and fully self-trade-blocked GTC orders do not rest on book.
        if (cmd.time_in_force == TimeInForce::Ioc || !self_trade_skipped.is_empty())
            && !had_fills
            && remaining == cmd.qty_micros
        {
            self.finalize_unfilled_ioc(cmd.order_id).await?;
        }

        // ── Invariant check: book must never be crossed after insert ──
        let book = self.books.get(&market_id);
        if let Some(book) = book {
            if let Some((best_bid, best_ask)) = book.check_crossed() {
                tracing::error!(
                    "INVARIANT VIOLATION: Market {} is crossed after order {}! best_bid={} >= best_ask={}",
                    market_id, cmd.order_id, best_bid, best_ask
                );
                // Attempt auto-uncross
                self.uncross_book(market_id).await?;
                orderbook_changed = true;
            }
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
        tracing::debug!(
            "IOC order {} cancelled unfilled and {}p released",
            order_id,
            release_pence
        );
        Ok(())
    }

    async fn handle_cancel(&mut self, cmd: CancelCommand) -> anyhow::Result<()> {
        tracing::debug!(
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

        let mut removed_from_book = false;
        if let Some(book) = self.books.get_mut(&order.market_id) {
            if book
                .cancel_order(cmd.order_id, order.side, order.limit_price_yes_pts)
                .is_some()
            {
                removed_from_book = true;
                tracing::debug!("Removed order {} from in-memory book", cmd.order_id);
            }
        }

        if order.status != "OPEN" && order.status != "PARTIALLY_MATCHED" {
            tracing::debug!(
                "Cancel skipped for order {} because status is {}",
                cmd.order_id,
                order.status
            );
            if removed_from_book {
                self.request_orderbook_broadcast(order.market_id);
            }
            return Ok(());
        }

        // DB cancellation goes through the same FIFO channel as fills. That prevents
        // a cancel from terminaling an order before earlier engine fills settle.
        let _ = self.fill_tx.send(FillBatch {
            fills: Vec::new(),
            cancel_after_settlement: vec![cmd.order_id],
        });
        tracing::debug!(
            "Order {} queued for DB cancel after pending settlements",
            cmd.order_id
        );

        if removed_from_book {
            self.request_orderbook_broadcast(order.market_id);
        }
        Ok(())
    }
}
