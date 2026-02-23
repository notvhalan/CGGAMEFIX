import { Controller, Post, Delete, Param, Body, HttpCode, HttpStatus, Req, UnauthorizedException, Get, Query } from '@nestjs/common';
import { Logger } from '@betting-exchange/shared-config';
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
      const showHistory = includeHistory === 'true';

      const orders = await this.rustExchange.getUserOrders({
        userId,
        marketId,
        includeHistory: showHistory,
        limit: orderLimit,
      });

      return { orders };
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
      let pPtsIsYes = false; // true when pPts is already in YES space (BUY_YES/SELL_YES)
      let timeInForce: 'GTC' | 'IOC' = orderData.timeInForce || 'GTC';
      
      // Default slippage for IOC market orders: 5% (500,000 probability points)
      const DEFAULT_MARKET_SLIPPAGE_PTS = 500_000; // 5%
      const maxSlippagePts = orderData.maxSlippagePts;
      const MIN_ALLOWED_PPTS = 1000; // 0.01%
      const MAX_ALLOWED_PPTS = 9999000; // 99.99%
      
      // Check for direct BUY_YES/SELL_YES format FIRST (most specific)
      if (orderData.side === 'BUY_YES' || orderData.side === 'SELL_YES') {
        // Direct BUY_YES/SELL_YES format from new frontend
        side = orderData.side === 'BUY_YES' ? 'FOR' : 'LAY';
        pPts = orderData.pPts!;
        // Use liabilityPence if provided, otherwise fall back to stakePence (backward compat)
        liabilityPence = orderData.liabilityPence ?? orderData.stakePence!;
        timeInForce = orderData.timeInForce || 'GTC';
        pPtsIsYes = true;

        if (pPts === undefined) {
          throw new Error('pPts is required for BUY_YES/SELL_YES orders');
        }
        if (pPts < MIN_ALLOWED_PPTS || pPts > MAX_ALLOWED_PPTS) {
          throw new Error(`Invalid probability: ${(pPts / 100000).toFixed(4)}%. Must be between 0.01% and 99.99%`);
        }
        if (!liabilityPence || liabilityPence <= 0) {
          throw new Error('liabilityPence must be positive');
        }
      } else if (orderData.pPts !== undefined && (orderData.liabilityPence !== undefined || orderData.stakePence !== undefined)) {
        // New format - use liabilityPence for both sides (stakePence is backward compat)
        pPts = orderData.pPts;
        
        // Reject orders at extreme probabilities (< 0.01% or > 99.99%)
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
          // LAY market order: pPts may be NO space (legacy) or YES space (BUY_YES/SELL_YES input)
          // Convert to YES space if needed, then allow worse price via slippage (lower YES price)
          const baseYesPts = pPtsIsYes ? pPts : PRICE_SCALE - pPts;
          yesPts = Math.max(baseYesPts - slippagePts, 1);
          contractsMicros = liabilityToContracts(liabilityPence, yesPts);
          this.logger.info(`Market order LAY: baseYesPts=${baseYesPts} - slippage=${slippagePts} => yesPts=${yesPts}`);
        }
      } else {
        // GTC limit orders: use exact price specified
        if (side === 'FOR') {
          // FOR: user backs YES at pPts -> they buy YES at pPts
          // yesPts = pPts (the probability they entered)
          yesPts = pPts;
          contractsMicros = stakeToContracts(liabilityPence, yesPts);
        } else {
          // LAY: pPts may be NO space (legacy) or YES space (BUY_YES/SELL_YES input)
          // If legacy NO space: yesPts = PRICE_SCALE - pPts
          // If YES space: yesPts = pPts
          yesPts = pPtsIsYes ? pPts : PRICE_SCALE - pPts;
          contractsMicros = liabilityToContracts(liabilityPence, yesPts);
        }
      }
      
      // Validate minimum contract size to prevent dust orders
      if (contractsMicros < MIN_CONTRACT_MICROS) {
        const minContracts = Number(MIN_CONTRACT_MICROS) / Number(CONTRACT_SCALE);
        throw new Error(`Order size too small. Minimum: ${minContracts} contracts. Increase your stake/liability to at least £${Math.ceil(liabilityPence * minContracts / 100) / 100}.`);
      }
      
      // NOTE: Balance locking now handled by Rust exchange, skip TypeScript database
      
      // Submit order to Rust exchange instead of NATS
      let rustResponse;
      try {
        // Convert FOR/LAY to BUY_YES/SELL_YES for Rust exchange
        const rustSide = side === 'FOR' ? 'BUY_YES' : 'SELL_YES';
        
        rustResponse = await this.rustExchange.submitOrder({
          marketId: orderData.marketId,
          userId,
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

      const rustResponse = await this.rustExchange.cancelOrder({ orderId, userId });
      this.logger.info('Order cancellation requested via Rust exchange', {
        orderId: rustResponse.order_id,
        userId,
        status: rustResponse.status,
      });

      // Keep Socket.IO clients loosely in sync while Rust processes cancellation.
      setImmediate(() => {
        this.orderBookBroadcast.broadcastOrderBookUpdate(rustResponse.market_id);
      });

      return {
        orderId: rustResponse.order_id,
        status: rustResponse.status,
        message: rustResponse.status === 'PENDING_CANCEL'
          ? 'Order cancellation requested'
          : 'Order cancellation processed',
      };
    } catch (error) {
      this.logger.error('Failed to cancel order', error);
      throw error;
    }
  }
}
