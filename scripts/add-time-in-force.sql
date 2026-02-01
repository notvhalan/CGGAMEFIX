-- Add time_in_force column to orders table
-- This supports IOC (Immediate Or Cancel) orders for market orders

ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS time_in_force VARCHAR(10) DEFAULT 'GTC';

-- Add check constraint (drop first if exists to avoid duplicates)
ALTER TABLE orders 
DROP CONSTRAINT IF EXISTS orders_time_in_force_check;

ALTER TABLE orders 
ADD CONSTRAINT orders_time_in_force_check 
CHECK (time_in_force IN ('GTC', 'IOC'));

-- Add comment
COMMENT ON COLUMN orders.time_in_force IS 'Time in force: GTC (Good Till Cancelled) or IOC (Immediate Or Cancel)';

-- Create index for IOC orders (useful for cleanup queries)
CREATE INDEX IF NOT EXISTS idx_orders_time_in_force ON orders(time_in_force) WHERE status = 'OPEN';
