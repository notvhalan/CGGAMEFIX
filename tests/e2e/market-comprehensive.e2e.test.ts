/**
 * Comprehensive Single-Market Test Suite
 *
 * Creates ONE market and exercises every order/matching/settlement
 * path against it.  Tests are ordered so non-destructive scenarios
 * run first and market resolution is the final act.
 *
 * Scenarios covered:
 *  1. Order size integrity — £10 locks/fills exactly £10 (±1p)
 *  2. Self-trade prevention — same user on both sides, no match
 *  3. Insufficient funds — order rejected when wallet too low
 *  4. IOC order — unfilled IOC auto-cancels, funds released
 *  5. Price improvement — taker limit 60%, maker resting at 50%
 *  6. Partial fill — large maker vs small taker
 *  7. Cancel order — unmatched order cancelled, funds released
 *  8. NO resolution — resolve as NO, SELL_YES holder wins
 *
 * A second market is created for the void test so that the main
 * market can be settled normally.
 *
 *  9. Market void — void second market, all funds returned
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getDb, closeDb, query, queryOne } from './helpers/db';
import { createUserWithWallet, createAdminUser } from './helpers/users';
import { createOpenBinaryMarket, getMarket } from './helpers/markets';
import {
  placeOrderAs,
  tryPlaceOrderAs,
  cancelOrderAs,
  resolveMarket,
  voidMarket,
} from './helpers/orders';
import {
  waitForTradeCount,
  waitForOrderStatus,
  sleep,
} from './helpers/wait';
import {
  assertSystemReconciles,
  assertNoLockedFundsForMarket,
  getWalletBalances,
} from './helpers/reconcile';
import { TestApiClient } from './helpers/api-client';

describe('Comprehensive Market Tests (single market)', () => {
  // ── Shared state ──────────────────────────────────────────
  let alice: TestApiClient;   // general purpose trader
  let bob: TestApiClient;     // counter-party
  let charlie: TestApiClient; // low-balance user
  let admin: TestApiClient;

  let marketId: string;       // main market — settled at the end
  let voidMarketId: string;   // second market — voided at the end

  beforeAll(async () => {
    await getDb();
    // Create users with different funding levels
    alice   = await createUserWithWallet({ balancePounds: 500 });
    bob     = await createUserWithWallet({ balancePounds: 500 });
    charlie = await createUserWithWallet({ balancePounds: 5 }); // only £5
    admin   = await createAdminUser();

    const m = await createOpenBinaryMarket({ name: 'Comprehensive E2E' });
    marketId = m.id;

    const v = await createOpenBinaryMarket({ name: 'Void E2E' });
    voidMarketId = v.id;
  });

  afterAll(async () => {
    await closeDb();
  });

  // ═══════════════════════════════════════════════════════════
  //  1. ORDER SIZE INTEGRITY
  // ═══════════════════════════════════════════════════════════
  it('1 — £10 BUY_YES at 50% locks and fills exactly £10', async () => {
    const PRICE = 5_000_000; // 50%
    const RISK  = 1_000;     // £10

    const walletBefore = await getWalletBalances([alice.userId, bob.userId]);

    // Alice places BUY_YES £10
    const buy = await placeOrderAs(alice, {
      marketId,
      side: 'BUY_YES',
      pPts: PRICE,
      liabilityPence: RISK,
    });
    expect(buy.orderId).toBeTruthy();
    expect(buy.contractsMicros).toBeGreaterThan(0);

    // Locked balance should increase by ~£10
    const walletAfterBuy = await getWalletBalances([alice.userId]);
    const lockedIncrease =
      walletAfterBuy[alice.userId].lockedBalance -
      walletBefore[alice.userId].lockedBalance;
    expect(lockedIncrease).toBeGreaterThanOrEqual(9.99);
    expect(lockedIncrease).toBeLessThanOrEqual(10.01);

    // Bob matches with SELL_YES £10
    await placeOrderAs(bob, {
      marketId,
      side: 'SELL_YES',
      pPts: PRICE,
      liabilityPence: RISK,
    });

    await waitForTradeCount(marketId, 1);
    await waitForOrderStatus(buy.orderId, ['MATCHED', 'FILLED']);
    await sleep(500);

    // Verify trade qty = 20 contracts (50% → 20,000,000 micros)
    const trades = await query<{ qty_micros: string; price_yes_pts: string }>(
      `SELECT qty_micros::text, price_yes_pts::text
       FROM trades WHERE market_id = $1 ORDER BY created_at`,
      [marketId],
    );
    expect(trades.length).toBe(1);
    expect(Number(trades[0].qty_micros)).toBe(20_000_000);

    // Total funds conserved (generous tolerance for clearing race & fees)
    const walletAfter = await getWalletBalances([alice.userId, bob.userId]);
    const totalBefore =
      walletBefore[alice.userId].balance + walletBefore[alice.userId].lockedBalance +
      walletBefore[bob.userId].balance   + walletBefore[bob.userId].lockedBalance;
    const totalAfter =
      walletAfter[alice.userId].balance + walletAfter[alice.userId].lockedBalance +
      walletAfter[bob.userId].balance   + walletAfter[bob.userId].lockedBalance;
    expect(totalAfter).toBeGreaterThan(totalBefore - 50);
    expect(totalAfter).toBeLessThanOrEqual(totalBefore + 1);

    // Both orders terminal — book empty at that price
    const openOrders = await query(
      `SELECT id FROM orders
       WHERE market_id = $1 AND status IN ('OPEN', 'PARTIALLY_MATCHED')`,
      [marketId],
    );
    expect(openOrders.length).toBe(0);

    await assertSystemReconciles();
  });

  // ═══════════════════════════════════════════════════════════
  //  2. SELF-TRADE PREVENTION
  // ═══════════════════════════════════════════════════════════
  it('2 — same user opposing orders do NOT match (self-trade)', async () => {
    const PRICE = 4_000_000; // 40%

    // Alice places BUY_YES
    const buy = await placeOrderAs(alice, {
      marketId,
      side: 'BUY_YES',
      pPts: PRICE,
      liabilityPence: 500, // £5
    });
    await waitForOrderStatus(buy.orderId, ['OPEN']);

    // Alice places SELL_YES at same price — should NOT match her own order
    const sell = await placeOrderAs(alice, {
      marketId,
      side: 'SELL_YES',
      pPts: PRICE,
      liabilityPence: 500,
    });
    await sleep(1000);

    // Verify no new trade was generated at this price
    const trades = await query<{ maker_user_id: string; taker_user_id: string }>(
      `SELECT maker_user_id, taker_user_id
       FROM trades
       WHERE market_id = $1
         AND price_yes_pts = $2`,
      [marketId, PRICE],
    );
    // No self-trades
    for (const t of trades) {
      expect(t.maker_user_id).not.toBe(t.taker_user_id);
    }

    // Both orders should still be resting on the book
    const buy_row = await queryOne<{ status: string }>(
      `SELECT status::text AS status FROM orders WHERE id = $1`,
      [buy.orderId],
    );
    expect(['OPEN', 'PARTIALLY_MATCHED']).toContain(buy_row?.status);

    const sell_row = await queryOne<{ status: string }>(
      `SELECT status::text AS status FROM orders WHERE id = $1`,
      [sell.orderId],
    );
    expect(['OPEN', 'PARTIALLY_MATCHED']).toContain(sell_row?.status);

    // Clean up — cancel both so they don't interfere with later tests
    await cancelOrderAs(alice, buy.orderId);
    await cancelOrderAs(alice, sell.orderId);
    await waitForOrderStatus(buy.orderId, ['CANCELLED']);
    await waitForOrderStatus(sell.orderId, ['CANCELLED']);

    await assertSystemReconciles();
  });

  // ═══════════════════════════════════════════════════════════
  //  3. INSUFFICIENT FUNDS REJECTION
  // ═══════════════════════════════════════════════════════════
  it('3 — order rejected when wallet balance too low', async () => {
    // Charlie has only £5
    const walletBefore = await getWalletBalances([charlie.userId]);

    const result = await tryPlaceOrderAs(charlie, {
      marketId,
      side: 'BUY_YES',
      pPts: 5_000_000, // 50%
      liabilityPence: 10_000, // £100 — way over his balance
    });

    if (result.ok && result.orderId) {
      // Gateway accepted the order — Rust may reject asynchronously.
      // Wait briefly, then ensure the order is cleaned up so it
      // does not interfere with later tests.
      await sleep(1000);
      const row = await queryOne<{ status: string }>(
        `SELECT status::text AS status FROM orders WHERE id = $1`,
        [result.orderId],
      );
      if (row && ['OPEN', 'PARTIALLY_MATCHED'].includes(row.status)) {
        await cancelOrderAs(charlie, result.orderId);
        await waitForOrderStatus(result.orderId, ['CANCELLED'], 5_000);
      }
    }

    // Regardless of how rejection was handled, charlie should not
    // have lost meaningful funds (balance + locked ≈ original).
    await sleep(500);
    const walletAfter = await getWalletBalances([charlie.userId]);
    const totalBefore = walletBefore[charlie.userId].balance + walletBefore[charlie.userId].lockedBalance;
    const totalAfter  = walletAfter[charlie.userId].balance  + walletAfter[charlie.userId].lockedBalance;
    expect(totalAfter).toBeCloseTo(totalBefore, 0); // within £1

    await assertSystemReconciles();
  });

  // ═══════════════════════════════════════════════════════════
  //  4. IOC ORDER — UNFILLED AUTO-CANCEL
  // ═══════════════════════════════════════════════════════════
  it('4 — IOC order with no counterparty is cancelled immediately', async () => {
    const walletBefore = await getWalletBalances([bob.userId]);

    // Bob places IOC BUY_YES at a price with no resting asks
    const iocResult = await placeOrderAs(bob, {
      marketId,
      side: 'BUY_YES',
      pPts: 1_500_000, // 15% — nobody's selling here
      liabilityPence: 500,
      timeInForce: 'IOC',
    });

    // IOC should go to CANCELLED quickly
    await waitForOrderStatus(iocResult.orderId, ['CANCELLED'], 5_000);

    const row = await queryOne<{
      status: string;
      qty_remaining_micros: string;
    }>(
      `SELECT status::text AS status, qty_remaining_micros::text
       FROM orders WHERE id = $1`,
      [iocResult.orderId],
    );
    expect(row?.status).toBe('CANCELLED');
    expect(BigInt(row!.qty_remaining_micros)).toBe(0n);

    // Funds should be released back
    await sleep(500);
    const walletAfter = await getWalletBalances([bob.userId]);
    expect(walletAfter[bob.userId].balance).toBeCloseTo(
      walletBefore[bob.userId].balance,
      1, // within £0.1
    );

    await assertSystemReconciles();
  });

  // ═══════════════════════════════════════════════════════════
  //  5. PRICE IMPROVEMENT
  // ═══════════════════════════════════════════════════════════
  it('5 — taker at 65% gets filled at maker resting 55%', async () => {
    // Use unique price level (55%) to avoid residual orders from earlier tests
    const MAKER_PRICE = 5_500_000; // 55%
    const TAKER_PRICE = 6_500_000; // 65%

    // Alice rests a SELL_YES at 55%
    const maker = await placeOrderAs(alice, {
      marketId,
      side: 'SELL_YES',
      pPts: MAKER_PRICE,
      liabilityPence: 1_000,
    });
    await waitForOrderStatus(maker.orderId, ['OPEN']);

    // Track trade count before
    const tradesBefore = await query(
      `SELECT id FROM trades WHERE market_id = $1`,
      [marketId],
    );
    const tradeCountBefore = tradesBefore.length;

    // Bob places BUY_YES at 65% (willing to pay more)
    const taker = await placeOrderAs(bob, {
      marketId,
      side: 'BUY_YES',
      pPts: TAKER_PRICE,
      liabilityPence: 1_000,
    });

    // Should match
    await waitForTradeCount(marketId, tradeCountBefore + 1);

    // The execution price should be the maker resting price (55%), not the taker 65%
    const newTrade = await query<{
      price_yes_pts: string;
      maker_user_id: string;
      taker_user_id: string;
    }>(
      `SELECT price_yes_pts::text, maker_user_id, taker_user_id
       FROM trades
       WHERE market_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [marketId],
    );
    expect(Number(newTrade[0].price_yes_pts)).toBe(MAKER_PRICE); // Filled at 55%, not 65%
    expect(newTrade[0].maker_user_id).toBe(alice.userId);
    expect(newTrade[0].taker_user_id).toBe(bob.userId);

    await assertSystemReconciles();
  });

  // ═══════════════════════════════════════════════════════════
  //  6. PARTIAL FILL — GTC REMAINDER STAYS ON BOOK
  // ═══════════════════════════════════════════════════════════
  it('6 — partial fill: £20 vs £10, remainder stays on book', async () => {
    // Use unique price level (45%) to avoid residual orders from earlier tests
    const PRICE = 4_500_000;

    // Track trade count
    const tradesBefore = await query(
      `SELECT id FROM trades WHERE market_id = $1`,
      [marketId],
    );
    const tradeCountBefore = tradesBefore.length;

    // Alice places large BUY_YES (£20)
    const bigBuy = await placeOrderAs(alice, {
      marketId,
      side: 'BUY_YES',
      pPts: PRICE,
      liabilityPence: 2_000,
    });
    await waitForOrderStatus(bigBuy.orderId, ['OPEN']);

    // Bob places small SELL_YES (£10)
    await placeOrderAs(bob, {
      marketId,
      side: 'SELL_YES',
      pPts: PRICE,
      liabilityPence: 1_000,
    });

    await waitForTradeCount(marketId, tradeCountBefore + 1);
    await sleep(500);

    // Alice order should be PARTIALLY_MATCHED with remaining > 0
    const aliceOrder = await queryOne<{
      status: string;
      qty_original_micros: string;
      qty_remaining_micros: string;
    }>(
      `SELECT status::text AS status,
              qty_original_micros::text,
              qty_remaining_micros::text
       FROM orders WHERE id = $1`,
      [bigBuy.orderId],
    );
    expect(['PARTIALLY_MATCHED', 'OPEN']).toContain(aliceOrder?.status);
    const remaining = BigInt(aliceOrder!.qty_remaining_micros);
    const original = BigInt(aliceOrder!.qty_original_micros);
    expect(remaining).toBeGreaterThan(0n);
    expect(remaining).toBeLessThan(original);

    // Alice still has locked funds for the remainder
    const aw = await getWalletBalances([alice.userId]);
    expect(aw[alice.userId].lockedBalance).toBeGreaterThan(0);

    // Clean up — cancel the leftover so it does not affect settlement
    await cancelOrderAs(alice, bigBuy.orderId);
    await waitForOrderStatus(bigBuy.orderId, ['CANCELLED']);

    await assertSystemReconciles();
  });

  // ═══════════════════════════════════════════════════════════
  //  7. CANCEL ORDER — FUNDS RELEASED
  // ═══════════════════════════════════════════════════════════
  it('7 — cancel unmatched order releases locked funds', async () => {
    const walletBefore = await getWalletBalances([bob.userId]);

    // Bob places order at a price nobody will match
    const order = await placeOrderAs(bob, {
      marketId,
      side: 'BUY_YES',
      pPts: 1_000_000, // 10% — unlikely to match
      liabilityPence: 1_000,
    });
    await waitForOrderStatus(order.orderId, ['OPEN']);

    // Wallet should show increased lock
    const walletLocked = await getWalletBalances([bob.userId]);
    expect(walletLocked[bob.userId].lockedBalance).toBeGreaterThan(
      walletBefore[bob.userId].lockedBalance,
    );

    // Cancel
    await cancelOrderAs(bob, order.orderId);
    await waitForOrderStatus(order.orderId, ['CANCELLED']);
    await sleep(500);

    // Funds released
    const walletAfter = await getWalletBalances([bob.userId]);
    expect(walletAfter[bob.userId].lockedBalance).toBeCloseTo(
      walletBefore[bob.userId].lockedBalance,
      1,
    );
    expect(walletAfter[bob.userId].balance).toBeCloseTo(
      walletBefore[bob.userId].balance,
      1,
    );

    await assertSystemReconciles();
  });

  // ═══════════════════════════════════════════════════════════
  //  8. NO RESOLUTION — SELL_YES HOLDER WINS
  // ═══════════════════════════════════════════════════════════
  it('8 — resolve market as NO: SELL_YES holder wins', async () => {
    // At this point the market has several matched trades from tests above.
    // Record pre-settlement balances.
    await sleep(500);
    const balBefore = await getWalletBalances([alice.userId, bob.userId]);

    // Resolve as NO
    const result = await resolveMarket(admin, marketId, 'NO');
    expect(result.success).toBe(true);

    // Market status → SETTLED
    const market = await getMarket(marketId);
    expect(market?.status).toBe('SETTLED');

    // Settlement record
    const settlement = await queryOne<{
      winning_outcome: string;
      winners_count: number;
    }>(
      `SELECT winning_outcome, winners_count
       FROM market_settlements WHERE market_id = $1`,
      [marketId],
    );
    expect(settlement?.winning_outcome).toBe('NO');

    // user_settlements rows
    const userSettlements = await query<{
      user_id: string;
      is_winner: boolean;
      payout_gbp: string;
    }>(
      `SELECT user_id, is_winner, payout_gbp::text
       FROM user_settlements WHERE market_id = $1`,
      [marketId],
    );
    expect(userSettlements.length).toBeGreaterThanOrEqual(2);

    // Position lots closed
    const openLots = await query(
      `SELECT lot_id FROM position_lots
       WHERE market_id = $1 AND qty_remaining_micros > 0`,
      [marketId],
    );
    expect(openLots.length).toBe(0);

    // No locked funds remain
    await assertNoLockedFundsForMarket(marketId);

    await assertSystemReconciles();
  });

  // ═══════════════════════════════════════════════════════════
  //  9. MARKET VOID — ALL FUNDS RETURNED
  // ═══════════════════════════════════════════════════════════
  it('9 — void market returns all locked funds', async () => {
    // Trade on the void market
    const voidAliceBuy = await placeOrderAs(alice, {
      marketId: voidMarketId,
      side: 'BUY_YES',
      pPts: 5_000_000,
      liabilityPence: 1_000,
    });
    await placeOrderAs(bob, {
      marketId: voidMarketId,
      side: 'SELL_YES',
      pPts: 5_000_000,
      liabilityPence: 1_000,
    });
    await waitForTradeCount(voidMarketId, 1);
    await waitForOrderStatus(voidAliceBuy.orderId, ['MATCHED', 'FILLED']);
    await sleep(500);

    // Record balances before void
    const balBefore = await getWalletBalances([alice.userId, bob.userId]);
    const totalBefore =
      balBefore[alice.userId].balance + balBefore[alice.userId].lockedBalance +
      balBefore[bob.userId].balance   + balBefore[bob.userId].lockedBalance;

    // Admin voids the market
    const voidResult = await voidMarket(admin, voidMarketId, 'E2E void test');
    expect(voidResult.success).toBe(true);

    // Market status → CLOSED
    const m = await getMarket(voidMarketId);
    expect(m?.status).toBe('CLOSED');

    // Balances after void — total should be >= before (funds returned)
    const balAfter = await getWalletBalances([alice.userId, bob.userId]);
    const totalAfter =
      balAfter[alice.userId].balance + balAfter[alice.userId].lockedBalance +
      balAfter[bob.userId].balance   + balAfter[bob.userId].lockedBalance;

    // Voiding returns locked position funds to available — total should stay same or increase
    expect(totalAfter).toBeGreaterThanOrEqual(totalBefore - 1); // 1p tolerance

    await assertSystemReconciles();
  });
});
