import { z } from 'zod';

// Order Side - Probability Point Pricing
export enum OrderSide {
  BUY_YES = 'BUY_YES', // Buying YES outcome at probability points
  SELL_YES = 'SELL_YES', // Selling YES outcome (equivalent to buying NO)
  
  // Legacy aliases for backward compatibility during migration
  FOR = 'BUY_YES',
  LAY = 'SELL_YES',
}

// Price constants for 7 decimal place precision
export const PRICE_SCALE = 10_000_000; // 7 decimal places (1.0000000 = 100%)
export const CONTRACT_SCALE = 1_000_000n; // 6 decimal places (1 contract = 1e6 microcontracts)
export const CONTRACT_TICK_MICROS = 10_000n; // 0.01 contracts minimum tick size
export const MIN_CONTRACT_MICROS = CONTRACT_TICK_MICROS; // Minimum order size: 0.01 contracts (prevents dust)
export const FEE_BPS = 10; // 0.1% fee = 10 basis points
export const FEE_DENOM = 10_000;

// Contract payout per contract in pence (1 contract pays 100 pence = £1.00)
export const CONTRACT_PAYOUT_PENCE = 100;

/**
 * Snap down contractsMicros to nearest tick (0.01 contracts)
 * This prevents dust by ensuring all contract amounts are multiples of CONTRACT_TICK_MICROS
 */
export function snapDownToTick(contractsMicros: bigint): bigint {
  return (contractsMicros / CONTRACT_TICK_MICROS) * CONTRACT_TICK_MICROS;
}

/**
 * Convert FOR stake to contracts (micros)
 * contracts = stake / price
 * contracts_micros = (stakePence * CONTRACT_SCALE * PRICE_SCALE) / (yesPts * CONTRACT_PAYOUT_PENCE)
 */
export function stakeToContracts(stakePence: number, yesPts: number): bigint {
  const raw = (BigInt(stakePence) * CONTRACT_SCALE * BigInt(PRICE_SCALE)) / (BigInt(yesPts) * BigInt(CONTRACT_PAYOUT_PENCE));
  return snapDownToTick(raw);
}

/**
 * Convert LAY liability to contracts (micros)
 * contracts = liability / (1 - price)
 * contracts_micros = (liabilityPence * CONTRACT_SCALE * PRICE_SCALE) / (qPts * CONTRACT_PAYOUT_PENCE)
 * where qPts = PRICE_SCALE - yesPts
 */
export function liabilityToContracts(liabilityPence: number, yesPts: number): bigint {
  const qPts = PRICE_SCALE - yesPts;
  const raw = (BigInt(liabilityPence) * CONTRACT_SCALE * BigInt(PRICE_SCALE)) / (BigInt(qPts) * BigInt(CONTRACT_PAYOUT_PENCE));
  return snapDownToTick(raw);
}

/**
 * Calculate cost in pence for a given number of contracts at yesPts
 * costPence = floor(contractsMicros * CONTRACT_PAYOUT_PENCE * yesPts / PRICE_SCALE / CONTRACT_SCALE)
 */
export function contractsCost(contractsMicros: bigint, yesPts: number): number {
  return Number((contractsMicros * BigInt(CONTRACT_PAYOUT_PENCE) * BigInt(yesPts)) / BigInt(PRICE_SCALE) / CONTRACT_SCALE);
}

/**
 * Calculate taker fee (0.1%) on cost
 */
export function calculateTakerFee(costPence: number): number {
  return Math.floor((costPence * FEE_BPS) / FEE_DENOM);
}

// Order Type
export enum OrderType {
  LIMIT = 'LIMIT',
  MARKET = 'MARKET',
}

// Time In Force
export enum TimeInForce {
  GTC = 'GTC', // Good Till Cancelled (default)
  IOC = 'IOC', // Immediate Or Cancel (for cash out)
}

// Order Status
export enum OrderStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  PARTIALLY_MATCHED = 'PARTIALLY_MATCHED',
  MATCHED = 'MATCHED',
  CANCELLED = 'CANCELLED',
  REJECTED = 'REJECTED',
}

// Order Schema - Contracts-based matching with stake/liability
export const OrderSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  marketId: z.string().uuid(),
  side: z.nativeEnum(OrderSide),
  type: z.nativeEnum(OrderType),
  pPts: z.number().int().positive(), // User input probability points (FOR: YES prob, LAY: NO prob)
  yesPts: z.number().int().positive(), // Canonical YES probability (FOR: pPts, LAY: PRICE_SCALE - pPts)
  originalContractsMicros: z.bigint().positive(), // Original contracts in micros (1e6 = 1 contract)
  remainingContractsMicros: z.bigint().nonnegative(), // Remaining contracts to fill
  stakePence: z.number().int().positive().optional(), // FOR orders: stake (cash risked)
  liabilityPence: z.number().int().positive().optional(), // LAY orders: liability (max loss)
  status: z.nativeEnum(OrderStatus),
  timeInForce: z.nativeEnum(TimeInForce).optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
  matchedAt: z.date().optional(),
});

export type Order = z.infer<typeof OrderSchema>;

// Create Order Request DTOs
export const CreateBuyYesOrderRequestSchema = z.object({
  marketId: z.string().uuid(),
  side: z.literal(OrderSide.BUY_YES),
  pPts: z.number().int().min(1).max(PRICE_SCALE - 1), // YES probability
  stakePence: z.number().int().positive(), // Cash to risk
  timeInForce: z.nativeEnum(TimeInForce).optional(),
});

export const CreateSellYesOrderRequestSchema = z.object({
  marketId: z.string().uuid(),
  side: z.literal(OrderSide.SELL_YES),
  pPts: z.number().int().min(1).max(PRICE_SCALE - 1), // NO probability
  liabilityPence: z.number().int().positive(), // Max loss
  timeInForce: z.nativeEnum(TimeInForce).optional(),
});

// Legacy aliases
export const CreateForOrderRequestSchema = CreateBuyYesOrderRequestSchema;
export const CreateLayOrderRequestSchema = CreateSellYesOrderRequestSchema;

export const CreateOrderRequestSchema = z.discriminatedUnion('side', [
  CreateBuyYesOrderRequestSchema,
  CreateSellYesOrderRequestSchema,
]);

export type CreateBuyYesOrderRequest = z.infer<typeof CreateBuyYesOrderRequestSchema>;
export type CreateSellYesOrderRequest = z.infer<typeof CreateSellYesOrderRequestSchema>;
export type CreateOrderRequest = z.infer<typeof CreateOrderRequestSchema>;

// Legacy aliases
export type CreateForOrderRequest = CreateBuyYesOrderRequest;
export type CreateLayOrderRequest = CreateSellYesOrderRequest;

// Cancel Order Request
export const CancelOrderRequestSchema = z.object({
  orderId: z.string().uuid(),
  marketId: z.string().uuid(),
});

export type CancelOrderRequest = z.infer<typeof CancelOrderRequestSchema>;

// Price Level (for orderbook)
export interface PriceLevel {
  pPts: number; // Probability points
  yesPts: number; // Canonical YES probability
  contractsMicros: bigint; // Total contracts available at this level
  orderCount: number;
}

// Orderbook Snapshot
export interface OrderbookSnapshot {
  marketId: string;
  bids: PriceLevel[]; // FOR orders sorted by highest yesPts
  asks: PriceLevel[]; // LAY orders sorted by lowest yesPts
  timestamp: Date;
}
