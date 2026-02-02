import { Injectable } from '@nestjs/common';
import { Logger } from '@betting-exchange/shared-config';
import { DatabaseService } from '../database/database.service';
import { NatsClient } from '../nats/nats.client';
import { NATS_SUBJECTS } from '../nats/subjects';
import { v4 as uuidv4 } from 'uuid';
import { PRICE_SCALE, CONTRACT_SCALE, stakeToContracts, liabilityToContracts } from '@betting-exchange/shared-types';

type Side = 'FOR' | 'LAY';

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
}

interface BotState {
  userId: string;
  liveOrders: Array<{ id: string; side: Side; yesPts: bigint }>;
  timeoutId?: NodeJS.Timeout; // Track timeout for cleanup
}

@Injectable()
export class LiquidityBotsService {
  private readonly logger = new Logger('LiquidityBotsService');
  private bots: BotState[] = [];
  private config: BotConfig | null = null;
  private stopping = false;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly natsClient: NatsClient,
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
  }) {
    // Stop any existing bots first
    this.stopBots();
    
    // Reset stopping flag
    this.stopping = false;

    // Clean up old bot users and their wallets
    try {
      await this.databaseService.query(
        `DELETE FROM wallets WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@bot.local')`
      );
      await this.databaseService.query(
        `DELETE FROM users WHERE email LIKE '%@bot.local'`
      );
      this.logger.info('Cleaned up old bot users');
    } catch (err) {
      this.logger.warn('Failed to clean up old bot users:', err);
    }

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
    };

    this.logger.info(`Creating ${params.userCount} bot users...`);

    // Create bot users
    for (let i = 0; i < params.userCount; i++) {
      const email = `liquiditybot_${Date.now()}_${i}@bot.local`;
      const name = `Bot ${i}`;

      try {
        // Create user
        const user = await this.databaseService.query(
          `INSERT INTO users (id, email, name, google_sub, created_at, updated_at)
           VALUES ($1, $2, $3, $4, NOW(), NOW())
           ON CONFLICT (email) DO UPDATE SET updated_at = NOW()
           RETURNING id`,
          [uuidv4(), email, name, `bot_${Date.now()}_${i}`]
        );

        const userId = user.rows[0].id;

        // Ensure wallet with plenty of funds (use GBP to match lockBalance default)
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
        });

        this.logger.info(`Created bot user: ${email} (${userId}) with balance £${fundResult.rows[0].balance}`);
      } catch (error) {
        this.logger.error(`Failed to create bot user ${i}`, error);
      }

      // Small delay to avoid hammering the DB
      await this.sleep(50);
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
    
    // Place initial ladder only - no periodic refresh
    await this.quoteOnce(bot, config).catch(err => 
      this.logger.error(`Bot ${bot.userId} order placement failed:`, err)
    );

    this.logger.info(`Bot ${bot.userId} completed initial order placement`);
  }

  private async quoteOnce(bot: BotState, config: BotConfig) {
    // Check if we're stopping
    if (this.stopping) return;
    
    // Place ladder with delays between orders
    for (let i = 0; i < config.levels; i++) {
      const offset = config.levels > 1
        ? (config.halfSpreadPts * BigInt(i)) / BigInt(config.levels - 1)
        : config.halfSpreadPts;

      // Apply price variance
      const priceVariance = config.priceVariance > 0
        ? Math.floor(Math.random() * config.priceVariance * 2 - config.priceVariance)
        : 0;
      
      const bidYes = this.clampYesPts(config.midYesPts - offset + BigInt(priceVariance));
      const askYes = this.clampYesPts(config.midYesPts + offset + BigInt(priceVariance));

      // Apply size variance
      const sizeVariance = config.sizeVariance > 0
        ? 1 + (Math.random() * config.sizeVariance * 2 - config.sizeVariance)
        : 1;
      const variedSize = config.sizeContracts * sizeVariance;
      const contractsMicros = BigInt(Math.round(variedSize * 1_000_000));

      // Place FOR (bid)
      await this.placeOrder(bot, config.marketId, 'FOR', bidYes, contractsMicros);
      
      // Delay before placing next order
      if (config.orderDelayMs > 0) {
        const orderVariance = config.orderDelayVarianceMs > 0
          ? Math.random() * config.orderDelayVarianceMs * 2 - config.orderDelayVarianceMs
          : 0;
        const orderDelay = Math.max(0, config.orderDelayMs + orderVariance);
        await this.sleep(orderDelay);
      }

      // Place LAY (ask)
      await this.placeOrder(bot, config.marketId, 'LAY', askYes, contractsMicros);
      
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
    const side: Side = Math.random() < 0.5 ? 'FOR' : 'LAY';
    
    // Aggressive but valid prices: 99% for FOR (buying high), 1% for LAY (selling low)
    const yesPts = side === 'FOR' ? 9900000n : 100000n; // 99% or 1%
    
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
    const orderId = uuidv4();
    const pPts = side === 'FOR' ? yesPts : BigInt(PRICE_SCALE) - yesPts;

    // Log the prices being used
    if (yesPts < 10000n || yesPts > 9990000n) {
      this.logger.warn(`Bot ${bot.userId} placing ${side} order with extreme yesPts: ${yesPts} (${(Number(yesPts) / PRICE_SCALE * 100).toFixed(4)}%)`);
    }

    // Calculate liability
    const maxLossPerContract = side === 'FOR' ? yesPts : BigInt(PRICE_SCALE) - yesPts;
    const liabilityPence = Number(
      (maxLossPerContract * contractsMicros) / (BigInt(PRICE_SCALE) * BigInt(1_000_000))
    );

    try {
      // Lock balance
      await this.databaseService.lockBalance(bot.userId, liabilityPence);

      // Store order
      await this.databaseService.createOrder({
        id: orderId,
        marketId,
        userId: bot.userId,
        side,
        pPts: Number(pPts),
        yesPts: Number(yesPts),
        liabilityPence,
        originalContractsMicros: contractsMicros.toString(),
        remainingContractsMicros: contractsMicros.toString(),
      });

      // Publish to matching engine
      this.natsClient.publish(NATS_SUBJECTS.ORDERS_SUBMIT, {
        orderId,
        userId: bot.userId,
        marketId,
        side,
        pPts: Number(pPts),
        yesPts: Number(yesPts),
        stakePence: side === 'FOR' ? liabilityPence : undefined,
        liabilityPence: side === 'LAY' ? liabilityPence : undefined,
        originalContractsMicros: contractsMicros.toString(),
        remainingContractsMicros: contractsMicros.toString(),
        timeInForce,
        timestamp: new Date().toISOString(),
      });

      if (timeInForce === 'GTC') {
        bot.liveOrders.push({ id: orderId, side, yesPts });
      }
    } catch (error) {
      this.logger.error(`Failed to place bot order:`, error);
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
