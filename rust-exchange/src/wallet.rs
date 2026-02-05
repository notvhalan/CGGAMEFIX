use sqlx::{PgPool, Postgres, Transaction};
use sqlx::types::BigDecimal;
use uuid::Uuid;
use anyhow::Result;
use std::str::FromStr;
use crate::types::*;

/// Wallet operations with proper locking model
#[derive(Clone)]
pub struct WalletService {
    pool: PgPool,
}

impl WalletService {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    /// Reserve funds for a new order (open order lock)
    /// Returns Ok(()) if successful, Err if insufficient balance
    pub async fn reserve_for_order(
        &self,
        tx: &mut Transaction<'_, Postgres>,
        user_id: Uuid,
        reserve_pence: i64,
    ) -> Result<()> {
        // Convert pence to pounds (NUMERIC in DB)
        let amount_pounds = BigDecimal::from_str(&format!("{}", reserve_pence as f64 / 100.0))?;
        
        let result = sqlx::query!(
            r#"
            UPDATE wallets
            SET balance = balance - $1,
                locked_balance = locked_balance + $1,
                updated_at = NOW()
            WHERE user_id = $2
              AND currency = 'GBP'
              AND balance >= $1
            RETURNING id
            "#,
            amount_pounds,
            user_id
        )
        .fetch_optional(&mut **tx)
        .await?;

        if result.is_none() {
            anyhow::bail!("Insufficient balance");
        }

        Ok(())
    }

    /// Move funds from open order lock to position lock (after fill)
    /// Also handles price improvement: if exec < limit, release delta to available
    pub async fn settle_fill(
        &self,
        tx: &mut Transaction<'_, Postgres>,
        user_id: Uuid,
        side: Side,
        limit_yes_pts: i64,
        exec_yes_pts: i64,
        filled_qty_micros: i64,
    ) -> Result<()> {
        // Calculate collateral at limit price (what was reserved)
        let reserved_pence = match side {
            Side::BuyYes => calculate_risk_buyyes(filled_qty_micros, limit_yes_pts),
            Side::SellYes => calculate_risk_sellyes(filled_qty_micros, limit_yes_pts),
        };

        // Calculate actual collateral at execution price (what's needed)
        let actual_pence = match side {
            Side::BuyYes => calculate_risk_buyyes(filled_qty_micros, exec_yes_pts),
            Side::SellYes => calculate_risk_sellyes(filled_qty_micros, exec_yes_pts),
        };

        // Price improvement: exec better than limit
        let improvement_pence = reserved_pence - actual_pence;

        if improvement_pence >= 0 {
            // Normal case: release reserved, lock actual, return improvement
            let reserved_pounds = BigDecimal::from_str(&format!("{}", reserved_pence as f64 / 100.0))?;
            let improvement_pounds = BigDecimal::from_str(&format!("{}", improvement_pence as f64 / 100.0))?;
            
            sqlx::query!(
                r#"
                UPDATE wallets
                SET locked_balance = locked_balance - $1,
                    balance = balance + $2,
                    updated_at = NOW()
                WHERE user_id = $3 AND currency = 'GBP'
                "#,
                reserved_pounds,
                improvement_pounds,
                user_id
            )
            .execute(&mut **tx)
            .await?;
        } else {
            // Should never happen: exec worse than limit
            anyhow::bail!("Execution price worse than limit");
        }

        Ok(())
    }

    /// Release open order lock when order is cancelled
    pub async fn release_order_lock(
        &self,
        tx: &mut Transaction<'_, Postgres>,
        user_id: Uuid,
        release_pence: i64,
    ) -> Result<()> {
        let release_pounds = BigDecimal::from_str(&format!("{}", release_pence as f64 / 100.0))?;
        
        sqlx::query!(
            r#"
            UPDATE wallets
            SET balance = balance + $1,
                locked_balance = locked_balance - $1,
                updated_at = NOW()
            WHERE user_id = $2 AND currency = 'GBP'
            "#,
            release_pounds,
            user_id
        )
        .execute(&mut **tx)
        .await?;

        Ok(())
    }

    /// Charge fee (deduct from available balance)
    pub async fn charge_fee(
        &self,
        tx: &mut Transaction<'_, Postgres>,
        user_id: Uuid,
        fee_pence: i64,
    ) -> Result<()> {
        let fee_pounds = BigDecimal::from_str(&format!("{}", fee_pence as f64 / 100.0))?;
        
        sqlx::query!(
            r#"
            UPDATE wallets
            SET balance = balance - $1,
                updated_at = NOW()
            WHERE user_id = $2 AND currency = 'GBP'
            "#,
            fee_pounds,
            user_id
        )
        .execute(&mut **tx)
        .await?;

        Ok(())
    }

    /// Get user balance
    pub async fn get_balance(&self, user_id: Uuid) -> Result<(i64, i64)> {
        let row = sqlx::query!(
            r#"
            SELECT balance, locked_balance
            FROM wallets
            WHERE user_id = $1 AND currency = 'GBP'
            "#,
            user_id
        )
        .fetch_one(&self.pool)
        .await?;

        // Convert from NUMERIC (which sqlx reads as BigDecimal) to pence
        // For now, use a simple string parse (in production, use bigdecimal crate)
        let balance_pence = (row.balance.to_string().parse::<f64>()? * 100.0) as i64;
        let locked_pence = (row.locked_balance.to_string().parse::<f64>()? * 100.0) as i64;

        Ok((balance_pence, locked_pence))
    }
}
