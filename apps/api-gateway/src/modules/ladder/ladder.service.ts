// ============================================================
// Ladder Markets — Service
// ============================================================
// Fetches child contracts, fits monotone curve, builds
// interval probabilities and synthetic trade legs.
// ============================================================

import { Injectable, NotFoundException } from '@nestjs/common';
import { Logger } from '@betting-exchange/shared-config';
import { DatabaseService } from '../../database/database.service';
import {
  fitMonotoneNonDecreasing,
  computeIntervalProbabilities,
  deriveRawYesPts,
  ptsToPercent,
  buildIntervalLabel,
} from './ladder.math';
import type {
  LadderPoint,
  LadderInterval,
  LadderResponse,
  IntervalLeg,
} from './ladder.types';

@Injectable()
export class LadderService {
  private readonly logger = new Logger('LadderService');

  constructor(private readonly db: DatabaseService) {}

  // ── GET /ladder/:groupSlug — full ladder with fitted curve ───────
  async getLadder(groupSlug: string): Promise<LadderResponse> {
    // 1. Fetch group metadata
    const groupResult = await this.db.query(
      `SELECT id, slug, title, group_type, event_key, category,
              description, resolution_source, oracle_spec
       FROM market_groups
       WHERE slug = $1`,
      [groupSlug],
    );
    if (!groupResult.rows.length) {
      throw new NotFoundException(`Ladder group not found: ${groupSlug}`);
    }
    const group = groupResult.rows[0];

    // 2. Fetch child maturity contracts with live orderbook data
    const marketsResult = await this.db.query(
      `SELECT
         m.id,
         m.name,
         m.maturity_date,
         m.instrument_symbol,
         m.sort_key,
         ob.best_bid_yes,
         ob.best_ask_yes,
         ob.oi_pence,
         tr.last_trade_yes,
         tr.volume_24h_pence
       FROM markets m
       LEFT JOIN LATERAL (
         SELECT
           MAX(limit_price_yes_pts) FILTER (WHERE side = 'BUY_YES')  AS best_bid_yes,
           MIN(limit_price_yes_pts) FILTER (WHERE side = 'SELL_YES') AS best_ask_yes,
           COALESCE(SUM(liability_pence), 0)                         AS oi_pence
         FROM orders
         WHERE market_id = m.id
           AND status IN ('OPEN', 'PARTIALLY_MATCHED')
       ) ob ON TRUE
       LEFT JOIN LATERAL (
         SELECT
           MAX(price_yes_pts) FILTER (WHERE rn = 1)     AS last_trade_yes,
           COALESCE(SUM(notional_pence) FILTER (
             WHERE executed_at >= NOW() - INTERVAL '24 hours'
           ), 0)                                         AS volume_24h_pence
         FROM (
           SELECT price_yes_pts, notional_pence, executed_at,
                  ROW_NUMBER() OVER (ORDER BY executed_at DESC) AS rn
           FROM trades
           WHERE market_id = m.id
         ) t
       ) tr ON TRUE
       WHERE m.market_group_id = $1
         AND m.status != 'SETTLED'
       ORDER BY m.maturity_date ASC, m.sort_key ASC`,
      [group.id],
    );

    if (marketsResult.rows.length === 0) {
      return {
        groupId: group.id,
        slug: group.slug,
        title: group.title,
        eventKey: group.event_key,
        category: group.category,
        description: group.description,
        resolutionSource: group.resolution_source,
        pointCount: 0,
        points: [],
        intervals: [],
      };
    }

    // 3. Derive raw YES values and build points array
    const rawPoints: { marketId: string; maturity: string; symbol: string | null;
                       rawYesPts: number | null; bestBid: number | null;
                       bestAsk: number | null; lastTrade: number | null;
                       oiPence: number; vol24h: number }[] = [];

    for (const m of marketsResult.rows) {
      const bid = m.best_bid_yes != null ? Number(m.best_bid_yes) : null;
      const ask = m.best_ask_yes != null ? Number(m.best_ask_yes) : null;
      const last = m.last_trade_yes != null ? Number(m.last_trade_yes) : null;

      rawPoints.push({
        marketId: m.id,
        maturity: m.maturity_date ? new Date(m.maturity_date).toISOString() : '',
        symbol: m.instrument_symbol,
        rawYesPts: deriveRawYesPts(bid, ask, last),
        bestBid: bid,
        bestAsk: ask,
        lastTrade: last,
        oiPence: Number(m.oi_pence || 0),
        vol24h: Number(m.volume_24h_pence || 0),
      });
    }

    // 4. Convert to percentage and check for monotonicity violations
    const rawPercents = rawPoints.map(p =>
      p.rawYesPts != null ? ptsToPercent(p.rawYesPts) : null,
    );

    // Fill nulls with linear interpolation or fallback
    const filledPercents = fillNulls(rawPercents);

    // 5. Fit monotone non-decreasing curve (PAVA)
    const fittedPercents = fitMonotoneNonDecreasing(filledPercents);

    // 6. Compute interval probabilities
    const intervalProbs = computeIntervalProbabilities(fittedPercents);

    // 7. Build LadderPoint[]
    const points: LadderPoint[] = rawPoints.map((p, i) => ({
      marketId: p.marketId,
      maturity: p.maturity,
      instrumentSymbol: p.symbol,
      rawYes: rawPercents[i],
      fittedYes: round2(fittedPercents[i]),
      intervalProb: round2(intervalProbs[i]),
      violated: i > 0 && rawPercents[i] != null && rawPercents[i - 1] != null
        && rawPercents[i]! < rawPercents[i - 1]!,
      bestBidYes: p.bestBid != null ? round2(ptsToPercent(p.bestBid)) : null,
      bestAskYes: p.bestAsk != null ? round2(ptsToPercent(p.bestAsk)) : null,
      lastTradeYes: p.lastTrade != null ? round2(ptsToPercent(p.lastTrade)) : null,
      openInterestPence: p.oiPence,
      volume24hPence: p.vol24h,
    }));

    // 8. Build LadderInterval[]
    const intervals: LadderInterval[] = points.map((pt, i) => {
      const startMat = i === 0 ? null : points[i - 1].maturity;
      const endMat = pt.maturity;

      const buyLegs: IntervalLeg[] = [];
      const sellLegs: IntervalLeg[] = [];

      if (i === 0) {
        // First interval = just buy/sell the first maturity
        buyLegs.push({ marketId: pt.marketId, side: 'BUY_YES', ratio: 1 });
        sellLegs.push({ marketId: pt.marketId, side: 'SELL_YES', ratio: 1 });
      } else {
        // Interval = long later maturity, short earlier maturity
        buyLegs.push({ marketId: pt.marketId, side: 'BUY_YES', ratio: 1 });
        buyLegs.push({ marketId: points[i - 1].marketId, side: 'SELL_YES', ratio: 1 });
        sellLegs.push({ marketId: pt.marketId, side: 'SELL_YES', ratio: 1 });
        sellLegs.push({ marketId: points[i - 1].marketId, side: 'BUY_YES', ratio: 1 });
      }

      return {
        startMaturity: startMat,
        endMaturity: endMat,
        label: buildIntervalLabel(startMat, endMat),
        price: round2(intervalProbs[i]),
        buyLegs,
        sellLegs,
      };
    });

    return {
      groupId: group.id,
      slug: group.slug,
      title: group.title,
      eventKey: group.event_key,
      category: group.category,
      description: group.description,
      resolutionSource: group.resolution_source,
      pointCount: points.length,
      points,
      intervals,
    };
  }

