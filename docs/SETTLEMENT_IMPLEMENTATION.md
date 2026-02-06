# Market Settlement Implementation Guide

## Overview

The settlement feature allows administrators to resolve markets (declare winners) and distribute payouts to winning positions. This document explains how settlement works and how to use it.

## Settlement Flow

### 1. Trade Settlement (Automatic)
**Already implemented** - happens during order matching:
- When orders match, funds move from "open order lock" → "position lock"
- Handled by Rust clearing service in `rust-exchange/src/clearing.rs`
- Users' wallets are immediately debited and positions are tracked

### 2. Market Resolution (Manual)
**Newly implemented** - happens when market outcome is decided:
- Admin declares winner (YES or NO)
- System calculates payouts for all positions
- Winners receive full contract payout (£1.00 per contract)
- Losers lose their locked collateral (which goes to winners)
- Position locks are released

## Key Concepts

### Position Tracking
- Each trade creates `position_lots` entries
- Tracks: user, side (BUY_YES/SELL_YES), quantity, locked collateral
- BUY YES = betting on YES outcome
- SELL YES = betting on NO outcome (same as BUY NO)

### Payouts
```
CONTRACT_PAYOUT_PENCE = 100  // £1.00 per contract

Example with 10 contracts:
- Total payout: 10 contracts × £1.00 = £10.00
- BUY YES winners get £10.00 if YES wins
- SELL YES winners get £10.00 if NO wins
```

### Profit/Loss Calculation
```typescript
// If you bought YES at 60% (60p per contract)
Entry cost: 10 contracts × £0.60 = £6.00 (locked)
If YES wins: £10.00 payout = £4.00 profit
If NO wins: £6.00 lost (goes to NO bettors)

// If you sold YES at 60% (40p per contract)
Entry cost: 10 contracts × £0.40 = £4.00 (locked)
If NO wins: £10.00 payout = £6.00 profit
If YES wins: £4.00 lost (goes to YES bettors)
```

## Using the Settlement Feature

### Method 1: Admin UI (Recommended)

1. Navigate to `/admin` page
2. Scroll to "🏁 Market Settlement" section
3. **To Resolve a Market:**
   - Select market from dropdown
   - Choose winning outcome (YES or NO)
   - Add optional reason (e.g., "Match ended 2-1")
   - Click "✅ Resolve Market"
4. **To Void a Market:**
   - Select market from dropdown
   - Add required reason (e.g., "Match cancelled")
   - Click "❌ Void Market"

### Method 2: API Endpoint

**Resolve Market:**
```bash
POST /v1/admin/markets/resolve
Content-Type: application/json

{
  "marketId": "uuid-here",
  "winningOutcome": "YES",  // or "NO"
  "reason": "Match ended 2-1"  // optional
}

Response:
{
  "success": true,
  "message": "Market resolved - Winner: YES",
  "positionsSettled": 45
}
```

**Void Market:**
```bash
POST /v1/admin/markets/void
Content-Type: application/json

{
  "marketId": "uuid-here",
  "reason": "Match cancelled due to weather"  // required
}

Response:
{
  "success": true,
  "message": "Market voided - All funds returned",
  "positionsVoided": 45
}
```

## Implementation Details

### Database Changes
```sql
-- Market status updated
UPDATE markets 
SET status = 'SETTLED', 
    settlement_time = NOW()
WHERE id = $marketId;

-- Winner positions
UPDATE wallets
SET locked_pence = locked_pence - $lockedAmount,
    available_pence = available_pence + $payoutAmount
WHERE user_id = $userId;

-- Loser positions
UPDATE wallets
SET locked_pence = locked_pence - $lockedAmount
WHERE user_id = $userId;
```

### Files Modified

1. **apps/api-gateway/src/controllers/admin.controller.ts**
   - Added `POST /v1/admin/markets/resolve` endpoint
   - Added `POST /v1/admin/markets/void` endpoint
   - Implements payout calculation and wallet updates

2. **apps/web/app/routes/admin.tsx**
   - Added settlement UI section
   - Added action handlers for resolve/void
   - Market dropdown shows all available markets

## Testing Settlement

