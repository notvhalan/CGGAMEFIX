-- Migration: Switch from odds-based to probability point pricing with FOR/LAY
-- Date: 2026-01-21
-- Description: Updates orders and trades tables to use integer probability points (7dp precision)

-- Step 1: Update orders table
-- Add new columns for probability point pricing
ALTER TABLE orders ADD COLUMN IF NOT EXISTS p_pts INTEGER;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS stake_pence INTEGER;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS remaining_pence INTEGER;

-- Migrate existing data if needed (convert price to probability points)
-- For BACK orders: pPts = floor(PRICE_SCALE / price)
-- For LAY orders: pPts = floor(PRICE_SCALE / price)
-- Note: This is a rough conversion - in production you'd need business logic
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'price') THEN
    UPDATE orders 
    SET 
      p_pts = CASE 
        WHEN side = 'BACK' THEN FLOOR(10000000.0 / COALESCE(price, 2.0))
        WHEN side = 'LAY' THEN FLOOR(10000000.0 / COALESCE(price, 2.0))
        ELSE 5000000
      END,
      stake_pence = COALESCE(FLOOR(stake * 100), FLOOR(size * 100), 0),
      remaining_pence = COALESCE(FLOOR(remaining_amount * 100), FLOOR(remaining_size * 100), 0)
    WHERE p_pts IS NULL;
  ELSE
    -- No old data, set defaults for any NULL values
    UPDATE orders 
    SET 
      p_pts = COALESCE(p_pts, 5000000),
      stake_pence = COALESCE(stake_pence, 0),
      remaining_pence = COALESCE(remaining_pence, 0)
    WHERE p_pts IS NULL OR stake_pence IS NULL OR remaining_pence IS NULL;
  END IF;
END $$;

-- Make new columns NOT NULL after migration
ALTER TABLE orders ALTER COLUMN p_pts SET NOT NULL;
ALTER TABLE orders ALTER COLUMN stake_pence SET NOT NULL;
ALTER TABLE orders ALTER COLUMN remaining_pence SET NOT NULL;

-- Add constraints for valid probability points
ALTER TABLE orders ADD CONSTRAINT orders_p_pts_range CHECK (p_pts >= 1 AND p_pts <= 9999999);

-- Update side constraint to include FOR/LAY
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_side_check;
ALTER TABLE orders ADD CONSTRAINT orders_side_check CHECK (side IN ('BACK', 'LAY', 'FOR', 'LAY'));

-- Update status constraint to include all valid statuses
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check 
  CHECK (status IN ('PENDING', 'ACCEPTED', 'OPEN', 'PARTIALLY_MATCHED', 'PARTIAL', 'MATCHED', 'FILLED', 'CANCELLED', 'REJECTED'));

-- Add index for matching performance
CREATE INDEX IF NOT EXISTS idx_orders_market_side_ppts ON orders(market_id, side, p_pts) WHERE status IN ('OPEN', 'PARTIALLY_MATCHED');

-- Step 2: Update trades table
-- Drop old columns if they exist
ALTER TABLE trades DROP COLUMN IF EXISTS price;
ALTER TABLE trades DROP COLUMN IF EXISTS size;

-- Add new columns for probability point pricing
ALTER TABLE trades ADD COLUMN IF NOT EXISTS yes_price_pts INTEGER;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS size_pence INTEGER;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS maker_fee_pence INTEGER DEFAULT 0;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS taker_fee_pence INTEGER DEFAULT 0;

-- Migrate existing data (rough conversion)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trades' AND column_name = 'price') THEN
    UPDATE trades 
    SET 
      yes_price_pts = CASE 
        WHEN side = 'BACK' THEN COALESCE(FLOOR(10000000.0 / NULLIF(price::numeric, 0)), 5000000)
        WHEN side = 'LAY' THEN COALESCE(10000000 - FLOOR(10000000.0 / NULLIF(price::numeric, 0)), 5000000)
        ELSE 5000000
      END,
      size_pence = COALESCE(FLOOR(size::numeric * 100), 0),
      maker_fee_pence = 0,
      taker_fee_pence = COALESCE(FLOOR(size::numeric * 100 * 10 / 10000), 0)
    WHERE yes_price_pts IS NULL;
  ELSE
    -- No old data, set defaults for any NULL values
    UPDATE trades 
    SET 
      yes_price_pts = COALESCE(yes_price_pts, 5000000),
      size_pence = COALESCE(size_pence, 0),
      maker_fee_pence = COALESCE(maker_fee_pence, 0),
      taker_fee_pence = COALESCE(taker_fee_pence, 0)
    WHERE yes_price_pts IS NULL OR size_pence IS NULL OR maker_fee_pence IS NULL OR taker_fee_pence IS NULL;
  END IF;
