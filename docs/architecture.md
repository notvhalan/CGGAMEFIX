# Betting Exchange Architecture

## System Overview

The Betting Exchange is a peer-to-peer betting platform built as a microservices architecture. Users can place bets for (BACK) or against (LAY) outcomes, creating an orderbook-style marketplace.

## Architecture Principles

1. **Event-Driven**: All services communicate via NATS event bus
2. **Single Writer per Market**: Each matching engine instance handles one market
3. **Event Sourcing**: All domain events persisted to Postgres
4. **CQRS**: Command and query responsibilities separated
5. **Near Real-time Updates**: WebSocket for sub-second orderbook updates

## Core Components

### 1. API Gateway
- **Port**: 3000 (HTTP), 3001 (WebSocket)
- **Responsibilities**:
  - REST API for order submission and market queries
  - JWT authentication
  - WebSocket connections for real-time updates
  - Rate limiting and request validation

### 2. Matching Engine
- **Port**: 3100
- **Responsibilities**:
  - Single-writer per market (no distributed locking needed)
  - In-memory orderbook with price-time priority
  - Order matching algorithm
  - Trade execution
  - Event publishing (order accepted, trade executed, book delta)

### 3. Wallet Service
- **Port**: 3200
- **Responsibilities**:
  - Fund reservation when orders placed
  - Fund capture when trades execute
  - Fund release when orders cancelled
  - Double-entry ledger for audit trail
  - Balance management

### 4. Market Data Service
- **Port**: 3300
- **Responsibilities**:
  - OHLC candle generation (1m, 5m, 1h, 1d)
  - Orderbook snapshot caching in Redis
  - Last trade price tracking
  - Volume aggregation

### 5. Settlement Service
- **Port**: 3400
- **Responsibilities**:
  - Market outcome resolution
  - Winner/loser determination
  - Payout calculation
  - Trade status updates (PENDING → SETTLED)

## Data Flow

### Order Submission Flow
```
1. Client → API Gateway: POST /orders
2. API Gateway → NATS: orders.submit
3. Matching Engine: Receives command
4. Matching Engine: Validates & matches order
5. Matching Engine → NATS: events.order.accepted
6. Matching Engine → NATS: events.trade.executed (if matched)
7. Matching Engine → NATS: events.book.delta
8. Wallet Service: Reserves funds
9. Market Data: Updates cache
10. API Gateway → WebSocket Clients: Real-time updates
```

### Settlement Flow
```
1. Admin/Oracle → API Gateway: POST /markets/:id/settle
2. API Gateway → NATS: events.market.settled
3. Settlement Service: Calculate winners
4. Settlement Service → Wallet Service: Distribute payouts
5. Wallet Service: Update balances
```

## NATS Subjects

### Commands (input)
- `orders.submit` - Submit new order
- `orders.cancel` - Cancel existing order

### Events (output)
- `events.order.accepted` - Order accepted into orderbook
- `events.order.rejected` - Order validation failed
- `events.order.cancelled` - Order cancelled
- `events.order.matched` - Order fully matched
- `events.trade.executed` - Trade executed between two orders
- `events.book.delta` - Orderbook changed (incremental)
- `events.book.snapshot` - Orderbook snapshot (initial load)
- `events.market.updated` - Market metadata changed
- `events.market.settled` - Market outcome determined

## Database Schema

### Core Tables
- `users` - User accounts and authentication
- `markets` - Betting markets and events
- `orders` - Order history and status
- `trades` - Executed trades
- `wallets` - User balances (available + reserved)
- `ledger_entries` - Double-entry bookkeeping
- `domain_events` - Event sourcing store

## Scalability Considerations

1. **Horizontal Scaling**:
   - API Gateway: Stateless, can run multiple instances behind load balancer
   - Market Data: Stateless, can scale horizontally
   - Wallet Service: Can partition by user_id

2. **Matching Engine**:
   - Single writer per market (vertical scaling)
   - Can run multiple instances, each handling different markets
   - Use NATS queue groups for market assignment

3. **Caching Strategy**:
   - Redis for orderbook snapshots (5min TTL)
   - Redis for last trade prices
   - CDN for static market data

4. **Database**:
   - Read replicas for queries
   - Partitioning by market_id for trades table
   - Time-series partitioning for ledger_entries

## Security

- JWT authentication for API access
- Rate limiting per user
- WebSocket connection limits
- Input validation with Zod schemas
- SQL injection prevention (parameterized queries)
- CORS and Helmet for API security

## Monitoring

- Structured JSON logging
- Health check endpoints on all services
- NATS monitoring dashboard (port 8222)
- PostgreSQL metrics via pgAdmin
- Redis metrics via redis-cli

## Future Enhancements

1. **Performance**:
   - Move orderbook to shared memory for faster access
   - Use Redis Streams for event replay
   - Implement L2 cache for market data

2. **Features**:
   - Stop-loss orders
   - Conditional orders
   - Market maker incentives
   - Advanced order types

3. **Operations**:
   - Kubernetes deployment
   - Service mesh (Istio)
   - Distributed tracing (Jaeger)
   - Metrics (Prometheus + Grafana)