### 1. Create Test Scenario
```bash
# Start liquidity bots to create positions
POST /v1/admin/liquidity-bots/start
{
  "marketId": "your-market-id",
  "userCount": 10,
  "midYesPts": 5000000,  // 50%
  "halfSpreadPts": 250000,  // 2.5%
  "levels": 4,
  "sizeContracts": 5.0,
  "takerChance": 0.2
}

# Wait for bots to place orders and create trades
# Check positions: SELECT * FROM position_lots WHERE market_id = 'your-market-id';
```

### 2. Verify Pre-Settlement State
```sql
-- Check total locked funds
SELECT 
  user_id, 
  side,
  SUM(locked_pence) as total_locked,
  SUM(qty_micros) as total_contracts
FROM position_lots 
WHERE market_id = 'your-market-id'
GROUP BY user_id, side;
```

### 3. Resolve Market
```bash
POST /v1/admin/markets/resolve
{
  "marketId": "your-market-id",
  "winningOutcome": "YES",
  "reason": "Test resolution"
}
```

### 4. Verify Post-Settlement State
```sql
-- Market should be SETTLED
SELECT status, settlement_time FROM markets WHERE id = 'your-market-id';

-- All position locks should be released
SELECT SUM(locked_pence) FROM wallets;  -- Should decrease

-- Winners should have increased available balance
SELECT user_id, available_pence FROM wallets 
WHERE user_id IN (
  SELECT DISTINCT user_id FROM position_lots 
  WHERE market_id = 'your-market-id' AND side = 'BUY_YES'
);
```

## Edge Cases Handled

1. **Empty Markets**: Markets with no positions can be resolved (no-op)
2. **Partial Positions**: Handles fractional contracts correctly
3. **Multiple Position Lots**: Users with multiple trades are settled correctly
4. **Zero Quantity**: Position lots with qty_micros = 0 are skipped

## Future Enhancements

### Potential Additions
1. **Settlement Events**: Publish NATS events for settlement notifications
2. **Settlement History**: Track historical settlements in database
3. **Partial Settlements**: Support multi-outcome markets (not just binary)
4. **Automated Resolution**: Integrate with oracle/API for automatic resolution
5. **Settlement Disputes**: Allow appeals/corrections within time window
6. **Tax Reporting**: Generate win/loss reports for users

### Multi-Outcome Markets
Current implementation is for **binary markets only** (YES/NO). To support multi-outcome markets:

```typescript
// Instead of winningOutcome: 'YES' | 'NO'
{
  "marketId": "uuid",
  "resolvedOutcomes": [
    { "outcome": "Team A", "result": "WIN" },
    { "outcome": "Team B", "result": "LOSE" },
    { "outcome": "Draw", "result": "LOSE" }
  ]
}
```

## Security Considerations

1. **Admin Access Control**: 
   - Only whitelisted admin emails can resolve markets
   - See `ADMIN_EMAILS` array in admin.controller.ts

2. **Settlement Idempotency**:
   - Markets can only be settled once (status check)
   - Voiding a settled market requires manual intervention

3. **Wallet Integrity**:
   - All wallet updates are logged
   - Locked funds must match position lots before settlement

## Troubleshooting

### Issue: "Positions settled = 0"
**Cause**: No open positions in market
**Solution**: Check `position_lots` table for market_id

### Issue: Wallet balance mismatch
**Cause**: Position lots out of sync with wallet locks
**Solution**: Run audit query:
```sql
SELECT 
  pl.user_id,
  SUM(pl.locked_pence) as position_locked,
  w.locked_pence as wallet_locked
FROM position_lots pl
JOIN wallets w ON w.user_id = pl.user_id
WHERE pl.market_id = 'your-market-id'
GROUP BY pl.user_id, w.locked_pence
HAVING SUM(pl.locked_pence) != w.locked_pence;
```

### Issue: Market won't resolve
**Cause**: Already settled or invalid status
**Solution**: Check market status:
```sql
SELECT id, name, status, settlement_time FROM markets WHERE id = 'your-market-id';
```

## Related Documentation

- [Architecture](./architecture.md) - System overview
- [Position Tracking](./CLOB_POSITION_TRACKING.md) - How positions work
- [Wallet Service](./LOGGING.md) - Wallet management details
