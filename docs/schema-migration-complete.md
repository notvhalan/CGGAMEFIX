# Schema Migration Complete - Kalshi-Style Naming

## Summary
Successfully migrated all services to use Kalshi-style naming conventions across database schema and TypeScript code.

## Database Schema Changes (Previously Applied)

### Tables Renamed
- `wallet_accounts` → `wallets`
- `positions_snapshot` → `positions`

### Columns Renamed in `trades` table
- Added canonical columns: `price_yes_pts`, `qty_micros`, `notional_pence`
- Added canonical user references: `maker_user_id`, `taker_user_id`
- Backfilled 305 existing trades

### Columns Renamed in `orders` table
- `yes_pts` → `limit_price_yes_pts`
- `remaining_contracts` → `qty_remaining_micros`
- `original_contracts` → `qty_original_micros`

### Columns Renamed in `positions` table (was `positions_snapshot`)
- `net_contracts` → `net_qty_micros`
- `avg_entry_pts` → `avg_open_price_yes_pts`

### Columns Renamed in `position_lots` table
- `entry_yes_pts` → `entry_price_yes_pts`
- `opened_contracts_micros` → `qty_opened_micros`
- `remaining_contracts_micros` → `qty_remaining_micros`

## Code Changes Applied Today

### 1. Event Schema (`packages/shared-types/src/events.ts`)
```typescript
export interface TradeExecutedEvent extends BaseEvent {
  makerUserId: string;      // was makerId
  takerUserId: string;      // was takerId
  priceYesPts: number;      // was yesPricePts
  qtyMicros: string;        // was contractsMicros
  notionalPence: number;    // was sizePence
  takerSide: OrderSide;     // was side
  // ... fees remain same
}
```

### 2. Matching Engine Database Layer (`apps/matching-engine/src/db/pg.ts`)
- Updated `createTrade()` signature to use: `priceYesPts`, `qtyMicros`, `notionalPence`, `makerUserId`, `takerUserId`
- Updated INSERT statement to write to: `price_yes_pts`, `qty_micros`, `notional_pence`, `maker_user_id`, `taker_user_id`
- Updated `getOpenOrdersForMarket()` to SELECT: `limit_price_yes_pts as yes_pts`, `qty_remaining_micros as remaining_contracts`
- Updated `updateOrderStatus()` to UPDATE: `qty_remaining_micros`

### 3. Matching Engine Business Logic (`apps/matching-engine/src/engine.ts`)
- Updated `createTrade()` call parameters
- Updated `publishTradeExecuted()` to emit new event field names
- `rebuildOrderbook()` already uses aliased columns from getOpenOrdersForMarket()

### 4. Wallet Service (`apps/wallet-service/src/ledger.ts`)
- Updated `handleTradeExecuted()` to destructure: `makerUserId`, `takerUserId`, `notionalPence`, `takerSide`
- Updated trade settlement logic to use new field names
- Updated database queries to use `wallets` table (was `wallet_accounts`)

### 5. Position Lots Service (`apps/api-gateway/src/services/position-lots.service.ts`)
- Updated `processTrade()` to destructure: `makerUserId`, `takerUserId`, `takerSide`, `qtyMicros`, `priceYesPts`
- Updated snapshot upsert to use `positions` table (was `positions_snapshot`)
- Already uses correct `position_lots` column names from migration

### 6. Positions Controller (`apps/api-gateway/src/controllers/positions.controller.ts`)
- Updated trades query to SELECT: `price_yes_pts`, `qty_micros`, `notional_pence`, `maker_user_id`, `taker_user_id`
- Updated trade processing loop to use: `priceYesPts`, `qtyMicros`, `notionalPence`
- Updated orderbook query to use: `limit_price_yes_pts`, `qty_remaining_micros`
- Updated INSERT order statement to use: `limit_price_yes_pts`, `qty_remaining_micros`, `qty_original_micros`
- Updated all `wallet_accounts` references to `wallets`

