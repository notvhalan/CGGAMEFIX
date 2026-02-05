const { Pool } = require('./node_modules/.pnpm/pg@8.17.1/node_modules/pg');

async function checkData() {
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'betting_exchange',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
  });

  try {
    console.log('Checking orders table...');
    const orders = await pool.query('SELECT side, COUNT(*) FROM orders GROUP BY side');
    console.log('Orders by side:', orders.rows);

    console.log('\nChecking trades table...');
    const trades = await pool.query('SELECT side, COUNT(*) FROM trades GROUP BY side');
    console.log('Trades by side:', trades.rows);

    console.log('\nUpdating any remaining FOR/LAY values...');
    await pool.query(`
      UPDATE orders SET side = 'BUY_YES'::order_side_new WHERE side::text = 'FOR';
      UPDATE orders SET side = 'SELL_YES'::order_side_new WHERE side::text = 'LAY';
      UPDATE trades SET side = 'BUY_YES'::order_side_new WHERE side::text = 'FOR';
      UPDATE trades SET side = 'SELL_YES'::order_side_new WHERE side::text = 'LAY';
    `);
    
    console.log('✅ Data updated!');
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkData();
