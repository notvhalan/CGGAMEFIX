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

  getPool(): Pool {
    return this.pool;
  }

  async connect(): Promise<void> {
    try {
      await this.pool.query('SELECT NOW()');
      logger.info('Database connection verified');
      // ensureTradesTable() removed - rely on SQL migrations instead to avoid schema mismatch
    } catch (error) {
      logger.error('Failed to connect to database', error);
      throw error;
    }
  }

  // ensureTradesTable() REMOVED due to schema mismatch
  // createTrade() uses columns: yes_pts, contracts, cost_pence, taker_id, maker_id
  // old ensureTradesTable() created: price, size, taker_user_id, maker_user_id
  // Rely on SQL migrations to create trades table with correct schema

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
        `SELECT id, market_id, user_id, side, p_pts, limit_price_yes_pts as yes_pts, qty_remaining_micros as remaining_contracts, status, created_at, updated_at
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
               qty_remaining_micros = $2,
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
    priceYesPts: number; // Renamed from yesPricePts
    qtyMicros: string; // Renamed from contractsMicros
    notionalPence: number; // Renamed from costPence
    takerOrderId: string;
    makerOrderId: string;
    takerUserId: string;
    makerUserId: string;
    takerSide: OrderSide; // Renamed from side
    takerFeePence: number;
    makerFeePence: number;
  }): Promise<string> {
    try {
      const result = await this.pool.query<{ id: string }>(
        `INSERT INTO trades 
         (market_id, price_yes_pts, qty_micros, notional_pence, taker_order_id, maker_order_id, taker_user_id, maker_user_id, side, taker_fee_pence, maker_fee_pence, executed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
         RETURNING id`,
        [
          trade.marketId,
          trade.priceYesPts,
          trade.qtyMicros,
          trade.notionalPence,
          trade.takerOrderId,
          trade.makerOrderId,
          trade.takerUserId,
          trade.makerUserId,
          trade.takerSide,
          trade.takerFeePence,
          trade.makerFeePence,
        ]
      );
      const tradeId = result.rows[0].id;
      logger.debug(`Trade ${tradeId} created: ${trade.qtyMicros} micros @ priceYesPts=${trade.priceYesPts}, notional=${trade.notionalPence}p`);
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
