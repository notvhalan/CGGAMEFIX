const { Pool } = require('pg');
const p = new Pool({ connectionString: 'postgresql://postgres:postgres@localhost:5432/betting_exchange' });
(async () => {
  const uid = '97344faa-ff14-498e-af84-88639c24edf6';

  // Calculate expected lock from open orders
  const openOrders = await p.query(
    `SELECT COALESCE(SUM(liability_pence), 0)::bigint as total
     FROM orders
     WHERE user_id = $1 AND status IN ('OPEN', 'PARTIALLY_MATCHED')`, [uid]
  );
  const expectedLockPence = Number(openOrders.rows[0].total);

  const wallet = await p.query(
    `SELECT balance::text, locked_balance::text FROM wallets WHERE user_id = $1`, [uid]
  );
  const currentLock = parseFloat(wallet.rows[0].locked_balance);
  const expectedLock = expectedLockPence / 100;

  console.log(`Current locked: £${currentLock}, expected from open orders: £${expectedLock}`);
  console.log(`Leak: £${(currentLock - expectedLock).toFixed(2)}`);

  if (currentLock > expectedLock) {
    const r = await p.query(
      `UPDATE wallets SET locked_balance = $1, balance = balance + (locked_balance - $1), updated_at = NOW()
       WHERE user_id = $2 RETURNING balance::text, locked_balance::text`,
      [expectedLock.toFixed(2), uid]
    );
    console.log('Fixed:', r.rows[0]);
  } else {
    console.log('No fix needed');
  }

  await p.end();
})();
