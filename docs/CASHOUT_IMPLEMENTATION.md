# Multi-Leg Cashout System Implementation

## Overview
This implementation provides a production-ready cashout system that allows users to unwind positions by:
1. Matching against the orderbook first (best price)
2. Filling the remainder internally with the LP at worse pricing
3. Providing quotes before execution with slippage protection

## Architecture

### Components

#### 1. NATS Subjects (packages/shared-types/src/events.ts)
- `CASHOUT_QUOTE`: Request-reply subject for getting cashout quotes
- `CASHOUT_EXECUTE`: Request-reply subject for executing cashouts

#### 2. Interfaces (packages/shared-types/src/events.ts)
```typescript
CashoutQuoteRequest {
  marketId: string
  userId: string
  netContractsMicros: bigint // Signed position size
}

CashoutQuoteResponse {
  success: boolean
  error?: string
  marketId: string
  userId: string
  netContractsMicros: bigint
  bookFillContractsMicros: bigint    // From orderbook
  internalFillContractsMicros: bigint // From LP
  avgYesPts: number                   // Blended exit price
  cashoutValuePence: number           // Net proceeds (or cost)
  estimatedFeePence: number
  quoteTimestamp: number              // For validation
}

CashoutExecuteRequest {
  marketId: string
  userId: string
  netContractsMicros: bigint
  expectedAvgYesPts: number    // From quote
  maxSlippagePts: number       // Max allowed deviation
  quoteTimestamp: number       // Must be recent (< 30s)
}

CashoutExecuteResponse {
  success: boolean
  error?: string
  marketId: string
  userId: string
  actualAvgYesPts: number
  actualCashoutValuePence: number
  actualFeePence: number
  trades: Array<{
    tradeId: string
    isSynthetic: boolean
    contractsMicros: bigint
    yesPricePts: number
    premiumPence: number
  }>
}
```

#### 3. Core Logic (apps/matching-engine/src/cashout.ts)

**Helper Functions:**
- `toYesPts(side, pPts)`: Convert order price to canonical YES price
- `toPPts(side, yesPts)`: Convert canonical YES price back to order price
- `calcPremiumPence(yesPts, contractsMicros)`: Calculate premium in pence

**Quote Simulation:**
```typescript
simulateCashout(orderbook, request): CashoutQuoteResponse
```
- Snapshots orderbook without mutation
- Sweeps price levels until filled
- Calculates internal fill for remainder at mid ± spread
- Spread penalty increases with size (1% base + up to 5% for large fills)
- Returns blended average price and estimated value

**Execution:**
```typescript
executeCashout(orderbook, request): Match[]
```
- Creates IOC taker order at extreme price
- Matches against real orderbook levels
- Creates synthetic LP orders for remainder (marked `isSynthetic: true`)
- Returns array of matches to be processed

#### 4. Matching Engine Integration (apps/matching-engine/src/engine.ts)

**Subscription Handlers:**
- `subscribeToCashoutQuote()`: Listens on CASHOUT_QUOTE subject
- `subscribeToCashoutExecute()`: Listens on CASHOUT_EXECUTE subject

**Handler Methods:**
- `handleCashoutQuote(request)`: Generates quote using `simulateCashout()`
- `handleCashoutExecute(request)`: 
  - Validates quote age (< 30s)
  - Executes real orderbook sweep + LP fills
  - Checks slippage against expected price
  - Processes all matches
  - Returns execution results

**Synthetic Order Support:**
- Modified `processMatch()` to skip DB updates when `makerOrder.isSynthetic === true`
- Synthetic orders still create trades with LP_USER_ID
- Orderbook interface updated with `isSynthetic?: boolean` flag

**LP Configuration:**
- `LP_USER_ID = '00000000-0000-0000-0000-000000000000'`
- Internal fills use mid-market ± spread
- Spread = 1% base + size penalty (up to 5% for large fills)

#### 5. API Gateway (apps/api-gateway/src/controllers/cashout.controller.ts)

**Endpoints:**

`POST /v1/cashout/quote`
```typescript
Request:
{
  marketId: string
  netContractsMicros: string // BigInt as string
}

Response: CashoutQuoteResponse
```

`POST /v1/cashout/execute`
```typescript
Request:
{
  marketId: string
  netContractsMicros: string
  expectedAvgYesPts: number
  maxSlippagePts?: number    // Default: 50000 (0.5%)
  quoteTimestamp: number
}

Response: CashoutExecuteResponse
```

**BigInt Handling:**
- NATS client serializes BigInt as strings in `request()` method
- Matching engine deserializes strings back to BigInt in subscription handlers

## Usage Flow

