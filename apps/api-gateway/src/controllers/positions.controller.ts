import { Controller, Get, Post, Param, Req, Body } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { NatsClient } from '../nats/nats.client';
import { NATS_SUBJECTS } from '../nats/subjects';
import { PRICE_SCALE, CONTRACT_SCALE, CONTRACT_PAYOUT_PENCE } from '@betting-exchange/shared-types';
import { RustExchangeService } from '../services/rust-exchange.service';
import { v4 as uuidv4 } from 'uuid';

interface TradePosition {
  sizePence: number;
  yesPricePts: number;
  feePence: number;
  executedAt: string;
  contractsMicros: string; // BigInt as string for JSON
}

interface Position {
  marketId: string;
  netYesPence: number; // Net exposure in pence (positive = long YES, negative = short YES)
  netContractsMicros: string; // Net contracts in microcontracts (BigInt as string)
  avgEntryYesPts: number; // Weighted average entry price in YES probability points
  markYesPts: number; // Current mark price (midpoint)
  unrealizedPnlPence: number; // Unrealized P&L in pence
  totalFeesPence: number; // Total fees paid
  canCashOut: boolean; // Whether position can be closed
  buyPositions: TradePosition[]; // All buy (FOR) positions
  sellPositions: TradePosition[]; // All sell (LAY) positions
}

