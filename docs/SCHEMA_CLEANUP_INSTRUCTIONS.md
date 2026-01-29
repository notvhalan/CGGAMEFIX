-- Instructions for cleaning up the trades schema
-- ================================================

## Current State
The trades table has BOTH old and new columns (duplicate data):
- Old: yes_pts, contracts, cost_pence
- New: price_yes_pts, qty_micros, notional_pence

The matching-engine currently inserts into BOTH sets for backward compatibility.

## Migration Steps

### 1. Run the migration to drop legacy columns:
```bash
docker exec -i betting-exchange-postgres psql -U postgres -d betting_exchange < scripts/drop-legacy-trade-columns.sql
```

### 2. Update matching-engine INSERT (after migration completes)

In `apps/matching-engine/src/db/pg.ts`, change the createTrade INSERT from:

```typescript
`INSERT INTO trades 
 (market_id, price_yes_pts, qty_micros, notional_pence, yes_pts, contracts, cost_pence, taker_order_id, maker_order_id, taker_user_id, maker_user_id, side, taker_fee_pence, maker_fee_pence, executed_at)
 VALUES ($1, $2, $3, $4, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
 RETURNING id`
```

To (remove duplicate columns):

```typescript
`INSERT INTO trades 
 (market_id, price_yes_pts, qty_micros, notional_pence, taker_order_id, maker_order_id, taker_user_id, maker_user_id, side, taker_fee_pence, maker_fee_pence, executed_at)
 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
 RETURNING id`
```

Note: The VALUES parameters shift down by 3 since we removed the duplicate $2, $3, $4.

### 3. Rebuild and restart matching-engine:
```bash
cd apps/matching-engine
pnpm run build
# Then restart the service
```

## Verification

After migration, verify the schema:
```sql
\d trades
```

Expected columns only:
- id, market_id, maker_order_id, taker_order_id
- maker_user_id, taker_user_id
- side
- price_yes_pts, qty_micros, notional_pence
- maker_fee_pence, taker_fee_pence
- executed_at, created_at

## Rollback (if needed)

The migration file includes a rollback script to restore the legacy columns if needed.
