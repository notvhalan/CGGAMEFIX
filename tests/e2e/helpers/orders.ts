/**
 * Order placement and cancellation helpers.
 */

import { TestApiClient } from './api-client';

export interface PlaceOrderOpts {
  marketId: string;
  side: 'BUY_YES' | 'SELL_YES';
  /** YES probability in pPts (1 – 9,999,999). e.g. 5_600_000 = 56% */
  pPts: number;
  /** Max loss in pence. e.g. 1000 = £10 */
  liabilityPence: number;
  timeInForce?: 'GTC' | 'IOC';
}

export interface PlaceOrderResult {
  orderId: string;
  status: string;
  contractsMicros: number;
}

/**
 * Place an order through the API Gateway as the given user.
 */
export async function placeOrderAs(
  client: TestApiClient,
  opts: PlaceOrderOpts,
): Promise<PlaceOrderResult> {
  const { status, data } = await client.post('/v1/orders', {
    marketId: opts.marketId,
    side: opts.side,
    pPts: opts.pPts,
    liabilityPence: opts.liabilityPence,
    timeInForce: opts.timeInForce ?? 'GTC',
  });

  if (status >= 400) {
    throw new Error(`placeOrder failed (${status}): ${JSON.stringify(data)}`);
  }

  return {
    orderId: data.orderId,
    status: data.status,
    contractsMicros: data.contracts_micros,
  };
}

/**
 * Cancel an order through the API Gateway.
 */
export async function cancelOrderAs(
  client: TestApiClient,
  orderId: string,
): Promise<{ orderId: string; status: string }> {
  const { status, data } = await client.del(`/v1/orders/${orderId}`);

  if (status >= 400) {
    throw new Error(`cancelOrder failed (${status}): ${JSON.stringify(data)}`);
  }

  return {
    orderId: data.orderId,
    status: data.status,
  };
}

/**
 * Resolve a market via the admin endpoint.
 */
export async function resolveMarket(
  adminClient: TestApiClient,
  marketId: string,
  winningOutcome: 'YES' | 'NO',
): Promise<any> {
  const { status, data } = await adminClient.post('/v1/admin/markets/resolve', {
    marketId,
    winningOutcome,
    reason: 'E2E test resolution',
  });

  if (status >= 400) {
    throw new Error(`resolveMarket failed (${status}): ${JSON.stringify(data)}`);
  }

  return data;
}

/**
 * Void a market via the admin endpoint (returns all locked funds).
 */
export async function voidMarket(
  adminClient: TestApiClient,
  marketId: string,
  reason = 'E2E test void',
): Promise<any> {
  const { status, data } = await adminClient.post('/v1/admin/markets/void', {
    marketId,
    reason,
  });

  if (status >= 400) {
    throw new Error(`voidMarket failed (${status}): ${JSON.stringify(data)}`);
  }

  return data;
}

/**
 * Try to place an order, returning { ok, orderId, status, contractsMicros, error }.
 * Does NOT throw on 4xx — useful for testing rejections.
 */
export async function tryPlaceOrderAs(
  client: TestApiClient,
  opts: PlaceOrderOpts,
): Promise<{
  ok: boolean;
  httpStatus: number;
  orderId?: string;
  status?: string;
  contractsMicros?: number;
  error?: string;
}> {
  const { status, data } = await client.post('/v1/orders', {
    marketId: opts.marketId,
    side: opts.side,
    pPts: opts.pPts,
    liabilityPence: opts.liabilityPence,
    timeInForce: opts.timeInForce ?? 'GTC',
  });

  if (status >= 400) {
    return {
      ok: false,
      httpStatus: status,
      error: typeof data === 'string' ? data : (data?.message ?? data?.error ?? JSON.stringify(data)),
    };
  }

  return {
    ok: true,
    httpStatus: status,
    orderId: data.orderId,
    status: data.status,
    contractsMicros: data.contracts_micros,
  };
}
