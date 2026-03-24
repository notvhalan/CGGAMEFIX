use tokio::sync::mpsc;
use sqlx::PgPool;
use crate::types::*;
use crate::wallet::{WalletService, pence_to_pounds};
use crate::websocket::{WsBroadcaster, WsMessage};

/// Clearing service that processes fills from matching engine
pub struct ClearingService {
    pool: PgPool,
    wallet: WalletService,
    fill_rx: mpsc::UnboundedReceiver<Vec<Fill>>,
    ws_broadcaster: WsBroadcaster,
}

impl ClearingService {
    pub fn new(
        pool: PgPool,
        wallet: WalletService,
        fill_rx: mpsc::UnboundedReceiver<Vec<Fill>>,
        ws_broadcaster: WsBroadcaster,
    ) -> Self {
        Self {
            pool,
            wallet,
            fill_rx,
            ws_broadcaster,
        }
    }

    pub async fn run(mut self) {
        while let Some(fills) = self.fill_rx.recv().await {
            if let Err(e) = self.process_fills(fills).await {
                tracing::error!("Failed to process fills: {}", e);
            }
        }
    }

    async fn process_fills(&self, fills: Vec<Fill>) -> anyhow::Result<()> {
        if fills.is_empty() {
            return Ok(());
        }

        // Track which markets need orderbook updates
        let mut affected_markets = std::collections::HashSet::new();
        let taker_order_id = fills.first().map(|f| f.taker_order_id);
        
        // Dust threshold (1 full contract)
        const MIN_CONTRACT_MICROS: i64 = 1_000_000;

        // Track taker's cumulative actual fill cost (for budget-aware IOC release)
        let mut taker_actual_cost_pence: i64 = 0;
        
        // Process each fill in a transaction
        for fill in fills {
            let mut tx = self.pool.begin().await?;

            // 1. Update maker order quantity - treat dust as fully matched
            let maker_update = sqlx::query!(
                r#"
                UPDATE orders
                SET qty_remaining_micros = qty_remaining_micros - $1,
                    status = CASE
                        WHEN qty_remaining_micros - $1 < 1000000 THEN 'MATCHED'
                        ELSE 'PARTIALLY_MATCHED'
                    END,
                    updated_at = NOW()
                WHERE id = $2
                "#,
                fill.qty_micros,
                fill.maker_order_id
            )
            .execute(&mut *tx)
            .await?;
            if maker_update.rows_affected() == 0 {
                anyhow::bail!(
                    "Maker order not found for fill: maker_order_id={}, taker_order_id={}, trade_id={}",
                    fill.maker_order_id,
                    fill.taker_order_id,
                    fill.trade_id
                );
            }

            // 2. Update taker order quantity - treat dust as fully matched
            let taker_update = sqlx::query!(
                r#"
                UPDATE orders
                SET qty_remaining_micros = qty_remaining_micros - $1,
                    status = CASE
                        WHEN qty_remaining_micros - $1 < 1000000 THEN 'MATCHED'
                        ELSE 'PARTIALLY_MATCHED'
                    END,
                    updated_at = NOW()
                WHERE id = $2
                "#,
                fill.qty_micros,
                fill.taker_order_id
            )
            .execute(&mut *tx)
            .await?;
            if taker_update.rows_affected() == 0 {
                anyhow::bail!(
                    "Taker order not found for fill: taker_order_id={}, maker_order_id={}, trade_id={}",
                    fill.taker_order_id,
                    fill.maker_order_id,
                    fill.trade_id
                );
            }

            // 3. Get order details for wallet settlement
            let maker_order = sqlx::query!(
                r#"
                SELECT user_id, side as "side: Side", limit_price_yes_pts
                FROM orders
                WHERE id = $1
                "#,
                fill.maker_order_id
            )
            .fetch_optional(&mut *tx)
            .await?
            .ok_or_else(|| anyhow::anyhow!(
                "Maker order row missing after update: maker_order_id={}, taker_order_id={}, trade_id={}",
                fill.maker_order_id,
                fill.taker_order_id,
                fill.trade_id
            ))?;

            let taker_order = sqlx::query!(
                r#"
                SELECT
                    user_id,
                    market_id,
                    side as "side: Side",
                    limit_price_yes_pts,
                    COALESCE(liability_pence, 0)::bigint as "liability_pence!",
                    COALESCE(time_in_force::text, 'GTC') as "time_in_force!"
                FROM orders
                WHERE id = $1
                "#,
                fill.taker_order_id
            )
            .fetch_optional(&mut *tx)
            .await?
            .ok_or_else(|| anyhow::anyhow!(
                "Taker order row missing after update: taker_order_id={}, maker_order_id={}, trade_id={}",
                fill.taker_order_id,
                fill.maker_order_id,
                fill.trade_id
            ))?;
            
            affected_markets.insert(taker_order.market_id);

            // 4. Settle maker wallet (move from open lock to position lock, handle price improvement)
            self.wallet.settle_fill(
                &mut tx,
                maker_order.user_id,
                maker_order.side,
                maker_order.limit_price_yes_pts,
                fill.exec_yes_pts,
                fill.qty_micros,
            ).await?;

            // 5. Settle taker wallet
            let taker_reduce_only = taker_order.liability_pence == 0 && taker_order.time_in_force == "IOC";

            // IOC budget order: reserved the raw budget (not contracts × limit).
            // Settle at exec price so locked -= actual cost (no per-fill improvement;
            // the unspent budget is returned at IOC cancel time).
            let taker_is_ioc_budget = !taker_reduce_only
                && taker_order.time_in_force == "IOC"
                && taker_order.liability_pence > 0;

            if taker_reduce_only {
                self.wallet
                    .settle_reduce_only_fill(
                        &mut tx,
                        taker_order.user_id,
                        taker_order.side,
                        fill.exec_yes_pts,
                        fill.qty_micros,
                    )
                    .await?;

                // Write position close to wallet ledger_entries
                let yes_notional_pence = calculate_risk_buyyes(fill.qty_micros, fill.exec_yes_pts);
                let cashflow_pence: i64 = match taker_order.side {
                    Side::SellYes => yes_notional_pence,
                    Side::BuyYes => -(yes_notional_pence as i64),
                };
                let wallet_row = sqlx::query!(
                    r#"SELECT id, balance FROM wallets WHERE user_id = $1 AND currency = 'GBP'"#,
                    taker_order.user_id
                )
                .fetch_optional(&mut *tx)
                .await?;
                if let Some(w) = wallet_row {
                    let zero = pence_to_pounds(0);
                    let (debit, credit) = if cashflow_pence >= 0 {
                        (zero, pence_to_pounds(cashflow_pence))
                    } else {
                        (pence_to_pounds(-cashflow_pence), zero)
                    };
                    let side_label = match taker_order.side { Side::SellYes => "SELL", Side::BuyYes => "BUY" };
                    let close_desc = format!(
                        "Position close - {} YES at {:.4}%",
                        side_label,
                        fill.exec_yes_pts as f64 / 100_000.0
                    );
                    sqlx::query!(
                        r#"
                        INSERT INTO ledger_entries
                            (id, user_id, wallet_id, entry_type, debit, credit, balance, reference_id, reference_type, description, created_at)
                        VALUES
                            (gen_random_uuid(), $1, $2, 'POSITION_CLOSE', $3, $4, $5, $6, 'TRADE', $7, NOW())
                        "#,
                        taker_order.user_id,
                        w.id,
                        debit,
                        credit,
                        w.balance,
                        fill.trade_id,
                        close_desc
                    )
                    .execute(&mut *tx)
                    .await?;
                    tracing::info!(
                        "Ledger: POSITION_CLOSE trade={} user={} cashflow={}p",
                        fill.trade_id, taker_order.user_id, cashflow_pence
                    );
                }
            } else {
                // For IOC budget orders, use exec_price as effective limit so that
                // settle_fill deducts actual cost from lock (reserved=actual, improvement=0).
                // For GTC limit orders, use the order's limit price (normal path).
                let effective_limit = if taker_is_ioc_budget {
                    fill.exec_yes_pts
                } else {
                    taker_order.limit_price_yes_pts
                };

                self.wallet
                    .settle_fill(
                        &mut tx,
                        taker_order.user_id,
                        taker_order.side,
                        effective_limit,
                        fill.exec_yes_pts,
                        fill.qty_micros,
                    )
                    .await?;
            }

            // Track actual cost for budget-aware IOC release
            if taker_is_ioc_budget {
                let fill_cost = match taker_order.side {
                    Side::BuyYes => calculate_risk_buyyes(fill.qty_micros, fill.exec_yes_pts),
                    Side::SellYes => calculate_risk_sellyes(fill.qty_micros, fill.exec_yes_pts),
                };
                taker_actual_cost_pence += fill_cost;
            }

            // 6. Charge taker fee
            let taker_risk_for_fill = if taker_reduce_only {
                // Reduce-only close fees track YES notional (same basis as quote endpoint).
                calculate_risk_buyyes(fill.qty_micros, fill.exec_yes_pts)
            } else {
                match taker_order.side {
                    Side::BuyYes => calculate_risk_buyyes(fill.qty_micros, fill.exec_yes_pts),
                    Side::SellYes => calculate_risk_sellyes(fill.qty_micros, fill.exec_yes_pts),
                }
            };
            let fee = calculate_fee(taker_risk_for_fill);
            self.wallet.charge_fee(&mut tx, taker_order.user_id, fee).await?;

            // 7. Insert trade record
            let cost_pence = calculate_risk_buyyes(fill.qty_micros, fill.exec_yes_pts);
            let side_str = match taker_order.side {
                Side::BuyYes => "BUY_YES",
                Side::SellYes => "SELL_YES",
            };
            
            sqlx::query!(
                r#"
                INSERT INTO trades (
                    id, maker_order_id, taker_order_id,
                    maker_user_id, taker_user_id, market_id,
                    side, price_yes_pts, qty_micros, notional_pence,
                    taker_fee_pence, executed_at
                )
                SELECT
                    $1, $2, $3,
                    $4, $5, o.market_id,
                    $6::order_side_new, $7, $8, $9,
                    $10, NOW()
                FROM orders o
                WHERE o.id = $2
                "#,
                fill.trade_id,
                fill.maker_order_id,
                fill.taker_order_id,
                fill.maker_user_id,
                fill.taker_user_id,
                side_str as &str,
                fill.exec_yes_pts as i32,
                fill.qty_micros,
                cost_pence,
                fee as i32
            )
            .execute(&mut *tx)
            .await?;

            // 7.1 Insert trade_settlements rows (idempotency + audit)
            sqlx::query!(
                r#"
                INSERT INTO trade_settlements (trade_id, order_id, user_id)
                VALUES ($1::text, $2::text, $3), ($1::text, $4::text, $5)
                ON CONFLICT DO NOTHING
                "#,
                fill.trade_id.to_string(),
                fill.maker_order_id.to_string(),
                fill.maker_user_id,
                fill.taker_order_id.to_string(),
                fill.taker_user_id
            )
            .execute(&mut *tx)
            .await?;

            // 7.5 Record 100ms price bar (open/close + volume)
            sqlx::query(
                r#"
                INSERT INTO price_bars_100ms (
                    market_id, bucket_start, open_yes_pts, close_yes_pts, volume_micros
                )
                VALUES (
                    $1,
                    to_timestamp(floor(extract(epoch from NOW()) * 10) / 10)::timestamp,
                    $2, $2, $3
                )
                ON CONFLICT (market_id, bucket_start) DO UPDATE
                SET close_yes_pts = EXCLUDED.close_yes_pts,
                    volume_micros = price_bars_100ms.volume_micros + EXCLUDED.volume_micros,
                    updated_at = NOW()
                "#,
            )
            .bind(taker_order.market_id)
            .bind(fill.exec_yes_pts)
            .bind(fill.qty_micros)
            .execute(&mut *tx)
            .await?;

            // 8. Update positions
            // Maker is always opening a new independent lot (never reduce_only).
            // Taker is reduce_only when this is a cashout/close order.
            self.update_position(&mut tx, taker_order.market_id, fill.maker_user_id, fill.maker_side, fill.exec_yes_pts, fill.qty_micros, fill.trade_id, false).await?;
            self.update_position(&mut tx, taker_order.market_id, fill.taker_user_id, taker_order.side, fill.exec_yes_pts, fill.qty_micros, fill.trade_id, taker_reduce_only).await?;

            tx.commit().await?;

            tracing::info!(
                "Settled fill: trade_id={}, qty={}, price={}",
                fill.trade_id,
                fill.qty_micros,
                fill.exec_yes_pts
            );

            // 9. Broadcast trade via WebSocket
            let trade_msg = WsMessage::Trade {
                trade_id: fill.trade_id,
                market_id: taker_order.market_id,
                maker_order_id: fill.maker_order_id,
                taker_order_id: fill.taker_order_id,
                maker_user_id: fill.maker_user_id,
                taker_user_id: fill.taker_user_id,
                price_yes_pts: fill.exec_yes_pts,
                qty_micros: fill.qty_micros,
                notional_pence: cost_pence,
                taker_side: taker_order.side,
                maker_fee_pence: 0, // TODO: maker fees
                taker_fee_pence: fee as i32,
            };
            self.ws_broadcaster.broadcast_to_market(taker_order.market_id, trade_msg).await;
        }

        if let Some(taker_order_id) = taker_order_id {
            if let Some(market_id) = self.finalize_ioc_remainder(taker_order_id, taker_actual_cost_pence).await? {
                affected_markets.insert(market_id);
            }
        }

        // 10. Broadcast orderbook updates for all affected markets
        for market_id in affected_markets {
            tracing::info!("Broadcasting orderbook update for market {}", market_id);
            if let Err(e) = self.ws_broadcaster.send_orderbook_snapshot(market_id).await {
                tracing::error!("Failed to send orderbook snapshot after fills: {}", e);
            }
        }

        Ok(())
    }

