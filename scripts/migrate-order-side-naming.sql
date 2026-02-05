-- Migration: Rename OrderSide from FOR/LAY to BUY_YES/SELL_YES
-- Run this migration to align internal representation with frontend display

BEGIN;

-- Add new 'side' enum type
CREATE TYPE order_side_new AS ENUM ('BUY_YES', 'SELL_YES');

-- Add temporary column with new type
ALTER TABLE orders ADD COLUMN side_new order_side_new;

-- Migrate data
UPDATE orders SET side_new = 
  CASE 
    WHEN side = 'FOR' OR side = 'BACK' THEN 'BUY_YES'::order_side_new
    WHEN side = 'LAY' THEN 'SELL_YES'::order_side_new
  END;

-- Verify migration (should return 0)
SELECT COUNT(*) FROM orders WHERE side_new IS NULL;

-- Drop old column and rename new one
ALTER TABLE orders DROP COLUMN side;
ALTER TABLE orders RENAME COLUMN side_new TO side;

-- Make side NOT NULL
ALTER TABLE orders ALTER COLUMN side SET NOT NULL;

-- Same for trades table (taker side)
ALTER TABLE trades ADD COLUMN side_new order_side_new;

UPDATE trades SET side_new = 
  CASE 
    WHEN side = 'FOR' OR side = 'BACK' THEN 'BUY_YES'::order_side_new
    WHEN side = 'LAY' THEN 'SELL_YES'::order_side_new
  END;

ALTER TABLE trades DROP COLUMN side;
ALTER TABLE trades RENAME COLUMN side_new TO side;
ALTER TABLE trades ALTER COLUMN side SET NOT NULL;

-- Update any position_lots if they use side
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'position_lots' AND column_name = 'side') THEN
    ALTER TABLE position_lots ADD COLUMN side_new order_side_new;
    
    UPDATE position_lots SET side_new = 
      CASE 
        WHEN side = 'FOR' OR side = 'BACK' THEN 'BUY_YES'::order_side_new
        WHEN side = 'LAY' THEN 'SELL_YES'::order_side_new
      END;
    
    ALTER TABLE position_lots DROP COLUMN side;
    ALTER TABLE position_lots RENAME COLUMN side_new TO side;
    ALTER TABLE position_lots ALTER COLUMN side SET NOT NULL;
  END IF;
END $$;

COMMIT;

-- Verification queries
SELECT 'Orders with new side values:' as check_name, side, COUNT(*) 
FROM orders 
GROUP BY side;

SELECT 'Trades with new side values:' as check_name, side, COUNT(*) 
FROM trades 
GROUP BY side;

-- Expected output:
-- BUY_YES (was FOR/BACK)
-- SELL_YES (was LAY)
