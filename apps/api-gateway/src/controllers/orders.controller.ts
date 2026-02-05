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
import { RustExchangeService } from '../services/rust-exchange.service';
import { PRICE_SCALE, stakeToContracts, liabilityToContracts, MIN_CONTRACT_MICROS, CONTRACT_SCALE } from '@betting-exchange/shared-types';

@Controller('v1/orders')
export class OrdersController {
  private readonly logger = new Logger('OrdersController');

  constructor(
    private readonly natsClient: NatsClient,
    private readonly databaseService: DatabaseService,
    private readonly orderBookBroadcast: OrderBookBroadcastService,
    private readonly rustExchange: RustExchangeService,
  ) {}

  @Get('trades')
  async getMyTrades(
    @Req() req: FastifyRequest & { session: any },
    @Query('limit') limit?: string,
  ) {
    try {
      const userId = req.session?.userId;
      if (!userId) {
        throw new UnauthorizedException('User not authenticated');
      }

      const tradeLimit = limit ? parseInt(limit) : 100;
      const trades = await this.databaseService.getTradesByUserId(userId, tradeLimit);
      
      return { trades };
    } catch (error) {
      this.logger.error('Failed to fetch user trades', error);
      throw error;
    }
  }

  @Get()
  async getOrders(
    @Req() req: FastifyRequest & { session: any },
    @Query('limit') limit?: string,
    @Query('marketId') marketId?: string,
    @Query('includeHistory') includeHistory?: string,
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
      let filteredOrders = marketId 
        ? orders.filter(order => order.marketId === marketId)
        : orders;
      
      // Filter by status based on includeHistory parameter
      const showHistory = includeHistory === 'true';
      if (!showHistory) {
        // Only return OPEN and PARTIALLY_MATCHED orders (exclude CANCELLED, MATCHED, EXPIRED, REJECTED)
        filteredOrders = filteredOrders.filter(order => 
          order.status === 'OPEN' || order.status === 'PARTIALLY_MATCHED'
        );
      }
      // else: return all orders including history
      
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

      // Validate with Zod
      const orderData = CreateOrderDtoSchema.parse(body);
      
      const orderId = uuidv4();
      
      // Convert old format to new format if needed
      let pPts: number;
      let liabilityPence: number;
      let side: 'FOR' | 'LAY';
      let timeInForce: 'GTC' | 'IOC' = orderData.timeInForce || 'GTC';
      
      // Default slippage for IOC market orders: 5% (500,000 probability points)
      const DEFAULT_MARKET_SLIPPAGE_PTS = 500_000; // 5%
      const maxSlippagePts = orderData.maxSlippagePts;
      
      // Check for direct BUY_YES/SELL_YES format FIRST (most specific)
      if (orderData.side === 'BUY_YES' || orderData.side === 'SELL_YES') {
        // Direct BUY_YES/SELL_YES format from new frontend
        side = orderData.side === 'BUY_YES' ? 'FOR' : 'LAY';
        pPts = orderData.pPts;
        liabilityPence = orderData.liabilityPence;
        timeInForce = orderData.timeInForce || 'GTC';
      } else if (orderData.pPts !== undefined && (orderData.liabilityPence !== undefined || orderData.stakePence !== undefined)) {
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
      
      // Apply slippage protection for IOC market orders
      if (timeInForce === 'IOC') {
        const slippagePts = maxSlippagePts || DEFAULT_MARKET_SLIPPAGE_PTS;
        
        if (side === 'FOR') {
          // FOR market order: willing to buy YES up to (pPts + slippage)
          // Example: market buy at 50% with 5% slippage = willing to pay up to 55%
          yesPts = Math.min(pPts + slippagePts, PRICE_SCALE - 1);
          contractsMicros = stakeToContracts(liabilityPence, yesPts);
          this.logger.info(`Market order FOR: pPts=${pPts} + slippage=${slippagePts} => yesPts=${yesPts}`);
        } else {
          // LAY market order: willing to sell YES down to (pPts - slippage) in NO space
          // In YES space: PRICE_SCALE - pPts, but allow lower prices (higher YES probabilities)
          // Example: market sell NO at 50% (YES 50%) with 5% slippage = willing to sell YES up to 55%
          const basYesPts = PRICE_SCALE - pPts;
          yesPts = Math.max(basYesPts - slippagePts, 1); // Allow selling at higher YES prob (lower NO prob)
          contractsMicros = liabilityToContracts(liabilityPence, yesPts);
          this.logger.info(`Market order LAY: NO pPts=${pPts} => YES base=${basYesPts} - slippage=${slippagePts} => yesPts=${yesPts}`);
        }
      } else {
        // GTC limit orders: use exact price specified
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
      }
      
      // Validate minimum contract size to prevent dust orders
      if (contractsMicros < MIN_CONTRACT_MICROS) {
        const minContracts = Number(MIN_CONTRACT_MICROS) / Number(CONTRACT_SCALE);
        throw new Error(`Order size too small. Minimum: ${minContracts} contracts. Increase your stake/liability to at least £${Math.ceil(liabilityPence * minContracts / 100) / 100}.`);
      }
      
      // Lock balance before creating order (same amount for both sides - their max loss)
      const requiredBalancePence = liabilityPence;
      
      // NOTE: Balance locking now handled by Rust exchange, skip TypeScript database
      
      // Submit order directly to Rust exchange (skipping database.createOrder)
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
      
      // Submit order to Rust exchange instead of NATS
      let rustResponse;
      try {
        // Convert FOR/LAY to BUY_YES/SELL_YES for Rust exchange
        const rustSide = side === 'FOR' ? 'BUY_YES' : 'SELL_YES';
        
        rustResponse = await this.rustExchange.submitOrder({
          marketId: orderData.marketId,
          side: rustSide,
          riskPence: liabilityPence,
          limitYesPts: yesPts,
          timeInForce,
        });
        
        this.logger.info('Order submitted to Rust exchange', { 
          orderId: rustResponse.order_id,
          userId, 
          side: rustSide, 
          yesPts,
          liabilityPence,
          contracts: rustResponse.contracts_micros,
        });
      } catch (error) {
        // Release the locked balance if Rust exchange fails
        this.logger.error('Rust exchange failed, unlocking balance', { orderId, userId, error: error.message });
        // Note: We need to implement proper balance unlocking
        // For now, the Rust exchange handles its own balance management
        throw error;
      }
      
      // Broadcast order book update in real-time
      setImmediate(() => {
        this.orderBookBroadcast.broadcastOrderBookUpdate(orderData.marketId);
      });
      
      // Return response from Rust exchange
      return {
        orderId: rustResponse.order_id,
        status: rustResponse.status,
        contracts_micros: rustResponse.contracts_micros,
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
      
      // Get the order BEFORE cancelling to calculate locked funds
      const orders = await this.databaseService.getOrdersByUserId(userId, 1000);
      const orderToCancel = orders.find(o => o.id === orderId);
      
      if (!orderToCancel) {
        throw new Error('Order not found');
      }
      
      // Only unlock if order is still active (OPEN or PARTIALLY_MATCHED)
      if (orderToCancel.status === 'OPEN' || orderToCancel.status === 'PARTIALLY_MATCHED') {
        // Calculate locked amount based on remaining liability
        const remainingContracts = BigInt(orderToCancel.remainingContracts || '0');
        const originalContracts = BigInt(orderToCancel.originalContracts || '0');
        
        if (remainingContracts > 0n && originalContracts > 0n) {
          // Proportional liability based on remaining vs original contracts
          const lockedPence = Math.floor(
            (orderToCancel.liabilityPence * Number(remainingContracts)) / Number(originalContracts)
          );
          
          if (lockedPence > 0) {
            // Try to unlock the balance - don't fail if insufficient (could be old data or wrong currency)
            try {
              await this.databaseService.unlockBalance(userId, lockedPence);
              this.logger.info('Balance unlocked for cancelled order', { 
                orderId, 
                userId, 
                lockedPence, 
                remainingContracts: remainingContracts.toString(),
                originalContracts: originalContracts.toString(),
                totalLiability: orderToCancel.liabilityPence
              });
            } catch (unlockError) {
              // Log warning but don't fail the cancellation - wallet might have old data or wrong currency
              this.logger.warn('Failed to unlock balance for cancelled order - continuing with cancellation', { 
                orderId, 
                userId, 
                lockedPence,
                error: unlockError.message
              });
            }
          }
        }
      }
      
      // Update order status in database
      await this.databaseService.updateOrderStatus(orderId, 'CANCELLED');
      
      // Publish order cancellation command to NATS
      const command = {
        orderId,
        userId,
        timestamp: new Date().toISOString(),
      };
      
      this.logger.info('Order cancelled', { orderId, userId });
      this.natsClient.publish(NATS_SUBJECTS.ORDERS_CANCEL, command);
      
      // Broadcast order book update
      setImmediate(() => {
        this.orderBookBroadcast.broadcastOrderBookUpdate(orderToCancel.marketId);
      });
      
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
