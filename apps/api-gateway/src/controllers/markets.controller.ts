import { Controller, Get, Param, Query } from '@nestjs/common';
import { Logger } from '@betting-exchange/shared-config';
import { DatabaseService } from '../database/database.service';

@Controller('v1/markets')
export class MarketsController {
  private readonly logger = new Logger('MarketsController');

  constructor(
    private readonly databaseService: DatabaseService,
  ) {}

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
      
      // Separate into bids (FOR) and asks (LAY)
      const forOrders = orders.filter(o => o.side === 'FOR');
      const layOrders = orders.filter(o => o.side === 'LAY');
      
      // Group by YES probability points and sum remaining contracts
      const groupByYesPts = (orders: typeof forOrders) => {
        const grouped = new Map<number, bigint>();
        orders.forEach(order => {
          const yesPts = order.yesPts;
          const remainingContracts = BigInt(order.remainingContracts || 0);
          grouped.set(yesPts, (grouped.get(yesPts) || 0n) + remainingContracts);
        });
        return Array.from(grouped.entries()).map(([yesPts, contractsMicros]) => ({ 
          yesPts, 
          contractsMicros: contractsMicros.toString() 
        }));
      };
      
      const bids = groupByYesPts(forOrders).sort((a, b) => b.yesPts - a.yesPts); // Highest first
      const asks = groupByYesPts(layOrders).sort((a, b) => a.yesPts - b.yesPts); // Lowest first
      
      const orderBookData = {
        marketId,
        bids,
        asks,
        lastUpdate: new Date().toISOString(),
      };
      
      return orderBookData;
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
      
      const trades = await this.databaseService.getTradesByMarketId(marketId, limitNum);
      
      return {
        marketId,
        trades,
        count: trades.length,
      };
    } catch (error) {
      this.logger.error(`Failed to fetch trades for ${marketId}`, error);
      throw error;
    }
  }
}
