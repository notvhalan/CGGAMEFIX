/**
 * Cashout E2E Test — Close Position
 *
 * Verifies that calling cashout execute on an open long YES position:
 *   1. Fills the IOC SELL_YES close order against a resting counterparty
 *   2. Credits the user's wallet with the correct net proceeds
 *   3. Reduces position lots to zero
 *
 * Key constants (50% price):
 *   contracts = liability × PRICE_SCALE × CONTRACT_SCALE
 *             / (pPts × CONTRACT_PAYOUT_PENCE)
 *           = 1000p × 10_000_000 × 1_000_000 / (5_000_000 × 100)
 *           = 20_000_000 micros
 *
 *   Close proceeds at 50% = 1000p.  Fee = floor(1000/1000) = 1p.
 *   netValuePence ≈ 999p (i.e. UserA's available balance increases ~£9.99).
 *
 * Scenario:
 *   UserA  → BUY_YES  at 50% for £10  (long YES, opens position)
 *   UserB  → SELL_YES at 50% for £10  (matched counterparty for opening trade)
 *   UserC  → BUY_YES  at 50% for £10  (resting bid, counterparty for cashout)
 *   UserA  → cashoutExecute            (IOC SELL_YES against UserC's resting bid)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getDb, closeDb, query } from './helpers/db';
import { createUserWithWallet } from './helpers/users';
import { createOpenBinaryMarket } from './helpers/markets';
import { placeOrderAs } from './helpers/orders';
import { waitForTradeCount, waitForOrderStatus, waitFor } from './helpers/wait';
import { assertSystemReconciles, getWalletBalances } from './helpers/reconcile';
import { TestApiClient } from './helpers/api-client';

describe('Cashout — Close Long YES Position', () => {
  let userA: TestApiClient; // long YES position holder
  let userB: TestApiClient; // seller for opening trade
  let userC: TestApiClient; // bid provider for cashout
  let marketId: string;

  const PRICE_PTS = 5_000_000; // 50%
  const RISK_PENCE = 1_000; // £10
  const EXPECTED_CONTRACTS = 20_000_000n;

  beforeAll(async () => {
    await getDb();
    userA = await createUserWithWallet({ balancePounds: 100, emailPrefix: 'cashout-a' });
    userB = await createUserWithWallet({ balancePounds: 100, emailPrefix: 'cashout-b' });
    userC = await createUserWithWallet({ balancePounds: 100, emailPrefix: 'cashout-c' });
    const market = await createOpenBinaryMarket({ name: 'Cashout Close Position E2E' });
    marketId = market.id;
  });

  afterAll(async () => {
    await closeDb();
  });

  it('fully fills cashout IOC order and credits correct wallet amount', async () => {
    // ── 1. Establish opening position ────────────────────────
    // UserA buys YES, UserB sells YES at same price → fills immediately
    const buyResult = await placeOrderAs(userA, {
      marketId,
      side: 'BUY_YES',
      pPts: PRICE_PTS,
      liabilityPence: RISK_PENCE,
    });
    expect(buyResult.orderId).toBeTruthy();

    const sellResult = await placeOrderAs(userB, {
      marketId,
      side: 'SELL_YES',
      pPts: PRICE_PTS,
      liabilityPence: RISK_PENCE,
    });
    expect(sellResult.orderId).toBeTruthy();

    // Wait for the opening trade
    await waitForTradeCount(marketId, 1);
    await waitForOrderStatus(buyResult.orderId, ['MATCHED', 'FILLED']);

    // ── 2. Confirm UserA has the expected long YES position ───
    // Wait for lot to be written asynchronously by Rust clearing
    await waitFor(
      async () => {
        const rows = await query<{ qty: string }>(
          `SELECT COALESCE(SUM(qty_remaining_micros), 0)::text AS qty
           FROM position_lots
           WHERE user_id = $1 AND market_id = $2 AND qty_remaining_micros > 0`,
          [userA.userId, marketId],
        );
        return BigInt(rows[0].qty) > 0n;
      },
      { timeoutMs: 10_000, label: 'UserA position lot created after opening trade' },
    );

    const lotsAtOpen = await query<{ qty: string; side: string }>(
      `SELECT COALESCE(SUM(qty_remaining_micros), 0)::text AS qty,
              side::text AS side
       FROM position_lots
       WHERE user_id = $1
         AND market_id = $2
         AND qty_remaining_micros > 0
       GROUP BY side`,
      [userA.userId, marketId],
    );
    const yesLot = lotsAtOpen.find((r) => r.side === 'BUY_YES'); // BUY_YES = long YES
    expect(yesLot).toBeDefined();
    expect(BigInt(yesLot!.qty)).toBe(EXPECTED_CONTRACTS);

    const netContractsMicros = yesLot!.qty; // positive string → long YES

    // ── 3. UserC places a resting BUY_YES bid (cashout counterparty) ──
    await placeOrderAs(userC, {
      marketId,
      side: 'BUY_YES',
      pPts: PRICE_PTS,
      liabilityPence: RISK_PENCE,
    });

    // ── 4. Get cashout quote ──────────────────────────────────
    const quote = await userA.cashoutQuote({ marketId, netContractsMicros });

    // Quote should show full fill since UserC's order matches the exact size
    expect(quote.filledContractsMicros).toBe(netContractsMicros);
    expect(quote.unfilledContractsMicros).toBe('0');
    expect(quote.netValuePence).toBeGreaterThan(0);
    // At 50% → proceeds = 1000p, fee = 1p → net ≈ 999p
    expect(quote.netValuePence).toBeGreaterThanOrEqual(990);
    expect(quote.netValuePence).toBeLessThanOrEqual(RISK_PENCE);

    // ── 5. Record wallet state before cashout ─────────────────
    const walletsBefore = await getWalletBalances([userA.userId]);
    const userABefore = walletsBefore[userA.userId];

    // ── 6. Execute the cashout ────────────────────────────────
    const cashoutResult = await userA.cashoutExecute({ marketId, netContractsMicros });
    expect(cashoutResult.success).toBe(true);
    expect(cashoutResult.orderId).toBeTruthy();

    // ── 7. Wait for close order to reach a terminal state ────
    // The IOC order either fills (MATCHED/FILLED) or is cancelled (no book liquidity)
    const closeOrderStatus = await waitForOrderStatus(
      cashoutResult.orderId,
      ['MATCHED', 'FILLED', 'CANCELLED'],
      15_000,
    );
    // Must have filled — otherwise the cashout had no market depth
    expect(['MATCHED', 'FILLED']).toContain(closeOrderStatus);

    // Wait for Rust clearing to zero out the position lots
    await waitFor(
      async () => {
        const rows = await query<{ qty: string }>(
          `SELECT COALESCE(SUM(qty_remaining_micros), 0)::text AS qty
           FROM position_lots
           WHERE user_id = $1 AND market_id = $2`,
          [userA.userId, marketId],
        );
        return BigInt(rows[0].qty) === 0n;
      },
      { timeoutMs: 15_000, label: 'UserA position lots cleared after cashout' },
    );

    // ── 8. Verify the second trade appeared on the market ────
    await waitForTradeCount(marketId, 2);

    // ── 9. Verify wallet received correct credit ─────────────
    const walletsAfter = await getWalletBalances([userA.userId]);
    const userAAfter = walletsAfter[userA.userId];

    // Available balance must have increased — UserA received sell proceeds
    const balanceIncreasePounds = userAAfter.balance - userABefore.balance;
    expect(balanceIncreasePounds).toBeGreaterThan(0);

    // The increase should be close to quote.netValuePence (converted to pounds)
    // Allow ±10% tolerance for clearing timing / locked-balance release sequencing
    const quotedPounds = quote.netValuePence / 100;
    expect(balanceIncreasePounds).toBeGreaterThan(quotedPounds * 0.9);
    expect(balanceIncreasePounds).toBeLessThanOrEqual(quotedPounds * 1.1 + 0.02);

    // ── 10. Verify position lots are fully consumed ───────────
    // (already confirmed above via waitFor — query once more for assertion clarity)
    const lotsAfter = await query<{ qty: string }>(
      `SELECT COALESCE(SUM(qty_remaining_micros), 0)::text AS qty
       FROM position_lots
       WHERE user_id = $1 AND market_id = $2`,
      [userA.userId, marketId],
    );
    expect(BigInt(lotsAfter[0].qty)).toBe(0n);

    // ── 11. Verify UserC's order was consumed by the IOC ─────
    const userCOpenOrders = await query<{ qty_remaining: string }>(
      `SELECT qty_remaining_micros::text AS qty_remaining
       FROM orders
       WHERE user_id = $1
         AND market_id = $2
         AND status IN ('OPEN', 'PARTIALLY_MATCHED')`,
      [userC.userId, marketId],
    );
    const userCRemaining = userCOpenOrders.reduce(
      (sum, r) => sum + BigInt(r.qty_remaining),
      0n,
    );
    expect(userCRemaining).toBe(0n);

    // ── 12. System-wide reconciliation ───────────────────────
    await assertSystemReconciles();
  });

  it('cashoutQuote returns zero fill when book has no liquidity', async () => {
    // Fresh market with no orders — quote should show zero fill
    const emptyMarket = await createOpenBinaryMarket({ name: 'Cashout Empty Book E2E' });

    // Open a position first (UserA buys, UserB sells)
    const b = await placeOrderAs(userA, {
      marketId: emptyMarket.id,
      side: 'BUY_YES',
      pPts: PRICE_PTS,
      liabilityPence: RISK_PENCE,
    });
    await placeOrderAs(userB, {
      marketId: emptyMarket.id,
      side: 'SELL_YES',
      pPts: PRICE_PTS,
      liabilityPence: RISK_PENCE,
    });
    await waitForTradeCount(emptyMarket.id, 1);
    await waitForOrderStatus(b.orderId, ['MATCHED', 'FILLED']);

    // Get position size
    const lots = await query<{ qty: string }>(
      `SELECT COALESCE(SUM(qty_remaining_micros), 0)::text AS qty
       FROM position_lots
       WHERE user_id = $1 AND market_id = $2 AND qty_remaining_micros > 0`,
      [userA.userId, emptyMarket.id],
    );
    const qty = lots[0].qty;
    expect(BigInt(qty)).toBeGreaterThan(0n);

    // Now quote with empty book (no one else has placed a resting order)
    const emptyQuote = await userA.cashoutQuote({
      marketId: emptyMarket.id,
      netContractsMicros: qty,
    });

    expect(emptyQuote.filledContractsMicros).toBe('0');
    expect(emptyQuote.unfilledContractsMicros).toBe(qty);
    expect(emptyQuote.netValuePence).toBe(0);
  });
});
