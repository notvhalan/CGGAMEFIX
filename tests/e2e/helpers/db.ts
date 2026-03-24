/**
 * Direct Postgres connection for DB assertions in E2E tests.
 * Tests use this to verify state that the API doesn't expose,
 * and to seed/teardown data that the API can't create (e.g. markets).
 */

import pg from 'pg';

const { Client } = pg;

let client: InstanceType<typeof Client> | null = null;

export async function getDb(): Promise<InstanceType<typeof Client>> {
  if (client) return client;
  client = new Client({
    connectionString: process.env.DATABASE_URL,
  });
  await client.connect();
  return client;
}

export async function closeDb(): Promise<void> {
  if (client) {
    await client.end();
    client = null;
  }
}

/**
 * Run a parameterised query and return the rows.
 */
export async function query<T extends Record<string, any> = Record<string, any>>(
  sql: string,
  params: any[] = [],
): Promise<T[]> {
  const db = await getDb();
  const result = await db.query(sql, params);
  return result.rows as T[];
}

/**
 * Run a parameterised query and return the first row, or null.
 */
export async function queryOne<T extends Record<string, any> = Record<string, any>>(
  sql: string,
  params: any[] = [],
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

/**
 * Reset all test-affected tables. Run this in beforeEach/beforeAll.
 *
 * The order matters because of foreign key constraints.
 * We delete in dependency-reverse order.
 */
export async function resetDatabase(): Promise<void> {
  const db = await getDb();

  await db.query(`
    -- Settlements
    DELETE FROM user_settlements    WHERE 1=1;
    DELETE FROM market_settlements  WHERE 1=1;

    -- Trading artefacts
    DELETE FROM trade_settlements   WHERE 1=1;
    DELETE FROM fee_revenue         WHERE 1=1;
    DELETE FROM position_lots       WHERE 1=1;
    DELETE FROM positions           WHERE 1=1;
    DELETE FROM price_bars_100ms    WHERE 1=1;
    DELETE FROM trades              WHERE 1=1;
    DELETE FROM orders              WHERE 1=1;
    DELETE FROM ledger_entries      WHERE 1=1;

    -- Wallets, markets, users
    DELETE FROM wallets             WHERE 1=1;
    DELETE FROM markets             WHERE 1=1;
    DELETE FROM users               WHERE email LIKE '%@e2e-test.local';
  `);
}

/**
 * Lighter cleanup: remove trading data but keep users/wallets/markets.
 */
export async function resetTradingData(): Promise<void> {
  const db = await getDb();
  await db.query(`
    DELETE FROM user_settlements    WHERE 1=1;
    DELETE FROM market_settlements  WHERE 1=1;
    DELETE FROM trade_settlements   WHERE 1=1;
    DELETE FROM fee_revenue         WHERE 1=1;
    DELETE FROM position_lots       WHERE 1=1;
    DELETE FROM positions           WHERE 1=1;
    DELETE FROM price_bars_100ms    WHERE 1=1;
    DELETE FROM trades              WHERE 1=1;
    DELETE FROM orders              WHERE 1=1;
  `);
}
