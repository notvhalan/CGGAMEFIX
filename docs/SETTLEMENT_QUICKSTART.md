# Settlement Feature - Quick Start Guide

## What is Settlement?

Settlement is the final step where markets are resolved and winners get paid. Think of it like the end of a match when the bookmaker pays out winning bets.

## Quick Usage

### Via Admin UI (Easiest)

1. Go to http://localhost:5173/admin
2. Scroll to "🏁 Market Settlement" section
3. **Resolve Market (declare winner)**:
   - Select market
   - Choose YES or NO as winner
   - Click "✅ Resolve Market"
4. **Void Market (return all money)**:
   - Select market
   - Enter reason
   - Click "❌ Void Market"

### Via API

**Resolve:**
```bash
curl -X POST http://localhost:3000/v1/admin/markets/resolve \
  -H "Content-Type: application/json" \
  -d '{
    "marketId": "your-market-uuid",
    "winningOutcome": "YES",
    "reason": "Match ended 2-1"
  }'
```

**Void:**
```bash
curl -X POST http://localhost:3000/v1/admin/markets/void \
  -H "Content-Type: application/json" \
  -d '{
    "marketId": "your-market-uuid",
    "reason": "Match cancelled"
  }'
```

## How It Works

### Example: Match Outcome Market

**Initial State:**
- Market: "Will Team A win?"
- User Alice: Bought 10 YES contracts at 60p each = £6.00 locked
- User Bob: Sold 10 YES contracts at 60p each = £4.00 locked

**If Team A Wins (YES outcome):**
```
Alice (BUY YES):
  - Locked: £6.00 → Released
  - Payout: 10 contracts × £1.00 = £10.00
  - Profit: £10.00 - £6.00 = £4.00 ✅

Bob (SELL YES):
  - Locked: £4.00 → Released (to Alice)
  - Payout: £0.00
  - Loss: -£4.00 ❌
```

**If Team A Loses (NO outcome):**
```
Alice (BUY YES):
  - Locked: £6.00 → Released (to Bob)
  - Payout: £0.00
  - Loss: -£6.00 ❌

Bob (SELL YES):
  - Locked: £4.00 → Released
  - Payout: 10 contracts × £1.00 = £10.00
  - Profit: £10.00 - £4.00 = £6.00 ✅
```

## What Gets Settled

- ✅ **Positions**: All open position_lots for the market
- ✅ **Locked Funds**: Released from position locks
- ✅ **Payouts**: Winners get contract payout (£1.00 per contract)
- ✅ **Market Status**: Updated to SETTLED or CLOSED

## Testing the Feature

### 1. Create Test Market with Positions
```bash
# Start liquidity bots to create positions
curl -X POST http://localhost:3000/v1/admin/liquidity-bots/start \
  -H "Content-Type: application/json" \
  -d '{
    "marketId": "your-market-uuid",
    "userCount": 5,
    "midYesPts": 5000000,
    "halfSpreadPts": 250000,
    "levels": 4,
    "sizeContracts": 5.0,
    "takerChance": 0.2
  }'

# Wait 30 seconds for bots to create trades
```

### 2. Check Positions Before Settlement
```sql
SELECT 
  user_id,
  side,
  qty_micros / 1000000.0 as contracts,
  locked_pence / 100.0 as locked_pounds
FROM position_lots
WHERE market_id = 'your-market-uuid';
```

### 3. Resolve the Market
```bash
curl -X POST http://localhost:3000/v1/admin/markets/resolve \
  -H "Content-Type: application/json" \
  -d '{
    "marketId": "your-market-uuid",
    "winningOutcome": "YES"
  }'
```

### 4. Verify Settlement
```sql
-- Check market is settled
SELECT status, settlement_time FROM markets WHERE id = 'your-market-uuid';

-- Check wallets updated
SELECT 
  user_id,
  available_pence / 100.0 as available_pounds,
  locked_pence / 100.0 as locked_pounds
FROM wallets
WHERE user_id IN (
  SELECT DISTINCT user_id FROM position_lots WHERE market_id = 'your-market-uuid'
);
```

## Common Questions

### Q: What happens to partially filled orders?
**A:** Only matched positions (position_lots) are settled. Open orders remain untouched.

### Q: Can I reverse a settlement?
**A:** No - settlements are final. Use void for cancelled markets instead.

### Q: What if a market has no trades?
**A:** Settlement still works - it just settles 0 positions (no-op).

### Q: How do I handle a draw?
**A:** Use void market to return all funds. For multi-outcome support, see full documentation.

### Q: Who can resolve markets?
**A:** Only admin users (check `ADMIN_EMAILS` in admin.controller.ts).

## Files Changed

- ✅ `apps/api-gateway/src/controllers/admin.controller.ts` - API endpoints
- ✅ `apps/web/app/routes/admin.tsx` - UI and actions
- ✅ `docs/SETTLEMENT_IMPLEMENTATION.md` - Full documentation

## Next Steps

1. **Test with Real Data**: Use liquidity bots to create realistic positions
2. **Monitor Logs**: Check API logs for settlement details
3. **Verify Balances**: Run SQL queries to ensure wallet integrity
4. **Customize UI**: Add market filters, settlement history, etc.

## Need Help?

- See [SETTLEMENT_IMPLEMENTATION.md](./SETTLEMENT_IMPLEMENTATION.md) for detailed docs
- Check [admin.controller.ts](../apps/api-gateway/src/controllers/admin.controller.ts) for implementation
- Review [position tracking docs](./CLOB_POSITION_TRACKING.md) for position details
