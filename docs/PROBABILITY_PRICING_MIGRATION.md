# Probability Point Pricing Migration - Summary

## Overview
Successfully migrated the matching engine from odds-based pricing to FOR/LAY probability point pricing with 7 decimal places and 0.1% transaction fees.

## Migration Date
January 21, 2026

## Key Changes

### 1. Pricing Model
- **Old**: Decimal odds (e.g., 2.5, 3.0)
- **New**: Probability points with 7dp precision using integer math
  - `PRICE_SCALE = 10_000_000` (represents 1.0000000 or 100%)
  - Range: 1 to 9,999,999 probability points
  - FOR side: buying YES at pPts
  - LAY side: buying NO at (PRICE_SCALE - pPts)

### 2. Order Sides
- **Old**: BACK (for) / LAY (against)
- **New**: FOR (buying YES) / LAY (buying NO)
  - Canonicalization: Both converted to YES-price space for matching
  - `yesPts = FOR ? pPts : (PRICE_SCALE - pPts)`

### 3. Fee Structure
- **Fee Rate**: 0.1% (10 basis points)
- **Constants**: `FEE_BPS = 10`, `FEE_DENOM = 10_000`
- **Calculation**: `takerFeePence = floor(sizePence * FEE_BPS / FEE_DENOM)`
- **Distribution**: Taker pays fee, maker pays 0

### 4. Integer Math
All calculations use integers (no floats):
- Stakes in pence (e.g., £10.00 = 1000 pence)
- Prices in probability points (7dp precision)
- Fees in pence

## Files Changed

### Type Definitions (packages/shared-types)
1. **src/order.ts**
   - Added `OrderSide.FOR` and `OrderSide.LAY`
   - Added `PRICE_SCALE`, `FEE_BPS`, `FEE_DENOM` constants
   - Updated `Order` schema: `pPts`, `stakePence`, `remainingPence`
   - Updated `CreateOrderRequest` schema

2. **src/trade.ts**
   - Updated `Trade` schema: `yesPricePts`, `sizePence`, `makerFeePence`, `takerFeePence`

3. **src/events.ts**
   - Updated `TradeExecutedEvent`: `yesPricePts`, `sizePence`, fees
   - Updated `BookDeltaEvent`: `yesPricePts`, `sizeDeltaPence`
   - Updated `OrderAcceptedEvent`: `pPts`, `stakePence`

### Matching Engine (apps/matching-engine)
1. **src/orderbook.ts** (Complete rewrite)
   - Added `canonicalizePrice()` function
   - Updated `OrderbookOrder` interface with `pPts`, `yesPts`, `remainingPence`
   - Updated `Match` interface with `yesPricePts`, `sizePence`
   - Implemented canonical YES-price matching logic
   - Price-time priority with yesPts comparison
   - All sizes in pence (integer)

2. **src/engine.ts**
   - Added fee calculation functions: `calculateTakerFee()`, `calculateMakerFee()`
   - Updated `handleOrderSubmit()` for probability points
   - Updated `processMatch()` with fee calculation
   - Updated event publishing with new fields
   - Updated `rebuildOrderbook()` with BACK/FOR/LAY migration logic

3. **src/db/pg.ts**
   - Updated `DbOrder` interface for dual schema support (old + new columns)
   - Updated `DbTrade` interface with new columns
   - Updated `createTrade()` to insert `yes_price_pts`, `size_pence`, fees
   - Updated `updateOrderStatus()` to update `remaining_pence`

### Database Migration (scripts/)
4. **migrate-to-probability-pricing.sql** (NEW)
   - Adds `p_pts`, `stake_pence`, `remaining_pence` to orders table
   - Adds `yes_price_pts`, `size_pence`, `maker_fee_pence`, `taker_fee_pence` to trades table
   - Updates constraints for FOR/LAY sides and valid statuses
   - Creates indexes for performance
   - Creates `fee_revenue` table for fee tracking
   - Creates helper views for probability display
   - Migrates existing data (rough conversion from odds to probability)

## Key Code Sections

### Canonicalization (orderbook.ts)
```typescript
export function canonicalizePrice(side: OrderSide, pPts: number): number {
  if (side === OrderSide.FOR) {
    return pPts;
  } else { // OrderSide.LAY
    return PRICE_SCALE - pPts;
  }
}
```

### Fee Calculation (engine.ts)
```typescript
function calculateTakerFee(stakePence: number): number {
  return Math.floor((stakePence * FEE_BPS) / FEE_DENOM);
}

function calculateMakerFee(_stakePence: number): number {
  return 0; // Currently no maker fee
}
```

