-- Fix wallet currency and clean up old locked balances
-- This script converts all USD wallets to GBP and unlocks any orphaned locked balances

BEGIN;

-- Update all USD wallets to GBP
UPDATE wallets 
SET currency = 'GBP' 
WHERE currency = 'USD';

-- For any wallets with locked_balance but no corresponding OPEN/PARTIALLY_MATCHED orders,
-- release the locked balance back to available balance
UPDATE wallets w
SET 
    balance = balance + locked_balance,
    locked_balance = 0,
    updated_at = NOW()
WHERE locked_balance > 0
  AND NOT EXISTS (
    SELECT 1 FROM orders o
    WHERE o.user_id = w.user_id 
      AND o.status IN ('OPEN', 'PARTIALLY_MATCHED')
  );

-- Log the results
SELECT 
    user_id,
    currency,
    balance,
    locked_balance
FROM wallets
ORDER BY user_id;

COMMIT;
