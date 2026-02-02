import { connect, NatsConnection, StringCodec } from 'nats';
import { Logger } from '@betting-exchange/shared-config';
import { 
  NATS_SUBJECTS, 
  EventType, 
  OrderSide, 
  PRICE_SCALE, 
  calculateTakerFee, 
  TimeInForce,
} from '@betting-exchange/shared-types';
import { DatabaseService } from './db/pg';
import { Orderbook, OrderbookOrder, Match } from './orderbook';
import { v4 as uuidv4 } from 'uuid';

const logger = new Logger('MatchingEngine');
const sc = StringCodec();

interface OrderCommand {
  orderId: string;
  userId: string;
  marketId: string;
  side: OrderSide; // FOR or LAY
  pPts: number; // Original probability points
  yesPts: number; // Canonical YES price
  stakePence?: number; // FOR orders only
  liabilityPence?: number; // LAY orders only
  originalContractsMicros: string; // bigint as string
  remainingContractsMicros: string; // bigint as string
  timeInForce?: TimeInForce; // GTC or IOC
  timestamp?: string;
}

interface CancelCommand {
  orderId: string;
  userId: string;
  timestamp?: string;
}

export class MatchingEngine {
  private nc!: NatsConnection;
  private db: DatabaseService;
  private orderbooks: Map<string, Orderbook> = new Map();
  private isShuttingDown = false;

  constructor(
    private natsUrl: string,
    databaseUrl: string
  ) {
    this.db = new DatabaseService(databaseUrl);
  }

  async start(): Promise<void> {
    try {
      // Connect to database
      await this.db.connect();
      logger.info('Connected to database');

      // Connect to NATS
      this.nc = await connect({ servers: this.natsUrl });
      logger.info(`Connected to NATS at ${this.natsUrl}`);

      // Subscribe to order commands
      this.subscribeToOrderSubmit();
      this.subscribeToOrderCancel();

      logger.info('Matching engine started successfully');

      // Handle graceful shutdown
      this.setupShutdownHandlers();
    } catch (error) {
      logger.error('Failed to start matching engine', error);
      throw error;
    }
  }

  private subscribeToOrderSubmit(): void {
    const sub = this.nc.subscribe(NATS_SUBJECTS.ORDERS_SUBMIT);
    
    (async () => {
      logger.info(`Subscribed to ${NATS_SUBJECTS.ORDERS_SUBMIT}`);
      
      for await (const msg of sub) {
        let orderData: OrderCommand | null = null;
        try {
          const data = JSON.parse(sc.decode(msg.data)) as OrderCommand;
          orderData = data;
          logger.info(`Received order submit: ${data.orderId}`);
          
          await this.handleOrderSubmit(data);
          
        } catch (error) {
          logger.error('Error processing order submit', error);
          
          // Mark order as REJECTED and publish cancellation to unlock balance
          if (orderData) {
            try {
              await this.db.updateOrderStatus(orderData.orderId, 'REJECTED', 0n);
              await this.publishOrderCancelled(
                orderData.orderId, 
                orderData.userId, 
                orderData.marketId, 
                orderData.originalContractsMicros
              );
              logger.info(`Order ${orderData.orderId} marked as REJECTED and balance unlock event published`);
            } catch (unlockError) {
              logger.error(`Failed to unlock balance for rejected order ${orderData.orderId}`, unlockError);
            }
          }
        }
      }
    })();
  }

  private subscribeToOrderCancel(): void {
    const sub = this.nc.subscribe(NATS_SUBJECTS.ORDERS_CANCEL);
    
    (async () => {
      logger.info(`Subscribed to ${NATS_SUBJECTS.ORDERS_CANCEL}`);
      
      for await (const msg of sub) {
        try {
          const data = JSON.parse(sc.decode(msg.data)) as CancelCommand;
          logger.info(`Received order cancel: ${data.orderId}`);
          
          await this.handleOrderCancel(data);
          
        } catch (error) {
          logger.error('Error processing order cancel', error);
        }
      }
    })();
  }

