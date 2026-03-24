/**
 * Market creation helper.
 *
 * There is no public API to create a market, so we insert directly
 * into Postgres. This is the one place the tests touch the DB for
 * write-side setup (everything else goes through the API).
 */

import { randomUUID } from 'crypto';
import { query, queryOne } from './db';

export interface TestMarket {
  id: string;
  name: string;
}

/**
 * Create an ACTIVE binary market ready for trading.
 */
export async function createOpenBinaryMarket(opts: {
  name?: string;
} = {}): Promise<TestMarket> {
  const id = randomUUID();
  const name = opts.name ?? `E2E Test Market ${id.slice(0, 8)}`;

  await query(
    `INSERT INTO markets (
       id, name, description, type, status, event_id,
       outcomes, start_time, min_stake, max_stake
     ) VALUES (
       $1, $2, 'Auto-generated E2E market', 'BINARY', 'ACTIVE',
       $3, '{YES,NO}', NOW(), 1.00, 10000.00
     )`,
    [id, name, randomUUID()],
  );

  return { id, name };
}

/**
 * Read a market row by id.
 */
export async function getMarket(marketId: string) {
  return queryOne<{ id: string; status: string; name: string }>(
    `SELECT id, status, name FROM markets WHERE id = $1`,
    [marketId],
  );
}
