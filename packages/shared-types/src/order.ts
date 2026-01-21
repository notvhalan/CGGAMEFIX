import { z } from 'zod';

// Order Side - Probability Point Pricing
export enum OrderSide {
  FOR = 'FOR', // Buying YES at probability points (buying the outcome)
  LAY = 'LAY', // Buying NO (selling the outcome, equivalent to PRICE_SCALE - pPts)
}

// Price constants for 7 decimal place precision
export const PRICE_SCALE = 10_000_000; // 7 decimal places (1.0000000 = 100%)
export const CONTRACT_SCALE = 1_000_000; // 6 decimal places (1 contract = 1e6 microcontracts)
export const FEE_BPS = 10; // 0.1% fee = 10 basis points
export const FEE_DENOM = 10_000;

// Contract payout per contract in pence (1 contract pays 100 pence = £1.00)
export const CONTRACT_PAYOUT_PENCE = 100;

/**
 * Convert FOR stake to contracts (micros)
 * contracts = floor(stakePence * CONTRACT_SCALE * PRICE_SCALE / yesPts)
 */
export function stakeToContracts(stakePence: number, yesPts: number): bigint {
  return BigInt(Math.floor((stakePence * CONTRACT_SCALE * PRICE_SCALE) / yesPts));
}

/**
 * Convert LAY liability to contracts (micros)
 * contracts = floor(liabilityPence * CONTRACT_SCALE * PRICE_SCALE / qPts)
 * where qPts = PRICE_SCALE - yesPts
 */
export function liabilityToContracts(liabilityPence: number, yesPts: number): bigint {
  const qPts = PRICE_SCALE - yesPts;
  return BigInt(Math.floor((liabilityPence * CONTRACT_SCALE * PRICE_SCALE) / qPts));
}

/**
 * Calculate cost in pence for a given number of contracts at yesPts
 * costPence = floor(contractsMicros * CONTRACT_PAYOUT_PENCE * yesPts / PRICE_SCALE / CONTRACT_SCALE)
 */
export function contractsCost(contractsMicros: bigint, yesPts: number): number {
  return Number((contractsMicros * BigInt(CONTRACT_PAYOUT_PENCE) * BigInt(yesPts)) / BigInt(PRICE_SCALE) / BigInt(CONTRACT_SCALE));
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
export const CreateForOrderRequestSchema = z.object({
  marketId: z.string().uuid(),
  side: z.literal(OrderSide.FOR),
  pPts: z.number().int().min(1).max(PRICE_SCALE - 1), // YES probability
  stakePence: z.number().int().positive(), // Cash to risk
  timeInForce: z.nativeEnum(TimeInForce).optional(),
});

export const CreateLayOrderRequestSchema = z.object({
  marketId: z.string().uuid(),
  side: z.literal(OrderSide.LAY),
  pPts: z.number().int().min(1).max(PRICE_SCALE - 1), // NO probability
  liabilityPence: z.number().int().positive(), // Max loss
  timeInForce: z.nativeEnum(TimeInForce).optional(),
});

export const CreateOrderRequestSchema = z.discriminatedUnion('side', [
  CreateForOrderRequestSchema,
  CreateLayOrderRequestSchema,
]);

export type CreateForOrderRequest = z.infer<typeof CreateForOrderRequestSchema>;
export type CreateLayOrderRequest = z.infer<typeof CreateLayOrderRequestSchema>;
export type CreateOrderRequest = z.infer<typeof CreateOrderRequestSchema>;

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
