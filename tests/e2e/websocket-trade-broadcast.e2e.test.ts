/**
 * Scenario F — WebSocket Trade & Orderbook Broadcast
 *
 * • Connect WS to the Rust exchange
 * • Subscribe to a market
 * • Receive orderbook_snapshot on subscribe
 * • Place matching orders via API
 * • Receive trade + updated orderbook_snapshot messages
 * • Verify payload shapes
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import WebSocket from 'ws';
import { getDb, closeDb } from './helpers/db';
import { createUserWithWallet } from './helpers/users';
import { createOpenBinaryMarket } from './helpers/markets';
import { placeOrderAs } from './helpers/orders';
import { sleep } from './helpers/wait';
import { TestApiClient } from './helpers/api-client';

const RUST_WS_URL = process.env.RUST_WS_URL ?? 'ws://localhost:3001/ws';

interface WsMsg {
  type: string;
  [key: string]: unknown;
}

/** Open a WS connection and collect messages until closed/timeout. */
function openWs(url: string): {
  ws: WebSocket;
  messages: WsMsg[];
  ready: Promise<void>;
} {
  const messages: WsMsg[] = [];
  const ws = new WebSocket(url);

  const ready = new Promise<void>((resolve, reject) => {
    ws.on('open', () => resolve());
    ws.on('error', (err) => reject(err));
  });

  ws.on('message', (data: WebSocket.Data) => {
    try {
      const parsed = JSON.parse(data.toString()) as WsMsg;
      messages.push(parsed);
    } catch {
      // Ignore non-JSON frames
    }
  });

  return { ws, messages, ready };
}

function sendJson(ws: WebSocket, payload: Record<string, unknown>) {
  ws.send(JSON.stringify(payload));
}

describe('Scenario F — WebSocket Trade Broadcast', () => {
  let buyer: TestApiClient;
  let seller: TestApiClient;
  let marketId: string;

  beforeAll(async () => {
    await getDb();
    buyer = await createUserWithWallet({ balancePounds: 100 });
    seller = await createUserWithWallet({ balancePounds: 100 });
    const market = await createOpenBinaryMarket({ name: 'WS Broadcast E2E' });
    marketId = market.id;
  });

  afterAll(async () => {
    await closeDb();
  });

  it('receives orderbook_snapshot on subscribe', async () => {
    const { ws, messages, ready } = openWs(RUST_WS_URL);
    await ready;

    // Subscribe
    sendJson(ws, { type: 'subscribe', market_id: marketId });

    // Wait for snapshot
    await sleep(1000);

    const snapshots = messages.filter((m) => m.type === 'orderbook_snapshot');
    expect(snapshots.length).toBeGreaterThanOrEqual(1);

    const snap = snapshots[0];
    expect(snap.market_id).toBe(marketId);
    expect(snap).toHaveProperty('bids');
    expect(snap).toHaveProperty('asks');
    expect(Array.isArray(snap.bids)).toBe(true);
    expect(Array.isArray(snap.asks)).toBe(true);

    ws.close();
  });

  it('receives trade and updated snapshot after matching orders', async () => {
    const { ws, messages, ready } = openWs(RUST_WS_URL);
    await ready;

    // Subscribe to market
    sendJson(ws, { type: 'subscribe', market_id: marketId });
    await sleep(500); // Wait for initial snapshot

    const messageCountBeforeTrade = messages.length;

    // Place matching orders
    await placeOrderAs(buyer, {
      marketId,
      side: 'BUY_YES',
      pPts: 5_000_000,
      liabilityPence: 500,
    });

    await placeOrderAs(seller, {
      marketId,
      side: 'SELL_YES',
      pPts: 5_000_000,
      liabilityPence: 500,
    });

    // Wait for WS messages to arrive
    await sleep(3000);

    const newMessages = messages.slice(messageCountBeforeTrade);

    // Should have received a trade message
    const trades = newMessages.filter((m) => m.type === 'trade');
    expect(trades.length).toBeGreaterThanOrEqual(1);

    const trade = trades[0];
    expect(trade.market_id).toBe(marketId);
    expect(trade).toHaveProperty('trade_id');
    expect(trade).toHaveProperty('price_yes_pts');
    expect(trade).toHaveProperty('qty_micros');
    expect(trade).toHaveProperty('taker_side');
    expect(trade).toHaveProperty('maker_fee_pence');
    expect(trade).toHaveProperty('taker_fee_pence');

    // Should have received an updated orderbook snapshot
    const snapshots = newMessages.filter((m) => m.type === 'orderbook_snapshot');
    expect(snapshots.length).toBeGreaterThanOrEqual(1);

    ws.close();
  });

  it('responds to ping with pong', async () => {
    const { ws, messages, ready } = openWs(RUST_WS_URL);
    await ready;

    sendJson(ws, { type: 'ping' });
    await sleep(500);

    const pongs = messages.filter((m) => m.type === 'pong');
    expect(pongs.length).toBeGreaterThanOrEqual(1);

    ws.close();
  });
});
