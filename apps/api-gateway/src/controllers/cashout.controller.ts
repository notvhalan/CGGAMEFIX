import { Controller, Post, Body, HttpCode, HttpStatus, Req, UnauthorizedException } from '@nestjs/common';
import { Logger } from '@betting-exchange/shared-config';
import { PRICE_SCALE, OrderSide, CONTRACT_SCALE, CONTRACT_PAYOUT_PENCE } from '@betting-exchange/shared-types';
import { FastifyRequest } from 'fastify';
import { DatabaseService } from '../database/database.service';
import { RustExchangeService } from '../services/rust-exchange.service';

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
    private readonly databaseService: DatabaseService,
    private readonly rustExchange: RustExchangeService,
  ) {}

  private async waitForOrderCancellations(orderIds: string[], timeoutMs = 5000): Promise<number> {
    if (orderIds.length === 0) {
      return 0;
    }

    const deadline = Date.now() + timeoutMs;
    let pending = orderIds.length;

    while (Date.now() < deadline) {
      const pendingResult = await this.databaseService.query<{ pending: string }>(
        `SELECT COUNT(*)::text AS pending
         FROM orders
         WHERE id = ANY($1::uuid[])
           AND status IN ('OPEN', 'PARTIALLY_MATCHED')`,
        [orderIds]
      );

      pending = Number(pendingResult.rows[0]?.pending || '0');
      if (pending === 0) {
        return 0;
      }

      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return pending;
  }

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
   * Submits IOC order to Rust exchange
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

      const { marketId, netContractsMicros } = body;
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
      // netContracts > 0 means long position â†’ must close with LAY (negative close)
      // netContracts < 0 means short position â†’ must close with FOR (positive close)
      
      // Since we're passing the same netContractsMicros from position, we use absolute value
      // But we need to ensure we're trading the opposite direction
      const closeContractsMicros = netContracts < 0n ? -netContracts : netContracts;
      const closeSide = netContracts > 0n ? OrderSide.LAY : OrderSide.FOR;

      this.logger.info(`Close execute: market=${marketId}, contracts=${closeContractsMicros}, side=${closeSide}`);

      // CRITICAL: Cancel all resting orders for this user/market to prevent reopening position
      this.logger.info(`Cancelling resting orders for user=${userId}, market=${marketId}`);
      const openOrdersResult = await this.databaseService.query<{ id: string }>(
        `SELECT id
         FROM orders
         WHERE user_id = $1
           AND market_id = $2
           AND status IN ('OPEN', 'PARTIALLY_MATCHED')`,
        [userId, marketId]
      );
      const openOrderIds = openOrdersResult.rows.map(row => row.id);

      if (openOrderIds.length > 0) {
        const cancelResults = await Promise.allSettled(
          openOrderIds.map(orderId =>
            this.rustExchange.cancelOrder({
              orderId,
              userId,
            })
          )
        );
        const failedCancels = cancelResults.filter(result => result.status === 'rejected');
        if (failedCancels.length > 0) {
          throw new Error(`Failed to cancel ${failedCancels.length} resting orders`);
        }

        const pendingCancels = await this.waitForOrderCancellations(openOrderIds);
        if (pendingCancels > 0) {
          throw new Error(`Timed out waiting for ${pendingCancels} resting order cancellations`);
        }
      }

      this.logger.info(`Cancelled ${openOrderIds.length} resting orders before close`);

      // Use aggressive but valid price bounds accepted by Rust exchange.
      // SELL_YES (closing long YES) uses the lowest allowed YES price.
      // BUY_YES (closing short YES) uses the highest allowed YES price.
      const MIN_PRICE_PTS = 10_000; // 0.1%
      const MAX_PRICE_PTS = 9_990_000; // 99.9%
      const yesPts = closeSide === OrderSide.FOR ? MAX_PRICE_PTS : MIN_PRICE_PTS;

      // Calculate max liability (max possible loss on this order)
      // For LAY: max loss is if YES wins, we pay (PRICE_SCALE - yesPts) per contract
      // For FOR: max loss is if NO wins, we lose the stake (yesPts per contract)
      const maxLossPerContract = closeSide === OrderSide.LAY 
        ? PRICE_SCALE - yesPts 
        : yesPts;
      const maxLiabilityPence = Number((BigInt(maxLossPerContract) * closeContractsMicros * BigInt(CONTRACT_PAYOUT_PENCE)) / (BigInt(PRICE_SCALE) * BigInt(CONTRACT_SCALE)));

      if (maxLiabilityPence < 100) {
        throw new Error('Close size is below minimum order risk (GBP 1.00)');
      }

      const rustResponse = await this.rustExchange.submitOrder({
        marketId,
        userId,
        side: closeSide as 'BUY_YES' | 'SELL_YES',
        riskPence: maxLiabilityPence,
        limitYesPts: yesPts,
        timeInForce: 'IOC',
        reduceOnly: true,
      });

      this.logger.info(
        `Close order submitted via Rust exchange: ${rustResponse.order_id}, IOC, ${closeSide}, risk=${maxLiabilityPence}p`
      );

      return {
        success: true,
        orderId: rustResponse.order_id,
        marketId,
        userId,
        message: 'Close order submitted as IOC via Rust exchange. Unfilled portion will not rest on book.',
      };
    } catch (error) {
      this.logger.error('Failed to execute close', error);
      throw error;
    }
  }
}
