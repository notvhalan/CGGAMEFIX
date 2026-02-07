use std::collections::{BTreeMap, VecDeque};
use uuid::Uuid;
use crate::types::*;

/// Minimum contract size in microcontracts (0.001 contracts)
/// Orders below this threshold are considered "dust" and treated as trading fees
/// This caps the maximum dust fee at 0.1% per order
const MIN_CONTRACT_MICROS: i64 = 1000;

/// Price-time priority orderbook
#[derive(Debug, Clone)]
pub struct OrderBook {
    pub market_id: Uuid,
    /// Bids sorted by price descending (best bid first)
    bids: BTreeMap<i64, VecDeque<BookOrder>>,
    /// Asks sorted by price ascending (best ask first)  
    asks: BTreeMap<i64, VecDeque<BookOrder>>,
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
    /// Returns fills and remaining quantity
    pub fn match_order(
        &mut self,
        taker_order_id: Uuid,
        taker_user_id: Uuid,
        taker_side: Side,
        limit_yes_pts: i64,
        mut qty_remaining_micros: i64,
    ) -> (Vec<Fill>, i64) {
        let mut fills = Vec::new();

        match taker_side {
            Side::BuyYes => {
                // Match against asks (sellers)
                while qty_remaining_micros > 0 {
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
                        if maker.user_id == taker_user_id {
                            makers.pop_front();
                            continue;
                        }

                        let fill_qty = qty_remaining_micros.min(maker.qty_remaining_micros);

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
                while qty_remaining_micros > 0 {
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
                        if maker.user_id == taker_user_id {
                            makers.pop_front();
                            continue;
                        }

                        let fill_qty = qty_remaining_micros.min(maker.qty_remaining_micros);

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

        (fills, qty_remaining_micros)
    }

    /// Remove order from book
    pub fn cancel_order(&mut self, order_id: Uuid, side: Side, limit_yes_pts: i64) -> Option<i64> {
        let queue = match side {
            Side::BuyYes => self.bids.get_mut(&limit_yes_pts)?,
            Side::SellYes => self.asks.get_mut(&limit_yes_pts)?,
        };

        let pos = queue.iter().position(|o| o.order_id == order_id)?;
        let order = queue.remove(pos)?;
        
        Some(order.qty_remaining_micros)
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
        let (fills, remaining) = book.match_order(
            Uuid::new_v4(),
            Uuid::new_v4(),
            Side::BuyYes,
            5_000_000,
            12_000_000,
        );

        assert_eq!(fills.len(), 2);
        assert_eq!(fills[0].maker_order_id, maker1); // Time priority
        assert_eq!(fills[0].qty_micros, 10_000_000);
        assert_eq!(fills[1].maker_order_id, maker2);
        assert_eq!(fills[1].qty_micros, 2_000_000);
        assert_eq!(remaining, 0);
    }
}
