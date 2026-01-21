-- Migration: Implement Betfair-style stake/liability with contracts-based matching
-- Date: 2026-01-21
-- Description: Add contracts-based matching, separate stake/liability fields

-- Step 1: Add new columns to orders table
ALTER TABLE orders ADD COLUMN IF NOT EXISTS yes_pts BIGINT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS remaining_contracts BIGINT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS original_contracts BIGINT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS stake_pence BIGINT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS liability_pence BIGINT;

-- Migrate existing data if needed
UPDATE orders 
SET 
  yes_pts = CASE 
    WHEN side = 'FOR' THEN p_pts
    WHEN side = 'LAY' THEN 10000000 - p_pts
    ELSE p_pts
  END,
  original_contracts = CASE
    WHEN remaining_pence IS NOT NULL THEN remaining_pence * 1000000 / 100
    ELSE 0
  END,
  remaining_contracts = CASE
    WHEN remaining_pence IS NOT NULL THEN remaining_pence * 1000000 / 100
    ELSE 0
  END,
  stake_pence = CASE
    WHEN side = 'FOR' THEN stake_pence
    ELSE NULL
  END,
  liability_pence = CASE
    WHEN side = 'LAY' THEN stake_pence
    ELSE NULL
  END
WHERE yes_pts IS NULL;

-- Make columns NOT NULL
ALTER TABLE orders ALTER COLUMN yes_pts SET NOT NULL;
ALTER TABLE orders ALTER COLUMN remaining_contracts SET NOT NULL;
ALTER TABLE orders ALTER COLUMN original_contracts SET NOT NULL;

-- Add constraints
ALTER TABLE orders ADD CONSTRAINT orders_yes_pts_range CHECK (yes_pts > 0 AND yes_pts < 10000000);
ALTER TABLE orders ADD CONSTRAINT orders_contracts_positive CHECK (remaining_contracts >= 0);
ALTER TABLE orders ADD CONSTRAINT orders_original_contracts_positive CHECK (original_contracts > 0);
ALTER TABLE orders ADD CONSTRAINT orders_for_has_stake CHECK (side != 'FOR' OR stake_pence IS NOT NULL);
ALTER TABLE orders ADD CONSTRAINT orders_lay_has_liability CHECK (side != 'LAY' OR liability_pence IS NOT NULL);

-- Update status constraint to include all valid statuses
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (status IN ('OPEN', 'PARTIALLY_MATCHED', 'MATCHED', 'CANCELLED', 'REJECTED', 'EXPIRED'));

-- Update side constraint
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_side_check;
ALTER TABLE orders ADD CONSTRAINT orders_side_check CHECK (side IN ('FOR', 'LAY', 'BACK'));

-- Add index for matching (yes_pts + contracts)
CREATE INDEX IF NOT EXISTS idx_orders_market_side_yespts_contracts ON orders(market_id, side, yes_pts, remaining_contracts) WHERE status IN ('OPEN', 'PARTIALLY_MATCHED');

-- Step 2: Add new columns to trades table
ALTER TABLE trades ADD COLUMN IF NOT EXISTS yes_pts BIGINT;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS contracts BIGINT;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS cost_pence BIGINT;

-- Migrate existing data
UPDATE trades 
SET 
  yes_pts = CASE 
    WHEN yes_price_pts IS NOT NULL THEN yes_price_pts
    WHEN side = 'FOR' THEN 5000000
    WHEN side = 'LAY' THEN 5000000
    ELSE 5000000
  END,
  contracts = CASE
    WHEN size_pence IS NOT NULL THEN size_pence * 1000000 / 100
    ELSE 0
  END,
  cost_pence = CASE
    WHEN size_pence IS NOT NULL AND yes_price_pts IS NOT NULL 
    THEN FLOOR((size_pence * yes_price_pts) / 10000000.0)
    ELSE 0
  END
WHERE yes_pts IS NULL;

-- Make columns NOT NULL
ALTER TABLE trades ALTER COLUMN yes_pts SET NOT NULL;
ALTER TABLE trades ALTER COLUMN contracts SET NOT NULL;
ALTER TABLE trades ALTER COLUMN cost_pence SET NOT NULL;

-- Add constraints
ALTER TABLE trades ADD CONSTRAINT trades_yes_pts_range CHECK (yes_pts > 0 AND yes_pts < 10000000);
ALTER TABLE trades ADD CONSTRAINT trades_contracts_positive CHECK (contracts > 0);
ALTER TABLE trades ADD CONSTRAINT trades_cost_pence_positive CHECK (cost_pence >= 0);

-- Update side constraint for trades
ALTER TABLE trades DROP CONSTRAINT IF EXISTS trades_side_check;
ALTER TABLE trades ADD CONSTRAINT trades_side_check CHECK (side IN ('FOR', 'LAY', 'BACK'));

-- Add indexes for querying
CREATE INDEX IF NOT EXISTS idx_trades_market_yespts ON trades(market_id, yes_pts, executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_trades_contracts ON trades(market_id, contracts DESC);

-- Step 3: Add comments for documentation
COMMENT ON COLUMN orders.yes_pts IS 'Canonical YES probability in points (0 < yes_pts < PRICE_SCALE). FOR: yes_pts = p_pts, LAY: yes_pts = PRICE_SCALE - p_pts';
COMMENT ON COLUMN orders.remaining_contracts IS 'Remaining contract micros to be filled (CONTRACT_SCALE = 1e6 micros per contract)';
COMMENT ON COLUMN orders.original_contracts IS 'Original contract micros when order was placed';
COMMENT ON COLUMN orders.stake_pence IS 'Stake in pence for FOR orders (cash risked)';
COMMENT ON COLUMN orders.liability_pence IS 'Liability in pence for LAY orders (max loss)';

COMMENT ON COLUMN trades.yes_pts IS 'Execution price in YES probability points';
COMMENT ON COLUMN trades.contracts IS 'Number of contract micros traded (1e6 micros = 1 contract = £1 payout)';
COMMENT ON COLUMN trades.cost_pence IS 'Cash exchanged at execution in pence';
