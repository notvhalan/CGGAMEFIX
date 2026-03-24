import { Controller, Get, Param } from '@nestjs/common';
import { Logger } from '@betting-exchange/shared-config';
import { DatabaseService } from '../database/database.service';

@Controller('v1/insurance')
export class InsuranceController {
  private readonly logger = new Logger('InsuranceController');

  constructor(private readonly db: DatabaseService) {}

  // ── GET /v1/insurance/categories ─────────────────────────────
  @Get('categories')
  async listCategories() {
    const result = await this.db.query(
      `SELECT
         slug, icon, title, description, question_template, condition_name,
         settlement_source, oracle, base_yes_pts, max_yes_pts, curve_shape,
         tags, active
       FROM insurance_categories
       WHERE active = TRUE
       ORDER BY slug`,
      [],
    );

    // Attach contract count per category from live markets
    const counts = await this.db.query(
      `SELECT insurance_category AS slug, COUNT(*) AS contract_count
       FROM markets
       WHERE market_category = 'INSURANCE' AND insurance_category IS NOT NULL
       GROUP BY insurance_category`,
      [],
    );
    const countMap: Record<string, number> = {};
    for (const r of counts.rows) countMap[r.slug] = Number(r.contract_count);

    return {
      categories: result.rows.map((c) => ({
        ...c,
        base_yes_pts: Number(c.base_yes_pts),
        max_yes_pts:  Number(c.max_yes_pts),
        contractCount: countMap[c.slug] ?? 0,
      })),
    };
  }

  // ── GET /v1/insurance/categories/:slug ───────────────────────
  @Get('categories/:slug')
  async getCategory(@Param('slug') slug: string) {
    // 1. Category metadata
    const catResult = await this.db.query(
      `SELECT slug, icon, title, description, question_template, condition_name,
              settlement_source, oracle, base_yes_pts, max_yes_pts, curve_shape, tags
       FROM insurance_categories
       WHERE slug = $1 AND active = TRUE`,
      [slug],
    );
    if (!catResult.rows.length) {
      return { error: 'Category not found', slug };
    }
    const category = catResult.rows[0];

    // 2. Markets with their best YES / NO prices from the live orderbook
    //    Uses LATERAL joins instead of 5 correlated subqueries per row (5N → 2N)
    const marketsResult = await this.db.query(
      `SELECT
         m.id,
         m.name,
         m.question,
         m.condition_name,
         m.maturity_date,
         m.settlement_source,
         m.oracle,
         m.tags,
         m.base_yes_pts,
         m.status,
         m.sort_order,
         ob.best_bid_yes,
         ob.best_ask_yes,
         ob.oi_pence,
         tr.last_trade_yes,
         tr.volume_24h_pence
       FROM markets m
       -- Single pass over orders for best bid, best ask, and OI
       LEFT JOIN LATERAL (
         SELECT
           MAX(limit_price_yes_pts) FILTER (WHERE side = 'BUY_YES')  AS best_bid_yes,
           MIN(limit_price_yes_pts) FILTER (WHERE side = 'SELL_YES') AS best_ask_yes,
           COALESCE(SUM(liability_pence), 0)                         AS oi_pence
         FROM orders
         WHERE market_id = m.id
           AND status IN ('OPEN', 'PARTIALLY_MATCHED')
       ) ob ON TRUE
       -- Single pass over trades for last price and 24 h volume
       LEFT JOIN LATERAL (
         SELECT
           MAX(price_yes_pts) FILTER (WHERE rn = 1)                                              AS last_trade_yes,
           COALESCE(SUM(notional_pence) FILTER (WHERE executed_at >= NOW() - INTERVAL '24 hours'), 0) AS volume_24h_pence
         FROM (
           SELECT price_yes_pts, notional_pence, executed_at,
                  ROW_NUMBER() OVER (ORDER BY executed_at DESC) AS rn
           FROM trades
           WHERE market_id = m.id
         ) t
       ) tr ON TRUE
       WHERE m.market_category = 'INSURANCE'
         AND m.insurance_category = $1
         AND m.status != 'SETTLED'
       ORDER BY m.maturity_date ASC NULLS LAST, m.sort_order ASC`,
      [slug],
    );

    const contracts = marketsResult.rows.map((m) => {
      // limit_price_yes_pts is stored in micro-units (0–10 000 000 = 0–100 ¢).
      // Divide by 100 000 to get the 0–100 cents scale used everywhere else.
      const normalize = (v: number | null) => v != null ? v / 100_000 : null;

      const bestBid  = normalize(m.best_bid_yes  != null ? Number(m.best_bid_yes)  : null);
      const bestAsk  = normalize(m.best_ask_yes  != null ? Number(m.best_ask_yes)  : null);
      const lastTrade= normalize(m.last_trade_yes != null ? Number(m.last_trade_yes): null);

      // Derive displayed YES price: mid > last trade > base_yes_pts from market > category base
      let yesPts: number;
      if (bestBid != null && bestAsk != null) {
        yesPts = Math.round((bestBid + bestAsk) / 2);
      } else if (bestBid != null) {
        yesPts = Math.round(bestBid);
      } else if (lastTrade != null) {
        yesPts = Math.round(lastTrade);
      } else if (m.base_yes_pts != null) {
        yesPts = Number(m.base_yes_pts);
      } else {
        yesPts = Number(category.base_yes_pts);
      }
      yesPts = Math.min(99, Math.max(1, yesPts));

      return {
        marketId:       m.id,
        name:           m.name,
        question:       m.question ?? null,
        conditionName:  m.condition_name ?? category.condition_name,
        maturityDate:   m.maturity_date ? new Date(m.maturity_date).toISOString() : null,
        settlementSource: m.settlement_source ?? category.settlement_source,
        oracle:         m.oracle ?? category.oracle,
        tags:           m.tags ?? [],
        status:         m.status,
        yesPts,
        noPts:          100 - yesPts,
        spread:         bestBid != null && bestAsk != null ? Math.round(bestAsk - bestBid) : null,
        bestBidYes:     bestBid != null ? Math.round(bestBid) : null,
        bestAskYes:     bestAsk != null ? Math.round(bestAsk) : null,
        lastTradeYes:   lastTrade,
        volume24hPence: Number(m.volume_24h_pence),
        oiPence:        Number(m.oi_pence),
      };
    });

    return {
      category: {
        slug:             category.slug,
        icon:             category.icon,
        title:            category.title,
        description:      category.description,
        questionTemplate: category.question_template,
        conditionName:    category.condition_name,
        settlementSource: category.settlement_source,
        oracle:           category.oracle,
        baseYesPts:       Number(category.base_yes_pts),
        maxYesPts:        Number(category.max_yes_pts),
        curveShape:       category.curve_shape,
        tags:             category.tags,
      },
      contracts,
    };
  }
}
