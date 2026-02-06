import { Injectable } from '@nestjs/common';
import { Logger } from '@betting-exchange/shared-config';
import { DatabaseService } from '../database/database.service';
import { v4 as uuidv4 } from 'uuid';
import { PRICE_SCALE, CONTRACT_SCALE, stakeToContracts, liabilityToContracts } from '@betting-exchange/shared-types';
import axios from 'axios';

type Side = 'BUY_YES' | 'SELL_YES';

interface BotConfig {
  marketId: string;
  midYesPts: bigint;
  halfSpreadPts: bigint;
  levels: number;
  sizeContracts: number;
  takerChance: number;
  sizeVariance: number; // Contract size variance (0-1, e.g., 0.2 = ±20%)
  priceVariance: number; // Price variance in pts (±pts)
  orderDelayMs: number; // Delay between individual order placements (ms)
  orderDelayVarianceMs: number; // Variance for order delay (±ms)
  refreshIntervalMs: number; // How often to cancel and replace orders (0 = never)
  priceDriftPts: number; // Max price drift per refresh (±pts)
  volatility: number; // Price volatility factor (0-1, higher = more volatile)
}

interface BotState {
  userId: string;
  liveOrders: Array<{ id: string; side: Side; yesPts: bigint }>;
  timeoutId?: NodeJS.Timeout; // Track timeout for cleanup
  currentMidPts: bigint; // Current mid price for this bot (drifts over time)
}

@Injectable()
export class LiquidityBotsService {
  private readonly logger = new Logger('LiquidityBotsService');
  private bots: BotState[] = [];
  private config: BotConfig | null = null;
  private stopping = false;
  private readonly RUST_EXCHANGE_URL = process.env.RUST_EXCHANGE_URL || 'http://localhost:3001';

  constructor(
    private readonly databaseService: DatabaseService,
  ) {}

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
  }) {
    // Stop any existing bots first
    this.stopBots();
    
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
    };

    this.logger.info(`Fetching ${params.userCount} existing bot users...`);

    // Fetch existing bot users from database
    try {
      const botUsersResult = await this.databaseService.query(
        `SELECT id, email FROM users WHERE email LIKE '%@bot.local' ORDER BY email LIMIT $1`,
        [params.userCount]
      );

      if (botUsersResult.rows.length === 0) {
        throw new Error('No bot users found in database. Please create bot users with @bot.local emails first.');
      }

      if (botUsersResult.rows.length < params.userCount) {
        this.logger.warn(`Only found ${botUsersResult.rows.length} bot users, requested ${params.userCount}`);
      }

      // Use existing bot users
      for (const row of botUsersResult.rows) {
        const userId = row.id;

        // Ensure wallet exists and is funded
        await this.databaseService.ensureWallet(userId, 'GBP');
        
        // Fund the wallet generously
        const fundResult = await this.databaseService.query(
          `UPDATE wallets 
           SET balance = 10000.00, 
               locked_balance = 0, 
               updated_at = NOW() 
           WHERE user_id = $1 AND currency = 'GBP'
           RETURNING balance`,
          [userId]
        );
        
        if (fundResult.rows.length === 0) {
          this.logger.error(`Failed to fund wallet for bot user ${userId}`);
          continue;
        }

        this.bots.push({
          userId,
          liveOrders: [],
          currentMidPts: BigInt(params.midYesPts),
        });

        this.logger.info(`Using bot user: ${row.email} (${userId}) with balance £${fundResult.rows[0].balance}`);
      }
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

  stopBots() {
    this.logger.info('Stopping all bots...');
    
    this.stopping = true;
    
    // Clear all scheduled timeouts
    for (const bot of this.bots) {
      if (bot.timeoutId) {
        clearTimeout(bot.timeoutId);
        bot.timeoutId = undefined;
      }
    }
    
    this.bots = [];
    this.config = null;
    
    this.logger.info('All bots stopped and timeouts cleared');
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
        await this.cancelBotOrders(bot);
        
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
    const orderIds = bot.liveOrders.map(o => o.id);
    bot.liveOrders = [];
    
    for (const orderId of orderIds) {
      try {
        // Call Rust exchange cancel endpoint (would need to be implemented)
        // For now, just mark orders as cancelled in DB
        await this.databaseService.query(
          `UPDATE orders SET status = 'CANCELLED' WHERE id = $1`,
          [orderId]
        );
      } catch (error) {
        this.logger.warn(`Failed to cancel bot order ${orderId}:`, error);
      }
    }
  }

  private driftPrice(bot: BotState, config: BotConfig) {
    if (config.priceDriftPts <= 0) return;
    
    // Random walk with mean reversion
    const drift = config.priceDriftPts * (Math.random() * 2 - 1) * (config.volatility + 0.1);
    const meanReversion = (Number(config.midYesPts) - Number(bot.currentMidPts)) * 0.1; // 10% pull back to original mid
    
    const newMid = bot.currentMidPts + BigInt(Math.round(drift + meanReversion));
    bot.currentMidPts = this.clampYesPts(newMid);
    
    this.logger.debug(`Bot ${bot.userId} mid price drifted to ${(Number(bot.currentMidPts) / 10_000_000 * 100).toFixed(2)}%`);
  }

  private async quoteOnce(bot: BotState, config: BotConfig) {
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
      
      // Delay before placing next order
      if (config.orderDelayMs > 0) {
        const orderVariance = config.orderDelayVarianceMs > 0
          ? Math.random() * config.orderDelayVarianceMs * 2 - config.orderDelayVarianceMs
          : 0;
        const orderDelay = Math.max(0, config.orderDelayMs + orderVariance);
        await this.sleep(orderDelay);
      }

      // Place SELL_YES (ask)
      await this.placeOrder(bot, config.marketId, 'SELL_YES', askYes, contractsMicros);
      
      // Delay before next level
      if (i < config.levels - 1 && config.orderDelayMs > 0) {
        const orderVariance = config.orderDelayVarianceMs > 0
          ? Math.random() * config.orderDelayVarianceMs * 2 - config.orderDelayVarianceMs
          : 0;
        const orderDelay = Math.max(0, config.orderDelayMs + orderVariance);
        await this.sleep(orderDelay);
      }
    }
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
