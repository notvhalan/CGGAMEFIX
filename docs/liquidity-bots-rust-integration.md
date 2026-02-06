# Liquidity Bots - Rust Exchange Integration

## Changes Made

### 1. Updated Liquidity Bots Service
**File**: `apps/api-gateway/src/services/liquidity-bots.service.ts`

**Key Changes**:
- ✅ **Removed bot user creation** - Now uses existing bot users from database instead of creating new ones
- ✅ **Query existing bots** - Fetches bot users with `@bot.local` emails from the database
- ✅ **Rust Exchange HTTP API** - Replaced NATS messaging with direct HTTP calls to Rust exchange
- ✅ **Updated variable names** - Uses Rust exchange format (`risk_pence`, `limit_yes_pts`, `BuyYes`/`SellYes`)
- ✅ **Removed dependencies** - Removed NATS and OrderBook broadcast dependencies
- ✅ **Simplified order placement** - Orders go directly to Rust exchange at `http://localhost:3001/api/orders`

### 2. Updated Admin Controller
**File**: `apps/api-gateway/src/controllers/admin.controller.ts`

**Key Changes**:
- ✅ **New endpoint** - Added `POST /v1/admin/bot-users` to fetch available bot users
- Returns list of all users with `@bot.local` emails
- Shows bot ID, email, and name

### 3. Updated Admin Frontend
**File**: `apps/web/app/routes/admin.tsx`

**Key Changes**:
- ✅ **Load bot users** - Fetches available bot users on page load
- ✅ **Display bot count** - Shows how many bot users are available
- ✅ **Bot list view** - Added expandable details to view all available bots
- ✅ **Dynamic validation** - Updates max user count based on available bots
- ✅ **User feedback** - Shows warning if no bot users exist

### 4. Bot User Creation Script
**File**: `scripts/create-bot-users.sql`

**Purpose**:
- Creates 30 pre-configured bot users with `@bot.local` emails
- Each bot has a wallet with £10,000 GBP balance
- Can be run multiple times (uses `ON CONFLICT DO NOTHING`)

## How It Works Now

### Old Flow (Before):
1. Admin starts bots → Service creates new bot users
2. Service publishes orders to NATS
3. NATS sends to matching engine
4. Separate orderbook broadcast service

### New Flow (After):
1. Admin starts bots → Service queries existing bot users
2. Service calls Rust exchange HTTP API directly
3. Rust exchange handles matching and broadcasting
4. No NATS or separate broadcast needed

## Setup Instructions

### 1. Create Bot Users (First Time Only)

```bash
# Connect to your PostgreSQL database
psql -U your_user -d your_database

# Run the bot creation script
\i scripts/create-bot-users.sql
```

This will create 30 bot users that can be reused.

### 2. Configure Rust Exchange URL

Set the environment variable (default is `http://localhost:3001`):

```bash
export RUST_EXCHANGE_URL=http://localhost:3001
```

Or add to your `.env` file:
```
RUST_EXCHANGE_URL=http://localhost:3001
```

### 3. Start Services

```bash
# Terminal 1: Start Rust Exchange
cd rust-exchange
cargo run

# Terminal 2: Start API Gateway
cd apps/api-gateway
pnpm dev

# Terminal 3: Start Web Frontend
cd apps/web
pnpm dev
```

### 4. Use the Admin Panel

1. Navigate to `/admin` in your browser
2. Log in with an admin email
3. You'll see the number of available bot users
4. Click "View available bots" to see the list
5. Select number of bots to use (max = available bots)
6. Click "Start Bots"

## API Changes

### Rust Exchange Order Format

The service now sends orders using the Rust exchange format:

```typescript
{
  market_id: string,        // UUID of the market
  side: 'BuyYes' | 'SellYes', // Rust enum format
  risk_pence: number,       // Risk amount in pence
  limit_yes_pts: number,    // Price in points (7 decimal places)
  time_in_force: 'GTC' | 'IOC' // Time in force
}
```

### Response Format

```typescript
{
  order_id: string,           // UUID of created order
  status: string,             // Order status
  contracts_micros: number,   // Contracts in micros
  actual_risk_pence: number   // Actual risk after calculation
}
```

## Advantages of New Approach

### ✅ Reusable Bot Users
- Bot users persist between sessions
- No need to recreate users each time
- Faster startup time
- Consistent bot identities

### ✅ Direct HTTP Communication
- Simpler architecture (no NATS broker)
- Easier debugging with standard HTTP logs
- Works with Rust exchange directly
- Better error handling

### ✅ Better Admin UX
- See available bots before starting
- View bot details and count
- Clear feedback if no bots exist
- Dynamic validation

### ✅ Consistent Data Model
- Uses Rust exchange variable names
- Matches Rust exchange enum formats
- Aligned with new architecture

## Troubleshooting

### "No bot users found"
**Solution**: Run the `create-bot-users.sql` script to create bot users.

### Orders not appearing
**Solution**: 
1. Check Rust exchange is running on port 3001
2. Verify `RUST_EXCHANGE_URL` environment variable
3. Check Rust exchange logs for errors

### "Failed to place bot order"
**Solution**:
1. Verify bot users have sufficient balance
2. Check market ID exists in database
3. Check Rust exchange API logs

## Migration Guide

If you're upgrading from the old NATS-based system:

1. **Keep existing bot users** - The old bot users with `@bot.local` emails will work
2. **Stop old services** - Stop any NATS-dependent services
3. **Start Rust exchange** - Must be running before starting bots
4. **Update environment** - Set `RUST_EXCHANGE_URL` if not default
5. **Test with small bot count** - Start with 5-10 bots to verify it works

## Notes

- The Rust exchange must implement user authentication for production use
- Currently uses `X-User-Id` header as temporary auth (TODO: implement proper auth)
- Bot orders go directly to Rust exchange matching engine
- WebSocket broadcasts are handled by Rust exchange automatically
