import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { Logger } from '@betting-exchange/shared-config';

export interface User {
  id: string;
  email: string;
  googleSub: string | null;
  passwordHash: string | null;
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
          google_sub VARCHAR(255),
          password_hash VARCHAR(255),
          name VARCHAR(255),
          avatar_url VARCHAR(500),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        
        CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
        CREATE INDEX IF NOT EXISTS idx_users_google_sub ON users(google_sub) WHERE google_sub IS NOT NULL;
      `);

      // Create wallets table
      await client.query(`
        CREATE TABLE IF NOT EXISTS wallets (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          balance DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
          locked_balance DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
          currency VARCHAR(3) NOT NULL DEFAULT 'USD',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          UNIQUE(user_id, currency)
        );
        
        CREATE INDEX IF NOT EXISTS idx_wallets_user_id ON wallets(user_id);
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
      'SELECT id, email, google_sub as "googleSub", password_hash as "passwordHash", name, avatar_url as "avatarUrl", created_at as "createdAt", updated_at as "updatedAt" FROM users WHERE google_sub = $1',
      [googleSub]
    );
    return result.rows[0] || null;
  }

  /**
   * Find user by email
   */
  async findUserByEmail(email: string): Promise<User | null> {
    const result = await this.pool.query<User>(
      'SELECT id, email, google_sub as "googleSub", password_hash as "passwordHash", name, avatar_url as "avatarUrl", created_at as "createdAt", updated_at as "updatedAt" FROM users WHERE email = $1',
      [email]
    );
    return result.rows[0] || null;
  }

  /**
   * Find user by ID
   */
  async findUserById(id: string): Promise<User | null> {
    const result = await this.pool.query<User>(
      'SELECT id, email, google_sub as "googleSub", password_hash as "passwordHash", name, avatar_url as "avatarUrl", created_at as "createdAt", updated_at as "updatedAt" FROM users WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  }

  /**
   * Create new user with Google OAuth
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
       RETURNING id, email, google_sub as "googleSub", password_hash as "passwordHash", name, avatar_url as "avatarUrl", created_at as "createdAt", updated_at as "updatedAt"`,
      [data.email, data.googleSub, data.name || null, data.avatarUrl || null]
    );
    return result.rows[0];
  }

  /**
   * Create new user with email/password
   */
  async createUserWithPassword(data: {
    email: string;
    passwordHash: string;
    name?: string;
  }): Promise<User> {
    const result = await this.pool.query<User>(
      `INSERT INTO users (email, password_hash, name) 
       VALUES ($1, $2, $3) 
       RETURNING id, email, google_sub as "googleSub", password_hash as "passwordHash", name, avatar_url as "avatarUrl", created_at as "createdAt", updated_at as "updatedAt"`,
      [data.email, data.passwordHash, data.name || null]
    );
    return result.rows[0];
  }

  /**
   * Find wallet by user ID
   */
  async findWalletByUserId(userId: string, currency = 'USD'): Promise<WalletAccount | null> {
    const result = await this.pool.query<WalletAccount>(
      `SELECT id, user_id as "userId", balance, locked_balance as "lockedBalance", currency, created_at as "createdAt", updated_at as "updatedAt" 
       FROM wallets 
       WHERE user_id = $1 AND currency = $2`,
      [userId, currency]
    );
    return result.rows[0] || null;
  }

  /**
   * Create wallet for user
   */
  async createWallet(userId: string, currency = 'USD'): Promise<WalletAccount> {
    // Give new users £10,000 starting balance
    const startingBalance = 10000.00;
    const result = await this.pool.query<WalletAccount>(
      `INSERT INTO wallets (user_id, balance, locked_balance, currency) 
       VALUES ($1, $2, 0.00, $3) 
       RETURNING id, user_id as "userId", balance, locked_balance as "lockedBalance", currency, created_at as "createdAt", updated_at as "updatedAt"`,
      [userId, startingBalance, currency]
    );
    return result.rows[0];
  }

  /**
   * Ensure user has a wallet (create if not exists)
   */
  async ensureWallet(userId: string, currency = 'GBP'): Promise<WalletAccount> {
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
    currency = 'GBP'
  ): Promise<WalletAccount> {
    const result = await this.pool.query(
      `UPDATE wallets 
       SET balance = balance + $1, updated_at = NOW() 
       WHERE user_id = $2 AND currency = $3 
       RETURNING id, user_id as "userId", balance, locked_balance as "lockedBalance", currency, created_at as "createdAt", updated_at as "updatedAt"`,
      [amount, userId, currency]
    );
    
    if (result.rows.length === 0) {
      throw new Error('Wallet not found');
    }
    
    const row = result.rows[0];
    // Convert string decimals to numbers
    return {
      id: row.id,
      userId: row.userId,
      balance: parseFloat(row.balance || '0'),
      lockedBalance: parseFloat(row.lockedBalance || '0'),
      currency: row.currency,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    };
  }

  /**
   * Lock balance for an order (move from balance to locked_balance)
   */
  async lockBalance(
    userId: string,
    amountPence: number,
    currency = 'GBP'
  ): Promise<WalletAccount> {
    const amountPounds = amountPence / 100;
    
    const result = await this.pool.query<WalletAccount>(
      `UPDATE wallets 
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
    currency = 'GBP'
  ): Promise<WalletAccount> {
    const amountPounds = amountPence / 100;
    
    const result = await this.pool.query<WalletAccount>(
      `UPDATE wallets 
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
   * Execute a database transaction
   */
  async transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Convert pence (bigint) to pounds string for NUMERIC(15,2)
   */
  private penceToPoundsStr(pence: bigint): string {
    const sign = pence < 0n ? '-' : '';
    const abs = pence < 0n ? -pence : pence;
    const pounds = abs / 100n;
    const pennies = abs % 100n;
    return `${sign}${pounds.toString()}.${pennies.toString().padStart(2, '0')}`;
  }

  /**
   * Insert settlement record for idempotency (prevents double-settlement)
   */
  async insertSettlementOnce(
    client: PoolClient,
    tradeId: string,
    orderId: string,
    userId: string
  ): Promise<boolean> {
    const res = await client.query(
      `INSERT INTO trade_settlements (trade_id, order_id, user_id)
       VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING
       RETURNING trade_id`,
      [tradeId, orderId, userId]
    );
    return res.rowCount === 1;
  }

  /**
   * Get order fields needed for settlement
   */
  async getOrderForSettlement(
    client: PoolClient,
    orderId: string
  ): Promise<{ user_id: string; side: string; liability_pence: string; qty_original_micros: string } | null> {
    const res = await client.query(
      `SELECT user_id, side, liability_pence, qty_original_micros
       FROM orders
       WHERE id = $1`,
      [orderId]
    );
    return res.rows[0] || null;
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
      `UPDATE wallets 
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
      `UPDATE wallets 
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
    timeInForce?: 'GTC' | 'IOC';
  }): Promise<Order> {
    const result = await this.pool.query<Order>(
      `INSERT INTO orders (id, user_id, market_id, outcome_id, side, p_pts, limit_price_yes_pts, 
                          liability_pence, status, 
                          qty_original_micros, qty_remaining_micros, time_in_force) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'OPEN', $9, $10, $11) 
       RETURNING id, user_id as "userId", market_id as "marketId", outcome_id as "outcomeId", 
                 side, p_pts as "pPts", limit_price_yes_pts as "yesPts",
                 liability_pence as "liabilityPence", status, 
                 qty_original_micros as "originalContractsMicros", 
                 qty_remaining_micros as "remainingContractsMicros",
                 time_in_force as "timeInForce",
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
        data.timeInForce || 'GTC',
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
              side, p_pts as "pPts", limit_price_yes_pts as "yesPts", 
              stake_pence as "stakePence", liability_pence as "liabilityPence",
              qty_original_micros as "originalContracts", 
              qty_remaining_micros as "remainingContracts",
              status, 
              filled_pence as "filledPence", remaining_pence as "remainingPence",
              time_in_force as "timeInForce",
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
              side, p_pts as "pPts", limit_price_yes_pts as "yesPts", 
              stake_pence as "stakePence", liability_pence as "liabilityPence",
              qty_original_micros as "originalContracts", qty_remaining_micros as "remainingContracts",
              status, 
              filled_pence as "filledPence", remaining_pence as "remainingPence",
              created_at as "createdAt", updated_at as "updatedAt"
       FROM orders 
       WHERE market_id = $1 
         AND status = ANY($2)
         AND limit_price_yes_pts >= 1000
         AND limit_price_yes_pts <= 9999000
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
        price_yes_pts as yes_pts,
        notional_pence as cost_pence,
        qty_micros as contracts,
        maker_order_id,
        taker_order_id,
        maker_user_id as maker_id,
        taker_user_id as taker_id,
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
   * Get trades for a user (where they were maker or taker)
   * Includes realized P&L from position lots when the trade opened a lot
   */
  async getTradesByUserId(userId: string, limit = 100): Promise<any[]> {
    const result = await this.pool.query(
      `SELECT 
        t.id, 
        t.market_id,
        m.name as market_question,
        t.price_yes_pts as yes_pts,
        t.notional_pence as cost_pence,
        t.qty_micros as contracts,
        t.maker_order_id,
        t.taker_order_id,
        t.maker_user_id as maker_id,
        t.taker_user_id as taker_id,
        t.maker_fee_pence,
        t.taker_fee_pence,
        t.side,
        t.executed_at,
        t.created_at,
        CASE 
          WHEN t.maker_user_id = $1 THEN 'maker'
          WHEN t.taker_user_id = $1 THEN 'taker'
        END as user_role,
        CASE 
          WHEN t.maker_user_id = $1 THEN t.maker_fee_pence
          WHEN t.taker_user_id = $1 THEN t.taker_fee_pence
        END as user_fee_pence,
        COALESCE(pl.realized_pnl_pence, 0) as realized_pnl_pence,
        pl.qty_opened_micros as lot_opened_micros,
        pl.qty_remaining_micros as lot_remaining_micros,
        pl.side as lot_side
      FROM trades t
      LEFT JOIN markets m ON t.market_id = m.id
      LEFT JOIN position_lots pl ON pl.opened_from_trade_id = t.id AND pl.user_id = $1
      WHERE t.maker_user_id = $1 OR t.taker_user_id = $1
      ORDER BY t.executed_at DESC 
      LIMIT $2`,
      [userId, limit]
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
