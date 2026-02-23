// Core constants matching your spec exactly
pub const PRICE_SCALE: i64 = 10_000_000; // 7 decimal places (1.0000000 = 100%)
pub const PAYOUT_PENCE_PER_CONTRACT: i64 = 100; // £1.00 per contract
pub const CONTRACT_SCALE_MICROS: i64 = 1_000_000; // 1 contract = 1e6 micros
pub const FEE_BPS: i64 = 10; // 0.10% = 10 basis points
pub const FEE_DENOM: i64 = 10_000;

use serde::{Deserialize, Serialize};
use sqlx::Type;
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[sqlx(type_name = "order_side_new", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum Side {
    BuyYes,
    SellYes,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum TimeInForce {
    #[serde(rename = "GTC")]
    Gtc, // Good Till Cancelled
    #[serde(rename = "IOC")]
    Ioc, // Immediate Or Cancel
}

/// Calculate contracts from risk (max loss) for BUYYES
/// contracts_micros = floor(risk_pence * PRICE_SCALE * MICROS / (yes_pts * PAYOUT_PENCE))
pub fn buyyes_contracts_from_risk(risk_pence: i64, yes_pts: i64) -> i64 {
    (risk_pence * PRICE_SCALE * CONTRACT_SCALE_MICROS) 
        / (yes_pts * PAYOUT_PENCE_PER_CONTRACT)
}

/// Calculate contracts from risk (max loss) for SELLYES
/// contracts_micros = floor(risk_pence * PRICE_SCALE * MICROS / (no_pts * PAYOUT_PENCE))
pub fn sellyes_contracts_from_risk(risk_pence: i64, yes_pts: i64) -> i64 {
    let no_pts = PRICE_SCALE - yes_pts;
    (risk_pence * PRICE_SCALE * CONTRACT_SCALE_MICROS) 
        / (no_pts * PAYOUT_PENCE_PER_CONTRACT)
}

/// Calculate actual risk (collateral needed) for given contracts and price
pub fn calculate_risk_buyyes(contracts_micros: i64, yes_pts: i64) -> i64 {
    (contracts_micros * yes_pts * PAYOUT_PENCE_PER_CONTRACT) 
        / (PRICE_SCALE * CONTRACT_SCALE_MICROS)
}

pub fn calculate_risk_sellyes(contracts_micros: i64, yes_pts: i64) -> i64 {
    let no_pts = PRICE_SCALE - yes_pts;
    (contracts_micros * no_pts * PAYOUT_PENCE_PER_CONTRACT) 
        / (PRICE_SCALE * CONTRACT_SCALE_MICROS)
}

/// Calculate profit if winning
pub fn calculate_profit_if_win(risk_pence: i64, contracts_micros: i64) -> i64 {
    let payout_pence = (contracts_micros * PAYOUT_PENCE_PER_CONTRACT) / CONTRACT_SCALE_MICROS;
    payout_pence - risk_pence
}

/// Calculate fee on risk amount
pub fn calculate_fee(risk_pence: i64) -> i64 {
    (risk_pence * FEE_BPS) / FEE_DENOM
}

/// Order as stored in database
#[derive(Debug, Clone)]
pub struct Order {
    pub id: Uuid,
    pub user_id: Uuid,
    pub market_id: Uuid,
    pub side: Side,
    pub limit_yes_pts: i64,
    pub risk_pence: i64, // User-intent, auditability
    pub qty_original_micros: i64,
    pub qty_remaining_micros: i64,
    pub time_in_force: TimeInForce,
    pub created_at: i64, // timestamp millis
}

/// Command sent to matching engine
#[derive(Debug, Clone)]
pub struct MatchCommand {
    pub order_id: Uuid,
    pub user_id: Uuid,
    pub market_id: Uuid,
    pub side: Side,
    pub limit_yes_pts: i64,
    pub qty_micros: i64,
    pub time_in_force: TimeInForce,
}

/// Cancel command sent to matching engine
#[derive(Debug, Clone)]
pub struct CancelCommand {
    pub order_id: Uuid,
    pub user_id: Uuid,
}

/// Engine command envelope
#[derive(Debug, Clone)]
pub enum EngineCommand {
    Submit(MatchCommand),
    Cancel(CancelCommand),
}

/// Fill produced by matching engine (deterministic output)
#[derive(Debug, Clone)]
pub struct Fill {
    pub trade_id: Uuid,
    pub maker_order_id: Uuid,
    pub taker_order_id: Uuid,
    pub maker_user_id: Uuid,
    pub taker_user_id: Uuid,
    pub exec_yes_pts: i64,
    pub qty_micros: i64,
    pub maker_side: Side,
}

/// Quote response for UI
#[derive(Debug, Serialize)]
pub struct QuoteResponse {
    pub contracts_micros: i64,
    pub risk_pence: i64, // Actual after rounding
    pub profit_if_win_pence: i64,
    pub fee_pence: i64,
    pub limit_yes_pts: i64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_buyyes_at_56_60_percent() {
        // Your UI example: BUYYES at 56.60%, Risk £10
        let yes_pts = 5_660_000; // 56.60%
        let risk_pence = 1000; // £10.00
        
        let contracts = buyyes_contracts_from_risk(risk_pence, yes_pts);
        // contracts = 1000 * 10_000_000 * 1_000_000 / (5_660_000 * 100)
        //           = 10_000_000_000_000 / 566_000_000
        //           = 17_667_844 micros
        //           = 17.67 contracts
        
        assert_eq!(contracts, 17_667_844);
        
        let profit = calculate_profit_if_win(risk_pence, contracts);
        // payout = 17.67 contracts * £1 = £17.67
        // profit = £17.67 - £10 = £7.67
        assert_eq!(profit, 766); // £7.66
        
        let fee = calculate_fee(risk_pence);
        assert_eq!(fee, 1); // £0.01 (0.10% of £10)
    }

    #[test]
    fn test_sellyes_at_56_60_percent() {
        // Your UI example: SELLYES at 56.60%, Risk £10
        let yes_pts = 5_660_000; // 56.60%
        let risk_pence = 1000; // £10.00
        
        let contracts = sellyes_contracts_from_risk(risk_pence, yes_pts);
        // no_pts = 10_000_000 - 5_660_000 = 4_340_000 (43.40%)
        // contracts = 1000 * 10_000_000 * 1_000_000 / (4_340_000 * 100)
        //           = 10_000_000_000_000 / 434_000_000
        //           = 23_041_474 micros
        //           = 23.04 contracts
        
        assert_eq!(contracts, 23_041_474);
        
        let profit = calculate_profit_if_win(risk_pence, contracts);
        // payout = 23.04 contracts * £1 = £23.04
        // profit = £23.04 - £10 = £13.04
        assert_eq!(profit, 1304); // £13.04
    }
}
