# Product Spec - CGGAMEFIX Betting Exchange

Date: 2026-01-30
Owner: TBD
Status: Draft (generated from repo docs and code)

## 1) Overview
CGGAMEFIX is a peer-to-peer betting exchange with a central limit order book (CLOB) and real-time trading UI. Users place FOR (buy YES) and LAY (sell YES) orders on markets, which are matched by a price-time priority engine. The system is built as TypeScript microservices with event-driven communication over NATS, PostgreSQL persistence, Redis caching, and WebSocket updates.

## 2) Goals
- Provide real-time orderbook trading with sub-second updates.
- Support accurate positions, cashout, and ledgered wallet balances.
- Scale to multiple markets using an event-driven architecture.
- Provide an admin surface to seed liquidity in non-production environments.

## 3) Non-Goals (Current Phase)
- Production-grade market-making or risk tooling.
- Advanced order types beyond LIMIT/MARKET (stop, iceberg, etc.).
- Full regulatory/compliance workflow.
- Multi-provider identity or enterprise IAM.

## 4) Target Users
- Trader: places FOR/LAY orders, monitors positions and PnL.
- Observer: views markets, orderbooks, and trades without trading.
- Admin/Operator: seeds liquidity, tests market behavior, manages settlement.

## 5) Core User Journeys
1. Discover markets
   - View market list and details.
   - See orderbook depth and recent trades.

2. Authenticate and access the app
   - Google OAuth flow; session cookie established by API Gateway.
   - Protected /app routes require authenticated user.

3. Trade a market
   - Select market, place a LIMIT or MARKET order (FOR/LAY).
   - Order enters orderbook and matches by price-time priority.
   - Real-time UI updates via WebSocket.

4. Manage orders and positions
   - View open orders and trade history.
   - Track positions using signed contracts and FIFO lots.

5. Cashout
   - Request a cashout quote (book sweep + internal LP fill).
   - Execute cashout with slippage guard and quote validity.

6. Admin liquidity (dev/test)
   - Start liquidity bot swarm with configurable parameters.
   - Stop bots and create batch orders for depth testing.

## 6) Functional Requirements

### Markets
- List active markets with best prices and volume.
- Market details include outcomes, start time, stake limits, status.
- Orderbook snapshot and trade history per market.

### Trading and Matching
- Support LIMIT and MARKET orders.
- FOR = buy YES, LAY = sell YES.
- Price-time priority matching.
- Single-writer per market in matching engine.
- Publish order and trade events to NATS.

### Orders
- Create order, cancel order.
- Order status lifecycle: PENDING, OPEN, PARTIALLY_MATCHED, FILLED, CANCELLED.
- Time-in-force: GTC (default), IOC for cashout actions.

### Wallets and Ledger
- Reserve funds on order placement.
- Capture/release funds on trades/cancels.
- Double-entry ledger for audit trail.
- Track available and locked balances.

### Positions
- Positions derived from immutable trades.
- Signed contracts rule for FOR/LAY.
- FIFO lot tracking with partial closes.
- Positions snapshot for fast reads.

### Cashout
- Quote flow returns blended price, fees, and breakdown.
- Execute flow enforces quote age (<= 30s) and slippage bounds.
- Remainder filled internally via LP at worse pricing.

### Real-Time Updates
- WebSocket/SSE for orderbook deltas and trades.
- Subscribe to topics by market ID.
- Initial SSR fetch with subsequent real-time updates.

### Authentication
- Google OAuth via API Gateway (session cookie).
- Frontend uses /v1/auth/me for session checks.
- Protected routes under /app require authentication.

### Admin (Dev/Test)
- Start/stop liquidity bot swarm.
- Configure mid-price, spread, levels, size, refresh, taker chance.
- Create batch orders by price range and quantity.
- Admin access based on configured user identity.

### Settlement
- Market outcome resolution and payout distribution.
- Settlement events published to NATS.

## 7) System Architecture

### Services
- api-gateway: REST + WebSocket entry point, auth, admin APIs.
- matching-engine: in-memory orderbook, matching, cashout logic.
- wallet-service: funds and ledger management.
- market-data: orderbook snapshots, OHLC candles, last trade price.
- settlement-service: market resolution and payouts.

### Event Bus
- NATS commands: orders.submit, orders.cancel.
- NATS events: order accepted/rejected/cancelled, trade executed, book delta, market updated/settled.
- Cashout subjects: CASHOUT_QUOTE, CASHOUT_EXECUTE.

### Persistence
- PostgreSQL: users, markets, orders, trades, wallet accounts, ledger entries, domain events.
- Redis: orderbook snapshots and last trade prices.

## 8) API Surfaces (Summary)
- REST (api-gateway):
  - /api/orders (POST), /api/orders/:id (DELETE)
  - /api/markets, /api/markets/:id, /api/markets/:id/book
  - /v1/auth/google, /v1/auth/google/callback, /v1/auth/me, /v1/auth/logout
  - /v1/cashout/quote, /v1/cashout/execute
  - /v1/admin/liquidity-bots/start, /v1/admin/liquidity-bots/stop
