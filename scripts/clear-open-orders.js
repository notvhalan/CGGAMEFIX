// Clear open orders and return reserved balances
// Run this with: node scripts/clear-open-orders.js

const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'betting_exchange',
  user: 'postgres',
  password: 'postgres',
});

async function clearOpenOrders() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Count orders before
    const countResult = await client.query("SELECT COUNT(*) FROM orders WHERE status = 'OPEN'");
    const countBefore = parseInt(countResult.rows[0].count);
    console.log(`Found ${countBefore} open orders`);
    
    // Create temp table with reserved amounts
    await client.query(`
      CREATE TEMP TABLE user_reserves AS
      SELECT user_id, SUM(liability_pence) as total_reserved
      FROM orders
      WHERE status = 'OPEN'
      GROUP BY user_id
    `);
    console.log('Created temp table with user reserves');
    
    // Return reserved amounts to available balance
    const updateResult = await client.query(`
      UPDATE wallets w
      SET pence_reserved = pence_reserved - ur.total_reserved,
          pence_available = pence_available + ur.total_reserved
      FROM user_reserves ur
      WHERE w.user_id = ur.user_id
    `);
    console.log(`Updated ${updateResult.rowCount} user wallets`);
    
    // Delete all open orders
    const deleteResult = await client.query("DELETE FROM orders WHERE status = 'OPEN'");
    console.log(`Deleted ${deleteResult.rowCount} open orders`);
    
    await client.query('COMMIT');
    console.log('✅ Successfully cleared all open orders and returned reserved balances');
    
    // Verify cleanup
    const verifyCount = await client.query("SELECT COUNT(*) FROM orders WHERE status = 'OPEN'");
    console.log(`Remaining open orders: ${verifyCount.rows[0].count}`);
    
    const verifyReserved = await client.query("SELECT COALESCE(SUM(pence_reserved), 0) as total FROM wallets");
    console.log(`Total reserved pence: ${verifyReserved.rows[0].total}`);
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Transaction rolled back due to error:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

clearOpenOrders().catch(console.error);
