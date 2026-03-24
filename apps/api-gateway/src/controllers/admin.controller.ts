import { Controller, Post, Body, Req, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { Logger } from '@betting-exchange/shared-config';
import { FastifyRequest } from 'fastify';
import { LiquidityBotsService } from '../services/liquidity-bots.service';
import { DatabaseService } from '../database/database.service';
import { NatsClient } from '../nats/nats.client';
import { NATS_SUBJECTS } from '../nats/subjects';
import { RustExchangeService } from '../services/rust-exchange.service';

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
    private readonly rustExchange: RustExchangeService,
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

  private async waitForOrderCancellations(orderIds: string[], timeoutMs = 5000): Promise<number> {
    if (orderIds.length === 0) {
      return 0;
    }

    const deadline = Date.now() + timeoutMs;
    let pending = orderIds.length;

    while (Date.now() < deadline) {
      const pendingResult = await this.databaseService.query<{ pending: string }>(
        `SELECT COUNT(*)::text AS pending
         FROM orders
         WHERE id = ANY($1::uuid[])
           AND status IN ('OPEN', 'PARTIALLY_MATCHED')`,
        [orderIds]
      );

      pending = Number(pendingResult.rows[0]?.pending || '0');
      if (pending === 0) {
        return 0;
      }

      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return pending;
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
      // 1. Cancel all open orders for this market via Rust exchange so wallet locks are released correctly.
      const openOrdersResult = await this.databaseService.query<{ id: string; user_id: string }>(
        `SELECT id, user_id
         FROM orders
         WHERE market_id = $1
           AND status IN ('OPEN', 'PARTIALLY_MATCHED')`,
        [body.marketId]
      );

      const openOrderIds = openOrdersResult.rows.map(row => row.id);
      if (openOrdersResult.rows.length > 0) {
        const cancelResults = await Promise.allSettled(
          openOrdersResult.rows.map(order =>
            this.rustExchange.cancelOrder({
              orderId: order.id,
              userId: order.user_id,
            })
          )
        );

        const failedCancels = cancelResults.filter(result => result.status === 'rejected');
        if (failedCancels.length > 0) {
          throw new Error(`Failed to cancel ${failedCancels.length} orders before settlement`);
        }

        const pendingCancels = await this.waitForOrderCancellations(openOrderIds);
        if (pendingCancels > 0) {
          throw new Error(`Timed out waiting for ${pendingCancels} order cancellations before settlement`);
        }
      }

      const cancelledOrdersResult = await this.databaseService.query<{ cancelled_count: string }>(
        `SELECT COUNT(*)::text AS cancelled_count
         FROM orders
         WHERE id = ANY($1::uuid[])
           AND status = 'CANCELLED'`,
        [openOrderIds]
      );
      const cancelledOrdersCount = Number(cancelledOrdersResult.rows[0]?.cancelled_count || '0');
      this.logger.info(`Cancelled ${cancelledOrdersCount} open orders before settlement`);

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

      let totalPayoutGbp = 0;
      let winnersCount = 0;
      let losersCount = 0;
      const userSettlements: any[] = [];

      for (const lot of positionLots) {
        const isBuyYesSide = lot.side === 'BUY_YES' || lot.side === 'FOR';
        // Determine if this position is a winner
        const isWinner = (body.winningOutcome === 'YES' && isBuyYesSide) ||
                        (body.winningOutcome === 'NO' && !isBuyYesSide);

        const qtyMicros = BigInt(lot.qty_remaining_micros);
        const entryYesPts = BigInt(lot.entry_price_yes_pts);

        // Calculate locked amount based on side and entry price
        // FOR (BUY YES): locked = contracts × entry_price
        // LAY (SELL YES): locked = contracts × (1 - entry_price) = contracts × no_cost
        let lockedPence: bigint;
        if (isBuyYesSide) {
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
          const profitPence = payoutAmount - lockedAmount;

          winnersCount++;
          totalPayoutGbp += payoutAmount / 100;

          this.logger.info(
            `Winner: user=${lot.user_id}, side=${lot.side}, qty=${lot.qty_remaining_micros}, ` +
            `locked=${lockedAmount}p, payout=${payoutAmount}p, profit=${profitPence}p`
          );

          await this.databaseService.query(
            `UPDATE wallets
             SET locked_balance = locked_balance - $1,
                 balance = balance + $2,
                 updated_at = NOW()
             WHERE user_id = $3 AND currency = 'GBP'`,
            [lockedAmount / 100, payoutAmount / 100, lot.user_id]
          );

          // Track for settlement record
          userSettlements.push({
            userId: lot.user_id,
            marketId: lot.market_id,
            positionSide: lot.side,
            contractsSettled: lot.qty_remaining_micros,
            entryPriceYesPts: lot.entry_price_yes_pts,
            isWinner: true,
            payoutGbp: payoutAmount / 100,
            profitLossGbp: profitPence / 100,
          });
        } else {
          // Loser: Just release the position lock (funds go to winners)
          const lockedAmount = Number(lockedPence);

          losersCount++;

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

          // Track for settlement record
          userSettlements.push({
            userId: lot.user_id,
            marketId: lot.market_id,
            positionSide: lot.side,
            contractsSettled: lot.qty_remaining_micros,
            entryPriceYesPts: lot.entry_price_yes_pts,
            isWinner: false,
            payoutGbp: 0,
            profitLossGbp: -(lockedAmount / 100),
          });
        }
      }

      // 4. Create settlement record
      const settlementResult = await this.databaseService.query(
        `INSERT INTO market_settlements 
         (market_id, resolved_by_user_id, winning_outcome, settlement_reason, 
          positions_settled, orders_cancelled, total_payout_gbp, winners_count, losers_count)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id`,
        [
          body.marketId,
          userId,
          body.winningOutcome,
          body.reason || null,
          positionLots.length,
          cancelledOrdersCount,
          totalPayoutGbp,
          winnersCount,
          losersCount,
        ]
      );

      const settlementId = settlementResult.rows[0].id;

      // 5. Create individual user settlement records
      for (const userSettlement of userSettlements) {
        await this.databaseService.query(
          `INSERT INTO user_settlements 
           (settlement_id, user_id, market_id, position_side, contracts_settled, 
            entry_price_yes_pts, is_winner, payout_gbp, profit_loss_gbp)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            settlementId,
            userSettlement.userId,
            userSettlement.marketId,
            userSettlement.positionSide,
            userSettlement.contractsSettled,
            userSettlement.entryPriceYesPts,
            userSettlement.isWinner,
            userSettlement.payoutGbp,
            userSettlement.profitLossGbp,
          ]
        );
      }

      // 6. Close all position lots (set remaining quantity to 0)
      await this.databaseService.query(
        `UPDATE position_lots
         SET qty_remaining_micros = 0,
             updated_at = NOW()
         WHERE market_id = $1 AND qty_remaining_micros > 0`,
        [body.marketId]
      );

      // 7. Clear positions table (set net quantity to 0)
      await this.databaseService.query(
        `UPDATE positions
         SET net_qty_micros = 0,
             updated_at = NOW()
         WHERE market_id = $1 AND net_qty_micros <> 0`,
        [body.marketId]
      );

      this.logger.info(`Market ${body.marketId} settlement complete`);

      // 8. Broadcast orderbook update to clear frontend
      this.natsClient.publish(NATS_SUBJECTS.MARKET_BOOK_UPDATED, {
        marketId: body.marketId,
        timestamp: Date.now(),
      });
      this.logger.info(`Broadcasted orderbook clear for market ${body.marketId}`);

      return {
        success: true,
        message: `Market ${body.marketId} resolved - Winner: ${body.winningOutcome}`,
        positionsSettled: positionLots.length,
        ordersCancelled: cancelledOrdersCount,
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
        const isBuyYesSide = lot.side === 'BUY_YES' || lot.side === 'FOR';

        // Calculate locked amount
        let lockedPence: bigint;
        if (isBuyYesSide) {
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

  /**
   * Bulk-create insurance contracts for a given category
   */
  @Post('insurance/bulk-create')
  async bulkCreateInsuranceContracts(
    @Body() body: {
      slug: string;
      count: number;
      startOffsetDays: number;
      spacingDays: number;
      customName?: string;
      conditionName?: string;
    },
    @Req() req: FastifyRequest & { session: any },
  ) {
    const userId = req.session?.userId;
    if (!userId) {
      throw new UnauthorizedException('Not authenticated');
    }

    await this.checkAdminAccess(userId);

    const { slug, count = 6, startOffsetDays = 30, spacingDays = 30, customName, conditionName } = body;
    if (!slug) {
      throw new Error('slug is required');
    }

    // Look up the insurance category
    const catResult = await this.databaseService.query<{
      slug: string; title: string; question_template: string; condition_name: string;
      settlement_source: string; oracle: string; base_yes_pts: number;
    }>(
      `SELECT slug, title, question_template, condition_name, settlement_source, oracle, base_yes_pts
       FROM insurance_categories WHERE slug = $1 AND active = true`,
      [slug],
    );

    if (catResult.rows.length === 0) {
      throw new Error(`Insurance category '${slug}' not found or inactive`);
    }

    const cat = catResult.rows[0];
    const created: string[] = [];

    // Elegant contract series names per category
    const CONTRACT_SERIES: Record<string, string> = {
      life:        'Mortality Risk Index',
      health:      'Critical Illness Tracker',
      climate:     'Climate Risk Benchmark',
      agriculture: 'Harvest Yield Contract',
      liability:   'Liability Exposure Index',
      travel:      'Travel Disruption Cover',
    };

    for (let i = 0; i < count; i++) {
      const maturity = new Date();
      maturity.setDate(maturity.getDate() + startOffsetDays + i * spacingDays);
      const maturityStr = maturity.toISOString();
      const dateLabel = maturity.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
      const shortDate  = maturity.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });

      const seriesName = CONTRACT_SERIES[slug] ?? cat.title;
      const seriesIndex = String(i + 1).padStart(2, '0');
      let name: string;
      let question: string;
      if (customName?.trim()) {
        const resolved = customName.trim().replace(/\{date\}/gi, dateLabel);
        name = `${resolved} [#${seriesIndex}]`;
        question = resolved;
      } else {
        name = `${seriesName} · ${shortDate} [#${seriesIndex}]`;
        question = cat.question_template.replace(/\{date\}/g, dateLabel);
      }

      const result = await this.databaseService.query<{ id: string }>(
        `INSERT INTO markets (
           name, description, type, status, event_id, outcomes,
           start_time, end_time, min_stake, max_stake,
           market_category, insurance_category, condition_name, question,
           maturity_date, settlement_source, oracle, base_yes_pts, sort_order
         ) VALUES (
           $1, $2, 'BINARY', 'ACTIVE', uuid_generate_v4(), '{YES,NO}',
           NOW(), $3::timestamptz, 1.00, 1000.00,
           'INSURANCE', $4, $5, $6,
           $3::timestamptz, $7, $8, $9, $10
         ) RETURNING id`,
        [
          name,
          question,
          maturityStr,
          slug,
          conditionName?.trim() || cat.condition_name,
          question,
          cat.settlement_source,
          cat.oracle,
          cat.base_yes_pts,
          i + 1,
        ],
      );

      created.push(result.rows[0].id);
    }

    this.logger.info(`Admin ${userId} created ${created.length} insurance contracts for category '${slug}'`);

    return {
      success: true,
      message: `Created ${created.length} insurance contracts for '${cat.title}'`,
      marketIds: created,
    };
  }

  /**
   * Delete insurance contracts by category and optional condition name
   */
  @Post('insurance/delete-group')
  async deleteInsuranceContracts(
    @Body() body: { slug: string; conditionName?: string },
    @Req() req: FastifyRequest & { session: any },
  ) {
    const userId = req.session?.userId;
    if (!userId) throw new UnauthorizedException('Not authenticated');
    await this.checkAdminAccess(userId);

    const { slug, conditionName } = body;
    if (!slug) throw new Error('slug is required');

    let result: { rows: { count: string }[] };
    if (conditionName?.trim()) {
      result = await this.databaseService.query<{ count: string }>(
        `WITH deleted AS (
           DELETE FROM markets
           WHERE market_category = 'INSURANCE'
             AND insurance_category = $1
             AND condition_name = $2
             AND status IN ('ACTIVE', 'PENDING')
           RETURNING id
         ) SELECT COUNT(*)::text AS count FROM deleted`,
        [slug, conditionName.trim()],
      );
    } else {
      result = await this.databaseService.query<{ count: string }>(
        `WITH deleted AS (
           DELETE FROM markets
           WHERE market_category = 'INSURANCE'
             AND insurance_category = $1
             AND status IN ('ACTIVE', 'PENDING')
           RETURNING id
         ) SELECT COUNT(*)::text AS count FROM deleted`,
        [slug],
      );
    }

    const deleted = Number(result.rows[0]?.count ?? 0);
    this.logger.info(`Admin ${userId} deleted ${deleted} insurance contracts for '${slug}'${conditionName ? ` / '${conditionName}'` : ''}`);
    return { success: true, deleted, message: `Deleted ${deleted} insurance contract${deleted !== 1 ? 's' : ''}` };
  }
}
