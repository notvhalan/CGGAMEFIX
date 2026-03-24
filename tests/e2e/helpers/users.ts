/**
 * User creation helpers for E2E tests.
 *
 * Creates users via the real API (signup + deposit) so the full
 * auth/session/wallet flow is exercised.
 */

import { TestApiClient } from './api-client';

let userCounter = 0;

/**
 * Create a fresh user with a funded GBP wallet.
 * Returns a TestApiClient already authenticated.
 */
export async function createUserWithWallet(opts: {
  balancePounds?: number;
  emailPrefix?: string;
} = {}): Promise<TestApiClient> {
  const { balancePounds = 100, emailPrefix = 'user' } = opts;

  userCounter++;
  const email = `${emailPrefix}-${Date.now()}-${userCounter}@e2e-test.local`;
  const password = 'TestPass123!';

  const client = new TestApiClient();
  await client.signup(email, password);

  if (balancePounds > 0) {
    await client.deposit(balancePounds, 'GBP');
  }

  return client;
}

/**
 * Create an admin user (email must be in the ADMIN_EMAILS whitelist).
 * Uses `developer@gmail.com` which is whitelisted in AdminController.
 */
export async function createAdminUser(): Promise<TestApiClient> {
  const email = 'developer@gmail.com';
  const password = 'test123!';

  const client = new TestApiClient();

  try {
    // Try signup first
    await client.signup(email, password, 'E2E Admin');
  } catch {
    // Already exists — just login
    await client.login(email, password);
  }

  // Make sure the wallet exists and has funds
  await client.deposit(1000, 'GBP');

  return client;
}