  private async handleOrderSubmit(command: OrderCommand): Promise<void> {
    const { orderId, userId, marketId, side, pPts, yesPts, remainingContractsMicros } = command;

    try {
      // Validate probability points
      if (pPts < 1 || pPts >= PRICE_SCALE) {
        logger.warn(`Order ${orderId} has invalid pPts: ${pPts}`);
        await this.publishOrderRejected(orderId, userId, marketId, `Invalid pPts: must be between 1 and ${PRICE_SCALE - 1}`);
        return;
      }

      // Load order from database to verify it exists
      const dbOrder = await this.db.getOrderById(orderId);
      
      if (!dbOrder) {
        logger.warn(`Order ${orderId} not found in database`);
        await this.publishOrderRejected(orderId, userId, marketId, 'Order not found in database');
        return;
      }

      // Verify order status is OPEN or PENDING
      if (dbOrder.status !== 'OPEN' && dbOrder.status !== 'PENDING') {
        logger.warn(`Order ${orderId} has invalid status: ${dbOrder.status}`);
        await this.publishOrderRejected(orderId, userId, marketId, `Invalid order status: ${dbOrder.status}`);
        return;
      }

      // Get or create orderbook for this market
      let orderbook = this.orderbooks.get(marketId);
      if (!orderbook) {
        orderbook = new Orderbook(marketId);
        this.orderbooks.set(marketId, orderbook);
        
        // Rebuild orderbook from database (excluding current order)
        await this.rebuildOrderbook(marketId, orderbook, orderId);
      }

      // Create orderbook order
      const orderbookOrder: OrderbookOrder = {
        id: orderId,
        userId,
        side,
        pPts,
        yesPts,
        remainingContractsMicros: BigInt(remainingContractsMicros),
        timestamp: dbOrder.created_at,
      };

      logger.info(`Processing order ${orderId}: ${side} pPts=${pPts} yesPts=${yesPts} contracts=${remainingContractsMicros} timeInForce=${command.timeInForce || 'GTC'}`);

      // Add order to orderbook and get matches
      const matches = orderbook.addOrder(orderbookOrder);

      // Process each match
      for (const match of matches) {
        await this.processMatch(marketId, match);
      }

      // Check if IOC order - cancel any unfilled remainder
      const finalRemainingContracts = orderbookOrder.remainingContractsMicros;
      const isIOC = command.timeInForce === TimeInForce.IOC;
      
      if (isIOC && finalRemainingContracts > 0n) {
        // IOC order with unfilled remainder - cancel it
        logger.info(`IOC order ${orderId} has ${finalRemainingContracts} contracts unfilled - cancelling remainder`);
        
        // Remove from orderbook
        orderbook.cancelOrder(orderId);
        
        // Update status to CANCELLED or PARTIALLY_MATCHED based on whether anything matched
        const matched = finalRemainingContracts < BigInt(remainingContractsMicros);
        const finalStatus = matched ? 'PARTIALLY_MATCHED' : 'CANCELLED';
        
        await this.db.updateOrderStatus(orderId, finalStatus, 0n); // remaining set to 0
        
        // Publish cancel event
        await this.publishOrderCancelled(orderId, userId, marketId, finalRemainingContracts.toString());
        
        // Publish book delta
        await this.publishBookDelta(marketId, orderbook);
        
        logger.info(`IOC order ${orderId} final status: ${finalStatus}`);
        return;
      }

      // Update order status in database (non-IOC orders)
      let finalStatus: string;
      
      if (finalRemainingContracts === 0n) {
        finalStatus = 'MATCHED';
      } else if (finalRemainingContracts < BigInt(remainingContractsMicros)) {
        finalStatus = 'PARTIALLY_MATCHED';
      } else {
        finalStatus = 'OPEN';
      }

      await this.db.updateOrderStatus(orderId, finalStatus, finalRemainingContracts);

      // Publish ORDER_ACCEPTED event
      await this.publishOrderAccepted(orderId, userId, marketId, side, yesPts, remainingContractsMicros);

      // Publish BOOK_DELTA event
      await this.publishBookDelta(marketId, orderbook);

      logger.info(`Order ${orderId} processed: ${matches.length} matches, status: ${finalStatus}`);
      
    } catch (error) {
      logger.error(`Failed to handle order submit ${orderId}`, error);
      await this.publishOrderRejected(orderId, userId, marketId, 'Internal processing error');
      
      // Mark order as rejected in DB
      try {
        await this.db.updateOrderStatus(orderId, 'REJECTED', 0n);
      } catch (dbError) {
        logger.error(`Failed to update order ${orderId} to REJECTED`, dbError);
      }
    }
  }

