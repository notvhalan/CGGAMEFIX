const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/betting_exchange'
});

async function clearData() {
  const client = await pool.connect();
  try {
    console.log('Starting to clear orders and trades...');
    
    await client.query('BEGIN');
    
    // Delete all trades first (foreign key constraints)
    const tradesResult = await client.query('DELETE FROM trades');
    console.log(`Deleted ${tradesResult.rowCount} trades`);
    
    // Delete all orders
    const ordersResult = await client.query('DELETE FROM orders');
    console.log(`Deleted ${ordersResult.rowCount} orders`);
    
    // Optional: Reset fee revenue
    const feeResult = await client.query('DELETE FROM fee_revenue');
    console.log(`Deleted ${feeResult.rowCount} fee revenue records`);
    
    await client.query('COMMIT');
    
    console.log('\n✅ Successfully cleared all data!');
    
    // Verify
    const verification = await client.query(`
      SELECT 'Orders' as table_name, COUNT(*) as count FROM orders
      UNION ALL
      SELECT 'Trades' as table_name, COUNT(*) as count FROM trades
      UNION ALL
      SELECT 'Fee Revenue' as table_name, COUNT(*) as count FROM fee_revenue
    `);
    
    console.log('\nVerification:');
    verification.rows.forEach(row => {
      console.log(`  ${row.table_name}: ${row.count} records`);
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error clearing data:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

clearData()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
