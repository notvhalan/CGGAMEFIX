const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'betting_exchange',
  user: 'postgres',
  password: 'postgres',
});

async function clearData() {
  try {
    console.log('Clearing trades and orders...');
    
    // Delete all trades
    const tradesResult = await pool.query('DELETE FROM trades');
    console.log(`✅ Deleted ${tradesResult.rowCount} trades`);
    
    // Delete all orders
    const ordersResult = await pool.query('DELETE FROM orders');
    console.log(`✅ Deleted ${ordersResult.rowCount} orders`);
    
    console.log('✅ Data cleared successfully!');
  } catch (error) {
    console.error('❌ Error clearing data:', error);
  } finally {
    await pool.end();
  }
}

clearData();
