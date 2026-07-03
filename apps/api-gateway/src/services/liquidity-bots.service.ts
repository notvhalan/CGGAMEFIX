import { Injectable } from '@nestjs/common';
import { Logger } from '@betting-exchange/shared-config';
import { DatabaseService } from '../database/database.service';
import { v4 as uuidv4 } from 'uuid';
import { PRICE_SCALE, CONTRACT_SCALE, stakeToContracts, liabilityToContracts } from '@betting-exchange/shared-types';
import axios from 'axios';

type Side = 'BUY_YES' | 'SELL_YES';
export type PricePathMode = 'random_walk' | 'linear' | 'sine' | 'trend_sine';

interface BotConfig {
  marketId: string;
  midYesPts: bigint;
  halfSpreadPts: bigint;
  levels: number;
  sizeContracts: number;
  takerChance: number;
  sizeVariance: number;
  priceVariance: number;
  orderDelayMs: number;
  orderDelayVarianceMs: number;
  refreshIntervalMs: number;
  priceDriftPts: number;
  volatility: number;
  pricePathMode: PricePathMode;
  trendPerTickPts: number;
  sineAmplitudePts: number;
  sinePeriodTicks: number;
  meanReversion: number;
}

interface BotState {
  userId: string;
  liveOrders: Array<{ id: string; side: Side; yesPts: bigint }>;
  timeoutId?: NodeJS.Timeout;
  currentMidPts: bigint;
  priceTick: number;
}

/** Tracks one running market session for status reporting */
export interface MarketSession {
  marketId: string;
  marketName: string;
  conditionName: string | null;
  category: string | null;
  midPrice: number;       // 0-100
  spread: number;         // 0-100
  levels: number;
  botsCount: number;
  ordersPlaced: number;
  pricePathMode: PricePathMode;
  trendPerTickPts: number;
  sineAmplitudePts: number;
  sinePeriodTicks: number;
  meanReversion: number;
  startedAt: string;      // ISO date
  status: 'running' | 'error';
  errorMessage?: string;
}

@Injectable()
export class LiquidityBotsService {
  private readonly logger = new Logger('LiquidityBotsService');
  private bots: BotState[] = [];
  private config: BotConfig | null = null;
  private stopping = false;
  private readonly RUST_EXCHANGE_URL = process.env.RUST_EXCHANGE_URL || 'http://localhost:3001';

  /** Track all running sessions for status endpoint */
  private sessions: Map<string, MarketSession> = new Map();
  /** Track per-market bot arrays for multi-market mode */
  private marketBots: Map<string, { bots: BotState[]; config: BotConfig }> = new Map();

  /** Return status of all running bot sessions */
  getStatus(): { sessions: MarketSession[]; totalBots: number; totalOrders: number } {
    const sessions = Array.from(this.sessions.values());
    // Update order counts from live bot state
    for (const sess of sessions) {
      const mb = this.marketBots.get(sess.marketId);
      if (mb) {
        sess.ordersPlaced = mb.bots.reduce((sum, b) => sum + b.liveOrders.length, 0);
        sess.botsCount = mb.bots.length;
        if (mb.bots.length > 0) {
          sess.midPrice = mb.bots.reduce((sum, bot) => sum + Number(bot.currentMidPts), 0) / mb.bots.length / 100_000;
        }
      }
    }
    const totalBots = sessions.reduce((s, x) => s + x.botsCount, 0);
    const totalOrders = sessions.reduce((s, x) => s + x.ordersPlaced, 0);
    return { sessions, totalBots, totalOrders };
  }

  constructor(
    private readonly databaseService: DatabaseService,
  ) {}

