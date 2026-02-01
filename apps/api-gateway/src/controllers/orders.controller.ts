import { Controller, Post, Delete, Param, Body, HttpCode, HttpStatus, Req, UnauthorizedException, Get, Query } from '@nestjs/common';
import { Logger } from '@betting-exchange/shared-config';
import { NatsClient } from '../nats/nats.client';
import { NATS_SUBJECTS } from '../nats/subjects';
import { CreateOrderDtoSchema } from '../dto';
import { v4 as uuidv4 } from 'uuid';
import { ZodError } from 'zod';
import { FastifyRequest } from 'fastify';
import { DatabaseService } from '../database/database.service';
import { OrderBookBroadcastService } from '../services/orderbook-broadcast.service';
import { PRICE_SCALE, stakeToContracts, liabilityToContracts, MIN_CONTRACT_MICROS, CONTRACT_SCALE } from '@betting-exchange/shared-types';

@Controller('v1/orders')
export class OrdersController {
  private readonly logger = new Logger('OrdersController');

  constructor(
    private readonly natsClient: NatsClient,
    private readonly databaseService: DatabaseService,
    private readonly orderBookBroadcast: OrderBookBroadcastService,
  ) {}

  @Get()
  async getOrders(
    @Req() req: FastifyRequest & { session: any },
    @Query('limit') limit?: string,
    @Query('marketId') marketId?: string,
  ) {
    try {
      // Extract userId from session
      const userId = req.session?.userId;
      if (!userId) {
        throw new UnauthorizedException('User not authenticated');
      }

      const orderLimit = limit ? parseInt(limit) : 50;
      const orders = await this.databaseService.getOrdersByUserId(userId, orderLimit);
      
      // Filter by marketId if provided
      const filteredOrders = marketId 
        ? orders.filter(order => order.marketId === marketId)
        : orders;
      
      return { orders: filteredOrders };
    } catch (error) {
      this.logger.error('Failed to fetch orders', error);
      throw error;
    }
  }

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  async createOrder(
    @Body() body: any,
    @Req() req: FastifyRequest & { session: any },
  ) {
    try {
      // Extract userId from session
      const userId = req.session?.userId;
      if (!userId) {
        throw new UnauthorizedException('User not authenticated');
      }

      // Debug: log incoming request body
      this.logger.info('Received order request body:', { body });
      
      // Validate with Zod
      const orderData = CreateOrderDtoSchema.parse(body);
      
      this.logger.info('Validated order data:', { orderData });
      
      const orderId = uuidv4();
      
      // Convert old format to new format if needed
      let pPts: number;
      let liabilityPence: number;
      let side: 'FOR' | 'LAY';
      let timeInForce: 'GTC' | 'IOC' = orderData.timeInForce || 'GTC';
      
      if (orderData.pPts !== undefined && (orderData.liabilityPence !== undefined || orderData.stakePence !== undefined)) {
        // New format - use liabilityPence for both sides (stakePence is backward compat)
        pPts = orderData.pPts;
        
        // Reject orders at extreme probabilities (< 0.01% or > 99.99%)
        const MIN_ALLOWED_PPTS = 1000; // 0.01%
        const MAX_ALLOWED_PPTS = 9999000; // 99.99%
        
        if (pPts < MIN_ALLOWED_PPTS || pPts > MAX_ALLOWED_PPTS) {
          throw new Error(`Invalid probability: ${(pPts / 100000).toFixed(4)}%. Must be between 0.01% and 99.99%`);
        }
        
        side = orderData.side as 'FOR' | 'LAY';
        
        // Use liabilityPence if provided, otherwise fall back to stakePence (for backward compat)
        liabilityPence = orderData.liabilityPence ?? orderData.stakePence!;
        
        if (!liabilityPence || liabilityPence <= 0) {
          throw new Error('liabilityPence must be positive');
        }
      } else if (orderData.odds !== undefined && orderData.stake !== undefined) {
        // Old format - convert to new format
        // Convert odds to probability: p = 1/odds
        // Then to probability points: pPts = p * 10_000_000
        const probability = 1 / orderData.odds;
        pPts = Math.round(probability * PRICE_SCALE);
        // Clamp to valid range
        pPts = Math.max(1, Math.min(PRICE_SCALE - 1, pPts));
        
        // Convert stake from pounds to pence
        liabilityPence = Math.round(orderData.stake * 100);
        
        // Convert BACK/LAY to FOR/LAY
        // BACK = buying YES = FOR
        // LAY = selling YES = LAY
        side = orderData.side === 'BACK' ? 'FOR' : 'LAY';
      } else {
        throw new Error('Invalid order format');
      }
      
      // Compute canonical YES price and contracts
      // Both FOR and LAY use liabilityPence as max loss
      let yesPts: number;
      let contractsMicros: bigint;
      
      if (side === 'FOR') {
        // FOR: user backs YES at pPts -> they buy YES at pPts
        // yesPts = pPts (the probability they entered)
        yesPts = pPts;
        contractsMicros = stakeToContracts(liabilityPence, yesPts);
      } else {
        // LAY: user backs NO at pPts -> they sell YES at (1 - pPts)
        // If they back NO at 67%, they're selling YES at 33%
        // yesPts = PRICE_SCALE - pPts (convert NO probability to YES space)
        yesPts = PRICE_SCALE - pPts;
        contractsMicros = liabilityToContracts(liabilityPence, yesPts);
      }
      
      // Validate minimum contract size to prevent dust orders
      if (contractsMicros < MIN_CONTRACT_MICROS) {
        const minContracts = Number(MIN_CONTRACT_MICROS) / Number(CONTRACT_SCALE);
        throw new Error(`Order size too small. Minimum: ${minContracts} contracts. Increase your stake/liability to at least £${Math.ceil(liabilityPence * minContracts / 100) / 100}.`);
      }
      
      // Lock balance before creating order (same amount for both sides - their max loss)
      const requiredBalancePence = liabilityPence;
      
      try {
        await this.databaseService.lockBalance(userId, requiredBalancePence);
        this.logger.info('Balance locked for order', { userId, orderId, requiredBalancePence });
      } catch (error) {
        this.logger.warn('Failed to lock balance', { userId, requiredBalancePence, error: error.message });
        throw new Error('Insufficient balance to place order');
      }
      
      // Store order in database with new format
      const order = await this.databaseService.createOrder({
        id: orderId,
        userId,
        marketId: orderData.marketId,
        outcomeId: orderData.outcomeId,
        side,
        pPts,
        yesPts,
        liabilityPence,
        originalContractsMicros: contractsMicros.toString(),
        remainingContractsMicros: contractsMicros.toString(),
        timeInForce,
      });
      
      // Publish order submission command to NATS for matching engine
      const command = {
        orderId,
        userId,
        marketId: orderData.marketId,
        outcomeId: orderData.outcomeId,
        side,
        pPts,
        yesPts,
        liabilityPence,
        originalContractsMicros: contractsMicros.toString(),
        remainingContractsMicros: contractsMicros.toString(),
        timeInForce,
        timestamp: new Date().toISOString(),
      };
      
      this.logger.info('Order created and published', { 
        orderId, 
        userId, 
        side, 
        pPts, 
        yesPts,
        liabilityPence,
        contracts: contractsMicros.toString(),
      });
      this.natsClient.publish(NATS_SUBJECTS.ORDERS_SUBMIT, command);
      
      // Broadcast order book update in real-time
      setImmediate(() => {
        this.orderBookBroadcast.broadcastOrderBookUpdate(orderData.marketId);
      });
      
      // Return immediately (async processing)
      return {
        orderId,
        status: 'OPEN',
        message: 'Order created successfully',
      };
    } catch (error) {
      if (error instanceof ZodError) {
        this.logger.warn('Invalid order request', error.errors);
        throw error;
      }
      this.logger.error('Failed to submit order', error);
      throw error;
    }
  }

