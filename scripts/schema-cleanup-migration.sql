-- ============================================================================
-- SCHEMA CLEANUP MIGRATION: Kalshi-Style Naming
-- ============================================================================
-- 
-- This migration cleans up confusing table/column names and removes duplicates.
-- Safe to run incrementally with rollback support.
--
-- CHANGES:
-- 1. Remove legacy `wallets` table (only 2 rows, not used)
-- 2. Rename `wallet_accounts` → `wallets` (the active table)
-- 3. Clean up `trades` table duplicate columns
-- 4. Rename `positions_snapshot` → `positions`
-- 5. Standardize column naming across all tables
-- ============================================================================

BEGIN;

-- ============================================================================
-- PHASE 1: Wallet Cleanup (High Value, Low Risk)
-- ============================================================================

-- Step 1.1: Drop legacy wallets table (not referenced, only 2 test rows)
-- Check first: SELECT COUNT(*) FROM wallets; -- Expected: 2
-- Check: SELECT COUNT(*) FROM wallet_accounts; -- Expected: 22

-- Note: ledger_entries.wallet_id already references wallet_accounts(id) ✅
-- So no FK changes needed!

DROP TABLE IF EXISTS wallets CASCADE;

-- Step 1.2: Rename wallet_accounts → wallets
ALTER TABLE wallet_accounts RENAME TO wallets;

-- Step 1.3: Update index names to match new table name
ALTER INDEX wallet_accounts_pkey RENAME TO wallets_pkey;
ALTER INDEX idx_wallet_accounts_user_id RENAME TO idx_wallets_user_id;
ALTER INDEX wallet_accounts_user_id_currency_key RENAME TO wallets_user_id_currency_key;

-- FK already correct: ledger_entries.wallet_id references wallets(id) ✅

COMMENT ON TABLE wallets IS 'User wallet balances per currency. Active table (renamed from wallet_accounts).';

-- ============================================================================
-- PHASE 2: Trades Table Cleanup (Remove Duplicate Columns)
-- ============================================================================

-- Current state: trades has BOTH yes_pts + yes_price_pts, contracts + size_pence
-- Goal: One canonical set of columns