  private validateBotConfig(params: {
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
    pricePathMode?: PricePathMode;
    trendPerTickPts?: number;
    sineAmplitudePts?: number;
    sinePeriodTicks?: number;
    meanReversion?: number;
  }) {
    const requiredNumbers = [
      params.userCount,
      params.halfSpreadPts,
      params.levels,
      params.sizeContracts,
      params.takerChance,
    ];
    const optionalNumbers = [
      params.sizeVariance,
      params.priceVariance,
      params.orderDelayMs,
      params.orderDelayVarianceMs,
      params.refreshIntervalMs,
      params.priceDriftPts,
      params.volatility,
      params.trendPerTickPts,
      params.sineAmplitudePts,
      params.sinePeriodTicks,
      params.meanReversion,
    ];
    if (requiredNumbers.some(value => typeof value !== 'number' || !Number.isFinite(value)) ||
        optionalNumbers.some(value => value !== undefined && (typeof value !== 'number' || !Number.isFinite(value)))) {
      throw new Error('Bot parameters must be finite numbers');
    }
    if (!Number.isInteger(params.userCount) || params.userCount < 1 || params.userCount > 100) {
      throw new Error('userCount must be an integer between 1 and 100');
    }
    if (!Number.isInteger(params.levels) || params.levels < 1 || params.levels > 20) {
      throw new Error('levels must be an integer between 1 and 20');
    }
    if (params.halfSpreadPts < 10_000 || params.halfSpreadPts > 1_000_000) {
      throw new Error('halfSpreadPts must be between 0.1% and 10%');
    }
    if (params.sizeContracts < 0.001 || params.sizeContracts > 10_000) {
      throw new Error('sizeContracts must be between 0.001 and 10,000');
    }
    if (params.takerChance < 0 || params.takerChance > 1) {
      throw new Error('takerChance must be between 0 and 1');
    }
    if ((params.sizeVariance ?? 0) < 0 || (params.sizeVariance ?? 0) > 1) {
      throw new Error('sizeVariance must be between 0 and 1');
    }
    if ((params.volatility ?? 0) < 0 || (params.volatility ?? 0) > 1) {
      throw new Error('volatility must be between 0 and 1');
    }
    const validPathModes: PricePathMode[] = ['random_walk', 'linear', 'sine', 'trend_sine'];
    if (params.pricePathMode !== undefined && !validPathModes.includes(params.pricePathMode)) {
      throw new Error('pricePathMode must be random_walk, linear, sine, or trend_sine');
    }
    if (Math.abs(params.trendPerTickPts ?? 0) > 1_000_000) {
      throw new Error('trendPerTickPts must be between -1,000,000 and 1,000,000');
    }
    if ((params.sineAmplitudePts ?? 0) < 0 || (params.sineAmplitudePts ?? 0) > 4_000_000) {
      throw new Error('sineAmplitudePts must be between 0 and 4,000,000');
    }
    if (!Number.isInteger(params.sinePeriodTicks ?? 20) || (params.sinePeriodTicks ?? 20) < 2 || (params.sinePeriodTicks ?? 20) > 10_000) {
      throw new Error('sinePeriodTicks must be an integer between 2 and 10,000');
    }
    if ((params.meanReversion ?? 0.1) < 0 || (params.meanReversion ?? 0.1) > 1) {
      throw new Error('meanReversion must be between 0 and 1');
    }
    if ((params.orderDelayMs ?? 0) < 0 || (params.orderDelayVarianceMs ?? 0) < 0 ||
        (params.refreshIntervalMs ?? 0) < 0 || (params.priceVariance ?? 0) < 0 ||
        (params.priceDriftPts ?? 0) < 0) {
      throw new Error('Bot timing and variance parameters cannot be negative');
    }
  }

