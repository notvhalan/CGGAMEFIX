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
    // Get user ID from session/auth (for now using mock)
    const userId = req.user?.id || 'f1f4f537-ba09-4e45-8a20-f0066fa7e84a';

    // Get all user's trades for this market
    const trades = await this.databaseService.query(
      `SELECT 
        yes_price_pts,
        size_pence,
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
    let netYesPence = 0;
    let totalCostPence = 0;
    let totalFeesPence = 0;
    const buyPositions: TradePosition[] = [];
    const sellPositions: TradePosition[] = [];

    for (const trade of trades.rows) {
      const sizePence = parseInt(trade.size_pence);
      const yesPricePts = parseInt(trade.yes_price_pts);
      const isMaker = trade.maker_id === userId;
      const isTaker = trade.taker_id === userId;
      const executedAt = trade.executed_at;
      
      // Determine if user bought or sold YES
      // FOR side = buying YES, LAY side = selling YES (buying NO)
      const side = trade.side as string;
      
      let positionDelta = 0;
      let costDelta = 0;
      let feePence = 0;
      let userBought = false;
      
      if (isMaker) {
        // User was maker
        feePence = parseInt(trade.maker_fee_pence || '0');
        if (side === 'FOR' || side === 'BACK') {
          // Taker was FOR, so maker was LAY (sold YES)
          positionDelta = -sizePence;
          costDelta = -Math.floor((sizePence * yesPricePts) / PRICE_SCALE);
          userBought = false;
        } else {
          // Taker was LAY, so maker was FOR (bought YES)
          positionDelta = sizePence;
          costDelta = Math.floor((sizePence * yesPricePts) / PRICE_SCALE);
          userBought = true;
        }
        totalFeesPence += feePence;
      }
      
      if (isTaker) {
        // User was taker
        feePence = parseInt(trade.taker_fee_pence || '0');
        if (side === 'FOR' || side === 'BACK') {
          // Taker FOR = bought YES
          positionDelta = sizePence;
          costDelta = Math.floor((sizePence * yesPricePts) / PRICE_SCALE);
          userBought = true;
        } else {
          // Taker LAY = sold YES
          positionDelta = -sizePence;
          costDelta = -Math.floor((sizePence * yesPricePts) / PRICE_SCALE);
          userBought = false;
        }
        totalFeesPence += feePence;
      }
      
      netYesPence += positionDelta;
      totalCostPence += costDelta;
      
      // Track individual positions
      if (userBought) {
        buyPositions.push({
          sizePence,
          yesPricePts,
          feePence,
          executedAt,
        });
      } else {
        sellPositions.push({
          sizePence,
          yesPricePts,
          feePence,
          executedAt,
        });
      }
    }

    // Calculate weighted average entry price from net position
    // avgEntry = totalCost / netPosition
    const avgEntryYesPts = Math.abs(netYesPence) > 0
      ? Math.floor((Math.abs(totalCostPence) * PRICE_SCALE) / Math.abs(netYesPence))
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
    const markValue = Math.floor((Math.abs(netYesPence) * lastMarkYesPts) / PRICE_SCALE);
    const unrealizedPnlPence = netYesPence > 0
      ? markValue - totalCostPence
      : totalCostPence - markValue;

    return {
      marketId,
      netYesPence,
      avgEntryYesPts,
      markYesPts: lastMarkYesPts,
      unrealizedPnlPence: unrealizedPnlPence - totalFeesPence,
      totalFeesPence,
      canCashOut: Math.abs(netYesPence) > 0 && (bestBidYesPts > 0 || bestAskYesPts < PRICE_SCALE),
      buyPositions,
      sellPositions,
    };
  }
}