  // ── List all ladder groups ────────────────────────────────────
  async listGroups(): Promise<any[]> {
    const result = await this.db.query(
      `SELECT
         g.id, g.slug, g.title, g.group_type, g.event_key, g.category,
         g.description, g.resolution_source,
         COUNT(m.id)::int AS contract_count,
         MIN(m.maturity_date) AS first_maturity,
         MAX(m.maturity_date) AS last_maturity
       FROM market_groups g
       LEFT JOIN markets m ON m.market_group_id = g.id AND m.status != 'SETTLED'
       GROUP BY g.id
       ORDER BY g.created_at DESC`,
      [],
    );

    // Fetch subcategory breakdowns (condition_name) per group
    const subsResult = await this.db.query(
      `SELECT
         m.market_group_id,
         m.condition_name,
         COUNT(*)::int AS cnt,
         MIN(m.maturity_date) AS first_maturity,
         MAX(m.maturity_date) AS last_maturity,
         (array_agg(m.id ORDER BY m.maturity_date ASC))[1] AS first_market_id
       FROM markets m
       WHERE m.market_group_id IS NOT NULL
         AND m.status != 'SETTLED'
         AND m.condition_name IS NOT NULL
       GROUP BY m.market_group_id, m.condition_name
       ORDER BY m.condition_name ASC`,
      [],
    );

    const subsMap: Record<string, any[]> = {};
    for (const r of subsResult.rows) {
      const gid = r.market_group_id;
      if (!subsMap[gid]) subsMap[gid] = [];
      subsMap[gid].push({
        conditionName: r.condition_name,
        contractCount: r.cnt,
        firstMaturity: r.first_maturity ? new Date(r.first_maturity).toISOString() : null,
        lastMaturity: r.last_maturity ? new Date(r.last_maturity).toISOString() : null,
        firstMarketId: r.first_market_id,
      });
    }

    return result.rows.map(r => ({
      id: r.id,
      slug: r.slug,
      title: r.title,
      groupType: r.group_type,
      eventKey: r.event_key,
      category: r.category,
      description: r.description,
      resolutionSource: r.resolution_source,
      contractCount: r.contract_count,
      firstMaturity: r.first_maturity ? new Date(r.first_maturity).toISOString() : null,
      lastMaturity: r.last_maturity ? new Date(r.last_maturity).toISOString() : null,
      subcategories: subsMap[r.id] ?? [],
    }));
  }
}

// ── helpers ────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Fill null gaps in an array via linear interpolation */
function fillNulls(arr: (number | null)[]): number[] {
  const out: number[] = new Array(arr.length).fill(0);

  // Forward pass: find first non-null
  let firstNonNull = -1;
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] != null) { firstNonNull = i; break; }
  }
  if (firstNonNull === -1) {
    // All null — return zeros
    return out;
  }

  // Fill leading nulls with first value
  for (let i = 0; i <= firstNonNull; i++) {
    out[i] = arr[firstNonNull]!;
  }

  // Interpolate gaps
  let lastKnown = firstNonNull;
  for (let i = firstNonNull + 1; i < arr.length; i++) {
    if (arr[i] != null) {
      // Fill gap between lastKnown and i via linear interpolation
      const span = i - lastKnown;
      for (let j = lastKnown + 1; j < i; j++) {
        const t = (j - lastKnown) / span;
        out[j] = arr[lastKnown]! + t * (arr[i]! - arr[lastKnown]!);
      }
      out[i] = arr[i]!;
      lastKnown = i;
    }
  }

  // Fill trailing nulls with last known value
  for (let i = lastKnown + 1; i < arr.length; i++) {
    out[i] = arr[lastKnown]!;
  }

  return out;
}