@Controller('v1/positions')
export class PositionsController {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly natsClient: NatsClient,
    private readonly rustExchange: RustExchangeService,
  ) {}

  /**
   * Get all active positions for the user across all markets
   */
  @Get('me')
  async getAllMyPositions(@Req() req: any): Promise<Position[]> {
    const userId = req.session?.userId;
    if (!userId) {
      throw new Error('User not authenticated');
    }

    return this.rustExchange.getPositions({ userId });
  }

  /**
   * Get user's position for a specific market
   * Computes from trades table
   */
  @Get('markets/:marketId/me')
  async getMyPosition(
    @Param('marketId') marketId: string,
    @Req() req: any
  ): Promise<Position> {
    // Get user ID from session
    const userId = req.session?.userId;
    if (!userId) {
      throw new Error('User not authenticated');
    }

    return this.rustExchange.getPositionForMarket({ userId, marketId });
  }

  /**
   * Cash out a position by placing an IOC order at market
   * 
   * NOTE: This is now a simplified wrapper. For full CLOB-only close logic,
   * use POST /v1/cashout/execute which implements proper IOC order submission.
   * 
   * This endpoint is kept for backward compatibility with existing UI code.
   */
  @Post('markets/:marketId/cashout')
  async cashOutPosition(
    @Param('marketId') marketId: string,
    @Req() req: any,
    @Body() body: { percentage?: number } // Optional: percentage to cash out (default 100%)
  ): Promise<{ success: boolean; message: string; orderId?: string }> {
    const userId = req.session?.userId;
    if (!userId) {
      throw new Error('User not authenticated');
    }

    // Get current position
    const position = await this.getMyPosition(marketId, req);
    
    if (position.netContractsMicros === '0') {
      throw new Error('No position to cash out');
    }

    const percentage = body.percentage || 100;
    if (percentage <= 0 || percentage > 100) {
      throw new Error('Invalid percentage. Must be between 0 and 100');
    }

    if (!position.canCashOut) {
      throw new Error('Position cannot be cashed out. No liquidity available.');
    }

    // CRITICAL: Cancel all resting orders for this user/market to prevent reopening position
    const cancelResult = await this.databaseService.query(
      `UPDATE orders
       SET status = 'CANCELLED', updated_at = NOW()
       WHERE user_id = $1 
       AND market_id = $2 
       AND status IN ('OPEN', 'PARTIALLY_MATCHED')
       RETURNING id`,
      [userId, marketId]
    );
    
    // Publish cancel events to matching engine for each cancelled order
    for (const row of cancelResult.rows) {
      this.natsClient.publish(NATS_SUBJECTS.ORDERS_CANCEL, {
        orderId: row.id,
        userId,
        marketId,
        reason: 'Cancelled before closing position',
        timestamp: new Date().toISOString(),
      });
    }

    // Calculate contracts to close based on netContractsMicros
    const netContracts = BigInt(position.netContractsMicros);
    const closeContractsMicros = (netContracts * BigInt(percentage)) / 100n;
    
    if (closeContractsMicros === 0n) {
      throw new Error('Cash out amount too small');
    }

    // Determine close side
    const isLong = netContracts > 0n;
    const closeSide = isLong ? 'LAY' : 'FOR';
    
    // Use extreme price to sweep book
    const yesPts = closeSide === 'FOR' ? PRICE_SCALE - 1 : 1;
    const pPts = closeSide === 'FOR' ? yesPts : PRICE_SCALE - yesPts;
    
    // Use absolute value of closeContractsMicros for calculations
    const absCloseContractsMicros = closeContractsMicros < 0n ? -closeContractsMicros : closeContractsMicros;
    
    // Calculate max liability
    const maxLossPerContract = closeSide === 'LAY' ? PRICE_SCALE - yesPts : yesPts;
    const maxLiabilityPence = Number((BigInt(maxLossPerContract) * absCloseContractsMicros * BigInt(CONTRACT_PAYOUT_PENCE)) / (BigInt(PRICE_SCALE) * BigInt(CONTRACT_SCALE)));
    
    // Check and lock balance
    const walletResult = await this.databaseService.query(
      'SELECT balance FROM wallets WHERE user_id = $1',
      [userId]
    );
    if (walletResult.rows.length === 0) {
      throw new Error('Wallet not found');
    }
    const balancePence = Math.floor(parseFloat(walletResult.rows[0].balance) * 100);
    if (balancePence < maxLiabilityPence) {
      throw new Error(`Insufficient balance for close order`);
    }

    await this.databaseService.lockBalance(userId, maxLiabilityPence);
    
    // Create IOC order
    const orderId = uuidv4();
    const stakePence = closeSide === 'FOR' ? maxLiabilityPence : undefined;
    const liabilityPence = closeSide === 'LAY' ? maxLiabilityPence : undefined;
    
    try {
      await this.databaseService.query(
        `INSERT INTO orders 
          (id, market_id, user_id, side, p_pts, limit_price_yes_pts, stake_pence, liability_pence,
           qty_remaining_micros, qty_original_micros, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'OPEN', NOW(), NOW())`,
        [
          orderId, 
          marketId, 
          userId, 
          closeSide, 
          pPts, 
          yesPts,
          stakePence,
          liabilityPence,
          absCloseContractsMicros.toString(),
          absCloseContractsMicros.toString()
        ]
      );

      // Publish IOC order to matching engine
      const orderCommand = {
        orderId,
        userId,
        marketId,
        side: closeSide,
        pPts,
        yesPts,
        stakePence: closeSide === 'FOR' ? maxLiabilityPence : undefined,
        liabilityPence: closeSide === 'LAY' ? maxLiabilityPence : undefined,
        originalContractsMicros: absCloseContractsMicros.toString(),
        remainingContractsMicros: absCloseContractsMicros.toString(),
        timeInForce: 'IOC',
        timestamp: new Date().toISOString(),
      };

      this.natsClient.publish(NATS_SUBJECTS.ORDERS_SUBMIT, orderCommand);

      return {
        success: true,
        message: `Close order submitted (${percentage}% of position). Order will match immediately or cancel.`,
        orderId,
      };
    } catch (error) {
      // Rollback balance lock on error
      await this.databaseService.query(
        'UPDATE wallets SET balance = balance + $1, locked_balance = locked_balance - $1 WHERE user_id = $2',
        [maxLiabilityPence / 100, userId]
      );
      throw error;
    }
  }
}
