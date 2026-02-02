# Market Order Slippage Protection

## Overview

Market orders (IOC orders) now include slippage protection to prevent fills at extreme prices when liquidity is poor or the orderbook is moving fast.

## How It Works

### Default Behavior

When placing an IOC (Immediate-Or-Cancel) market order without specifying a price limit:

- **Default Slippage**: 5% (500,000 probability points)
- The order will try to fill within the slippage tolerance
- Any unfilled portion is cancelled (IOC behavior)

### Examples

#### FOR (Buy YES) Market Order
```
User wants to buy YES at market price ~50% with default 5% slippage
- Base price: 50% = 5,000,000 pPts
- Slippage: +5% = +500,000 pPts
- Max price: 55% = 5,500,000 pPts
- Will match any LAY order at 55% or better
```

#### LAY (Sell YES) Market Order
```
User wants to sell NO at market price ~50% with default 5% slippage
- Base NO price: 50% = 5,000,000 pPts
- Converts to YES: 50% = 5,000,000 pPts
- Slippage: -5% = -500,000 pPts (allows higher YES prices)
- Min YES price: 45% = 4,500,000 pPts
- Will match any FOR order at 45% or better
```

## API Usage

### Basic Market Order (uses default 5% slippage)
```json
{
  "marketId": "uuid",
  "side": "FOR",
  "pPts": 5000000,
  "liabilityPence": 10000,
  "timeInForce": "IOC"
}
```

### Market Order with Custom Slippage
```json
{
  "marketId": "uuid",
  "side": "FOR",
  "pPts": 5000000,
  "liabilityPence": 10000,
  "timeInForce": "IOC",
  "maxSlippagePts": 200000
}
```
*This example uses 2% (200,000 pPts) slippage instead of default 5%*

### Limit Orders (GTC)
```json
{
  "marketId": "uuid",
  "side": "FOR",
  "pPts": 5000000,
  "liabilityPence": 10000,
  "timeInForce": "GTC"
}
```
*GTC orders ignore maxSlippagePts and use the exact pPts specified*

## Slippage Values

| Slippage % | Probability Points | Use Case |
|------------|-------------------|----------|
| 1% | 100,000 | Tight slippage for liquid markets |
| 2% | 200,000 | Conservative market orders |
| 5% | 500,000 | **Default** - balanced protection |
| 10% | 1,000,000 | High slippage for illiquid markets |
| 20% | 2,000,000 | Maximum flexibility |

## Preventing Bad Fills

### Problem Without Slippage Protection
```
Before: IOC order at extreme price (99.99%) tries to fill anywhere
Result: Fills at terrible price (80% when market is at 50%)
```

### Solution With Slippage Protection
```
After: IOC order at 50% with 5% slippage
Result: 
- Fills between 45%-55% ✓
- Cancels if no liquidity in range ✓
- Prevents bad fills at 80% ✓
```

## Implementation Details

### Price Calculation

**FOR Side (Buy YES)**:
```
yesPts = min(pPts + maxSlippagePts, PRICE_SCALE - 1)
```

**LAY Side (Sell YES)**:
```
baseYesPts = PRICE_SCALE - pPts
yesPts = max(baseYesPts - maxSlippagePts, 1)
```

### Constants
```typescript
PRICE_SCALE = 10_000_000  // 7 decimal places
DEFAULT_MARKET_SLIPPAGE_PTS = 500_000  // 5%
```

## Logs

Market orders now log slippage calculations:
```
[OrdersController] Market order FOR: pPts=5000000 + slippage=500000 => yesPts=5500000
[OrdersController] Market order LAY: NO pPts=5000000 => YES base=5000000 - slippage=500000 => yesPts=4500000
```

## Comparison to Traditional Exchanges

| Feature | Traditional | This Implementation |
|---------|-------------|-------------------|
| Market Order | Fills at any price | Fills within slippage |
| Slippage | Optional parameter | Default 5% |
| Protection | Stop-loss orders | Built-in to IOC |
| Cancellation | Manual | Automatic (IOC) |

## Testing

### Test Case 1: Market order fills within slippage
```
Given: Orderbook has LAY at 52%
When: User places FOR market order at 50% with 5% slippage
Then: Order fills at 52% (within 55% limit) ✓
```

### Test Case 2: Market order cancels when outside slippage
```
Given: Orderbook has LAY at 60%
When: User places FOR market order at 50% with 5% slippage
Then: Order cancels (60% > 55% limit) ✓
```

### Test Case 3: Limit order ignores slippage
```
Given: User specifies timeInForce=GTC
When: User places order with maxSlippagePts
Then: Order uses exact pPts, ignores slippage ✓
```

## Migration Notes

### Existing IOC Orders
- All existing IOC orders continue to work
- Default 5% slippage applied automatically
- No breaking changes

### Frontend Integration
```typescript
// Market order
await placeOrder({
  marketId,
  side: 'FOR',
  pPts: currentMidPrice,
  liabilityPence,
  timeInForce: 'IOC',
  maxSlippagePts: 500_000  // Optional, defaults to 5%
});

// Limit order (unchanged)
await placeOrder({
  marketId,
  side: 'FOR',
  pPts: exactPrice,
  liabilityPence,
  timeInForce: 'GTC'  // No slippage applied
});
```

## Related Files

- [apps/api-gateway/src/dto/index.ts](../apps/api-gateway/src/dto/index.ts) - Schema definition
- [apps/api-gateway/src/controllers/orders.controller.ts](../apps/api-gateway/src/controllers/orders.controller.ts) - Implementation
- [docs/LOGGING.md](./LOGGING.md) - Logging configuration

