import { z } from 'zod';

// Order Side
export enum OrderSide {
  BACK = 'BACK', // Betting for an outcome
  LAY = 'LAY',   // Betting against an outcome
}

// Order Type
export enum OrderType {
  LIMIT = 'LIMIT',
  MARKET = 'MARKET',
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

// Order Schema
export const OrderSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  marketId: z.string().uuid(),
  side: z.nativeEnum(OrderSide),
  type: z.nativeEnum(OrderType),
  price: z.number().positive(), // Decimal odds (e.g., 2.5)
  stake: z.number().positive(), // Amount in currency
  size: z.number().positive(), // Size at this price level
  remainingSize: z.number().nonnegative(),
  status: z.nativeEnum(OrderStatus),
  createdAt: z.date(),
  updatedAt: z.date(),
  matchedAt: z.date().optional(),
});

export type Order = z.infer<typeof OrderSchema>;

// Create Order Request
export const CreateOrderRequestSchema = z.object({
  marketId: z.string().uuid(),
  side: z.nativeEnum(OrderSide),
  type: z.nativeEnum(OrderType),
  price: z.number().positive(),
  stake: z.number().positive(),
});

export type CreateOrderRequest = z.infer<typeof CreateOrderRequestSchema>;

// Cancel Order Request
export const CancelOrderRequestSchema = z.object({
  orderId: z.string().uuid(),
  marketId: z.string().uuid(),
});

export type CancelOrderRequest = z.infer<typeof CancelOrderRequestSchema>;

// Price Level (for orderbook)
export interface PriceLevel {
  price: number;
  totalSize: number;
  orderCount: number;
}

// Orderbook Snapshot
export interface OrderbookSnapshot {
  marketId: string;
  backs: PriceLevel[]; // Sorted descending by price
  lays: PriceLevel[];  // Sorted ascending by price
  timestamp: Date;
}