END $$;

-- Make columns NOT NULL
ALTER TABLE trades ALTER COLUMN yes_price_pts SET NOT NULL;
ALTER TABLE trades ALTER COLUMN size_pence SET NOT NULL;
ALTER TABLE trades ALTER COLUMN maker_fee_pence SET NOT NULL;
ALTER TABLE trades ALTER COLUMN taker_fee_pence SET NOT NULL;

-- Add constraints
ALTER TABLE trades ADD CONSTRAINT trades_yes_price_pts_range CHECK (yes_price_pts >= 1 AND yes_price_pts <= 9999999);

-- Delete any trades with 0 size_pence before adding constraint
DELETE FROM trades WHERE size_pence IS NOT NULL AND size_pence <= 0;

ALTER TABLE trades ADD CONSTRAINT trades_size_pence_positive CHECK (size_pence > 0);

-- Update side constraint
ALTER TABLE trades DROP CONSTRAINT IF EXISTS trades_side_check;
ALTER TABLE trades ADD CONSTRAINT trades_side_check CHECK (side IN ('BACK', 'LAY', 'FOR', 'LAY'));

-- Add indexes for queries
CREATE INDEX IF NOT EXISTS idx_trades_market_executed ON trades(market_id, executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_trades_user_maker ON trades(maker_id, executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_trades_user_taker ON trades(taker_id, executed_at DESC);

-- Step 3: Create fee revenue tracking table (optional but recommended)
CREATE TABLE IF NOT EXISTS fee_revenue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id UUID NOT NULL REFERENCES trades(id),
  market_id UUID NOT NULL,
  maker_fee_pence INTEGER NOT NULL DEFAULT 0,
  taker_fee_pence INTEGER NOT NULL DEFAULT 0,
  total_fee_pence INTEGER GENERATED ALWAYS AS (maker_fee_pence + taker_fee_pence) STORED,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fee_revenue_market ON fee_revenue(market_id, created_at DESC);

-- Step 4: Add helpful views for probability display
CREATE OR REPLACE VIEW orders_with_probabilities AS
SELECT 
  id,
  user_id,
  market_id,
  side,
  p_pts,
  ROUND(p_pts::numeric / 10000000.0, 7) as probability,
  ROUND((10000000 - p_pts)::numeric / 10000000.0, 7) as implied_no_probability,
  stake_pence,
  ROUND(stake_pence::numeric / 100.0, 2) as stake_pounds,
  remaining_pence,
  ROUND(remaining_pence::numeric / 100.0, 2) as remaining_pounds,
  status,
  created_at,
  updated_at
FROM orders;

CREATE OR REPLACE VIEW trades_with_probabilities AS
SELECT 
  t.id,
  t.market_id,
  t.maker_order_id,
  t.taker_order_id,
  t.maker_id,
  t.taker_id,
  t.yes_price_pts,
  ROUND(t.yes_price_pts::numeric / 10000000.0, 7) as yes_probability,
  ROUND((10000000 - t.yes_price_pts)::numeric / 10000000.0, 7) as no_probability,
  t.size_pence,
  ROUND(t.size_pence::numeric / 100.0, 2) as size_pounds,
  t.side,
  t.maker_fee_pence,
  ROUND(t.maker_fee_pence::numeric / 100.0, 2) as maker_fee_pounds,
  t.taker_fee_pence,
  ROUND(t.taker_fee_pence::numeric / 100.0, 2) as taker_fee_pounds,
  t.executed_at,
  t.created_at
FROM trades t;

-- Step 5: Grant permissions (adjust as needed)
-- GRANT SELECT, INSERT, UPDATE ON orders TO betting_app_user;
-- GRANT SELECT, INSERT ON trades TO betting_app_user;
-- GRANT SELECT, INSERT ON fee_revenue TO betting_app_user;

COMMENT ON COLUMN orders.p_pts IS 'Probability points (1 to 9,999,999) representing 0.0000001 to 0.9999999 with 7 decimal places';
COMMENT ON COLUMN orders.stake_pence IS 'Order stake in pence (integer). Divide by 100 for pounds.';
COMMENT ON COLUMN orders.remaining_pence IS 'Remaining unfilled stake in pence (integer)';
COMMENT ON COLUMN trades.yes_price_pts IS 'Canonical YES price in probability points (FOR orders use pPts directly, LAY orders converted to PRICE_SCALE - pPts)';
COMMENT ON COLUMN trades.size_pence IS 'Matched trade size in pence (integer)';
COMMENT ON COLUMN trades.maker_fee_pence IS 'Maker fee in pence (currently 0)';
COMMENT ON COLUMN trades.taker_fee_pence IS 'Taker fee in pence (0.1% = 10 basis points)';
