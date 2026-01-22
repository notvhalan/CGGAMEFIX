import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';
import { Logger } from '@betting-exchange/shared-config';

export interface User {
  id: string;
  email: string;
  googleSub: string;
  name: string | null;
  avatarUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface WalletAccount {
  id: string;
  userId: string;
  balance: number;
  lockedBalance: number;
  currency: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Order {
  id: string;
  userId: string;
  marketId: string;
  outcomeId: string | null;
  side: 'FOR' | 'LAY';
  pPts: number;
  yesPts: number;
  stakePence: number | null;
  liabilityPence: number;
  originalContracts: string;
  remainingContracts: string;
  status: 'PENDING' | 'OPEN' | 'MATCHED' | 'PARTIALLY_MATCHED' | 'CANCELLED' | 'EXPIRED';
  filledAmount?: number;
  remainingPence: number | null;
  filledPence: number | null;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private pool: Pool;
  private logger = new Logger('DatabaseService');

  async onModuleInit() {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is not defined');
    }

    this.pool = new Pool({
      connectionString: databaseUrl,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    this.logger.info('Database connection pool initialized');
    
    // Create tables if they don't exist
    await this.createTables();
  }

  async onModuleDestroy() {
    await this.pool.end();
    this.logger.info('Database connection pool closed');
  }

  private async createTables() {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Create users table
      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          email VARCHAR(255) NOT NULL UNIQUE,
          google_sub VARCHAR(255) NOT NULL UNIQUE,
          name VARCHAR(255),
          avatar_url VARCHAR(500),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        
        CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
        CREATE INDEX IF NOT EXISTS idx_users_google_sub ON users(google_sub);
      `);

      // Create wallet_accounts table
      await client.query(`
        CREATE TABLE IF NOT EXISTS wallet_accounts (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          balance DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
          locked_balance DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
          currency VARCHAR(3) NOT NULL DEFAULT 'USD',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          UNIQUE(user_id, currency)
        );
        
        CREATE INDEX IF NOT EXISTS idx_wallet_accounts_user_id ON wallet_accounts(user_id);
      `);

      // Create orders table
      await client.query(`
        CREATE TABLE IF NOT EXISTS orders (
          id UUID PRIMARY KEY,
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          market_id UUID NOT NULL,
          outcome_id UUID,
          side VARCHAR(10) NOT NULL CHECK (side IN ('FOR', 'LAY')),
          p_pts INTEGER NOT NULL CHECK (p_pts >= 1 AND p_pts <= 9999999),
          stake_pence INTEGER NOT NULL CHECK (stake_pence > 0),
          status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'OPEN', 'MATCHED', 'PARTIALLY_MATCHED', 'CANCELLED', 'EXPIRED')),
          filled_pence INTEGER NOT NULL DEFAULT 0,
          remaining_pence INTEGER NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        
        CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
        CREATE INDEX IF NOT EXISTS idx_orders_market_id ON orders(market_id);
        CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
        CREATE INDEX IF NOT EXISTS idx_orders_market_status ON orders(market_id, status);
      `);

      await client.query('COMMIT');
      this.logger.info('Database tables created successfully');
    } catch (error) {
      await client.query('ROLLBACK');
      this.logger.error('Failed to create tables:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Find user by Google sub (profile.id)
   */
  async findUserByGoogleSub(googleSub: string): Promise<User | null> {
    const result = await this.pool.query<User>(
      'SELECT id, email, google_sub as "googleSub", name, avatar_url as "avatarUrl", created_at as "createdAt", updated_at as "updatedAt" FROM users WHERE google_sub = $1',
      [googleSub]
    );
    return result.rows[0] || null;
  }

  /**
   * Find user by email
   */
  async findUserByEmail(email: string): Promise<User | null> {
    const result = await this.pool.query<User>(
      'SELECT id, email, google_sub as "googleSub", name, avatar_url as "avatarUrl", created_at as "createdAt", updated_at as "updatedAt" FROM users WHERE email = $1',
      [email]
    );
    return result.rows[0] || null;
  }

  /**
   * Find user by ID
   */
  async findUserById(id: string): Promise<User | null> {
    const result = await this.pool.query<User>(
      'SELECT id, email, google_sub as "googleSub", name, avatar_url as "avatarUrl", created_at as "createdAt", updated_at as "updatedAt" FROM users WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  }

  /**
   * Create new user
   */
  async createUser(data: {
    email: string;
    googleSub: string;
    name?: string;
    avatarUrl?: string;
  }): Promise<User> {
    const result = await this.pool.query<User>(
      `INSERT INTO users (email, google_sub, name, avatar_url) 
       VALUES ($1, $2, $3, $4) 
       RETURNING id, email, google_sub as "googleSub", name, avatar_url as "avatarUrl", created_at as "createdAt", updated_at as "updatedAt"`,
      [data.email, data.googleSub, data.name || null, data.avatarUrl || null]
    );
    return result.rows[0];
  }

  /**
   * Find wallet by user ID
   */
  async findWalletByUserId(userId: string, currency = 'USD'): Promise<WalletAccount | null> {
    const result = await this.pool.query<WalletAccount>(
      `SELECT id, user_id as "userId", balance, locked_balance as "lockedBalance", currency, created_at as "createdAt", updated_at as "updatedAt" 
       FROM wallet_accounts 
       WHERE user_id = $1 AND currency = $2`,
      [userId, currency]
    );
    return result.rows[0] || null;
  }

  /**
   * Create wallet for user
   */
  async createWallet(userId: string, currency = 'USD'): Promise<WalletAccount> {
    const result = await this.pool.query<WalletAccount>(
      `INSERT INTO wallet_accounts (user_id, balance, locked_balance, currency) 
       VALUES ($1, 0.00, 0.00, $2) 
       RETURNING id, user_id as "userId", balance, locked_balance as "lockedBalance", currency, created_at as "createdAt", updated_at as "updatedAt"`,
      [userId, currency]
    );
    return result.rows[0];
  }

  /**
   * Ensure user has a wallet (create if not exists)
   */
  async ensureWallet(userId: string, currency = 'USD'): Promise<WalletAccount> {
    let wallet = await this.findWalletByUserId(userId, currency);
    if (!wallet) {
      wallet = await this.createWallet(userId, currency);
    }
    return wallet;
  }

  /**
   * Update wallet balance (for deposits/withdrawals)
   */
  async updateWalletBalance(
    userId: string, 
    amount: number, 
    currency = 'USD'
  ): Promise<WalletAccount> {
    const result = await this.pool.query<WalletAccount>(
      `UPDATE wallet_accounts 
       SET balance = balance + $1, updated_at = NOW() 
       WHERE user_id = $2 AND currency = $3 
       RETURNING id, user_id as "userId", balance, locked_balance as "lockedBalance", currency, created_at as "createdAt", updated_at as "updatedAt"`,
      [amount, userId, currency]
    );
    
    if (result.rows.length === 0) {
      throw new Error('Wallet not found');
    }
    
    return result.rows[0];
  }

  /**
   * Lock balance for an order (move from balance to locked_balance)
   */
  async lockBalance(
    userId: string,
    amountPence: number,
    currency = 'USD'
  ): Promise<WalletAccount> {
    const amountPounds = amountPence / 100;
    
    const result = await this.pool.query<WalletAccount>(
      `UPDATE wallet_accounts 
       SET balance = balance - $1, 
           locked_balance = locked_balance + $1, 
           updated_at = NOW() 
       WHERE user_id = $2 AND currency = $3 AND balance >= $1
       RETURNING id, user_id as "userId", balance, locked_balance as "lockedBalance", currency, created_at as "createdAt", updated_at as "updatedAt"`,
      [amountPounds, userId, currency]
    );
    
    if (result.rows.length === 0) {
      throw new Error('Insufficient balance');
    }
    
    return result.rows[0];
  }

  /**
   * Unlock balance (move from locked_balance back to balance)
   */
  async unlockBalance(
    userId: string,
    amountPence: number,
    currency = 'USD'
  ): Promise<WalletAccount> {
    const amountPounds = amountPence / 100;
    
    const result = await this.pool.query<WalletAccount>(
      `UPDATE wallet_accounts 
       SET balance = balance + $1, 
           locked_balance = locked_balance - $1, 
           updated_at = NOW() 
       WHERE user_id = $2 AND currency = $3 AND locked_balance >= $1
       RETURNING id, user_id as "userId", balance, locked_balance as "lockedBalance", currency, created_at as "createdAt", updated_at as "updatedAt"`,
      [amountPounds, userId, currency]
    );
    
    if (result.rows.length === 0) {
      throw new Error('Insufficient locked balance');
    }
    
    return result.rows[0];
  }

  /**
   * Lock funds in wallet (for placing orders)
   */
  async lockWalletFunds(
    userId: string, 
    amount: number, 
    currency = 'USD'
  ): Promise<WalletAccount> {
    const result = await this.pool.query<WalletAccount>(
      `UPDATE wallet_accounts 
       SET balance = balance - $1, locked_balance = locked_balance + $1, updated_at = NOW() 
       WHERE user_id = $2 AND currency = $3 AND balance >= $1
       RETURNING id, user_id as "userId", balance, locked_balance as "lockedBalance", currency, created_at as "createdAt", updated_at as "updatedAt"`,
      [amount, userId, currency]
    );
    
    if (result.rows.length === 0) {
      throw new Error('Insufficient balance or wallet not found');
    }
    
    return result.rows[0];
  }

  /**
   * Unlock funds in wallet (for cancelled orders)
   */
  async unlockWalletFunds(
    userId: string, 
    amount: number, 
    currency = 'USD'
  ): Promise<WalletAccount> {
    const result = await this.pool.query<WalletAccount>(
      `UPDATE wallet_accounts 
       SET balance = balance + $1, locked_balance = locked_balance - $1, updated_at = NOW() 
       WHERE user_id = $2 AND currency = $3 AND locked_balance >= $1
       RETURNING id, user_id as "userId", balance, locked_balance as "lockedBalance", currency, created_at as "createdAt", updated_at as "updatedAt"`,
      [amount, userId, currency]
    );
    
    if (result.rows.length === 0) {
      throw new Error('Insufficient locked balance or wallet not found');
    }
    
    return result.rows[0];
  }
  
  /**
   * Get all markets
   */
  async getMarkets(): Promise<any[]> {
    const result = await this.pool.query(
      `SELECT id, name, description, type, status, event_id as "eventId", 
              outcomes, start_time as "startTime", end_time as "endTime", 
              settlement_time as "settlementTime",
              min_stake as "minStake", max_stake as "maxStake",
              created_at as "createdAt", updated_at as "updatedAt"
       FROM markets 
       WHERE status = 'ACTIVE'
       ORDER BY created_at DESC`
    );
    return result.rows;
  }
  
  /**
   * Get market by ID
   */
  async getMarketById(marketId: string): Promise<any | null> {
    const result = await this.pool.query(
      `SELECT id, name, description, type, status, event_id as "eventId", 
              outcomes, start_time as "startTime", end_time as "endTime", 
              settlement_time as "settlementTime",
              min_stake as "minStake", max_stake as "maxStake",
              created_at as "createdAt", updated_at as "updatedAt"
       FROM markets 
       WHERE id = $1`,
      [marketId]
    );
    return result.rows[0] || null;
  }
  
  /**
   * Create order
   */
  async createOrder(data: {
    id: string;
    userId: string;
    marketId: string;
    outcomeId?: string;
    side: 'FOR' | 'LAY';
    pPts: number;
    yesPts: number;
    liabilityPence: number;
    originalContractsMicros: string;
    remainingContractsMicros: string;
  }): Promise<Order> {
    const result = await this.pool.query<Order>(
      `INSERT INTO orders (id, user_id, market_id, outcome_id, side, p_pts, yes_pts, 
                          liability_pence, status, 
                          original_contracts, remaining_contracts) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'OPEN', $9, $10) 
       RETURNING id, user_id as "userId", market_id as "marketId", outcome_id as "outcomeId", 
                 side, p_pts as "pPts", yes_pts as "yesPts",
                 liability_pence as "liabilityPence", status, 
                 original_contracts as "originalContractsMicros", 
                 remaining_contracts as "remainingContractsMicros",
                 created_at as "createdAt", updated_at as "updatedAt"`,
      [
        data.id, 
        data.userId, 
        data.marketId, 
        data.outcomeId || null, 
        data.side, 
        data.pPts, 
        data.yesPts,
        data.liabilityPence,
        data.originalContractsMicros,
        data.remainingContractsMicros,
      ]
    );
    return result.rows[0];
  }

  /**
   * Get orders by user ID
   */
  async getOrdersByUserId(userId: string, limit = 50): Promise<Order[]> {
    const result = await this.pool.query<Order>(
      `SELECT id, user_id as "userId", market_id as "marketId", outcome_id as "outcomeId", 
              side, p_pts as "pPts", stake_pence as "stakePence", status, 
              filled_pence as "filledPence", remaining_pence as "remainingPence",
              created_at as "createdAt", updated_at as "updatedAt"
       FROM orders 
       WHERE user_id = $1 
       ORDER BY created_at DESC 
       LIMIT $2`,
      [userId, limit]
    );
    return result.rows;
  }

  /**
   * Get orders by market ID (for order book)
   */
  async getOrdersByMarketId(marketId: string, status: string[] = ['OPEN', 'PARTIALLY_MATCHED']): Promise<Order[]> {
    const result = await this.pool.query<Order>(
      `SELECT id, user_id as "userId", market_id as "marketId", outcome_id as "outcomeId", 
              side, p_pts as "pPts", yes_pts as "yesPts", 
              stake_pence as "stakePence", liability_pence as "liabilityPence",
              original_contracts as "originalContracts", remaining_contracts as "remainingContracts",
              status, 
              filled_pence as "filledPence", remaining_pence as "remainingPence",
              created_at as "createdAt", updated_at as "updatedAt"
       FROM orders 
       WHERE market_id = $1 AND status = ANY($2)
       ORDER BY created_at ASC`,
      [marketId, status]
    );
    return result.rows;
  }

  /**
   * Update order status
   */
  async updateOrderStatus(orderId: string, status: Order['status']): Promise<Order> {
    const result = await this.pool.query<Order>(
      `UPDATE orders 
       SET status = $1, updated_at = NOW() 
       WHERE id = $2 
       RETURNING id, user_id as "userId", market_id as "marketId", outcome_id as "outcomeId", 
                 side, p_pts as "pPts", stake_pence as "stakePence", status, 
                 filled_pence as "filledPence", remaining_pence as "remainingPence",
                 created_at as "createdAt", updated_at as "updatedAt"`,
      [status, orderId]
    );
    
    if (result.rows.length === 0) {
      throw new Error('Order not found');
    }
    
    return result.rows[0];
  }

  /**
   * Get trades for a market
   */
  async getTradesByMarketId(marketId: string, limit = 50): Promise<any[]> {
    const result = await this.pool.query(
      `SELECT 
        id, 
        market_id, 
        yes_pts,
        cost_pence,
        contracts,
        maker_order_id,
        taker_order_id,
        maker_id,
        taker_id,
        maker_fee_pence,
        taker_fee_pence,
        side,
        executed_at,
        created_at
      FROM trades 
      WHERE market_id = $1 
      ORDER BY executed_at DESC 
      LIMIT $2`,
      [marketId, limit]
    );
    return result.rows;
  }

  /**
   * Execute a raw SQL query
   */
  async query<T = any>(sql: string, params?: any[]): Promise<{ rows: T[] }> {
    return this.pool.query<T>(sql, params);
  }
}
