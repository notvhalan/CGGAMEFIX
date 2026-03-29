// ============================================================
// Ladder Markets — Settlement Resolver
// ============================================================
// When an event is recorded (e.g. "earthquake occurred on 15 Mar"),
// walks every child maturity and resolves as:
//   YES  — if event occurred AND occurred_at <= maturity_date
//   NO   — otherwise
// Settlement per-market re-uses the exact same flows as the
// existing AdminController.resolveMarket (cancel open orders,
// settle position lots, credit / debit wallets, record into
// market_settlements + user_settlements).
// ============================================================

import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { Logger } from '@betting-exchange/shared-config';
import { DatabaseService } from '../../database/database.service';
import { RustExchangeService } from '../../services/rust-exchange.service';

@Injectable()
export class LadderSettlementService {
  private readonly logger = new Logger('LadderSettlementService');

  constructor(
    private readonly db: DatabaseService,
    private readonly rustExchange: RustExchangeService,
  ) {}

  // ── Record event resolution + cascade settle ──────────────

  /**
   * Record that the underlying event occurred (or didn't) and
   * settle every child maturity in the group.
   */
  async resolveEvent(params: {
    groupSlug: string;
    occurred: boolean;
    occurredAt: string | null;       // ISO timestamp, required if occurred=true
    source: string;
    sourceUrl?: string;
    notes?: string;
    resolvedByUserId: string;
  }) {
    // 1. Fetch group
    const groupRes = await this.db.query(
      `SELECT id, event_key, title FROM market_groups WHERE slug = $1`,
      [params.groupSlug],
    );
    if (!groupRes.rows.length) {
      throw new HttpException(`Ladder group not found: ${params.groupSlug}`, HttpStatus.NOT_FOUND);
    }
    const group = groupRes.rows[0];

    if (params.occurred && !params.occurredAt) {
      throw new HttpException('occurredAt is required when occurred=true', HttpStatus.BAD_REQUEST);
    }

    // 2. Upsert event_resolutions row
    await this.db.query(
      `INSERT INTO event_resolutions
         (event_key, occurred, occurred_at, source, source_url, notes, resolved_by, resolved_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7::uuid, NOW())
       ON CONFLICT (event_key) DO UPDATE SET
         occurred    = EXCLUDED.occurred,
         occurred_at = EXCLUDED.occurred_at,
         source      = EXCLUDED.source,
         source_url  = EXCLUDED.source_url,
         notes       = EXCLUDED.notes,
         resolved_by = EXCLUDED.resolved_by,
         resolved_at = NOW()`,
      [
        group.event_key,
        params.occurred,
        params.occurredAt || null,
        params.source,
        params.sourceUrl || null,
        params.notes || null,
        params.resolvedByUserId,
      ],
    );

    // 3. Fetch all unsettled child markets in maturity order
    const marketsRes = await this.db.query(
      `SELECT id, name, maturity_date, status
       FROM markets
       WHERE market_group_id = $1
         AND status NOT IN ('SETTLED', 'VOIDED')
       ORDER BY maturity_date ASC`,
      [group.id],
    );

    this.logger.info(
      `Resolving event '${group.event_key}' (occurred=${params.occurred}` +
      `${params.occurredAt ? ', at=' + params.occurredAt : ''}) — ` +
      `${marketsRes.rows.length} markets to settle`,
    );

    const occurredAtTs = params.occurredAt ? new Date(params.occurredAt).getTime() : null;

    const results: {
      marketId: string;
      name: string;
      outcome: 'YES' | 'NO';
      positionsSettled: number;
      ordersCancelled: number;
    }[] = [];

    // 4. Settle each market
    for (const market of marketsRes.rows) {
      const maturityTs = market.maturity_date
        ? new Date(market.maturity_date).getTime()
        : null;

      // Determine outcome:
      //   YES if event occurred AND occurred_at <= maturity_date
      //   NO  otherwise
      let outcome: 'YES' | 'NO' = 'NO';
      if (params.occurred && occurredAtTs != null && maturityTs != null) {
        outcome = occurredAtTs <= maturityTs ? 'YES' : 'NO';
      }

      try {
        const r = await this.settleOneMarket(
          market.id,
          outcome,
          params.resolvedByUserId,
          `Ladder event resolution: ${params.source}`,
        );
        results.push({
          marketId: market.id,
          name: market.name,
          outcome,
          positionsSettled: r.positionsSettled,
          ordersCancelled: r.ordersCancelled,
        });
      } catch (err) {
        this.logger.error(`Failed to settle market ${market.id} (${market.name})`, err);
        results.push({
          marketId: market.id,
          name: market.name,
          outcome,
          positionsSettled: 0,
          ordersCancelled: 0,
        });
      }
    }

    return {
      groupSlug: params.groupSlug,
      eventKey: group.event_key,
      occurred: params.occurred,
      occurredAt: params.occurredAt || null,
      marketsSettled: results.length,
      results,
    };
  }