  async startBots(params: {
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
    pricePathMode?: PricePathMode;
    trendPerTickPts?: number;
    sineAmplitudePts?: number;
    sinePeriodTicks?: number;
    meanReversion?: number;
    marketName?: string;
    conditionName?: string;
    category?: string;
  }) {
    this.validateBotConfig(params);
    if (typeof params.marketId !== 'string' || !params.marketId.trim() ||
        typeof params.midYesPts !== 'number' || !Number.isInteger(params.midYesPts) ||
        params.midYesPts < 10_000 || params.midYesPts > 9_990_000) {
      throw new Error('marketId and a valid midYesPts between 0.1% and 99.9% are required');
    }

    // Stop any existing bots only after the replacement configuration is valid.
    await this.stopBots();
    
    // Reset stopping flag
    this.stopping = false;

    this.config = {
      marketId: params.marketId,
      midYesPts: BigInt(params.midYesPts),
      halfSpreadPts: BigInt(params.halfSpreadPts),
      levels: params.levels,
      sizeContracts: params.sizeContracts,
      takerChance: params.takerChance,
      sizeVariance: params.sizeVariance || 0,
      priceVariance: params.priceVariance || 0,
      orderDelayMs: params.orderDelayMs || 0,
      orderDelayVarianceMs: params.orderDelayVarianceMs || 0,
      refreshIntervalMs: params.refreshIntervalMs || 0,
      priceDriftPts: params.priceDriftPts || 0,
      volatility: params.volatility || 0,
      pricePathMode: params.pricePathMode ?? 'random_walk',
      trendPerTickPts: params.trendPerTickPts ?? 0,
      sineAmplitudePts: params.sineAmplitudePts ?? 0,
      sinePeriodTicks: params.sinePeriodTicks ?? 20,
      meanReversion: params.meanReversion ?? 0.1,
    };

    this.logger.info(`Fetching ${params.userCount} existing bot users...`);

    try {
      const botUsersResult = await this.databaseService.query(
        `SELECT id, email FROM users WHERE email LIKE '%@bot.local' ORDER BY RANDOM() LIMIT $1`,
        [params.userCount]
      );

      if (botUsersResult.rows.length === 0) {
        throw new Error('No bot users found in database. Please create bot users with @bot.local emails first.');
      }

      if (botUsersResult.rows.length < params.userCount) {
        this.logger.warn(`Only found ${botUsersResult.rows.length} bot users, requested ${params.userCount}`);
      }

      const usedBotIds = new Set<string>();

      for (const row of botUsersResult.rows) {
        const userId = row.id;
        if (usedBotIds.has(userId)) continue;
        usedBotIds.add(userId);

        await this.databaseService.ensureWallet(userId, 'GBP');
        const fundResult = await this.databaseService.query(
          `UPDATE wallets SET balance = 1000000.00, locked_balance = 0, updated_at = NOW() WHERE user_id = $1 AND currency = 'GBP' RETURNING balance`,
          [userId]
        );
        if (fundResult.rows.length === 0) { this.logger.error(`Failed to fund wallet for bot user ${userId}`); continue; }

        this.bots.push({ userId, liveOrders: [], currentMidPts: BigInt(params.midYesPts), priceTick: 0 });
        this.logger.info(`Using bot user: ${row.email} (${userId}) with balance £${fundResult.rows[0].balance}`);
      }

      this.logger.info(`✓ Selected ${this.bots.length} unique bot users from pool of ${botUsersResult.rows.length}`);

      // Register session tracking
      this.sessions.set(params.marketId, {
        marketId: params.marketId,
        marketName: params.marketName || params.marketId,
        conditionName: params.conditionName || null,
        category: params.category || null,
        midPrice: params.midYesPts / 100_000,
        spread: params.halfSpreadPts / 100_000,
        levels: params.levels,
        botsCount: this.bots.length,
        ordersPlaced: 0,
        pricePathMode: this.config.pricePathMode,
        trendPerTickPts: this.config.trendPerTickPts,
        sineAmplitudePts: this.config.sineAmplitudePts,
        sinePeriodTicks: this.config.sinePeriodTicks,
        meanReversion: this.config.meanReversion,
        startedAt: new Date().toISOString(),
        status: 'running',
      });
      this.marketBots.set(params.marketId, { bots: [...this.bots], config: this.config });
    } catch (error) {
      this.logger.error('Failed to fetch bot users:', error);
      throw error;
    }

    this.logger.info(`Starting ${this.bots.length} bots with config:`, {
      marketId: this.config.marketId,
      midYesPts: this.config.midYesPts.toString(),
      halfSpreadPts: this.config.halfSpreadPts.toString(),
      levels: this.config.levels,
      sizeContracts: this.config.sizeContracts,
      takerChance: this.config.takerChance,
      sizeVariance: this.config.sizeVariance,
      priceVariance: this.config.priceVariance,
      orderDelayMs: this.config.orderDelayMs,
      orderDelayVarianceMs: this.config.orderDelayVarianceMs,
    });

    // Start each bot
    for (const bot of this.bots) {
      await this.startBot(bot);
      await this.sleep(100); // Stagger starts
    }
  }

  async stopBots() {
    this.logger.info('Stopping all bots...');
    
    this.stopping = true;
    
    // Clear all scheduled timeouts
    for (const bot of this.bots) {
      if (bot.timeoutId) {
        clearTimeout(bot.timeoutId);
        bot.timeoutId = undefined;
      }
    }
    // Also clear multi-market bots
    for (const [, mb] of this.marketBots) {
      for (const bot of mb.bots) {
        if (bot.timeoutId) { clearTimeout(bot.timeoutId); bot.timeoutId = undefined; }
      }
    }
    
    const trackedBots = new Set<BotState>(this.bots);
    for (const [, mb] of this.marketBots) {
      for (const bot of mb.bots) trackedBots.add(bot);
    }

    const trackedBotList = Array.from(trackedBots);
    const CANCEL_BOT_BATCH_SIZE = 8;
    for (let i = 0; i < trackedBotList.length; i += CANCEL_BOT_BATCH_SIZE) {
      const batch = trackedBotList.slice(i, i + CANCEL_BOT_BATCH_SIZE);
      await Promise.all(batch.map(bot => this.cancelBotOrders(bot)));
    }

    const remainingOrders = Array.from(trackedBots).reduce((sum, bot) => sum + bot.liveOrders.length, 0);
    if (remainingOrders > 0) {
      for (const session of this.sessions.values()) {
        session.status = 'running';
        session.errorMessage = `Stop requested; ${remainingOrders} tracked order${remainingOrders === 1 ? '' : 's'} still settling`;
      }
      this.logger.warn(
        `Stop requested; ${remainingOrders} tracked bot order${remainingOrders === 1 ? '' : 's'} still settling after cancel wait`
      );
    }

    for (const bot of trackedBots) {
      bot.liveOrders = [];
      bot.timeoutId = undefined;
    }
    this.bots = [];
    this.config = null;
    this.sessions.clear();
    this.marketBots.clear();
    this.logger.info('All bots stopped and timeouts cleared');
  }

