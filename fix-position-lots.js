const { Pool } = require('./node_modules/.pnpm/pg@8.17.1/node_modules/pg');

async function fixPositionLots() {
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'betting_exchange',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
  });

  try {
    console.log('Checking position_lots table...');
    
    // Check if side column exists and has old values
    const result = await pool.query(`
      SELECT side, COUNT(*) 
      FROM position_lots 
      WHERE side IS NOT NULL
      GROUP BY side
    `);
    console.log('Position lots by side:', result.rows);

    if (result.rows.some(r => r.side === 'FOR' || r.side === 'LAY')) {
      console.log('\nUpdating position_lots FOR/LAY values...');
      await pool.query(`
        UPDATE position_lots 
        SET side = CASE 
          WHEN side::text = 'FOR' THEN 'BUY_YES'::order_side_new
          WHEN side::text = 'LAY' THEN 'SELL_YES'::order_side_new
          ELSE side
        END
        WHERE side::text IN ('FOR', 'LAY')
      `);
      console.log('✅ Position lots updated!');
    } else {
      console.log('✅ No FOR/LAY values found in position_lots');
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

fixPositionLots();
