import { Controller, Get, Post, Param, Req, Body } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { PRICE_SCALE, CONTRACT_SCALE, CONTRACT_PAYOUT_PENCE } from '@betting-exchange/shared-types';
import { RustExchangeService } from '../services/rust-exchange.service';

interface TradePosition {
  sizePence: number;
  yesPricePts: number;
  feePence: number;
  executedAt: string;
  contractsMicros: string; // BigInt as string for JSON
}

interface Position {
  marketId: string;
  netYesPence: number; // Net exposure in pence (positive = long YES, negative = short YES)
  netContractsMicros: string; // Net contracts in microcontracts (BigInt as string)
  avgEntryYesPts: number; // Weighted average entry price in YES probability points
  markYesPts: number; // Current mark price (midpoint)
  unrealizedPnlPence: number; // Unrealized P&L in pence
  totalFeesPence: number; // Total fees paid
  canCashOut: boolean; // Whether position can be closed
  buyPositions: TradePosition[]; // All buy (FOR) positions
  sellPositions: TradePosition[]; // All sell (LAY) positions
}

@Controller('v1/positions')
export class PositionsController {
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
   * Get all active positions for the user across all markets
   */
  @Get('me')
  async getAllMyPositions(@Req() req: any): Promise<Position[]> {
    const userId = req.session?.userId;
    if (!userId) {
      throw new Error('User not authenticated');
    }

    return this.rustExchange.getPositions({ userId });
  }

  /**
   * Get user's position for a specific market
   * Computes from trades table
   */
  @Get('markets/:marketId/me')
  async getMyPosition(
    @Param('marketId') marketId: string,
    @Req() req: any
  ): Promise<Position> {
    // Get user ID from session
    const userId = req.session?.userId;
    if (!userId) {
      throw new Error('User not authenticated');
    }

    return this.rustExchange.getPositionForMarket({ userId, marketId });
  }

  /**
   * Cash out a position by placing an IOC order at market
   * 
   * NOTE: This is now a simplified wrapper. For full CLOB-only close logic,
   * use POST /v1/cashout/execute which implements proper IOC order submission.
   * 
   * This endpoint is kept for backward compatibility with existing UI code.
   */
  @Post('markets/:marketId/cashout')
  async cashOutPosition(
    @Param('marketId') marketId: string,
    @Req() req: any,
    @Body() body: { percentage?: number } // Optional: percentage to cash out (default 100%)
  ): Promise<{ success: boolean; message: string; orderId?: string }> {
    const userId = req.session?.userId;
    if (!userId) {
      throw new Error('User not authenticated');
    }

    // Get current position
    const position = await this.getMyPosition(marketId, req);
    
    if (position.netContractsMicros === '0') {
      throw new Error('No position to cash out');
    }

    const percentage = body.percentage || 100;
    if (percentage <= 0 || percentage > 100) {
      throw new Error('Invalid percentage. Must be between 0 and 100');
    }

    if (!position.canCashOut) {
      throw new Error('Position cannot be cashed out. No liquidity available.');
    }

    // CRITICAL: Cancel all resting orders for this user/market to prevent reopening position.
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

    // Calculate contracts to close based on netContractsMicros
    const netContracts = BigInt(position.netContractsMicros);
    const closeContractsMicros = (netContracts * BigInt(percentage)) / 100n;
    
    if (closeContractsMicros === 0n) {
      throw new Error('Cash out amount too small');
    }

    // Determine close side
    const isLong = netContracts > 0n;
    const closeSide = isLong ? 'LAY' : 'FOR';
    
    // Use aggressive but valid price bounds accepted by Rust exchange.
    const MIN_PRICE_PTS = 10_000; // 0.1%
    const MAX_PRICE_PTS = 9_990_000; // 99.9%
    const yesPts = closeSide === 'FOR' ? MAX_PRICE_PTS : MIN_PRICE_PTS;
    
    // Use absolute value of closeContractsMicros for calculations
    const absCloseContractsMicros = closeContractsMicros < 0n ? -closeContractsMicros : closeContractsMicros;
    
    // Calculate max liability
    const maxLossPerContract = closeSide === 'LAY' ? PRICE_SCALE - yesPts : yesPts;
    const maxLiabilityPence = Number((BigInt(maxLossPerContract) * absCloseContractsMicros * BigInt(CONTRACT_PAYOUT_PENCE)) / (BigInt(PRICE_SCALE) * BigInt(CONTRACT_SCALE)));
    
    if (maxLiabilityPence < 100) {
      throw new Error('Close size is below minimum order risk (GBP 1.00)');
    }

    const rustResponse = await this.rustExchange.submitOrder({
      marketId,
      userId,
      side: closeSide === 'FOR' ? 'BUY_YES' : 'SELL_YES',
      riskPence: maxLiabilityPence,
      limitYesPts: yesPts,
      timeInForce: 'IOC',
      reduceOnly: true,
    });

    return {
      success: true,
      message: `Close order submitted (${percentage}% of position) via Rust exchange. Unfilled portion will cancel.`,
      orderId: rustResponse.order_id,
    };
  }
}
