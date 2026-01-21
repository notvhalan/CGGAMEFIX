import { Controller, Post, Delete, Param, Body, HttpCode, HttpStatus, Req, UnauthorizedException, Get, Query } from '@nestjs/common';
import { Logger } from '@betting-exchange/shared-config';
import { NatsClient } from '../nats/nats.client';
import { NATS_SUBJECTS } from '../nats/subjects';
import { CreateOrderDtoSchema } from '../dto';
import { v4 as uuidv4 } from 'uuid';
import { ZodError } from 'zod';
import { FastifyRequest } from 'fastify';
import { DatabaseService } from '../database/database.service';

@Controller('v1/orders')
export class OrdersController {
  private readonly logger = new Logger('OrdersController');

  constructor(
    private readonly natsClient: NatsClient,
    private readonly databaseService: DatabaseService,
  ) {}

  @Get()
  async getOrders(
    @Req() req: FastifyRequest & { session: any },
    @Query('limit') limit?: string,
  ) {
    try {
      // Extract userId from session
      const userId = req.session?.userId;
      if (!userId) {
        throw new UnauthorizedException('User not authenticated');
      }

      const orderLimit = limit ? parseInt(limit) : 50;
      const orders = await this.databaseService.getOrdersByUserId(userId, orderLimit);
      
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
      
      // Store order in database
      const order = await this.databaseService.createOrder({
        id: orderId,
        userId,
        marketId: orderData.marketId,
        outcomeId: orderData.outcomeId,
        side: orderData.side,
        odds: orderData.odds,
        stake: orderData.stake,
      });
      
      // Publish order submission command to NATS for matching engine
      const command = {
        orderId,
        userId,
        ...orderData,
        timestamp: new Date().toISOString(),
      };
      
      this.logger.info('Order created and published', { orderId, userId });
      this.natsClient.publish(NATS_SUBJECTS.ORDERS_SUBMIT, command);
      
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
      
      // Publish order cancellation command to NATS
      const command = {
        orderId,
        userId,
        timestamp: new Date().toISOString(),
      };
      
      this.logger.info('Order cancelled', { orderId, userId });
      this.natsClient.publish(NATS_SUBJECTS.ORDERS_CANCEL, command);
      
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
