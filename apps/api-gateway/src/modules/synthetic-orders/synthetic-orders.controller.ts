// ============================================================
// Synthetic Orders — Controller
// ============================================================
// Handles interval order quoting and execution.
// An interval order is decomposed into two child limit orders
// on adjacent maturity contracts.
// ============================================================

import { Controller, Post, Body, Param, Req, HttpException, HttpStatus } from '@nestjs/common';
import { SyntheticOrdersService } from './synthetic-orders.service';

@Controller('v1/ladder')
export class SyntheticOrdersController {
  constructor(private readonly syntheticOrders: SyntheticOrdersService) {}

  /**
   * POST /v1/ladder/:groupSlug/interval-orders
   *
   * Body: {
   *   startMaturity: string | null,  // ISO timestamp or null for first bucket
   *   endMaturity: string,           // ISO timestamp
   *   direction: 'BUY' | 'SELL',
   *   contracts: number,             // whole contracts
   *   executionMode: 'quote_only' | 'submit'
   * }
   */
  @Post(':groupSlug/interval-orders')
  async createIntervalOrder(
    @Param('groupSlug') groupSlug: string,
    @Body() body: any,
    @Req() req: any,
  ) {
    const userId = req.session?.userId || req.headers?.['x-user-id'] || req.user?.id;
    if (!userId) {
      throw new HttpException('Authentication required', HttpStatus.UNAUTHORIZED);
    }

    const { startMaturity, endMaturity, startMarketId, endMarketId, direction, contracts, executionMode } = body;

    if (!endMaturity || !direction || !contracts) {
      throw new HttpException(
        'Missing required fields: endMaturity, direction, contracts',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!['BUY', 'SELL'].includes(direction)) {
      throw new HttpException('direction must be BUY or SELL', HttpStatus.BAD_REQUEST);
    }

    if (contracts <= 0 || contracts > 10_000) {
      throw new HttpException('contracts must be between 1 and 10,000', HttpStatus.BAD_REQUEST);
    }

    if (!['quote_only', 'submit'].includes(executionMode || 'quote_only')) {
      throw new HttpException('executionMode must be quote_only or submit', HttpStatus.BAD_REQUEST);
    }

    const mode = executionMode || 'quote_only';

    if (mode === 'quote_only') {
      return this.syntheticOrders.quoteIntervalOrder({
        groupSlug,
        userId,
        startMaturity: startMaturity || null,
        endMaturity,
        startMarketId: startMarketId || null,
        endMarketId: endMarketId || null,
        direction,
        contracts,
      });
    }

    return this.syntheticOrders.executeIntervalOrder({
      groupSlug,
      userId,
      startMaturity: startMaturity || null,
      endMaturity,
      startMarketId: startMarketId || null,
      endMarketId: endMarketId || null,
      direction,
      contracts,
    });
  }

  /**
   * POST /v1/ladder/:groupSlug/hazard-orders
   *
   * A hazard order is quoted as conditional probability over an interval:
   * (q_end - q_start) / (1 - q_start). Execution uses the interval spread
   * legs scaled by survival at the interval start.
   */
  @Post(':groupSlug/hazard-orders')
  async createHazardOrder(
    @Param('groupSlug') groupSlug: string,
    @Body() body: any,
    @Req() req: any,
  ) {
    const userId = req.session?.userId || req.headers?.['x-user-id'] || req.user?.id;
    if (!userId) {
      throw new HttpException('Authentication required', HttpStatus.UNAUTHORIZED);
    }

    const { startMaturity, endMaturity, startMarketId, endMarketId, direction, contracts, executionMode } = body;

    if (!endMaturity || !direction || !contracts) {
      throw new HttpException(
        'Missing required fields: endMaturity, direction, contracts',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!['BUY', 'SELL'].includes(direction)) {
      throw new HttpException('direction must be BUY or SELL', HttpStatus.BAD_REQUEST);
    }

    if (contracts <= 0 || contracts > 10_000) {
      throw new HttpException('contracts must be between 1 and 10,000', HttpStatus.BAD_REQUEST);
    }

    if (!['quote_only', 'submit'].includes(executionMode || 'quote_only')) {
      throw new HttpException('executionMode must be quote_only or submit', HttpStatus.BAD_REQUEST);
    }

    const mode = executionMode || 'quote_only';

    if (mode === 'quote_only') {
      return this.syntheticOrders.quoteHazardOrder({
        groupSlug,
        userId,
        startMaturity: startMaturity || null,
        endMaturity,
        startMarketId: startMarketId || null,
        endMarketId: endMarketId || null,
        direction,
        contracts,
      });
    }

    return this.syntheticOrders.executeHazardOrder({
      groupSlug,
      userId,
      startMaturity: startMaturity || null,
      endMaturity,
      startMarketId: startMarketId || null,
      endMarketId: endMarketId || null,
      direction,
      contracts,
    });
  }
}


