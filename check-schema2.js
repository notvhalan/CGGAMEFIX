const { Pool } = require('pg');
const p = new Pool({ host: 'localhost', port: 5432, database: 'betting_exchange', user: 'postgres', password: 'postgres' });

async function run() {
  for (const tbl of ['ledger_entries', 'fee_revenue', 'wallet_accounts', 'wallets', 'positions']) {
    const r = await p.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='${tbl}' ORDER BY ordinal_position`);
    console.log(`\n=== ${tbl} ===`);
    console.log(r.rows.map(x => x.column_name + ': ' + x.data_type).join('\n'));
    // Show a sample row
    try {
      const s = await p.query(`SELECT * FROM ${tbl} LIMIT 1`);
      if (s.rows.length) console.log('SAMPLE:', JSON.stringify(s.rows[0]));
      else console.log('(empty)');
    } catch(e) {}
  }
  await p.end();
}
run().catch(e => { console.error(e.message); p.end(); });
