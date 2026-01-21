import { z } from 'zod';
import { OrderSide } from './order';

// Trade Status
export enum TradeStatus {
  PENDING = 'PENDING',
  SETTLED = 'SETTLED',
  VOIDED = 'VOIDED',
}

// Trade Schema - Integer math with probability points
export const TradeSchema = z.object({
  id: z.string().uuid(),
  marketId: z.string().uuid(),
  makerOrderId: z.string().uuid(),
  takerOrderId: z.string().uuid(),
  makerId: z.string().uuid(),
  takerId: z.string().uuid(),
  yesPricePts: z.number().int().positive(), // Canonical YES price in probability points
  sizePence: z.number().int().positive(), // Trade size in pence
  side: z.nativeEnum(OrderSide), // Side of the taker
  makerFeePence: z.number().int().nonnegative(), // Maker fee in pence
  takerFeePence: z.number().int().nonnegative(), // Taker fee in pence (0.1%)
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
