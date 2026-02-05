-- Clear all OPEN orders and release reserved balances
-- This should be run when switching from Node.js matching to Rust matching engine

BEGIN;

-- Get total reserved amount per user
CREATE TEMP TABLE user_reserves AS
SELECT user_id, SUM(liability_pence) as total_reserved
FROM orders
WHERE status = 'OPEN'
GROUP BY user_id;

-- Return reserved amounts to available balance
UPDATE wallets w
SET pence_reserved = pence_reserved - ur.total_reserved,
    pence_available = pence_available + ur.total_reserved
FROM user_reserves ur
WHERE w.user_id = ur.user_id;

-- Delete all open orders
DELETE FROM orders WHERE status = 'OPEN';

-- Log the cleanup
SELECT 'Cleared ' || COUNT(*) || ' users with reserved balances' as result
FROM user_reserves;

COMMIT;

-- Verify cleanup
SELECT 
    (SELECT COUNT(*) FROM orders WHERE status = 'OPEN') as remaining_open_orders,
    (SELECT SUM(pence_reserved) FROM wallets) as total_reserved_pence;
