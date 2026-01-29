import { Injectable } from '@nestjs/common';
import { Logger } from '@betting-exchange/shared-config';
import { DatabaseService } from '../database/database.service';
import { TradeExecutedEvent } from '@betting-exchange/shared-types';

/**
 * Position Lots Service
 * 
 * Manages position lots using FIFO consumption model.
 * On each TRADE_EXECUTED event:
 * - If trade increases exposure (same side) → open new lot
 * - If trade decreases exposure (opposite side) → consume existing lots FIFO
 * - If trade crosses zero → consume all opposite lots, then open new lot with remainder
 */
@Injectable()
export class PositionLotsService {
  private readonly logger = new Logger('PositionLotsService');

  constructor(private readonly databaseService: DatabaseService) {}

  /**
   * Process a trade and update position lots
   * Called when TRADE_EXECUTED event is received
   */
  async processTrade(event: TradeExecutedEvent): Promise<void> {
    this.logger.info('Processing TRADE_EXECUTED event', { tradeId: event.tradeId, takerSide: event.takerSide });
    
    const { 
      tradeId,
      marketId, 
      makerUserId, 
      takerUserId, 
      takerSide, // Renamed from side
      qtyMicros: qtyMicrosStr, // Renamed from contractsMicros
      notionalPence,
      priceYesPts, // Renamed from yesPricePts
      makerFeePence,
      takerFeePence,
      timestamp
    } = event;

    // Use qtyMicros directly from the event
    const qtyMicros = BigInt(qtyMicrosStr);
    const executedAt = timestamp instanceof Date ? timestamp.toISOString() : String(timestamp);

    // Process lots for both participants
    this.logger.info('Processing taker trade', { userId: takerUserId, side: takerSide, qtyMicros: qtyMicros.toString() });
    await this.processUserTrade(
      takerUserId,
      marketId,
      tradeId,
      takerSide, // Taker's side is the trade side
      qtyMicros,
      priceYesPts,
      takerFeePence,
      executedAt // Already an ISO string
    );

    // Maker is opposite side
    const makerSide = takerSide === 'FOR' ? 'LAY' : 'FOR';
    this.logger.info('Processing maker trade', { userId: makerUserId, side: makerSide, qtyMicros: qtyMicros.toString() });
    await this.processUserTrade(
      makerUserId,
      marketId,
      tradeId,
      makerSide,
      qtyMicros,
      priceYesPts,
      makerFeePence,
      executedAt // Already an ISO string
    );
    
    this.logger.info('Completed processing TRADE_EXECUTED event', { tradeId });
  }

