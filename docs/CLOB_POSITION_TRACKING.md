# CLOB Position Tracking Implementation Guide

## Overview

This document describes the implementation of proper position tracking for a Central Limit Order Book (CLOB) exchange, following industry best practices from Kalshi and other prediction markets.

## Core Concepts

### 1. Closing Positions on a CLOB

**There is no "delete position" button** - closing a position means **placing an opposite order** until your net position reaches zero.

- Long position (bought YES) → Close by selling YES (LAY orders)
- Short position (sold YES) → Close by buying YES (FOR orders)

### 2. Signed Contracts Rule

Every trade must be represented as **signed contracts** from each participant's perspective:

```typescript
function signedQtyForUser(event, userId): bigint {
  const qty = BigInt(event.contractsMicros);
  
  // Taker's signed quantity
  const takerSigned = (event.side === "FOR") ? +qty : -qty;
  
  // Maker is opposite of taker
  const makerSigned = -takerSigned;
  
  return (userId === event.takerId) ? takerSigned : makerSigned;
}
```

**Rule:**
- FOR = +contracts (buying YES shares, long position)
- LAY = -contracts (selling YES shares, short position)
- Maker is always opposite of taker

### 3. Database Architecture

We maintain three layers:

#### Layer 1: `trades` (immutable audit log)
- Stores every fill forever
- Never modified or deleted
- Source of truth for historical activity

#### Layer 2: `position_lots` (open inventory tracking)
```sql
CREATE TABLE position_lots (
  lot_id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  market_id UUID NOT NULL,
  side VARCHAR(10) NOT NULL, -- 'FOR' or 'LAY'
  entry_yes_pts INTEGER NOT NULL,
  opened_from_trade_id UUID NOT NULL,
  opened_at TIMESTAMP NOT NULL,
  opened_contracts_micros BIGINT NOT NULL,
  remaining_contracts_micros BIGINT NOT NULL, -- Key field!
  realized_pnl_pence INTEGER NOT NULL DEFAULT 0,
  ...
);
```

**Key features:**
- Each fill creates a lot
- `remaining_contracts_micros` tracks open exposure
- FIFO consumption when closing positions
- Supports partial closes
- Enables "close this group" UI feature

#### Layer 3: `positions_snapshot` (optional cache)
```sql
CREATE TABLE positions_snapshot (
  user_id UUID NOT NULL,
  market_id UUID NOT NULL,
  net_contracts_micros BIGINT NOT NULL, -- Signed!
  avg_entry_yes_pts INTEGER NOT NULL,
  realized_pnl_pence INTEGER NOT NULL,
  fees_paid_pence INTEGER NOT NULL,
  PRIMARY KEY (user_id, market_id)
);
```

Fast read model for API responses. Can be rebuilt from lots + trades.

## Implementation Details

### Fixed Position Calculation

**Before (WRONG):**
```typescript
// Complex logic trying to determine if user bought or sold
if (isMaker) {
  if (side === 'FOR') {
    netContractsMicros -= contractsMicros; // Maker was LAY
  } else {
    netContractsMicros += contractsMicros; // Maker was FOR
  }
}
// ... similar for taker
```

**After (CORRECT):**
```typescript
// Simple signed contracts
const takerSigned = (side === 'FOR' || side === 'BACK') 
  ? contractsMicros 
  : -contractsMicros;
const makerSigned = -takerSigned;

const userSignedContracts = isTaker ? takerSigned : makerSigned;
netContractsMicros += userSignedContracts;
```

### FIFO Lot Consumption

On every `TRADE_EXECUTED` event:

1. **Same direction trade** (opening/increasing position):
   ```typescript
   // Create new lot
   await openLot(userId, marketId, tradeId, side, contracts, entryPrice);
   ```

2. **Opposite direction trade** (closing/reducing):
   ```typescript
   // Consume existing lots FIFO
   const lotsToClose = await getLots(userId, marketId, oppositeSide, 'ORDER BY opened_at ASC');
   
   for (const lot of lotsToClose) {
     const closeQty = min(remainingToClose, lot.remaining);
     const realizedPnl = calculatePnL(lot.entry, exitPrice, closeQty, lot.side);
     
     await updateLot(lot.id, -closeQty, +realizedPnl);
     remainingToClose -= closeQty;
   }
   ```

