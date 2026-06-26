use std::collections::{BTreeMap, HashMap, VecDeque};
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
    bid_qty_by_price: BTreeMap<i64, i64>,
    ask_qty_by_price: BTreeMap<i64, i64>,
    order_index: HashMap<Uuid, OrderLocation>,
}

#[derive(Debug, Clone)]
pub struct BookOrder {
    pub order_id: Uuid,
    pub user_id: Uuid,
    pub qty_remaining_micros: i64,
    pub created_at: i64,
}

#[derive(Debug, Clone, Copy)]
struct OrderLocation {
    side: Side,
    price: i64,
    qty_remaining_micros: i64,
}

impl OrderBook {
    pub fn new(market_id: Uuid) -> Self {
        Self {
            market_id,
            bids: BTreeMap::new(),
            asks: BTreeMap::new(),
            bid_qty_by_price: BTreeMap::new(),
            ask_qty_by_price: BTreeMap::new(),
            order_index: HashMap::new(),
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
        self.order_index.insert(order.order_id, OrderLocation {
            side,
            price: limit_yes_pts,
            qty_remaining_micros: order.qty_remaining_micros,
        });

        let qty_by_price = match side {
            Side::BuyYes => &mut self.bid_qty_by_price,
            Side::SellYes => &mut self.ask_qty_by_price,
        };
        *qty_by_price.entry(limit_yes_pts).or_insert(0) += order.qty_remaining_micros;

        let queue = match side {
            Side::BuyYes => self.bids.entry(limit_yes_pts).or_insert_with(VecDeque::new),
            Side::SellYes => self.asks.entry(limit_yes_pts).or_insert_with(VecDeque::new),
        };
        queue.push_back(order);
    }

    fn decrement_level_qty(&mut self, side: Side, price: i64, qty: i64) {
        let qty_by_price = match side {
            Side::BuyYes => &mut self.bid_qty_by_price,
            Side::SellYes => &mut self.ask_qty_by_price,
        };

        if let Some(level_qty) = qty_by_price.get_mut(&price) {
            *level_qty -= qty;
            if *level_qty <= 0 {
                qty_by_price.remove(&price);
            }
        }
    }

    fn update_index_qty(&mut self, order_id: Uuid, fill_qty: i64) {
        if let Some(location) = self.order_index.get_mut(&order_id) {
            location.qty_remaining_micros -= fill_qty;
            if location.qty_remaining_micros <= 0 {
                self.order_index.remove(&order_id);
            }
        }
    }

    fn prune_front(&mut self, side: Side, price: i64) {
        let order_index = &self.order_index;
        let queue = match side {
            Side::BuyYes => self.bids.get_mut(&price),
            Side::SellYes => self.asks.get_mut(&price),
        };

        if let Some(queue) = queue {
            while queue
                .front()
                .map(|order| !order_index.contains_key(&order.order_id) || order.qty_remaining_micros <= 0)
                .unwrap_or(false)
            {
                queue.pop_front();
            }

            if queue.is_empty() {
                match side {
                    Side::BuyYes => {
                        self.bids.remove(&price);
                    }
                    Side::SellYes => {
                        self.asks.remove(&price);
                    }
                }
            }
        }
    }

    pub fn levels(&self, side: Side, limit: usize) -> Vec<(i64, i64)> {
        let iter: Box<dyn Iterator<Item = (&i64, &i64)> + '_> = match side {
            Side::BuyYes => Box::new(self.bid_qty_by_price.iter().rev()),
            Side::SellYes => Box::new(self.ask_qty_by_price.iter()),
        };

        iter
            .take(limit)
            .map(|(&price_yes_pts, &qty_micros)| (price_yes_pts, qty_micros))
            .collect()
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
                'outer_buy: while qty_remaining_micros > 0 {
                    let best_ask_price = match self.ask_qty_by_price.keys().next() {
                        Some(&price) if price <= limit_yes_pts => price,
                        _ => break,
                    };

                    self.prune_front(Side::SellYes, best_ask_price);

                    while qty_remaining_micros > 0 {
                        let fill_event = {
                            let makers = match self.asks.get_mut(&best_ask_price) {
                                Some(makers) => makers,
                                None => {
                                    self.ask_qty_by_price.remove(&best_ask_price);
                                    continue 'outer_buy;
                                }
                            };

                            let maker = match makers.front_mut() {
                                Some(m) => m,
                                None => break,
                            };

                            if maker.user_id == taker_user_id {
                                self_trade_skipped.push(maker.order_id);
                                break 'outer_buy;
                            }

                            let mut fill_qty = qty_remaining_micros.min(maker.qty_remaining_micros);

                            if let Some(budget) = budget_remaining_pence.as_mut() {
                                let max_from_budget = buyyes_contracts_from_risk(*budget, best_ask_price);
                                if max_from_budget < BUDGET_MIN_FILL_MICROS {
                                    break 'outer_buy;
                                }
                                fill_qty = fill_qty.min(max_from_budget);
                                let cost = calculate_risk_buyyes(fill_qty, best_ask_price);
                                *budget -= cost.max(1);
                            }

                            if fill_qty <= 0 {
                                break 'outer_buy;
                            }

                            let fill = Fill {
                                trade_id: Uuid::new_v4(),
                                maker_order_id: maker.order_id,
                                taker_order_id,
                                maker_user_id: maker.user_id,
                                taker_user_id,
                                exec_yes_pts: best_ask_price,
                                qty_micros: fill_qty,
                                maker_side: Side::SellYes,
                            };

                            maker.qty_remaining_micros -= fill_qty;
                            let maker_order_id = maker.order_id;

                            if maker.qty_remaining_micros == 0 {
                                makers.pop_front();
                            }

                            (fill, maker_order_id, fill_qty)
                        };

                        let (fill, maker_order_id, fill_qty) = fill_event;
                        qty_remaining_micros -= fill_qty;
                        fills.push(fill);

                        self.decrement_level_qty(Side::SellYes, best_ask_price, fill_qty);
                        self.update_index_qty(maker_order_id, fill_qty);
                        self.prune_front(Side::SellYes, best_ask_price);
                    }

                    self.prune_front(Side::SellYes, best_ask_price);
                }
            }
            Side::SellYes => {
                'outer_sell: while qty_remaining_micros > 0 {
                    let best_bid_price = match self.bid_qty_by_price.keys().rev().next() {
                        Some(&price) if price >= limit_yes_pts => price,
                        _ => break,
                    };

                    self.prune_front(Side::BuyYes, best_bid_price);

                    while qty_remaining_micros > 0 {
                        let fill_event = {
                            let makers = match self.bids.get_mut(&best_bid_price) {
                                Some(makers) => makers,
                                None => {
                                    self.bid_qty_by_price.remove(&best_bid_price);
                                    continue 'outer_sell;
                                }
                            };

                            let maker = match makers.front_mut() {
                                Some(m) => m,
                                None => break,
                            };

                            if maker.user_id == taker_user_id {
                                self_trade_skipped.push(maker.order_id);
                                break 'outer_sell;
                            }

                            let mut fill_qty = qty_remaining_micros.min(maker.qty_remaining_micros);

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

                            let fill = Fill {
                                trade_id: Uuid::new_v4(),
                                maker_order_id: maker.order_id,
                                taker_order_id,
                                maker_user_id: maker.user_id,
                                taker_user_id,
                                exec_yes_pts: best_bid_price,
                                qty_micros: fill_qty,
                                maker_side: Side::BuyYes,
                            };

                            maker.qty_remaining_micros -= fill_qty;
                            let maker_order_id = maker.order_id;

                            if maker.qty_remaining_micros == 0 {
                                makers.pop_front();
                            }

                            (fill, maker_order_id, fill_qty)
                        };

                        let (fill, maker_order_id, fill_qty) = fill_event;
                        qty_remaining_micros -= fill_qty;
                        fills.push(fill);

                        self.decrement_level_qty(Side::BuyYes, best_bid_price, fill_qty);
                        self.update_index_qty(maker_order_id, fill_qty);
                        self.prune_front(Side::BuyYes, best_bid_price);
                    }

                    self.prune_front(Side::BuyYes, best_bid_price);
                }
            }
        }

        (fills, qty_remaining_micros, self_trade_skipped)
    }
    /// Check if the book is crossed (best_bid >= best_ask)
    /// Returns Some((best_bid, best_ask)) if crossed, None if healthy
    pub fn check_crossed(&self) -> Option<(i64, i64)> {
        let best_bid = self.bid_qty_by_price.keys().rev().next().copied();
        let best_ask = self.ask_qty_by_price.keys().next().copied();
        match (best_bid, best_ask) {
            (Some(bid), Some(ask)) if bid >= ask => Some((bid, ask)),
            _ => None,
        }
    }

    /// Get best bid price (highest BuyYes)
    pub fn best_bid(&self) -> Option<i64> {
        self.bid_qty_by_price.keys().rev().next().copied()
    }

    /// Get best ask price (lowest SellYes)
    pub fn best_ask(&self) -> Option<i64> {
        self.ask_qty_by_price.keys().next().copied()
    }

    /// Remove order from book
    pub fn cancel_order(&mut self, order_id: Uuid, side: Side, limit_yes_pts: i64) -> Option<i64> {
        let location = self.order_index.remove(&order_id)?;
        if location.side != side || location.price != limit_yes_pts {
            tracing::warn!(
                "Cancel metadata mismatch for order {}: request=({:?}, {}), index=({:?}, {})",
                order_id,
                side,
                limit_yes_pts,
                location.side,
                location.price
            );
        }

        self.decrement_level_qty(location.side, location.price, location.qty_remaining_micros);
        self.prune_front(location.side, location.price);
        Some(location.qty_remaining_micros)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::hint::black_box;
    use std::time::Instant;

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

    #[test]
    #[ignore = "benchmark; run with cargo test --release orderbook_match_throughput -- --ignored --nocapture"]
    fn orderbook_match_throughput() {
        let mut book = OrderBook::new(Uuid::new_v4());
        let maker_user = Uuid::new_v4();
        let taker_user = Uuid::new_v4();
        let price = 5_000_000;
        let iterations = 500_000usize;
        let qty_per_order = 1_000i64;

        book.add_order(
            BookOrder {
                order_id: Uuid::new_v4(),
                user_id: maker_user,
                qty_remaining_micros: qty_per_order * iterations as i64,
                created_at: 1,
            },
            Side::SellYes,
            price,
        );

        let start = Instant::now();
        let mut fills_seen = 0usize;

        for _ in 0..iterations {
            let (fills, remaining, skipped) = book.match_order(
                Uuid::new_v4(),
                taker_user,
                Side::BuyYes,
                price,
                qty_per_order,
                None,
            );

            black_box(&fills);
            fills_seen += fills.len();
            assert_eq!(remaining, 0);
            assert!(skipped.is_empty());
        }

        let elapsed = start.elapsed();
        let orders_per_second = iterations as f64 / elapsed.as_secs_f64();
        println!(
            "orderbook_match_throughput: {} orders in {:?} = {:.0} orders/sec (fills={})",
            iterations,
            elapsed,
            orders_per_second,
            fills_seen
        );
    }
}