  /**
   * Process a trade for a single user
   */
  private async processUserTrade(
    userId: string,
    marketId: string,
    tradeId: string,
    side: string, // User's side in this trade
    contractsMicros: bigint,
    tradePriceYesPts: number,
    feePence: number,
    executedAt: string
  ): Promise<void> {
    // Get current position to determine if opening or closing
    const currentLots = await this.databaseService.query(
      `SELECT side, SUM(qty_remaining_micros)::bigint as total_remaining
       FROM position_lots
       WHERE user_id = $1 AND market_id = $2 AND qty_remaining_micros > 0
       GROUP BY side`,
      [userId, marketId]
    );

    let netContractsMicros = 0n;
    let currentSide: string | null = null;

    for (const lot of currentLots.rows) {
      const remaining = BigInt(lot.total_remaining);
      if (lot.side === 'FOR') {
        netContractsMicros += remaining;
        currentSide = 'FOR';
      } else {
        netContractsMicros -= remaining;
        currentSide = 'LAY';
      }
    }

    // Determine if this trade increases or decreases exposure
    const tradeSigned = side === 'FOR' ? contractsMicros : -contractsMicros;
    const newNetPosition = netContractsMicros + tradeSigned;

    this.logger.info(`User ${userId}: current=${netContractsMicros}, trade=${tradeSigned} ${side}, new=${newNetPosition}`);

    // Case 1: Same direction (opening/increasing position)
    if ((netContractsMicros === 0n) || (netContractsMicros > 0n && tradeSigned > 0n) || (netContractsMicros < 0n && tradeSigned < 0n)) {
      await this.openLot(userId, marketId, tradeId, side, contractsMicros, tradePriceYesPts, executedAt);
      await this.updateSnapshot(userId, marketId, feePence);
      return;
    }

    // Case 2: Opposite direction (closing/reducing position)
    const oppositeSide = side === 'FOR' ? 'LAY' : 'FOR';
    const lotsToClose = await this.databaseService.query(
      `SELECT lot_id, side, entry_price_yes_pts, qty_remaining_micros, opened_at
       FROM position_lots
       WHERE user_id = $1 AND market_id = $2 AND side = $3 AND qty_remaining_micros > 0
       ORDER BY opened_at ASC`, // FIFO
      [userId, marketId, oppositeSide]
    );

    let remainingToClose = contractsMicros;

    for (const lot of lotsToClose.rows) {
      if (remainingToClose <= 0n) break;

      const lotId = lot.lot_id;
      const lotRemaining = BigInt(lot.qty_remaining_micros);
      const lotEntryYesPts = parseInt(lot.entry_price_yes_pts);
      const closeQty = remainingToClose < lotRemaining ? remainingToClose : lotRemaining;

      // Calculate realized P&L for this partial close
      // For long positions (FOR lots): (exit - entry) * contracts
      // For short positions (LAY lots): (entry - exit) * contracts
      const exitYesPts = tradePriceYesPts; // Use the trade's execution price as exit price
      const PRICE_SCALE_NUM = 10_000_000;
      const CONTRACT_PAYOUT_PENCE_NUM = 100;
      const CONTRACT_SCALE_NUM = 1_000_000;
      
      const contractsDecimal = Number(closeQty) / CONTRACT_SCALE_NUM;
      const pnlPerContract = lot.side === 'FOR'
        ? (exitYesPts - lotEntryYesPts) * CONTRACT_PAYOUT_PENCE_NUM / PRICE_SCALE_NUM
        : (lotEntryYesPts - exitYesPts) * CONTRACT_PAYOUT_PENCE_NUM / PRICE_SCALE_NUM;
      const realizedPnl = Math.floor(pnlPerContract * contractsDecimal);

      // Update the lot
      await this.databaseService.query(
        `UPDATE position_lots
         SET qty_remaining_micros = qty_remaining_micros - $1,
             realized_pnl_pence = realized_pnl_pence + $2,
             updated_at = NOW()
         WHERE lot_id = $3`,
        [closeQty.toString(), realizedPnl, lotId]
      );

      this.logger.info(`Closed ${closeQty} from lot ${lotId}, realized PnL: ${realizedPnl}p`);

      remainingToClose -= closeQty;
    }

    // Case 3: If we have contracts left after closing all opposite lots, open a new lot
    if (remainingToClose > 0n) {
      this.logger.info(`Opened new lot with remaining ${remainingToClose} contracts (crossed zero)`);
      await this.openLot(userId, marketId, tradeId, side, remainingToClose, tradePriceYesPts, executedAt);
    }

    await this.updateSnapshot(userId, marketId, feePence);
  }

  /**
   * Open a new position lot
   */
  private async openLot(
    userId: string,
    marketId: string,
    tradeId: string,
    side: string,
    contractsMicros: bigint,
    entryYesPts: number,
    executedAt: string
  ): Promise<void> {
    await this.databaseService.query(
      `INSERT INTO position_lots 
        (user_id, market_id, side, entry_price_yes_pts, opened_from_trade_id, opened_at,
         qty_opened_micros, qty_remaining_micros, realized_pnl_pence)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0)`,
      [userId, marketId, side, entryYesPts, tradeId, executedAt, contractsMicros.toString(), contractsMicros.toString()]
    );

    this.logger.info(`Opened lot: user=${userId}, market=${marketId}, side=${side}, contracts=${contractsMicros}, entry=${entryYesPts}`);
  }

