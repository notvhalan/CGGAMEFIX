const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/betting_exchange',
});

async function run() {
  const client = await pool.connect();
  try {
    // Find all E2E + Benchmark markets (never touch "Test Market")
    const toDelete = await client.query(`
      SELECT id, name FROM markets
      WHERE (name LIKE '%E2E%' OR name LIKE 'Benchmark Market%')
      ORDER BY name
    `);

    console.log(`Markets to delete (${toDelete.rows.length}):`);
    toDelete.rows.forEach(r => console.log('  ' + r.name));

    if (toDelete.rows.length === 0) {
      console.log('Nothing to delete.');
      return;
    }

    const ids = toDelete.rows.map(r => r.id);

    await client.query('BEGIN');

    // Delete dependent rows first (child tables referencing markets)
    const tables = [
      'synthetic_order_legs',
      'trades',
      'orders',
      'positions',
      'price_bars',
      'price_bars_100ms',
    ];

    for (const tbl of tables) {
      const exists = await client.query(
        `SELECT 1 FROM information_schema.tables WHERE table_name = $1 AND table_schema = 'public'`,
        [tbl]
      );
      if (exists.rows.length > 0) {
        const colExists = await client.query(
          `SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = 'market_id' AND table_schema = 'public'`,
          [tbl]
        );
        if (colExists.rows.length > 0) {
          const res = await client.query(
            `DELETE FROM ${tbl} WHERE market_id = ANY($1)`,
            [ids]
          );
          console.log(`Deleted ${res.rowCount} rows from ${tbl}`);
        }
      }
    }

    // Delete the markets themselves
    const del = await client.query(
      `DELETE FROM markets WHERE id = ANY($1)`,
      [ids]
    );
    console.log(`Deleted ${del.rowCount} markets`);

    await client.query('COMMIT');
    console.log('Done.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error, rolled back:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
