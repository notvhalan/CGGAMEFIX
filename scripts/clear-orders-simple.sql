-- Simple SQL to clear open orders
-- Copy and paste this into pgAdmin or any PostgreSQL client

BEGIN;

-- Return reserved balances to users
WITH user_reserves AS (
    SELECT user_id, SUM(liability_pence) as total_reserved
    FROM orders
    WHERE status = 'OPEN'
    GROUP BY user_id
)
UPDATE wallets w
SET pence_reserved = pence_reserved - ur.total_reserved,
    pence_available = pence_available + ur.total_reserved
FROM user_reserves ur
WHERE w.user_id = ur.user_id;

-- Delete all open orders
DELETE FROM orders WHERE status = 'OPEN';

COMMIT;

-- Verify cleanup
SELECT 'Open orders remaining:' as info, COUNT(*) as count FROM orders WHERE status = 'OPEN';
SELECT 'Total reserved pence:' as info, COALESCE(SUM(pence_reserved), 0) as amount FROM wallets;