  /**
   * Update positions snapshot (optional read model)
   */
  private async updateSnapshot(
    userId: string,
    marketId: string,
    additionalFees: number
  ): Promise<void> {
    // Recalculate from lots
    const lotsResult = await this.databaseService.query(
      `SELECT side, entry_price_yes_pts, qty_remaining_micros, realized_pnl_pence
       FROM position_lots
       WHERE user_id = $1 AND market_id = $2 AND qty_remaining_micros > 0`,
      [userId, marketId]
    );

    let netContractsMicros = 0n;
    let totalWeightedEntry = 0n;
    let totalContracts = 0n;
    let totalRealizedPnl = 0;

    for (const lot of lotsResult.rows) {
      const remaining = BigInt(lot.qty_remaining_micros);
      const entryYesPts = BigInt(lot.entry_price_yes_pts);
      
      if (lot.side === 'FOR') {
        netContractsMicros += remaining;
        totalWeightedEntry += remaining * entryYesPts;
        totalContracts += remaining;
      } else {
        netContractsMicros -= remaining;
        totalWeightedEntry += remaining * entryYesPts; // Weighted by absolute contracts
        totalContracts += remaining;
      }
      
      totalRealizedPnl += parseInt(lot.realized_pnl_pence || '0');
    }

    const avgEntryYesPts = totalContracts > 0n ? Number(totalWeightedEntry / totalContracts) : 0;

    // Upsert snapshot
    await this.databaseService.query(
      `INSERT INTO positions 
        (user_id, market_id, net_qty_micros, avg_open_price_yes_pts, realized_pnl_pence, fees_paid_pence, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (user_id, market_id)
       DO UPDATE SET
         net_qty_micros = $3,
         avg_open_price_yes_pts = $4,
         realized_pnl_pence = $5,
         fees_paid_pence = positions.fees_paid_pence + $6,
         updated_at = NOW()`,
      [userId, marketId, netContractsMicros.toString(), avgEntryYesPts, totalRealizedPnl, additionalFees]
    );
  }

  /**
   * Get open lots for a user/market (for UI display)
   */
  async getOpenLots(userId: string, marketId: string): Promise<any[]> {
    const result = await this.databaseService.query(
      `SELECT 
        lot_id,
        side,
        entry_price_yes_pts,
        qty_remaining_micros,
        qty_opened_micros,
        opened_at,
        realized_pnl_pence
       FROM position_lots
       WHERE user_id = $1 AND market_id = $2 AND qty_remaining_micros > 0
       ORDER BY opened_at ASC`,
      [userId, marketId]
    );

    return result.rows.map(row => ({
      lotId: row.lot_id,
      side: row.side,
      entryYesPts: parseInt(row.entry_price_yes_pts),
      remainingContractsMicros: row.qty_remaining_micros,
      openedContractsMicros: row.qty_opened_micros,
      openedAt: row.opened_at,
      realizedPnlPence: parseInt(row.realized_pnl_pence || '0'),
    }));
  }

  /**
   * Get open lots grouped by entry price (for "close group" UI)
   */
  async getOpenLotsGrouped(userId: string, marketId: string): Promise<any[]> {
    const result = await this.databaseService.query(
      `SELECT 
        side,
        entry_price_yes_pts,
        SUM(qty_remaining_micros)::bigint as total_remaining,
        COUNT(*)::int as lot_count,
        MIN(opened_at) as first_opened
       FROM position_lots
       WHERE user_id = $1 AND market_id = $2 AND qty_remaining_micros > 0
       GROUP BY side, entry_price_yes_pts
       ORDER BY first_opened ASC`,
      [userId, marketId]
    );

    return result.rows.map(row => ({
      side: row.side,
      entryYesPts: parseInt(row.entry_price_yes_pts),
      totalRemainingContractsMicros: row.total_remaining,
      lotCount: parseInt(row.lot_count),
      firstOpened: row.first_opened,
    }));
  }
}