  /**
   * Start bots across ALL markets in a category.
   * Each subcategory has its own ladder curve: an array of mid-percents
   * that map 1:1 to markets sorted by maturity_date ASC.
   */
  async startCategoryBots(params: {
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
    pricePathMode?: PricePathMode;
    trendPerTickPts?: number;
    sineAmplitudePts?: number;
    sinePeriodTicks?: number;
    meanReversion?: number;
    /** Per-subcategory ladder curves: conditionName => midPercent[] (one per market, sorted by maturity) */
    subcategoryCurve: Record<string, number[]>;
    /** Optional condition_name allow-list inside the category. Empty/omitted means the whole category. */
    selectedSubcategories?: string[];
  }) {
    this.validateBotConfig(params);
    if (typeof params.category !== 'string' || !params.category.trim()) {
      throw new Error('category is required');
    }
    if (!params.subcategoryCurve || typeof params.subcategoryCurve !== 'object' || Array.isArray(params.subcategoryCurve)) {
      throw new Error('subcategoryCurve must be an object');
    }
    if (
      params.selectedSubcategories !== undefined &&
      (!Array.isArray(params.selectedSubcategories) || params.selectedSubcategories.some(value => typeof value !== 'string'))
    ) {
      throw new Error('selectedSubcategories must be an array of strings');
    }
    for (const curve of Object.values(params.subcategoryCurve)) {
      if (!Array.isArray(curve) || curve.some(value => typeof value !== 'number' || !Number.isFinite(value) || value < 0.1 || value > 99.9)) {
        throw new Error('subcategoryCurve prices must be finite numbers between 0.1 and 99.9');
      }
    }

    // Stop everything only after the replacement configuration is valid.
    await this.stopBots();
    this.stopping = false;

    const { category, userCount, subcategoryCurve, halfSpreadPts, levels, sizeContracts, takerChance } = params;
    const selectedSubcategories = new Set((params.selectedSubcategories || []).map(value => value.trim()).filter(Boolean));

    // 1. Fetch all markets in this insurance category
    const marketsResult = await this.databaseService.query(
      `SELECT id, name, condition_name, maturity_date, status
       FROM markets
       WHERE market_category = 'INSURANCE'
         AND insurance_category = $1
         AND status IN ('ACTIVE', 'OPEN')
       ORDER BY condition_name ASC, maturity_date ASC`,
      [category],
    );

    const selectedMarkets = selectedSubcategories.size > 0
      ? marketsResult.rows.filter((market: any) => selectedSubcategories.has(market.condition_name || 'default'))
      : marketsResult.rows;

    if (selectedMarkets.length === 0) {
      const suffix = selectedSubcategories.size > 0
        ? ` and subcategories: ${Array.from(selectedSubcategories).join(', ')}`
        : '';
      throw new Error(`No active markets found for category '${category}'${suffix}`);
    }

    this.logger.info(
      `Found ${selectedMarkets.length}/${marketsResult.rows.length} markets in category '${category}'` +
      (selectedSubcategories.size > 0 ? ` for subcategories: ${Array.from(selectedSubcategories).join(', ')}` : '')
    );

    // 2. Fetch ALL bot users once
    this.logger.info(`Fetching up to ${userCount} bot users...`);
    const botUsersResult = await this.databaseService.query(
      `SELECT id, email FROM users WHERE email LIKE '%@bot.local' ORDER BY RANDOM() LIMIT $1`,
      [userCount]
    );
    if (botUsersResult.rows.length === 0) {
      throw new Error('No bot users found in database.');
    }
    this.logger.info(`Found ${botUsersResult.rows.length} bot users, funding wallets...`);

    // Fund all bot users
    for (const row of botUsersResult.rows) {
      await this.databaseService.ensureWallet(row.id, 'GBP');
      await this.databaseService.query(
        `UPDATE wallets SET balance = 1000000.00, locked_balance = 0, updated_at = NOW() WHERE user_id = $1 AND currency = 'GBP'`,
        [row.id]
      );
    }
    this.logger.info(`All ${botUsersResult.rows.length} bot users funded to £1,000,000`);

    let marketCount = 0;
    let totalBotsStarted = 0;

    // 3. Group markets by condition_name and sort by maturity
    const grouped: Record<string, typeof marketsResult.rows> = {};
    for (const market of selectedMarkets) {
      const condName = market.condition_name || 'default';
      if (!grouped[condName]) grouped[condName] = [];
      grouped[condName].push(market);
    }
    // Sort each group by maturity_date ASC
    for (const condName of Object.keys(grouped)) {
      grouped[condName].sort((a, b) => {
        const da = a.maturity_date ? new Date(a.maturity_date).getTime() : 0;
        const db = b.maturity_date ? new Date(b.maturity_date).getTime() : 0;
        return da - db;
      });
    }

    // 4. For each market, pick its mid price from the ladder curve by index
    const orderedMarkets: { market: any; midPercent: number }[] = [];
    for (const [condName, markets] of Object.entries(grouped)) {
      const curveArr = subcategoryCurve[condName] || [];
      markets.forEach((market, idx) => {
        // Use the curve value at this index, or fallback to last value, or 50
        const midPercent = curveArr[idx] ?? curveArr[curveArr.length - 1] ?? 50;
        orderedMarkets.push({ market, midPercent });
      });
    }

    // Process markets in parallel batches of 6 for speed
    const BATCH_SIZE = 6;
    for (let batchStart = 0; batchStart < orderedMarkets.length; batchStart += BATCH_SIZE) {
      const batch = orderedMarkets.slice(batchStart, batchStart + BATCH_SIZE);
      this.logger.info(`Processing market batch ${Math.floor(batchStart / BATCH_SIZE) + 1}/${Math.ceil(orderedMarkets.length / BATCH_SIZE)} (markets ${batchStart + 1}-${batchStart + batch.length} of ${orderedMarkets.length})`);

      const batchPromises = batch.map(async ({ market, midPercent }) => {
        const condName = market.condition_name || 'default';
        const midYesPts = BigInt(Math.round((midPercent / 100) * 10_000_000));

        const config: BotConfig = {
          marketId: market.id,
          midYesPts,
          halfSpreadPts: BigInt(halfSpreadPts),
          levels,
          sizeContracts,
          takerChance,
          sizeVariance: params.sizeVariance || 0,
          priceVariance: params.priceVariance || 0,
          orderDelayMs: params.orderDelayMs || 0,
          orderDelayVarianceMs: params.orderDelayVarianceMs || 0,
          refreshIntervalMs: params.refreshIntervalMs || 0,
          priceDriftPts: params.priceDriftPts || 0,
          volatility: params.volatility || 0,
          pricePathMode: params.pricePathMode ?? 'random_walk',
          trendPerTickPts: params.trendPerTickPts ?? 0,
          sineAmplitudePts: params.sineAmplitudePts ?? 0,
          sinePeriodTicks: params.sinePeriodTicks ?? 20,
          meanReversion: params.meanReversion ?? 0.1,
        };

        // Create bot states for this market (all bots work all markets)
        const marketBotStates: BotState[] = botUsersResult.rows.map(row => ({
          userId: row.id,
          liveOrders: [],
          currentMidPts: midYesPts,
          priceTick: 0,
        }));

        // Track session
        this.sessions.set(market.id, {
          marketId: market.id,
          marketName: market.name,
          conditionName: condName,
          category,
          midPrice: midPercent,
          spread: halfSpreadPts / 100_000,
          levels,
          botsCount: marketBotStates.length,
          ordersPlaced: 0,
          pricePathMode: config.pricePathMode,
          trendPerTickPts: config.trendPerTickPts,
          sineAmplitudePts: config.sineAmplitudePts,
          sinePeriodTicks: config.sinePeriodTicks,
          meanReversion: config.meanReversion,
          startedAt: new Date().toISOString(),
          status: 'running',
        });
        this.marketBots.set(market.id, { bots: marketBotStates, config });

        this.logger.info(`[${condName}] Starting ${marketBotStates.length} bots on "${market.name}" @ ${midPercent}%`);

        let botsOk = 0;
        // Initial placement: skip orderDelay for speed
        for (const bot of marketBotStates) {
          try {
            await this.quoteOnce(bot, config, true); // skipDelay = true for initial placement
            if (config.refreshIntervalMs > 0) {
              this.scheduleRefreshForMarket(bot, market.id);
            }
            botsOk++;
          } catch (err) {
            this.logger.error(`Bot ${bot.userId} failed on market ${market.id}:`, err);
            const sess = this.sessions.get(market.id);
            if (sess) { sess.status = 'error'; sess.errorMessage = String(err); }
          }
          totalBotsStarted++;
          await this.sleep(20); // Small stagger
        }
        marketCount++;
        this.logger.info(`[${condName}] ✓ "${market.name}" — ${botsOk}/${marketBotStates.length} bots active`);
      });

      await Promise.all(batchPromises);
      await this.sleep(100); // Brief pause between batches
    }

    this.logger.info(`✓ Category bot launch complete: ${marketCount} markets, ${totalBotsStarted} bot sessions`);
    return { marketCount, totalBotsStarted, totalMarkets: selectedMarkets.length };
  }

