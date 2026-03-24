/**
 * Scenario B — Partial Fill
 *
 * • A places BUY YES with larger size (£20)
 * • B places SELL YES with smaller size (£10) → partial fill
 * • Verify: trade exists, A's order remains PARTIALLY_MATCHED,
 *   remainder stays on book (GTC), locked funds correct.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getDb, closeDb, query } from './helpers/db';
import { createUserWithWallet } from './helpers/users';
import { createOpenBinaryMarket } from './helpers/markets';
import { placeOrderAs } from './helpers/orders';
import { waitForTradeCount, waitForOrderStatus } from './helpers/wait';
import { assertSystemReconciles, getWalletBalances } from './helpers/reconcile';
import { TestApiClient } from './helpers/api-client';

describe('Scenario B — Partial Fill', () => {
  let userA: TestApiClient;
  let userB: TestApiClient;
  let marketId: string;

  const PRICE_PTS = 5_000_000; // 50%
  const BIG_RISK  = 2_000;     // £20
  const SMALL_RISK = 1_000;    // £10

  beforeAll(async () => {
    await getDb();
    userA = await createUserWithWallet({ balancePounds: 100 });
    userB = await createUserWithWallet({ balancePounds: 100 });
    const market = await createOpenBinaryMarket({ name: 'Partial Fill E2E' });
    marketId = market.id;
  });

  afterAll(async () => {
    await closeDb();
  });

  it('partially fills when taker is smaller than maker', async () => {
    // ── 1. A places large BUY YES (£20 at 50%) ─────────────
    const buyResult = await placeOrderAs(userA, {
      marketId,
      side: 'BUY_YES',
      pPts: PRICE_PTS,
      liabilityPence: BIG_RISK,
    });
    const buyOrderId = buyResult.orderId;

    // Initially OPEN on the book
    await waitForOrderStatus(buyOrderId, ['OPEN']);

    // ── 2. B places smaller SELL YES (£10 at 50%) ───────────
    const sellResult = await placeOrderAs(userB, {
      marketId,
      side: 'SELL_YES',
      pPts: PRICE_PTS,
      liabilityPence: SMALL_RISK,
    });
    const sellOrderId = sellResult.orderId;

    // ── 3. Wait for trade ───────────────────────────────────
    await waitForTradeCount(marketId, 1);

    // ── 4. Verify: trade row exists ─────────────────────────
    const trades = await query(
      `SELECT qty_micros FROM trades WHERE market_id = $1`,
      [marketId],
    );
    expect(trades.length).toBe(1);
    expect(Number(trades[0].qty_micros)).toBeGreaterThan(0);

    // ── 5. Verify: A's order is PARTIALLY_MATCHED ───────────
    await waitForOrderStatus(buyOrderId, [
      'PARTIALLY_MATCHED',
      'OPEN',   // could still show OPEN if engine hasn't updated yet
    ]);
    // The order should have remaining qty
    const buyOrder = await query<{
      status: string;
      qty_original_micros: string;
      qty_remaining_micros: string;
    }>(
      `SELECT status::text AS status,
              qty_original_micros::text,
              qty_remaining_micros::text
       FROM orders WHERE id = $1`,
      [buyOrderId],
    );
    const orig = BigInt(buyOrder[0].qty_original_micros);
    const remaining = BigInt(buyOrder[0].qty_remaining_micros);
    expect(remaining).toBeGreaterThan(0n);
    expect(remaining).toBeLessThan(orig);

    // ── 6. Verify: B's order is fully filled ────────────────
    const sellStatus = await waitForOrderStatus(sellOrderId, [
      'MATCHED',
      'FILLED',
    ]);
    expect(['MATCHED', 'FILLED']).toContain(sellStatus);

    // ── 7. Verify: remainder stays on the book (GTC) ────────
    const openOnBook = await query(
      `SELECT id FROM orders
       WHERE id = $1 AND status IN ('OPEN', 'PARTIALLY_MATCHED')`,
      [buyOrderId],
    );
    expect(openOnBook.length).toBe(1);

    // ── 8. Verify: A still has locked funds for the remainder
    const wallets = await getWalletBalances([userA.userId]);
    expect(wallets[userA.userId].lockedBalance).toBeGreaterThan(0);

    // ── 9. Reconciliation ───────────────────────────────────
    await assertSystemReconciles();
  });
});
