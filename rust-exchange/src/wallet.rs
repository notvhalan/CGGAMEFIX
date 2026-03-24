use sqlx::{PgPool, Postgres, Transaction};
use sqlx::types::BigDecimal;
use uuid::Uuid;
use anyhow::Result;
use std::str::FromStr;
use crate::types::*;

/// Convert pence (i64) to pounds BigDecimal without floating-point.
/// e.g. 706 → "7.06", -294 → "-2.94", 0 → "0.00"
pub(crate) fn pence_to_pounds(pence: i64) -> BigDecimal {
    let sign = if pence < 0 { "-" } else { "" };
    let abs = pence.unsigned_abs() as u64;
    BigDecimal::from_str(&format!("{}{}.{:02}", sign, abs / 100, abs % 100)).unwrap()
}

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
        // Convert pence to pounds (NUMERIC in DB) — no floating-point
        let amount_pounds = pence_to_pounds(reserve_pence);
        
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
            // Normal case: release reserved from lock, return improvement to available
            let reserved_pounds = pence_to_pounds(reserved_pence);
            let improvement_pounds = pence_to_pounds(improvement_pence);
            
            // Clamp so locked_balance never goes negative
            sqlx::query!(
                r#"
                UPDATE wallets
                SET locked_balance = GREATEST(locked_balance - $1, 0),
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
        let release_pounds = pence_to_pounds(release_pence);
        
        // Use LEAST to clamp: never release more than what is actually locked.
        // This prevents locked_balance from going negative if prior rounding
        // errors or double-settlement left it lower than expected.
        sqlx::query!(
            r#"
            UPDATE wallets
            SET balance = balance + LEAST($1, locked_balance),
                locked_balance = GREATEST(locked_balance - $1, 0),
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
        let fee_pounds = pence_to_pounds(fee_pence);
        
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

    /// Settle a reduce-only fill directly to available balance.
    /// SELL_YES close receives YES premium, BUY_YES close pays YES premium.
    pub async fn settle_reduce_only_fill(
        &self,
        tx: &mut Transaction<'_, Postgres>,
        user_id: Uuid,
        side: Side,
        exec_yes_pts: i64,
        filled_qty_micros: i64,
    ) -> Result<()> {
        let yes_notional_pence = calculate_risk_buyyes(filled_qty_micros, exec_yes_pts);
        let cashflow_pence = match side {
            Side::SellYes => yes_notional_pence,
            Side::BuyYes => -yes_notional_pence,
        };

        if cashflow_pence >= 0 {
            let credit_pounds = pence_to_pounds(cashflow_pence);
            sqlx::query!(
                r#"
                UPDATE wallets
                SET balance = balance + $1,
                    updated_at = NOW()
                WHERE user_id = $2
                  AND currency = 'GBP'
                "#,
                credit_pounds,
                user_id
            )
            .execute(&mut **tx)
            .await?;
        } else {
            let debit_pence = -cashflow_pence;
            let debit_pounds = pence_to_pounds(debit_pence);
            let updated = sqlx::query!(
                r#"
                UPDATE wallets
                SET balance = balance - $1,
                    updated_at = NOW()
                WHERE user_id = $2
                  AND currency = 'GBP'
                  AND balance >= $1
                RETURNING id
                "#,
                debit_pounds,
                user_id
            )
            .fetch_optional(&mut **tx)
            .await?;

            if updated.is_none() {
                anyhow::bail!("Insufficient balance for reduce-only close");
            }
        }

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

        // Convert BigDecimal pounds to i64 pence without floating-point.
        // BigDecimal::to_string() produces e.g. "12.34" — parse the integer
        // and fractional parts directly.
        let balance_pence = pounds_str_to_pence(&row.balance.to_string());
        let locked_pence = pounds_str_to_pence(&row.locked_balance.to_string());

        Ok((balance_pence, locked_pence))
    }
}

/// Convert a pounds string like "12.34" or "12" to pence (i64).
/// Handles negative values, missing decimals, and single-digit fractions.
fn pounds_str_to_pence(s: &str) -> i64 {
    let negative = s.starts_with('-');
    let s = s.trim_start_matches('-');
    let (whole, frac) = if let Some(dot) = s.find('.') {
        (&s[..dot], &s[dot + 1..])
    } else {
        (s, "00")
    };
    let whole: i64 = whole.parse().unwrap_or(0);
    // Pad or truncate fraction to exactly 2 digits
    let frac_str = format!("{:0<2}", &frac[..frac.len().min(2)]);
    let frac_val: i64 = frac_str.parse().unwrap_or(0);
    let pence = whole * 100 + frac_val;
    if negative { -pence } else { pence }
}
