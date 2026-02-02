import { Controller, Post, Body, Req, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { Logger } from '@betting-exchange/shared-config';
import { FastifyRequest } from 'fastify';
import { LiquidityBotsService } from '../services/liquidity-bots.service';
import { DatabaseService } from '../database/database.service';

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
}
