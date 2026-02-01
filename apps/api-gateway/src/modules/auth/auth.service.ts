import { Injectable, UnauthorizedException } from '@nestjs/common';
import { DatabaseService, User } from '../../database/database.service';
import { Logger } from '@betting-exchange/shared-config';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class AuthService {
  private logger = new Logger('AuthService');

  constructor(private databaseService: DatabaseService) {}

  /**
   * Register new user with email and password
   */
  async registerWithPassword(data: {
    email: string;
    password: string;
    name?: string;
  }): Promise<User> {
    // Check if user already exists
    const existingUser = await this.databaseService.findUserByEmail(data.email);
    if (existingUser) {
      throw new Error('User with this email already exists');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(data.password, 10);

    // Create user
    const user = await this.databaseService.createUserWithPassword({
      email: data.email,
      passwordHash,
      name: data.name,
    });

    // Ensure user has a wallet
    await this.databaseService.ensureWallet(user.id);

    this.logger.info(`New user registered: ${user.email} (${user.id})`);
    return user;
  }

  /**
   * Login with email and password
   */
  async loginWithPassword(email: string, password: string): Promise<User> {
    // Find user
    const user = await this.databaseService.findUserByEmail(email);
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    this.logger.info(`User logged in: ${user.email} (${user.id})`);
    return user;
  }

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
