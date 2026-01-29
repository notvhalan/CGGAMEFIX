import { Controller, Post, Body, HttpCode, HttpStatus, Req, UnauthorizedException } from '@nestjs/common';
import { Logger } from '@betting-exchange/shared-config';
import { NatsClient } from '../nats/nats.client';
import { NATS_SUBJECTS, PRICE_SCALE, OrderSide, CONTRACT_SCALE, CONTRACT_PAYOUT_PENCE, TimeInForce } from '@betting-exchange/shared-types';
import { FastifyRequest } from 'fastify';
import { DatabaseService } from '../database/database.service';
import { v4 as uuidv4 } from 'uuid';

/**
 * CLOB-only Close Position Controller
 * 
 * Implements position closing as normal IOC orders (not multi-leg unwind).
 * All fills come from the orderbook - no synthetic LP fills.
 */
@Controller('v1/cashout')
export class CashoutController {
  private readonly logger = new Logger('CashoutController');

  constructor(
    private readonly natsClient: NatsClient,
    private readonly databaseService: DatabaseService,
  ) {}

  /**
   * Get CLOB-only close estimate by sweeping book levels
   * Returns how much can be filled immediately from book
   */
  @Post('quote')
  @HttpCode(HttpStatus.OK)
  async getCashoutQuote(
    @Body() body: { marketId: string; netContractsMicros: string },
    @Req() req: FastifyRequest & { session: any },
  ) {
    try {
      const userId = req.session?.userId;
      if (!userId) {
        throw new UnauthorizedException('User not authenticated');
      }

      const { marketId, netContractsMicros } = body;
      if (!marketId || !netContractsMicros) {
        throw new Error('marketId and netContractsMicros are required');
      }

      const netContracts = BigInt(netContractsMicros);
      const closeContractsMicros = netContracts < 0n ? -netContracts : netContracts;
      const closeSide = netContracts > 0n ? OrderSide.LAY : OrderSide.FOR;

      this.logger.info(`Close quote: market=${marketId}, contracts=${closeContractsMicros}, side=${closeSide}`);

      // Fetch orderbook levels (opposite side to our close order)
      const oppositeSide = closeSide === OrderSide.LAY ? OrderSide.FOR : OrderSide.LAY;
      // When closing LAY (short YES), we need FOR bids (buying YES) - best bid = highest price
      // When closing FOR (long YES), we need LAY asks (selling YES) - best ask = lowest price
      const sortDirection = oppositeSide === OrderSide.FOR ? 'DESC' : 'ASC';
      const bookResult = await this.databaseService.query(
        `SELECT limit_price_yes_pts as yes_pts, SUM(qty_remaining_micros)::bigint as qty_remaining_micros
         FROM orders
         WHERE market_id = $1 
         AND side = $2
         AND status IN ('OPEN', 'PARTIALLY_MATCHED')
         AND user_id <> $3
         GROUP BY limit_price_yes_pts
         ORDER BY limit_price_yes_pts ` + sortDirection + `
         LIMIT 20`,
        [marketId, oppositeSide, userId]
      );

      // Sweep book levels
      let remaining = closeContractsMicros;
      let totalWeightedYesPts = 0n;
      let totalCostPence = 0;

      for (const level of bookResult.rows) {
        if (remaining <= 0n) break;

        const yesPts = parseInt(level.yes_pts);
        const levelContractsMicros = BigInt(level.qty_remaining_micros);
        
        const fillContracts = remaining < levelContractsMicros ? remaining : levelContractsMicros;
        
        // Calculate cost
        const fillCostPence = Number((BigInt(yesPts) * fillContracts * BigInt(CONTRACT_PAYOUT_PENCE)) / (BigInt(PRICE_SCALE) * BigInt(CONTRACT_SCALE)));
        
        totalWeightedYesPts += BigInt(yesPts) * fillContracts;
        totalCostPence += fillCostPence;
        remaining -= fillContracts;
      }

      const filledContracts = closeContractsMicros - remaining;
      const avgYesPts = filledContracts > 0n ? Number(totalWeightedYesPts / filledContracts) : 0;
      const feeEstimate = Math.floor(totalCostPence / 1000); // 0.1% taker fee

      // Net value depends on close side
      const netValue = closeSide === OrderSide.LAY 
        ? totalCostPence - feeEstimate  // Selling YES - we receive premium
        : -(totalCostPence + feeEstimate); // Buying YES - we pay premium

      this.logger.info(`Quote: filled=${filledContracts}, unfilled=${remaining}, avg=${avgYesPts}, value=${netValue}p`);

      return {
        success: true,
        marketId,
        userId,
        netContractsMicros: netContractsMicros,
        filledContractsMicros: filledContracts.toString(),
        unfilledContractsMicros: remaining.toString(),
        avgYesPts,
        costPence: totalCostPence,
        estimatedFeePence: feeEstimate,
        netValuePence: netValue,
        quoteTimestamp: Date.now(),
      };
    } catch (error) {
      this.logger.error('Failed to get close quote', error);
      throw error;
    }
  }

