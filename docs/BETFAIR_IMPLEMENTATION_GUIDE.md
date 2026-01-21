# Betfair-Style Stake/Liability Implementation Guide

## Overview
This document provides the complete implementation plan for converting GameFix to Betfair-style stake/liability semantics with contracts-based matching.

## Status
✅ **Completed:**
1. Database migration SQL created (`docs/migrations/002-contracts-based-matching.sql`)
2. Shared-types updated with CONTRACT_SCALE and conversion functions

⏳ **Remaining:**
- API Gateway updates
- Matching Engine refactoring
- Frontend OrderTicket and OrderBook updates
- Tests

---

## Key Changes Summary

### 1. Database Schema (✅ DONE)
**File:** `docs/migrations/002-contracts-based-matching.sql`

**Orders table additions:**
- `yes_pts BIGINT NOT NULL` - Canonical YES probability
- `remaining_contracts BIGINT NOT NULL` - Remaining contract micros
- `original_contracts BIGINT NOT NULL` - Original contract micros
- `stake_pence BIGINT` - FOR orders only
- `liability_pence BIGINT` - LAY orders only

**Trades table additions:**
- `yes_pts BIGINT NOT NULL` - Execution price
- `contracts BIGINT NOT NULL` - Contract micros traded
- `cost_pence BIGINT NOT NULL` - Cash exchanged

**To apply:** Run `psql -U postgres -d betting_exchange -f docs/migrations/002-contracts-based-matching.sql`

### 2. Shared Types (✅ DONE)
**File:** `packages/shared-types/src/order.ts`

**New constants:**
```typescript
export const CONTRACT_SCALE = 1_000_000; // 1 contract = 1e6 microcontracts
export const CONTRACT_PAYOUT_PENCE = 100; // 1 contract pays £1 = 100p
```

**New conversion functions:**
```typescript
// FOR: stake → contracts
export function stakeToContracts(stakePence: number, yesPts: number): bigint

// LAY: liability → contracts  
export function liabilityToContracts(liabilityPence: number, yesPts: number): bigint

// Contracts → cost in pence
export function contractsCost(contractsMicros: bigint, yesPts: number): number

// Fee calculation
export function calculateTakerFee(costPence: number): number
```

**Updated schemas:**
- `OrderSchema` now includes `yesPts`, `originalContractsMicros`, `remainingContractsMicros`, `stakePence`, `liabilityPence`
- `CreateForOrderRequestSchema` - FOR orders with stake
- `CreateLayOrderRequestSchema` - LAY orders with liability
- `CreateOrderRequestSchema` - discriminated union

---

## 3. API Gateway Implementation (TODO)

### A. Update Orders Controller

**File:** `apps/api-gateway/src/controllers/orders.controller.ts`

**Changes needed:**

1. **Import new types and functions:**
```typescript
import { 
  CONTRACT_SCALE, 
  stakeToContracts, 
  liabilityToContracts,
  CreateForOrderRequest,
  CreateLayOrderRequest,
  PRICE_SCALE 
} from '@betting-exchange/shared-types';
```

2. **Update POST /v1/orders endpoint:**
```typescript
@Post()
async createOrder(@Body() dto: CreateOrderRequest, @Req() req: any) {
  const userId = req.user?.id || 'f1f4f537-ba09-4e45-8a20-f0066fa7e84a';
  
  // Compute canonical yesPts
  const yesPts = dto.side === 'FOR' 
    ? dto.pPts 
    : PRICE_SCALE - dto.pPts;
  
  // Compute contracts based on side
  let contractsMicros: bigint;
  let lockBalancePence: number;
  let stakePence: number | undefined;
  let liabilityPence: number | undefined;
  
  if (dto.side === 'FOR') {
    stakePence = dto.stakePence;
    contractsMicros = stakeToContracts(dto.stakePence, yesPts);
    lockBalancePence = dto.stakePence;
  } else { // LAY
    liabilityPence = dto.liabilityPence;
    contractsMicros = liabilityToContracts(dto.liabilityPence, yesPts);
    lockBalancePence = dto.liabilityPence;
  }
  
  // Lock wallet balance
  await this.walletService.lockBalance(userId, lockBalancePence);
  
  // Insert order into DB
  const orderId = uuid();
  await this.db.query(`
    INSERT INTO orders (
      id, user_id, market_id, side, type, 
      p_pts, yes_pts, 
      original_contracts, remaining_contracts,
      stake_pence, liability_pence,
      status, time_in_force, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, 'LIMIT', $5, $6, $7, $8, $9, $10, 'OPEN', $11, NOW(), NOW())
  `, [
    orderId, userId, dto.marketId, dto.side,
    dto.pPts, yesPts,
    contractsMicros.toString(), contractsMicros.toString(),
    stakePence, liabilityPence,
    dto.timeInForce || 'GTC'
  ]);
  
  // Publish to matching engine
  await this.natsClient.publish('orders.submit', {
    orderId,
    userId,
    marketId: dto.marketId,
    side: dto.side,
    yesPts,
    remainingContractsMicros: contractsMicros.toString(),
    timeInForce: dto.timeInForce || 'GTC'
  });
  
  return { orderId, status: 'ACCEPTED' };
}
```

