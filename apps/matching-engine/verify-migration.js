const { Pool } = require('pg');

async function verify() {
  const pool = new Pool({
    connectionString: 'postgresql://postgres:postgres@localhost:5432/betting_exchange',
  });

  try {
    console.log('Verifying migration...\n');
    
    // Check orders table
    const ordersColumns = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'orders' 
      AND column_name IN ('p_pts', 'stake_pence', 'remaining_pence') 
      ORDER BY column_name
    `);
    
    console.log('✓ Orders table new columns:');
    ordersColumns.rows.forEach(row => {
      console.log(`  - ${row.column_name}: ${row.data_type}`);
    });
    
    // Check trades table
    const tradesColumns = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'trades' 
      AND column_name IN ('yes_price_pts', 'size_pence', 'maker_fee_pence', 'taker_fee_pence') 
      ORDER BY column_name
    `);
    
    console.log('\n✓ Trades table new columns:');
    tradesColumns.rows.forEach(row => {
      console.log(`  - ${row.column_name}: ${row.data_type}`);
    });
    
    // Check constraints
    const constraints = await pool.query(`
      SELECT constraint_name, table_name 
      FROM information_schema.table_constraints 
      WHERE table_name IN ('orders', 'trades') 
      AND constraint_name LIKE '%pts%' OR constraint_name LIKE '%pence%'
      ORDER BY table_name, constraint_name
    `);
    
    console.log('\n✓ New constraints:');
    constraints.rows.forEach(row => {
      console.log(`  - ${row.table_name}.${row.constraint_name}`);
    });
    
    console.log('\n✓ Migration verification complete!');
    
  } catch (error) {
    console.error('✗ Verification failed:', error.message);
  } finally {
    await pool.end();
  }
}

verify();
