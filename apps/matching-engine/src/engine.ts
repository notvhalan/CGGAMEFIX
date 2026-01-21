import { NatsConnection } from 'nats';
import { MatchingEngineEnv, Logger } from '@betting-exchange/shared-config';
import { NATS_SUBJECTS, EventType } from '@betting-exchange/shared-types';
import { Orderbook } from './orderbook';

export class MatchingEngine {
  private orderbooks: Map<string, Orderbook> = new Map();
  
  constructor(
    private nats: NatsConnection,
    private env: MatchingEngineEnv,
    private logger: Logger
  ) {}
  
  async initialize() {
    // TODO: Load active markets from database
    // For now, we'll create orderbooks on-demand
    this.logger.info('Matching Engine initialized');
  }
  
  async handleOrderSubmit(command: any) {
    const { orderId, userId, marketId, side, price, stake } = command;
    
    this.logger.info('Processing order submission', { orderId, marketId });
    
    try {
      // Get or create orderbook for market
      let orderbook = this.orderbooks.get(marketId);
      if (!orderbook) {
        orderbook = new Orderbook(marketId, this.logger);
        this.orderbooks.set(marketId, orderbook);
      }
      
      // Validate order (basic checks)
      if (price <= 0 || stake <= 0) {
        await this.publishOrderRejected(orderId, userId, marketId, 'Invalid price or stake');
        return;
      }
      
      // TODO: Check user balance with wallet-service
      
      // Add order to orderbook
      const order = {
        orderId,
        userId,
        side,
        price,
        size: stake,
        timestamp: new Date(),
      };
      
      // Attempt matching
      const matches = orderbook.addOrder(order);
      
      // Publish order accepted event
      await this.publishOrderAccepted(orderId, userId, marketId, side, price, stake);
      
      // Publish trade events for matches
      for (const match of matches) {
        await this.publishTradeExecuted(match, marketId);
      }
      
      // Publish orderbook delta
      await this.publishBookDelta(marketId, side, price, stake);
      
      this.logger.info('Order processed successfully', { orderId, matches: matches.length });
      
    } catch (error) {
      this.logger.error('Failed to process order', error, { orderId });
      await this.publishOrderRejected(orderId, userId, marketId, 'Processing failed');
    }
  }
  
  async handleOrderCancel(command: any) {
    const { orderId, userId, marketId } = command;
    
    this.logger.info('Processing order cancellation', { orderId, marketId });
    
    try {
      const orderbook = this.orderbooks.get(marketId);
      if (!orderbook) {
        this.logger.warn('Orderbook not found', { marketId });
        return;
      }
      
      const cancelled = orderbook.cancelOrder(orderId);
      
      if (cancelled) {
        await this.publishOrderCancelled(orderId, userId, marketId, cancelled.remainingSize);
        await this.publishBookDelta(marketId, cancelled.side, cancelled.price, -cancelled.remainingSize);
      }
      
    } catch (error) {
      this.logger.error('Failed to cancel order', error, { orderId });
    }
  }
  
  private async publishOrderAccepted(
    orderId: string,
    userId: string,
    marketId: string,
    side: string,
    price: number,
    size: number
  ) {
    const event = {
      eventId: this.generateEventId(),
      eventType: EventType.ORDER_ACCEPTED,
      timestamp: new Date(),
      marketId,
      orderId,
      userId,
      side,
      price,
      size,
    };
    this.nats.publish(NATS_SUBJECTS.EVENTS_ORDER_ACCEPTED, JSON.stringify(event));
  }
  
  private async publishOrderRejected(orderId: string, userId: string, marketId: string, reason: string) {
    const event = {
      eventId: this.generateEventId(),
      eventType: EventType.ORDER_REJECTED,
      timestamp: new Date(),
      marketId,
      orderId,
      userId,
      reason,
    };
    this.nats.publish(NATS_SUBJECTS.EVENTS_ORDER_REJECTED, JSON.stringify(event));
  }
  
  private async publishOrderCancelled(orderId: string, userId: string, marketId: string, remainingSize: number) {
    const event = {
      eventId: this.generateEventId(),
      eventType: EventType.ORDER_CANCELLED,
      timestamp: new Date(),
      marketId,
      orderId,
      userId,
      remainingSize,
    };
    this.nats.publish(NATS_SUBJECTS.EVENTS_ORDER_CANCELLED, JSON.stringify(event));
  }
  
  private async publishTradeExecuted(match: any, marketId: string) {
    const event = {
      eventId: this.generateEventId(),
      eventType: EventType.TRADE_EXECUTED,
      timestamp: new Date(),
      marketId,
      tradeId: this.generateEventId(),
      ...match,
      makerFee: 0, // TODO: Calculate fees
      takerFee: 0,
    };
    this.nats.publish(NATS_SUBJECTS.EVENTS_TRADE_EXECUTED, JSON.stringify(event));
  }
  
  private async publishBookDelta(marketId: string, side: string, price: number, sizeDelta: number) {
    const event = {
      eventId: this.generateEventId(),
      eventType: EventType.BOOK_DELTA,
      timestamp: new Date(),
      marketId,
      side,
      price,
      sizeDelta,
    };
    this.nats.publish(NATS_SUBJECTS.EVENTS_BOOK_DELTA, JSON.stringify(event));
  }
  
  private generateEventId(): string {
    return `evt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
