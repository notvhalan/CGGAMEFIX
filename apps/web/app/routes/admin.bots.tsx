import { useState, useCallback, useEffect, useMemo } from "react";
import { Form, useRouteLoaderData, useNavigation, useActionData } from "@remix-run/react";
import { Card, Badge, StatusBadge, Button } from "~/components/admin/ui";
import { BOT_PRESETS, SUBCATEGORIES, INS_SERIES } from "./admin";
import type { BotPreset } from "./admin";

// Re-export action from parent layout so Form POST submissions work
export { action } from "./admin";

// ─── Types ───────────────────────────────────────────────────────────────────

type TabMode = 'single' | 'category';

// ─── Ladder Curve Presets ────────────────────────────────────────────────────

const CURVE_PRESETS: { label: string; desc: string; fn: (count: number) => number[] }[] = [
  {
    label: '📏 Flat',
    desc: 'All at same price (50%)',
    fn: (n) => Array(n).fill(50),
  },
  {
    label: '📈 Rising',
    desc: 'Low→High (20→80)',
    fn: (n) => Array.from({ length: n }, (_, i) => Math.round(20 + (60 * i) / Math.max(n - 1, 1))),
  },
  {
    label: '📉 Falling',
    desc: 'High→Low (80→20)',
    fn: (n) => Array.from({ length: n }, (_, i) => Math.round(80 - (60 * i) / Math.max(n - 1, 1))),
  },
  {
    label: '🔔 Bell',
    desc: 'Center high, edges low',
    fn: (n) => Array.from({ length: n }, (_, i) => {
      const x = (2 * i) / Math.max(n - 1, 1) - 1;
      return Math.round(25 + 50 * Math.exp(-2 * x * x));
    }),
  },
  {
    label: '🪂 U-Shape',
    desc: 'Edges high, center low',
    fn: (n) => Array.from({ length: n }, (_, i) => {
      const x = (2 * i) / Math.max(n - 1, 1) - 1;
      return Math.round(25 + 50 * x * x);
    }),
  },
  {
    label: '🎲 Random',
    desc: 'Random 15-85',
    fn: (n) => Array.from({ length: n }, () => Math.round(15 + Math.random() * 70)),
  },
];

// ─── Component ───────────────────────────────────────────────────────────────

