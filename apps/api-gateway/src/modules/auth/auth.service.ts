import { Injectable } from '@nestjs/common';
import { DatabaseService, User } from '../../database/database.service';
import { Logger } from '@betting-exchange/shared-config';

@Injectable()
export class AuthService {
  private logger = new Logger('AuthService');

  constructor(private databaseService: DatabaseService) {}

  /**
   * Handle Google OAuth callback
   * - Find or create user by Google sub or email
   * - Ensure user has a wallet
   * - Return user
   */
  async handleGoogleLogin(profile: {
    googleSub: string;
    email: string;
    name?: string;
    avatarUrl?: string;
  }): Promise<User> {
    // Try to find by Google sub first
    let user = await this.databaseService.findUserByGoogleSub(profile.googleSub);

    // If not found, try by email
    if (!user) {
      user = await this.databaseService.findUserByEmail(profile.email);
    }

    // Create new user if not found
    if (!user) {
      this.logger.info(`Creating new user: ${profile.email}`);
      user = await this.databaseService.createUser({
        email: profile.email,
        googleSub: profile.googleSub,
        name: profile.name,
        avatarUrl: profile.avatarUrl,
      });
    }

    // Ensure user has a wallet
    await this.databaseService.ensureWallet(user.id);

    this.logger.info(`User logged in: ${user.email} (${user.id})`);
    return user;
  }

  /**
   * Get user by ID
   */
  async getUserById(userId: string): Promise<User | null> {
    return this.databaseService.findUserById(userId);
  }
}
