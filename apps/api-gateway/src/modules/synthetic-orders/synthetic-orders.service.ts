// ============================================================
// Synthetic Orders — Service
// ============================================================
// Quoting and sequential execution of interval spread orders.
//
// An interval BUY on the range (T_start, T_end] is:
//   Leg 1: BUY YES on T_end contract
//   Leg 2: SELL YES on T_start contract
//
// An interval SELL is the opposite.
// ============================================================

import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { Logger } from '@betting-exchange/shared-config';
import { DatabaseService } from '../../database/database.service';
import { RustExchangeService } from '../../services/rust-exchange.service';
import { LadderService } from '../ladder/ladder.service';
import { percentToPts } from '../ladder/ladder.math';
import type { IntervalQuoteResponse, IntervalExecutionResponse } from '../ladder/ladder.types';

const CONTRACT_SCALE_MICROS = 1_000_000;

interface IntervalOrderParams {
  groupSlug: string;
  userId: string;
  startMaturity: string | null;
  endMaturity: string;
  startMarketId?: string | null;
  endMarketId?: string | null;
  direction: 'BUY' | 'SELL';
  contracts: number;
}

type SyntheticType = 'interval' | 'hazard';

@Injectable()
export class SyntheticOrdersService {
  private readonly logger = new Logger('SyntheticOrdersService');

  constructor(
    private readonly db: DatabaseService,
    private readonly rustExchange: RustExchangeService,
    private readonly ladderService: LadderService,
  ) {}

  // ── Quote an interval order (no execution) ────────────────────
  async quoteIntervalOrder(params: IntervalOrderParams): Promise<IntervalQuoteResponse> {
    return this.quoteSyntheticOrder(params, 'interval');
  }

  async quoteHazardOrder(params: IntervalOrderParams): Promise<IntervalQuoteResponse> {
    return this.quoteSyntheticOrder(params, 'hazard');
  }

  private async quoteSyntheticOrder(
    params: IntervalOrderParams,
    syntheticType: SyntheticType,
  ): Promise<IntervalQuoteResponse> {
    const ladder = await this.ladderService.getLadder(params.groupSlug);

    // Find the matching interval. Prefer explicit market IDs so subcategory
    // terminals do not accidentally trade another condition with the same dates.
    const interval = this.resolveInterval(ladder, params);
    const legs = params.direction === 'BUY' ? interval.buyLegs : interval.sellLegs;

    const survivalAtStart = this.getSurvivalAtStart(ladder, interval.startMaturity, params.startMarketId);
    const exposureScale = syntheticType === 'hazard' ? 1 / survivalAtStart : 1;
    const underlyingContracts = params.contracts * exposureScale;
    const qtyMicros = Math.ceil(underlyingContracts * CONTRACT_SCALE_MICROS);
    const netPricePercent = syntheticType === 'hazard'
      ? Math.min(100, interval.price / survivalAtStart)
      : interval.price;

    // Build leg details with price info from ladder points
    const legDetails = legs.map(leg => {
      const point = ladder.points.find(p => p.marketId === leg.marketId);
      const limitPricePts = this.getLimitPrice(point, leg.side);
      const riskPence = this.estimateRisk(qtyMicros, limitPricePts, leg.side);

      return {
        marketId: leg.marketId,
        maturity: point?.maturity || '',
        side: leg.side,
        qtyMicros,
        limitPricePts,
        estimatedRiskPence: riskPence,
      };
    });

    const netDebit = legDetails.reduce((sum, l) => sum + l.estimatedRiskPence, 0);

    return {
      synthetic: true,
      syntheticType,
      intervalLabel: interval.label,
      netPricePercent: round2(netPricePercent),
      direction: params.direction,
      contracts: params.contracts,
      underlyingContracts: round4(underlyingContracts),
      netDebitPence: netDebit,
      legs: legDetails,
      warning: syntheticType === 'hazard'
        ? 'This hazard contract is executed as a survival-adjusted interval spread and may experience partial fill risk.'
        : 'This trade is executed as two linked orders and may experience partial fill risk.',
    };
  }

  // ── Execute an interval order (sequential 2-leg) ──────────────
  async executeIntervalOrder(params: IntervalOrderParams): Promise<IntervalExecutionResponse> {
    return this.executeSyntheticOrder(params, 'interval');
  }

  async executeHazardOrder(params: IntervalOrderParams): Promise<IntervalExecutionResponse> {
    return this.executeSyntheticOrder(params, 'hazard');
  }

