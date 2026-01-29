# Critical Fixes Applied - Position Closing Now Works

## Problem Summary
After the Kalshi-style schema migration, positions weren't closing to zero because:
1. **Wrong column names** in queries (old: `yes_pts`, `remaining_contracts`, `maker_id`; new: `limit_price_yes_pts`, `qty_remaining_micros`, `maker_user_id`)
2. **Wrong exit price** in PositionLotsService (used lot entry price instead of trade price)
3. **Wrong position source** in PositionsController (computed from trades history instead of positions snapshot)
4. **Unnecessary CASE ordering** in cashout orderbook sweep

## Fixes Applied

### 1. PositionLotsService - Fixed Exit Price Bug ✅

**File**: `apps/api-gateway/src/services/position-lots.service.ts`

**Problem**: When closing lots, the service used the lot's entry price as the exit price, making realized PnL always zero and preventing proper lot consumption.

```typescript
// BEFORE (WRONG)
const entryYesPts = parseInt(lot.entry_yes_pts);
const exitYesPts = entryYesPts; // Bug: exit = entry!

// AFTER (CORRECT)
private async processUserTrade(
  userId: string,
  marketId: string,
  tradeId: string,
  side: string,
  contractsMicros: bigint,
  tradePriceYesPts: number, // ← Renamed from entryYesPts
  feePence: number,
  executedAt: string
) {
  // ...
  const lotEntryYesPts = parseInt(lot.entry_yes_pts);
  const exitYesPts = tradePriceYesPts; // ← Use trade price!
  
  const pnlPerContract = lot.side === 'FOR'
    ? (exitYesPts - lotEntryYesPts) * CONTRACT_PAYOUT_PENCE_NUM / PRICE_SCALE_NUM
    : (lotEntryYesPts - exitYesPts) * CONTRACT_PAYOUT_PENCE_NUM / PRICE_SCALE_NUM;
}
```

**Impact**: Lots now properly consume with correct realized PnL calculation.

---

### 2. PositionsController - Use Positions Table Instead of Trades ✅

**File**: `apps/api-gateway/src/controllers/positions.controller.ts`

**Problem**: The `/positions/markets/:marketId/me` endpoint computed position by iterating all historical trades, which:
- Counted closed trades as still open
- Caused "phantom position" as trade history grew
- Didn't match the actual position snapshot

```typescript
// BEFORE (WRONG)
// Get all user's trades for this market
const trades = await this.databaseService.query(
  `SELECT price_yes_pts, qty_micros, maker_user_id, taker_user_id
   FROM trades WHERE market_id = $1 AND (maker_user_id = $2 OR taker_user_id = $2)`,
  [marketId, userId]
);
// Then iterate all trades to compute net position... ❌

// AFTER (CORRECT)
// Get position snapshot from positions table
const positionResult = await this.databaseService.query(
  `SELECT net_qty_micros, avg_open_price_yes_pts, realized_pnl_pence, fees_paid_pence
   FROM positions WHERE market_id = $1 AND user_id = $2`,
  [marketId, userId]
);

const netContractsMicros = BigInt(position.net_qty_micros || '0');
const avgEntryYesPts = parseInt(position.avg_open_price_yes_pts || '0');

// Get open lots for UI breakdown
const lotsResult = await this.databaseService.query(
  `SELECT side, entry_price_yes_pts, qty_remaining_micros
   FROM position_lots
   WHERE user_id = $1 AND market_id = $2 AND qty_remaining_micros > 0`,
  [userId, marketId]
);
```

**Impact**: Position now correctly shows only open lots, not historical trades.

---

### 3. CashoutController - Simplified Orderbook Sweep ✅

**File**: `apps/api-gateway/src/controllers/cashout.controller.ts`

**Problem**: Orderbook query used complex CASE expression for sorting when simple ASC/DESC would work.

```typescript
// BEFORE (COMPLEX)
ORDER BY CASE 
  WHEN $2 = 'FOR' THEN limit_price_yes_pts 
  ELSE (10000000 - limit_price_yes_pts) 
END DESC

// AFTER (SIMPLE)
const sortDirection = oppositeSide === OrderSide.FOR ? 'DESC' : 'ASC';
ORDER BY limit_price_yes_pts ` + sortDirection + `
```

