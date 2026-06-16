import axios from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LiquidityBotsService } from '../src/services/liquidity-bots.service';

const bot = () => ({
  userId: 'bot-user',
  liveOrders: [{ id: 'order-1', side: 'BUY_YES' as const, yesPts: 5_000_000n }],
  currentMidPts: 5_000_000n,
  priceTick: 0,
});

describe('LiquidityBotsService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('retains tracked orders and bot state when cancellation fails', async () => {
    const service = new LiquidityBotsService({} as never);
    const trackedBot = bot();
    (service as any).bots = [trackedBot];
    vi.spyOn(axios, 'delete').mockRejectedValue(new Error('exchange unavailable'));

    await expect(service.stopBots()).rejects.toThrow('Failed to cancel 1 tracked bot order');

    expect(trackedBot.liveOrders).toHaveLength(1);
    expect((service as any).bots).toEqual([trackedBot]);
  });

  it('clears tracked orders and bot state after successful cancellation', async () => {
    const service = new LiquidityBotsService({} as never);
    const trackedBot = bot();
    (service as any).bots = [trackedBot];
    vi.spyOn(axios, 'delete').mockResolvedValue({ data: {} });

    await service.stopBots();

    expect(trackedBot.liveOrders).toEqual([]);
    expect((service as any).bots).toEqual([]);
  });

  it('rejects invalid replacement config without stopping running bots', async () => {
    const service = new LiquidityBotsService({} as never);
    const trackedBot = bot();
    (service as any).bots = [trackedBot];
    const stopSpy = vi.spyOn(service, 'stopBots');

    await expect(service.startBots({
      marketId: 'market-1',
      userCount: '2' as unknown as number,
      midYesPts: 5_000_000,
      halfSpreadPts: 100_000,
      levels: 2,
      sizeContracts: 10,
      takerChance: 0,
    })).rejects.toThrow('Bot parameters must be finite numbers');

    expect(stopSpy).not.toHaveBeenCalled();
    expect((service as any).bots).toEqual([trackedBot]);
  });

  it('uses takerChance to place an IOC order', async () => {
    const service = new LiquidityBotsService({} as never);
    const trackedBot = { ...bot(), liveOrders: [] };
    const placeOrder = vi.fn().mockResolvedValue(undefined);
    (service as any).placeOrder = placeOrder;
    vi.spyOn(Math, 'random').mockReturnValue(0);

    await (service as any).quoteOnce(trackedBot, {
      marketId: 'market-1',
      midYesPts: 5_000_000n,
      halfSpreadPts: 100_000n,
      levels: 1,
      sizeContracts: 10,
      takerChance: 1,
      sizeVariance: 0,
      priceVariance: 0,
      orderDelayMs: 0,
      orderDelayVarianceMs: 0,
      refreshIntervalMs: 0,
      priceDriftPts: 0,
      volatility: 0,
      pricePathMode: 'random_walk',
      trendPerTickPts: 0,
      sineAmplitudePts: 0,
      sinePeriodTicks: 20,
      meanReversion: 0.1,
    });

    expect(placeOrder).toHaveBeenCalledTimes(3);
    expect(placeOrder.mock.calls[2][5]).toBe('IOC');
  });

  it('follows a deterministic linear equation when noise is disabled', () => {
    const service = new LiquidityBotsService({} as never);
    const trackedBot = { ...bot(), liveOrders: [] };

    (service as any).driftPrice(trackedBot, {
      midYesPts: 5_000_000n,
      pricePathMode: 'linear',
      trendPerTickPts: 100_000,
      sineAmplitudePts: 0,
      sinePeriodTicks: 20,
      meanReversion: 1,
      priceDriftPts: 0,
      volatility: 0,
    });

    expect(trackedBot.priceTick).toBe(1);
    expect(trackedBot.currentMidPts).toBe(5_100_000n);
  });

  it('follows a deterministic sine equation when noise is disabled', () => {
    const service = new LiquidityBotsService({} as never);
    const trackedBot = { ...bot(), liveOrders: [] };

    (service as any).driftPrice(trackedBot, {
      midYesPts: 5_000_000n,
      pricePathMode: 'sine',
      trendPerTickPts: 0,
      sineAmplitudePts: 1_000_000,
      sinePeriodTicks: 4,
      meanReversion: 1,
      priceDriftPts: 0,
      volatility: 0,
    });

    expect(trackedBot.currentMidPts).toBe(6_000_000n);
  });
});