export default function AdminBots() {
  const parentData = useRouteLoaderData<any>("routes/admin");
  const actionData = useActionData<any>();
  const navigation = useNavigation();
  const realMarkets = parentData?.markets || [];
  const botUsers = parentData?.botUsers || [];
  const botStatus = parentData?.botStatus || actionData?.botStatus || null;
  const insuranceMarkets: Record<string, any[]> = parentData?.insuranceMarkets || {};

  // ─── Tab state ─────────────────────────────────────────────────────────────
  const [mode, setMode] = useState<TabMode>('category');

  // ─── Single market state ───────────────────────────────────────────────────
  const [selectedMarket, setSelectedMarket] = useState(realMarkets[0]?.id || '');
  const [userCount, setUserCount] = useState(Math.min(10, botUsers?.length || 10));

  // ─── Category state ────────────────────────────────────────────────────────
  const [selectedCategory, setSelectedCategory] = useState('life');
  const [selectedSubcatsByCategory, setSelectedSubcatsByCategory] = useState<Record<string, string[]>>({});

  // ─── Shared bot parameters ─────────────────────────────────────────────────
  const [midPrice, setMidPrice] = useState(50);
  const [spread, setSpread] = useState(2.5);
  const [takerChance, setTakerChance] = useState(10);
  const [levels, setLevels] = useState(8);
  const [sizeContracts, setSizeContracts] = useState(10);
  const [orderDelayMs, setOrderDelayMs] = useState(2000);
  const [orderDelayVarianceMs, setOrderDelayVarianceMs] = useState(1000);
  const [sizeVariance, setSizeVariance] = useState(0.2);
  const [priceVariance, setPriceVariance] = useState(50000);
  const [refreshIntervalMs, setRefreshIntervalMs] = useState(5000);
  const [priceDriftPts, setPriceDriftPts] = useState(200000);
  const [volatility, setVolatility] = useState(0.3);
  const [pricePathMode, setPricePathMode] = useState<'random_walk' | 'linear' | 'sine' | 'trend_sine'>('random_walk');
  const [trendPerTickPts, setTrendPerTickPts] = useState(0);
  const [sineAmplitudePts, setSineAmplitudePts] = useState(500000);
  const [sinePeriodTicks, setSinePeriodTicks] = useState(20);
  const [meanReversion, setMeanReversion] = useState(0.25);

  // ─── Per-subcategory ladder curves ──────────────────────────────────────────
  // Each subcategory has multiple markets (by maturity date). The curve is an
  // array of mid prices, one per market, sorted by maturity date ASC.
  // Structure: { category: { conditionName: number[] } }
  const hardcodedSubcats = useMemo(() => SUBCATEGORIES[selectedCategory] || [], [selectedCategory]);

  // Group insurance markets by conditionName within the selected category
  const subcatMarkets = useMemo(() => {
    const markets = insuranceMarkets[selectedCategory] || [];
    const grouped: Record<string, any[]> = {};
    for (const m of markets) {
      const cond = m.conditionName || 'Other';
      if (!grouped[cond]) grouped[cond] = [];
      grouped[cond].push(m);
    }
    // Sort each group by maturity date ASC
    for (const key of Object.keys(grouped)) {
      grouped[key].sort((a: any, b: any) => {
        const da = a.maturityDate ? new Date(a.maturityDate).getTime() : 0;
        const db = b.maturityDate ? new Date(b.maturityDate).getTime() : 0;
        return da - db;
      });
    }
    return grouped;
  }, [insuranceMarkets, selectedCategory]);

  // Derive subcats from ACTUAL market data, falling back to hardcoded labels
  // This ensures the UI shows whatever conditionName values are in the DB
  const subcats = useMemo(() => {
    const realCondNames = Object.keys(subcatMarkets);
    if (realCondNames.length === 0) return hardcodedSubcats;
    // Build entries from real data; use hardcoded slugs if conditionName matches a label
    const hardcodedByLabel = new Map(hardcodedSubcats.map(s => [s.label, s]));
    const result: { slug: string; label: string; template: string }[] = [];
    for (const cond of realCondNames) {
      const match = hardcodedByLabel.get(cond);
      result.push(match || {
        slug: cond.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        label: cond,
        template: '',
      });
    }
    return result;
  }, [subcatMarkets, hardcodedSubcats]);

  const selectedSubcategoryLabels = useMemo(() => {
    const stored = selectedSubcatsByCategory[selectedCategory];
    if (stored !== undefined) return stored.filter(label => subcats.some(s => s.label === label));
    return subcats.map(s => s.label);
  }, [selectedSubcatsByCategory, selectedCategory, subcats]);

  useEffect(() => {
    setSelectedSubcatsByCategory(prev => {
      const validLabels = subcats.map(s => s.label);
      const existing = prev[selectedCategory];
      if (existing !== undefined) {
        const filtered = existing.filter(label => validLabels.includes(label));
        if (filtered.length === existing.length) return prev;
        return { ...prev, [selectedCategory]: filtered };
      }
      if (validLabels.length === 0) return prev;
      return { ...prev, [selectedCategory]: validLabels };
    });
  }, [selectedCategory, subcats]);

  const toggleSelectedSubcategory = useCallback((label: string) => {
    setSelectedSubcatsByCategory(prev => {
      const current = prev[selectedCategory] || subcats.map(s => s.label);
      const next = current.includes(label)
        ? current.filter(item => item !== label)
        : [...current, label];
      return { ...prev, [selectedCategory]: next };
    });
  }, [selectedCategory, subcats]);

  const selectAllSubcategories = useCallback(() => {
    setSelectedSubcatsByCategory(prev => ({ ...prev, [selectedCategory]: subcats.map(s => s.label) }));
  }, [selectedCategory, subcats]);

  const clearSelectedSubcategories = useCallback(() => {
    setSelectedSubcatsByCategory(prev => ({ ...prev, [selectedCategory]: [] }));
  }, [selectedCategory]);

  // Curve values: category → conditionName → number[] (one value per market)
  // Initialized lazily — defaults are created on-demand by getCurve() when
  // a conditionName is first accessed, so we don't need to guess the names.
  const [curveValues, setCurveValues] = useState<Record<string, Record<string, number[]>>>({});

  // Expanded subcategory sections
  const [expandedSubcats, setExpandedSubcats] = useState<Set<string>>(() => new Set());
  const toggleSubcat = useCallback((label: string) => {
    setExpandedSubcats(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }, []);

  // Get current curve for a subcategory, ensuring it matches real market count.
  // If no curve exists yet, generate a Rising default.
  const getCurve = useCallback((condLabel: string): number[] => {
    const stored = curveValues[selectedCategory]?.[condLabel] || [];
    const marketCount = subcatMarkets[condLabel]?.length || 6;
    if (stored.length === marketCount) return stored;
    // No stored curve (or wrong length): generate a rising default
    if (stored.length === 0) {
      return CURVE_PRESETS[1].fn(marketCount); // Rising
    }
    // Re-size: extend or truncate
    if (stored.length < marketCount) {
      const last = stored[stored.length - 1] ?? 50;
      return [...stored, ...Array(marketCount - stored.length).fill(last)];
    }
    return stored.slice(0, marketCount);
  }, [curveValues, selectedCategory, subcatMarkets]);

  // Set a single market's mid price within a subcategory curve
  const setCurveValue = useCallback((condLabel: string, idx: number, value: number) => {
    setCurveValues(prev => {
      const catCurves = { ...prev[selectedCategory] };
      const arr = [...(getCurve(condLabel))];
      arr[idx] = value;
      catCurves[condLabel] = arr;
      return { ...prev, [selectedCategory]: catCurves };
    });
  }, [selectedCategory, getCurve]);

  // Apply a curve preset to a single subcategory
  const applyPresetToSubcat = useCallback((condLabel: string, presetFn: (n: number) => number[]) => {
    const marketCount = subcatMarkets[condLabel]?.length || 6;
    const values = presetFn(marketCount);
    setCurveValues(prev => {
      const catCurves = { ...prev[selectedCategory] };
      catCurves[condLabel] = values;
      return { ...prev, [selectedCategory]: catCurves };
    });
  }, [selectedCategory, subcatMarkets]);

  // Apply a curve preset to ALL subcategories in the selected category
  const applyPresetToAll = useCallback((presetFn: (n: number) => number[]) => {
    setCurveValues(prev => {
      const catCurves: Record<string, number[]> = {};
      for (const s of subcats) {
        const marketCount = subcatMarkets[s.label]?.length || 6;
        catCurves[s.label] = presetFn(marketCount);
      }
      return { ...prev, [selectedCategory]: catCurves };
    });
  }, [selectedCategory, subcats, subcatMarkets]);

  // ─── Submission states ─────────────────────────────────────────────────────
  const isStarting = navigation.state === 'submitting' && (
    navigation.formData?.get('action') === 'start-bots' ||
    navigation.formData?.get('action') === 'start-bots-category'
  );
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

  // ─── Real sessions from API ────────────────────────────────────────────────
  const sessions: any[] = botStatus?.sessions || [];
  const runningSessions = sessions.filter((s: any) => s.status === 'running');
  const errorSessions = sessions.filter((s: any) => s.status === 'error');

  // Build subcategoryCurve JSON for the form: conditionName => midPercent[] per market
  const subcategoryCurveJson = useMemo(() => {
    const curve: Record<string, number[]> = {};
    for (const s of subcats.filter(s => selectedSubcategoryLabels.includes(s.label))) {
      curve[s.label] = getCurve(s.label);
    }
    return JSON.stringify(curve);
  }, [subcats, selectedSubcategoryLabels, getCurve]);

  const selectedSubcategoriesJson = useMemo(() => {
    return JSON.stringify(selectedSubcategoryLabels);
  }, [selectedSubcategoryLabels]);

  // Category market counts
  const catMarketCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const [cat, contracts] of Object.entries(insuranceMarkets)) {
      counts[cat] = contracts.length;
    }
    return counts;
  }, [insuranceMarkets]);

  const selectedMarketCount = useMemo(() => {
    return selectedSubcategoryLabels.reduce((sum, label) => sum + (subcatMarkets[label]?.length || 0), 0);
  }, [selectedSubcategoryLabels, subcatMarkets]);

  // ─── Input class helpers ───────────────────────────────────────────────────
  const inputCls = "w-full bg-admin-surface-2 border border-admin-border rounded-lg px-3 py-1.5 text-sm text-admin-text font-mono focus:outline-none focus:border-blue-500/50";
  const labelCls = "block text-xs font-medium text-admin-text-dim mb-1";
  const disabledInputCls = `${inputCls} disabled:cursor-not-allowed disabled:opacity-40`;

  return (
    <div className="space-y-4">
      {/* Action Feedback */}
      {actionData?.success && actionData?.message && (
        <div className="px-4 py-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-300 text-sm">
          ✅ {actionData.message}
        </div>
      )}
      {actionData && !actionData.success && actionData?.error && (
        <div className="px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-300 text-sm">
          ❌ {typeof actionData.error === 'string' ? actionData.error : JSON.stringify(actionData.error)}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-admin-text">Liquidity Bots</h1>
          <p className="text-sm text-admin-text-dim mt-1">Configure bounded market-making sessions and price equations</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="green" dot pulseDot>{runningSessions.length} running</Badge>
          {errorSessions.length > 0 && <Badge variant="red" dot>{errorSessions.length} errors</Badge>}
          <Form method="post">
            <input type="hidden" name="action" value="bot-status" />
            <Button type="submit" variant="secondary" className="text-xs px-2 py-1">
              🔄 Refresh
            </Button>
          </Form>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <div className="rounded-lg border border-admin-border bg-admin-surface px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider text-admin-text-dim">Bot workers</div>
          <div className="mt-1 text-lg font-semibold text-admin-text">{botStatus?.totalBots || 0}</div>
        </div>
        <div className="rounded-lg border border-admin-border bg-admin-surface px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider text-admin-text-dim">Tracked orders</div>
          <div className="mt-1 text-lg font-semibold text-admin-text">{botStatus?.totalOrders || 0}</div>
        </div>
        <div className="rounded-lg border border-admin-border bg-admin-surface px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider text-admin-text-dim">Available users</div>
          <div className="mt-1 text-lg font-semibold text-admin-text">{botUsers.length}</div>
        </div>
        <div className="rounded-lg border border-admin-border bg-admin-surface px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider text-admin-text-dim">Selected equation</div>
          <div className="mt-1 truncate text-sm font-semibold text-blue-400">{pricePathMode.replace('_', ' + ')}</div>
        </div>
      </div>

      {/* Mode Tabs */}
      <div className="grid grid-cols-2 gap-1 bg-admin-surface-2 p-1 rounded-lg sm:w-fit" role="tablist" aria-label="Bot launch mode">
        <button
          onClick={() => setMode('single')}
          className={`px-4 py-2 text-sm rounded-md transition-colors ${
            mode === 'single' ? 'bg-blue-500/20 text-blue-400 font-medium' : 'text-admin-text-dim hover:text-admin-text'
          }`}
        >
          🎯 Single Market
        </button>
        <button
          onClick={() => setMode('category')}
          className={`px-4 py-2 text-sm rounded-md transition-colors ${
            mode === 'category' ? 'bg-blue-500/20 text-blue-400 font-medium' : 'text-admin-text-dim hover:text-admin-text'
          }`}
        >
          📦 Category Mass Start
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(260px,0.8fr)_minmax(340px,1.2fr)_minmax(300px,1fr)]">
        {/* ─── Column 1: Target ───────────────────────────────────────────── */}
        <div className="xl:col-span-1 space-y-4">
          {mode === 'single' ? (
            <Card title="🎯 Target Market">
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
                <input type="hidden" name="pricePathMode" value={pricePathMode} />
                <input type="hidden" name="trendPerTickPts" value={trendPerTickPts} />
                <input type="hidden" name="sineAmplitudePts" value={sineAmplitudePts} />
                <input type="hidden" name="sinePeriodTicks" value={sinePeriodTicks} />
                <input type="hidden" name="meanReversion" value={meanReversion} />

                <div>
                  <label className={labelCls}>Market</label>
                  <select name="marketId" value={selectedMarket}
                    onChange={e => setSelectedMarket(e.target.value)} className={inputCls}>
                    {realMarkets.map((m: any) => (
                      <option key={m.id} value={m.id}>{m.name || m.title}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className={labelCls}>
                    Bot Users: <span className="text-blue-400">{userCount}</span> / {botUsers.length || 20}
                  </label>
                  <input type="range" name="userCount" min="1" max={botUsers.length || 20} value={userCount}
                    onChange={e => setUserCount(Number(e.target.value))} className="w-full accent-blue-500" />
                </div>

                <Button type="submit" variant="primary" className="w-full" disabled={isStarting || !selectedMarket || botUsers.length === 0}>
                  {isStarting ? '⏳ Starting...' : '🚀 Start Bots'}
                </Button>
              </Form>
            </Card>
          ) : (
            <Card title="📦 Category Mass Start">
              <Form method="post" className="space-y-4">
                <input type="hidden" name="action" value="start-bots-category" />
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
                <input type="hidden" name="pricePathMode" value={pricePathMode} />
                <input type="hidden" name="trendPerTickPts" value={trendPerTickPts} />
                <input type="hidden" name="sineAmplitudePts" value={sineAmplitudePts} />
                <input type="hidden" name="sinePeriodTicks" value={sinePeriodTicks} />
                <input type="hidden" name="meanReversion" value={meanReversion} />
                <input type="hidden" name="subcategoryCurve" value={subcategoryCurveJson} />
                <input type="hidden" name="selectedSubcategories" value={selectedSubcategoriesJson} />

                <div>
                  <label className={labelCls}>Insurance Category</label>
                  <select name="category" value={selectedCategory}
                    onChange={e => setSelectedCategory(e.target.value)} className={inputCls}>
                    {Object.entries(INS_SERIES).map(([slug, meta]) => (
                      <option key={slug} value={slug}>
                        {meta.icon} {meta.label} ({catMarketCounts[slug] || 0} markets)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="rounded-lg border border-admin-border bg-admin-surface-2 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <label className={labelCls}>Subcategories to Start</label>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={selectAllSubcategories}
                        className="rounded border border-admin-border bg-admin-surface px-2 py-1 text-[10px] text-admin-text-dim hover:text-admin-text"
                      >
                        All
                      </button>
                      <button
                        type="button"
                        onClick={clearSelectedSubcategories}
                        className="rounded border border-admin-border bg-admin-surface px-2 py-1 text-[10px] text-admin-text-dim hover:text-admin-text"
                      >
                        None
                      </button>
                    </div>
                  </div>
                  <div className="max-h-48 space-y-1 overflow-y-auto pr-1 admin-scrollbar">
                    {subcats.map((s) => {
                      const mktCount = subcatMarkets[s.label]?.length || 0;
                      const checked = selectedSubcategoryLabels.includes(s.label);
                      return (
                        <label
                          key={s.slug}
                          className={`flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 text-xs transition-colors ${
                            checked
                              ? 'border-blue-500/30 bg-blue-500/10 text-admin-text'
                              : 'border-admin-border bg-admin-surface text-admin-text-dim hover:text-admin-text'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleSelectedSubcategory(s.label)}
                            className="accent-blue-500"
                          />
                          <span className="min-w-0 flex-1 truncate">{s.label}</span>
                          <span className="font-mono text-[10px] text-admin-text-dim">{mktCount} mkts</span>
                        </label>
                      );
                    })}
                  </div>
                  <div className="mt-2 text-[10px] text-admin-text-dim">
                    Only selected market types in this category will receive bot sessions.
                  </div>
                </div>

                <div>
                  <label className={labelCls}>
                    Bot Users: <span className="text-blue-400">{userCount}</span> / {botUsers.length || 20}
                  </label>
                  <input type="range" name="userCount" min="1" max={botUsers.length || 20} value={userCount}
                    onChange={e => setUserCount(Number(e.target.value))} className="w-full accent-blue-500" />
                </div>

                <div className="p-3 bg-admin-surface-2 rounded-lg border border-admin-border text-xs text-admin-text-dim">
                  <div className="flex justify-between mb-1">
                    <span>Selected markets:</span>
                    <span className="text-admin-text font-mono">{selectedMarketCount}</span>
                  </div>
                  <div className="flex justify-between mb-1">
                    <span>Total category markets:</span>
                    <span className="text-admin-text font-mono">{catMarketCounts[selectedCategory] || 0}</span>
                  </div>
                  <div className="flex justify-between mb-1">
                    <span>Selected subcategories:</span>
                    <span className="text-admin-text font-mono">{selectedSubcategoryLabels.length}/{subcats.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Bots per market:</span>
                    <span className="text-admin-text font-mono">{userCount}</span>
                  </div>
                </div>

                <Button type="submit" variant="primary" className="w-full" disabled={isStarting || selectedMarketCount === 0 || botUsers.length === 0}>
                  {isStarting ? 'Starting...' : `Start Bots on ${selectedMarketCount} Selected Markets`}
                </Button>
              </Form>
            </Card>
          )}

          {/* Emergency Stop */}
          <Card title="Stop All Sessions">
            <Form method="post">
              <input type="hidden" name="action" value="stop-bots" />
              <Button type="submit" variant="danger" className="w-full" disabled={isStopping || sessions.length === 0}>
                {isStopping ? '⏳ Stopping...' : '🛑 Stop All Bots'}
              </Button>
              <p className="text-xs text-admin-text-dim mt-2">
                Cancels tracked bot orders, then stops all running sessions.
              </p>
              {sessions.length === 0 && (
                <p className="mt-2 text-[10px] text-admin-text-dim">No active sessions are currently tracked.</p>
              )}
            </Form>
          </Card>

          {/* Quick Presets */}
          <Card title="Quick Presets">
            <div className="grid grid-cols-2 gap-2">
              {BOT_PRESETS.map((preset, i) => (
                <button key={i} onClick={() => applyPreset(preset)}
                  className="px-3 py-2.5 text-sm bg-admin-surface-2 border border-admin-border rounded-lg hover:bg-admin-surface-3 hover:border-blue-500/30 transition-colors text-admin-text text-left">
                  <div className="font-medium">{preset.label}</div>
                  <div className="text-xs text-admin-text-dim mt-0.5">Spread {preset.spread}% · {preset.levels} lvl</div>
                </button>
              ))}
            </div>
          </Card>
        </div>

        {/* ─── Column 2: Parameters ───────────────────────────────────────── */}
        <div className="xl:col-span-1 space-y-4">
          {/* Subcategory Ladder Curves (category mode only) */}
          {mode === 'category' && (
            <Card title={`📊 Ladder Curves — ${INS_SERIES[selectedCategory]?.label || selectedCategory}`}>
              {/* Global curve presets — apply to ALL subcategories */}
              <div className="mb-3">
                <div className="text-[10px] uppercase font-medium text-admin-text-dim mb-1.5 tracking-wider">Apply to all subcategories</div>
                <div className="grid grid-cols-3 gap-1.5">
                  {CURVE_PRESETS.map((cp, i) => (
                    <button key={i} onClick={() => applyPresetToAll(cp.fn)}
                      className="px-2 py-1.5 text-xs bg-admin-surface-2 border border-admin-border rounded-md hover:bg-admin-surface-3 hover:border-blue-500/30 transition-colors text-admin-text"
                      title={cp.desc}>
                      {cp.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Per-subcategory sections */}
              <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                {subcats.map((s) => {
                  const curve = getCurve(s.label);
                  const markets = subcatMarkets[s.label] || [];
                  const mktCount = markets.length;
                  const isExpanded = expandedSubcats.has(s.label);
                  const avg = mktCount > 0 ? Math.round(curve.reduce((a, b) => a + b, 0) / curve.length) : 0;
                  const min = mktCount > 0 ? Math.min(...curve) : 0;
                  const max = mktCount > 0 ? Math.max(...curve) : 0;

                  return (
                    <div key={s.slug} className="border border-admin-border rounded-lg overflow-hidden">
                      {/* Header — always visible */}
                      <button
                        onClick={() => toggleSubcat(s.label)}
                        className="w-full flex items-center gap-2 px-3 py-2 bg-admin-surface-2 hover:bg-admin-surface-3 transition-colors text-left"
                      >
                        <span className="text-xs text-admin-text-dim">{isExpanded ? '▼' : '▶'}</span>
                        <span className="text-sm font-medium text-admin-text flex-1 truncate">{s.label}</span>
                        {mktCount > 0 && (
                          <>
                            {/* Mini sparkline preview */}
                            <div className="flex items-end gap-[2px] h-4 shrink-0">
                              {curve.map((v, idx) => (
                                <div key={idx} className="w-[3px] rounded-t-sm bg-blue-400/60"
                                  style={{ height: `${Math.max(10, (v / 95) * 100)}%` }} />
                              ))}
                            </div>
                            <span className="text-[10px] text-admin-text-dim font-mono shrink-0">
                              {min}-{max}% · {mktCount} mkts
                            </span>
                          </>
                        )}
                        {mktCount === 0 && (
                          <span className="text-[10px] text-admin-text-dim italic">no markets</span>
                        )}
                      </button>

                      {/* Expanded body */}
                      {isExpanded && mktCount > 0 && (
                        <div className="px-3 py-2.5 space-y-2.5 bg-admin-bg/50">
                          {/* Per-subcategory curve presets */}
                          <div className="flex items-center gap-1 flex-wrap">
                            <span className="text-[9px] text-admin-text-dim mr-1">Shape:</span>
                            {CURVE_PRESETS.map((cp, ci) => (
                              <button key={ci} onClick={() => applyPresetToSubcat(s.label, cp.fn)}
                                className="px-1.5 py-0.5 text-[10px] bg-admin-surface-2 border border-admin-border rounded hover:bg-admin-surface-3 hover:border-blue-500/30 transition-colors text-admin-text"
                                title={cp.desc}>
                                {cp.label.split(' ')[0]}
                              </button>
                            ))}
                          </div>

                          {/* Visual bar chart for this subcategory */}
                          <div className="flex items-end gap-1 h-16 px-1">
                            {curve.map((val, idx) => {
                              const pct = Math.max(8, (val / 95) * 100);
                              const matDate = markets[idx]?.maturityDate;
                              const label = matDate
                                ? new Date(matDate).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })
                                : `#${idx + 1}`;
                              return (
                                <div key={idx} className="flex-1 flex flex-col items-center gap-0.5">
                                  <span className="text-[8px] text-admin-text-dim font-mono">{val}</span>
                                  <div className="w-full rounded-t-sm transition-all"
                                    style={{ height: `${pct}%`, background: `hsl(${210 + val * 1.5}, 70%, ${40 + val * 0.2}%)` }} />
                                  <span className="text-[7px] text-admin-text-dim font-mono leading-none">{label}</span>
                                </div>
                              );
                            })}
                          </div>

                          {/* Per-market sliders */}
                          <div className="space-y-1.5">
                            {markets.map((m: any, idx: number) => {
                              const val = curve[idx] ?? 50;
                              const matLabel = m.maturityDate
                                ? new Date(m.maturityDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })
                                : `Market ${idx + 1}`;
                              return (
                                <div key={m.marketId || idx} className="flex items-center gap-2">
                                  <span className="w-20 shrink-0 text-[10px] text-admin-text-dim font-mono truncate" title={matLabel}>
                                    {matLabel}
                                  </span>
                                  <input type="range" min="5" max="95" step="1" value={val}
                                    onChange={e => setCurveValue(s.label, idx, Number(e.target.value))}
                                    className="flex-1 accent-blue-500 h-3" />
                                  <input type="number" min="5" max="95" step="1" value={val}
                                    onChange={e => setCurveValue(s.label, idx, Number(e.target.value))}
                                    className="w-12 bg-admin-surface-2 border border-admin-border rounded px-1 py-0.5 text-[10px] text-admin-text font-mono text-center" />
                                </div>
                              );
                            })}
                          </div>

                          <div className="flex items-center justify-between text-[9px] text-admin-text-dim pt-1 border-t border-admin-border/50">
                            <span>Avg: {avg}%</span>
                            <span>Range: {min}%–{max}%</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {/* Core Parameters */}
          <Card title="Core Parameters">
            <div className="space-y-4">
              {mode === 'single' && (
                <div>
                  <label className={labelCls}>Mid Price: <span className="text-blue-400">{midPrice}%</span></label>
                  <input type="range" min="5" max="95" step="1" value={midPrice}
                    onChange={e => setMidPrice(Number(e.target.value))} className="w-full accent-blue-500" />
                  <p className="text-[10px] text-admin-text-dim mt-0.5">Center point for all bot orders</p>
                </div>
              )}
              <div>
                <label className={labelCls}>Half Spread: <span className="text-blue-400">{spread}%</span></label>
                <input type="range" min="0.5" max="10" step="0.5" value={spread}
                  onChange={e => setSpread(Number(e.target.value))} className="w-full accent-blue-500" />
                <p className="text-[10px] text-admin-text-dim mt-0.5">Distance from mid to furthest orders</p>
              </div>
              <div>
                <label className={labelCls}>Taker Chance: <span className="text-blue-400">{takerChance}%</span></label>
                <input type="range" min="0" max="50" step="5" value={takerChance}
                  onChange={e => setTakerChance(Number(e.target.value))} className="w-full accent-blue-500" />
                <p className="text-[10px] text-admin-text-dim mt-0.5">Probability of aggressive market orders</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Levels (per side)</label>
                  <input type="number" min="1" max="20" value={levels}
                    onChange={e => setLevels(Number(e.target.value))} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Size (contracts)</label>
                  <input type="number" min="2" max="50" step="0.5" value={sizeContracts}
                    onChange={e => setSizeContracts(Number(e.target.value))} className={inputCls} />
                </div>
              </div>
            </div>
          </Card>

          {/* Advanced Settings */}
          <Card title="Execution and Price Path">
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Order Delay (ms)</label>
                  <input type="number" min="0" max="30000" step="500" value={orderDelayMs}
                    onChange={e => setOrderDelayMs(Number(e.target.value))} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Delay Var. (±ms)</label>
                  <input type="number" min="0" max="10000" step="500" value={orderDelayVarianceMs}
                    onChange={e => setOrderDelayVarianceMs(Number(e.target.value))} className={inputCls} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Size Var. (0-1)</label>
                  <input type="number" min="0" max="1" step="0.05" value={sizeVariance}
                    onChange={e => setSizeVariance(Number(e.target.value))} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Price Var. (±pts)</label>
                  <input type="number" min="0" max="500000" step="10000" value={priceVariance}
                    onChange={e => setPriceVariance(Number(e.target.value))} className={inputCls} />
                </div>
              </div>
              <div className="border-t border-admin-border pt-4">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold text-admin-text">Dynamic Price Equation</h4>
                    <p className="mt-0.5 text-[10px] text-admin-text-dim">Controls how each market midpoint changes after a refresh.</p>
                  </div>
                  <Badge variant="blue">{pricePathMode.replace('_', ' + ')}</Badge>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className={labelCls}>Path Mode</label>
                    <select value={pricePathMode}
                      onChange={e => setPricePathMode(e.target.value as typeof pricePathMode)}
                      className={inputCls}>
                      <option value="random_walk">Random walk with mean reversion</option>
                      <option value="linear">Linear trend</option>
                      <option value="sine">Sine wave</option>
                      <option value="trend_sine">Linear trend plus sine wave</option>
                    </select>
                  </div>
                  <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-3 text-xs text-blue-200 font-mono overflow-x-auto">
                    {pricePathMode === 'random_walk'
                      ? 'next = current + noise + reversion(base - current)'
                      : `target(t) = base${pricePathMode !== 'sine' ? ' + trend * t' : ''}${pricePathMode !== 'linear' ? ' + amplitude * sin(2πt / period)' : ''}`}
                  </div>
                  <div>
                    <label className={labelCls}>Refresh Interval (ms)</label>
                    <input type="number" min="0" max="60000" step="1000" value={refreshIntervalMs}
                      onChange={e => setRefreshIntervalMs(Number(e.target.value))} className={inputCls} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>Drift (±pts)</label>
                      <input type="number" min="0" max="1000000" step="50000" value={priceDriftPts}
                        onChange={e => setPriceDriftPts(Number(e.target.value))} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Volatility (0-1)</label>
                      <input type="number" min="0" max="1" step="0.1" value={volatility}
                        onChange={e => setVolatility(Number(e.target.value))} className={inputCls} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>Trend per Tick (pts)</label>
                      <input type="number" min="-1000000" max="1000000" step="10000" value={trendPerTickPts}
                        disabled={pricePathMode === 'random_walk' || pricePathMode === 'sine'}
                        onChange={e => setTrendPerTickPts(Number(e.target.value))} className={disabledInputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Mean Reversion (0-1)</label>
                      <input type="number" min="0" max="1" step="0.05" value={meanReversion}
                        onChange={e => setMeanReversion(Number(e.target.value))} className={inputCls} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>Sine Amplitude (pts)</label>
                      <input type="number" min="0" max="4000000" step="50000" value={sineAmplitudePts}
                        disabled={pricePathMode === 'random_walk' || pricePathMode === 'linear'}
                        onChange={e => setSineAmplitudePts(Number(e.target.value))} className={disabledInputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Sine Period (ticks)</label>
                      <input type="number" min="2" max="10000" step="1" value={sinePeriodTicks}
                        disabled={pricePathMode === 'random_walk' || pricePathMode === 'linear'}
                        onChange={e => setSinePeriodTicks(Number(e.target.value))} className={disabledInputCls} />
                    </div>
                  </div>
                  <p className="text-[10px] text-admin-text-dim">
                    One tick occurs after each refresh. Drift and volatility add optional noise around the selected equation.
                  </p>
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* ─── Column 3: Live Sessions ────────────────────────────────────── */}
        <div className="xl:col-span-1 space-y-4">
          <Card title="Live Sessions"
            action={
              <div className="flex items-center gap-2">
                <Badge variant="green" dot pulseDot>{runningSessions.length} running</Badge>
                {sessions.length > 0 && (
                  <span className="text-xs text-admin-text-dim font-mono">
                    {botStatus?.totalBots || 0} bots · {botStatus?.totalOrders || 0} orders
                  </span>
                )}
              </div>
            }>
            {sessions.length === 0 ? (
              <div className="text-center py-8 text-admin-text-dim text-sm">
                <div className="text-3xl mb-2">🤖</div>
                <p>No active bot sessions</p>
                <p className="text-xs mt-1">Start bots using the controls on the left</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[680px] overflow-y-auto pr-1 admin-scrollbar">
                {sessions.map((sess: any) => (
                  <div key={sess.marketId}
                    className={`p-3 rounded-lg border transition-colors ${
                      sess.status === 'error'
                        ? 'bg-red-500/5 border-red-500/20'
                        : 'bg-admin-surface-2 border-admin-border hover:border-blue-500/30'
                    }`}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-medium text-admin-text truncate max-w-[180px]" title={sess.marketName}>
                        {sess.marketName}
                      </span>
                      <StatusBadge status={sess.status} />
                    </div>
                    {sess.conditionName && (
                      <div className="text-[10px] text-blue-400/70 mb-1.5 truncate">{sess.conditionName}</div>
                    )}
                    <div className="grid grid-cols-4 gap-1.5 text-xs">
                      <div>
                        <span className="text-admin-text-dim">Mid</span>
                        <div className="text-admin-text font-mono">{sess.midPrice?.toFixed(0) || '—'}%</div>
                      </div>
                      <div>
                        <span className="text-admin-text-dim">Spread</span>
                        <div className="text-admin-text font-mono">{sess.spread?.toFixed(1) || '—'}%</div>
                      </div>
                      <div>
                        <span className="text-admin-text-dim">Bots</span>
                        <div className="text-admin-text font-mono">{sess.botsCount}</div>
                      </div>
                      <div>
                        <span className="text-admin-text-dim">Orders</span>
                        <div className="text-admin-text font-mono">{sess.ordersPlaced}</div>
                      </div>
                    </div>
                    <div className="mt-2 rounded-md border border-admin-border bg-admin-bg/50 px-2 py-1.5 text-[10px] text-admin-text-dim">
                      Equation: <span className="text-blue-400 font-mono">{(sess.pricePathMode || 'random_walk').replace('_', ' + ')}</span>
                      {(sess.pricePathMode === 'linear' || sess.pricePathMode === 'trend_sine') && (
                        <span className="ml-2">trend {sess.trendPerTickPts} pts/tick</span>
                      )}
                      {(sess.pricePathMode === 'sine' || sess.pricePathMode === 'trend_sine') && (
                        <span className="ml-2">amplitude {sess.sineAmplitudePts} pts / {sess.sinePeriodTicks} ticks</span>
                      )}
                    </div>
                    {sess.errorMessage && (
                      <div className="mt-1.5 text-[10px] text-red-400 truncate" title={sess.errorMessage}>
                        ❌ {sess.errorMessage}
                      </div>
                    )}
                    <div className="mt-1.5 text-[10px] text-admin-text-dim">
                      Started: {new Date(sess.startedAt).toLocaleTimeString()}
                      {sess.category && <span className="ml-2">· {sess.category}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Category market summary */}
          {mode === 'category' && insuranceMarkets[selectedCategory]?.length > 0 && (
            <Card title={`${INS_SERIES[selectedCategory]?.icon || '📋'} ${selectedCategory} Markets`}>
              <div className="space-y-1.5 max-h-[300px] overflow-y-auto pr-1 text-xs">
                {subcats.map((s) => {
                  const markets = subcatMarkets[s.label] || [];
                  if (markets.length === 0) return null;
                  const curve = getCurve(s.label);
                  return (
                    <div key={s.slug} className="bg-admin-surface-2 rounded-lg p-2 border border-admin-border">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-admin-text">{s.label}</span>
                        <span className="text-admin-text-dim font-mono">
                          {markets.length} mkts
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {markets.map((m: any, idx: number) => (
                          <span key={m.marketId}
                            className="px-1.5 py-0.5 bg-admin-surface-3 rounded text-[10px] text-admin-text-dim font-mono"
                            title={`${m.name} — mid: ${curve[idx] ?? 50}%`}>
                            {m.maturityDate ? new Date(m.maturityDate).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }) : m.marketId.slice(0, 8)}
                            <span className="text-blue-400/70 ml-1">{curve[idx] ?? 50}%</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
