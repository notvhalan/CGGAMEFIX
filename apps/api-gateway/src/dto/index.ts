import { z } from 'zod';

export const CreateOrderDtoSchema = z.object({
  marketId: z.string().uuid(),
  outcomeId: z.string().uuid().optional(),
  side: z.enum(['BACK', 'LAY']),
  odds: z.number().gt(1, 'Odds must be greater than 1'),
  stake: z.number().positive('Stake must be greater than 0'),
}).strict(); // Reject unknown fields

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
