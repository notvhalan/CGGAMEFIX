import { useState } from "react";
import { Form, useRouteLoaderData, useNavigation } from "@remix-run/react";
import { Card, Badge, StatusBadge, DataTable, Button, Select, Slider } from "~/components/admin/ui";
import { botSessions, markets as mockMarkets } from "~/components/admin/data/mockData";
import { BOT_PRESETS } from "./admin";
import type { BotPreset } from "./admin";

export default function AdminBots() {
  const parentData = useRouteLoaderData<any>("routes/admin");
  const navigation = useNavigation();
  const realMarkets = parentData?.markets || [];
  const botUsers = parentData?.botUsers || [];

  const allMarkets = realMarkets.length > 0 ? realMarkets : mockMarkets;

  const [selectedMarket, setSelectedMarket] = useState(allMarkets[0]?.id || '');
  const [userCount, setUserCount] = useState(Math.min(20, botUsers?.length || 20));

  // Bot parameter state
  const [midPrice, setMidPrice] = useState(50);
  const [spread, setSpread] = useState(2.5);
  const [takerChance, setTakerChance] = useState(10);
  const [levels, setLevels] = useState(8);
  const [sizeContracts, setSizeContracts] = useState(10);
  const [orderDelayMs, setOrderDelayMs] = useState(12000);
  const [orderDelayVarianceMs, setOrderDelayVarianceMs] = useState(2000);
  const [sizeVariance, setSizeVariance] = useState(0);
  const [priceVariance, setPriceVariance] = useState(0);
  const [refreshIntervalMs, setRefreshIntervalMs] = useState(5000);
  const [priceDriftPts, setPriceDriftPts] = useState(200000);
  const [volatility, setVolatility] = useState(0.3);

  const isStarting = navigation.state === 'submitting' && navigation.formData?.get('action') === 'start-bots';
  const isStopping = navigation.state === 'submitting' && navigation.formData?.get('action') === 'stop-bots';

  const applyPreset = (p: BotPreset) => {
    setMidPrice(p.mid);
    setSpread(p.spread);
    setTakerChance(p.taker);
    setLevels(p.levels);
    setSizeContracts(p.size);
    setOrderDelayMs(p.delay);
    setOrderDelayVarianceMs(p.delayVar);
    setSizeVariance(p.sizeVar);
    setPriceVariance(p.priceVar);
    setRefreshIntervalMs(p.refresh);
    setPriceDriftPts(p.drift);
    setVolatility(p.vol);
  };

  const runningSessions = botSessions.filter(b => b.status === 'running');
  const errorSessions = botSessions.filter(b => b.status === 'error');

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-admin-text">Liquidity Bots</h1>
          <p className="text-sm text-admin-text-dim mt-1">Manage market-making bot sessions</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="green" dot pulseDot>{runningSessions.length} running</Badge>
          {errorSessions.length > 0 && <Badge variant="red" dot>{errorSessions.length} errors</Badge>}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Column 1: Controls */}
        <div className="xl:col-span-1 space-y-4">
          {/* Market & Bot Selection */}
          <Card title="Target Market">
            <Form method="post" className="space-y-4">
              <input type="hidden" name="action" value="start-bots" />
              <input type="hidden" name="midPrice" value={midPrice} />
              <input type="hidden" name="spread" value={spread} />
              <input type="hidden" name="takerChance" value={takerChance} />
              <input type="hidden" name="levels" value={levels} />
              <input type="hidden" name="sizeContracts" value={sizeContracts} />
              <input type="hidden" name="orderDelayMs" value={orderDelayMs} />
              <input type="hidden" name="orderDelayVarianceMs" value={orderDelayVarianceMs} />
              <input type="hidden" name="sizeVariance" value={sizeVariance} />
              <input type="hidden" name="priceVariance" value={priceVariance} />
              <input type="hidden" name="refreshIntervalMs" value={refreshIntervalMs} />
              <input type="hidden" name="priceDriftPts" value={priceDriftPts} />
              <input type="hidden" name="volatility" value={volatility} />

              <div>
                <label className="block text-xs font-medium text-admin-text-dim mb-1.5">Market</label>
                <select
                  name="marketId"
                  value={selectedMarket}
                  onChange={e => setSelectedMarket(e.target.value)}
                  className="w-full bg-admin-surface-2 border border-admin-border rounded-lg px-3 py-2 text-sm text-admin-text focus:outline-none focus:border-blue-500/50"
                >
                  {allMarkets.map((m: any) => (
                    <option key={m.id} value={m.id}>{m.name || m.title}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-admin-text-dim mb-1.5">
                  Bot Users: <span className="text-blue-400">{userCount}</span> / {botUsers.length || 20}
                </label>
                <input
                  type="range"
                  name="userCount"
                  min="1"
                  max={botUsers.length || 20}
                  value={userCount}
                  onChange={e => setUserCount(Number(e.target.value))}
                  className="w-full accent-blue-500"
                />
              </div>

              <Button type="submit" variant="primary" className="w-full" disabled={isStarting}>
                {isStarting ? '⏳ Starting...' : '🚀 Start Bots'}
              </Button>
            </Form>
          </Card>

          {/* Stop all bots */}
          <Card title="Emergency Stop">
            <Form method="post">
              <input type="hidden" name="action" value="stop-bots" />
              <Button type="submit" variant="danger" className="w-full" disabled={isStopping}>
                {isStopping ? '⏳ Stopping...' : '🛑 Stop All Bots'}
              </Button>
              <p className="text-xs text-admin-text-dim mt-2">
                Stops all running bot sessions across all markets immediately.
              </p>
            </Form>
          </Card>
        </div>

        {/* Column 2: Parameters */}
        <div className="xl:col-span-1 space-y-4">
          {/* Presets */}
          <Card title="Quick Presets">
            <div className="grid grid-cols-2 gap-2">
              {BOT_PRESETS.map((preset, i) => (
                <button
                  key={i}
                  onClick={() => applyPreset(preset)}
                  className="px-3 py-2.5 text-sm bg-admin-surface-2 border border-admin-border rounded-lg hover:bg-admin-surface-3 hover:border-blue-500/30 transition-colors text-admin-text text-left"
                >
                  <div className="font-medium">{preset.label}</div>
                  <div className="text-xs text-admin-text-dim mt-0.5">
                    Spread {preset.spread}% · {preset.levels} lvl
                  </div>
                </button>
              ))}
            </div>
          </Card>

          {/* Core Parameters */}
          <Card title="Core Parameters">
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-admin-text-dim mb-1">
                  Mid Price: <span className="text-blue-400">{midPrice}%</span>
                </label>
                <input type="range" min="10" max="90" step="1" value={midPrice} onChange={e => setMidPrice(Number(e.target.value))} className="w-full accent-blue-500" />
                <p className="text-[10px] text-admin-text-dim mt-0.5">Center point for all bot orders</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-admin-text-dim mb-1">
                  Half Spread: <span className="text-blue-400">{spread}%</span>
                </label>
                <input type="range" min="0.5" max="10" step="0.5" value={spread} onChange={e => setSpread(Number(e.target.value))} className="w-full accent-blue-500" />
                <p className="text-[10px] text-admin-text-dim mt-0.5">Distance from mid to furthest orders</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-admin-text-dim mb-1">
                  Taker Chance: <span className="text-blue-400">{takerChance}%</span>
                </label>
                <input type="range" min="0" max="50" step="5" value={takerChance} onChange={e => setTakerChance(Number(e.target.value))} className="w-full accent-blue-500" />
                <p className="text-[10px] text-admin-text-dim mt-0.5">Probability of aggressive market orders</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-admin-text-dim mb-1">Levels (per side)</label>
                  <input type="number" min="1" max="20" value={levels} onChange={e => setLevels(Number(e.target.value))}
                    className="w-full bg-admin-surface-2 border border-admin-border rounded-lg px-3 py-2 text-sm text-admin-text font-mono" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-admin-text-dim mb-1">Size (contracts)</label>
                  <input type="number" min="2" max="50" step="0.5" value={sizeContracts} onChange={e => setSizeContracts(Number(e.target.value))}
                    className="w-full bg-admin-surface-2 border border-admin-border rounded-lg px-3 py-2 text-sm text-admin-text font-mono" />
                </div>
              </div>
            </div>
          </Card>

          {/* Advanced */}
          <Card title="Advanced Settings">
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-admin-text-dim mb-1">Order Delay (ms)</label>
                  <input type="number" min="0" max="30000" step="1000" value={orderDelayMs} onChange={e => setOrderDelayMs(Number(e.target.value))}
                    className="w-full bg-admin-surface-2 border border-admin-border rounded-lg px-3 py-1.5 text-sm text-admin-text font-mono" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-admin-text-dim mb-1">Delay Var. (±ms)</label>
                  <input type="number" min="0" max="10000" step="500" value={orderDelayVarianceMs} onChange={e => setOrderDelayVarianceMs(Number(e.target.value))}
                    className="w-full bg-admin-surface-2 border border-admin-border rounded-lg px-3 py-1.5 text-sm text-admin-text font-mono" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-admin-text-dim mb-1">Size Var. (0-1)</label>
                  <input type="number" min="0" max="1" step="0.05" value={sizeVariance} onChange={e => setSizeVariance(Number(e.target.value))}
                    className="w-full bg-admin-surface-2 border border-admin-border rounded-lg px-3 py-1.5 text-sm text-admin-text font-mono" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-admin-text-dim mb-1">Price Var. (±pts)</label>
                  <input type="number" min="0" max="500000" step="10000" value={priceVariance} onChange={e => setPriceVariance(Number(e.target.value))}
                    className="w-full bg-admin-surface-2 border border-admin-border rounded-lg px-3 py-1.5 text-sm text-admin-text font-mono" />
                </div>
              </div>

              <div className="border-t border-admin-border pt-3">
                <h4 className="text-xs font-medium text-admin-text-dim mb-2">🎲 Dynamic Price Movement</h4>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-admin-text-dim mb-1">Refresh Interval (ms)</label>
                    <input type="number" min="0" max="60000" step="1000" value={refreshIntervalMs} onChange={e => setRefreshIntervalMs(Number(e.target.value))}
                      className="w-full bg-admin-surface-2 border border-admin-border rounded-lg px-3 py-1.5 text-sm text-admin-text font-mono" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-admin-text-dim mb-1">Drift (±pts)</label>
                      <input type="number" min="0" max="1000000" step="50000" value={priceDriftPts} onChange={e => setPriceDriftPts(Number(e.target.value))}
                        className="w-full bg-admin-surface-2 border border-admin-border rounded-lg px-3 py-1.5 text-sm text-admin-text font-mono" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-admin-text-dim mb-1">Volatility (0-1)</label>
                      <input type="number" min="0" max="1" step="0.1" value={volatility} onChange={e => setVolatility(Number(e.target.value))}
                        className="w-full bg-admin-surface-2 border border-admin-border rounded-lg px-3 py-1.5 text-sm text-admin-text font-mono" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* Column 3: Active Sessions */}
        <div className="xl:col-span-1 space-y-4">
          <Card title="Active Sessions" action={<Badge variant="green" dot pulseDot>{runningSessions.length} running</Badge>}>
            <div className="space-y-2">
              {botSessions.map(bot => (
                <div
                  key={bot.id}
                  className={`p-3 rounded-lg border transition-colors ${
                    bot.status === 'error'
                      ? 'bg-red-500/5 border-red-500/20'
                      : 'bg-admin-surface-2 border-admin-border hover:border-blue-500/30'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-admin-text truncate">{bot.marketName}</span>
                    <StatusBadge status={bot.status} />
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <span className="text-admin-text-dim">Bot</span>
                      <div className="text-admin-text font-mono truncate">{bot.botEmail.split('@')[0]}</div>
                    </div>
                    <div>
                      <span className="text-admin-text-dim">Orders</span>
                      <div className="text-admin-text font-mono">{bot.ordersPlaced.toLocaleString()}</div>
                    </div>
                    <div>
                      <span className="text-admin-text-dim">Trades</span>
                      <div className="text-admin-text font-mono">{bot.takerTrades}</div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-2 text-xs text-admin-text-dim">
                    <span>Avg spread: {(bot.avgSpread * 100).toFixed(1)}%</span>
                    <span>Last: {bot.lastRefresh}</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
