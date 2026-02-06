import { Controller, Post, Body, Req, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { Logger } from '@betting-exchange/shared-config';
import { FastifyRequest } from 'fastify';
import { LiquidityBotsService } from '../services/liquidity-bots.service';
import { DatabaseService } from '../database/database.service';
import { NatsClient } from '../nats/nats.client';
import { NATS_SUBJECTS } from '../nats/subjects';

@Controller('v1/admin')
export class AdminController {
  private readonly logger = new Logger('AdminController');
  
  // Admin email whitelist
  private readonly ADMIN_EMAILS = [
    'vhalan02@gmail.com',
    'developer@gmail.com',
  ];

  constructor(
    private readonly liquidityBotsService: LiquidityBotsService,
    private readonly databaseService: DatabaseService,
    private readonly natsClient: NatsClient,
  ) {}
  
  /**
   * Check if the current user is an admin
   */
  private async checkAdminAccess(userId: string): Promise<void> {
    const user = await this.databaseService.findUserById(userId);
    
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    
    if (!this.ADMIN_EMAILS.includes(user.email)) {
      this.logger.warn(`Unauthorized admin access attempt by ${user.email} (${userId})`);
      throw new ForbiddenException('Admin access denied');
    }
    
    this.logger.info(`Admin access granted to ${user.email}`);
  }

  @Post('liquidity-bots/start')
  async startLiquidityBots(
    @Body() body: {
      marketId: string;
      userCount: number;
      midYesPts: number;
      halfSpreadPts: number;
      levels: number;
      sizeContracts: number;
      takerChance: number;
      sizeVariance?: number;
      priceVariance?: number;
      orderDelayMs?: number;
      orderDelayVarianceMs?: number;
      refreshIntervalMs?: number;
      priceDriftPts?: number;
      volatility?: number;
    },
    @Req() req: FastifyRequest & { session: any },
  ) {
    const userId = req.session?.userId;
    if (!userId) {
      throw new UnauthorizedException('Not authenticated');
    }

    // Check admin access
    await this.checkAdminAccess(userId);

    this.logger.info(`Admin ${userId} starting liquidity bots`, body);

    try {
      await this.liquidityBotsService.startBots(body);
      return {
        success: true,
        message: `Started ${body.userCount} liquidity bots for market ${body.marketId}`,
      };
    } catch (error) {
      this.logger.error('Failed to start liquidity bots', error);
      throw error;
    }
  }

  @Post('liquidity-bots/stop')
  async stopLiquidityBots(
    @Body() body: any, // Accept but ignore body to satisfy Fastify
    @Req() req: FastifyRequest & { session: any },
  ) {
    const userId = req.session?.userId;
    if (!userId) {
      throw new UnauthorizedException('Not authenticated');
    }

    // Check admin access
    await this.checkAdminAccess(userId);

    this.logger.info(`Admin ${userId} stopping liquidity bots`);

    try {
      this.liquidityBotsService.stopBots();
      return {
        success: true,
        message: 'Stopped all liquidity bots',
      };
    } catch (error) {
      this.logger.error('Failed to stop liquidity bots', error);
      throw error;
    }
  }

  @Post('bot-users')
  async getAvailableBotUsers(
    @Body() body: any,
    @Req() req: FastifyRequest & { session: any },
  ) {
    const userId = req.session?.userId;
    if (!userId) {
      throw new UnauthorizedException('Not authenticated');
    }

    // Check admin access
    await this.checkAdminAccess(userId);

    try {
      const result = await this.databaseService.query(
        `SELECT id, email, name FROM users WHERE email LIKE '%@bot.local' ORDER BY email`
      );

      return {
        success: true,
        botUsers: result.rows,
        count: result.rows.length,
      };
    } catch (error) {
      this.logger.error('Failed to fetch bot users', error);
      throw error;
    }
  }

  /**
   * Resolve a market - declares the winner and triggers settlement
   */
  @Post('markets/resolve')
  async resolveMarket(
    @Body() body: {
      marketId: string;
      winningOutcome: 'YES' | 'NO'; // For binary markets
      reason?: string;
    },
    @Req() req: FastifyRequest & { session: any },
  ) {
    const userId = req.session?.userId;
    if (!userId) {
      throw new UnauthorizedException('Not authenticated');
    }

    // Check admin access
    await this.checkAdminAccess(userId);

    this.logger.info(`Admin ${userId} resolving market ${body.marketId} - Winner: ${body.winningOutcome}`);

    try {
      // 1. Cancel all open orders for this market
      const cancelledOrdersResult = await this.databaseService.query(
        `UPDATE orders 
         SET status = 'CANCELLED',
             updated_at = NOW()
         WHERE market_id = $1 AND status IN ('OPEN', 'PARTIALLY_MATCHED')
         RETURNING id`,
        [body.marketId]
      );
      this.logger.info(`Cancelled ${cancelledOrdersResult.rows.length} open orders`);

      // 1b. Publish cancel commands to matching engine to clear in-memory orderbook
      for (const order of cancelledOrdersResult.rows) {
        this.natsClient.publish(NATS_SUBJECTS.ORDERS_CANCEL, {
          orderId: order.id,
          marketId: body.marketId,
          reason: 'MARKET_SETTLED',
        });
      }
      this.logger.info(`Published ${cancelledOrdersResult.rows.length} cancel commands to matching engine`);

      // 2. Update market status to SETTLED
      await this.databaseService.query(
        `UPDATE markets 
         SET status = 'SETTLED', 
             settlement_time = NOW(),
             updated_at = NOW()
         WHERE id = $1`,
        [body.marketId]
      );

      // 3. Get all position lots for this market
      const positionLotsResult = await this.databaseService.query(
        `SELECT 
          lot_id,
          user_id,
          market_id,
          side,
          entry_price_yes_pts,
          qty_remaining_micros
        FROM position_lots
        WHERE market_id = $1 AND qty_remaining_micros > 0`,
        [body.marketId]
      );

      const positionLots = positionLotsResult.rows;
      this.logger.info(`Found ${positionLots.length} position lots to settle`);

      // 3. Calculate payouts and update wallets
      const CONTRACT_SCALE = 1_000_000n;
      const CONTRACT_PAYOUT_PENCE = 100n; // £1.00 per contract
      const PRICE_SCALE = 10_000_000n;

      for (const lot of positionLots) {
        // Determine if this position is a winner
        const isWinner = (body.winningOutcome === 'YES' && lot.side === 'FOR') ||
                        (body.winningOutcome === 'NO' && lot.side === 'LAY');

        const qtyMicros = BigInt(lot.qty_remaining_micros);
        const entryYesPts = BigInt(lot.entry_price_yes_pts);

        // Calculate locked amount based on side and entry price
        // FOR (BUY YES): locked = contracts × entry_price
        // LAY (SELL YES): locked = contracts × (1 - entry_price) = contracts × no_cost
        let lockedPence: bigint;
        if (lot.side === 'FOR') {
          // BUY YES: cost is yes price
          lockedPence = (qtyMicros * entryYesPts * CONTRACT_PAYOUT_PENCE) / (PRICE_SCALE * CONTRACT_SCALE);
        } else {
          // SELL YES (LAY): cost is no price = 1 - yes_price
          const noPts = PRICE_SCALE - entryYesPts;
          lockedPence = (qtyMicros * noPts * CONTRACT_PAYOUT_PENCE) / (PRICE_SCALE * CONTRACT_SCALE);
        }

        // Total payout if you win (always £1.00 per contract)
        const totalPayoutPence = (qtyMicros * CONTRACT_PAYOUT_PENCE) / CONTRACT_SCALE;

        if (isWinner) {
          // Winner: Release position lock, credit full payout to available balance
          const payoutAmount = Number(totalPayoutPence);
          const lockedAmount = Number(lockedPence);

          this.logger.info(
            `Winner: user=${lot.user_id}, side=${lot.side}, qty=${lot.qty_remaining_micros}, ` +
            `locked=${lockedAmount}p, payout=${payoutAmount}p, profit=${payoutAmount - lockedAmount}p`
          );

          await this.databaseService.query(
            `UPDATE wallets
             SET locked_balance = locked_balance - $1,
                 balance = balance + $2,
                 updated_at = NOW()
             WHERE user_id = $3 AND currency = 'GBP'`,
            [lockedAmount / 100, payoutAmount / 100, lot.user_id]
          );
        } else {
          // Loser: Just release the position lock (funds go to winners)
          const lockedAmount = Number(lockedPence);

          this.logger.info(
            `Loser: user=${lot.user_id}, side=${lot.side}, qty=${lot.qty_remaining_micros}, ` +
            `locked=${lockedAmount}p, lost=${lockedAmount}p`
          );

          await this.databaseService.query(
            `UPDATE wallets
             SET locked_balance = locked_balance - $1,
                 updated_at = NOW()
             WHERE user_id = $2 AND currency = 'GBP'`,
            [lockedAmount / 100, lot.user_id]
          );
        }
      }

      // 4. Close all position lots (set remaining quantity to 0)
      await this.databaseService.query(
        `UPDATE position_lots
         SET qty_remaining_micros = 0,
             updated_at = NOW()
         WHERE market_id = $1 AND qty_remaining_micros > 0`,
        [body.marketId]
      );

      // 5. Clear positions table (set net quantity to 0)
      await this.databaseService.query(
        `UPDATE positions
         SET net_qty_micros = 0,
             updated_at = NOW()
         WHERE market_id = $1 AND net_qty_micros <> 0`,
        [body.marketId]
      );

      this.logger.info(`Market ${body.marketId} settlement complete`);

      // 6. Broadcast orderbook update to clear frontend
      this.natsClient.publish(NATS_SUBJECTS.MARKET_BOOK_UPDATED, {
        marketId: body.marketId,
        timestamp: Date.now(),
      });
      this.logger.info(`Broadcasted orderbook clear for market ${body.marketId}`);

      return {
        success: true,
        message: `Market ${body.marketId} resolved - Winner: ${body.winningOutcome}`,
        positionsSettled: positionLots.length,
        ordersCancelled: cancelledOrdersResult.rows.length,
      };
    } catch (error) {
      this.logger.error('Failed to resolve market', error);
      throw error;
    }
  }

  /**
   * Void a market - returns all locked funds
   */
  @Post('markets/void')
  async voidMarket(
    @Body() body: {
      marketId: string;
      reason: string;
    },
    @Req() req: FastifyRequest & { session: any },
  ) {
    const userId = req.session?.userId;
    if (!userId) {
      throw new UnauthorizedException('Not authenticated');
    }

    // Check admin access
    await this.checkAdminAccess(userId);

    this.logger.info(`Admin ${userId} voiding market ${body.marketId}: ${body.reason}`);

    try {
      // 1. Update market status to CLOSED
      await this.databaseService.query(
        `UPDATE markets 
         SET status = 'CLOSED', 
             updated_at = NOW()
         WHERE id = $1`,
        [body.marketId]
      );

      // 2. Get all position lots
      const positionLotsResult = await this.databaseService.query(
        `SELECT 
          user_id,
          side,
          entry_price_yes_pts,
          qty_remaining_micros
         FROM position_lots
         WHERE market_id = $1 AND qty_remaining_micros > 0`,
        [body.marketId]
      );

      // 3. Return all locked funds to available balance
      const CONTRACT_SCALE = 1_000_000n;
      const CONTRACT_PAYOUT_PENCE = 100n;
      const PRICE_SCALE = 10_000_000n;

      for (const lot of positionLotsResult.rows) {
        const qtyMicros = BigInt(lot.qty_remaining_micros);
        const entryYesPts = BigInt(lot.entry_price_yes_pts);

        // Calculate locked amount
        let lockedPence: bigint;
        if (lot.side === 'FOR') {
          lockedPence = (qtyMicros * entryYesPts * CONTRACT_PAYOUT_PENCE) / (PRICE_SCALE * CONTRACT_SCALE);
        } else {
          const noPts = PRICE_SCALE - entryYesPts;
          lockedPence = (qtyMicros * noPts * CONTRACT_PAYOUT_PENCE) / (PRICE_SCALE * CONTRACT_SCALE);
        }

        const lockedAmount = Number(lockedPence);

        await this.databaseService.query(
          `UPDATE wallets
           SET locked_balance = locked_balance - $1,
               balance = balance + $1,
               updated_at = NOW()
           WHERE user_id = $2 AND currency = 'GBP'`,
          [lockedAmount / 100, lot.user_id]
        );
      }

      return {
        success: true,
        message: `Market ${body.marketId} voided - All funds returned`,
        positionsVoided: positionLotsResult.rows.length,
      };
    } catch (error) {
      this.logger.error('Failed to void market', error);
      throw error;
    }
  }

  /**
   * Reset market status back to ACTIVE (for failed settlements)
   */
  @Post('markets/reset-status')
  async resetMarketStatus(
    @Body() body: {
      marketId: string;
    },
    @Req() req: FastifyRequest & { session: any },
  ) {
    const userId = req.session?.userId;
    if (!userId) {
      throw new UnauthorizedException('Not authenticated');
    }

    // Check admin access
    await this.checkAdminAccess(userId);

    this.logger.info(`Admin ${userId} resetting market ${body.marketId} status to ACTIVE`);

    try {
      await this.databaseService.query(
        `UPDATE markets 
         SET status = 'ACTIVE',
             settlement_time = NULL,
             updated_at = NOW()
         WHERE id = $1`,
        [body.marketId]
      );

      return {
        success: true,
        message: `Market ${body.marketId} reset to ACTIVE`,
      };
    } catch (error) {
      this.logger.error('Failed to reset market status', error);
      throw error;
    }
  }
}