3. **Update GET /v1/orders to return new fields**

---

## 4. Matching Engine Implementation (TODO)

### A. Update Orderbook Interface

**File:** `apps/matching-engine/src/orderbook.ts`

**Changes:**

1. **Update OrderbookOrder interface:**
```typescript
export interface OrderbookOrder {
  id: string;
  userId: string;
  side: OrderSide;
  pPts: number; // Original user input
  yesPts: number; // Canonical YES price
  remainingContractsMicros: bigint; // Changed from remainingPence
  timestamp: Date;
}
```

2. **Update Match interface:**
```typescript
export interface Match {
  makerOrder: OrderbookOrder;
  takerOrder: OrderbookOrder;
  yesPricePts: number;
  contractsMicros: bigint; // Changed from sizePence
  costPence: number; // Cash exchanged
}
```

3. **Update matching logic:**
```typescript
addOrder(order: OrderbookOrder): Match[] {
  const matches: Match[] = [];
  const isBid = order.side === OrderSide.FOR;
  
  if (isBid) {
    // Match FOR (bid) with LAY (ask)
    while (order.remainingContractsMicros > 0n && this.asks.length > 0) {
      const bestAsk = this.asks[0];
      
      if (order.yesPts >= bestAsk.yesPts) {
        // Calculate match size in contracts
        const matchContracts = order.remainingContractsMicros < bestAsk.remainingContractsMicros
          ? order.remainingContractsMicros
          : bestAsk.remainingContractsMicros;
        
        // Execution price is maker's price
        const executionYesPts = bestAsk.yesPts;
        
        // Calculate cash exchanged
        const costPence = contractsCost(matchContracts, executionYesPts);
        
        matches.push({
          makerOrder: bestAsk,
          takerOrder: order,
          yesPricePts: executionYesPts,
          contractsMicros: matchContracts,
          costPence,
        });
        
        // Update remaining
        order.remainingContractsMicros -= matchContracts;
        bestAsk.remainingContractsMicros -= matchContracts;
        
        if (bestAsk.remainingContractsMicros === 0n) {
          this.asks.shift();
          this.orderMap.delete(bestAsk.id);
        }
      } else {
        break;
      }
    }
    
    // Add remainder to bids
    if (order.remainingContractsMicros > 0n) {
      this.bids.push(order);
      this.orderMap.set(order.id, order);
      this.sortBids();
    }
  } else {
    // Similar logic for LAY (ask) matching with FOR (bid)
    // ...
  }
  
  return matches;
}
```

### B. Update Engine Trade Processing

**File:** `apps/matching-engine/src/engine.ts`

**Changes:**

1. **Update trade insertion:**
```typescript
for (const match of matches) {
  const costPence = match.costPence;
  const takerFeePence = calculateTakerFee(costPence);
  
  await this.db.createTrade({
    marketId,
    yesPts: match.yesPricePts,
    contracts: match.contractsMicros.toString(),
    costPence,
    takerOrderId: match.takerOrder.id,
    makerOrderId: match.makerOrder.id,
    takerUserId: match.takerOrder.userId,
    makerUserId: match.makerOrder.userId,
    side: match.takerOrder.side,
    takerFeePence,
    makerFeePence: 0,
  });
}
```

2. **Update order status:**
```typescript
// Update remaining_contracts in DB
await this.db.query(`
  UPDATE orders 
  SET remaining_contracts = $1,
      status = CASE 
        WHEN $1 = 0 THEN 'MATCHED'
        WHEN $1 < original_contracts THEN 'PARTIALLY_MATCHED'
        ELSE status
      END,
      updated_at = NOW()
  WHERE id = $2
`, [order.remainingContractsMicros.toString(), order.id]);
```

---

## 5. Frontend Implementation (TODO)

### A. Update OrderTicket

**File:** `apps/web/app/components/OrderTicket.tsx`

**Changes:**

1. **Add state for side toggle:**
```typescript
const [side, setSide] = useState<'FOR' | 'LAY'>('FOR');
const [probability, setProbability] = useState('50.00');
const [amount, setAmount] = useState('10.00');
```

