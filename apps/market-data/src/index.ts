import { validateEnv, BaseEnvSchema, createLogger } from '@betting-exchange/shared-config';
import { connect } from 'nats';
import { createClient } from 'redis';
import { NATS_SUBJECTS } from '@betting-exchange/shared-types';
import { MarketDataAggregator } from './aggregator';

const env = validateEnv(BaseEnvSchema);
const logger = createLogger('market-data', env.LOG_LEVEL);

async function main() {
  try {
    logger.info('Starting Market Data Service...');
    
    // Connect to NATS
    const nats = await connect({ servers: env.NATS_URL });
    logger.info('Connected to NATS');
    
    // Connect to Redis
    const redis = createClient({ url: env.REDIS_URL });
    await redis.connect();
    logger.info('Connected to Redis');
    
    // Initialize aggregator
    const aggregator = new MarketDataAggregator(nats, redis, logger);
    await aggregator.initialize();
    
    // Subscribe to trade events
    const tradeExecutedSub = nats.subscribe(NATS_SUBJECTS.EVENTS_TRADE_EXECUTED);
    
    // Subscribe to book delta events
    const bookDeltaSub = nats.subscribe(NATS_SUBJECTS.EVENTS_BOOK_DELTA);
    
    logger.info('Subscribed to market data events');
    
    // Process trade events for OHLC candles
    (async () => {
      for await (const msg of tradeExecutedSub) {
        try {
          const event = JSON.parse(msg.string());
          await aggregator.handleTrade(event);
        } catch (error) {
          logger.error('Failed to process trade', error);
        }
      }
    })();
    
    // Process book deltas for orderbook caching
    (async () => {
      for await (const msg of bookDeltaSub) {
        try {
          const event = JSON.parse(msg.string());
          await aggregator.handleBookDelta(event);
        } catch (error) {
          logger.error('Failed to process book delta', error);
        }
      }
    })();
    
    logger.info('Market Data Service started successfully');
    
    // Graceful shutdown
    const shutdown = async () => {
      logger.info('Shutting down gracefully...');
      await nats.drain();
      await redis.quit();
      process.exit(0);
    };
    
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
    
  } catch (error) {
    logger.error('Failed to start Market Data Service', error);
    process.exit(1);
  }
}

main();
