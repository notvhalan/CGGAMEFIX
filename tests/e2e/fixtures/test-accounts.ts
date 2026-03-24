/**
 * Centralised test-account definitions.
 *
 * Every E2E test file should import `createTestAccounts()` and use the
 * returned map so that:
 *   • Account configs live in one place — easy to update.
 *   • Each test file gets its own *fresh* users (unique e-mails, clean wallets).
 *   • The admin user is shared (singleton e-mail `developer@gmail.com`).
 *
 * Usage:
 *   const accounts = await createTestAccounts(['highRoller', 'lowBalance', 'admin']);
 *   const alice = accounts.highRoller;   // TestApiClient ready to trade
 *   const admin = accounts.admin;        // admin-level TestApiClient
 */

import { createUserWithWallet, createAdminUser } from '../helpers/users';
import type { TestApiClient } from '../helpers/api-client';

// ── Account presets ─────────────────────────────────────────

export interface AccountPreset {
  /** Balance deposited into the GBP wallet (in pounds). */
  balancePounds: number;
  /** Human-readable label (used as email prefix). */
  label: string;
}

/**
 * Named presets that any test file can reference.
 * Add new presets here when new scenarios require them.
 */
export const ACCOUNT_PRESETS = {
  /** General-purpose trader with plenty of funds. */
  highRoller:  { balancePounds: 500, label: 'high-roller' }  satisfies AccountPreset,
  /** Moderate-balance trader. */
  standard:    { balancePounds: 100, label: 'standard' }     satisfies AccountPreset,
  /** User with very limited funds (for insufficient-balance tests). */
  lowBalance:  { balancePounds: 5,   label: 'low-balance' }  satisfies AccountPreset,
  /** User starting with zero funds (for deposit-required tests). */
  empty:       { balancePounds: 0,   label: 'empty' }        satisfies AccountPreset,
} as const;

export type PresetName = keyof typeof ACCOUNT_PRESETS | 'admin';

// ── Factory ─────────────────────────────────────────────────

/**
 * Create a set of test accounts from the given preset names.
 *
 * Every non-admin preset creates a **brand-new user** with a unique
 * e-mail so tests never collide.  The `admin` preset reuses the
 * whitelisted `developer@gmail.com` account.
 *
 * @example
 *   const { highRoller, lowBalance, admin } =
 *     await createTestAccounts(['highRoller', 'lowBalance', 'admin']);
 */
export async function createTestAccounts<T extends PresetName>(
  names: T[],
): Promise<Record<T, TestApiClient>> {
  const result = {} as Record<T, TestApiClient>;

  for (const name of names) {
    if (name === 'admin') {
      (result as any).admin = await createAdminUser();
    } else {
      const preset = ACCOUNT_PRESETS[name as keyof typeof ACCOUNT_PRESETS];
      (result as any)[name] = await createUserWithWallet({
        balancePounds: preset.balancePounds,
        emailPrefix: preset.label,
      });
    }
  }

  return result;
}
