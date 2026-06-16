import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, getDb, query } from './helpers/db';
import { createOpenBinaryMarket } from './helpers/markets';
import { placeOrderAs } from './helpers/orders';
import { createUserWithWallet } from './helpers/users';
import { waitForOrderStatus, waitForTradeCount } from './helpers/wait';
import { TestApiClient } from './helpers/api-client';

describe('Sub-contract order remainder', () => {
  let buyer: TestApiClient;
  let seller: TestApiClient;
  let marketId: string;

  beforeAll(async () => {
    await getDb();
    buyer = await createUserWithWallet({ balancePounds: 100 });
    seller = await createUserWithWallet({ balancePounds: 100 });
    marketId = (await createOpenBinaryMarket({ name: 'Sub-contract remainder E2E' })).id;
  });

  afterAll(async () => {
    await closeDb();
  });

  it('keeps a tradable remainder open instead of marking it matched', async () => {
    const buy = await placeOrderAs(buyer, {
      marketId,
      side: 'BUY_YES',
      pPts: 5_000_000,
      liabilityPence: 1_000,
    });
    await waitForOrderStatus(buy.orderId, ['OPEN']);

    await placeOrderAs(seller, {
      marketId,
      side: 'SELL_YES',
      pPts: 5_000_000,
      liabilityPence: 999,
    });
    await waitForTradeCount(marketId, 1);
    await waitForOrderStatus(buy.orderId, ['PARTIALLY_MATCHED']);

    const orders = await query<{
      status: string;
      qty_remaining_micros: string;
    }>(
      `SELECT status::text AS status, qty_remaining_micros::text
       FROM orders
       WHERE id = $1`,
      [buy.orderId],
    );

    expect(orders).toHaveLength(1);
    expect(orders[0].status).toBe('PARTIALLY_MATCHED');
    expect(BigInt(orders[0].qty_remaining_micros)).toBe(20_000n);
  });
});
