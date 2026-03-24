/**
 * Scenario C — Cancel Order
 *
 * • A places an unmatched BUY YES order
 * • A cancels it
 * • Verify: order → CANCELLED, remaining = 0,
 *   locked funds released, book cleared.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getDb, closeDb, query } from './helpers/db';
import { createUserWithWallet } from './helpers/users';
import { createOpenBinaryMarket } from './helpers/markets';
import { placeOrderAs, cancelOrderAs } from './helpers/orders';
import { waitForOrderStatus, sleep } from './helpers/wait';
import { assertSystemReconciles, getWalletBalances } from './helpers/reconcile';
import { TestApiClient } from './helpers/api-client';

describe('Scenario C — Cancel Order', () => {
  let userA: TestApiClient;
  let marketId: string;

  const PRICE_PTS = 3_000_000; // 30% — unlikely to match
  const RISK_PENCE = 1_000;    // £10

  beforeAll(async () => {
    await getDb();
    userA = await createUserWithWallet({ balancePounds: 100 });
    const market = await createOpenBinaryMarket({ name: 'Cancel Order E2E' });
    marketId = market.id;
  });

  afterAll(async () => {
    await closeDb();
  });

  it('cancels an unmatched order and releases locked funds', async () => {
    // ── 1. Record balance before ────────────────────────────
    const walletBefore = await getWalletBalances([userA.userId]);
    const balanceBefore = walletBefore[userA.userId].balance;
    const lockedBefore = walletBefore[userA.userId].lockedBalance;

    // ── 2. Place order ──────────────────────────────────────
    const result = await placeOrderAs(userA, {
      marketId,
      side: 'BUY_YES',
      pPts: PRICE_PTS,
      liabilityPence: RISK_PENCE,
    });
    const orderId = result.orderId;

    // Wait for it to land on the book
    await waitForOrderStatus(orderId, ['OPEN']);

    // Balance should now have funds locked
    const walletAfterPlace = await getWalletBalances([userA.userId]);
    expect(walletAfterPlace[userA.userId].lockedBalance).toBeGreaterThan(lockedBefore);

    // ── 3. Cancel the order ─────────────────────────────────
    const cancelResult = await cancelOrderAs(userA, orderId);
    expect(cancelResult.orderId).toBe(orderId);

    // ── 4. Wait for CANCELLED status ────────────────────────
    await waitForOrderStatus(orderId, ['CANCELLED']);

    // ── 5. Verify: remaining qty is 0 ───────────────────────
    const order = await query<{ qty_remaining_micros: string; status: string }>(
      `SELECT qty_remaining_micros::text, status::text AS status
       FROM orders WHERE id = $1`,
      [orderId],
    );
    expect(order[0].status).toBe('CANCELLED');
    expect(BigInt(order[0].qty_remaining_micros)).toBe(0n);

    // ── 6. Verify: locked funds released ────────────────────
    // Give the engine a moment to release
    await sleep(500);
    const walletAfterCancel = await getWalletBalances([userA.userId]);

    // Locked balance should be back to what it was before placement
    expect(walletAfterCancel[userA.userId].lockedBalance).toBeCloseTo(lockedBefore, 1);

    // Available balance should be restored (minus any tiny rounding)
    expect(walletAfterCancel[userA.userId].balance).toBeCloseTo(balanceBefore, 1);

    // ── 7. Verify: order not on the book ────────────────────
    const onBook = await query(
      `SELECT id FROM orders
       WHERE id = $1 AND status IN ('OPEN', 'PARTIALLY_MATCHED')`,
      [orderId],
    );
    expect(onBook.length).toBe(0);

    // ── 8. Reconciliation ───────────────────────────────────
    await assertSystemReconciles();
  });

  it('rejects cancellation of another user\'s order', async () => {
    // Create a second user
    const userB = await createUserWithWallet({ balancePounds: 50 });

    // A places an order
    const result = await placeOrderAs(userA, {
      marketId,
      side: 'BUY_YES',
      pPts: 2_000_000, // 20%
      liabilityPence: 500,
    });

    await waitForOrderStatus(result.orderId, ['OPEN']);

    // B tries to cancel A's order — should fail
    try {
      await cancelOrderAs(userB, result.orderId);
      // If we get here, the cancel didn't throw — check the order is still open
      const order = await query<{ status: string }>(
        `SELECT status::text AS status FROM orders WHERE id = $1`,
        [result.orderId],
      );
      // The order should still be OPEN (cancel was rejected or ignored)
      expect(['OPEN', 'PARTIALLY_MATCHED']).toContain(order[0].status);
    } catch (err: any) {
      // Expected: the API rejected the cancel
      expect(err.message).toMatch(/failed|not found|denied|unauthorized/i);
    }
  });
});
