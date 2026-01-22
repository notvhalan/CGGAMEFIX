import { Pool } from 'pg';
import { Logger } from '@betting-exchange/shared-config';
import { OrderSide } from '@betting-exchange/shared-types';

const logger = new Logger('DatabaseService');

export interface DbOrder {
  id: string;
  market_id: string;
  user_id: string;
  side: string; // 'FOR', 'LAY', 'BACK' (for backward compatibility)
  p_pts?: number; // Probability points (original user input)
  yes_pts?: number; // Canonical YES price
  odds?: string; // Decimal string (old schema)
  stake?: string; // Decimal string (old schema)
  stake_pence?: number; // FOR orders: stake in pence
  liability_pence?: number; // LAY orders: liability in pence
  remaining_amount?: string; // Decimal string (old schema)
  remaining_pence?: number; // Integer pence (old schema)
  remaining_contracts?: string; // Remaining contracts as bigint string
  original_contracts?: string; // Original contracts as bigint string
  status: string;
  created_at: Date;
  updated_at: Date;
}

export interface DbTrade {
  id: string;
  market_id: string;
  yes_price_pts: number; // Canonical YES price in probability points
  size_pence: number; // Size in pence (integer)
  taker_order_id: string;
  maker_order_id: string;
  taker_id: string; // Note: column name is taker_id, not taker_user_id
  maker_id: string; // Note: column name is maker_id, not maker_user_id
  side: OrderSide;
  maker_fee_pence: number;
  taker_fee_pence: number;
  executed_at: Date;
  created_at: Date;
}

export class DatabaseService {
  private pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
    
    logger.info('Database pool initialized');
  }

  async connect(): Promise<void> {
    try {
      await this.pool.query('SELECT NOW()');
      logger.info('Database connection verified');
      await this.ensureTradesTable();
    } catch (error) {
      logger.error('Failed to connect to database', error);
      throw error;
    }
  }

  private async ensureTradesTable(): Promise<void> {
    const client = await this.pool.connect();
    try {
      // Check if trades table exists
      const tableExists = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'trades'
        );
      `);
      
      if (!tableExists.rows[0].exists) {
        // Create trades table if it doesn't exist
        await client.query(`
          CREATE TABLE trades (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            market_id UUID NOT NULL,
            price DECIMAL(10, 2) NOT NULL,
            size DECIMAL(15, 2) NOT NULL,
            taker_order_id UUID NOT NULL,
            maker_order_id UUID NOT NULL,
            taker_user_id UUID NOT NULL,
            maker_user_id UUID NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
          );
          
          CREATE INDEX idx_trades_market_id ON trades(market_id);
          CREATE INDEX idx_trades_taker_order ON trades(taker_order_id);
          CREATE INDEX idx_trades_maker_order ON trades(maker_order_id);
          CREATE INDEX idx_trades_created_at ON trades(created_at DESC);
        `);
        logger.info('Trades table created');
      } else {
        // Check if created_at column exists
        const columnExists = await client.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.columns 
            WHERE table_name = 'trades' AND column_name = 'created_at'
          );
        `);
        
        if (!columnExists.rows[0].exists) {
          // Add created_at column if it doesn't exist
          await client.query(`
            ALTER TABLE trades ADD COLUMN created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
            CREATE INDEX IF NOT EXISTS idx_trades_created_at ON trades(created_at DESC);
          `);
          logger.info('Added created_at column to trades table');
        } else {
          logger.info('Trades table already exists with correct schema');
        }
      }
    } catch (error) {
      logger.error('Failed to ensure trades table', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async getOrderById(orderId: string): Promise<DbOrder | null> {
    try {
      const result = await this.pool.query<DbOrder>(
        `SELECT id, market_id, user_id, side, p_pts, stake_pence, remaining_pence, status, created_at, updated_at
         FROM orders WHERE id = $1`,
        [orderId]
      );
      return result.rows[0] || null;
    } catch (error) {
      logger.error(`Failed to get order ${orderId}`, error);
      throw error;
    }
  }

  async getOpenOrdersForMarket(marketId: string): Promise<DbOrder[]> {
    try {
      const result = await this.pool.query<DbOrder>(
        `SELECT id, market_id, user_id, side, p_pts, yes_pts, remaining_contracts, status, created_at, updated_at
         FROM orders 
         WHERE market_id = $1 
           AND status IN ('OPEN', 'PARTIALLY_MATCHED')
         ORDER BY created_at ASC`,
        [marketId]
      );
      return result.rows;
    } catch (error) {
      logger.error(`Failed to get open orders for market ${marketId}`, error);
      throw error;
    }
  }

  async updateOrderStatus(
    orderId: string,
    status: string,
    remainingContracts?: bigint
  ): Promise<void> {
    try {
      if (remainingContracts !== undefined) {
        await this.pool.query(
          `UPDATE orders 
           SET status = $1, 
               remaining_contracts = $2,
               updated_at = NOW()
           WHERE id = $3`,
          [status, remainingContracts.toString(), orderId]
        );
      } else {
        await this.pool.query(
          `UPDATE orders 
           SET status = $1, updated_at = NOW()
           WHERE id = $2`,
          [status, orderId]
        );
      }
      logger.debug(`Order ${orderId} updated to status ${status}, remainingContracts=${remainingContracts}`);
    } catch (error) {
      logger.error(`Failed to update order ${orderId}`, error);
      throw error;
    }
  }

  async createTrade(trade: {
    marketId: string;
    yesPricePts: number;
    contractsMicros: string; // bigint as string
    costPence: number;
    takerOrderId: string;
    makerOrderId: string;
    takerUserId: string;
    makerUserId: string;
    side: OrderSide;
    takerFeePence: number;
    makerFeePence: number;
  }): Promise<string> {
    try {
      const result = await this.pool.query<{ id: string }>(
        `INSERT INTO trades 
         (market_id, yes_pts, contracts, cost_pence, taker_order_id, maker_order_id, taker_id, maker_id, side, taker_fee_pence, maker_fee_pence, executed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
         RETURNING id`,
        [
          trade.marketId,
          trade.yesPricePts,
          trade.contractsMicros,
          trade.costPence,
          trade.takerOrderId,
          trade.makerOrderId,
          trade.takerUserId,
          trade.makerUserId,
          trade.side,
          trade.takerFeePence,
          trade.makerFeePence,
        ]
      );
      const tradeId = result.rows[0].id;
      logger.debug(`Trade ${tradeId} created: ${trade.contractsMicros} contracts @ yesPts=${trade.yesPricePts}, cost=${trade.costPence}p`);
      return tradeId;
    } catch (error) {
      logger.error('Failed to create trade', error);
      throw error;
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
    logger.info('Database pool closed');
  }
}
