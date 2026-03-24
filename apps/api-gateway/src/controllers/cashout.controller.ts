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
      this.logger.info(`[quote] session debug`, {
        hasSession: !!req.session,
        sessionId: req.session?.sessionId,
        userId: req.session?.userId,
        cookieHeader: req.headers?.cookie?.substring(0, 120),
      });
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
      lotIds?: string[]; // Optional: target specific lots instead of FIFO
      closeMode?: 'ioc' | 'limit'; // Default IOC (market). Limit = IOC at user-specified price.
      limitYesPts?: number; // YES price in pts (7dp) when closeMode='limit'
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
      // netContracts < 0 means short position → must close with FOR (positive close)
      
      // Since we're passing the same netContractsMicros from position, we use absolute value
      // But we need to ensure we're trading the opposite direction
      let closeContractsMicros = netContracts < 0n ? -netContracts : netContracts;
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

      // If specific lot IDs were provided, target them directly instead of FIFO.
      // We do this by temporarily setting their opened_at to epoch so Rust's
      // FIFO clearing hits them first, and we close with their exact qty.
      if (body.lotIds && body.lotIds.length > 0) {
        const targetLotsResult = await this.databaseService.query<{
          qty_remaining_micros: string;
        }>(
          `SELECT qty_remaining_micros
           FROM position_lots
           WHERE lot_id = ANY($1::uuid[])
             AND user_id = $2
             AND market_id = $3
             AND qty_remaining_micros > 0`,
          [body.lotIds, userId, marketId]
        );

        if (targetLotsResult.rows.length > 0) {
          const totalTargetQty = targetLotsResult.rows.reduce(
            (s, r) => s + BigInt(r.qty_remaining_micros), 0n
          );

          // Prioritise these lots in FIFO by backdating them to epoch.
          await this.databaseService.query(
            `UPDATE position_lots
             SET opened_at = '1970-01-01 00:00:00+00'
             WHERE lot_id = ANY($1::uuid[])
               AND user_id = $2`,
            [body.lotIds, userId]
          );

          // Override close quantity to exactly match the targeted lots.
          closeContractsMicros = totalTargetQty;
          this.logger.info(
            `Lot-targeted close: ${body.lotIds.length} lots, total qty=${totalTargetQty}`
          );
        }
      }

      // Determine limit price.
      // In 'limit' mode the user provides an explicit YES price.
      // In default IOC (market) mode we use aggressive bounds so the order
      // sweeps the entire book: sell at MIN_PRICE, buy at MAX_PRICE.
      const MIN_PRICE_PTS = 10_000; // 0.1%
      const MAX_PRICE_PTS = 9_990_000; // 99.9%

      let yesPts: number;
      if (body.closeMode === 'limit' && body.limitYesPts != null) {
        yesPts = body.limitYesPts;
        // Clamp to valid range
        if (yesPts < MIN_PRICE_PTS) yesPts = MIN_PRICE_PTS;
        if (yesPts > MAX_PRICE_PTS) yesPts = MAX_PRICE_PTS;
        this.logger.info(`Limit close: user-specified yesPts=${yesPts}`);
      } else {
        // SELL_YES (closing long YES) uses the lowest allowed YES price.
        // BUY_YES (closing short YES) uses the highest allowed YES price.
        yesPts = closeSide === OrderSide.FOR ? MAX_PRICE_PTS : MIN_PRICE_PTS;
      }

      // Calculate max liability (max possible loss on this order)
      // For LAY: max loss is if YES wins, we pay (PRICE_SCALE - yesPts) per contract
      // For FOR: max loss is if NO wins, we lose the stake (yesPts per contract)
      const maxLossPerContract = closeSide === OrderSide.LAY 
        ? PRICE_SCALE - yesPts 
        : yesPts;
      const maxLiabilityPence = Number((BigInt(maxLossPerContract) * closeContractsMicros * BigInt(CONTRACT_PAYOUT_PENCE)) / (BigInt(PRICE_SCALE) * BigInt(CONTRACT_SCALE)));

      // For reduce_only orders Rust reserves 0 pence — riskPence is only used
      // to size the order row, so allow any non-zero amount through.
      // Floor to at least 1 so the Rust side doesn't reject a zero-risk order.
      const effectiveLiability = Math.max(maxLiabilityPence, 1);

      const rustResponse = await this.rustExchange.submitOrder({
        marketId,
        userId,
        side: closeSide as 'BUY_YES' | 'SELL_YES',
        riskPence: effectiveLiability,
        limitYesPts: yesPts,
        timeInForce: 'IOC',
        reduceOnly: true,
      });

      this.logger.info(
        `Close order submitted via Rust exchange: ${rustResponse.order_id}, IOC, ${closeSide}, risk=${effectiveLiability}p`
      );

      // Wallet settlement, trade_settlements rows, and ledger entries are all
      // handled by the Rust exchange inside its clearing transaction.
      // Nothing else to do here.

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