  private async executeSyntheticOrder(
    params: IntervalOrderParams,
    syntheticType: SyntheticType,
  ): Promise<IntervalExecutionResponse> {
    // 1. Get the quote first
    const quote = syntheticType === 'hazard'
      ? await this.quoteHazardOrder(params)
      : await this.quoteIntervalOrder(params);

    // 2. Validate interval price is positive
    if (quote.netPricePercent <= 0) {
      throw new HttpException(
        'Interval price is zero or negative — trade not valid',
        HttpStatus.BAD_REQUEST,
      );
    }

    // 3. Create synthetic order record
    const syntheticOrderId = await this.createSyntheticOrder(params, quote, syntheticType);

    // 4. Execute legs sequentially
    const executedLegs: IntervalExecutionResponse['legs'] = [];
    let overallStatus: 'FILLED' | 'PARTIAL' | 'FAILED' = 'FILLED';

    for (let i = 0; i < quote.legs.length; i++) {
      const leg = quote.legs[i];
      try {
        // Submit to Rust engine
        const result = await this.rustExchange.submitOrder({
          marketId: leg.marketId,
          userId: params.userId,
          side: leg.side,
          riskPence: leg.estimatedRiskPence,
          limitYesPts: leg.limitPricePts,
          timeInForce: 'GTC',
        });

        // Record leg
        await this.updateLegStatus(syntheticOrderId, i, {
          engineOrderId: result.order_id,
          status: result.status === 'MATCHED' ? 'FILLED' : 'PARTIAL',
          filledQtyMicros: result.contracts_micros || 0,
        });

        executedLegs.push({
          ...leg,
          engineOrderId: result.order_id,
          fillStatus: result.status === 'MATCHED' ? 'FILLED' : 'PARTIAL',
          filledQtyMicros: result.contracts_micros || 0,
        });

        if (result.status !== 'MATCHED') {
          overallStatus = 'PARTIAL';
        }
      } catch (error) {
        this.logger.error(`Leg ${i + 1} failed for synthetic order ${syntheticOrderId}`, error);
        executedLegs.push({
          ...leg,
          engineOrderId: null,
          fillStatus: 'FAILED',
          filledQtyMicros: 0,
        });
        overallStatus = i === 0 ? 'FAILED' : 'PARTIAL';

        // If first leg failed, don't try second
        if (i === 0) break;
      }
    }

    // 5. Update synthetic order status
    await this.updateSyntheticOrderStatus(syntheticOrderId, overallStatus);

    return {
      ...quote,
      syntheticOrderId,
      status: overallStatus,
      legs: executedLegs,
    };
  }

  // ── private helpers ───────────────────────────────────────────

  private resolveInterval(ladder: any, params: IntervalOrderParams) {
    if (!params.endMarketId) {
      return this.findInterval(ladder, params.startMaturity, params.endMaturity);
    }

    const endPoint = ladder.points.find((p: any) => p.marketId === params.endMarketId);
    if (!endPoint) {
      throw new HttpException(
        `No matching end market found for ${params.endMarketId}`,
        HttpStatus.BAD_REQUEST,
      );
    }

    const startPoint = params.startMarketId
      ? ladder.points.find((p: any) => p.marketId === params.startMarketId)
      : null;

    if (params.startMarketId && !startPoint) {
      throw new HttpException(
        `No matching start market found for ${params.startMarketId}`,
        HttpStatus.BAD_REQUEST,
      );
    }

    const startMaturity = startPoint?.maturity ?? null;
    const endMaturity = endPoint.maturity;
    const fittedStart = startPoint ? Number(startPoint.fittedYes || 0) : 0;
    const fittedEnd = Number(endPoint.fittedYes || 0);
    const price = Math.max(0, fittedEnd - fittedStart);

    const buyLegs = startPoint
      ? [
          { marketId: endPoint.marketId, side: 'BUY_YES' as const, ratio: 1 },
          { marketId: startPoint.marketId, side: 'SELL_YES' as const, ratio: 1 },
        ]
      : [{ marketId: endPoint.marketId, side: 'BUY_YES' as const, ratio: 1 }];
    const sellLegs = startPoint
      ? [
          { marketId: endPoint.marketId, side: 'SELL_YES' as const, ratio: 1 },
          { marketId: startPoint.marketId, side: 'BUY_YES' as const, ratio: 1 },
        ]
      : [{ marketId: endPoint.marketId, side: 'SELL_YES' as const, ratio: 1 }];

    return {
      startMaturity,
      endMaturity,
      label: `${startMaturity || 'Start'} -> ${endMaturity}`,
      price,
      buyLegs,
      sellLegs,
    };
  }

  private findInterval(ladder: any, startMaturity: string | null, endMaturity: string) {
    const endDate = new Date(endMaturity).getTime();

    for (const interval of ladder.intervals) {
      const intEnd = new Date(interval.endMaturity).getTime();
      const intStart = interval.startMaturity ? new Date(interval.startMaturity).getTime() : null;

      // Match: same end maturity and compatible start
      if (Math.abs(intEnd - endDate) < 86_400_000) { // within a day tolerance
        if (!startMaturity && !intStart) return interval;
        if (startMaturity && intStart) {
          const startDate = new Date(startMaturity).getTime();
          if (Math.abs(intStart - startDate) < 86_400_000) return interval;
        }
      }
    }

    throw new HttpException(
      `No matching interval found for ${startMaturity || 'start'} → ${endMaturity}`,
      HttpStatus.BAD_REQUEST,
    );
  }

