use tokio::sync::mpsc;
use sqlx::PgPool;
use crate::types::*;
use crate::wallet::WalletService;
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
        // Track which markets need orderbook updates
        let mut affected_markets = std::collections::HashSet::new();
        
        // Dust threshold (1 full contract)
        const MIN_CONTRACT_MICROS: i64 = 1_000_000;
        
        // Process each fill in a transaction
        for fill in fills {
            let mut tx = self.pool.begin().await?;

            // 1. Update maker order quantity - treat dust as fully matched
            sqlx::query!(
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

            // 2. Update taker order quantity - treat dust as fully matched
            sqlx::query!(
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

            // 3. Get order details for wallet settlement
            let maker_order = sqlx::query!(
                r#"
                SELECT user_id, side as "side: Side", limit_price_yes_pts
                FROM orders
                WHERE id = $1
                "#,
                fill.maker_order_id
            )
            .fetch_one(&mut *tx)
            .await?;

            let taker_order = sqlx::query!(
                r#"
                SELECT user_id, market_id, side as "side: Side", limit_price_yes_pts, liability_pence
                FROM orders
                WHERE id = $1
                "#,
                fill.taker_order_id
            )
            .fetch_one(&mut *tx)
            .await?;
            
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
            self.wallet.settle_fill(
                &mut tx,
                taker_order.user_id,
                taker_order.side,
                taker_order.limit_price_yes_pts,
                fill.exec_yes_pts,
                fill.qty_micros,
            ).await?;

            // 6. Charge taker fee
            let taker_risk_for_fill = match taker_order.side {
                Side::BuyYes => calculate_risk_buyyes(fill.qty_micros, fill.exec_yes_pts),
                Side::SellYes => calculate_risk_sellyes(fill.qty_micros, fill.exec_yes_pts),
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

            // 8. Update positions
            self.update_position(&mut tx, taker_order.market_id, fill.maker_user_id, fill.maker_side, fill.exec_yes_pts, fill.qty_micros, fill.trade_id).await?;
            self.update_position(&mut tx, taker_order.market_id, fill.taker_user_id, taker_order.side, fill.exec_yes_pts, fill.qty_micros, fill.trade_id).await?;

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

        // 10. Broadcast orderbook updates for all affected markets
        for market_id in affected_markets {
            tracing::info!("Broadcasting orderbook update for market {}", market_id);
            if let Err(e) = self.ws_broadcaster.send_orderbook_snapshot(market_id).await {
                tracing::error!("Failed to send orderbook snapshot after fills: {}", e);
            }
        }

        Ok(())
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
    ) -> anyhow::Result<()> {
        let delta = match side {
            Side::BuyYes => qty_micros,
            Side::SellYes => -qty_micros,
        };

        // Update positions table
        sqlx::query!(
            r#"
            INSERT INTO positions (user_id, market_id, net_qty_micros, avg_open_price_yes_pts, updated_at)
            VALUES ($1, $2, $3::BIGINT, $4::BIGINT, NOW())
            ON CONFLICT (user_id, market_id) DO UPDATE
            SET net_qty_micros = positions.net_qty_micros + $3::BIGINT,
                avg_open_price_yes_pts = CASE
                    WHEN positions.net_qty_micros + $3::BIGINT = 0 THEN 0
                    ELSE (positions.avg_open_price_yes_pts * positions.net_qty_micros + $4::BIGINT * $3::BIGINT) / (positions.net_qty_micros + $3::BIGINT)
                END,
                updated_at = NOW()
            "#,
            user_id,
            market_id,
            delta,
            exec_yes_pts
        )
        .execute(&mut **tx)
        .await?;

        // Create position_lot for buy orders
        if matches!(side, Side::BuyYes) {
            sqlx::query!(
                r#"
                INSERT INTO position_lots (
                    user_id, market_id, entry_price_yes_pts, opened_from_trade_id,
                    opened_at, qty_opened_micros, qty_remaining_micros, side
                )
                VALUES ($1, $2, $3, $4, NOW(), $5, $5, 'BUY_YES')
                "#,
                user_id,
                market_id,
                exec_yes_pts as i32,
                trade_id,
                qty_micros
            )
            .execute(&mut **tx)
            .await?;
        }

        Ok(())
    }
}
