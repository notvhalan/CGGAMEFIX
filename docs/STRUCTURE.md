# Complete Directory Tree

## Full Project Structure

```
CGGAMEFIX/
│
├── apps/                                    # Runnable microservices
│   ├── api-gateway/                        # REST + WebSocket API Gateway
│   │   ├── src/
│   │   │   ├── index.ts                    # Entry point
│   │   │   ├── server.ts                   # Express + WS server setup
│   │   │   ├── middleware/
│   │   │   │   └── auth.ts                 # JWT authentication
│   │   │   ├── routes/
│   │   │   │   ├── orders.ts               # Order submission/cancellation
│   │   │   │   └── markets.ts              # Market queries & orderbook
│   │   │   └── websocket/
│   │   │       └── handler.ts              # WebSocket connection handler
│   │   ├── tests/
│   │   │   └── README.md                   # Test placeholders
│   │   ├── Dockerfile                      # Multi-stage Docker build
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── matching-engine/                    # Orderbook & Matching Logic
│   │   ├── src/
│   │   │   ├── index.ts                    # Entry point
│   │   │   ├── engine.ts                   # Matching engine controller
│   │   │   └── orderbook.ts                # In-memory orderbook (price-time priority)
│   │   ├── tests/
│   │   │   └── README.md
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── wallet-service/                     # Fund Management & Ledger
│   │   ├── src/
│   │   │   ├── index.ts                    # Entry point
│   │   │   └── ledger.ts                   # Reserve/capture/release funds
│   │   ├── tests/
│   │   │   └── README.md
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── market-data/                        # OHLC Aggregation & Caching
│   │   ├── src/
│   │   │   ├── index.ts                    # Entry point
│   │   │   └── aggregator.ts               # Candle generation & book caching
│   │   ├── tests/
│   │   │   └── README.md
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── settlement-service/                 # Market Settlement
│       ├── src/
│       │   ├── index.ts                    # Entry point
│       │   └── settler.ts                  # Winner determination & payouts
│       ├── tests/
│       │   └── README.md
│       ├── Dockerfile
│       ├── package.json
│       └── tsconfig.json
│
├── packages/                                # Shared Libraries
│   ├── shared-types/                       # Common Types & Schemas
│   │   ├── src/
│   │   │   ├── index.ts                    # Barrel export
│   │   │   ├── order.ts                    # Order types & Zod schemas
│   │   │   ├── market.ts                   # Market types
│   │   │   ├── events.ts                   # Event types & NATS subjects
│   │   │   ├── user.ts                     # User & JWT types
│   │   │   └── trade.ts                    # Trade & candle types
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── shared-config/                      # Environment & Logging
│       ├── src/
│       │   ├── index.ts                    # Barrel export
│       │   ├── env.ts                      # Zod environment validation
│       │   └── logger.ts                   # Structured JSON logger
│       ├── package.json
│       └── tsconfig.json
│
├── scripts/                                 # Development Tools
│   ├── setup.sh                            # Initial environment setup
│   ├── dev.sh                              # Development runner
│   └── init-db.sql                         # PostgreSQL schema initialization
│
├── docs/                                    # Documentation
│   ├── architecture.md                     # System architecture & data flow
│   └── api.md                              # REST & WebSocket API docs
│
├── docker-compose.yml                      # Local infrastructure (Postgres, Redis, NATS)
├── package.json                            # Root workspace config
├── pnpm-workspace.yaml                     # pnpm workspace definition
├── tsconfig.json                           # Base TypeScript config
├── .eslintrc.js                            # ESLint configuration
├── .prettierrc                             # Prettier configuration
├── .env.example                            # Environment variable template
├── .gitignore                              # Git ignore rules
├── Makefile                                # Common development commands
└── README.md                               # Main documentation
```

## File Counts

- **Total Services**: 5 apps
- **Shared Packages**: 2
- **TypeScript Files**: ~30 source files
- **Configuration Files**: 15+
- **Documentation Files**: 3 markdown files

## Technology Stack

### Core
- **Language**: TypeScript 5.3
- **Runtime**: Node.js 20+
- **Package Manager**: pnpm 8

### Backend
- **API Framework**: Express.js
- **WebSocket**: ws library
- **Message Bus**: NATS (JetStream enabled)
- **Database**: PostgreSQL 16
- **Cache**: Redis 7

### Development
- **Build Tool**: tsc (TypeScript compiler)
- **Dev Runner**: tsx (TypeScript executor)
- **Linting**: ESLint + TypeScript ESLint
- **Formatting**: Prettier
- **Containerization**: Docker + Docker Compose

### Libraries
- **Validation**: Zod
- **Authentication**: jsonwebtoken
- **Database Client**: pg (node-postgres)
- **Redis Client**: redis (node-redis)
- **Security**: helmet, cors, compression
