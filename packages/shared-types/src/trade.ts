import { z } from 'zod';
import { OrderSide } from './order';

// Trade Status
export enum TradeStatus {
  PENDING = 'PENDING',
  SETTLED = 'SETTLED',
  VOIDED = 'VOIDED',
}

// Trade Schema
export const TradeSchema = z.object({
  id: z.string().uuid(),
  marketId: z.string().uuid(),
  makerOrderId: z.string().uuid(),
  takerOrderId: z.string().uuid(),
  makerId: z.string().uuid(),
  takerId: z.string().uuid(),
  price: z.number().positive(),
  size: z.number().positive(),
  side: z.nativeEnum(OrderSide),
  makerFee: z.number().nonnegative(),
  takerFee: z.number().nonnegative(),
  status: z.nativeEnum(TradeStatus),
  executedAt: z.date(),
  settledAt: z.date().optional(),
});

export type Trade = z.infer<typeof TradeSchema>;

// OHLC Candle (for market data)
export interface Candle {
  marketId: string;
  interval: string; // '1m', '5m', '1h', '1d'
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  trades: number;
}
