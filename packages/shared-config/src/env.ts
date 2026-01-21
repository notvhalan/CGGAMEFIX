import { z } from 'zod';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Base environment schema (common across all services)
const BaseEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  
  // Database
  DATABASE_URL: z.string().url(),
  DATABASE_POOL_MIN: z.coerce.number().int().positive().default(2),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),
  
  // Redis
  REDIS_URL: z.string().url(),
  REDIS_PASSWORD: z.string().optional(),
  
  // NATS
  NATS_URL: z.string().url(),
  NATS_CLUSTER_ID: z.string().default('betting-cluster'),
  
  // JWT
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('24h'),
});

export type BaseEnv = z.infer<typeof BaseEnvSchema>;

/**
 * Validate and parse environment variables for a service
 */
export function validateEnv<T extends z.ZodTypeAny>(schema: T): z.infer<T> {
  const result = schema.safeParse(process.env);
  
  if (!result.success) {
    console.error('❌ Invalid environment variables:');
    console.error(JSON.stringify(result.error.format(), null, 2));
    process.exit(1);
  }
  
  return result.data;
}

// Export base schema for extension by services
export { BaseEnvSchema };

// API Gateway specific environment
export const ApiGatewayEnvSchema = BaseEnvSchema.extend({
  API_GATEWAY_PORT: z.coerce.number().int().positive().default(3000),
  WS_PORT: z.coerce.number().int().positive().default(3001),
  
  // Google OAuth
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_CALLBACK_URL: z.string().url(),
  
  // Auth Redirects
  AUTH_SUCCESS_REDIRECT: z.string().url(),
  AUTH_FAILURE_REDIRECT: z.string().url(),
  
  // Session
  SESSION_SECRET: z.string().min(32),
});

export type ApiGatewayEnv = z.infer<typeof ApiGatewayEnvSchema>;

// Matching Engine specific environment
export const MatchingEngineEnvSchema = BaseEnvSchema.extend({
  MATCHING_ENGINE_PORT: z.coerce.number().int().positive().default(3100),
});

export type MatchingEngineEnv = z.infer<typeof MatchingEngineEnvSchema>;

// Wallet Service specific environment
export const WalletServiceEnvSchema = BaseEnvSchema.extend({
  WALLET_SERVICE_PORT: z.coerce.number().int().positive().default(3200),
});

export type WalletServiceEnv = z.infer<typeof WalletServiceEnvSchema>;
