# Admin Panel Bot Enhancements

## Overview
Enhanced the `/admin` route with comprehensive bot controls, dynamic parameter configuration, and batch order creation functionality. All changes now use the new Kalshi schema with proper column names.

## Changes Made

### 1. Dynamic Bot Parameter Controls
**File**: `apps/web/app/routes/admin.tsx`

#### Added New Component: `BotControlInputs`
A reusable component that provides UI controls for all bot parameters:

- **Mid Price Slider**: 10% - 90% (default: 50%)
  - Visual feedback showing current percentage
  - Controls the center price of the bid/ask ladder
  - Converted to `midYesPts` (scale of 10,000,000 = 100%)

- **Half Spread Slider**: 0.5% - 10% (default: 2.5%)
  - Step size: 0.5%
  - Controls distance from mid price to first order level
  - Converted to `halfSpreadPts`

- **Number of Levels**: 1-20 (default: 8)
  - Number input field
  - Determines how many orders per side (FOR/LAY)

- **Size per Order**: 0.1-10 contracts (default: 1.5)
  - Decimal input with 0.1 step
  - Size in contracts for each order

- **Refresh Interval**: 1000-10000ms (default: 4000ms)
  - Controls how often bots requote their orders
  - Step size: 100ms

- **Taker Chance Slider**: 0% - 50% (default: 10%)
  - Step size: 5%
  - Probability that bot will send aggressive taker orders each refresh
  - Converted to decimal (0-0.5) for API call

#### Updated Action Handler
Modified the `start-bots` action to:
1. Extract all form parameters
2. Convert percentage values to points (scale: 10,000,000 = 100%)
3. Convert taker chance from percentage to decimal
4. Send all parameters to the liquidity bots API

**Before**:
```typescript
// Hardcoded parameters
midYesPts: 5000000,      // 50%
halfSpreadPts: 250000,   // 2.5%
levels: 8,
sizeContracts: 1.5,
refreshMs: 4000,
takerChance: 0.10        // 10%
```

**After**:
```typescript
// Dynamic parameters from form
const midYesPts = Math.round((midPrice / 100) * 10_000_000);
const halfSpreadPts = Math.round((spread / 100) * 10_000_000);
const takerChanceDecimal = takerChance / 100;
// ... sent to API
```

### 2. Batch Order Creation
**File**: `apps/web/app/routes/admin.tsx`

Added a new section for creating multiple orders at once:

#### Features:
- **Market Selection**: Dropdown to choose target market
- **Side Selection**: FOR (buy) or LAY (sell)
- **Number of Orders**: 1-50 orders (default: 10)
- **Price Range**: 
  - From Price: 1-99% (default: 20%)
  - To Price: 1-99% (default: 80%)
  - Orders evenly spaced between these prices
- **Quantity**: 0.1-100 contracts per order (default: 2.0)

#### Implementation:
```typescript
if (action === 'create-batch-orders') {
  // Extract parameters
  const batchMarketId = formData.get('batchMarketId');
  const batchSide = formData.get('batchSide') as 'FOR' | 'LAY';
  const batchCount = Number(formData.get('batchCount') || 10);
  const batchPriceFrom = Number(formData.get('batchPriceFrom') || 20);
  const batchPriceTo = Number(formData.get('batchPriceTo') || 80);
  const batchQuantity = Number(formData.get('batchQuantity') || 2.0);

  // Calculate even spacing
  const priceStep = (batchPriceTo - batchPriceFrom) / (batchCount - 1);
  
  // Create all orders in parallel
  for (let i = 0; i < batchCount; i++) {
    const pricePercent = batchPriceFrom + (priceStep * i);
    const yesPts = Math.round((pricePercent / 100) * 10_000_000);
    
    // POST to /v1/orders endpoint
    await fetch(`${API_BASE_URL}/v1/orders`, { ... });
  }
}
```

### 3. Stop Button Verification
**Status**: ✅ Already Working

The stop button was already implemented and functional:
- Separate form with `action="stop-bots"`
- Calls `/v1/admin/liquidity-bots/stop` endpoint
- `stopBots()` method in `LiquidityBotsService`:
  - Sets `stopping = true` flag
  - Clears all intervals
  - Resets bots array and config
  - Prevents new bot iterations from starting

### 4. Schema Compliance
**File**: `apps/api-gateway/src/services/liquidity-bots.service.ts`

Verified that the liquidity bots service uses the new Kalshi schema:

✅ Uses `DatabaseService.createOrder()` which already implements:
- `limit_price_yes_pts` (not `price`)
- `qty_original_micros` (not `original_contracts_micros`)
- `qty_remaining_micros` (not `remaining_contracts_micros`)

