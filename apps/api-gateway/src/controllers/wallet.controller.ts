import { Controller, Get, Post, Body, HttpCode, HttpStatus, Req, UnauthorizedException } from '@nestjs/common';
import { Logger } from '@betting-exchange/shared-config';
import { NatsClient } from '../nats/nats.client';
import { NATS_SUBJECTS } from '../nats/subjects';
import { DepositDtoSchema, WithdrawDtoSchema } from '../dto';
import { ZodError } from 'zod';
import { FastifyRequest } from 'fastify';
import { DatabaseService } from '../database/database.service';

@Controller('v1/wallet')
export class WalletController {
  private readonly logger = new Logger('WalletController');

  constructor(
    private readonly natsClient: NatsClient,
    private readonly databaseService: DatabaseService,
  ) {}

  @Get()
  async getWallet(@Req() req: FastifyRequest & { session: any }) {
    try {
      // Extract userId from session
      const userId = req.session?.userId;
      if (!userId) {
        throw new UnauthorizedException('User not authenticated');
      }
      
      this.logger.debug(`Fetching wallet for user ${userId}`);
      
      // Get or create wallet from database
      const wallet = await this.databaseService.ensureWallet(userId, 'USD');
      
      return {
        userId: wallet.userId,
        balance: parseFloat(wallet.balance.toString()),
        currency: wallet.currency,
        lockedBalance: parseFloat(wallet.lockedBalance.toString()),
      };
    } catch (error) {
      this.logger.error('Failed to fetch wallet', error);
      throw error;
    }
  }

  @Post('deposit')
  @HttpCode(HttpStatus.OK)
  async deposit(
    @Body() body: any,
    @Req() req: FastifyRequest & { session: any },
  ) {
    try {
      // Extract userId from session
      const userId = req.session?.userId;
      if (!userId) {
        throw new UnauthorizedException('User not authenticated');
      }

      const depositData = DepositDtoSchema.parse(body);
      
      // Ensure wallet exists
      await this.databaseService.ensureWallet(userId, depositData.currency);
      
      // Update balance in database (this is test money, not real)
      const updatedWallet = await this.databaseService.updateWalletBalance(
        userId, 
        depositData.amount, 
        depositData.currency
      );
      
      this.logger.info('Deposit processed', { 
        userId, 
        amount: depositData.amount,
        newBalance: updatedWallet.balance 
      });
      
      return {
        status: 'SUCCESS',
        message: 'Deposit processed successfully',
        amount: depositData.amount,
        balance: parseFloat(updatedWallet.balance.toString()),
      };
    } catch (error) {
      if (error instanceof ZodError) {
        this.logger.warn('Invalid deposit request', error.errors);
        throw error;
      }
      this.logger.error('Failed to process deposit', error);
      throw error;
    }
  }

  @Post('withdraw')
  @HttpCode(HttpStatus.ACCEPTED)
  async withdraw(
    @Body() body: any,
    @Req() req: FastifyRequest & { session: any },
  ) {
    try {
      // Extract userId from session
      const userId = req.session?.userId;
      if (!userId) {
        throw new UnauthorizedException('User not authenticated');
      }

      const withdrawData = WithdrawDtoSchema.parse(body);
      
      const command = {
        userId,
        ...withdrawData,
        timestamp: new Date().toISOString(),
      };
      
      this.logger.info('Publishing withdraw command', { userId, amount: withdrawData.amount });
      this.natsClient.publish(NATS_SUBJECTS.WALLET_WITHDRAW, command);
      
      return {
        status: 'PENDING',
        message: 'Withdrawal request submitted',
        amount: withdrawData.amount,
      };
    } catch (error) {
      if (error instanceof ZodError) {
        this.logger.warn('Invalid withdraw request', error.errors);
        throw error;
      }
      this.logger.error('Failed to process withdrawal', error);
      throw error;
    }
  }
}
