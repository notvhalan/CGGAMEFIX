import { Controller, Get, Post, Body, HttpCode, HttpStatus, Req, Query, UnauthorizedException } from '@nestjs/common';
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
      const wallet = await this.databaseService.ensureWallet(userId, 'GBP');
      
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

  @Get('history')
  async getWalletHistory(
    @Req() req: FastifyRequest & { session: any },
    @Query('range') range: string = '1W',
  ) {
    try {
      const userId = req.session?.userId;
      if (!userId) {
        throw new UnauthorizedException('User not authenticated');
      }

      this.logger.info(`Fetching wallet history for user: ${userId}, range: ${range}`);

      // Time window for the requested range
      let sinceSql: string;
      switch (range) {
        case '1D':  sinceSql = `NOW() - INTERVAL '1 day'`;   break;
        case '1M':  sinceSql = `NOW() - INTERVAL '1 month'`; break;
        case 'ALL': sinceSql = `'1970-01-01'::timestamptz`;  break;
        case '1W':
        default:    sinceSql = `NOW() - INTERVAL '7 days'`;  break;
      }

      // Fetch all individual entries in the range (no bucketing — every balance change is a chart point)
      // Also fetch locked_balance from the wallet at query time for the reserved series.
      // MAX 2000 points; if a range has more we downsample with time buckets sized to ~500 pts.
      const RAW_LIMIT = 2000;

      const rawQuery = `
        SELECT l.entry_type,
               l.credit::float    AS credit,
               l.debit::float     AS debit,
               l.balance::float   AS balance,
               w.locked_balance::float AS locked,
               l.created_at
        FROM ledger_entries l
        JOIN wallets w ON w.id = l.wallet_id
        WHERE l.user_id = $1
          AND w.currency = 'GBP'
          AND l.created_at >= ${sinceSql}
        ORDER BY l.created_at ASC
        LIMIT ${RAW_LIMIT}`;

      let [rawResult, countResult] = await Promise.all([
        this.databaseService.query(rawQuery, [userId]),
        this.databaseService.query(
          `SELECT COUNT(*) AS total FROM ledger_entries l
           JOIN wallets w ON w.id = l.wallet_id
           WHERE l.user_id = $1 AND w.currency = 'GBP' AND l.created_at >= ${sinceSql}`,
          [userId]
        ),
      ]);

      const totalInRange = parseInt(countResult.rows[0]?.total ?? '0', 10);

      // If fewer than 2 points in range, fall back to ALL history
      if (rawResult.rows.length < 2) {
        this.logger.info(`Only ${rawResult.rows.length} point(s) in range '${range}', falling back to ALL history`);
        rawResult = await this.databaseService.query(
          `SELECT l.entry_type,
                  l.credit::float    AS credit,
                  l.debit::float     AS debit,
                  l.balance::float   AS balance,
                  w.locked_balance::float AS locked,
                  l.created_at
           FROM ledger_entries l
           JOIN wallets w ON w.id = l.wallet_id
           WHERE l.user_id = $1
             AND w.currency = 'GBP'
           ORDER BY l.created_at ASC
           LIMIT ${RAW_LIMIT}`,
          [userId]
        );
      }

      this.logger.info(`Returning ${rawResult.rows.length} history points for user ${userId} (total in range: ${totalInRange})`);

      const history = rawResult.rows.map((row: any) => ({
        timestamp: row.created_at,
        balance:   parseFloat(row.balance),
        available: parseFloat(row.balance) - parseFloat(row.locked || '0'),
        reserved:  parseFloat(row.locked  || '0'),
      }));

      // Events are the same rows (already have entry_type, credit, debit)
      const events = rawResult.rows.map((row: any) => ({
        timestamp:  row.created_at,
        entryType:  row.entry_type,
        credit:     parseFloat(row.credit),
        debit:      parseFloat(row.debit),
        balance:    parseFloat(row.balance),
      }));

      return { history, events };
    } catch (error) {
      this.logger.error('Failed to fetch wallet history', error);
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
      const wallet = await this.databaseService.ensureWallet(userId, depositData.currency);
      
      // Update balance in database (this is test money, not real)
      const updatedWallet = await this.databaseService.updateWalletBalance(
        userId, 
        depositData.amount, 
        depositData.currency
      );
      
      // Create ledger entry for the deposit
      await this.databaseService.query(
        `INSERT INTO ledger_entries 
          (user_id, wallet_id, entry_type, credit, debit, balance, description, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [
          userId,
          wallet.id,
          'DEPOSIT',
          depositData.amount,
          0,
          updatedWallet.balance,
          `Test funds deposit of ${depositData.currency} ${depositData.amount.toFixed(2)}`
        ]
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