  private scheduleRefreshForMarket(bot: BotState, marketId: string) {
    const mb = this.marketBots.get(marketId);
    if (!mb || this.stopping) return;
    const config = mb.config;

    bot.timeoutId = setTimeout(async () => {
      if (this.stopping) return;
      try {
        const failedCancels = await this.cancelBotOrders(bot);
        if (failedCancels > 0) {
          this.logger.warn(
            `Bot ${bot.userId} refresh delayed on market ${marketId}: ${failedCancels} previous order${failedCancels === 1 ? '' : 's'} still settling`
          );
          this.scheduleRefreshForMarket(bot, marketId);
          return;
        }
        this.driftPrice(bot, config);
        await this.quoteOnce(bot, config);
        this.scheduleRefreshForMarket(bot, marketId);
      } catch (error) {
        this.logger.error(`Bot ${bot.userId} refresh failed on market ${marketId}:`, error);
        this.scheduleRefreshForMarket(bot, marketId);
      }
    }, config.refreshIntervalMs);
  }

  private async startBot(bot: BotState) {
    if (!this.config) return;

    const config = this.config;
    
    // Place initial ladder
    await this.quoteOnce(bot, config).catch(err => 
      this.logger.error(`Bot ${bot.userId} order placement failed:`, err)
    );

    this.logger.info(`Bot ${bot.userId} completed initial order placement`);
    
    // Schedule periodic refresh if enabled
    if (config.refreshIntervalMs > 0) {
      this.scheduleRefresh(bot);
    }
  }

