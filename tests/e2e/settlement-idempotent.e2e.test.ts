/**
 * Scenario D + E — Settlement & Idempotency
 *
 * • Users trade
 * • Market resolves YES
 * • Settlement runs
 * • Verify: winners credited, losers not, market SETTLED,
 *   no locked funds remain.
 * • Run settlement a second time → balances unchanged (idempotent).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getDb, closeDb, query, queryOne } from './helpers/db';
import { createUserWithWallet, createAdminUser } from './helpers/users';
import { createOpenBinaryMarket, getMarket } from './helpers/markets';
import { placeOrderAs, resolveMarket } from './helpers/orders';
import { waitForTradeCount, sleep } from './helpers/wait';
import {
  assertSystemReconciles,
  assertNoLockedFundsForMarket,
  getWalletBalances,
} from './helpers/reconcile';
import { TestApiClient } from './helpers/api-client';

describe('Scenario D+E — Settlement & Idempotency', () => {
  let buyer: TestApiClient;   // BUY_YES — wins if YES
  let seller: TestApiClient;  // SELL_YES — wins if NO
  let admin: TestApiClient;
  let marketId: string;

  const PRICE_PTS = 6_000_000; // 60%
  const RISK_PENCE = 1_000;    // £10

  beforeAll(async () => {
    await getDb();
    buyer = await createUserWithWallet({ balancePounds: 100 });
    seller = await createUserWithWallet({ balancePounds: 100 });
    admin = await createAdminUser();
    const market = await createOpenBinaryMarket({ name: 'Settlement E2E' });
    marketId = market.id;
  });

  afterAll(async () => {
    await closeDb();
  });

  it('settles a YES-resolved market correctly', async () => {
    // ── 1. Create a matched trade ───────────────────────────
    await placeOrderAs(buyer, {
      marketId,
      side: 'BUY_YES',
      pPts: PRICE_PTS,
      liabilityPence: RISK_PENCE,
    });

    await placeOrderAs(seller, {
      marketId,
      side: 'SELL_YES',
      pPts: PRICE_PTS,
      liabilityPence: RISK_PENCE,
    });

    await waitForTradeCount(marketId, 1);
    // Let clearing finish
    await sleep(1000);

    // ── 2. Record pre-settlement balances ───────────────────
    const balancesBefore = await getWalletBalances([buyer.userId, seller.userId]);

    // ── 3. Resolve market as YES ────────────────────────────
    const resolveResult = await resolveMarket(admin, marketId, 'YES');
    expect(resolveResult.success).toBe(true);

    // ── 4. Verify market status → SETTLED ───────────────────
    const market = await getMarket(marketId);
    expect(market?.status).toBe('SETTLED');

    // ── 5. Verify: settlement record exists ─────────────────
    const settlement = await queryOne<{
      winning_outcome: string;
      winners_count: number;
      losers_count: number;
    }>(
      `SELECT winning_outcome, winners_count, losers_count
       FROM market_settlements WHERE market_id = $1`,
      [marketId],
    );
    expect(settlement).not.toBeNull();
    expect(settlement!.winning_outcome).toBe('YES');
    expect(settlement!.winners_count).toBeGreaterThan(0);

    // ── 6. Verify: buyer (BUY_YES) credited as winner ──────
    const balancesAfter = await getWalletBalances([buyer.userId, seller.userId]);

    // Buyer held BUY_YES → YES wins → buyer should gain
    expect(balancesAfter[buyer.userId].balance).toBeGreaterThan(
      balancesBefore[buyer.userId].balance,
    );

    // Seller held SELL_YES → YES wins → seller loses collateral
    // Their balance + locked should be less than before
    const sellerTotalBefore =
      balancesBefore[seller.userId].balance + balancesBefore[seller.userId].lockedBalance;
    const sellerTotalAfter =
      balancesAfter[seller.userId].balance + balancesAfter[seller.userId].lockedBalance;
    expect(sellerTotalAfter).toBeLessThanOrEqual(sellerTotalBefore);

    // ── 7. Verify: user_settlements rows ────────────────────
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

    const buyerSettlement = userSettlements.find((s) => s.user_id === buyer.userId);
    const sellerSettlement = userSettlements.find((s) => s.user_id === seller.userId);
    expect(buyerSettlement?.is_winner).toBe(true);
    expect(sellerSettlement?.is_winner).toBe(false);

    // ── 8. Verify: no locked funds remain ───────────────────
    await assertNoLockedFundsForMarket(marketId);

    // ── 9. Verify: position lots closed ─────────────────────
    const openLots = await query(
      `SELECT lot_id FROM position_lots
       WHERE market_id = $1 AND qty_remaining_micros > 0`,
      [marketId],
    );
    expect(openLots.length).toBe(0);

    // ── 10. Reconciliation ──────────────────────────────────
    await assertSystemReconciles();
  });

  it('settlement is idempotent — re-resolve does not double-credit', async () => {
    // Record balances after first settlement
    const balancesFirst = await getWalletBalances([buyer.userId, seller.userId]);

    // Try to resolve again — the admin endpoint should either:
    //   (a) error because market is already SETTLED, or
    //   (b) succeed but no position lots remain → no payouts
    try {
      await resolveMarket(admin, marketId, 'YES');
    } catch {
      // Expected: market already settled
    }

    // Balances must be unchanged
    const balancesSecond = await getWalletBalances([buyer.userId, seller.userId]);
    expect(balancesSecond[buyer.userId].balance).toBeCloseTo(
      balancesFirst[buyer.userId].balance,
      2,
    );
    expect(balancesSecond[seller.userId].balance).toBeCloseTo(
      balancesFirst[seller.userId].balance,
      2,
    );
    expect(balancesSecond[buyer.userId].lockedBalance).toBeCloseTo(
      balancesFirst[buyer.userId].lockedBalance,
      2,
    );
    expect(balancesSecond[seller.userId].lockedBalance).toBeCloseTo(
      balancesFirst[seller.userId].lockedBalance,
      2,
    );
  });
});