- WebSocket: subscribe to market orderbook and trade updates.

## 9) UX / Frontend Scope
- Remix 2.5 frontend with SSR loaders and actions.
- Public routes: landing, markets, how-it-works, fees, legal.
- Auth routes: login, signup (Google OAuth).
- Protected app: dashboard, wallet, orders, positions, trades, settings.
- Trading UI: OrderBook, OrderTicket, TradesTape, PriceChart, WalletPanel.

## 10) Non-Functional Requirements
- Low-latency updates (sub-second UI refresh).
- Fault isolation across services via event bus.
- Horizontal scaling for stateless services.
- Data integrity through ledgered wallet and event sourcing.
- Auditability of all trades and cash flows.

## 11) Risks and Constraints
- Admin liquidity tools are dev-only and must be disabled in production.
- Partial cashout fills occur if orderbook liquidity is thin.
- Auth model currently uses session cookies; JWT use in API docs may require alignment.
- Redis cache consistency and snapshot TTLs need monitoring.

## 12) Success Metrics
- Median order-to-update latency < 250ms.
- 99.9% matching engine uptime during trading hours.
- Cashout quote latency < 200ms for typical book depth.
- Zero reconciliation errors between trades, lots, and ledger.

## 13) Open Questions
- Final authentication model: session cookies only or JWT for API clients?
- Production liquidity strategy and risk limits for LP fills.
- Settlement workflow and oracle integration.
- Fee model and maker/taker incentives.
- Monitoring/alerting stack selection (Prometheus/Grafana, etc.).

## 14) References
- README.md
- docs/architecture.md
- docs/web.md
- docs/api.md
- docs/admin-liquidity-bots.md
- docs/admin-panel-enhancements.md
- docs/CASHOUT_IMPLEMENTATION.md
- docs/CLOB_POSITION_TRACKING.md
- docs/frontend-auth.md
- docs/google-auth.md


Yes. I can do it.

Use this implementation order so you fix correctness first and avoid rewriting twice.

Batch 1 (P0): Single Order Path + Real Cancel

Make Rust exchange the only writer for submit/cancel.
Add cancel API in Rust.
Route API gateway cancel to Rust, not DB+NATS.
Files:
main.rs, types.rs, api.rs, engine.rs, rust-exchange.service.ts, orders.controller.ts

What to change:

Add EngineCommand enum (Submit, Cancel) and change matcher channel from MatchCommand to EngineCommand.
Add DELETE /api/orders/:order_id in Rust API.
In engine cancel handler:
Remove order from in-memory book.
Update DB status to CANCELLED.
Release lock with wallet.release_order_lock(...).
In gateway orders.controller cancel endpoint, remove manual DB status update + NATS publish and call Rust cancel endpoint only.
Batch 2 (P0): IOC + Lock Release + Size Consistency

Implement IOC remainder release in Rust engine.
Unify min contract threshold across all services.
Files:
engine.rs, clearing.rs, orderbook.rs, api.rs, types.rs, order.ts

What to change:

Define one Rust constant for min size (10_000 micros to match TS MIN_CONTRACT_MICROS).
For IOC with unfilled remainder:
Set final status (CANCELLED or PARTIALLY_MATCHED).
Set remaining to 0.
Release lock for unfilled quantity.
Remove inconsistent 1000 and 1_000_000 thresholds in engine/clearing.
Batch 3 (P1): Side Naming + Position Consistency

Eliminate FOR/LAY assumptions in runtime code.
Keep only BUY_YES/SELL_YES in reads/writes.
Files:
markets.controller.ts, position-lots.service.ts, admin.controller.ts, migrate-order-side-naming.sql

What to change:

markets.controller orderbook filters must use BUY_YES/SELL_YES.
position-lots.service comparisons must stop using FOR/LAY.
Admin settlement logic must check BUY_YES/SELL_YES.
Run side migration once and freeze enum usage.
Batch 4 (P1): Remove Mixed Legacy Paths

Remove NATS order submit/cancel from cashout/positions flows.
Send IOC close orders directly to Rust.
Files:
cashout.controller.ts, positions.controller.ts, app.module.ts

What to change:

Replace manual INSERT orders + NATS_SUBJECTS.ORDERS_SUBMIT with rustExchange.submitOrder(...).
Replace cancel publishes with Rust cancel calls.
Keep NATS only for events you still actually consume.
Batch 5 (P2): Reliability + Tests

Replace unbounded channels with bounded queues.
Add smoke integration tests for submit, match, partial IOC, cancel, lock/unlock.
Cut noisy WS debug logs.
Files:
main.rs, engine.rs, clearing.rs, websocket.rs, apps/api-gateway/tests/*, rust-exchange/tests/*

Verification checklist after Batch 1-3:

Place GTC order, cancel, confirm wallet unlocked and order removed from book.
Place IOC partially fill, confirm remainder unlocked and non-resting.
Confirm /v1/markets/:id/book matches WS snapshot for same market.
Confirm positions/settlement side logic works with BUY_YES/SELL_YES only.
I can start implementing Batch 1 now and then send you a patch + exact test results before moving to Batch 2.