-- Step 2.1: Add new canonical columns (if they don't exist)
ALTER TABLE trades 
  ADD COLUMN IF NOT EXISTS price_yes_pts BIGINT,
  ADD COLUMN IF NOT EXISTS qty_micros BIGINT,
  ADD COLUMN IF NOT EXISTS notional_pence BIGINT;

-- Step 2.2: Backfill from existing columns
UPDATE trades 
SET 
  price_yes_pts = yes_pts,
  qty_micros = contracts,
  notional_pence = cost_pence
WHERE price_yes_pts IS NULL;

-- Step 2.3: Add constraints to new columns
ALTER TABLE trades
  ALTER COLUMN price_yes_pts SET NOT NULL,
  ALTER COLUMN qty_micros SET NOT NULL,
  ALTER COLUMN notional_pence SET NOT NULL;

ALTER TABLE trades
  ADD CONSTRAINT trades_price_yes_pts_range CHECK (price_yes_pts > 0 AND price_yes_pts < 10000000),
  ADD CONSTRAINT trades_qty_micros_positive CHECK (qty_micros > 0),
  ADD CONSTRAINT trades_notional_pence_nonneg CHECK (notional_pence >= 0);

-- Step 2.4: Rename user/order columns for clarity
ALTER TABLE trades RENAME COLUMN maker_id TO maker_user_id;
ALTER TABLE trades RENAME COLUMN taker_id TO taker_user_id;

-- Step 2.5: Drop duplicate/deprecated columns (AFTER code is updated)
-- Uncomment these ONLY after you've updated all code to use new columns:
-- ALTER TABLE trades DROP COLUMN IF EXISTS yes_price_pts;
-- ALTER TABLE trades DROP COLUMN IF EXISTS size_pence;
-- ALTER TABLE trades DROP COLUMN IF EXISTS maker_fee; -- decimal version
-- ALTER TABLE trades DROP COLUMN IF EXISTS taker_fee; -- decimal version

COMMENT ON COLUMN trades.price_yes_pts IS 'Trade execution price in YES probability points (0.00001% precision, 0-10M)';
COMMENT ON COLUMN trades.qty_micros IS 'Quantity traded in microcontracts (1 contract = 1,000,000 micros)';
COMMENT ON COLUMN trades.notional_pence IS 'Notional value of trade in pence (premium paid/received)';

-- ============================================================================
-- PHASE 3: Orders Table Standardization
-- ============================================================================

-- Rename for clarity (optional but recommended)
ALTER TABLE orders RENAME COLUMN yes_pts TO limit_price_yes_pts;
ALTER TABLE orders RENAME COLUMN remaining_contracts TO qty_remaining_micros;
ALTER TABLE orders RENAME COLUMN original_contracts TO qty_original_micros;

-- Rename p_pts → input_price_pts for clarity (this is what user typed)
-- Or drop it if you don't need it
-- ALTER TABLE orders RENAME COLUMN p_pts TO input_price_pts;

-- Update constraint names
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_yes_pts_range;
ALTER TABLE orders ADD CONSTRAINT orders_limit_price_yes_pts_range 
  CHECK (limit_price_yes_pts > 0 AND limit_price_yes_pts < 10000000);

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_contracts_positive;
ALTER TABLE orders ADD CONSTRAINT orders_qty_remaining_positive 
  CHECK (qty_remaining_micros >= 0);

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_original_contracts_positive;
ALTER TABLE orders ADD CONSTRAINT orders_qty_original_positive 
  CHECK (qty_original_micros > 0);

COMMENT ON COLUMN orders.limit_price_yes_pts IS 'Limit price in YES probability points (canonical price)';
COMMENT ON COLUMN orders.qty_remaining_micros IS 'Remaining unfilled quantity in microcontracts';
COMMENT ON COLUMN orders.qty_original_micros IS 'Original order quantity in microcontracts';

-- ============================================================================
-- PHASE 4: Positions Tables Rename
-- ============================================================================

-- Step 4.1: Rename positions_snapshot → positions (cleaner, standard)
ALTER TABLE positions_snapshot RENAME TO positions;

-- Step 4.2: Update index names
ALTER INDEX positions_snapshot_pkey RENAME TO positions_pkey;
ALTER INDEX idx_positions_snapshot_user RENAME TO idx_positions_user;
ALTER INDEX idx_positions_snapshot_nonzero RENAME TO idx_positions_nonzero;

-- Step 4.3: Rename columns for clarity
ALTER TABLE positions RENAME COLUMN net_contracts_micros TO net_qty_micros;
ALTER TABLE positions RENAME COLUMN avg_entry_yes_pts TO avg_open_price_yes_pts;

COMMENT ON TABLE positions IS 'Aggregated position snapshot per user/market. Read model built from position_lots.';
COMMENT ON COLUMN positions.net_qty_micros IS 'Net position quantity (signed): positive=long, negative=short';
COMMENT ON COLUMN positions.avg_open_price_yes_pts IS 'Weighted average entry price of open lots';

-- ============================================================================
-- PHASE 5: Position Lots Cleanup
-- ============================================================================

-- Rename columns for consistency
ALTER TABLE position_lots RENAME COLUMN entry_yes_pts TO entry_price_yes_pts;
ALTER TABLE position_lots RENAME COLUMN opened_contracts_micros TO qty_opened_micros;
ALTER TABLE position_lots RENAME COLUMN remaining_contracts_micros TO qty_remaining_micros;

-- Update constraints
ALTER TABLE position_lots DROP CONSTRAINT IF EXISTS position_lots_entry_yes_pts_check;
ALTER TABLE position_lots ADD CONSTRAINT position_lots_entry_price_range
  CHECK (entry_price_yes_pts >= 0 AND entry_price_yes_pts <= 10000000);

ALTER TABLE position_lots DROP CONSTRAINT IF EXISTS position_lots_opened_contracts_micros_check;
ALTER TABLE position_lots ADD CONSTRAINT position_lots_qty_opened_positive
  CHECK (qty_opened_micros > 0);

ALTER TABLE position_lots DROP CONSTRAINT IF EXISTS position_lots_remaining_contracts_micros_check;
ALTER TABLE position_lots ADD CONSTRAINT position_lots_qty_remaining_nonneg
  CHECK (qty_remaining_micros >= 0);

ALTER TABLE position_lots DROP CONSTRAINT IF EXISTS position_lots_check;
ALTER TABLE position_lots ADD CONSTRAINT position_lots_qty_remaining_lte_opened
  CHECK (qty_remaining_micros <= qty_opened_micros);

-- Update index names
ALTER INDEX idx_position_lots_remaining RENAME TO idx_position_lots_qty_remaining;

COMMENT ON COLUMN position_lots.entry_price_yes_pts IS 'Entry price of this lot in YES probability points';
COMMENT ON COLUMN position_lots.qty_opened_micros IS 'Original quantity when lot was opened';
COMMENT ON COLUMN position_lots.qty_remaining_micros IS 'Current remaining quantity (decreases as lot closes)';

-- ============================================================================
-- PHASE 6: Update Ledger Entries Comments
-- ============================================================================

COMMENT ON TABLE ledger_entries IS 'Double-entry bookkeeping ledger. All wallet balance changes recorded here.';
COMMENT ON COLUMN ledger_entries.wallet_id IS 'References wallets(id) - now correctly pointing to active wallets table';

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Run these after migration to verify:
-- SELECT COUNT(*) FROM wallets; -- Should be 22 (was wallet_accounts)
-- SELECT COUNT(*) FROM positions; -- Should match old positions_snapshot
-- SELECT COUNT(*) FROM position_lots;
-- SELECT COUNT(*) FROM trades WHERE price_yes_pts IS NOT NULL;
-- 
-- Check FK integrity:
-- SELECT constraint_name, table_name 
-- FROM information_schema.table_constraints 
-- WHERE constraint_type = 'FOREIGN KEY' 
-- AND table_name IN ('ledger_entries', 'position_lots', 'positions')
-- ORDER BY table_name;

COMMIT;

-- ============================================================================
-- ROLLBACK SCRIPT (if needed)
-- ============================================================================
/*
BEGIN;
-- Revert wallet changes
ALTER TABLE wallets RENAME TO wallet_accounts;
ALTER INDEX wallets_pkey RENAME TO wallet_accounts_pkey;
ALTER INDEX idx_wallets_user_id RENAME TO idx_wallet_accounts_user_id;
ALTER INDEX wallets_user_id_currency_key RENAME TO wallet_accounts_user_id_currency_key;

-- Revert positions changes
ALTER TABLE positions RENAME TO positions_snapshot;
ALTER TABLE positions RENAME COLUMN net_qty_micros TO net_contracts_micros;
ALTER TABLE positions RENAME COLUMN avg_open_price_yes_pts TO avg_entry_yes_pts;
ALTER INDEX positions_pkey RENAME TO positions_snapshot_pkey;
ALTER INDEX idx_positions_user RENAME TO idx_positions_snapshot_user;
ALTER INDEX idx_positions_nonzero RENAME TO idx_positions_snapshot_nonzero;

-- Revert position_lots changes
ALTER TABLE position_lots RENAME COLUMN entry_price_yes_pts TO entry_yes_pts;
ALTER TABLE position_lots RENAME COLUMN qty_opened_micros TO opened_contracts_micros;
ALTER TABLE position_lots RENAME COLUMN qty_remaining_micros TO remaining_contracts_micros;

-- Revert orders changes
ALTER TABLE orders RENAME COLUMN limit_price_yes_pts TO yes_pts;
ALTER TABLE orders RENAME COLUMN qty_remaining_micros TO remaining_contracts;
ALTER TABLE orders RENAME COLUMN qty_original_micros TO original_contracts;

-- Revert trades changes
ALTER TABLE trades RENAME COLUMN maker_user_id TO maker_id;
ALTER TABLE trades RENAME COLUMN taker_user_id TO taker_id;

COMMIT;
*/

-- ============================================================================
-- POST-MIGRATION CODE UPDATES NEEDED
-- ============================================================================
/*
1. Update PositionLotsService to use new column names:
   - entry_yes_pts → entry_price_yes_pts
   - remaining_contracts_micros → qty_remaining_micros
   - opened_contracts_micros → qty_opened_micros

2. Update positions.controller.ts to use:
   - positions (not positions_snapshot)
   - net_qty_micros (not net_contracts_micros)

3. Update wallet service to query wallets (not wallet_accounts)

4. Update matching engine trade insertion to use:
   - price_yes_pts, qty_micros, notional_pence
   - maker_user_id, taker_user_id

5. Update any orderbook queries to use:
   - limit_price_yes_pts (not yes_pts)
   - qty_remaining_micros (not remaining_contracts)

6. Search codebase for:
   - "wallet_accounts" → replace with "wallets"
   - "positions_snapshot" → replace with "positions"
   - "yes_pts" in orders context → "limit_price_yes_pts"
   - "remaining_contracts" → "qty_remaining_micros"
   - "maker_id", "taker_id" in trades → "maker_user_id", "taker_user_id"
*/
