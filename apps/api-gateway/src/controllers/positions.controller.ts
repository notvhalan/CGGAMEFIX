import { Controller, Get, Param, Req } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { PRICE_SCALE } from '@betting-exchange/shared-types';

interface TradePosition {
  sizePence: number;
  yesPricePts: number;
  feePence: number;
  executedAt: string;
}

interface Position {
  marketId: string;
  netYesPence: number; // Net exposure in pence (positive = long YES, negative = short YES)
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
  constructor(private readonly databaseService: DatabaseService) {}

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

    // Get all user's trades for this market
    const trades = await this.databaseService.query(
      `SELECT 
        yes_pts,
        cost_pence,
        side,
        maker_id,
        taker_id,
        maker_fee_pence,
        taker_fee_pence,
        executed_at
       FROM trades
       WHERE market_id = $1 
       AND (maker_id = $2 OR taker_id = $2)
       ORDER BY executed_at ASC`,
      [marketId, userId]
    );

    // Calculate net position with proper weighted average and track individual positions
    let netCostPence = 0; // Net cash flow (positive = spent, negative = received)
    let totalWeightedCost = 0; // For weighted average calculation
    let totalAbsCost = 0; // Sum of absolute costs for averaging
    let totalFeesPence = 0;
    const buyPositions: TradePosition[] = [];
    const sellPositions: TradePosition[] = [];

    for (const trade of trades.rows) {
      const costPence = parseInt(trade.cost_pence || '0');
      const yesPts = parseInt(trade.yes_pts || '0');
      const isMaker = trade.maker_id === userId;
      const isTaker = trade.taker_id === userId;
      const executedAt = trade.executed_at;
      
      // Determine if user bought or sold YES
      // FOR side = buying YES, LAY side = selling YES (buying NO)
      const side = trade.side as string;
      
      let feePence = 0;
      let userBought = false;
      
      // Skip self-trading (should not happen but handle gracefully)
      if (isMaker && isTaker) {
        // Self-trading: user is both sides of the trade, skip to avoid double-counting
        continue;
      }
      
      if (isMaker) {
        // User was maker
        // The 'side' field is the TAKER's side, so maker is opposite
        feePence = parseInt(trade.maker_fee_pence || '0');
        if (side === 'FOR' || side === 'BACK') {
          // Taker was FOR (buying YES), so maker was LAY (selling YES)
          // Maker receives costPence
          netCostPence -= costPence;
          totalWeightedCost -= costPence * yesPts;
          totalAbsCost += costPence;
          userBought = false;
        } else {
          // Taker was LAY (selling YES), so maker was FOR (buying YES)
          // Maker pays costPence
          netCostPence += costPence;
          totalWeightedCost += costPence * yesPts;
          totalAbsCost += costPence;
          userBought = true;
        }
        totalFeesPence += feePence;
      } else if (isTaker) {
        // User was taker
        feePence = parseInt(trade.taker_fee_pence || '0');
        if (side === 'FOR' || side === 'BACK') {
          // Taker FOR = bought YES
          // User pays costPence
          netCostPence += costPence;
          totalWeightedCost += costPence * yesPts;
          totalAbsCost += costPence;
          userBought = true;
        } else {
          // Taker LAY = sold YES
          // User receives costPence
          netCostPence -= costPence;
          totalWeightedCost -= costPence * yesPts;
          totalAbsCost += costPence;
          userBought = false;
        }
        totalFeesPence += feePence;
      }
      
      // Track individual positions
      if (userBought) {
        buyPositions.push({
          sizePence: costPence,
          yesPricePts: yesPts,
          feePence,
          executedAt,
        });
      } else {
        sellPositions.push({
          sizePence: costPence,
          yesPricePts: yesPts,
          feePence,
          executedAt,
        });
      }
    }

    // Calculate weighted average entry price
    // avgEntry = sum(cost * price) / sum(cost)
    const avgEntryYesPts = totalAbsCost > 0
      ? Math.floor(Math.abs(totalWeightedCost) / totalAbsCost)
      : 0;

    // Get current mark price from orderbook
    const orderbook = await this.databaseService.query(
      `SELECT 
        side,
        p_pts,
        remaining_pence
       FROM orders
       WHERE market_id = $1 
       AND status IN ('OPEN', 'PARTIALLY_MATCHED')
       ORDER BY 
         CASE WHEN side = 'FOR' THEN p_pts ELSE (10000000 - p_pts) END DESC,
         created_at ASC
       LIMIT 20`,
      [marketId]
    );

    // Calculate mark price (midpoint of best bid/ask in yesPts)
    let bestBidYesPts = 0;
    let bestAskYesPts = PRICE_SCALE;

    for (const order of orderbook.rows) {
      const pPts = parseInt(order.p_pts);
      const side = order.side as string;
      
      // Convert to yesPts
      const yesPts = (side === 'FOR' || side === 'BACK') ? pPts : (PRICE_SCALE - pPts);
      
      // Classify as bid or ask based on yesPts
      if (yesPts >= PRICE_SCALE / 2) {
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

    // Calculate unrealized P&L
    // If net cost > 0 (spent money = long position): PnL = currentValue - costPaid
    // If net cost < 0 (received money = short position): PnL = cashReceived - currentValue
    // Current value of position = |netCost| * markPrice / entryPrice
    const currentValuePence = totalAbsCost > 0 && avgEntryYesPts > 0
      ? Math.floor((totalAbsCost * lastMarkYesPts) / avgEntryYesPts)
      : 0;
    
    const unrealizedPnlPence = netCostPence > 0
      ? currentValuePence - netCostPence // Long: current value - what we paid
      : netCostPence + currentValuePence; // Short: what we received - current value (negate because netCost is negative)

    return {
      marketId,
      netYesPence: Math.abs(netCostPence), // Display as absolute value
      avgEntryYesPts,
      markYesPts: lastMarkYesPts,
      unrealizedPnlPence: unrealizedPnlPence - totalFeesPence,
      totalFeesPence,
      canCashOut: Math.abs(netCostPence) > 0 && (bestBidYesPts > 0 || bestAskYesPts < PRICE_SCALE),
      buyPositions,
      sellPositions,
    };
  }
}
