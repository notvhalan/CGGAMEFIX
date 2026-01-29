# Admin Panel - Liquidity Bots

## Overview

The admin panel at `/admin` provides tools for managing liquidity in development/testing environments. The main feature is the **Liquidity Bot Swarm** that automatically seeds orderbook depth.

## Features

### 🤖 Liquidity Bot Swarm

Automatically creates bot users that act as market makers to provide orderbook liquidity.

**What it does:**
- Creates N test users with funded wallets (£10,000 each)
- Places laddered limit orders on both sides of the book
- Periodically cancels and requotes to keep prices fresh
- Occasionally sends taker IOC orders to generate trades
- Runs continuously until stopped

**Configuration:**
- **Market**: Select which market to seed
- **User Count**: Number of bot users (5-50, recommended: 15-25)
- **Midpoint**: 50% (5,000,000 pts)
- **Spread**: ±2.5% around midpoint
- **Ladder Levels**: 8 per side
- **Order Size**: 1.5 contracts per order
- **Refresh Interval**: 4 seconds
- **Taker Chance**: 10% per refresh cycle

## How to Use

1. **Navigate to `/admin`**
   - Must be logged in
   - Admin check currently based on email (configure in route)

2. **Select a Market**
   - Choose from the dropdown

3. **Set Bot Count**
   - Default: 20 bots
   - More bots = deeper orderbook
   - More bots = more system load

4. **Start Bots**
   - Click "▶️ Start Bots"
   - Bots will begin placing orders immediately
   - Refresh any market page to see liquidity

5. **Stop Bots**
   - Click "⏹️ Stop All Bots"
   - All bot intervals will be cleared
   - Existing orders remain in the book

## Architecture

### Backend (API Gateway)

**Files:**
- `apps/api-gateway/src/controllers/admin.controller.ts` - Admin endpoints
- `apps/api-gateway/src/services/liquidity-bots.service.ts` - Bot orchestration
- `apps/api-gateway/src/app.module.ts` - Module registration

**Endpoints:**
- `POST /v1/admin/liquidity-bots/start` - Start bot swarm
- `POST /v1/admin/liquidity-bots/stop` - Stop all bots

### Frontend (Remix)

**Files:**
- `apps/web/app/routes/admin.tsx` - Admin UI

## Bot Behavior

### Market Making Strategy

Each bot maintains a ladder of orders around the configured midpoint:

```
LAY @ 52.5% ┐
LAY @ 52.0% │
LAY @ 51.5% │
LAY @ 51.0% │ ← Asks (selling YES)
LAY @ 50.5% ┘

────────────── 50% midpoint

FOR @ 49.5% ┐
FOR @ 49.0% │
FOR @ 48.5% │ ← Bids (buying YES)
FOR @ 48.0% │
FOR @ 47.5% ┘
```

### Requoting Cycle

Every 4 seconds:
1. Cancel all existing orders
2. Publish cancel events to matching engine
3. Place new ladder at current prices
4. 10% chance to send an aggressive taker order

### Taker Orders

When triggered:
- Random side (50/50 FOR/LAY)
- Aggressive price (yesPts=1 or yesPts=9,999,999)
- Smaller size (0.75 contracts)
- IOC time-in-force (immediate fill or cancel)

## Security Notes

⚠️ **Development Only**
- This feature should NEVER be enabled in production
- No real authentication/authorization implemented yet
- Bot users are created with `@bot.local` emails
- Bots get £10,000 fake money each

**Production Safeguards Needed:**
- Proper admin role checking (database-backed)
- Environment variable to disable in production
- Rate limiting on bot creation
- Maximum bot count enforcement
- Audit logging

## Troubleshooting

### Bots won't start
- Check API Gateway logs for errors
- Ensure database is running
- Verify NATS connection
- Check wallet service is healthy

### Orders not appearing
- Verify matching engine is running
- Check NATS message flow
- Look for balance lock failures
- Ensure market exists

### Performance issues
- Reduce bot count (try 10-15)
- Increase refresh interval (try 8000ms)
- Reduce ladder levels (try 4-6)
- Check database query performance

## Future Enhancements

- [ ] Configurable strategies per bot
- [ ] Different bot types (aggressive, passive, random)
- [ ] Bot performance metrics dashboard
- [ ] Individual bot control (pause/resume)
- [ ] Historical bot trading data
- [ ] Multi-market support (bots across multiple markets)
- [ ] Dynamic spread adjustment based on volume
- [ ] Bot user cleanup endpoint
