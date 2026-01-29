-- Migration: Drop legacy trade columns
-- This removes duplicate columns from the trades table, keeping only the new schema
-- 
-- New schema columns (keeping):
--   - price_yes_pts, qty_micros, notional_pence
--   - maker_user_id, taker_user_id
--   - maker_fee_pence, taker_fee_pence
--   - side
--
-- Legacy columns (dropping):
--   - yes_pts, contracts, cost_pence (duplicates of new columns)
--   - yes_price_pts, size_pence (old nullable columns)
--   - maker_fee, taker_fee (old numeric columns)
--   - status, settled_at (unused for trades)

BEGIN;

-- First, verify all services are reading from new columns via aliasing
-- Run this query to check if any recent trades are using old columns:
-- SELECT COUNT(*) FROM trades WHERE yes_pts IS NULL OR contracts IS NULL OR cost_pence IS NULL;

-- Step 1: Drop constraints on legacy columns (if any)
ALTER TABLE trades DROP CONSTRAINT IF EXISTS trades_yes_pts_check;
ALTER TABLE trades DROP CONSTRAINT IF EXISTS trades_contracts_check;
ALTER TABLE trades DROP CONSTRAINT IF EXISTS trades_side_check;

-- Step 2: Drop legacy columns
ALTER TABLE trades DROP COLUMN IF EXISTS yes_pts;           -- Duplicate of price_yes_pts
ALTER TABLE trades DROP COLUMN IF EXISTS contracts;         -- Duplicate of qty_micros
ALTER TABLE trades DROP COLUMN IF EXISTS cost_pence;        -- Duplicate of notional_pence
ALTER TABLE trades DROP COLUMN IF EXISTS yes_price_pts;     -- Old nullable column
ALTER TABLE trades DROP COLUMN IF EXISTS size_pence;        -- Old nullable column
ALTER TABLE trades DROP COLUMN IF EXISTS maker_fee;         -- Old numeric column
ALTER TABLE trades DROP COLUMN IF EXISTS taker_fee;         -- Old numeric column
ALTER TABLE trades DROP COLUMN IF EXISTS status;            -- Unused for trades
ALTER TABLE trades DROP COLUMN IF EXISTS settled_at;        -- Unused for trades

-- Step 3: Verify final schema
-- Expected columns:
--   id, market_id, maker_order_id, taker_order_id, maker_user_id, taker_user_id,
--   side, maker_fee_pence, taker_fee_pence, executed_at, created_at,
--   price_yes_pts, qty_micros, notional_pence

-- Uncomment to see final schema:
-- \d trades

COMMIT;

-- Rollback plan (if needed):
-- BEGIN;
-- ALTER TABLE trades ADD COLUMN yes_pts bigint;
-- ALTER TABLE trades ADD COLUMN contracts bigint;
-- ALTER TABLE trades ADD COLUMN cost_pence bigint;
-- UPDATE trades SET yes_pts = price_yes_pts, contracts = qty_micros, cost_pence = notional_pence;
-- ALTER TABLE trades ALTER COLUMN yes_pts SET NOT NULL;
-- ALTER TABLE trades ALTER COLUMN contracts SET NOT NULL;
-- ALTER TABLE trades ALTER COLUMN cost_pence SET NOT NULL;
-- COMMIT;
