use std::collections::{BTreeMap, VecDeque};
use uuid::Uuid;
use crate::types::*;

/// Minimum fill size in micro-contracts for budget matching.
/// Below this threshold we consider the remaining budget exhausted (≤1p).
const BUDGET_MIN_FILL_MICROS: i64 = 1_000;

/// Minimum contract size in microcontracts (0.001 contracts)
/// Orders below this threshold are considered "dust" and treated as trading fees
/// This caps the maximum dust fee at 0.1% per order
#[allow(dead_code)]
const MIN_CONTRACT_MICROS: i64 = 1000;

/// Price-time priority orderbook
#[derive(Debug, Clone)]
pub struct OrderBook {
    pub market_id: Uuid,
    /// Bids sorted by price descending (best bid first)
    pub bids: BTreeMap<i64, VecDeque<BookOrder>>,
    /// Asks sorted by price ascending (best ask first)  
    pub asks: BTreeMap<i64, VecDeque<BookOrder>>,
}

#[derive(Debug, Clone)]
pub struct BookOrder {
    pub order_id: Uuid,
    pub user_id: Uuid,
    pub qty_remaining_micros: i64,
    pub created_at: i64,
}

impl OrderBook {
    pub fn new(market_id: Uuid) -> Self {
        Self {
            market_id,
            bids: BTreeMap::new(),
            asks: BTreeMap::new(),
        }
    }

    pub fn bids_count(&self) -> usize {
        self.bids.len()
    }

    pub fn asks_count(&self) -> usize {
        self.asks.len()
    }

    /// Add order to book
    pub fn add_order(&mut self, order: BookOrder, side: Side, limit_yes_pts: i64) {
        let queue = match side {
            Side::BuyYes => self.bids.entry(limit_yes_pts).or_insert_with(VecDeque::new),
            Side::SellYes => self.asks.entry(limit_yes_pts).or_insert_with(VecDeque::new),
        };
        queue.push_back(order);
    }