### Matching Logic (orderbook.ts)
```typescript
// Determine if order is bid or ask based on yesPts
const isBid = order.yesPts >= PRICE_SCALE / 2;

// Match when bid.yesPts >= ask.yesPts
if (order.yesPts >= bestAsk.yesPts) {
  const matchSizePence = Math.min(order.remainingPence, bestAsk.remainingPence);
  const matchYesPricePts = bestAsk.yesPts; // Maker price
  
  // Calculate fees
  const takerFeePence = calculateTakerFee(matchSizePence);
  const makerFeePence = calculateMakerFee(matchSizePence);
  
  // Create match
  matches.push({
    makerOrder: bestAsk,
    takerOrder: order,
    yesPricePts: matchYesPricePts,
    sizePence: matchSizePence,
  });
}
```

## Database Schema Changes

### Orders Table (New Columns)
- `p_pts INTEGER NOT NULL` - Probability points (1 to 9,999,999)
- `stake_pence INTEGER NOT NULL` - Stake in pence
- `remaining_pence INTEGER NOT NULL` - Remaining unfilled stake in pence
- Constraint: `CHECK (p_pts >= 1 AND p_pts <= 9999999)`
- Updated side constraint: `CHECK (side IN ('BACK', 'LAY', 'FOR', 'LAY'))`
- Updated status constraint: includes all valid statuses

### Trades Table (New Columns)
- `yes_price_pts INTEGER NOT NULL` - Canonical YES price
- `size_pence INTEGER NOT NULL` - Trade size in pence
- `maker_fee_pence INTEGER NOT NULL DEFAULT 0` - Maker fee
- `taker_fee_pence INTEGER NOT NULL DEFAULT 0` - Taker fee (0.1%)
- `executed_at TIMESTAMP` - Execution timestamp
- Removed: `price`, `size` (replaced by integer columns)

### Fee Revenue Table (New)
```sql
CREATE TABLE fee_revenue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id UUID NOT NULL REFERENCES trades(id),
  market_id UUID NOT NULL,
  maker_fee_pence INTEGER NOT NULL DEFAULT 0,
  taker_fee_pence INTEGER NOT NULL DEFAULT 0,
  total_fee_pence INTEGER GENERATED ALWAYS AS (maker_fee_pence + taker_fee_pence) STORED,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## Migration Steps

1. **Run Migration SQL**:
   ```bash
   psql -d your_database -f scripts/migrate-to-probability-pricing.sql
   ```

2. **Compile Packages**:
   ```bash
   npx tsc -b packages/shared-types
   npx tsc -b apps/matching-engine
   ```

3. **Restart Services**:
   - Restart matching-engine
   - Restart api-gateway (to pick up shared-types changes)
   - Restart any other services using shared-types

## Backward Compatibility

The migration maintains backward compatibility during transition:
- Database supports both old (odds, stake, remaining_amount) and new (p_pts, stake_pence, remaining_pence) columns
- `rebuildOrderbook()` converts BACK→FOR, LAY→LAY for old orders
- `updateOrderStatus()` updates both old and new columns

## Verification Steps

1. **Test Fee Calculation**:
   - 1000p stake → 1p taker fee (1000 * 10 / 10000 = 1)
   - 10000p stake → 10p taker fee (10000 * 10 / 10000 = 10)

2. **Test Canonicalization**:
   - FOR at pPts=7000000 → yesPts=7000000
   - LAY at pPts=3000000 → yesPts=7000000 (10000000-3000000)
   - Complement: FOR + LAY = PRICE_SCALE ✓

3. **Test Matching**:
   - FOR @ 6M yesPts matches LAY @ 4M yesPts (6M >= 6M, since LAY converts to 6M)
   - Price-time priority maintained

## Performance Considerations

- Integer math is faster than float operations
- Indexes added for matching performance
- Order book maintains single canonical price space (simpler matching)

## Next Steps

1. Update API Gateway to handle new order/trade formats
2. Update frontend to display probability points
3. Implement OHLC candles in market-data service using yesPricePts
4. Add fee revenue reporting dashboard
5. Create unit tests for canonicalization and fee calculations

## Testing Checklist

- [ ] Place FOR order and verify pPts stored correctly
- [ ] Place LAY order and verify canonicalization
- [ ] Match FOR and LAY orders
- [ ] Verify taker fee calculated at 0.1%
- [ ] Verify maker fee is 0
- [ ] Check trades table has correct yesPricePts and fees
- [ ] Verify complement rule: FOR(pPts) + LAY(PRICE_SCALE-pPts) = PRICE_SCALE
- [ ] Test with various stake amounts (edge cases: 1p, 9p, 10p, 100p, 1000p)
- [ ] Verify integer overflow doesn't occur (max: 10M * 10M = 100T, within int64)

## Known Limitations

1. Frontend still uses old odds format - needs update
2. API Gateway needs update to expose new fields
3. Market-data service aggregator needs update for yesPricePts
4. WebSocket events may need frontend changes
5. No unit tests yet for canonicalization logic

## Support

For issues or questions, check:
- Migration SQL output for errors
- TypeScript compilation errors
- Database constraint violations
- Matching engine logs for fee calculations