  private getLimitPrice(point: any, side: string): number {
    if (!point) return 5_000_000; // 50% fallback
    // Use best bid for sells, best ask for buys
    if (side === 'BUY_YES') {
      return point.bestAskYes != null
        ? percentToPts(point.bestAskYes)
        : percentToPts(point.fittedYes);
    } else {
      return point.bestBidYes != null
        ? percentToPts(point.bestBidYes)
        : percentToPts(point.fittedYes);
    }
  }

  private estimateRisk(qtyMicros: number, pricePts: number, side: string): number {
    const PRICE_SCALE = 10_000_000;
    const PAYOUT_PENCE = 100;
    if (side === 'BUY_YES') {
      return Math.ceil((qtyMicros * pricePts * PAYOUT_PENCE) / (PRICE_SCALE * CONTRACT_SCALE_MICROS));
    } else {
      const noPts = PRICE_SCALE - pricePts;
      return Math.ceil((qtyMicros * noPts * PAYOUT_PENCE) / (PRICE_SCALE * CONTRACT_SCALE_MICROS));
    }
  }

  private getSurvivalAtStart(ladder: any, startMaturity: string | null, startMarketId?: string | null): number {
    if (!startMaturity) return 1;

    if (startMarketId) {
      const point = ladder.points.find((p: any) => p.marketId === startMarketId);
      if (!point) {
        throw new HttpException(
          `No start market found for hazard contract: ${startMarketId}`,
          HttpStatus.BAD_REQUEST,
        );
      }
      return this.requirePositiveSurvival(point.fittedYes);
    }

    const startDate = new Date(startMaturity).getTime();
    const point = ladder.points.find((p: any) => {
      const maturityDate = new Date(p.maturity).getTime();
      return Math.abs(maturityDate - startDate) < 86_400_000;
    });

    if (!point) {
      throw new HttpException(
        `No start maturity found for hazard contract: ${startMaturity}`,
        HttpStatus.BAD_REQUEST,
      );
    }

    return this.requirePositiveSurvival(point.fittedYes);
  }

  private requirePositiveSurvival(fittedYes: number): number {
    const survival = (100 - Number(fittedYes || 0)) / 100;
    if (survival <= 0.0001) {
      throw new HttpException(
        'Hazard contract is not valid because survival at the interval start is zero',
        HttpStatus.BAD_REQUEST,
      );
    }

    return survival;
  }

  private async createSyntheticOrder(
    params: IntervalOrderParams,
    quote: IntervalQuoteResponse,
    syntheticType: SyntheticType,
  ): Promise<string> {
    const result = await this.db.query(
      `INSERT INTO synthetic_orders
         (user_id, market_group_id, synthetic_type, direction,
          start_maturity, end_maturity, requested_qty_micros,
          net_price_pts, status)
       SELECT
         $1::uuid, g.id, $8, $3,
         $4::timestamptz, $5::timestamptz,
         $6::bigint, $7::integer, 'PENDING'
       FROM market_groups g WHERE g.slug = $2
       RETURNING id`,
      [
        params.userId,
        params.groupSlug,
        params.direction,
        params.startMaturity,
        params.endMaturity,
        Math.ceil((quote.underlyingContracts || params.contracts) * CONTRACT_SCALE_MICROS),
        Math.round(quote.netPricePercent * 100_000),
        syntheticType,
      ],
    );
    const syntheticId = result.rows[0].id;

    // Insert leg records
    for (let i = 0; i < quote.legs.length; i++) {
      const leg = quote.legs[i];
      await this.db.query(
        `INSERT INTO synthetic_order_legs
           (synthetic_order_id, leg_index, market_id, side,
            qty_micros, limit_price_pts, status)
         VALUES ($1, $2, $3::uuid, $4, $5, $6, 'PENDING')`,
        [syntheticId, i, leg.marketId, leg.side, leg.qtyMicros, leg.limitPricePts],
      );
    }

    return syntheticId;
  }

  private async updateLegStatus(
    syntheticOrderId: string,
    legIndex: number,
    update: { engineOrderId: string; status: string; filledQtyMicros: number },
  ) {
    await this.db.query(
      `UPDATE synthetic_order_legs
         SET engine_order_id = $3::uuid,
             status = $4,
             filled_qty_micros = $5,
             updated_at = NOW()
       WHERE synthetic_order_id = $1 AND leg_index = $2`,
      [syntheticOrderId, legIndex, update.engineOrderId, update.status, update.filledQtyMicros],
    );
  }

  private async updateSyntheticOrderStatus(syntheticOrderId: string, status: string) {
    await this.db.query(
      `UPDATE synthetic_orders SET status = $2, updated_at = NOW() WHERE id = $1`,
      [syntheticOrderId, status],
    );
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}
