const { Client } = require('pg');

async function migrateOrdersTable() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/betting_exchange',
  });

  try {
    await client.connect();
    console.log('Connected to database');

    await client.query('BEGIN');

    // Drop the old orders table
    console.log('Dropping old orders table...');
    await client.query('DROP TABLE IF EXISTS orders CASCADE');

    // Create new orders table with probability point columns
    console.log('Creating new orders table with probability points...');
    await client.query(`
      CREATE TABLE orders (
        id UUID PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        market_id UUID NOT NULL,
        outcome_id UUID,
        side VARCHAR(10) NOT NULL CHECK (side IN ('FOR', 'LAY')),
        p_pts INTEGER NOT NULL CHECK (p_pts >= 1 AND p_pts <= 9999999),
        stake_pence INTEGER NOT NULL CHECK (stake_pence > 0),
        status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'OPEN', 'MATCHED', 'PARTIALLY_MATCHED', 'CANCELLED', 'EXPIRED')),
        filled_pence INTEGER NOT NULL DEFAULT 0,
        remaining_pence INTEGER NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      
      CREATE INDEX idx_orders_user_id ON orders(user_id);
      CREATE INDEX idx_orders_market_id ON orders(market_id);
      CREATE INDEX idx_orders_status ON orders(status);
      CREATE INDEX idx_orders_market_status ON orders(market_id, status);
    `);

    await client.query('COMMIT');
    console.log('✅ Orders table migrated successfully!');
    console.log('New columns: p_pts, stake_pence, remaining_pence, filled_pence');
    console.log('New side values: FOR, LAY');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await client.end();
  }
}

migrateOrdersTable();
