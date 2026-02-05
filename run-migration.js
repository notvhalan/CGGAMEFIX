const { Pool } = require('./node_modules/.pnpm/pg@8.17.1/node_modules/pg');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'betting_exchange',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
  });

  try {
    console.log('Connected to database');

    const sql = fs.readFileSync(path.join(__dirname, 'scripts/migrate-order-side-naming.sql'), 'utf8');
    
    console.log('Running migration...');
    await pool.query(sql);
    
    console.log('✅ Migration completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