    async fn finalize_ioc_remainder(
        &self,
        taker_order_id: uuid::Uuid,
        taker_actual_cost_pence: i64,
    ) -> anyhow::Result<Option<uuid::Uuid>> {
        let order = sqlx::query!(
            r#"
            SELECT
                id,
                user_id,
                market_id,
                qty_remaining_micros,
                qty_original_micros,
                COALESCE(liability_pence, 0)::bigint as "liability_pence!",
                COALESCE(time_in_force::text, 'GTC') as "time_in_force!",
                COALESCE(status::text, 'OPEN') as "status!"
            FROM orders
            WHERE id = $1
            "#,
            taker_order_id
        )
        .fetch_optional(&self.pool)
        .await?;

        let Some(order) = order else {
            return Ok(None);
        };

        if order.time_in_force != "IOC" {
            return Ok(None);
        }

        // All non-reduce-only IOC orders with liability use budget-aware path.
        // Detection via order metadata (not taker_actual_cost_pence > 0) so that
        // the correct path is taken even when every fill rounds its cost to 0p.
        let is_budget_ioc = order.liability_pence > 0;

        // Non-budget IOC: only finalize if still open with remaining qty
        if !is_budget_ioc {
            if (order.status != "OPEN" && order.status != "PARTIALLY_MATCHED")
                || order.qty_remaining_micros <= 0
            {
                return Ok(None);
            }
        }

        let mut tx = self.pool.begin().await?;

        // Mark as CANCELLED if the order is still open/partially matched
        if (order.status == "OPEN" || order.status == "PARTIALLY_MATCHED")
            && order.qty_remaining_micros > 0
        {
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
                taker_order_id
            )
            .execute(&mut *tx)
            .await?;

            if update_result.rows_affected() == 0 && !is_budget_ioc {
                // Non-budget: another process already handled it
                tx.rollback().await?;
                return Ok(None);
            }
        }

