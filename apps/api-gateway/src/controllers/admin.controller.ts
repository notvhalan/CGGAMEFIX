import { Controller, Post, Get, Body, Req, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { Logger } from '@betting-exchange/shared-config';
import { FastifyRequest } from 'fastify';
import { LiquidityBotsService } from '../services/liquidity-bots.service';
import { DatabaseService } from '../database/database.service';
import { NatsClient } from '../nats/nats.client';
import { NATS_SUBJECTS } from '../nats/subjects';
import { RustExchangeService } from '../services/rust-exchange.service';

@Controller('v1/admin')
export class AdminController {
  private readonly logger = new Logger('AdminController');
  private adminTablesReady = false;
  
  // Admin email whitelist
  private readonly ADMIN_EMAILS = [
    'vhalan02@gmail.com',
    'developer@gmail.com',
  ];

  constructor(
    private readonly liquidityBotsService: LiquidityBotsService,
    private readonly databaseService: DatabaseService,
    private readonly natsClient: NatsClient,
    private readonly rustExchange: RustExchangeService,
  ) {}
  
  /**
   * Check if the current user is an admin
   */
  private async checkAdminAccess(userId: string): Promise<void> {
    const user = await this.databaseService.findUserById(userId);
    
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    
    if (!this.ADMIN_EMAILS.includes(user.email)) {
      this.logger.warn(`Unauthorized admin access attempt by ${user.email} (${userId})`);
      throw new ForbiddenException('Admin access denied');
    }
    
    this.logger.info(`Admin access granted to ${user.email}`);
  }

  private async ensureAdminTables(): Promise<void> {
    if (this.adminTablesReady) return;

    await this.databaseService.query(`
      CREATE TABLE IF NOT EXISTS admin_audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        admin_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        admin_email VARCHAR(255),
        action_type VARCHAR(80) NOT NULL,
        target TEXT,
        summary TEXT NOT NULL,
        result VARCHAR(20) NOT NULL DEFAULT 'success',
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at ON admin_audit_logs(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_action_type ON admin_audit_logs(action_type);

      CREATE TABLE IF NOT EXISTS admin_risk_settings (
        id VARCHAR(80) PRIMARY KEY,
        category VARCHAR(80) NOT NULL,
        label VARCHAR(120) NOT NULL,
        description TEXT,
        current_value NUMERIC NOT NULL,
        unit VARCHAR(40) NOT NULL,
        min_value NUMERIC NOT NULL,
        max_value NUMERIC NOT NULL,
        step_value NUMERIC NOT NULL,
        severity VARCHAR(20) NOT NULL,
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        updated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    this.adminTablesReady = true;
  }

  private defaultRiskSettings() {
    return [
      { id: 'max-order-size', label: 'Max Order Size', description: 'Maximum single order quantity', category: 'Orders', currentValue: 10000, unit: 'contracts', min: 100, max: 100000, step: 100, severity: 'high', enabled: true },
      { id: 'max-position-size', label: 'Max Position Size', description: 'Maximum net position per user per market', category: 'Positions', currentValue: 50000, unit: 'contracts', min: 1000, max: 500000, step: 1000, severity: 'high', enabled: true },
      { id: 'max-open-orders', label: 'Max Open Orders', description: 'Maximum open orders per user', category: 'Orders', currentValue: 200, unit: 'orders', min: 10, max: 1000, step: 10, severity: 'medium', enabled: true },
      { id: 'spread-alert-threshold', label: 'Spread Alert Threshold', description: 'Alert when spread exceeds this percentage', category: 'Market Quality', currentValue: 10, unit: '%', min: 1, max: 50, step: 1, severity: 'medium', enabled: true },
      { id: 'min-liquidity-warning', label: 'Min Liquidity Warning', description: 'Warn when market liquidity drops below this', category: 'Market Quality', currentValue: 5000, unit: 'GBP', min: 100, max: 100000, step: 500, severity: 'low', enabled: true },
      { id: 'bot-max-orders-per-min', label: 'Bot Max Orders/Min', description: 'Rate limit for bot order placement', category: 'Bots', currentValue: 60, unit: 'orders/min', min: 5, max: 500, step: 5, severity: 'medium', enabled: true },
      { id: 'settlement-timeout', label: 'Settlement Timeout', description: 'Maximum time for settlement processing', category: 'Settlement', currentValue: 300, unit: 'seconds', min: 30, max: 3600, step: 30, severity: 'high', enabled: true },
      { id: 'max-daily-trades', label: 'Max Daily Trades', description: 'Circuit breaker: max trades per market per day', category: 'Circuit Breakers', currentValue: 50000, unit: 'trades', min: 1000, max: 500000, step: 1000, severity: 'high', enabled: true },
    ];
  }

  private async getAdminUser(userId: string) {
    const user = await this.databaseService.findUserById(userId);
    if (!user) throw new UnauthorizedException('User not found');
    return user;
  }

  private async logAdminAction(
    userId: string,
    actionType: string,
    target: string,
    summary: string,
    result: 'success' | 'failed' = 'success',
    metadata: Record<string, any> = {},
  ): Promise<void> {
    try {
      await this.ensureAdminTables();
      const user = await this.getAdminUser(userId);
      await this.databaseService.query(
        `INSERT INTO admin_audit_logs
          (admin_user_id, admin_email, action_type, target, summary, result, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
        [userId, user.email, actionType, target, summary, result, JSON.stringify(metadata)],
      );
    } catch (error) {
      this.logger.warn('Failed to write admin audit log', error);
    }
  }

  private async getAdminMarkets() {
    const result = await this.databaseService.query(`
      WITH order_stats AS (
        SELECT
          market_id,
          COUNT(*) FILTER (WHERE status IN ('OPEN', 'PARTIALLY_MATCHED'))::int AS open_orders,
          COALESCE(SUM(qty_remaining_micros) FILTER (WHERE status IN ('OPEN', 'PARTIALLY_MATCHED')), 0)::text AS liquidity_micros,
          MAX(limit_price_yes_pts) FILTER (WHERE status IN ('OPEN', 'PARTIALLY_MATCHED') AND side IN ('BUY_YES', 'FOR')) AS best_bid_yes,
          MIN(limit_price_yes_pts) FILTER (WHERE status IN ('OPEN', 'PARTIALLY_MATCHED') AND side IN ('SELL_YES', 'LAY')) AS best_ask_yes
        FROM orders
        GROUP BY market_id
      ),
      trade_stats AS (
        SELECT
          market_id,
          COALESCE(SUM(notional_pence) FILTER (WHERE executed_at >= NOW() - INTERVAL '24 hours'), 0)::bigint AS volume_24h_pence,
          COUNT(*) FILTER (WHERE executed_at >= NOW() - INTERVAL '24 hours')::int AS trades_24h,
          MAX(executed_at) AS last_trade
        FROM trades
        GROUP BY market_id
      )
      SELECT
        m.id,
        m.name,
        m.description,
        LOWER(m.status) AS status,
        COALESCE(m.market_category, 'General') AS category,
        COALESCE(m.insurance_category, m.condition_name, '') AS subcategory,
        m.question,
        m.maturity_date AS "maturityDate",
        m.created_at AS "createdAt",
        m.updated_at AS "updatedAt",
        COALESCE(os.open_orders, 0) AS "openOrders",
        COALESCE(os.liquidity_micros, '0') AS "liquidityMicros",
        COALESCE(ts.volume_24h_pence, 0) AS "volume24hPence",
        COALESCE(ts.trades_24h, 0) AS "trades24h",
        ts.last_trade AS "lastTrade",
        os.best_bid_yes AS "bestBidYes",
        os.best_ask_yes AS "bestAskYes",
        CASE
          WHEN os.best_bid_yes IS NOT NULL AND os.best_ask_yes IS NOT NULL THEN (os.best_bid_yes + os.best_ask_yes) / 2.0
          ELSE COALESCE(m.base_yes_pts, 5000000)
        END AS "midYesPts",
        CASE
          WHEN os.best_bid_yes IS NOT NULL AND os.best_ask_yes IS NOT NULL THEN GREATEST(os.best_ask_yes - os.best_bid_yes, 0)
          ELSE NULL
        END AS "spreadPts"
      FROM markets m
      LEFT JOIN order_stats os ON os.market_id = m.id
      LEFT JOIN trade_stats ts ON ts.market_id = m.id
      ORDER BY m.created_at DESC
      LIMIT 500
    `);
    return result.rows.map((row: any) => ({
      ...row,
      id: String(row.id),
      volume24h: Number(row.volume24hPence || 0) / 100,
      liquidity: Number(BigInt(row.liquidityMicros || '0')) / 1_000_000,
      midPrice: Number(row.midYesPts || 0) / 10_000_000,
      spread: row.spreadPts == null ? 0 : Number(row.spreadPts) / 10_000_000,
      botActivity: Number(row.openOrders || 0) > 50 ? 'high' : Number(row.openOrders || 0) > 10 ? 'medium' : Number(row.openOrders || 0) > 0 ? 'low' : 'none',
    }));
  }

  private async getAdminOrdersAndTrades() {
    const ordersResult = await this.databaseService.query(`
      SELECT
        o.id,
        o.market_id AS "marketId",
        COALESCE(m.name, o.market_id::text) AS "marketName",
        o.user_id AS "userId",
        COALESCE(u.email, o.user_id::text) AS "userEmail",
        o.side,
        o.limit_price_yes_pts AS "yesPts",
        o.qty_original_micros AS "originalContracts",
        o.qty_remaining_micros AS "remainingContracts",
        o.status,
        o.time_in_force AS "timeInForce",
        o.created_at AS "createdAt",
        o.updated_at AS "updatedAt"
      FROM orders o
      LEFT JOIN users u ON u.id = o.user_id
      LEFT JOIN markets m ON m.id = o.market_id
      ORDER BY o.created_at DESC
      LIMIT 500
    `);

    const tradesResult = await this.databaseService.query(`
      SELECT
        t.id,
        t.market_id AS "marketId",
        COALESCE(m.name, t.market_id::text) AS "marketName",
        t.price_yes_pts AS "yesPts",
        t.qty_micros AS "contractsMicros",
        t.notional_pence AS "notionalPence",
        t.maker_user_id AS "makerUserId",
        COALESCE(maker.email, t.maker_user_id::text) AS "makerEmail",
        t.taker_user_id AS "takerUserId",
        COALESCE(taker.email, t.taker_user_id::text) AS "takerEmail",
        t.side,
        t.executed_at AS "executedAt"
      FROM trades t
      LEFT JOIN markets m ON m.id = t.market_id
      LEFT JOIN users maker ON maker.id = t.maker_user_id
      LEFT JOIN users taker ON taker.id = t.taker_user_id
      ORDER BY t.executed_at DESC
      LIMIT 500
    `);

    return {
      orders: ordersResult.rows.map((row: any) => {
        const original = Number(BigInt(row.originalContracts || '0')) / 1_000_000;
        const remaining = Number(BigInt(row.remainingContracts || '0')) / 1_000_000;
        return {
          ...row,
          price: Number(row.yesPts || 0) / 10_000_000,
          quantity: original,
          filled: Math.max(original - remaining, 0),
          status: String(row.status || '').toLowerCase().replace('partially_matched', 'partial').replace('matched', 'filled'),
          isBot: String(row.userEmail || '').endsWith('@bot.local'),
        };
      }),
      trades: tradesResult.rows.map((row: any) => ({
        ...row,
        price: Number(row.yesPts || 0) / 10_000_000,
        quantity: Number(BigInt(row.contractsMicros || '0')) / 1_000_000,
        notional: Number(row.notionalPence || 0) / 100,
        buyerEmail: row.side === 'BUY_YES' || row.side === 'FOR' ? row.takerEmail : row.makerEmail,
        sellerEmail: row.side === 'SELL_YES' || row.side === 'LAY' ? row.takerEmail : row.makerEmail,
        timestamp: row.executedAt,
        isBot: String(row.makerEmail || '').endsWith('@bot.local') || String(row.takerEmail || '').endsWith('@bot.local'),
      })),
    };
  }

  private async getAdminUsers() {
    const result = await this.databaseService.query(`
      SELECT
        u.id,
        u.email,
        u.name,
        u.created_at AS "createdAt",
        COALESCE(o.orders_10m, 0)::int AS "ordersLast10m",
        COALESCE(t.trades_10m, 0)::int AS "tradesLast10m",
        GREATEST(COALESCE(o.last_order, u.updated_at), COALESCE(t.last_trade, u.updated_at), u.updated_at) AS "lastActivity"
      FROM users u
      LEFT JOIN (
        SELECT user_id, COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '10 minutes') AS orders_10m, MAX(created_at) AS last_order
        FROM orders
        GROUP BY user_id
      ) o ON o.user_id = u.id
      LEFT JOIN (
        SELECT user_id, COUNT(*) AS trades_10m, MAX(last_trade) AS last_trade
        FROM (
          SELECT maker_user_id AS user_id, executed_at AS last_trade FROM trades WHERE executed_at >= NOW() - INTERVAL '10 minutes'
          UNION ALL
          SELECT taker_user_id AS user_id, executed_at AS last_trade FROM trades WHERE executed_at >= NOW() - INTERVAL '10 minutes'
        ) x
        GROUP BY user_id
      ) t ON t.user_id = u.id
      ORDER BY "lastActivity" DESC
      LIMIT 500
    `);

    return result.rows.map((row: any) => ({
      ...row,
      type: this.ADMIN_EMAILS.includes(row.email) ? 'admin' : String(row.email).endsWith('@bot.local') ? 'bot' : 'human',
      wsStatus: 'disconnected',
      currentPage: '-',
      lastSeen: row.lastActivity ? new Date(row.lastActivity).toLocaleString('en-GB') : '-',
      joinedDate: row.createdAt ? new Date(row.createdAt).toLocaleDateString('en-GB') : '-',
    }));
  }

  private async getAdminAuditLogs(limit = 200) {
    await this.ensureAdminTables();
    const result = await this.databaseService.query(
      `SELECT
        id,
        created_at AS timestamp,
        COALESCE(admin_email, 'unknown') AS "adminUser",
        action_type AS "actionType",
        COALESCE(target, '') AS target,
        summary,
        result,
        metadata
       FROM admin_audit_logs
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit],
    );
    return result.rows;
  }

  private async getAdminRiskSettings() {
    await this.ensureAdminTables();
    const result = await this.databaseService.query(`
      SELECT
        id,
        label,
        description,
        category,
        current_value::float AS "currentValue",
        unit,
        min_value::float AS min,
        max_value::float AS max,
        step_value::float AS step,
        severity,
        enabled
      FROM admin_risk_settings
      ORDER BY category, label
    `);
    return result.rows.length > 0 ? result.rows : this.defaultRiskSettings();
  }

  private async getAdminSettlements() {
    const exists = await this.databaseService.query<{ exists: boolean }>(
      `SELECT to_regclass('public.market_settlements') IS NOT NULL AS exists`,
    );
    if (!exists.rows[0]?.exists) return [];

    const result = await this.databaseService.query(`
      SELECT
        ms.id,
        ms.market_id AS "marketId",
        COALESCE(m.name, ms.market_id::text) AS "marketName",
        LOWER(COALESCE(m.status, 'settled')) AS status,
        ms.winning_outcome AS outcome,
        ms.settlement_reason AS reason,
        ms.positions_settled AS "positionsSettled",
        ms.orders_cancelled AS "ordersCancelled",
        ms.total_payout_gbp AS "totalPayoutGbp",
        ms.winners_count AS "winnersCount",
        ms.losers_count AS "losersCount",
        ms.settled_at AS "lastUpdated",
        m.maturity_date AS "maturityDate",
        COALESCE(u.email, ms.resolved_by_user_id::text) AS "resolvedBy"
      FROM market_settlements ms
      LEFT JOIN markets m ON m.id = ms.market_id
      LEFT JOIN users u ON u.id = ms.resolved_by_user_id
      ORDER BY ms.settled_at DESC
      LIMIT 300
    `);

    return result.rows.map((row: any) => ({
      ...row,
      settlementStatus: 'completed',
      status: row.status === 'settled' ? 'resolved' : row.status,
      impactedAccounts: Number(row.winnersCount || 0) + Number(row.losersCount || 0),
      maturityDate: row.maturityDate ? new Date(row.maturityDate).toLocaleDateString('en-GB') : '-',
    }));
  }

  private async getAdminAnalytics(markets: any[], users: any[], ordersAndTrades: any) {
    const trades = ordersAndTrades.trades || [];
    const totalVolume = markets.reduce((sum, market) => sum + Number(market.volume24h || 0), 0);
    const spreads = markets.map(m => Number(m.spread || 0)).filter(Boolean);
    const activeMarkets = markets.filter(m => String(m.status).toLowerCase() === 'active').length;

    const buckets = new Array(24).fill(0);
    for (const trade of trades) {
      const date = new Date(trade.timestamp || trade.executedAt);
      if (!Number.isNaN(date.getTime())) buckets[date.getHours()]++;
    }

    return {
      totalVolume,
      totalLiquidity: markets.reduce((sum, market) => sum + Number(market.liquidity || 0), 0),
      avgSpread: spreads.length ? spreads.reduce((a, b) => a + b, 0) / spreads.length : 0,
      tradesToday: trades.filter((trade) => {
        const date = new Date(trade.timestamp || trade.executedAt);
        const now = new Date();
        return date.toDateString() === now.toDateString();
      }).length,
      activeMarkets,
      totalUsers: users.length,
      humanUsers: users.filter(u => u.type === 'human').length,
      botUsers: users.filter(u => u.type === 'bot').length,
      adminUsers: users.filter(u => u.type === 'admin').length,
      tradesOverTime: buckets,
    };
  }

  @Get('me')
  async getAdminMe(@Req() req: FastifyRequest & { session: any }) {
    const userId = req.session?.userId;
    if (!userId) throw new UnauthorizedException('Not authenticated');
    await this.checkAdminAccess(userId);
    const user = await this.getAdminUser(userId);
    return { isAdmin: true, user: { id: user.id, email: user.email, name: user.name } };
  }

  @Get('snapshot')
  async getAdminSnapshot(@Req() req: FastifyRequest & { session: any }) {
    const userId = req.session?.userId;
    if (!userId) throw new UnauthorizedException('Not authenticated');
    await this.checkAdminAccess(userId);

    const [markets, users, ordersAndTrades, auditLogs, riskSettings, settlements, botStatus] = await Promise.all([
      this.getAdminMarkets(),
      this.getAdminUsers(),
      this.getAdminOrdersAndTrades(),
      this.getAdminAuditLogs(),
      this.getAdminRiskSettings(),
      this.getAdminSettlements(),
      this.liquidityBotsService.getStatus(),
    ]);

    const analytics = await this.getAdminAnalytics(markets, users, ordersAndTrades);

    return {
      markets,
      users,
      orders: ordersAndTrades.orders,
      trades: ordersAndTrades.trades,
      auditLogs,
      riskSettings,
      settlements,
      analytics,
      botStatus,
    };
  }

  @Get('risk-controls')
  async getRiskControls(@Req() req: FastifyRequest & { session: any }) {
    const userId = req.session?.userId;
    if (!userId) throw new UnauthorizedException('Not authenticated');
    await this.checkAdminAccess(userId);
    return { riskSettings: await this.getAdminRiskSettings() };
  }

  @Post('risk-controls')
  async saveRiskControls(
    @Body() body: { riskSettings?: any[] },
    @Req() req: FastifyRequest & { session: any },
  ) {
    const userId = req.session?.userId;
    if (!userId) throw new UnauthorizedException('Not authenticated');
    await this.checkAdminAccess(userId);
    await this.ensureAdminTables();

    const riskSettings = Array.isArray(body.riskSettings) ? body.riskSettings : [];
    for (const setting of riskSettings) {
      await this.databaseService.query(
        `INSERT INTO admin_risk_settings
          (id, category, label, description, current_value, unit, min_value, max_value, step_value, severity, enabled, updated_by_user_id, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
         ON CONFLICT (id) DO UPDATE SET
          category = EXCLUDED.category,
          label = EXCLUDED.label,
          description = EXCLUDED.description,
          current_value = EXCLUDED.current_value,
          unit = EXCLUDED.unit,
          min_value = EXCLUDED.min_value,
          max_value = EXCLUDED.max_value,
          step_value = EXCLUDED.step_value,
          severity = EXCLUDED.severity,
          enabled = EXCLUDED.enabled,
          updated_by_user_id = EXCLUDED.updated_by_user_id,
          updated_at = NOW()`,
        [
          setting.id,
          setting.category || 'General',
          setting.label || setting.id,
          setting.description || '',
          Number(setting.currentValue ?? 0),
          setting.unit || '',
          Number(setting.min ?? 0),
          Number(setting.max ?? 0),
          Number(setting.step ?? 1),
          setting.severity || 'medium',
          setting.enabled !== false,
          userId,
        ],
      );
    }

    await this.logAdminAction(userId, 'config_change', 'Risk Controls', `Updated ${riskSettings.length} risk control settings`);
    return { success: true, riskSettings: await this.getAdminRiskSettings() };
  }

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

  @Post('liquidity-bots/start')
  async startLiquidityBots(
    @Body() body: {
      marketId: string;
      userCount: number;
      midYesPts: number;
      halfSpreadPts: number;
      levels: number;
      sizeContracts: number;
      takerChance: number;
      sizeVariance?: number;
      priceVariance?: number;
      orderDelayMs?: number;
      orderDelayVarianceMs?: number;
      refreshIntervalMs?: number;
      priceDriftPts?: number;
      volatility?: number;
      pricePathMode?: 'random_walk' | 'linear' | 'sine' | 'trend_sine';
      trendPerTickPts?: number;
      sineAmplitudePts?: number;
      sinePeriodTicks?: number;
      meanReversion?: number;
    },
    @Req() req: FastifyRequest & { session: any },
  ) {
    const userId = req.session?.userId;
    if (!userId) {
      throw new UnauthorizedException('Not authenticated');
    }

    // Check admin access
    await this.checkAdminAccess(userId);

    this.logger.info(`Admin ${userId} starting liquidity bots`, body);

    try {
      await this.liquidityBotsService.startBots(body);
      await this.logAdminAction(userId, 'bot_start', body.marketId, `Started ${body.userCount} liquidity bots for market ${body.marketId}`, 'success', body);
      return {
        success: true,
        message: `Started ${body.userCount} liquidity bots for market ${body.marketId}`,
      };
    } catch (error) {
      this.logger.error('Failed to start liquidity bots', error);
      throw error;
    }
  }

  @Post('liquidity-bots/stop')
  async stopLiquidityBots(
    @Body() body: any,
    @Req() req: FastifyRequest & { session: any },
  ) {
    const userId = req.session?.userId;
    if (!userId) throw new UnauthorizedException('Not authenticated');
    await this.checkAdminAccess(userId);
    this.logger.info(`Admin ${userId} stopping liquidity bots`);
    try {
      await this.liquidityBotsService.stopBots();
      await this.logAdminAction(userId, 'bot_stop', 'All Markets', 'Stopped all liquidity bots');
      return { success: true, message: 'Stopped all liquidity bots' };
    } catch (error) {
      this.logger.error('Failed to stop liquidity bots', error);
      throw error;
    }
  }

  @Post('liquidity-bots/status')
  async getLiquidityBotsStatus(
    @Body() body: any,
    @Req() req: FastifyRequest & { session: any },
  ) {
    const userId = req.session?.userId;
    if (!userId) throw new UnauthorizedException('Not authenticated');
    await this.checkAdminAccess(userId);
    return this.liquidityBotsService.getStatus();
  }

  @Post('liquidity-bots/start-category')
  async startCategoryBots(
    @Body() body: {
      category: string;
      userCount: number;
      halfSpreadPts: number;
      levels: number;
      sizeContracts: number;
      takerChance: number;
      sizeVariance?: number;
      priceVariance?: number;
      orderDelayMs?: number;
      orderDelayVarianceMs?: number;
      refreshIntervalMs?: number;
      priceDriftPts?: number;
      volatility?: number;
      pricePathMode?: 'random_walk' | 'linear' | 'sine' | 'trend_sine';
      trendPerTickPts?: number;
      sineAmplitudePts?: number;
      sinePeriodTicks?: number;
      meanReversion?: number;
      subcategoryCurve: Record<string, number[]>;
      selectedSubcategories?: string[];
    },
    @Req() req: FastifyRequest & { session: any },
  ) {
    const userId = req.session?.userId;
    if (!userId) throw new UnauthorizedException('Not authenticated');
    await this.checkAdminAccess(userId);
    this.logger.info(`Admin ${userId} starting category bots for '${body.category}'`, body);
    try {
      const result = await this.liquidityBotsService.startCategoryBots(body);
      await this.logAdminAction(userId, 'bot_start', body.category, `Started bots on ${result.marketCount}/${result.totalMarkets} markets in '${body.category}'`, 'success', body);
      return {
        success: true,
        message: `Started bots on ${result.marketCount}/${result.totalMarkets} markets in '${body.category}'`,
        ...result,
      };
    } catch (error) {
      this.logger.error('Failed to start category bots', error);
      throw error;
    }
  }

  @Post('bot-users')
  async getAvailableBotUsers(
    @Body() body: any,
    @Req() req: FastifyRequest & { session: any },
  ) {
    const userId = req.session?.userId;
    if (!userId) {
      throw new UnauthorizedException('Not authenticated');
    }

    // Check admin access
    await this.checkAdminAccess(userId);

    try {
      const result = await this.databaseService.query(
        `SELECT id, email, name FROM users WHERE email LIKE '%@bot.local' ORDER BY email`
      );

      return {
        success: true,
        botUsers: result.rows,
        count: result.rows.length,
      };
    } catch (error) {
      this.logger.error('Failed to fetch bot users', error);
      throw error;
    }
  }

  /**
   * Resolve a market - declares the winner and triggers settlement
   */
  @Post('markets/resolve')
  async resolveMarket(
    @Body() body: {
      marketId: string;
      winningOutcome: 'YES' | 'NO'; // For binary markets
      reason?: string;
    },
    @Req() req: FastifyRequest & { session: any },
  ) {
    const userId = req.session?.userId;
    if (!userId) {
      throw new UnauthorizedException('Not authenticated');
    }

    // Check admin access
    await this.checkAdminAccess(userId);

    this.logger.info(`Admin ${userId} resolving market ${body.marketId} - Winner: ${body.winningOutcome}`);

    try {
      // 1. Cancel all open orders for this market via Rust exchange so wallet locks are released correctly.
      const openOrdersResult = await this.databaseService.query<{ id: string; user_id: string }>(
        `SELECT id, user_id
         FROM orders
         WHERE market_id = $1
           AND status IN ('OPEN', 'PARTIALLY_MATCHED')`,
        [body.marketId]
      );

      const openOrderIds = openOrdersResult.rows.map(row => row.id);
      if (openOrdersResult.rows.length > 0) {
        const cancelResults = await Promise.allSettled(
          openOrdersResult.rows.map(order =>
            this.rustExchange.cancelOrder({
              orderId: order.id,
              userId: order.user_id,
            })
          )
        );

        const failedCancels = cancelResults.filter(result => result.status === 'rejected');
        if (failedCancels.length > 0) {
          throw new Error(`Failed to cancel ${failedCancels.length} orders before settlement`);
        }

        const pendingCancels = await this.waitForOrderCancellations(openOrderIds);
        if (pendingCancels > 0) {
          throw new Error(`Timed out waiting for ${pendingCancels} order cancellations before settlement`);
        }
      }

      const cancelledOrdersResult = await this.databaseService.query<{ cancelled_count: string }>(
        `SELECT COUNT(*)::text AS cancelled_count
         FROM orders
         WHERE id = ANY($1::uuid[])
           AND status = 'CANCELLED'`,
        [openOrderIds]
      );
      const cancelledOrdersCount = Number(cancelledOrdersResult.rows[0]?.cancelled_count || '0');
      this.logger.info(`Cancelled ${cancelledOrdersCount} open orders before settlement`);

      // 2. Update market status to SETTLED
      await this.databaseService.query(
        `UPDATE markets 
         SET status = 'SETTLED', 
             settlement_time = NOW(),
             updated_at = NOW()
         WHERE id = $1`,
        [body.marketId]
      );

      // 3. Get all position lots for this market
      const positionLotsResult = await this.databaseService.query(
        `SELECT 
          lot_id,
          user_id,
          market_id,
          side,
          entry_price_yes_pts,
          qty_remaining_micros
        FROM position_lots
        WHERE market_id = $1 AND qty_remaining_micros > 0`,
        [body.marketId]
      );

      const positionLots = positionLotsResult.rows;
      this.logger.info(`Found ${positionLots.length} position lots to settle`);

      // 3. Calculate payouts and update wallets
      const CONTRACT_SCALE = 1_000_000n;
      const CONTRACT_PAYOUT_PENCE = 100n; // £1.00 per contract
      const PRICE_SCALE = 10_000_000n;

      let totalPayoutGbp = 0;
      let winnersCount = 0;
      let losersCount = 0;
      const userSettlements: any[] = [];

      for (const lot of positionLots) {
        const isBuyYesSide = lot.side === 'BUY_YES' || lot.side === 'FOR';
        // Determine if this position is a winner
        const isWinner = (body.winningOutcome === 'YES' && isBuyYesSide) ||
                        (body.winningOutcome === 'NO' && !isBuyYesSide);

        const qtyMicros = BigInt(lot.qty_remaining_micros);
        const entryYesPts = BigInt(lot.entry_price_yes_pts);

        // Calculate locked amount based on side and entry price
        // FOR (BUY YES): locked = contracts × entry_price
        // LAY (SELL YES): locked = contracts × (1 - entry_price) = contracts × no_cost
        let lockedPence: bigint;
        if (isBuyYesSide) {
          // BUY YES: cost is yes price
          lockedPence = (qtyMicros * entryYesPts * CONTRACT_PAYOUT_PENCE) / (PRICE_SCALE * CONTRACT_SCALE);
        } else {
          // SELL YES (LAY): cost is no price = 1 - yes_price
          const noPts = PRICE_SCALE - entryYesPts;
          lockedPence = (qtyMicros * noPts * CONTRACT_PAYOUT_PENCE) / (PRICE_SCALE * CONTRACT_SCALE);
        }

        // Total payout if you win (always £1.00 per contract)
        const totalPayoutPence = (qtyMicros * CONTRACT_PAYOUT_PENCE) / CONTRACT_SCALE;

        if (isWinner) {
          // Winner: Release position lock, credit full payout to available balance
          const payoutAmount = Number(totalPayoutPence);
          const lockedAmount = Number(lockedPence);
          const profitPence = payoutAmount - lockedAmount;

          winnersCount++;
          totalPayoutGbp += payoutAmount / 100;

          this.logger.info(
            `Winner: user=${lot.user_id}, side=${lot.side}, qty=${lot.qty_remaining_micros}, ` +
            `locked=${lockedAmount}p, payout=${payoutAmount}p, profit=${profitPence}p`
          );

          await this.databaseService.query(
            `UPDATE wallets
             SET locked_balance = locked_balance - $1,
                 balance = balance + $2,
                 updated_at = NOW()
             WHERE user_id = $3 AND currency = 'GBP'`,
            [lockedAmount / 100, payoutAmount / 100, lot.user_id]
          );

          // Track for settlement record
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
          // Loser: Just release the position lock (funds go to winners)
          const lockedAmount = Number(lockedPence);

          losersCount++;

          this.logger.info(
            `Loser: user=${lot.user_id}, side=${lot.side}, qty=${lot.qty_remaining_micros}, ` +
            `locked=${lockedAmount}p, lost=${lockedAmount}p`
          );

          await this.databaseService.query(
            `UPDATE wallets
             SET locked_balance = locked_balance - $1,
                 updated_at = NOW()
             WHERE user_id = $2 AND currency = 'GBP'`,
            [lockedAmount / 100, lot.user_id]
          );

          // Track for settlement record
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

      // 4. Create settlement record
      const settlementResult = await this.databaseService.query(
        `INSERT INTO market_settlements 
         (market_id, resolved_by_user_id, winning_outcome, settlement_reason, 
          positions_settled, orders_cancelled, total_payout_gbp, winners_count, losers_count)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id`,
        [
          body.marketId,
          userId,
          body.winningOutcome,
          body.reason || null,
          positionLots.length,
          cancelledOrdersCount,
          totalPayoutGbp,
          winnersCount,
          losersCount,
        ]
      );

      const settlementId = settlementResult.rows[0].id;

      // 5. Create individual user settlement records
      for (const userSettlement of userSettlements) {
        await this.databaseService.query(
          `INSERT INTO user_settlements 
           (settlement_id, user_id, market_id, position_side, contracts_settled, 
            entry_price_yes_pts, is_winner, payout_gbp, profit_loss_gbp)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            settlementId,
            userSettlement.userId,
            userSettlement.marketId,
            userSettlement.positionSide,
            userSettlement.contractsSettled,
            userSettlement.entryPriceYesPts,
            userSettlement.isWinner,
            userSettlement.payoutGbp,
            userSettlement.profitLossGbp,
          ]
        );
      }

      // 6. Close all position lots (set remaining quantity to 0)
      await this.databaseService.query(
        `UPDATE position_lots
         SET qty_remaining_micros = 0,
             updated_at = NOW()
         WHERE market_id = $1 AND qty_remaining_micros > 0`,
        [body.marketId]
      );

      // 7. Clear positions table (set net quantity to 0)
      await this.databaseService.query(
        `UPDATE positions
         SET net_qty_micros = 0,
             updated_at = NOW()
         WHERE market_id = $1 AND net_qty_micros <> 0`,
        [body.marketId]
      );

      this.logger.info(`Market ${body.marketId} settlement complete`);

      // 8. Broadcast orderbook update to clear frontend
      this.natsClient.publish(NATS_SUBJECTS.MARKET_BOOK_UPDATED, {
        marketId: body.marketId,
        timestamp: Date.now(),
      });
      this.logger.info(`Broadcasted orderbook clear for market ${body.marketId}`);
      await this.logAdminAction(userId, 'market_resolve', body.marketId, `Resolved market as ${body.winningOutcome}`, 'success', {
        reason: body.reason,
        positionsSettled: positionLots.length,
        ordersCancelled: cancelledOrdersCount,
      });

      return {
        success: true,
        message: `Market ${body.marketId} resolved - Winner: ${body.winningOutcome}`,
        positionsSettled: positionLots.length,
        ordersCancelled: cancelledOrdersCount,
      };
    } catch (error) {
      this.logger.error('Failed to resolve market', error);
      throw error;
    }
  }

  /**
   * Void a market - returns all locked funds
   */
  @Post('markets/void')
  async voidMarket(
    @Body() body: {
      marketId: string;
      reason: string;
    },
    @Req() req: FastifyRequest & { session: any },
  ) {
    const userId = req.session?.userId;
    if (!userId) {
      throw new UnauthorizedException('Not authenticated');
    }

    // Check admin access
    await this.checkAdminAccess(userId);

    this.logger.info(`Admin ${userId} voiding market ${body.marketId}: ${body.reason}`);

    try {
      // 1. Update market status to CLOSED
      await this.databaseService.query(
        `UPDATE markets 
         SET status = 'CLOSED', 
             updated_at = NOW()
         WHERE id = $1`,
        [body.marketId]
      );

      // 2. Get all position lots
      const positionLotsResult = await this.databaseService.query(
        `SELECT 
          user_id,
          side,
          entry_price_yes_pts,
          qty_remaining_micros
         FROM position_lots
         WHERE market_id = $1 AND qty_remaining_micros > 0`,
        [body.marketId]
      );

      // 3. Return all locked funds to available balance
      const CONTRACT_SCALE = 1_000_000n;
      const CONTRACT_PAYOUT_PENCE = 100n;
      const PRICE_SCALE = 10_000_000n;

      for (const lot of positionLotsResult.rows) {
        const qtyMicros = BigInt(lot.qty_remaining_micros);
        const entryYesPts = BigInt(lot.entry_price_yes_pts);
        const isBuyYesSide = lot.side === 'BUY_YES' || lot.side === 'FOR';

        // Calculate locked amount
        let lockedPence: bigint;
        if (isBuyYesSide) {
          lockedPence = (qtyMicros * entryYesPts * CONTRACT_PAYOUT_PENCE) / (PRICE_SCALE * CONTRACT_SCALE);
        } else {
          const noPts = PRICE_SCALE - entryYesPts;
          lockedPence = (qtyMicros * noPts * CONTRACT_PAYOUT_PENCE) / (PRICE_SCALE * CONTRACT_SCALE);
        }

        const lockedAmount = Number(lockedPence);

        await this.databaseService.query(
          `UPDATE wallets
           SET locked_balance = locked_balance - $1,
               balance = balance + $1,
               updated_at = NOW()
           WHERE user_id = $2 AND currency = 'GBP'`,
          [lockedAmount / 100, lot.user_id]
        );
      }

      await this.logAdminAction(userId, 'market_void', body.marketId, `Voided market and refunded ${positionLotsResult.rows.length} positions`, 'success', {
        reason: body.reason,
      });

      return {
        success: true,
        message: `Market ${body.marketId} voided - All funds returned`,
        positionsVoided: positionLotsResult.rows.length,
      };
    } catch (error) {
      this.logger.error('Failed to void market', error);
      throw error;
    }
  }

  /**
   * Reset market status back to ACTIVE (for failed settlements)
   */
  @Post('markets/reset-status')
  async resetMarketStatus(
    @Body() body: {
      marketId: string;
    },
    @Req() req: FastifyRequest & { session: any },
  ) {
    const userId = req.session?.userId;
    if (!userId) {
      throw new UnauthorizedException('Not authenticated');
    }

    // Check admin access
    await this.checkAdminAccess(userId);

    this.logger.info(`Admin ${userId} resetting market ${body.marketId} status to ACTIVE`);

    try {
      await this.databaseService.query(
        `UPDATE markets 
         SET status = 'ACTIVE',
             settlement_time = NULL,
             updated_at = NOW()
         WHERE id = $1`,
        [body.marketId]
      );

      await this.logAdminAction(userId, 'settlement_reset', body.marketId, `Reset market ${body.marketId} to ACTIVE`);

      return {
        success: true,
        message: `Market ${body.marketId} reset to ACTIVE`,
      };
    } catch (error) {
      this.logger.error('Failed to reset market status', error);
      throw error;
    }
  }

  /**
   * Bulk-create insurance contracts for a given category
   */
  @Post('insurance/bulk-create')
  async bulkCreateInsuranceContracts(
    @Body() body: {
      slug: string;
      count: number;
      startOffsetDays: number;
      spacingDays: number;
      customName?: string;
      conditionName?: string;
    },
    @Req() req: FastifyRequest & { session: any },
  ) {
    const userId = req.session?.userId;
    if (!userId) {
      throw new UnauthorizedException('Not authenticated');
    }

    await this.checkAdminAccess(userId);

    const { slug, count = 6, startOffsetDays = 30, spacingDays = 30, customName, conditionName } = body;
    if (!slug) {
      throw new Error('slug is required');
    }

    // Look up the insurance category
    const catResult = await this.databaseService.query<{
      slug: string; title: string; question_template: string; condition_name: string;
      settlement_source: string; oracle: string; base_yes_pts: number;
    }>(
      `SELECT slug, title, question_template, condition_name, settlement_source, oracle, base_yes_pts
       FROM insurance_categories WHERE slug = $1 AND active = true`,
      [slug],
    );

    if (catResult.rows.length === 0) {
      throw new Error(`Insurance category '${slug}' not found or inactive`);
    }

    const cat = catResult.rows[0];
    const created: string[] = [];

    // Elegant contract series names per category
    const CONTRACT_SERIES: Record<string, string> = {
      life:        'Mortality Risk Index',
      health:      'Critical Illness Tracker',
      climate:     'Climate Risk Benchmark',
      agriculture: 'Harvest Yield Contract',
      liability:   'Liability Exposure Index',
      travel:      'Travel Disruption Cover',
    };

    for (let i = 0; i < count; i++) {
      const maturity = new Date();
      maturity.setDate(maturity.getDate() + startOffsetDays + i * spacingDays);
      const maturityStr = maturity.toISOString();
      const dateLabel = maturity.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
      const shortDate  = maturity.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });

      const seriesName = CONTRACT_SERIES[slug] ?? cat.title;
      const seriesIndex = String(i + 1).padStart(2, '0');
      let name: string;
      let question: string;
      if (customName?.trim()) {
        const resolved = customName.trim().replace(/\{date\}/gi, dateLabel);
        name = `${resolved} [#${seriesIndex}]`;
        question = resolved;
      } else {
        name = `${seriesName} · ${shortDate} [#${seriesIndex}]`;
        question = cat.question_template.replace(/\{date\}/g, dateLabel);
      }

      const result = await this.databaseService.query<{ id: string }>(
        `INSERT INTO markets (
           name, description, type, status, event_id, outcomes,
           start_time, end_time, min_stake, max_stake,
           market_category, insurance_category, condition_name, question,
           maturity_date, settlement_source, oracle, base_yes_pts, sort_order
         ) VALUES (
           $1, $2, 'BINARY', 'ACTIVE', uuid_generate_v4(), '{YES,NO}',
           NOW(), $3::timestamptz, 1.00, 1000.00,
           'INSURANCE', $4, $5, $6,
           $3::timestamptz, $7, $8, $9, $10
         ) RETURNING id`,
        [
          name,
          question,
          maturityStr,
          slug,
          conditionName?.trim() || cat.condition_name,
          question,
          cat.settlement_source,
          cat.oracle,
          cat.base_yes_pts,
          i + 1,
        ],
      );

      created.push(result.rows[0].id);
    }

    this.logger.info(`Admin ${userId} created ${created.length} insurance contracts for category '${slug}'`);
    await this.logAdminAction(userId, 'insurance_create', slug, `Created ${created.length} insurance contracts for '${cat.title}'`, 'success', {
      marketIds: created,
      count,
      startOffsetDays,
      spacingDays,
    });

    return {
      success: true,
      message: `Created ${created.length} insurance contracts for '${cat.title}'`,
      marketIds: created,
    };
  }

  /**
   * Delete insurance contracts by category and optional condition name
   */
  @Post('insurance/delete-group')
  async deleteInsuranceContracts(
    @Body() body: { slug: string; conditionName?: string },
    @Req() req: FastifyRequest & { session: any },
  ) {
    const userId = req.session?.userId;
    if (!userId) throw new UnauthorizedException('Not authenticated');
    await this.checkAdminAccess(userId);

    const { slug, conditionName } = body;
    if (!slug) throw new Error('slug is required');

    let result: { rows: { count: string }[] };
    if (conditionName?.trim()) {
      result = await this.databaseService.query<{ count: string }>(
        `WITH deleted AS (
           DELETE FROM markets
           WHERE market_category = 'INSURANCE'
             AND insurance_category = $1
             AND condition_name = $2
             AND status IN ('ACTIVE', 'PENDING')
           RETURNING id
         ) SELECT COUNT(*)::text AS count FROM deleted`,
        [slug, conditionName.trim()],
      );
    } else {
      result = await this.databaseService.query<{ count: string }>(
        `WITH deleted AS (
           DELETE FROM markets
           WHERE market_category = 'INSURANCE'
             AND insurance_category = $1
             AND status IN ('ACTIVE', 'PENDING')
           RETURNING id
         ) SELECT COUNT(*)::text AS count FROM deleted`,
        [slug],
      );
    }

    const deleted = Number(result.rows[0]?.count ?? 0);
    this.logger.info(`Admin ${userId} deleted ${deleted} insurance contracts for '${slug}'${conditionName ? ` / '${conditionName}'` : ''}`);
    await this.logAdminAction(userId, 'insurance_delete', slug, `Deleted ${deleted} insurance contracts for '${slug}'`, 'success', { conditionName });
    return { success: true, deleted, message: `Deleted ${deleted} insurance contract${deleted !== 1 ? 's' : ''}` };
  }
}