  private async handleOrderCancel(command: CancelCommand): Promise<void> {
    const { orderId, userId } = command;

    try {
      // Load order from database
      const dbOrder = await this.db.getOrderById(orderId);
      
      if (!dbOrder) {
        logger.warn(`Order ${orderId} not found for cancellation`);
        return;
      }

      const marketId = dbOrder.market_id;

      // Remove from orderbook if present
      const orderbook = this.orderbooks.get(marketId);
      if (orderbook) {
        const removed = orderbook.cancelOrder(orderId);
        logger.debug(`Order ${orderId} removed from orderbook: ${removed}`);
      }

      // Update order status in database
      await this.db.updateOrderStatus(orderId, 'CANCELLED');

      // Publish ORDER_CANCELLED event
      await this.publishOrderCancelled(orderId, userId, marketId, dbOrder.remaining_contracts || '0');

      // Publish BOOK_DELTA event if orderbook exists
      if (orderbook) {
        await this.publishBookDelta(marketId, orderbook);
      }

      logger.info(`Order ${orderId} cancelled successfully`);
      
    } catch (error) {
      logger.error(`Failed to handle order cancel ${orderId}`, error);
    }
  }

  private async processMatch(marketId: string, match: Match): Promise<void> {
    const { makerOrder, takerOrder, yesPricePts, contractsMicros, costPence } = match;

    try {
      // Skip processing if no contracts to trade
      if (contractsMicros === 0n) {
        logger.debug(`Skipping match with 0 contracts between ${takerOrder.id} and ${makerOrder.id}`);
        return;
      }

      // Calculate fees (integer math)
      const takerFeePence = calculateTakerFee(costPence);
      const makerFeePence = 0; // Maker fees are 0

      logger.info(`Processing match: ${contractsMicros} contracts @ yesPts=${yesPricePts}, cost=${costPence}p, takerFee=${takerFeePence}p, makerSynthetic=${makerOrder.isSynthetic}, takerSynthetic=${takerOrder.isSynthetic}`);

      // Create trade in database
      const tradeId = await this.db.createTrade({
        marketId,
        priceYesPts: yesPricePts,
        qtyMicros: contractsMicros.toString(),
        notionalPence: costPence,
        takerOrderId: takerOrder.id,
        makerOrderId: makerOrder.id,
        takerUserId: takerOrder.userId,
        makerUserId: makerOrder.userId,
        side: takerOrder.side,
        takerFeePence,
        makerFeePence,
      });

      // Update maker order status in database (skip for synthetic LP fills)
      if (!makerOrder.isSynthetic) {
        const makerFinalStatus = makerOrder.remainingContractsMicros === 0n ? 'MATCHED' : 'PARTIALLY_MATCHED';
        logger.info(`Updating maker order ${makerOrder.id}: status=${makerFinalStatus}, remaining=${makerOrder.remainingContractsMicros}`);
        await this.db.updateOrderStatus(makerOrder.id, makerFinalStatus, makerOrder.remainingContractsMicros);
        logger.info(`Maker order ${makerOrder.id} updated successfully`);
      } else {
        logger.info(`Skipping DB update for synthetic maker order ${makerOrder.id}`);
      }

      // Publish TRADE_EXECUTED event
      await this.publishTradeExecuted(
        tradeId,
        marketId,
        makerOrder,
        takerOrder,
        yesPricePts,
        contractsMicros, // Include contracts for position tracking
        costPence,
        makerFeePence,
        takerFeePence
      );

      // Publish ORDER_MATCHED event for maker if fully filled
      if (makerOrder.remainingContractsMicros === 0n) {
        await this.publishOrderMatched(makerOrder.id, makerOrder.userId, marketId);
      }

      logger.info(`Trade ${tradeId} executed: ${contractsMicros} contracts @ yesPts=${yesPricePts}, cost=${costPence}p (taker fee: ${takerFeePence}p)`);
      
    } catch (error) {
      logger.error('Failed to process match', error);
      throw error;
    }
  }