  private scheduleRefresh(bot: BotState) {
    if (!this.config || this.stopping) return;
    
    const config = this.config;
    
    bot.timeoutId = setTimeout(async () => {
      if (this.stopping) return;
      
      try {
        // Cancel existing orders
        const failedCancels = await this.cancelBotOrders(bot);
        if (failedCancels > 0) {
          this.logger.warn(
            `Bot ${bot.userId} refresh delayed: ${failedCancels} previous order${failedCancels === 1 ? '' : 's'} still settling`
          );
          this.scheduleRefresh(bot);
          return;
        }
        
        // Drift the mid price
        this.driftPrice(bot, config);
        
        // Place new orders at new price
        await this.quoteOnce(bot, config);
        
        // Schedule next refresh
        this.scheduleRefresh(bot);
      } catch (error) {
        this.logger.error(`Bot ${bot.userId} refresh failed:`, error);
        // Still schedule next refresh even on error
        this.scheduleRefresh(bot);
      }
    }, config.refreshIntervalMs);
  }

  private async cancelBotOrders(bot: BotState) {
    const orders = [...bot.liveOrders];
    
    if (orders.length === 0) {
      return 0;
    }

    const failedOrderIds = new Set<string>();
    const CANCEL_ORDER_BATCH_SIZE = 16;
    for (let i = 0; i < orders.length; i += CANCEL_ORDER_BATCH_SIZE) {
      const batch = orders.slice(i, i + CANCEL_ORDER_BATCH_SIZE);
      await Promise.all(batch.map(async (order) => {
      try {
        await axios.delete(`${this.RUST_EXCHANGE_URL}/api/orders/${order.id}`, {
          timeout: 15000,
          headers: {
            'X-User-Id': bot.userId,
          },
        });
      } catch (error) {
        failedOrderIds.add(order.id);
        if (axios.isAxiosError(error) && error.response) {
          this.logger.warn(`Failed to cancel bot order ${order.id} via Rust exchange`, {
            status: error.response.status,
            data: error.response.data,
          });
        } else {
          this.logger.warn(`Failed to cancel bot order ${order.id}:`, error);
        }
      }
      }));
    }

    const candidateOrderIds = failedOrderIds.size > 0
      ? Array.from(failedOrderIds)
      : orders.map(order => order.id);

    try {
      const stillOpen = await this.waitForBotOrdersToClose(candidateOrderIds, bot.userId, 5000);
      bot.liveOrders = orders.filter(order => stillOpen.has(order.id));
    } catch (error) {
      this.logger.warn(`Failed to reconcile bot order statuses for ${bot.userId}:`, error);
      bot.liveOrders = orders.filter(order => failedOrderIds.has(order.id));
    }

    return bot.liveOrders.length;
  }

