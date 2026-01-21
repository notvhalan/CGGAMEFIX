import { NatsConnection } from 'nats';
import { RedisClientType } from 'redis';
import { Logger } from '@betting-exchange/shared-config';

/**
 * Market Data Aggregator
 * 
 * Responsibilities:
 * 1. Derive OHLC candles from trade events (1m, 5m, 1h, 1d)
 * 2. Cache orderbook snapshots in Redis
 * 3. Track last trade price per market
 * 4. Calculate market statistics (volume, etc.)
 */
export class MarketDataAggregator {
  private candles: Map<string, any[]> = new Map(); // marketId -> candle array
  
  constructor(
    private nats: NatsConnection,
    private redis: RedisClientType,
    private logger: Logger
  ) {}
  
  async initialize() {
    // TODO: Load existing candles from database or cache
    this.logger.info('Market Data Aggregator initialized');
  }
  
  /**
   * Handle trade executed event - update candles
   */
  async handleTrade(event: any) {
    const { marketId, price, size, timestamp } = event;
    
    this.logger.debug('Processing trade for market data', { marketId, price });
    
    try {
      // Update last trade price in Redis
      await this.redis.set(`market:${marketId}:last_price`, price.toString());
      
      // Update volume
      const currentVolume = parseFloat((await this.redis.get(`market:${marketId}:volume`)) || '0');
      await this.redis.set(`market:${marketId}:volume`, (currentVolume + size).toString());
      
      // TODO: Update OHLC candles for different intervals
      // - 1 minute candles
      // - 5 minute candles
      // - 1 hour candles
      // - 1 day candles
      
      this.logger.debug('Market data updated', { marketId });
      
    } catch (error) {
      this.logger.error('Failed to update market data', error, { marketId });
    }
  }
  
  /**
   * Handle book delta event - update cached orderbook
   */
  async handleBookDelta(event: any) {
    const { marketId, side, price, sizeDelta } = event;
    
    this.logger.debug('Updating orderbook cache', { marketId, side, price });
    
    try {
      // Fetch current orderbook from Redis
      const cacheKey = `orderbook:${marketId}`;
      const cached = await this.redis.get(cacheKey);
      
      let orderbook = cached ? JSON.parse(cached) : { backs: [], lays: [] };
      
      // Update the appropriate side
      const sideKey = side === 'BACK' ? 'backs' : 'lays';
      const levels = orderbook[sideKey];
      
      // Find or create price level
      let level = levels.find((l: any) => l.price === price);
      
      if (!level) {
        level = { price, totalSize: 0 };
        levels.push(level);
      }
      
      // Update size
      level.totalSize += sizeDelta;
      
      // Remove level if size is 0
      if (level.totalSize <= 0) {
        orderbook[sideKey] = levels.filter((l: any) => l.price !== price);
      }
      
      // Sort levels
      if (side === 'BACK') {
        orderbook.backs.sort((a: any, b: any) => b.price - a.price); // Descending
      } else {
        orderbook.lays.sort((a: any, b: any) => a.price - b.price); // Ascending
      }
      
      orderbook.timestamp = new Date().toISOString();
      
      // Save back to Redis with TTL
      await this.redis.setEx(cacheKey, 300, JSON.stringify(orderbook)); // 5 minute TTL
      
      this.logger.debug('Orderbook cache updated', { marketId });
      
    } catch (error) {
      this.logger.error('Failed to update orderbook cache', error, { marketId });
    }
  }
  
  /**
   * Generate OHLC candle for a time interval
   */
  private async generateCandle(marketId: string, interval: string, trades: any[]) {
    if (trades.length === 0) return null;
    
    const prices = trades.map((t) => t.price);
    const volumes = trades.reduce((sum, t) => sum + t.size, 0);
    
    return {
      marketId,
      interval,
      timestamp: new Date(),
      open: prices[0],
      high: Math.max(...prices),
      low: Math.min(...prices),
      close: prices[prices.length - 1],
      volume: volumes,
      trades: trades.length,
    };
  }
}
