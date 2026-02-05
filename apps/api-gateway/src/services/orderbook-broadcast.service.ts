import { Injectable } from '@nestjs/common';
import { Logger } from '@betting-exchange/shared-config';
import { DatabaseService } from '../database/database.service';
import { EventsGateway } from '../gateways/events.gateway';
import { NatsClient } from '../nats/nats.client';
import { NATS_SUBJECTS } from '../nats/subjects';

@Injectable()
export class OrderBookBroadcastService {
  private readonly logger = new Logger('OrderBookBroadcastService');

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly eventsGateway: EventsGateway,
    private readonly natsClient: NatsClient,
  ) {}

  async broadcastOrderBookUpdate(marketId: string) {
    try {
      // Fetch orders from database
      const orders = await this.databaseService.getOrdersByMarketId(marketId);
      
      // Separate into bids (FOR) and asks (LAY)
      const forOrders = orders.filter(o => o.side === 'BUY_YES');
      const layOrders = orders.filter(o => o.side === 'SELL_YES');
      
      // Group by yesPts and sum remaining contracts
      const groupByYesPts = (ordersList: typeof forOrders) => {
        const grouped = new Map<number, bigint>();
        ordersList.forEach(order => {
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
      
      const orderBook = {
        marketId,
        bids,
        asks,
        lastUpdate: new Date().toISOString(),
      };
      
      // Broadcast via WebSocket
      this.eventsGateway.server.to(`book:${marketId}`).emit('book_update', orderBook);
      
      // Publish to NATS for other services
      this.natsClient.publish(NATS_SUBJECTS.MARKET_BOOK_UPDATED, {
        marketId,
        ...orderBook,
      });
      
      this.logger.debug(`Order book update broadcasted for market ${marketId}`);
    } catch (error) {
      this.logger.error(`Failed to broadcast order book update for ${marketId}`, error);
    }
  }
}