  private async waitForBotOrdersToClose(orderIds: string[], userId: string, timeoutMs: number): Promise<Set<string>> {
    if (orderIds.length === 0) {
      return new Set();
    }

    const deadline = Date.now() + timeoutMs;
    let stillOpen = new Set<string>(orderIds);

    while (Date.now() < deadline) {
      const statusResult = await this.databaseService.query<{ id: string }>(
        `SELECT id
         FROM orders
         WHERE id = ANY($1::uuid[])
           AND user_id = $2
           AND status IN ('OPEN', 'PARTIALLY_MATCHED')`,
        [orderIds, userId],
      );

      stillOpen = new Set(statusResult.rows.map(row => row.id));
      if (stillOpen.size === 0) {
        return stillOpen;
      }

      await this.sleep(100);
    }

    return stillOpen;
  }

  private driftPrice(bot: BotState, config: BotConfig) {
    bot.priceTick += 1;

    const base = Number(config.midYesPts);
    const current = Number(bot.currentMidPts);
    const includeTrend = config.pricePathMode === 'linear' || config.pricePathMode === 'trend_sine';
    const includeSine = config.pricePathMode === 'sine' || config.pricePathMode === 'trend_sine';
    const trend = includeTrend ? config.trendPerTickPts * bot.priceTick : 0;
    const sine = includeSine
      ? config.sineAmplitudePts * Math.sin((2 * Math.PI * bot.priceTick) / config.sinePeriodTicks)
      : 0;
    const noise = config.priceDriftPts > 0
      ? config.priceDriftPts * (Math.random() * 2 - 1) * config.volatility
      : 0;

    const target = config.pricePathMode === 'random_walk' ? base : base + trend + sine;
    const next = config.pricePathMode === 'random_walk'
      ? current + noise + (base - current) * config.meanReversion
      : current + (target - current) * config.meanReversion + noise;

    bot.currentMidPts = this.clampYesPts(BigInt(Math.round(next)));
    
    this.logger.debug(`Bot ${bot.userId} ${config.pricePathMode} tick ${bot.priceTick} moved mid to ${(Number(bot.currentMidPts) / 10_000_000 * 100).toFixed(2)}%`);
  }

  private async quoteOnce(bot: BotState, config: BotConfig, skipDelay = false) {
    // Check if we're stopping
    if (this.stopping) return;
    
    // Use bot's current mid price (which drifts over time)
    const currentMid = bot.currentMidPts;
    
    // Place ladder with delays between orders
    for (let i = 0; i < config.levels; i++) {
      const offset = config.levels > 1
        ? (config.halfSpreadPts * BigInt(i)) / BigInt(config.levels - 1)
        : config.halfSpreadPts;

      // Apply price variance
      const priceVariance = config.priceVariance > 0
        ? Math.floor(Math.random() * config.priceVariance * 2 - config.priceVariance)
        : 0;
      
      const bidYes = this.clampYesPts(currentMid - offset + BigInt(priceVariance));
      const askYes = this.clampYesPts(currentMid + offset + BigInt(priceVariance));

      // Apply size variance
      const sizeVariance = config.sizeVariance > 0
        ? 1 + (Math.random() * config.sizeVariance * 2 - config.sizeVariance)
        : 1;
      const variedSize = config.sizeContracts * sizeVariance;
      const contractsMicros = BigInt(Math.round(variedSize * 1_000_000));

      // Place BUY_YES (bid)
      await this.placeOrder(bot, config.marketId, 'BUY_YES', bidYes, contractsMicros);
      
      // Delay before placing next order (skip during initial placement for speed)
      if (!skipDelay && config.orderDelayMs > 0) {
        const orderVariance = config.orderDelayVarianceMs > 0
          ? Math.random() * config.orderDelayVarianceMs * 2 - config.orderDelayVarianceMs
          : 0;
        const orderDelay = Math.max(0, config.orderDelayMs + orderVariance);
        await this.sleep(orderDelay);
      }

      // Place SELL_YES (ask)
      await this.placeOrder(bot, config.marketId, 'SELL_YES', askYes, contractsMicros);
      
      // Delay before next level (skip during initial placement for speed)
      if (!skipDelay && i < config.levels - 1 && config.orderDelayMs > 0) {
        const orderVariance = config.orderDelayVarianceMs > 0
          ? Math.random() * config.orderDelayVarianceMs * 2 - config.orderDelayVarianceMs
          : 0;
        const orderDelay = Math.max(0, config.orderDelayMs + orderVariance);
        await this.sleep(orderDelay);
      }
    }

    await this.maybeTaker(bot, config);
  }