        // Calculate how much locked_balance to release
        let release_pence = if is_budget_ioc && order.liability_pence > 0 {
            // Budget-aware: release = budget − actual spend (exact, no rounding gap)
            (order.liability_pence - taker_actual_cost_pence).max(0)
        } else if order.liability_pence > 0 && order.qty_original_micros > 0 {
            // Proportional: release = liability × remaining / original
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
            "IOC taker order {} finalized: released {}p (actual_cost={}p, liability={}p, status={})",
            taker_order_id,
            release_pence,
            taker_actual_cost_pence,
            order.liability_pence,
            order.status
        );

        Ok(Some(order.market_id))
    }

    async fn update_position(
        &self,
        tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
        market_id: uuid::Uuid,
        user_id: uuid::Uuid,
        side: Side,
        exec_yes_pts: i64,
        qty_micros: i64,
        trade_id: uuid::Uuid,
        reduce_only: bool,
    ) -> anyhow::Result<()> {
        let incoming_side = match side {
            Side::BuyYes => "BUY_YES",
            Side::SellYes => "SELL_YES",
        };
        let opposite_side = if incoming_side == "BUY_YES" { "SELL_YES" } else { "BUY_YES" };

        let mut remaining_to_open = qty_micros;

        if reduce_only {
            // Reduce-only (cashout/close): consume opposite-side lots FIFO first.
            // DUST PREVENTION: if closing a lot would leave fewer than DUST_THRESHOLD
            // micros remaining, snap to zero and take the whole lot. This prevents
            // sub-cent remnants that can never be meaningfully closed.
            const DUST_THRESHOLD: i64 = 10_000; // 0.01 contracts

            let opposite_lots = sqlx::query!(
                r#"
                SELECT lot_id, qty_remaining_micros
                FROM position_lots
                WHERE user_id = $1
                  AND market_id = $2
                  AND side::text = $3
                  AND qty_remaining_micros > 0
                ORDER BY opened_at ASC
                FOR UPDATE
                "#,
                user_id,
                market_id,
                opposite_side
            )
            .fetch_all(&mut **tx)
            .await?;

            for lot in opposite_lots {
                if remaining_to_open <= 0 { break; }
                // Base close qty
                let mut close_qty = remaining_to_open.min(lot.qty_remaining_micros);
                if close_qty <= 0 { continue; }
                // Snap: if what would remain in the lot is below dust threshold, take all of it
                let would_remain = lot.qty_remaining_micros - close_qty;
                if would_remain > 0 && would_remain < DUST_THRESHOLD {
                    close_qty = lot.qty_remaining_micros;
                    // Record the snapped dust as fee revenue
                    let dust_fee_pence = (calculate_risk_buyyes(would_remain, exec_yes_pts)).max(1) as i32;
                    if let Err(e) = sqlx::query!(
                        r#"
                        INSERT INTO fee_revenue
                            (id, trade_id, market_id, maker_fee_pence, taker_fee_pence)
                        VALUES
                            (gen_random_uuid(), $1, $2, 0, $3)
                        "#,
                        trade_id,
                        market_id,
                        dust_fee_pence
                    )
                    .execute(&mut **tx)
                    .await {
                        tracing::warn!("Failed to write dust fee to fee_revenue: {}", e);
                    } else {
                        tracing::info!(
                            "Dust fee: {} micros snapped → {} pence in fee_revenue (trade={})",
                            would_remain, dust_fee_pence, trade_id
                        );
                    }
                }
                let updated = sqlx::query!(
                    r#"
                    UPDATE position_lots
                    SET qty_remaining_micros = GREATEST(0, qty_remaining_micros - $1),
                        updated_at = NOW()
                    WHERE lot_id = $2
                    "#,
                    close_qty,
                    lot.lot_id
                )
                .execute(&mut **tx)
                .await?;
                if updated.rows_affected() > 0 {
                    remaining_to_open -= remaining_to_open.min(close_qty);
                }
            }
        }
        // reduce_only orders never open new lots — any unfilled remainder is discarded.
        // Normal orders always open a new independent lot for the full qty.

        if !reduce_only && remaining_to_open > 0 {
            sqlx::query(
                r#"
                INSERT INTO position_lots (
                    user_id, market_id, entry_price_yes_pts, opened_from_trade_id,
                    opened_at, qty_opened_micros, qty_remaining_micros, side
                )
                VALUES ($1, $2, $3, $4, NOW(), $5, $5, $6::order_side_new)
                "#,
            )
            .bind(user_id)
            .bind(market_id)
            .bind(exec_yes_pts as i32)
            .bind(trade_id)
            .bind(remaining_to_open)
            .bind(incoming_side)
            .execute(&mut **tx)
            .await?;
        }

        // 3) Recompute snapshot from open lots (authoritative).
        let open_lots = sqlx::query!(
            r#"
            SELECT side::text as "side!", entry_price_yes_pts, qty_remaining_micros
            FROM position_lots
            WHERE user_id = $1
              AND market_id = $2
              AND qty_remaining_micros > 0
            "#,
            user_id,
            market_id
        )
        .fetch_all(&mut **tx)
        .await?;

        let mut net_qty_micros: i128 = 0;
        let mut total_abs_qty: i128 = 0;
        let mut weighted_sum: i128 = 0;

        for lot in open_lots {
            let qty = lot.qty_remaining_micros as i128;
            total_abs_qty += qty;
            weighted_sum += lot.entry_price_yes_pts as i128 * qty;
            if lot.side == "BUY_YES" {
                net_qty_micros += qty;
            } else {
                net_qty_micros -= qty;
            }
        }

        let avg_open_price_yes_pts: i32 = if total_abs_qty > 0 {
            (weighted_sum / total_abs_qty) as i32
        } else {
            0
        };

        sqlx::query!(
            r#"
            INSERT INTO positions (user_id, market_id, net_qty_micros, avg_open_price_yes_pts, updated_at)
            VALUES ($1, $2, $3, $4, NOW())
            ON CONFLICT (user_id, market_id) DO UPDATE
            SET net_qty_micros = $3,
                avg_open_price_yes_pts = $4,
                updated_at = NOW()
            "#,
            user_id,
            market_id,
            net_qty_micros as i64,
            avg_open_price_yes_pts
        )
        .execute(&mut **tx)
        .await?;

        Ok(())
    }
}
