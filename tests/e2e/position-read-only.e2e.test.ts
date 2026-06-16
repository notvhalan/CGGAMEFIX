import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, getDb, query } from './helpers/db';
import { createOpenBinaryMarket } from './helpers/markets';
import { placeOrderAs } from './helpers/orders';
import { createUserWithWallet } from './helpers/users';
import { waitForTradeCount } from './helpers/wait';
import { TestApiClient } from './helpers/api-client';

describe('Position reads', () => {
  let buyer: TestApiClient;
  let seller: TestApiClient;
  let marketId: string;

  beforeAll(async () => {
    await getDb();
    buyer = await createUserWithWallet({ balancePounds: 100 });
    seller = await createUserWithWallet({ balancePounds: 100 });
    marketId = (await createOpenBinaryMarket({ name: 'Read-only position E2E' })).id;

    await placeOrderAs(buyer, {
      marketId,
      side: 'BUY_YES',
      pPts: 5_000_000,
      liabilityPence: 1_000,
    });
    await placeOrderAs(seller, {
      marketId,
      side: 'SELL_YES',
      pPts: 5_000_000,
      liabilityPence: 1_000,
    });
    await waitForTradeCount(marketId, 1);
  });

  afterAll(async () => {
    await closeDb();
  });

  it('does not mutate dust-sized lots when fetching a position', async () => {
    const lots = await query<{ lot_id: string }>(
      `SELECT lot_id
       FROM position_lots
       WHERE user_id = $1 AND market_id = $2 AND side::text = 'BUY_YES'
       LIMIT 1`,
      [buyer.userId, marketId],
    );
    expect(lots).toHaveLength(1);

    await query(
      `UPDATE position_lots
       SET qty_remaining_micros = 500
       WHERE lot_id = $1`,
      [lots[0].lot_id],
    );

    const response = await buyer.get(`/v1/positions/markets/${marketId}/me`);
    expect(response.status).toBe(200);

    const afterRead = await query<{ qty_remaining_micros: string }>(
      `SELECT qty_remaining_micros::text
       FROM position_lots
       WHERE lot_id = $1`,
      [lots[0].lot_id],
    );
    expect(afterRead).toHaveLength(1);
    expect(BigInt(afterRead[0].qty_remaining_micros)).toBe(500n);
  });
});
