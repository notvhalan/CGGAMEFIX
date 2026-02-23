const { Pool } = require('pg');
const p = new Pool({ host: 'localhost', port: 5432, database: 'betting_exchange', user: 'postgres', password: 'postgres' });

async function run() {
  const tables = await p.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name");
  console.log('=== TABLES ===');
  console.log(tables.rows.map(x => x.table_name).join('\n'));

  // Check wallet_transactions
  try {
    const wt = await p.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='wallet_transactions' ORDER BY ordinal_position");
    console.log('\n=== wallet_transactions columns ===');
    console.log(wt.rows.map(x => x.column_name + ': ' + x.data_type).join('\n'));
  } catch(e) { console.log('wallet_transactions not found'); }

  // Check position_lots
  try {
    const pl = await p.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='position_lots' ORDER BY ordinal_position");
    console.log('\n=== position_lots columns ===');
    console.log(pl.rows.map(x => x.column_name + ': ' + x.data_type).join('\n'));
  } catch(e) { console.log('position_lots not found'); }

  // Check trades
  try {
    const tr = await p.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='trades' ORDER BY ordinal_position");
    console.log('\n=== trades columns ===');
    console.log(tr.rows.map(x => x.column_name + ': ' + x.data_type).join('\n'));
  } catch(e) { console.log('trades not found'); }

  await p.end();
}
run().catch(e => { console.error(e.message); p.end(); });
