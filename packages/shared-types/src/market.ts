import { z } from 'zod';

// Market Status
export enum MarketStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  SETTLED = 'SETTLED',
  CLOSED = 'CLOSED',
}

// Market Type
export enum MarketType {
  MATCH_ODDS = 'MATCH_ODDS',
  OVER_UNDER = 'OVER_UNDER',
  CORRECT_SCORE = 'CORRECT_SCORE',
}

// Market Schema
export const MarketSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().optional(),
  type: z.nativeEnum(MarketType),
  status: z.nativeEnum(MarketStatus),
  eventId: z.string().uuid(),
  outcomes: z.array(z.string()),
  startTime: z.date(),
  endTime: z.date().optional(),
  settlementTime: z.date().optional(),
  minStake: z.number().positive(),
  maxStake: z.number().positive(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Market = z.infer<typeof MarketSchema>;

// Market Summary (for listings)
export interface MarketSummary {
  id: string;
  name: string;
  type: MarketType;
  status: MarketStatus;
  totalVolume: number;
  matchedAmount: number;
  lastTradePrice: number | null;
  bestBackPrice: number | null;
  bestLayPrice: number | null;
}
