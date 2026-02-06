import { Controller, Get, Param, Query, Req, UnauthorizedException } from '@nestjs/common';
import { Logger } from '@betting-exchange/shared-config';
import { FastifyRequest } from 'fastify';
import { DatabaseService } from '../database/database.service';

@Controller('v1/settlements')
export class SettlementsController {
  private readonly logger = new Logger('SettlementsController');

  constructor(private readonly databaseService: DatabaseService) {}

  /**
   * Get user's settlement history
   */
  @Get('user/history')
  async getUserSettlementHistory(
    @Query('limit') limit: string,
    @Query('offset') offset: string,
    @Req() req: FastifyRequest & { session: any },
  ) {
    const userId = req.session?.userId;
    if (!userId) {
      throw new UnauthorizedException('Not authenticated');
    }

    const limitNum = parseInt(limit) || 20;
    const offsetNum = parseInt(offset) || 0;

    try {
      const result = await this.databaseService.query(
        `SELECT 
          us.id,
          us.settlement_id,
          us.market_id,
          m.name as market_name,
          us.position_side,
          us.contracts_settled,
          us.entry_price_yes_pts,
          us.is_winner,
          us.payout_gbp,
          us.profit_loss_gbp,
          ms.winning_outcome,
          ms.settled_at,
          us.created_at
        FROM user_settlements us
        JOIN market_settlements ms ON us.settlement_id = ms.id
        JOIN markets m ON us.market_id = m.id
        WHERE us.user_id = $1
        ORDER BY ms.settled_at DESC
        LIMIT $2 OFFSET $3`,
        [userId, limitNum, offsetNum]
      );

      const countResult = await this.databaseService.query(
        `SELECT COUNT(*) as total FROM user_settlements WHERE user_id = $1`,
        [userId]
      );

      return {
        settlements: result.rows,
        total: parseInt(countResult.rows[0].total),
        limit: limitNum,
        offset: offsetNum,
      };
    } catch (error) {
      this.logger.error('Failed to fetch user settlement history', error);
      throw error;
    }
  }

  /**
   * Get settlement details for a specific market (admin or participants)
   */
  @Get('market/:marketId')
  async getMarketSettlement(
    @Param('marketId') marketId: string,
    @Req() req: FastifyRequest & { session: any },
  ) {
    const userId = req.session?.userId;
    if (!userId) {
      throw new UnauthorizedException('Not authenticated');
    }

    try {
      // Get market settlement summary
      const settlementResult = await this.databaseService.query(
        `SELECT 
          ms.*,
          m.name as market_name,
          m.description as market_description,
          u.email as resolved_by_email,
          u.name as resolved_by_name
        FROM market_settlements ms
        JOIN markets m ON ms.market_id = m.id
        JOIN users u ON ms.resolved_by_user_id = u.id
        WHERE ms.market_id = $1`,
        [marketId]
      );

      if (settlementResult.rows.length === 0) {
        return {
          found: false,
          message: 'No settlement found for this market',
        };
      }

      const settlement = settlementResult.rows[0];

      // Get top winners and losers
      const participantsResult = await this.databaseService.query(
        `SELECT 
          us.user_id,
          u.email,
          u.name,
          us.position_side,
          us.contracts_settled,
          us.entry_price_yes_pts,
          us.is_winner,
          us.payout_gbp,
          us.profit_loss_gbp
        FROM user_settlements us
        JOIN users u ON us.user_id = u.id
        WHERE us.settlement_id = $1
        ORDER BY us.profit_loss_gbp DESC
        LIMIT 50`,
        [settlement.id]
      );

      return {
        found: true,
        settlement,
        participants: participantsResult.rows,
      };
    } catch (error) {
      this.logger.error('Failed to fetch market settlement', error);
      throw error;
    }
  }

  /**
   * Get all market settlements (admin view)
   */
  @Get('all')
  async getAllSettlements(
    @Query('limit') limit: string,
    @Query('offset') offset: string,
    @Req() req: FastifyRequest & { session: any },
  ) {
    const userId = req.session?.userId;
    if (!userId) {
      throw new UnauthorizedException('Not authenticated');
    }

    const limitNum = parseInt(limit) || 20;
    const offsetNum = parseInt(offset) || 0;

    try {
      const result = await this.databaseService.query(
        `SELECT 
          ms.*,
          m.name as market_name,
          u.email as resolved_by_email
        FROM market_settlements ms
        JOIN markets m ON ms.market_id = m.id
        JOIN users u ON ms.resolved_by_user_id = u.id
        ORDER BY ms.settled_at DESC
        LIMIT $1 OFFSET $2`,
        [limitNum, offsetNum]
      );

      const countResult = await this.databaseService.query(
        `SELECT COUNT(*) as total FROM market_settlements`
      );

      return {
        settlements: result.rows,
        total: parseInt(countResult.rows[0].total),
        limit: limitNum,
        offset: offsetNum,
      };
    } catch (error) {
      this.logger.error('Failed to fetch all settlements', error);
      throw error;
    }
  }
}
