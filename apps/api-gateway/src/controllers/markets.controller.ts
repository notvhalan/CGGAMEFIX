import { Controller, Get, Param, Query } from '@nestjs/common';
import { Logger } from '@betting-exchange/shared-config';
import { DatabaseService } from '../database/database.service';

@Controller('v1/markets')
export class MarketsController {
  private readonly logger = new Logger('MarketsController');

  constructor(private readonly databaseService: DatabaseService) {}

  @Get()
  async listMarkets() {
    try {
      // TODO: Fetch from database or cache
      this.logger.debug('Fetching all markets');
      return { markets: [] };
    } catch (error) {
      this.logger.error('Failed to fetch markets', error);
      throw error;
    }
  }

  @Get(':marketId')
  async getMarket(@Param('marketId') marketId: string) {
    try {
      this.logger.debug(`Fetching market ${marketId}`);
      // TODO: Fetch from database
      return { 
        marketId, 
        status: 'ACTIVE',
        name: 'Mock Market',
      };
    } catch (error) {
      this.logger.error(`Failed to fetch market ${marketId}`, error);
      throw error;
    }
  }

  @Get(':marketId/book')
  async getOrderBook(@Param('marketId') marketId: string) {
    try {
      this.logger.debug(`Fetching orderbook for market ${marketId}`);
      
      // Fetch orders from database
      const orders = await this.databaseService.getOrdersByMarketId(marketId);
      
      // Separate into bids (BACK) and asks (LAY)
      const backOrders = orders.filter(o => o.side === 'BACK');
      const layOrders = orders.filter(o => o.side === 'LAY');
      
      // Group by odds and sum remaining amounts
      const groupByOdds = (orders: typeof backOrders) => {
        const grouped = new Map<number, number>();
        orders.forEach(order => {
          const odds = parseFloat(order.odds.toString());
          const amount = parseFloat(order.remainingAmount.toString());
          grouped.set(odds, (grouped.get(odds) || 0) + amount);
        });
        return Array.from(grouped.entries()).map(([odds, amount]) => ({ odds, amount }));
      };
      
      const bids = groupByOdds(backOrders).sort((a, b) => b.odds - a.odds); // Highest first
      const asks = groupByOdds(layOrders).sort((a, b) => a.odds - b.odds); // Lowest first
      
      return {
        marketId,
        bids,
        asks,
        lastUpdate: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`Failed to fetch orderbook for ${marketId}`, error);
      throw error;
    }
  }

  @Get(':marketId/trades')
  async getMarketTrades(
    @Param('marketId') marketId: string,
    @Query('limit') limit: string = '50'
  ) {
    try {
      const limitNum = parseInt(limit, 10) || 50;
      this.logger.debug(`Fetching trades for market ${marketId}, limit: ${limitNum}`);
      
      // TODO: Fetch from database
      return {
        marketId,
        trades: [],
        count: 0,
      };
    } catch (error) {
      this.logger.error(`Failed to fetch trades for ${marketId}`, error);
      throw error;
    }
  }
}