**Logic**:
- When closing LAY (short YES), we sweep FOR bids (buying YES) → best bid = highest price → `DESC`
- When closing FOR (long YES), we sweep LAY asks (selling YES) → best ask = lowest price → `ASC`

**Also Fixed**: Column name from `qty_remaining_micros` alias consistency.

---

### 4. DatabaseService - Updated All Market Queries ✅

**File**: `apps/api-gateway/src/database/database.service.ts`

**Fixed Methods**:

#### getOrdersByMarketId()
```typescript
// BEFORE
SELECT yes_pts, original_contracts, remaining_contracts FROM orders

// AFTER
SELECT 
  limit_price_yes_pts as "yesPts",
  qty_original_micros as "originalContracts",
  qty_remaining_micros as "remainingContracts"
FROM orders
```

#### getTradesByMarketId()
```typescript
// BEFORE
SELECT yes_pts, cost_pence, contracts, maker_id, taker_id FROM trades

// AFTER
SELECT 
  price_yes_pts as yes_pts,
  notional_pence as cost_pence,
  qty_micros as contracts,
  maker_user_id as maker_id,
  taker_user_id as taker_id
FROM trades
```

**Impact**: Frontend can now load orderbook and trades without errors.

---

## Complete Column Mapping Reference

| Old Column Name | New Column Name | Table |
|----------------|----------------|-------|
| `yes_pts` | `limit_price_yes_pts` | orders |
| `original_contracts` | `qty_original_micros` | orders |
| `remaining_contracts` | `qty_remaining_micros` | orders |
| `yes_pts` | `price_yes_pts` | trades |
| `cost_pence` | `notional_pence` | trades |
| `contracts` | `qty_micros` | trades |
| `maker_id` | `maker_user_id` | trades |
| `taker_id` | `taker_user_id` | trades |
| `wallet_accounts` | `wallets` | (table rename) |
| `positions_snapshot` | `positions` | (table rename) |

---

## Testing Checklist

### Position Closing Flow
1. ✅ Open position (FOR or LAY)
2. ✅ Check `/positions/me` shows correct `net_qty_micros`
3. ✅ Get cashout quote → returns fillable price
4. ✅ Execute cashout → IOC order placed
5. ✅ Matching engine fills against orderbook
6. ✅ PositionLotsService consumes lots with correct exit price
7. ✅ Position snapshot updates with `net_qty_micros = 0`
8. ✅ `/positions/me` now shows zero position

### Database Queries
1. ✅ Orderbook loads without `yes_pts` error
2. ✅ Trades load without `maker_id` error
3. ✅ Position queries return from `positions` table
4. ✅ Cashout sweep queries use `limit_price_yes_pts`

---

## Key Insight: Three-Layer Position Architecture

```
┌─────────────────────────────────────────────────┐
│ Layer 1: trades (immutable history)            │
│ - Every fill creates a trade row               │
│ - Columns: price_yes_pts, qty_micros, etc.     │
└─────────────────────────────────────────────────┘
                    ↓ consumed by
┌─────────────────────────────────────────────────┐
│ Layer 2: position_lots (FIFO inventory)        │
│ - Opening trade creates lot                    │
│ - Closing trade consumes lot (FIFO)            │
│ - Tracks: entry_price_yes_pts,                 │
│   qty_remaining_micros, realized_pnl_pence     │
└─────────────────────────────────────────────────┘
                    ↓ aggregated to
┌─────────────────────────────────────────────────┐
│ Layer 3: positions (snapshot/cache)            │
│ - One row per user/market                      │
│ - Tracks: net_qty_micros,                      │
│   avg_open_price_yes_pts, realized_pnl_pence   │
│ - THIS is the source of truth for UI/API       │
└─────────────────────────────────────────────────┘
```

**Critical Rule**: Never compute position from trades table. Always read from `positions` table.

---

## Files Modified (This Session)

1. `apps/api-gateway/src/services/position-lots.service.ts` - Fixed exit price bug
2. `apps/api-gateway/src/controllers/positions.controller.ts` - Switched to positions table
3. `apps/api-gateway/src/controllers/cashout.controller.ts` - Simplified orderbook query
4. `apps/api-gateway/src/database/database.service.ts` - Updated market queries

---

## Result

✅ **Positions now close to zero**
✅ **No more phantom positions from historical trades**
✅ **Realized PnL calculated correctly**
✅ **FIFO lot consumption works**
✅ **Frontend loads without column errors**
