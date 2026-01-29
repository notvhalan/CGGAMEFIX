import { Controller, Post, Body, Req, UnauthorizedException } from '@nestjs/common';
import { Logger } from '@betting-exchange/shared-config';
import { FastifyRequest } from 'fastify';
import { LiquidityBotsService } from '../services/liquidity-bots.service';

@Controller('v1/admin')
export class AdminController {
  private readonly logger = new Logger('AdminController');

  constructor(
    private readonly liquidityBotsService: LiquidityBotsService,
  ) {}

  @Post('liquidity-bots/start')
  async startLiquidityBots(
    @Body() body: {
      marketId: string;
      userCount: number;
      midYesPts: number;
      halfSpreadPts: number;
      levels: number;
      sizeContracts: number;
      refreshMs: number;
      takerChance: number;
    },
    @Req() req: FastifyRequest & { session: any },
  ) {
    const userId = req.session?.userId;
    if (!userId) {
      throw new UnauthorizedException('Not authenticated');
    }

    // Simple admin check - you can make this more robust
    // For now, just log who started it
    this.logger.info(`User ${userId} starting liquidity bots`, body);

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

    this.logger.info(`User ${userId} stopping liquidity bots`);

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
}
