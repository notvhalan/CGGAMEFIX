/**
 * Polling utilities for async assertions.
 *
 * The Rust matching engine and clearing service process orders
 * asynchronously, so tests must poll for expected DB state.
 */

import { query } from './db';

const TIMEOUT = () => Number(process.env.POLL_TIMEOUT_MS ?? 10_000);
const INTERVAL = () => Number(process.env.POLL_INTERVAL_MS ?? 100);

/**
 * Poll a predicate until it returns true, or throw after timeout.
 */
export async function waitFor(
  predicate: () => Promise<boolean>,
  opts: { timeoutMs?: number; intervalMs?: number; label?: string } = {},
): Promise<void> {
  const deadline = Date.now() + (opts.timeoutMs ?? TIMEOUT());
  const interval = opts.intervalMs ?? INTERVAL();

  while (Date.now() < deadline) {
    if (await predicate()) return;
    await sleep(interval);
  }

  throw new Error(`waitFor timed out${opts.label ? `: ${opts.label}` : ''}`);
}

/**
 * Wait until the trades table has at least `count` rows for the given market.
 */
export async function waitForTradeCount(
  marketId: string,
  count: number,
  timeoutMs?: number,
): Promise<void> {
  await waitFor(
    async () => {
      const rows = await query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM trades WHERE market_id = $1`,
        [marketId],
      );
      return Number(rows[0].n) >= count;
    },
    { timeoutMs, label: `trades count >= ${count} for market ${marketId}` },
  );
}

/**
 * Wait until a specific order reaches one of the expected statuses.
 */
export async function waitForOrderStatus(
  orderId: string,
  expectedStatuses: string[],
  timeoutMs?: number,
): Promise<string> {
  let lastStatus = '';
  await waitFor(
    async () => {
      const rows = await query<{ status: string }>(
        `SELECT COALESCE(status::text, 'UNKNOWN') AS status FROM orders WHERE id = $1`,
        [orderId],
      );
      lastStatus = rows[0]?.status ?? 'NOT_FOUND';
      return expectedStatuses.includes(lastStatus);
    },
    { timeoutMs, label: `order ${orderId} status in [${expectedStatuses}]` },
  );
  return lastStatus;
}

/**
 * Wait for settlement record to exist for a market.
 */
export async function waitForSettlement(
  marketId: string,
  timeoutMs?: number,
): Promise<void> {
  await waitFor(
    async () => {
      const rows = await query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM market_settlements WHERE market_id = $1`,
        [marketId],
      );
      return Number(rows[0].n) >= 1;
    },
    { timeoutMs, label: `settlement exists for market ${marketId}` },
  );
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