### 1. Get Quote
```typescript
const response = await fetch('/v1/cashout/quote', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    marketId: 'market-123',
    netContractsMicros: '5000000' // 5 contracts
  })
});

const quote = await response.json();
// quote.cashoutValuePence = estimated proceeds
// quote.avgYesPts = blended exit price
// quote.quoteTimestamp = use for execute
```

### 2. Execute Cashout
```typescript
const response = await fetch('/v1/cashout/execute', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    marketId: 'market-123',
    netContractsMicros: '5000000',
    expectedAvgYesPts: quote.avgYesPts,
    maxSlippagePts: 50000, // 0.5% max slippage
    quoteTimestamp: quote.quoteTimestamp
  })
});

const result = await response.json();
// result.actualCashoutValuePence = actual proceeds
// result.trades = array of executed trades
```

## Pricing Logic

### Position Direction Mapping
- **Long (netContractsMicros > 0)**: Close by LAYing (selling YES)
- **Short (netContractsMicros < 0)**: Close by FORing (buying YES)

### Cashout Value Calculation
- **LAY (selling YES)**: `value = premium - fees` (positive = profit)
- **FOR (buying YES)**: `value = -(premium + fees)` (negative = cost)

### Internal LP Pricing
1. Calculate mid-market price:
   ```typescript
   mid = (bestBid.yesPts + bestAsk.yesPts) / 2
   ```

2. Apply spread penalty:
   ```typescript
   baseSpreadBps = 100 // 1%
   sizePenaltyBps = min(500, remainingContracts / 1_000_000) // Up to 5%
   totalSpreadBps = baseSpreadBps + sizePenaltyBps
   spreadPts = PRICE_SCALE * totalSpreadBps / 10000
   ```

3. Apply in unfavorable direction:
   - **LAY**: `internalYesPts = max(100_000, mid - spreadPts)` (lower = worse for seller)
   - **FOR**: `internalYesPts = min(9_900_000, mid + spreadPts)` (higher = worse for buyer)

## Safety Features

### Quote Validation
- Quotes expire after 30 seconds
- Execute requests must include recent quoteTimestamp
- Slippage protection checks actual price vs expected

### Risk Limits
- Internal fills use worse-than-market pricing to avoid toxic flow
- Size-based spread penalty discourages large internal fills
- Price clamped to 1%-99% range

### Audit Trail
- All trades recorded in database (including LP fills)
- `isSynthetic` flag distinguishes internal fills
- Trade events published to NATS for real-time updates

## Testing

### Manual Test Flow
1. Create positions by placing orders in the UI
2. Click "Details" in Positions panel to open modal
3. View position details and cashout quotes
4. Click "Cash Out" to execute at quoted price
5. Verify trades in database and UI updates

### Integration Tests
TODO: Add tests for:
- Quote generation with various orderbook states
- Execute with different slippage scenarios
- BigInt serialization/deserialization
- Quote expiry validation
- LP fill pricing correctness

## Next Steps

### Frontend Integration
1. Update PositionsModal to fetch cashout quotes on mount
2. Display "Cash Out: £X.XX" next to each position
3. Add "Cash Out" button to execute with confirmation dialog
4. Show quote breakdown (book vs internal fills)
5. Handle slippage warnings when price moves

### Risk Management
1. Add configuration for max LP exposure per market
2. Implement daily/weekly LP loss limits
3. Add circuit breakers for volatile markets
4. Monitor LP profitability and adjust spreads

### Performance Optimization
1. Cache recent quotes (with invalidation on book changes)
2. Batch multiple position cashouts into single transaction
3. Optimize orderbook sweep algorithm
4. Add metrics for quote/execute latency

## Files Changed

### New Files
- `apps/matching-engine/src/cashout.ts` - Core cashout logic
- `apps/api-gateway/src/controllers/cashout.controller.ts` - REST endpoints

### Modified Files
- `packages/shared-types/src/events.ts` - Added NATS subjects and interfaces
- `apps/matching-engine/src/orderbook.ts` - Added `isSynthetic` flag
- `apps/matching-engine/src/engine.ts` - Added subscription handlers and cashout methods
- `apps/api-gateway/src/app.module.ts` - Registered cashout controller
- `apps/api-gateway/src/nats/nats.client.ts` - Added BigInt serialization

## Configuration

### Environment Variables
No new environment variables required. Uses existing:
- `NATS_URL` - NATS server connection
- `DATABASE_URL` - PostgreSQL connection

### Constants
```typescript
LP_USER_ID = '00000000-0000-0000-0000-000000000000'
QUOTE_VALIDITY_SECONDS = 30
DEFAULT_MAX_SLIPPAGE_PTS = 50000 // 0.5%
BASE_SPREAD_BPS = 100 // 1%
MAX_SIZE_PENALTY_BPS = 500 // 5%
```