3. **Crossing zero** (flip from long to short or vice versa):
   ```typescript
   // Close all opposite lots, then open new lot with remainder
   await consumeAllLots(userId, marketId, oppositeSide);
   if (remainingToClose > 0) {
     await openLot(userId, marketId, tradeId, newSide, remaining, price);
   }
   ```

### Reduce-Only Cashout

The cashout controller now validates that close orders cannot increase positions:

```typescript
const netContracts = BigInt(netContractsMicros);

if (netContracts === 0n) {
  return { success: false, error: 'No open position to close' };
}

// Long position → must close with LAY
// Short position → must close with FOR
const closeSide = netContracts > 0n ? OrderSide.LAY : OrderSide.FOR;
```

This prevents the bug where "close position" accidentally grows the position if direction/sign gets confused.

## API Endpoints

### Get Position (with lots)

```typescript
GET /v1/positions/markets/:marketId/me

Response:
{
  marketId: "uuid",
  netContractsMicros: "50000000", // +50 contracts (long)
  avgEntryYesPts: 4500000, // 45%
  markYesPts: 5000000, // 50%
  unrealizedPnlPence: 250, // £2.50
  totalFeesPence: 10,
  canCashOut: true,
  
  // Lots grouped by entry price
  lots: [
    {
      side: "FOR",
      entryYesPts: 4500000,
      remainingContractsMicros: "30000000",
      lotCount: 2,
      firstOpened: "2026-01-29T10:00:00Z"
    },
    {
      side: "FOR",
      entryYesPts: 4700000,
      remainingContractsMicros: "20000000",
      lotCount: 1,
      firstOpened: "2026-01-29T11:00:00Z"
    }
  ]
}
```

### Close Position

```typescript
POST /v1/cashout/execute

Body:
{
  "marketId": "uuid",
  "netContractsMicros": "50000000", // Current position size
  "maxSlippagePts": 100000 // Optional, default 1%
}

Response:
{
  "success": true,
  "orderId": "uuid",
  "message": "Close order submitted as IOC. Unfilled portion will not rest on book."
}
```

The close order:
1. Cancels all resting orders (prevents reopening position)
2. Creates IOC order with extreme price (matches any available liquidity)
3. Publishes to matching engine
4. Matching engine generates `TRADE_EXECUTED` events
5. Position lots service consumes lots FIFO
6. Position updates automatically

**⚠️ Important: IOC Orders and Partial Fills**

The close order is submitted as **IOC (Immediate-Or-Cancel)**:
- Only fills what's available in the orderbook **right now**
- Unfilled portion is cancelled, does NOT rest on book
- If orderbook is thin, **position will only partially close**

Example scenario:
```
Your position: -96.96 contracts (short)
Available liquidity in orderbook: 20.20 contracts
Result after close: -76.76 contracts remaining
```

**Position stays open because `netContractsMicros ≠ 0`**

### Solutions for Thin Liquidity

1. **Run liquidity bots** (already implemented at `/admin`)
   - Bots provide depth on both sides of the book
   - Ensures close orders can fully fill

2. **Allow resting close orders** (future enhancement)
   ```typescript
   // Change from IOC to GTC
   timeInForce: TimeInForce.GTC // Good-Til-Cancel
   ```
   - Remainder stays on book until filled
   - Position closes gradually as orders match

3. **Split close into multiple orders** (future enhancement)
   - Sweep orderbook levels with slippage limits
   - Place multiple IOC orders at different price levels
   - Leave final remainder as GTC order

## UI Rendering

**Show position as open ONLY if:**
```typescript
position.netContractsMicros !== '0'
```

**Never render based on:**
- ❌ `netYesPence !== 0` (cash flow can be non-zero even when fully closed)
- ❌ Historical trades (trades are forever, but position may be closed)

**Render groups from lots:**
```typescript
// Only show lots where remaining > 0
const openLots = lots.filter(lot => BigInt(lot.remainingContractsMicros) > 0n);

// Group by entry price
const groups = groupBy(openLots, 'entryYesPts');
```

## Benefits of This Architecture

1. **Accurate position tracking** - No more "ghost positions" that can't be closed
2. **Support for partial closes** - Close 50% of a position, not all-or-nothing
3. **Group-based closing** - "Close all positions at 45%" feature
4. **FIFO accounting** - Proper tax lot tracking for realized gains
5. **Audit trail** - All trades preserved forever
6. **Fast queries** - Snapshot table for instant position lookups
7. **Reduce-only safety** - Impossible to accidentally increase exposure when closing

## Migration Path

