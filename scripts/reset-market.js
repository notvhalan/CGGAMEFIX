// Reset market status script - uses root pg dependency
const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'betting_exchange',
  user: 'postgres',
  password: 'postgres',
});

async function resetMarket() {
  const client = await pool.connect();
  try {
    const marketId = '550e8400-e29b-41d4-a716-446655440001';
    
    console.log(`Resetting market ${marketId} to ACTIVE...`);
    
    const result = await client.query(
      `UPDATE markets 
       SET status = 'ACTIVE',
           settlement_time = NULL,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, name, status, settlement_time`,
      [marketId]
    );
    
    if (result.rows.length > 0) {
      console.log('✅ Market reset successfully:');
      console.log(result.rows[0]);
    } else {
      console.log('❌ Market not found');
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

resetMarket();
