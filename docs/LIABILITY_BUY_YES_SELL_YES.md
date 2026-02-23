# Liability Model for BUY_YES / SELL_YES

This document explains how liability (max loss) is handled end-to-end in this codebase when creating and matching trades.

## 1) Core idea

- `BUY_YES`: user risks a max amount to buy YES exposure.
- `SELL_YES`: user risks a max amount to sell YES (equivalent to buying NO exposure).
- The input `liabilityPence` is treated as **max loss** for both sides.
- Orders are represented internally with:
  - `yes_pts` (price in YES probability points, scale `10_000_000 = 100%`)
  - `contracts_micros` (size in micro-contracts, scale `1_000_000 = 1 contract`)

Relevant code:
- `apps/web/app/components/OrderTicket.tsx`
- `apps/api-gateway/src/controllers/orders.controller.ts`
- `rust-exchange/src/types.rs`
- `rust-exchange/src/api.rs`

## 2) Constants and units

- `PRICE_SCALE = 10_000_000`
- `PAYOUT_PENCE_PER_CONTRACT = 100` (GBP 1.00 per contract)
- `CONTRACT_SCALE_MICROS = 1_000_000`
- `FEE_BPS = 10` (0.10%)

Defined in:
- `rust-exchange/src/types.rs`
- `packages/shared-types/src/order.ts`

## 3) Contract sizing from liability

Rust uses integer math (floor via integer division):

- `BUY_YES` contracts:
  - `contracts = floor(risk_pence * PRICE_SCALE * CONTRACT_SCALE / (yes_pts * PAYOUT_PENCE))`
- `SELL_YES` contracts:
  - `no_pts = PRICE_SCALE - yes_pts`
  - `contracts = floor(risk_pence * PRICE_SCALE * CONTRACT_SCALE / (no_pts * PAYOUT_PENCE))`

Implementation:
- `buyyes_contracts_from_risk` and `sellyes_contracts_from_risk` in `rust-exchange/src/types.rs`.

Reverse risk calculators are also defined:
- `calculate_risk_buyyes`
- `calculate_risk_sellyes`

These are used for reserve/settlement at exact filled quantities.

## 4) Side mapping through the app

### Web UI

- Ticket submits `side` as `BUY_YES` or `SELL_YES`.
- Ticket submits `pPts` in YES space.
- Ticket submits `liabilityPence` as the amount/risk input.

See:
- `apps/web/app/components/OrderTicket.tsx` (hidden form fields)

### API gateway

- Accepts both legacy (`FOR`/`LAY`, `BACK`) and canonical (`BUY_YES`/`SELL_YES`) inputs.
- Canonical path sets:
  - `BUY_YES -> FOR`
  - `SELL_YES -> LAY`
  - marks `pPtsIsYes = true` so SELL price is not inverted again.
- Converts to Rust side before submit:
  - `FOR -> BUY_YES`
  - `LAY -> SELL_YES`

See:
- `apps/api-gateway/src/controllers/orders.controller.ts`

## 5) Order creation in Rust

`POST /api/orders` in Rust:

1. Validates risk and price range.
2. Recomputes `contracts_micros` from `risk_pence` and `limit_yes_pts` (authoritative sizing).
3. Computes `reserve_pence` at limit price:
   - BUY: `calculate_risk_buyyes(contracts, limit_yes_pts)`
   - SELL: `calculate_risk_sellyes(contracts, limit_yes_pts)`
4. Reserves funds (unless reduce-only close).
5. Inserts `orders` row with:
   - `qty_original_micros`, `qty_remaining_micros`
   - `liability_pence = reserve_pence` (actual lock amount after rounding)
6. Sends `EngineCommand::Submit` to matching engine.

See:
- `rust-exchange/src/api.rs` (`create_order`)

## 6) Matching and execution price

Orderbook is price-time priority:

- `BUY_YES` taker matches lowest ask (`SELL_YES`) where `ask <= taker_limit`
- `SELL_YES` taker matches highest bid (`BUY_YES`) where `bid >= taker_limit`
- Trade executes at maker price (`exec_yes_pts` from book level).

See:
- `rust-exchange/src/orderbook.rs`

## 7) Liability/lock movement on fills

When a fill happens (`clearing.rs`):

1. Order quantities/statuses are updated.
2. Wallet settlement for maker and taker:
   - `settle_fill(...)` for regular orders
   - `settle_reduce_only_fill(...)` for reduce-only IOC closes
3. Taker fee is charged on fill risk basis.
4. Trade record is inserted.

### Regular fill (`settle_fill`)

- Computes `reserved_pence` at order limit and `actual_pence` at execution price for the filled qty.
- Removes reserved lock and returns any positive improvement (`reserved - actual`) to available balance.
- If execution would be worse than limit, it errors.

See:
- `rust-exchange/src/wallet.rs` (`settle_fill`)

### Reduce-only close fill (`settle_reduce_only_fill`)

- No fresh order collateral is reserved at order entry (`reserve_pence = 0`).
- Cashflow is applied directly to available balance using YES notional at execution:
  - reduce-only `SELL_YES`: receives YES premium
  - reduce-only `BUY_YES`: pays YES premium

See:
- `rust-exchange/src/api.rs` (`reduce_only` handling)
- `rust-exchange/src/wallet.rs` (`settle_reduce_only_fill`)

## 8) Trade creation details

In `clearing.rs`, each fill writes a trade row:

- `side` is stored as **taker side** (`BUY_YES` or `SELL_YES`)
- `price_yes_pts = exec_yes_pts`
- `qty_micros = fill qty`
- `notional_pence = calculate_risk_buyyes(qty, exec_yes_pts)` (YES premium basis)
- `taker_fee_pence` charged at 0.1%

See:
- `rust-exchange/src/clearing.rs`

## 9) Worked example (from code tests)

At `yes_pts = 5_660_000` (56.60%), risk = `1000` pence (GBP 10.00):

- BUY_YES:
  - contracts = `17_667_844` micros (`17.667844`)
- SELL_YES:
  - contracts = `23_041_474` micros (`23.041474`)

Reason: SELL_YES sizes against `no_pts = 43.40%`, so same risk buys more contracts.

See tests:
- `rust-exchange/src/types.rs` (`test_buyyes_at_56_60_percent`, `test_sellyes_at_56_60_percent`)

## 10) Practical implications

- Same `liabilityPence` does **not** mean same contract count across BUY_YES vs SELL_YES.
- Sizing is deterministic and integer-rounded (floor), so actual reserved risk can be slightly below requested risk.
- On partial cancel/IOC remainder, lock release is proportional:
  - `release = liability_pence * remaining_qty / original_qty`

See:
- `rust-exchange/src/engine.rs` (cancel flow)
- `rust-exchange/src/clearing.rs` (IOC remainder finalization)