  @Delete(':orderId')
  @HttpCode(HttpStatus.ACCEPTED)
  async cancelOrder(
    @Param('orderId') orderId: string,
    @Req() req: FastifyRequest & { session: any },
  ) {
    try {
      // Extract userId from session
      const userId = req.session?.userId;
      if (!userId) {
        throw new UnauthorizedException('User not authenticated');
      }
      
      // Update order status in database
      await this.databaseService.updateOrderStatus(orderId, 'CANCELLED');
      
      // Get the order to find its marketId for broadcasting
      const orders = await this.databaseService.getOrdersByUserId(userId, 1000);
      const cancelledOrder = orders.find(o => o.id === orderId);
      
      // Publish order cancellation command to NATS
      const command = {
        orderId,
        userId,
        timestamp: new Date().toISOString(),
      };
      
      this.logger.info('Order cancelled', { orderId, userId });
      this.natsClient.publish(NATS_SUBJECTS.ORDERS_CANCEL, command);
      
      // Broadcast order book update if we found the market
      if (cancelledOrder) {
        setImmediate(() => {
          this.orderBookBroadcast.broadcastOrderBookUpdate(cancelledOrder.marketId);
        });
      }
      
      return {
        orderId,
        status: 'CANCELLED',
        message: 'Order cancelled successfully',
      };
    } catch (error) {
      this.logger.error('Failed to cancel order', error);
      throw error;
    }
  }
}