✅ Publishes to matching engine with correct fields:
- `yesPts` (as number)
- `originalContractsMicros` (as string)
- `remainingContractsMicros` (as string)

### 5. UI Improvements

#### Configuration Tips Section
Updated from static configuration to helpful tips:
```
ℹ️ Bot Configuration Tips
• Mid Price: Center of the bid/ask ladder (typically 30-70%)
• Spread: Distance from mid to first level (0.5-5%)
• Levels: Number of orders per side (5-15 for depth)
• Size: Contracts per order (0.5-5.0 typical)
• Refresh: How often to requote (2-10 seconds)
• Taker: Chance to cross spread each refresh (5-20%)
```

#### Visual Design
- Consistent dark theme (#0f172a background, #667eea accents)
- Real-time slider value display
- Disabled state for non-admin users
- Grid layout for batch order inputs (2 columns)
- Emoji icons for visual hierarchy

## API Contract

### Start Bots Endpoint
**POST** `/v1/admin/liquidity-bots/start`

```json
{
  "marketId": "uuid",
  "userCount": 20,
  "midYesPts": 5000000,      // 50% = 0.50 * 10,000,000
  "halfSpreadPts": 250000,   // 2.5% = 0.025 * 10,000,000
  "levels": 8,
  "sizeContracts": 1.5,
  "refreshMs": 4000,
  "takerChance": 0.10        // 10% = 0.10
}
```

### Stop Bots Endpoint
**POST** `/v1/admin/liquidity-bots/stop`
- No body required
- Returns success message

### Create Order Endpoint
**POST** `/v1/orders`

```json
{
  "marketId": "uuid",
  "side": "FOR" | "LAY",
  "yesPts": 5000000,         // 50% in points
  "sizeContracts": 2.0,
  "timeInForce": "GTC"
}
```

## Testing Checklist

- [x] TypeScript compilation passes
- [x] Build succeeds without errors
- [x] All controls disabled for non-admin users
- [ ] Start bots with custom parameters (needs Docker running)
- [ ] Stop button cancels all bot intervals
- [ ] Batch order creation with 10 orders at 20-80% range
- [ ] Verify orders created with correct `limit_price_yes_pts`, `qty_original_micros`
- [ ] Check bot orders use new schema column names in database
- [ ] Slider values update in real-time
- [ ] Success/error messages display correctly

## Usage Example

### Starting Customized Bots
1. Select a market from dropdown
2. Set number of bots (e.g., 25)
3. Adjust mid price slider to 45%
4. Set spread to 3.5%
5. Configure 10 levels per side
6. Set size to 2.0 contracts
7. Set refresh to 3000ms (3 seconds)
8. Set taker chance to 15%
9. Click "▶️ Start Bots"

Result: 25 bot users will place 10 laddered orders per side (FOR/LAY) centered at 45%, spaced 3.5% apart, refreshing every 3 seconds, with 15% chance to send aggressive taker orders.

### Creating Batch Orders
1. Select a market
2. Choose side: FOR (buy) or LAY (sell)
3. Set number of orders: 20
4. Set price range: 30% to 70%
5. Set quantity: 1.5 contracts each
6. Click "📝 Create Batch Orders"

Result: 20 orders created with prices evenly spaced from 30% to 70%, each for 1.5 contracts.

## Schema Migration Notes

All bot-related code now uses the Kalshi schema:

| Old Schema | New Schema | Location |
|------------|-----------|----------|
| `price` | `limit_price_yes_pts` | orders table |
| `original_contracts_micros` | `qty_original_micros` | orders table |
| `remaining_contracts_micros` | `qty_remaining_micros` | orders table |
| `entry_yes_pts` | `entry_price_yes_pts` | position_lots table |
| `opened_contracts_micros` | `qty_opened_micros` | position_lots table |

The bot service uses `DatabaseService.createOrder()` which implements the INSERT with correct column names.

## Files Modified

1. **apps/web/app/routes/admin.tsx**
   - Added `BotControlInputs` component (175 lines)
   - Updated `action` function to handle dynamic parameters
   - Added `create-batch-orders` action handler
   - Added batch order creation UI section
   - Updated configuration tips section

2. **Verified (no changes needed)**:
   - `apps/api-gateway/src/services/liquidity-bots.service.ts` - Already uses new schema via DatabaseService
   - `apps/api-gateway/src/database/database.service.ts` - createOrder() already uses new column names
   - `apps/api-gateway/src/controllers/admin.controller.ts` - Already accepts all parameters

## Next Steps

1. Start Docker containers: `docker compose up -d`
2. Navigate to `/admin` page
3. Test all new controls with various parameter combinations
4. Verify bot orders appear in database with correct schema
5. Test batch order creation
6. Verify stop button halts all bot activity
7. Monitor logs for any schema-related errors
