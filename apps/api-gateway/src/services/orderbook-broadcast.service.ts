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
      const forOrders = orders.filter(o => o.side === 'FOR');
      const layOrders = orders.filter(o => o.side === 'LAY');
      
      // Group by probability points and sum remaining amounts in pence
      const groupByPPts = (ordersList: typeof forOrders) => {
        const grouped = new Map<number, number>();
        ordersList.forEach(order => {
          const pPts = order.pPts;
          const remainingPence = order.remainingPence;
          grouped.set(pPts, (grouped.get(pPts) || 0) + remainingPence);
        });
        return Array.from(grouped.entries()).map(([pPts, sizePence]) => ({ pPts, sizePence }));
      };
      
      const bids = groupByPPts(forOrders).sort((a, b) => b.pPts - a.pPts); // Highest first
      const asks = groupByPPts(layOrders).sort((a, b) => a.pPts - b.pPts); // Lowest first
      
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
