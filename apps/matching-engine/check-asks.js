const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres:postgres@localhost:5432/betting_exchange'
});

async function run() {
  try {
    const result = await pool.query(`
      SELECT id, side, status, 
             limit_price_yes_pts/10000000.0 as price_pct, 
             qty_remaining_micros/1000000.0 as contracts,
             created_at
      FROM orders 
      WHERE market_id = '550e8400-e29b-41d4-a716-446655440001' 
        AND side::text = 'SELL_YES' 
      ORDER BY limit_price_yes_pts ASC 
      LIMIT 10
    `);
    
    console.log('\n=== SELL_YES orders in database ===');
    result.rows.forEach(order => {
      console.log(`Price: ${order.price_pct}%, Contracts: ${order.contracts}, Status: ${order.status}, Created: ${order.created_at}`);
    });

    await pool.end();
  } catch (err) {
    console.error('Error:', err);
    await pool.end();
  }
}

run();