2. **Update JSX:**
```tsx
{/* Side Toggle */}
<div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
  <button
    onClick={() => setSide('FOR')}
    style={{
      flex: 1,
      padding: '0.75rem',
      background: side === 'FOR' ? '#48bb78' : '#e2e8f0',
      color: side === 'FOR' ? 'white' : '#4a5568',
      border: 'none',
      borderRadius: '6px',
      fontWeight: 600,
      cursor: 'pointer'
    }}
  >
    FOR (Buy YES)
  </button>
  <button
    onClick={() => setSide('LAY')}
    style={{
      flex: 1,
      padding: '0.75rem',
      background: side === 'LAY' ? '#f56565' : '#e2e8f0',
      color: side === 'LAY' ? 'white' : '#4a5568',
      border: 'none',
      borderRadius: '6px',
      fontWeight: 600,
      cursor: 'pointer'
    }}
  >
    LAY (Sell YES)
  </button>
</div>

{/* Probability Input */}
<label>
  Probability ({side === 'FOR' ? 'YES' : 'NO'}) (%)
  <input
    type="number"
    value={probability}
    onChange={(e) => setProbability(e.target.value)}
    min="0.0001"
    max="99.9999"
    step="0.01"
  />
</label>

{/* Amount Input */}
<label>
  {side === 'FOR' ? 'Stake (£)' : 'Liability (£)'}
  <input
    type="number"
    value={amount}
    onChange={(e) => setAmount(e.target.value)}
    min="0.01"
    step="0.01"
  />
</label>

{/* Preview */}
<div style={{ background: '#f7fafc', padding: '1rem', borderRadius: '6px' }}>
  <div>Estimated contracts: {estimatedContracts.toFixed(2)}</div>
  <div>
    {side === 'FOR' 
      ? `Potential profit: £${potentialProfit.toFixed(2)}`
      : `Potential win: £${potentialWin.toFixed(2)}`
    }
  </div>
  <div style={{ fontSize: '0.75rem', color: '#718096' }}>
    Fee (0.1%): £{estimatedFee.toFixed(2)}
  </div>
</div>
```

3. **Compute previews:**
```typescript
const pPts = percentageToPPts(parseFloat(probability));
const yesPts = side === 'FOR' ? pPts : PRICE_SCALE - pPts;
const amountPence = Math.round(parseFloat(amount) * 100);

const estimatedContracts = side === 'FOR'
  ? (amountPence * PRICE_SCALE) / yesPts / 10 // Approximate
  : (amountPence * PRICE_SCALE) / (PRICE_SCALE - yesPts) / 10;

const potentialProfit = side === 'FOR'
  ? estimatedContracts - amountPence / 100
  : 0;
  
const potentialWin = side === 'LAY'
  ? estimatedContracts * (yesPts / PRICE_SCALE)
  : 0;
```

### B. Update OrderBook Display

**File:** `apps/web/app/components/OrderBook.tsx`

**Changes:**

1. **Display contracts instead of pence:**
```tsx
<div style={{ fontWeight: 600, color: '#22543d' }}>
  {formatProbability(bid.pPts)}
</div>
<div style={{ textAlign: 'right', color: '#22543d' }}>
  {(Number(bid.contractsMicros) / 1_000_000).toFixed(2)} contracts
  <div style={{ fontSize: '0.7rem', color: '#718096' }}>
    (≈ £{(Number(bid.contractsMicros) / 1_000_000 * bid.yesPts / PRICE_SCALE).toFixed(2)})
  </div>
</div>
```

---

## 6. Build & Test

### Build Commands:
```bash
# Build shared-types first
cd packages/shared-types
npx tsc -b --force

# Build matching engine
cd ../../apps/matching-engine
npx tsc -b --force

# Build API gateway
cd ../api-gateway
npx tsc -b --force

# Start web dev server
cd ../web
pnpm run dev
```

### Test Scenarios:

1. **FOR at 50% with £10 stake:**
   - yesPts = 5,000,000
   - contracts = (1000p * 10M * 1M) / 5M = 2,000,000,000 micros = 2,000 contracts
   - If fills at 50%: profit = 2000 - 1000p = £10

2. **LAY at 50% with £10 liability:**
   - User inputs pNo = 50%, so pPts = 5,000,000
   - yesPts = 10M - 5M = 5,000,000
   - qPts = 5,000,000
   - contracts = (1000p * 10M * 1M) / 5M = 2,000,000,000 micros = 2,000 contracts
   - If fills: win = 2000 * 0.5 = £10

3. **Asymmetric match:**
   - FOR £10 @ 34% YES: contracts = (1000 * 10M * 1M) / 3.4M ≈ 2,941,176,471 micros
   - LAY £10 @ 66% NO: yesPts = 3.4M, contracts = (1000 * 10M * 1M) / 6.6M ≈ 1,515,151,515 micros
   - These should NOT fully match - only 1,515,151,515 micros match

---

## Summary

This implementation converts the system from symmetric stake-based matching to Betfair-style contracts-based matching where:
- FOR orders specify stake (cash risked)
- LAY orders specify liability (max loss)
- Matching occurs on contracts (not cash)
- All calculations use integer math
- Fees charged on cash exchanged at execution

**Files changed:**
1. ✅ `docs/migrations/002-contracts-based-matching.sql`
2. ✅ `packages/shared-types/src/order.ts`
3. ⏳ `apps/api-gateway/src/controllers/orders.controller.ts`
4. ⏳ `apps/matching-engine/src/orderbook.ts`
5. ⏳ `apps/matching-engine/src/engine.ts`
6. ⏳ `apps/web/app/components/OrderTicket.tsx`
7. ⏳ `apps/web/app/components/OrderBook.tsx`

**Next steps:** Implement remaining API gateway, matching engine, and frontend changes as outlined above.
