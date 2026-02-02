# Betting Exchange - P2P Orderbook & Matching Engine

A production-grade peer-to-peer betting exchange built with TypeScript, featuring real-time orderbook updates, price-time priority matching, and event-driven microservices architecture.

## 🏗️ Architecture

- **Monorepo**: pnpm workspace with TypeScript
- **Message Bus**: NATS for event-driven communication
- **Database**: PostgreSQL for persistence
- **Cache**: Redis for orderbook snapshots
- **Real-time**: WebSocket for sub-second updates
- **Containerization**: Docker & Docker Compose

## 📦 Services

| Service | Port | Description |
|---------|------|-------------|
| **api-gateway** | 3000, 3001 | REST API + WebSocket gateway |
| **matching-engine** | 3100 | In-memory orderbook with price-time matching |
| **wallet-service** | 3200 | Fund management & double-entry ledger |
| **market-data** | 3300 | OHLC candles & orderbook caching |
| **settlement-service** | 3400 | Market outcome resolution & payouts |

## 🚀 Quick Start

### Prerequisites

- Node.js 20+
- pnpm 8+
- Docker & Docker Compose

### Setup

```bash
# Clone the repository
cd CGGAMEFIX

# Install dependencies
pnpm install

# Copy environment variables
cp .env.example .env

# Start infrastructure (Postgres, Redis, NATS)
make docker-up

# Start all services in development mode
make dev
```

### Alternative Setup (using script)

```bash
# Run setup script
./scripts/setup.sh

# Start services
pnpm run dev
```

## 📁 Project Structure

```
CGGAMEFIX/
├── apps/                          # Runnable services
│   ├── api-gateway/              # REST + WebSocket API
│   ├── matching-engine/          # Orderbook & matching
│   ├── wallet-service/           # Fund management
│   ├── market-data/              # OHLC & caching
│   └── settlement-service/       # Settlement logic
├── packages/                      # Shared libraries
│   ├── shared-types/             # Common types & schemas
│   └── shared-config/            # Environment & logging
├── scripts/                       # Dev tooling
│   ├── setup.sh                  # Environment setup
│   ├── dev.sh                    # Development runner
│   └── init-db.sql               # Database schema
├── docs/                          # Documentation
│   ├── architecture.md           # System architecture
│   └── api.md                    # API documentation
├── docker-compose.yml            # Local infrastructure
├── package.json                  # Root workspace config
├── pnpm-workspace.yaml           # pnpm workspace config
└── Makefile                      # Common commands
```

## 🛠️ Development

### Available Commands

```bash
# Development
make dev              # Start all services
make dev-gateway      # Start only API Gateway
make dev-engine       # Start only Matching Engine

# Building
make build            # Build all services
make typecheck        # Type check all packages

# Code Quality
make lint             # Run ESLint
make lint-fix         # Fix linting issues
make format           # Format with Prettier

# Docker
make docker-up        # Start infrastructure
make docker-down      # Stop infrastructure
make logs             # View Docker logs

# Cleanup
make clean            # Remove build artifacts
```

## 🔌 API Endpoints

### REST API (Port 3000)

```bash
# Submit order
POST /api/orders
{
  "marketId": "uuid",
  "side": "BACK",
  "type": "LIMIT",
  "price": 2.5,
  "stake": 100
}

# Cancel order
DELETE /api/orders/:id

# Get orderbook
GET /api/markets/:id/book

# List markets
GET /api/markets
```

### WebSocket API (Port 3001)

```javascript
const ws = new WebSocket('ws://localhost:3001');

// Subscribe to market
ws.send(JSON.stringify({
  type: 'subscribe',
  marketId: 'uuid'
}));

// Receive real-time updates
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  // { type: 'book_delta', data: {...} }
  // { type: 'trade', data: {...} }
};
```

## 📊 NATS Subjects

### Commands
- `orders.submit` - Submit new order
- `orders.cancel` - Cancel order

### Events
- `events.order.accepted` - Order accepted
- `events.order.rejected` - Order rejected
- `events.trade.executed` - Trade executed
- `events.book.delta` - Orderbook updated
- `events.market.settled` - Market settled

## 🗄️ Database

Access PostgreSQL:
```bash
# Via Docker
docker exec -it betting-exchange-postgres psql -U postgres -d betting_exchange

# Via pgAdmin
http://localhost:5050
# Email: admin@betting.local
# Password: admin
```

## 📈 Monitoring

- **NATS Dashboard**: http://localhost:8222
- **pgAdmin**: http://localhost:5050
- **Redis**: `redis-cli -h localhost -p 6379`

## 🧪 Testing

```bash
# Run tests for all packages
pnpm run test

# Run tests for specific service
pnpm --filter @betting-exchange/api-gateway test
```

## 🏭 Production Build

```bash
# Build all services
pnpm run build

# Build Docker images
docker build -t api-gateway ./apps/api-gateway
docker build -t matching-engine ./apps/matching-engine
# ... etc
```

## 📝 Environment Variables

See `.env.example` for required configuration. Key variables:

- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string
- `NATS_URL` - NATS server URL
- `JWT_SECRET` - JWT signing secret
- `API_GATEWAY_PORT` - API Gateway HTTP port
- `WS_PORT` - WebSocket server port
- `LOG_LEVEL` - Logging level (debug, info, warn, error)
- `DISABLE_LOGS` - Set to `true` to disable all logging

See [LOGGING.md](docs/LOGGING.md) for detailed logging configuration.

## 🔐 Security

- JWT authentication for API access
- Zod schema validation for all inputs
- Helmet security headers
- CORS configuration
- Rate limiting (TODO)

## 🚧 TODO / Roadmap

- [ ] Implement authentication service
- [ ] Add database migrations (e.g., node-pg-migrate)
- [ ] Implement rate limiting
- [ ] Add comprehensive tests
- [ ] Add observability (Prometheus + Grafana)
- [ ] Add distributed tracing (Jaeger)
- [ ] Kubernetes manifests
- [ ] CI/CD pipeline

## 📄 License

Private project - All rights reserved

## 👥 Contributing

This is a private project. Please contact the repository owner for contribution guidelines.

---

Built with ❤️ using TypeScript, NATS, and PostgreSQL