  private async maybeTaker(bot: BotState, config: BotConfig) {
    if (Math.random() > config.takerChance) return;

    // Random side
    const side: Side = Math.random() < 0.5 ? 'BUY_YES' : 'SELL_YES';
    
    // Aggressive but valid prices: 99% for FOR (buying high), 1% for LAY (selling low)
    const yesPts = side === 'BUY_YES' ? 9900000n : 100000n; // 99% or 1%
    
    // Smaller size for takers
    const contractsMicros = BigInt(Math.round(config.sizeContracts * 0.5 * 1_000_000));

    await this.placeOrder(bot, config.marketId, side, yesPts, contractsMicros, 'IOC');
  }

  private async placeOrder(
    bot: BotState,
    marketId: string,
    side: Side,
    yesPts: bigint,
    contractsMicros: bigint,
    timeInForce: 'GTC' | 'IOC' = 'GTC'
  ) {
    // Log the prices being used
    if (yesPts < 10000n || yesPts > 9990000n) {
      this.logger.warn(`Bot ${bot.userId} placing ${side} order with extreme yesPts: ${yesPts} (${(Number(yesPts) / PRICE_SCALE * 100).toFixed(4)}%)`);
    }

    // Calculate risk (liability) using Rust exchange logic
    const limit_yes_pts = Number(yesPts);
    const contracts = Number(contractsMicros);
    const risk_pence = side === 'BUY_YES'
      ? Math.floor((contracts * limit_yes_pts * 100) / (PRICE_SCALE * 1_000_000))
      : Math.floor((contracts * (PRICE_SCALE - limit_yes_pts) * 100) / (PRICE_SCALE * 1_000_000));

    // Validate minimum risk
    if (risk_pence < 100) {
      this.logger.debug(`Bot ${bot.userId} order skipped: risk_pence ${risk_pence} is below minimum £1.00 (contracts: ${contracts / 1_000_000}, price: ${limit_yes_pts / 10_000_000 * 100}%)`);
      return;
    }

    const orderPayload = {
      market_id: marketId,
      side: side === 'BUY_YES' ? 'BuyYes' : 'SellYes',
      risk_pence,
      limit_yes_pts,
      time_in_force: timeInForce.toUpperCase(), // Rust expects "GTC" or "IOC"
    };

    this.logger.debug(`Bot ${bot.userId} placing order:`, orderPayload);

    try {
      // Call Rust exchange HTTP API to create order
      const response = await axios.post(`${this.RUST_EXCHANGE_URL}/api/orders`, orderPayload, {
        timeout: 5000,
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': bot.userId,
        }
      });

      const createdOrderId = response.data.order_id;

      if (timeInForce === 'GTC') {
        bot.liveOrders.push({ id: createdOrderId, side, yesPts });
      }

      this.logger.debug(`Bot ${bot.userId} placed ${side} order ${createdOrderId} at ${(Number(yesPts) / PRICE_SCALE * 100).toFixed(2)}%`);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        this.logger.error(`Failed to place bot order (${error.response.status}):`, {
          status: error.response.status,
          data: error.response.data,
          payload: orderPayload,
        });
      } else {
        this.logger.error(`Failed to place bot order:`, error);
      }
    }
  }

  private clampYesPts(yesPts: bigint): bigint {
    const MIN_PRICE = 10000n; // 0.1%
    const MAX_PRICE = 9990000n; // 99.9%
    
    if (yesPts < MIN_PRICE) return MIN_PRICE;
    if (yesPts > MAX_PRICE) return MAX_PRICE;
    return yesPts;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