  /**
   * Execute close as normal IOC order
   * Creates order in DB and publishes to matching engine
   */
  @Post('execute')
  @HttpCode(HttpStatus.OK)
  async executeCashout(
    @Body() body: {
      marketId: string;
      netContractsMicros: string;
      maxSlippagePts?: number;
    },
    @Req() req: FastifyRequest & { session: any },
  ) {
    try {
      const userId = req.session?.userId;
      if (!userId) {
        throw new UnauthorizedException('User not authenticated');
      }

      const { marketId, netContractsMicros, maxSlippagePts = 100000 } = body;
      if (!marketId || !netContractsMicros) {
        throw new Error('marketId and netContractsMicros are required');
      }

      const netContracts = BigInt(netContractsMicros);
      
      // REDUCE-ONLY VALIDATION: prevent accidentally increasing position
      if (netContracts === 0n) {
        return {
          success: false,
          error: 'No open position to close',
        };
      }
      
      // The requested close amount must have opposite sign to the current position
      // and must not exceed the position size
      // netContracts > 0 means long position → must close with LAY (negative close)
      // netContracts < 0 means short position → must close with FOR (positive close)
      
      // Since we're passing the same netContractsMicros from position, we use absolute value
      // But we need to ensure we're trading the opposite direction
      const closeContractsMicros = netContracts < 0n ? -netContracts : netContracts;
      const closeSide = netContracts > 0n ? OrderSide.LAY : OrderSide.FOR;

      this.logger.info(`Close execute: market=${marketId}, contracts=${closeContractsMicros}, side=${closeSide}`);

      // CRITICAL: Cancel all resting orders for this user/market to prevent reopening position
      this.logger.info(`Cancelling resting orders for user=${userId}, market=${marketId}`);
      const cancelResult = await this.databaseService.query(
        `UPDATE orders
         SET status = 'CANCELLED', updated_at = NOW()
         WHERE user_id = $1 
         AND market_id = $2 
         AND status IN ('OPEN', 'PARTIALLY_MATCHED')
         RETURNING id`,
        [userId, marketId]
      );
      
      // Publish cancel events to matching engine for each cancelled order
      for (const row of cancelResult.rows) {
        this.natsClient.publish(NATS_SUBJECTS.ORDERS_CANCEL, {
          orderId: row.id,
          userId,
          marketId,
          reason: 'Cancelled before closing position',
          timestamp: new Date().toISOString(),
        });
      }
      
      this.logger.info(`Cancelled ${cancelResult.rows.length} resting orders before close`);

      // Use extreme price to match against any available liquidity
      // For LAY (selling YES): use yesPts=1 (will match any FOR order)
      // For FOR (buying YES): use yesPts=PRICE_SCALE-1 (will match any LAY order)
      const yesPts = closeSide === OrderSide.FOR ? PRICE_SCALE - 1 : 1;
      const pPts = closeSide === OrderSide.FOR ? yesPts : PRICE_SCALE - yesPts;

      // Calculate max liability (max possible loss on this order)
      // For LAY: max loss is if YES wins, we pay (PRICE_SCALE - yesPts) per contract
      // For FOR: max loss is if NO wins, we lose the stake (yesPts per contract)
      const maxLossPerContract = closeSide === OrderSide.LAY 
        ? PRICE_SCALE - yesPts 
        : yesPts;
      const maxLiabilityPence = Number((BigInt(maxLossPerContract) * closeContractsMicros * BigInt(CONTRACT_PAYOUT_PENCE)) / (BigInt(PRICE_SCALE) * BigInt(CONTRACT_SCALE)));

      // Check balance
      const walletResult = await this.databaseService.query(
        'SELECT balance FROM wallets WHERE user_id = $1',
        [userId]
      );
      if (walletResult.rows.length === 0) {
        throw new Error('Wallet not found');
      }
      const balancePence = Math.floor(parseFloat(walletResult.rows[0].balance) * 100);
      if (balancePence < maxLiabilityPence) {
        throw new Error(`Insufficient balance. Required: £${(maxLiabilityPence / 100).toFixed(2)}, Available: £${(balancePence / 100).toFixed(2)}`);
      }

      // Lock balance
      await this.databaseService.lockBalance(userId, maxLiabilityPence);

      // Create IOC order in DB
      const orderId = uuidv4();
      const stakePence = closeSide === OrderSide.FOR ? maxLiabilityPence : undefined;
      const liabilityPence = closeSide === OrderSide.LAY ? maxLiabilityPence : undefined;
      
      await this.databaseService.query(
        `INSERT INTO orders 
          (id, market_id, user_id, side, p_pts, limit_price_yes_pts, stake_pence, liability_pence, 
           qty_remaining_micros, qty_original_micros, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'OPEN', NOW(), NOW())`,
        [
          orderId, 
          marketId, 
          userId, 
          closeSide, 
          pPts, 
          yesPts,
          stakePence,
          liabilityPence,
          closeContractsMicros.toString(),
          closeContractsMicros.toString()
        ]
      );

      // Publish to matching engine as IOC
      const orderCommand = {
        orderId,
        userId,
        marketId,
        side: closeSide,
        pPts,
        yesPts,
        stakePence: closeSide === OrderSide.FOR ? maxLiabilityPence : undefined,
        liabilityPence: closeSide === OrderSide.LAY ? maxLiabilityPence : undefined,
        originalContractsMicros: closeContractsMicros.toString(),
        remainingContractsMicros: closeContractsMicros.toString(),
        timeInForce: TimeInForce.IOC, // Immediate-Or-Cancel
        timestamp: new Date().toISOString(),
      };

      this.natsClient.publish(NATS_SUBJECTS.ORDERS_SUBMIT, orderCommand);

      this.logger.info(`Close order submitted: ${orderId}, IOC, ${closeSide}, contracts=${closeContractsMicros}`);

      return {
        success: true,
        orderId,
        marketId,
        userId,
        message: 'Close order submitted as IOC. Unfilled portion will not rest on book.',
      };
    } catch (error) {
      this.logger.error('Failed to execute close', error);
      throw error;
    }
  }
}