### 7. Cashout Controller (`apps/api-gateway/src/controllers/cashout.controller.ts`)
- Updated orderbook query to SELECT: `limit_price_yes_pts as yes_pts`, `SUM(qty_remaining_micros)`
- Updated ORDER BY clause to use: `limit_price_yes_pts`
- Updated INSERT order statement to use: `limit_price_yes_pts`, `qty_remaining_micros`, `qty_original_micros`
- Updated all `wallet_accounts` references to `wallets`

### 8. Database Service (`apps/api-gateway/src/database/database.service.ts`)
- Updated CREATE TABLE to use `wallets` (was `wallet_accounts`)
- Updated all queries to reference `wallets` table

### 9. Liquidity Bots Service (`apps/api-gateway/src/services/liquidity-bots.service.ts`)
- Updated all `wallet_accounts` references to `wallets`

## Verification

All core services build successfully:
- ✅ `packages/shared-types` - Event schema updated
- ✅ `apps/matching-engine` - Database layer and event publishing aligned
- ✅ `apps/wallet-service` - Trade settlement aligned
- ✅ `apps/api-gateway` - Position tracking, cashout, and database service aligned

## Vocabulary Consistency

### Column Naming Convention
- **Price**: `price_yes_pts`, `limit_price_yes_pts`, `entry_price_yes_pts`, `avg_open_price_yes_pts`
- **Quantity**: `qty_micros`, `qty_remaining_micros`, `qty_opened_micros`, `qty_original_micros`, `net_qty_micros`
- **Money**: `notional_pence`, `realized_pnl_pence`, `fees_paid_pence`
- **Users**: `maker_user_id`, `taker_user_id`, `user_id`

### Event Field Naming Convention
- **Price**: `priceYesPts`
- **Quantity**: `qtyMicros`
- **Money**: `notionalPence`, `makerFeePence`, `takerFeePence`
- **Users**: `makerUserId`, `takerUserId`, `userId`
- **Side**: `takerSide` (OrderSide enum)

## Next Steps

1. **Test End-to-End Flow**
   - Place orders via API gateway
   - Verify matching engine creates trades with new schema
   - Confirm wallet service settles using new event fields
   - Check position-lots service consumes events correctly
   - Verify positions controller calculates signed contracts

2. **Frontend Updates** (if needed)
   - Check if frontend expects any old field names in API responses
   - Update TypeScript interfaces to match new schema

3. **Monitoring**
   - Watch for any null pointer errors from missing field name mappings
   - Monitor NATS messages to ensure events have correct field names
   - Check database for any orphaned old columns

## Benefits of This Migration

1. **Consistency**: All layers (DB, events, code) use same vocabulary
2. **Clarity**: Kalshi-style naming is industry-standard for CLOB exchanges
3. **Maintainability**: Easier to understand code when names match domain
4. **Type Safety**: TypeScript interfaces aligned with actual data structures
5. **Reduced Bugs**: No more confusion between yes_pts/price_yes_pts/limit_price_yes_pts

## Files Modified

### Core Schema
- `packages/shared-types/src/events.ts`

### Matching Engine  
- `apps/matching-engine/src/db/pg.ts`
- `apps/matching-engine/src/engine.ts`

### Wallet Service
- `apps/wallet-service/src/ledger.ts`

### API Gateway
- `apps/api-gateway/src/services/position-lots.service.ts`
- `apps/api-gateway/src/controllers/positions.controller.ts`
- `apps/api-gateway/src/controllers/cashout.controller.ts`
- `apps/api-gateway/src/database/database.service.ts`
- `apps/api-gateway/src/services/liquidity-bots.service.ts`

---

**Migration Status**: ✅ Complete
**Database Schema**: ✅ Aligned (54 SQL operations executed)
**Code Alignment**: ✅ Complete (9 TypeScript files updated)
**Build Status**: ✅ All services compile without errors
**Ready for Testing**: ✅ Yes