  private async rebuildOrderbook(marketId: string, orderbook: Orderbook, excludeOrderId?: string): Promise<void> {
    try {
      logger.info(`Rebuilding orderbook for market ${marketId}`);
      
      const dbOrders = await this.db.getOpenOrdersForMarket(marketId);
      logger.info(`Found ${dbOrders.length} open orders in database`);
      
      for (const dbOrder of dbOrders) {
        // Skip the order being currently processed to prevent self-matching
        if (excludeOrderId && dbOrder.id === excludeOrderId) {
          logger.debug(`Skipping order ${dbOrder.id} (currently being processed)`);
          continue;
        }
        
        // Convert BACK/LAY to FOR/LAY for backward compatibility during migration
        const rawSide = dbOrder.side as string;
        let side: OrderSide;
        if (rawSide === 'FOR' || rawSide === 'BACK') {
          side = OrderSide.FOR;
        } else {
          side = OrderSide.LAY;
        }
        
        // Get pPts and yesPts from DB
        const pPts = dbOrder.p_pts || Math.floor(PRICE_SCALE / parseFloat(dbOrder.odds || '2.0'));
        
        // Correctly derive yesPts for both FOR and LAY
        let yesPts: number;
        if (dbOrder.yes_pts != null) {
          yesPts = dbOrder.yes_pts;
        } else {
          // Fallback: canonicalize based on side
          // FOR: yesPts = pPts (buying YES at pPts)
          // LAY: yesPts = PRICE_SCALE - pPts (selling YES, so invert NO price to YES price)
          yesPts = (side === OrderSide.FOR) ? pPts : (PRICE_SCALE - pPts);
        }
        
        const remainingContracts = BigInt(dbOrder.remaining_contracts || '0');
        logger.info(`Rebuilding order ${dbOrder.id.substring(0, 8)}: ${side} yesPts=${yesPts} remaining=${remainingContracts}`);
        
        const orderbookOrder: OrderbookOrder = {
          id: dbOrder.id,
          userId: dbOrder.user_id,
          side,
          pPts,
          yesPts,
          remainingContractsMicros: remainingContracts,
          timestamp: dbOrder.created_at,
        };
        
        // Add to orderbook without matching (already processed) - use skipMatching=true
        orderbook.addOrder(orderbookOrder, true);
      }
      
      logger.info(`Orderbook rebuilt for market ${marketId}: ${dbOrders.length} orders`);
    } catch (error) {
      logger.error(`Failed to rebuild orderbook for market ${marketId}`, error);
      throw error;
    }
  }

  // Event publishers
  private async publishOrderAccepted(
    orderId: string,
    userId: string,
    marketId: string,
    side: OrderSide,
    yesPts: number,
    contractsMicros: string
  ): Promise<void> {
    const event = {
      eventId: uuidv4(),
      eventType: EventType.ORDER_ACCEPTED,
      timestamp: new Date(),
      marketId,
      orderId,
      userId,
      side,
      yesPts,
      contractsMicros,
    };
    
    this.nc.publish(NATS_SUBJECTS.EVENTS_ORDER_ACCEPTED, sc.encode(JSON.stringify(event)));
  }

