import { z } from 'zod';
import { PRICE_SCALE } from '@betting-exchange/shared-types';

// Support both old odds-based format and new probability point format
export const CreateOrderDtoSchema = z.object({
  marketId: z.string().uuid(),
  outcomeId: z.string().uuid().optional(),
  side: z.enum(['BACK', 'LAY', 'FOR']),
  // Old format (deprecated) - nullable for backward compatibility
  odds: z.coerce.number().gt(1, 'Odds must be greater than 1').nullable().optional(),
  stake: z.coerce.number().positive('Stake must be greater than 0').nullable().optional(),
  // New probability point format - liabilityPence is max loss for BOTH sides
  pPts: z.coerce.number().int().min(1).max(PRICE_SCALE - 1).optional(),
  liabilityPence: z.coerce.number().int().positive().optional(),
  // Deprecated: stakePence (backward compat only)
  stakePence: z.coerce.number().int().positive().nullable().optional(),
  timeInForce: z.enum(['GTC', 'IOC']).optional(),
}).refine(
  (data) => {
    // Either old format (odds + stake) or new format (pPts + liabilityPence) must be provided
    const hasOldFormat = data.odds != null && data.stake != null;
    const hasNewFormat = data.pPts !== undefined && (data.liabilityPence !== undefined || data.stakePence !== undefined);
    return hasOldFormat || hasNewFormat;
  },
  { message: 'Must provide either (odds + stake) or (pPts + liabilityPence)' }
);

export type CreateOrderDto = z.infer<typeof CreateOrderDtoSchema>;

export const CancelOrderDtoSchema = z.object({
  orderId: z.string().uuid(),
});

export type CancelOrderDto = z.infer<typeof CancelOrderDtoSchema>;

export const DepositDtoSchema = z.object({
  amount: z.number().positive('Amount must be greater than 0'),
  currency: z.string().default('USD'),
});

export type DepositDto = z.infer<typeof DepositDtoSchema>;

export const WithdrawDtoSchema = z.object({
  amount: z.number().positive('Amount must be greater than 0'),
  currency: z.string().default('USD'),
  destination: z.string().min(1, 'Destination is required'),
});

export type WithdrawDto = z.infer<typeof WithdrawDtoSchema>;