1. ✅ Fix signed contracts in position calculation
2. ✅ Add reduce-only validation to cashout
3. ✅ Create `position_lots` table
4. ✅ Create `positions_snapshot` table (optional)
5. ✅ Wire up lots service to `TRADE_EXECUTED` events
6. 🔲 Backfill existing trades into lots (if needed)
7. 🔲 Update UI to render from lots, not trades
8. 🔲 Add "close group" button for specific entry prices

## Testing Checklist

- [ ] Open long position (FOR orders) → `netContractsMicros` > 0
- [ ] Open short position (LAY orders) → `netContractsMicros` < 0
- [ ] Close entire position (with sufficient liquidity) → `netContractsMicros` === 0, position disappears
- [ ] Close half position → `netContractsMicros` reduced by 50%, still shows
- [ ] Cross zero (long → short) → `netContractsMicros` flips sign
- [ ] Multiple lots at different prices → groups show correctly
- [ ] FIFO consumption → oldest lot consumed first
- [ ] Realized P&L accumulates correctly on partial closes
- [ ] Reduce-only prevents increasing position
- [ ] Snapshot table stays in sync with lots
- [ ] **IOC close with thin liquidity → partial fill, position remains open**
- [ ] **Ledger entries created successfully (no FK errors)**

## Troubleshooting

### Wallet Settlement FK Error

**Error**: `ledger_entries.wallet_id_fkey` - Key not present in table "wallets"

**Cause**: Mismatch between schema and code
- Code queries `wallet_accounts.id`
- FK references `wallets.id`
- Two separate wallet tables exist

**Fix Applied**:
```sql
-- Updated FK to reference wallet_accounts
ALTER TABLE ledger_entries DROP CONSTRAINT ledger_entries_wallet_id_fkey;
ALTER TABLE ledger_entries ADD CONSTRAINT ledger_entries_wallet_id_fkey 
  FOREIGN KEY (wallet_id) REFERENCES wallet_accounts(id);
```

**Schema Notes**:
- `wallet_accounts` - Active table with `balance`, `locked_balance`, `currency`
- `wallets` - Legacy table with `available_balance`, `reserved_balance`
- Should consolidate to single wallet table in future migration

### Position Won't Close to Zero

**Symptom**: After clicking "Close Position", `netContractsMicros` is still non-zero

**Cause**: IOC order + insufficient opposite liquidity

**Diagnosis**:
1. Check close quote response:
   ```json
   {
     "filledContracts": "20195880",
     "unfilledContracts": "96724120"
   }
   ```
   If unfilled > 0, orderbook lacks liquidity

2. Query orderbook depth:
   ```sql
   SELECT side, yes_pts, SUM(remaining_contracts)::bigint as total
   FROM orders 
   WHERE market_id = 'xxx' AND status IN ('OPEN', 'PARTIALLY_MATCHED')
   GROUP BY side, yes_pts
   ORDER BY yes_pts;
   ```

**Solutions**:
- Start liquidity bots from `/admin` panel
- Increase bot count or order sizes
- Consider allowing GTC close orders (leave remainder on book)

## References

- [Kalshi API Documentation - Get Positions](https://docs.kalshi.com/api-reference/portfolio/get-positions)
- This implementation follows Kalshi's model: trades are forever, positions are derived, closing is done via opposite orders

## Files Changed

### Core Implementation
- `apps/api-gateway/src/controllers/positions.controller.ts` - Fixed signed contracts calculation
- `apps/api-gateway/src/controllers/cashout.controller.ts` - Added reduce-only validation
- `apps/api-gateway/src/services/position-lots.service.ts` - FIFO lot consumption logic
- `apps/api-gateway/src/gateways/events.gateway.ts` - Wire TRADE_EXECUTED to lots service
- `apps/api-gateway/src/app.module.ts` - Registered PositionLotsService

### Database
- `scripts/create-position-lots.sql` - Schema for position_lots and positions_snapshot tables

### Frontend (TODO)
- `apps/web/app/components/PositionsModal.tsx` - Update to use lots for grouping
- `apps/web/app/routes/markets.$marketId.tsx` - Render from lots, not trades

## Summary

This implementation brings the position tracking system in line with industry standards. By using **signed contracts**, **FIFO lot consumption**, and **reduce-only close orders**, we ensure that positions are accurately tracked and can always be closed completely. The three-layer architecture (trades → lots → snapshot) provides both accuracy and performance while maintaining a complete audit trail.