  private async publishOrderRejected(
    orderId: string,
    userId: string,
    marketId: string,
    reason: string
  ): Promise<void> {
    const event = {
      eventId: uuidv4(),
      eventType: EventType.ORDER_REJECTED,
      timestamp: new Date(),
      marketId,
      orderId,
      userId,
      reason,
    };
    
    this.nc.publish(NATS_SUBJECTS.EVENTS_ORDER_REJECTED, sc.encode(JSON.stringify(event)));
  }

  private async publishOrderCancelled(
    orderId: string,
    userId: string,
    marketId: string,
    remainingContractsMicros: string
  ): Promise<void> {
    const event = {
      eventId: uuidv4(),
      eventType: EventType.ORDER_CANCELLED,
      timestamp: new Date(),
      marketId,
      orderId,
      userId,
      remainingContractsMicros,
    };
    
    this.nc.publish(NATS_SUBJECTS.EVENTS_ORDER_CANCELLED, sc.encode(JSON.stringify(event)));
  }

  private async publishOrderMatched(
    orderId: string,
    userId: string,
    marketId: string
  ): Promise<void> {
    const event = {
      eventId: uuidv4(),
      eventType: EventType.ORDER_MATCHED,
      timestamp: new Date(),
      marketId,
      orderId,
      userId,
    };
    
    this.nc.publish(NATS_SUBJECTS.EVENTS_ORDER_MATCHED, sc.encode(JSON.stringify(event)));
  }

  private async publishTradeExecuted(
    tradeId: string,
    marketId: string,
    makerOrder: OrderbookOrder,
    takerOrder: OrderbookOrder,
    priceYesPts: number,
    qtyMicros: bigint,
    notionalPence: number,
    makerFeePence: number,
    takerFeePence: number
  ): Promise<void> {
    const event = {
      id: tradeId,
      eventId: uuidv4(),
      eventType: EventType.TRADE_EXECUTED,
      timestamp: new Date().toISOString(),
      executedAt: new Date().toISOString(),
      marketId,
      tradeId,
      makerOrderId: makerOrder.id,
      takerOrderId: takerOrder.id,
      makerUserId: makerOrder.userId,
      takerUserId: takerOrder.userId,
      priceYesPts,
      qtyMicros: qtyMicros.toString(), // Convert BigInt to string for JSON
      notionalPence,
      takerSide: takerOrder.side,
      makerFeePence,
      takerFeePence,
    };
    
    this.nc.publish(NATS_SUBJECTS.EVENTS_TRADE_EXECUTED, sc.encode(JSON.stringify(event)));
  }

  // REMOVED: handleCashoutQuote() and handleCashoutExecute()
  // Cashout is now implemented in API layer as normal IOC orders
  // No more multi-leg unwind, synthetic LP fills, or order cancellation in matching engine

  private async publishBookDelta(marketId: string, orderbook: Orderbook): Promise<void> {
    // Get current snapshot
    const snapshot = orderbook.snapshotTopLevels(20);
    
    // Convert BigInt to string for JSON serialization
    const event = {
      eventId: uuidv4(),
      eventType: EventType.BOOK_SNAPSHOT, // Using snapshot for simplicity
      timestamp: new Date(),
      marketId,
      bids: snapshot.bids.map(b => ({ yesPts: b.yesPts, contractsMicros: b.contractsMicros.toString() })),
      asks: snapshot.asks.map(a => ({ yesPts: a.yesPts, contractsMicros: a.contractsMicros.toString() })),
    };
    
    this.nc.publish(NATS_SUBJECTS.EVENTS_BOOK_DELTA, sc.encode(JSON.stringify(event)));
  }

  private setupShutdownHandlers(): void {
    const shutdown = async (signal: string) => {
      if (this.isShuttingDown) return;
      this.isShuttingDown = true;
      
      logger.info(`Received ${signal}, shutting down gracefully...`);
      
      try {
        await this.nc.drain();
        await this.db.close();
        logger.info('Shutdown complete');
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown', error);
        process.exit(1);
      }
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  }
}
