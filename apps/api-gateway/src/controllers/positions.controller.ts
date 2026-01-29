import { Controller, Get, Post, Param, Req, Body } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { NatsClient } from '../nats/nats.client';
import { NATS_SUBJECTS } from '../nats/subjects';
import { PRICE_SCALE, CONTRACT_SCALE, CONTRACT_PAYOUT_PENCE } from '@betting-exchange/shared-types';
import { v4 as uuidv4 } from 'uuid';

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
    private readonly natsClient: NatsClient,
  ) {}

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

    // Get position snapshot from positions table (NOT trades)
    const positionResult = await this.databaseService.query(
      `SELECT 
        net_qty_micros,
        avg_open_price_yes_pts,
        realized_pnl_pence,
        fees_paid_pence
       FROM positions
       WHERE market_id = $1 AND user_id = $2`,
      [marketId, userId]
    );
    
    // If no position, return early with zero position
    if (positionResult.rows.length === 0) {
      return {
        marketId,
        netYesPence: 0,
        netContractsMicros: '0',
        avgEntryYesPts: 0,
        markYesPts: Math.floor(PRICE_SCALE / 2),
        unrealizedPnlPence: 0,
        totalFeesPence: 0,
        canCashOut: false,
        buyPositions: [],
        sellPositions: [],
      };
    }

    // Use snapshot data from positions table
    const position = positionResult.rows[0];
    const netContractsMicros = BigInt(position.net_qty_micros || '0');
    const avgEntryYesPts = parseInt(position.avg_open_price_yes_pts || '0');
    const realizedPnlPence = parseInt(position.realized_pnl_pence || '0');
    const totalFeesPence = parseInt(position.fees_paid_pence || '0');

    // Get open lots for UI breakdown
    const lotsResult = await this.databaseService.query(
      `SELECT 
        side,
        entry_price_yes_pts,
        qty_remaining_micros,
        realized_pnl_pence,
        opened_at
       FROM position_lots
       WHERE user_id = $1 AND market_id = $2 AND qty_remaining_micros > 0
       ORDER BY opened_at ASC`,
      [userId, marketId]
    );

    const buyPositions: TradePosition[] = [];
    const sellPositions: TradePosition[] = [];

    for (const lot of lotsResult.rows) {
      const qtyMicros = BigInt(lot.qty_remaining_micros || '0');
      const priceYesPts = parseInt(lot.entry_price_yes_pts || '0');
      const side = lot.side as string;
      const openedAt = lot.opened_at;
      
      // Calculate notional for display
      const notionalPence = Number((BigInt(priceYesPts) * qtyMicros * BigInt(CONTRACT_PAYOUT_PENCE)) / (BigInt(PRICE_SCALE) * BigInt(CONTRACT_SCALE)));
      
      if (side === 'FOR') {
        buyPositions.push({
          sizePence: notionalPence,
          yesPricePts: priceYesPts,
          feePence: 0, // Fees already tracked in snapshot
          executedAt: openedAt,
          contractsMicros: qtyMicros.toString(),
        });
      } else {
        sellPositions.push({
          sizePence: notionalPence,
          yesPricePts: priceYesPts,
          feePence: 0, // Fees already tracked in snapshot
          executedAt: openedAt,
          contractsMicros: '-' + qtyMicros.toString(), // Negative for LAY
        });
      }
    }

    // Get current mark price from orderbook
    const orderbook = await this.databaseService.query(
      `SELECT 
        side,
        limit_price_yes_pts as yes_pts,
        qty_remaining_micros as remaining_contracts
       FROM orders
       WHERE market_id = $1 
       AND status IN ('OPEN', 'PARTIALLY_MATCHED')
       ORDER BY 
         CASE WHEN side = 'FOR' THEN limit_price_yes_pts ELSE (10000000 - limit_price_yes_pts) END DESC,
         created_at ASC
       LIMIT 20`,
      [marketId]
    );

    // Calculate mark price (midpoint of best bid/ask in yesPts)
    // FOR orders = bids (buying YES), LAY orders = asks (selling YES)
    let bestBidYesPts = 0;
    let bestAskYesPts = PRICE_SCALE;

    for (const order of orderbook.rows) {
      const yesPts = parseInt(order.yes_pts);
      const side = order.side as string;
      
      if (side === 'FOR' || side === 'BACK') {
        // This is a bid (buying YES)
        bestBidYesPts = Math.max(bestBidYesPts, yesPts);
      } else {
        // This is an ask (selling YES)
        bestAskYesPts = Math.min(bestAskYesPts, yesPts);
      }
    }

    const lastMarkYesPts = bestBidYesPts > 0 && bestAskYesPts < PRICE_SCALE
      ? Math.floor((bestBidYesPts + bestAskYesPts) / 2)
      : avgEntryYesPts || Math.floor(PRICE_SCALE / 2);

    // Position is open if netContractsMicros !== 0 (not based on cashflow!)
    const absContractsMicros = netContractsMicros < 0n ? -netContractsMicros : netContractsMicros;
    const isOpen = netContractsMicros !== 0n;
    
    // Notional exposure in pence (at payout), independent of entry prices
    const notionalPence = Number(
      (absContractsMicros * BigInt(CONTRACT_PAYOUT_PENCE)) / BigInt(CONTRACT_SCALE)
    );

    // Calculate unrealized P&L based on mark-to-market
    // For longs: (mark - entry) * contracts
    // For shorts: (entry - mark) * contracts
    let unrealizedPnlPence = 0;
    if (isOpen && avgEntryYesPts > 0) {
      const contractsForPnl = Number(absContractsMicros) / Number(CONTRACT_SCALE);
      const pnlPerContract = netContractsMicros > 0n
        ? (lastMarkYesPts - avgEntryYesPts) * CONTRACT_PAYOUT_PENCE / PRICE_SCALE
        : (avgEntryYesPts - lastMarkYesPts) * CONTRACT_PAYOUT_PENCE / PRICE_SCALE;
      unrealizedPnlPence = Math.floor(pnlPerContract * contractsForPnl);
    }

    return {
      marketId,
      netYesPence: notionalPence, // Notional exposure, not cashflow
      netContractsMicros: netContractsMicros.toString(), // Convert BigInt to string for JSON
      avgEntryYesPts,
      markYesPts: lastMarkYesPts,
      unrealizedPnlPence: isOpen ? (unrealizedPnlPence - totalFeesPence) : 0,
      totalFeesPence,
      canCashOut: isOpen && (bestBidYesPts > 0 || bestAskYesPts < PRICE_SCALE),
      buyPositions,
      sellPositions,
    };
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

    // CRITICAL: Cancel all resting orders for this user/market to prevent reopening position
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

    // Calculate contracts to close based on netContractsMicros
    const netContracts = BigInt(position.netContractsMicros);
    const closeContractsMicros = (netContracts * BigInt(percentage)) / 100n;
    
    if (closeContractsMicros === 0n) {
      throw new Error('Cash out amount too small');
    }

    // Determine close side
    const isLong = netContracts > 0n;
    const closeSide = isLong ? 'LAY' : 'FOR';
    
    // Use extreme price to sweep book
    const yesPts = closeSide === 'FOR' ? PRICE_SCALE - 1 : 1;
    const pPts = closeSide === 'FOR' ? yesPts : PRICE_SCALE - yesPts;
    
    // Use absolute value of closeContractsMicros for calculations
    const absCloseContractsMicros = closeContractsMicros < 0n ? -closeContractsMicros : closeContractsMicros;
    
    // Calculate max liability
    const maxLossPerContract = closeSide === 'LAY' ? PRICE_SCALE - yesPts : yesPts;
    const maxLiabilityPence = Number((BigInt(maxLossPerContract) * absCloseContractsMicros * BigInt(CONTRACT_PAYOUT_PENCE)) / (BigInt(PRICE_SCALE) * BigInt(CONTRACT_SCALE)));
    
    // Check and lock balance
    const walletResult = await this.databaseService.query(
      'SELECT balance FROM wallets WHERE user_id = $1',
      [userId]
    );
    if (walletResult.rows.length === 0) {
      throw new Error('Wallet not found');
    }
    const balancePence = Math.floor(parseFloat(walletResult.rows[0].balance) * 100);
    if (balancePence < maxLiabilityPence) {
      throw new Error(`Insufficient balance for close order`);
    }

    await this.databaseService.lockBalance(userId, maxLiabilityPence);
    
    // Create IOC order
    const orderId = uuidv4();
    const stakePence = closeSide === 'FOR' ? maxLiabilityPence : undefined;
    const liabilityPence = closeSide === 'LAY' ? maxLiabilityPence : undefined;
    
    try {
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
          absCloseContractsMicros.toString(),
          absCloseContractsMicros.toString()
        ]
      );

      // Publish IOC order to matching engine
      const orderCommand = {
        orderId,
        userId,
        marketId,
        side: closeSide,
        pPts,
        yesPts,
        stakePence: closeSide === 'FOR' ? maxLiabilityPence : undefined,
        liabilityPence: closeSide === 'LAY' ? maxLiabilityPence : undefined,
        originalContractsMicros: absCloseContractsMicros.toString(),
        remainingContractsMicros: absCloseContractsMicros.toString(),
        timeInForce: 'IOC',
        timestamp: new Date().toISOString(),
      };

      this.natsClient.publish(NATS_SUBJECTS.ORDERS_SUBMIT, orderCommand);

      return {
        success: true,
        message: `Close order submitted (${percentage}% of position). Order will match immediately or cancel.`,
        orderId,
      };
    } catch (error) {
      // Rollback balance lock on error
      await this.databaseService.query(
        'UPDATE wallets SET balance = balance + $1, locked_balance = locked_balance - $1 WHERE user_id = $2',
        [maxLiabilityPence / 100, userId]
      );
      throw error;
    }
  }
}
