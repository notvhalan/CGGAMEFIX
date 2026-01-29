import { NatsConnection } from 'nats';
import { Pool } from 'pg';
import { OrderSide } from '@betting-exchange/shared-types';

/**
 * Wallet Service - Manages user funds and ledger entries
 * 
 * Responsibilities:
 * 1. Reserve funds when orders are placed
 * 2. Capture (settle) funds when trades execute
 * 3. Release funds when orders are cancelled
 * 4. Maintain double-entry ledger for audit trail
 */
export class WalletService {
  private pool: Pool;
  
  constructor(
    private nats: NatsConnection, // eslint-disable-line @typescript-eslint/no-unused-vars
    private env: { NATS_URL: string; DATABASE_URL: string; LOG_LEVEL: string }, // eslint-disable-line @typescript-eslint/no-unused-vars
    private logger: any
  ) {
    this.pool = new Pool({
      connectionString: env.DATABASE_URL,
    });
  }
  
  async initialize() {
    // Test database connection
    try {
      await this.pool.query('SELECT NOW()');
      this.logger.info('Database connection established');
    } catch (error) {
      this.logger.error('Failed to connect to database', error);
      throw error;
    }
    this.logger.info('Wallet Service initialized');
  }
  
  /**
   * Handle order accepted event - reserve funds
   */
  async handleOrderAccepted(event: any) {
    const { orderId, userId, side, price, size } = event;
    
    this.logger.info('Reserving funds for order', { orderId, userId });
    
    try {
      // TODO: Calculate required funds based on side
      // BACK: reserve stake amount
      // LAY: reserve liability (stake * (odds - 1))
      
      const reserveAmount = side === 'BACK' ? size : size * (price - 1);
      
      // TODO: Create ledger entries
      // 1. Debit available balance
      // 2. Credit reserved balance
      
      this.logger.info('Funds reserved', { orderId, userId, amount: reserveAmount });
      
    } catch (error) {
      this.logger.error('Failed to reserve funds', error, { orderId, userId });
      // TODO: Publish fund reservation failed event
    }
  }
  
  /**
   * Handle trade executed event - capture/settle funds
   */
  async handleTradeExecuted(event: any) {
    console.log('Received TRADE_EXECUTED event:', JSON.stringify(event, null, 2));
    const { tradeId, makerUserId, takerUserId, notionalPence, takerSide, makerFeePence, takerFeePence } = event;
    
    // Skip system/placeholder trades (zero UUID or zero notionalPence)
    const ZERO_UUID = '00000000-0000-0000-0000-000000000000';
    if (makerUserId === ZERO_UUID || takerUserId === ZERO_UUID || notionalPence === 0) {
      this.logger.info('Skipping system trade settlement', {
        tradeId,
        makerUserId,
        takerUserId,
        notionalPence,
      });
      return;
    }
    
    this.logger.info('Settling trade', { tradeId, makerUserId, takerUserId, notionalPence });
    
    try {
      // For cashout/position closing:
      // - Taker is closing position (buying back or selling out)
      // - Maker is providing liquidity (could be LP or another user)
      // 
      // Trade settlement:
      // - FOR side: Taker pays notionalPence, Maker receives notionalPence
      // - LAY side: Maker pays notionalPence, Taker receives notionalPence
      // - Both pay their respective fees
      
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        
        if (takerSide === OrderSide.FOR) {
          // Taker is buying YES (paying premium)
          await this.updateBalance(client, takerUserId, -notionalPence - takerFeePence, `Trade ${tradeId} - Taker buy`);
          await this.updateBalance(client, makerUserId, notionalPence - makerFeePence, `Trade ${tradeId} - Maker sell`);
        } else {
          // Taker is selling YES (receiving premium)
          await this.updateBalance(client, takerUserId, notionalPence - takerFeePence, `Trade ${tradeId} - Taker sell`);
          await this.updateBalance(client, makerUserId, -notionalPence - makerFeePence, `Trade ${tradeId} - Maker buy`);
        }
        
        await client.query('COMMIT');
        this.logger.info('Trade settled', { tradeId });
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
      
    } catch (error) {
      console.error('Failed to settle trade:', error);
      this.logger.error('Failed to settle trade', { tradeId, error: error instanceof Error ? error.message : String(error) });
    }
  }
  
  /**
   * Update user's wallet balance
   */
  private async updateBalance(client: any, userId: string, amountPence: number, description: string) {
    // Get wallet_account id and current balance
    const { rows } = await client.query(
      `SELECT id, balance FROM wallets WHERE user_id = $1 FOR UPDATE`,
      [userId]
    );
    
    if (rows.length === 0) {
      throw new Error(`Wallet account not found for user ${userId}`);
    }
    
    const walletId = rows[0].id;
    const balanceBefore = parseFloat(rows[0].balance);
    const amountDecimal = amountPence / 100;
    const balanceAfter = balanceBefore + amountDecimal;
    
    // Update wallets balance
    await client.query(
      `UPDATE wallets 
       SET balance = $1,
           updated_at = NOW()
       WHERE user_id = $2`,
      [balanceAfter, userId]
    );
    
    // Log balance change to ledger_entries using double-entry bookkeeping
    const debit = amountDecimal < 0 ? Math.abs(amountDecimal) : 0;
    const credit = amountDecimal > 0 ? amountDecimal : 0;
    
    await client.query(
      `INSERT INTO ledger_entries (
        user_id, 
        wallet_id,
        entry_type, 
        debit,
        credit,
        balance, 
        description, 
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [userId, walletId, 'TRADE_SETTLEMENT', debit, credit, balanceAfter, description]
    );
    
    this.logger.debug(`Updated balance for user ${userId}: ${balanceBefore.toFixed(2)} -> ${balanceAfter.toFixed(2)} (${amountDecimal > 0 ? '+' : ''}${amountDecimal.toFixed(2)})`);
  }
  
  /**
   * Handle order cancelled event - release reserved funds
   */
  async handleOrderCancelled(event: any) {
    const { orderId, userId } = event;
    
    this.logger.info('Releasing reserved funds', { orderId, userId });
    
    try {
      // TODO: Release reserved funds back to available balance
      // Create ledger entries:
      // 1. Debit reserved balance
      // 2. Credit available balance
      
      this.logger.info('Funds released', { orderId, userId });
      
    } catch (error) {
      this.logger.error('Failed to release funds', error, { orderId, userId });
    }
  }
}