  // ── Private: settle a single child market ──────────────────

  /**
   * Identical logic to AdminController.resolveMarket but
   * extracted so it can be called per-child from the cascade.
   */
  private async settleOneMarket(
    marketId: string,
    winningOutcome: 'YES' | 'NO',
    resolvedByUserId: string,
    reason: string,
  ): Promise<{ positionsSettled: number; ordersCancelled: number }> {
    // 1. Cancel open orders via Rust engine
    const openOrdersRes = await this.db.query<{ id: string; user_id: string }>(
      `SELECT id, user_id FROM orders
       WHERE market_id = $1 AND status IN ('OPEN', 'PARTIALLY_MATCHED')`,
      [marketId],
    );
    const openOrderIds = openOrdersRes.rows.map(r => r.id);

    if (openOrdersRes.rows.length > 0) {
      const cancelResults = await Promise.allSettled(
        openOrdersRes.rows.map(order =>
          this.rustExchange.cancelOrder({ orderId: order.id, userId: order.user_id }),
        ),
      );
      const failedCancels = cancelResults.filter(r => r.status === 'rejected');
      if (failedCancels.length > 0) {
        this.logger.warn(`${failedCancels.length} orders failed to cancel on market ${marketId}`);
      }
      // Brief wait for engine to process cancellations
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    const cancelledRes = await this.db.query<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt FROM orders
       WHERE id = ANY($1::uuid[]) AND status = 'CANCELLED'`,
      [openOrderIds],
    );
    const cancelledCount = Number(cancelledRes.rows[0]?.cnt || '0');

    // 2. Set market status to SETTLED
    await this.db.query(
      `UPDATE markets
       SET status = 'SETTLED', settlement_time = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [marketId],
    );

    // 3. Process position lots
    const lotsRes = await this.db.query(
      `SELECT lot_id, user_id, market_id, side, entry_price_yes_pts, qty_remaining_micros
       FROM position_lots
       WHERE market_id = $1 AND qty_remaining_micros > 0`,
      [marketId],
    );

    const CONTRACT_SCALE = 1_000_000n;
    const CONTRACT_PAYOUT_PENCE = 100n;
    const PRICE_SCALE = 10_000_000n;

    let totalPayoutGbp = 0;
    let winnersCount = 0;
    let losersCount = 0;
    const userSettlements: any[] = [];

    for (const lot of lotsRes.rows) {
      const isBuyYes = lot.side === 'BUY_YES' || lot.side === 'FOR';
      const isWinner =
        (winningOutcome === 'YES' && isBuyYes) ||
        (winningOutcome === 'NO' && !isBuyYes);

      const qtyMicros = BigInt(lot.qty_remaining_micros);
      const entryYesPts = BigInt(lot.entry_price_yes_pts);

      let lockedPence: bigint;
      if (isBuyYes) {
        lockedPence = (qtyMicros * entryYesPts * CONTRACT_PAYOUT_PENCE) / (PRICE_SCALE * CONTRACT_SCALE);
      } else {
        const noPts = PRICE_SCALE - entryYesPts;
        lockedPence = (qtyMicros * noPts * CONTRACT_PAYOUT_PENCE) / (PRICE_SCALE * CONTRACT_SCALE);
      }

      const totalPayoutPence = (qtyMicros * CONTRACT_PAYOUT_PENCE) / CONTRACT_SCALE;

      if (isWinner) {
        const payoutAmount = Number(totalPayoutPence);
        const lockedAmount = Number(lockedPence);
        const profitPence = payoutAmount - lockedAmount;

        winnersCount++;
        totalPayoutGbp += payoutAmount / 100;

        await this.db.query(
          `UPDATE wallets
           SET locked_balance = locked_balance - $1,
               balance = balance + $2,
               updated_at = NOW()
           WHERE user_id = $3 AND currency = 'GBP'`,
          [lockedAmount / 100, payoutAmount / 100, lot.user_id],
        );

        userSettlements.push({
          userId: lot.user_id,
          marketId: lot.market_id,
          positionSide: lot.side,
          contractsSettled: lot.qty_remaining_micros,
          entryPriceYesPts: lot.entry_price_yes_pts,
          isWinner: true,
          payoutGbp: payoutAmount / 100,
          profitLossGbp: profitPence / 100,
        });
      } else {
        const lockedAmount = Number(lockedPence);
        losersCount++;

        await this.db.query(
          `UPDATE wallets
           SET locked_balance = locked_balance - $1,
               updated_at = NOW()
           WHERE user_id = $2 AND currency = 'GBP'`,
          [lockedAmount / 100, lot.user_id],
        );

        userSettlements.push({
          userId: lot.user_id,
          marketId: lot.market_id,
          positionSide: lot.side,
          contractsSettled: lot.qty_remaining_micros,
          entryPriceYesPts: lot.entry_price_yes_pts,
          isWinner: false,
          payoutGbp: 0,
          profitLossGbp: -(lockedAmount / 100),
        });
      }
    }

    // 4. Market settlement record
    const settlementRes = await this.db.query(
      `INSERT INTO market_settlements
         (market_id, resolved_by_user_id, winning_outcome, settlement_reason,
          positions_settled, orders_cancelled, total_payout_gbp, winners_count, losers_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        marketId, resolvedByUserId, winningOutcome, reason,
        lotsRes.rows.length, cancelledCount, totalPayoutGbp,
        winnersCount, losersCount,
      ],
    );
    const settlementId = settlementRes.rows[0].id;

    // 5. User settlement records
    for (const us of userSettlements) {
      await this.db.query(
        `INSERT INTO user_settlements
           (settlement_id, user_id, market_id, position_side, contracts_settled,
            entry_price_yes_pts, is_winner, payout_gbp, profit_loss_gbp)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          settlementId, us.userId, us.marketId, us.positionSide,
          us.contractsSettled, us.entryPriceYesPts, us.isWinner,
          us.payoutGbp, us.profitLossGbp,
        ],
      );
    }

    // 6. Close position lots
    await this.db.query(
      `UPDATE position_lots
       SET qty_remaining_micros = 0, updated_at = NOW()
       WHERE market_id = $1 AND qty_remaining_micros > 0`,
      [marketId],
    );

    // 7. Clear positions
    await this.db.query(
      `UPDATE positions
       SET net_qty_micros = 0, updated_at = NOW()
       WHERE market_id = $1 AND net_qty_micros <> 0`,
      [marketId],
    );

    this.logger.info(
      `Settled market ${marketId}: ${winningOutcome}, ` +
      `${lotsRes.rows.length} lots, ${cancelledCount} cancelled, ` +
      `${winnersCount}W/${losersCount}L`,
    );

    return { positionsSettled: lotsRes.rows.length, ordersCancelled: cancelledCount };
  }
}