    /// Match a taker order against the book
    /// Returns (fills, remaining_quantity, self_trade_skipped_order_ids)
    pub fn match_order(
        &mut self,
        taker_order_id: Uuid,
        taker_user_id: Uuid,
        taker_side: Side,
        limit_yes_pts: i64,
        mut qty_remaining_micros: i64,
        mut budget_remaining_pence: Option<i64>,
    ) -> (Vec<Fill>, i64, Vec<Uuid>) {
        let mut fills = Vec::new();
        let mut self_trade_skipped: Vec<Uuid> = Vec::new();

        match taker_side {
            Side::BuyYes => {
                // Match against asks (sellers)
                'outer_buy: while qty_remaining_micros > 0 {
                    // Find best ask (lowest price)
                    let best_ask_price = match self.asks.keys().next() {
                        Some(&price) if price <= limit_yes_pts => price,
                        _ => break, // No more matches
                    };

                    // Get maker orders at this price
                    let makers = self.asks.get_mut(&best_ask_price).unwrap();
                    
                    while qty_remaining_micros > 0 {
                        let maker = match makers.front_mut() {
                            Some(m) => m,
                            None => break,
                        };

                        // Skip self-trade: don't match with own orders
                        // Leave the maker on the book (don't pop) — just skip past it
                        if maker.user_id == taker_user_id {
                            let skipped_id = maker.order_id;
                            self_trade_skipped.push(skipped_id);
                            break 'outer_buy;
                        }

                        let mut fill_qty = qty_remaining_micros.min(maker.qty_remaining_micros);

                        // Budget constraint: cap fill_qty so cost ≤ remaining budget
                        if let Some(budget) = budget_remaining_pence.as_mut() {
                            let max_from_budget = buyyes_contracts_from_risk(*budget, best_ask_price);
                            if max_from_budget < BUDGET_MIN_FILL_MICROS {
                                // Budget exhausted (< 1p at this price)
                                break 'outer_buy;
                            }
                            fill_qty = fill_qty.min(max_from_budget);
                            let cost = calculate_risk_buyyes(fill_qty, best_ask_price);
                            *budget -= cost.max(1); // deduct at least 1p to avoid infinite loop
                        }

                        if fill_qty <= 0 {
                            break 'outer_buy;
                        }

                        fills.push(Fill {
                            trade_id: Uuid::new_v4(),
                            maker_order_id: maker.order_id,
                            taker_order_id,
                            maker_user_id: maker.user_id,
                            taker_user_id,
                            exec_yes_pts: best_ask_price,
                            qty_micros: fill_qty,
                            maker_side: Side::SellYes,
                        });

                        qty_remaining_micros -= fill_qty;
                        maker.qty_remaining_micros -= fill_qty;

                        if maker.qty_remaining_micros == 0 {
                            makers.pop_front();
                        }
                    }

                    // Remove empty price level
                    if makers.is_empty() {
                        self.asks.remove(&best_ask_price);
                    }
                }
            }
            Side::SellYes => {
                // Match against bids (buyers)
                'outer_sell: while qty_remaining_micros > 0 {
                    // Find best bid (highest price)
                    let best_bid_price = match self.bids.keys().rev().next() {
                        Some(&price) if price >= limit_yes_pts => price,
                        _ => break, // No more matches
                    };

                    let makers = self.bids.get_mut(&best_bid_price).unwrap();
                    
                    while qty_remaining_micros > 0 {
                        let maker = match makers.front_mut() {
                            Some(m) => m,
                            None => break,
                        };

                        // Skip self-trade: don't match with own orders
                        // Leave the maker on the book (don't pop) — just skip past it
                        if maker.user_id == taker_user_id {
                            let skipped_id = maker.order_id;
                            self_trade_skipped.push(skipped_id);
                            break 'outer_sell;
                        }

                        let mut fill_qty = qty_remaining_micros.min(maker.qty_remaining_micros);

                        // Budget constraint: cap fill_qty so cost ≤ remaining budget
                        if let Some(budget) = budget_remaining_pence.as_mut() {
                            let max_from_budget = sellyes_contracts_from_risk(*budget, best_bid_price);
                            if max_from_budget < BUDGET_MIN_FILL_MICROS {
                                break 'outer_sell;
                            }
                            fill_qty = fill_qty.min(max_from_budget);
                            let cost = calculate_risk_sellyes(fill_qty, best_bid_price);
                            *budget -= cost.max(1);
                        }

                        if fill_qty <= 0 {
                            break 'outer_sell;
                        }

                        fills.push(Fill {
                            trade_id: Uuid::new_v4(),
                            maker_order_id: maker.order_id,
                            taker_order_id,
                            maker_user_id: maker.user_id,
                            taker_user_id,
                            exec_yes_pts: best_bid_price,
                            qty_micros: fill_qty,
                            maker_side: Side::BuyYes,
                        });

                        qty_remaining_micros -= fill_qty;
                        maker.qty_remaining_micros -= fill_qty;

                        if maker.qty_remaining_micros == 0 {
                            makers.pop_front();
                        }
                    }

                    if makers.is_empty() {
                        self.bids.remove(&best_bid_price);
                    }
                }
            }
        }

        (fills, qty_remaining_micros, self_trade_skipped)
    }

    /// Check if the book is crossed (best_bid >= best_ask)
    /// Returns Some((best_bid, best_ask)) if crossed, None if healthy
    pub fn check_crossed(&self) -> Option<(i64, i64)> {
        let best_bid = self.bids.keys().rev().next().copied();
        let best_ask = self.asks.keys().next().copied();
        match (best_bid, best_ask) {
            (Some(bid), Some(ask)) if bid >= ask => Some((bid, ask)),
            _ => None,
        }
    }

    /// Get best bid price (highest BuyYes)
    pub fn best_bid(&self) -> Option<i64> {
        self.bids.keys().rev().next().copied()
    }

    /// Get best ask price (lowest SellYes)
    pub fn best_ask(&self) -> Option<i64> {
        self.asks.keys().next().copied()
    }

    /// Remove order from book
    pub fn cancel_order(&mut self, order_id: Uuid, side: Side, limit_yes_pts: i64) -> Option<i64> {
        match side {
            Side::BuyYes => {
                let queue = self.bids.get_mut(&limit_yes_pts)?;
                let pos = queue.iter().position(|o| o.order_id == order_id)?;
                let order = queue.remove(pos)?;
                if queue.is_empty() {
                    self.bids.remove(&limit_yes_pts);
                }
                Some(order.qty_remaining_micros)
            }
            Side::SellYes => {
                let queue = self.asks.get_mut(&limit_yes_pts)?;
                let pos = queue.iter().position(|o| o.order_id == order_id)?;
                let order = queue.remove(pos)?;
                if queue.is_empty() {
                    self.asks.remove(&limit_yes_pts);
                }
                Some(order.qty_remaining_micros)
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_price_time_priority() {
        let mut book = OrderBook::new(Uuid::new_v4());
        
        // Add maker orders
        let maker1 = Uuid::new_v4();
        let maker2 = Uuid::new_v4();
        
        book.add_order(
            BookOrder {
                order_id: maker1,
                user_id: Uuid::new_v4(),
                qty_remaining_micros: 10_000_000,
                created_at: 1000,
            },
            Side::SellYes,
            5_000_000, // 50%
        );
        
        book.add_order(
            BookOrder {
                order_id: maker2,
                user_id: Uuid::new_v4(),
                qty_remaining_micros: 5_000_000,
                created_at: 2000,
            },
            Side::SellYes,
            5_000_000, // Same price, later time
        );

        // Match taker
        let (fills, remaining, skipped) = book.match_order(
            Uuid::new_v4(),
            Uuid::new_v4(),
            Side::BuyYes,
            5_000_000,
            12_000_000,
            None,
        );

        assert_eq!(fills.len(), 2);
        assert_eq!(fills[0].maker_order_id, maker1); // Time priority
        assert_eq!(fills[0].qty_micros, 10_000_000);
        assert_eq!(fills[1].maker_order_id, maker2);
        assert_eq!(fills[1].qty_micros, 2_000_000);
        assert_eq!(remaining, 0);
        assert!(skipped.is_empty());
    }

    #[test]
    fn test_self_trade_prevention_keeps_resting_order() {
        let mut book = OrderBook::new(Uuid::new_v4());
        let same_user = Uuid::new_v4();
        let other_user = Uuid::new_v4();
        
        let own_ask = Uuid::new_v4();
        let other_ask = Uuid::new_v4();
        
        // Own order on the ask side
        book.add_order(
            BookOrder {
                order_id: own_ask,
                user_id: same_user,
                qty_remaining_micros: 5_000_000,
                created_at: 1000,
            },
            Side::SellYes,
            5_000_000,
        );
        
        // Another user's ask at same price
        book.add_order(
            BookOrder {
                order_id: other_ask,
                user_id: other_user,
                qty_remaining_micros: 3_000_000,
                created_at: 2000,
            },
            Side::SellYes,
            5_000_000,
        );

        // Same user tries to buy — should skip own order, match with other
        let (fills, remaining, skipped) = book.match_order(
            Uuid::new_v4(),
            same_user,
            Side::BuyYes,
            5_000_000,
            3_000_000,
            None,
        );

        assert!(fills.is_empty());
        assert_eq!(remaining, 3_000_000);
        assert_eq!(skipped.len(), 1);
        assert_eq!(skipped[0], own_ask);

        let level = book.asks.get(&5_000_000).unwrap();
        assert_eq!(level.len(), 2);
        assert_eq!(level[0].order_id, own_ask);
        assert_eq!(level[1].order_id, other_ask);
    }

    #[test]
    fn test_crossed_book_detection() {
        let mut book = OrderBook::new(Uuid::new_v4());
        
        // Add a bid at 69% (6_900_000 pts)
        book.add_order(
            BookOrder {
                order_id: Uuid::new_v4(),
                user_id: Uuid::new_v4(),
                qty_remaining_micros: 10_000_000,
                created_at: 1000,
            },
            Side::BuyYes,
            6_900_000,
        );
        
        // Add an ask at 63% (6_300_000 pts) — LOWER than bid = CROSSED
        book.add_order(
            BookOrder {
                order_id: Uuid::new_v4(),
                user_id: Uuid::new_v4(),
                qty_remaining_micros: 10_000_000,
                created_at: 2000,
            },
            Side::SellYes,
            6_300_000,
        );
        
        let crossed = book.check_crossed();
        assert!(crossed.is_some());
        let (bid, ask) = crossed.unwrap();
        assert_eq!(bid, 6_900_000);
        assert_eq!(ask, 6_300_000);
    }

    #[test]
    fn test_healthy_book_not_crossed() {
        let mut book = OrderBook::new(Uuid::new_v4());
        
        // Bid at 50%, ask at 55% — healthy spread
        book.add_order(
            BookOrder {
                order_id: Uuid::new_v4(),
                user_id: Uuid::new_v4(),
                qty_remaining_micros: 10_000_000,
                created_at: 1000,
            },
            Side::BuyYes,
            5_000_000,
        );
        
        book.add_order(
            BookOrder {
                order_id: Uuid::new_v4(),
                user_id: Uuid::new_v4(),
                qty_remaining_micros: 10_000_000,
                created_at: 2000,
            },
            Side::SellYes,
            5_500_000,
        );
        
        assert!(book.check_crossed().is_none());
    }
}
