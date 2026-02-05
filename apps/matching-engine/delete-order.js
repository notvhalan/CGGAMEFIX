const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres:postgres@localhost:5432/betting_exchange'
});

async function run() {
  try {
    // First, show all open orders
    const orders = await pool.query(`
      SELECT id, side, 
             limit_price_yes_pts/10000000.0 as price_pct, 
             qty_remaining_micros/1000000.0 as contracts, 
             status 
      FROM orders 
      WHERE status = 'OPEN' 
      ORDER BY limit_price_yes_pts
    `);
    
    console.log('\n=== Open Orders ===');
    orders.rows.forEach(order => {
      console.log(`ID: ${order.id}, Side: ${order.side}, Price: ${order.price_pct}%, Contracts: ${order.contracts}`);
    });

    // Delete the 55% order with ~18.18 contracts
    const deleteResult = await pool.query(`
      DELETE FROM orders 
      WHERE limit_price_yes_pts = 5500000 
        AND ABS(qty_remaining_micros - 18180000) < 10000
      RETURNING id, side, limit_price_yes_pts, qty_remaining_micros
    `);

    if (deleteResult.rows.length > 0) {
      console.log('\n✅ Deleted order:', deleteResult.rows[0]);
    } else {
      console.log('\n❌ No order found matching 55% with ~18.18 contracts');
    }

    await pool.end();
  } catch (err) {
    console.error('Error:', err);
    await pool.end();
  }
}

run();
