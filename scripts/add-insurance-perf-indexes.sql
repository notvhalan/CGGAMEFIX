-- Performance indexes for the insurance category page query
-- Covers the two LATERAL joins in InsuranceController.getCategory()

-- 1. Orders: covers (market_id filter) + (status filter) + (side filter) + price retrieval
--    Used by: MAX/MIN price aggregation on open orders per market
CREATE INDEX IF NOT EXISTS idx_orders_insurance_lookup
  ON orders (market_id, status, side, limit_price_yes_pts)
  WHERE status IN ('OPEN', 'PARTIALLY_MATCHED');

-- 2. Orders: covers liability SUM for OI calculation
CREATE INDEX IF NOT EXISTS idx_orders_insurance_oi
  ON orders (market_id, liability_pence)
  WHERE status IN ('OPEN', 'PARTIALLY_MATCHED');

-- 3. Trades: covers per-market scan sorted by time (last price + 24h volume)
--    The existing idx_trades_market_id is single-column; this composite is much faster
CREATE INDEX IF NOT EXISTS idx_trades_market_time
  ON trades (market_id, executed_at DESC)
  INCLUDE (price_yes_pts, notional_pence);
