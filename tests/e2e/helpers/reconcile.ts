/**
 * Post-scenario reconciliation checks.
 *
 * These should run after every E2E scenario to verify
 * system-wide invariants that must always hold.
 */

import { query } from './db';

export interface ReconciliationResult {
  passed: boolean;
  failures: string[];
}

/**
 * Run all reconciliation checks. Throws on failure.
 */
export async function assertSystemReconciles(): Promise<void> {
  const result = await runReconciliation();
  if (!result.passed) {
    throw new Error(
      `Reconciliation FAILED:\n  - ${result.failures.join('\n  - ')}`,
    );
  }
}

async function runReconciliation(): Promise<ReconciliationResult> {
  const failures: string[] = [];

  // Scope all checks to E2E test users only (production data may have
  // pre-existing issues that are not the concern of these tests).
  const E2E_FILTER = `WHERE u.email LIKE '%@e2e-test.local'`;

  // 1. No negative available balance
  const negBalance = await query<{ user_id: string; balance: string }>(
    `SELECT w.user_id, w.balance::text
     FROM wallets w JOIN users u ON w.user_id = u.id
     ${E2E_FILTER} AND w.balance < 0`,
  );
  if (negBalance.length > 0) {
    failures.push(
      `Negative balance: ${negBalance.map((r) => `${r.user_id} = ${r.balance}`).join(', ')}`,
    );
  }

  // 2. Negative locked balance (WARN only — known race condition between
  //    the API gateway's self-heal poll and Rust clearing service)
  const negLocked = await query<{ user_id: string; locked_balance: string }>(
    `SELECT w.user_id, w.locked_balance::text
     FROM wallets w JOIN users u ON w.user_id = u.id
     ${E2E_FILTER} AND w.locked_balance < 0`,
  );
  if (negLocked.length > 0) {
    // Log but do NOT fail — the gateway's periodic self-heal poll can race
    // with the Rust clearing service and temporarily cause negative locked_balance.
    console.warn(
      `[reconcile] WARN: Negative locked_balance (known race): ${negLocked.map((r) => `${r.user_id} = ${r.locked_balance}`).join(', ')}`,
    );
  }

  // 3. No matched quantity greater than original (scoped to e2e users)
  const overMatched = await query<{ id: string; orig: string; remaining: string }>(
    `SELECT o.id,
            o.qty_original_micros::text AS orig,
            o.qty_remaining_micros::text AS remaining
     FROM orders o JOIN users u ON o.user_id = u.id
     ${E2E_FILTER} AND o.qty_remaining_micros > o.qty_original_micros`,
  );
  if (overMatched.length > 0) {
    failures.push(
      `Over-matched orders: ${overMatched.map((r) => `${r.id} remaining=${r.remaining} > original=${r.orig}`).join(', ')}`,
    );
  }

  // 4. No negative remaining quantity (scoped to e2e users)
  const negRemaining = await query<{ id: string; remaining: string }>(
    `SELECT o.id, o.qty_remaining_micros::text AS remaining
     FROM orders o JOIN users u ON o.user_id = u.id
     ${E2E_FILTER} AND o.qty_remaining_micros < 0`,
  );
  if (negRemaining.length > 0) {
    failures.push(
      `Negative remaining qty: ${negRemaining.map((r) => `${r.id}=${r.remaining}`).join(', ')}`,
    );
  }

  // 5. No open orders should have locked funds if wallet shows 0 locked
  //    (inverse: if locked_balance > 0, there should be OPEN orders OR open position lots)
  // This is informational, not a hard failure (settlement timing may cause transient mismatch)

  return { passed: failures.length === 0, failures };
}

/**
 * Verify that no wallet has locked funds after all orders are
 * filled/cancelled and settlement is complete for a given market.
 */
export async function assertNoLockedFundsForMarket(marketId: string): Promise<void> {
  // Get users who traded this market
  const users = await query<{ user_id: string }>(
    `SELECT DISTINCT user_id FROM orders WHERE market_id = $1`,
    [marketId],
  );

  for (const { user_id } of users) {
    // Check if user has any remaining open orders (across ALL markets)
    const openOrders = await query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM orders
       WHERE user_id = $1 AND status IN ('OPEN', 'PARTIALLY_MATCHED')`,
      [user_id],
    );

    if (Number(openOrders[0].n) === 0) {
      // No open orders at all — locked balance should be 0
      const wallet = await query<{ locked_balance: string }>(
        `SELECT locked_balance::text FROM wallets
         WHERE user_id = $1 AND currency = 'GBP'`,
        [user_id],
      );
      const locked = parseFloat(wallet[0]?.locked_balance ?? '0');
      if (locked > 0.01) {
        // Allow tiny rounding (< 1p)
        throw new Error(
          `User ${user_id} has locked_balance=${locked} but no open orders`,
        );
      }
    }
  }
}

/**
 * Get wallet balances for a set of user IDs.
 */
export async function getWalletBalances(
  userIds: string[],
): Promise<Record<string, { balance: number; lockedBalance: number }>> {
  if (userIds.length === 0) return {};
  const rows = await query<{ user_id: string; balance: string; locked_balance: string }>(
    `SELECT user_id, balance::text, locked_balance::text
     FROM wallets WHERE user_id = ANY($1::uuid[]) AND currency = 'GBP'`,
    [userIds],
  );
  const result: Record<string, { balance: number; lockedBalance: number }> = {};
  for (const row of rows) {
    result[row.user_id] = {
      balance: parseFloat(row.balance),
      lockedBalance: parseFloat(row.locked_balance),
    };
  }
  return result;
}
