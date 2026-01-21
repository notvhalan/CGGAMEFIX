-- Clear all orders and trades data
-- Use this to reset the market data for testing

BEGIN;

-- Delete all trades first (foreign key constraints)
DELETE FROM trades;

-- Delete all orders
DELETE FROM orders;

-- Optional: Reset fee revenue
DELETE FROM fee_revenue;

COMMIT;

-- Verify deletion
SELECT 'Orders remaining:' as info, COUNT(*) as count FROM orders
UNION ALL
SELECT 'Trades remaining:' as info, COUNT(*) as count FROM trades
UNION ALL
SELECT 'Fee revenue records:' as info, COUNT(*) as count FROM fee_revenue;
