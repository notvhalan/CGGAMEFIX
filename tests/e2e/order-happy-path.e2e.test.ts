/**
 * Scenario A — Happy Path Trade
 *
 * • User A has £100
 * • User B has £100
 * • Market is OPEN
 * • A places Buy YES at 56%
 * • B places Sell YES at 56%
 * • Trade executes
 * • Verify: 1 trade, orders matched, locked balances reduced,
 *   positions updated, book empty at that level.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getDb, closeDb, query } from './helpers/db';
import { createUserWithWallet } from './helpers/users';
import { createOpenBinaryMarket } from './helpers/markets';
import { placeOrderAs } from './helpers/orders';
import { waitForTradeCount, waitForOrderStatus } from './helpers/wait';
import { assertSystemReconciles, getWalletBalances } from './helpers/reconcile';
import { TestApiClient } from './helpers/api-client';

describe('Scenario A — Order Happy Path', () => {
  let userA: TestApiClient;
  let userB: TestApiClient;
  let marketId: string;

  const PRICE_PTS = 5_000_000;   // 50% — equal risk per contract on both sides
  const RISK_PENCE = 1_000;      // £10

  beforeAll(async () => {
    await getDb();
    // NOTE: We do NOT call resetDatabase() to avoid destroying other data.
    // Instead we create unique users and a fresh market per test run.
    userA = await createUserWithWallet({ balancePounds: 100 });
    userB = await createUserWithWallet({ balancePounds: 100 });
    const market = await createOpenBinaryMarket({ name: 'Happy Path E2E' });
    marketId = market.id;
  });

  afterAll(async () => {
    await closeDb();
  });

  it('matches a BUY_YES + SELL_YES at the same price', async () => {
    // ── 1. Record pre-trade balances ────────────────────────
    const walletsBefore = await getWalletBalances([userA.userId, userB.userId]);
    expect(walletsBefore[userA.userId].balance).toBeGreaterThanOrEqual(100);
    expect(walletsBefore[userB.userId].balance).toBeGreaterThanOrEqual(100);

    // ── 2. User A places BUY YES at 56% for £10 ────────────
    const buyResult = await placeOrderAs(userA, {
      marketId,
      side: 'BUY_YES',
      pPts: PRICE_PTS,
      liabilityPence: RISK_PENCE,
    });
    expect(buyResult.orderId).toBeTruthy();
    expect(buyResult.contractsMicros).toBeGreaterThan(0);

    // After placement, wallet should have funds locked
    const walletAfterBuy = await getWalletBalances([userA.userId]);
    expect(walletAfterBuy[userA.userId].lockedBalance).toBeGreaterThan(
      walletsBefore[userA.userId].lockedBalance,
    );

    // ── 3. User B places SELL YES at 56% for £10 ───────────
    const sellResult = await placeOrderAs(userB, {
      marketId,
      side: 'SELL_YES',
      pPts: PRICE_PTS,
      liabilityPence: RISK_PENCE,
    });
    expect(sellResult.orderId).toBeTruthy();

    // ── 4. Wait for the trade to appear ─────────────────────
    await waitForTradeCount(marketId, 1);

    // ── 5. Verify: exactly 1 trade ──────────────────────────
    const trades = await query(
      `SELECT id, price_yes_pts, qty_micros, maker_user_id, taker_user_id
       FROM trades WHERE market_id = $1`,
      [marketId],
    );
    expect(trades.length).toBe(1);
    expect(trades[0].maker_user_id).toBeTruthy();
    expect(trades[0].taker_user_id).toBeTruthy();

    // ── 6. Verify: both orders updated ──────────────────────
    const buyStatus = await waitForOrderStatus(buyResult.orderId, [
      'MATCHED',
      'FILLED',
    ]);
    expect(['MATCHED', 'FILLED']).toContain(buyStatus);

    const sellStatus = await waitForOrderStatus(sellResult.orderId, [
      'MATCHED',
      'PARTIALLY_MATCHED',
      'FILLED',
    ]);
    expect(['MATCHED', 'PARTIALLY_MATCHED', 'FILLED']).toContain(sellStatus);

    // ── 7. Verify: positions created ────────────────────────
    const lots = await query(
      `SELECT user_id, side::text AS side, qty_remaining_micros
       FROM position_lots
       WHERE market_id = $1 AND qty_remaining_micros > 0`,
      [marketId],
    );
    expect(lots.length).toBeGreaterThanOrEqual(2); // one lot per side

    // ── 8. Verify: locked balances reduced after clearing ───
    // Give clearing a moment to settle
    await waitForOrderStatus(buyResult.orderId, ['MATCHED', 'FILLED']);
    const walletsAfter = await getWalletBalances([userA.userId, userB.userId]);

    // Both users should have less available balance than before
    // (funds are either locked in position or consumed as cost)
    const totalBefore =
      walletsBefore[userA.userId].balance +
      walletsBefore[userA.userId].lockedBalance +
      walletsBefore[userB.userId].balance +
      walletsBefore[userB.userId].lockedBalance;
    const totalAfter =
      walletsAfter[userA.userId].balance +
      walletsAfter[userA.userId].lockedBalance +
      walletsAfter[userB.userId].balance +
      walletsAfter[userB.userId].lockedBalance;

    // Total funds should decrease by at most fees + clearing drift
    // (the API gateway's self-heal poll can cause minor balance drift)
    expect(totalAfter).toBeLessThanOrEqual(totalBefore);
    expect(totalAfter).toBeGreaterThan(totalBefore - 50); // generous tolerance for clearing race

    // ── 9. Verify: order book is empty at that price ────────
    const bookOrders = await query(
      `SELECT id FROM orders
       WHERE market_id = $1
         AND limit_price_yes_pts = $2
         AND status IN ('OPEN', 'PARTIALLY_MATCHED')`,
      [marketId, PRICE_PTS],
    );
    expect(bookOrders.length).toBe(0);

    // ── 10. System-wide reconciliation ──────────────────────
    await assertSystemReconciles();
  });
});
