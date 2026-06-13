import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, Link, Form, useNavigation } from "@remix-run/react";
import { useState, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import { getWallet, getMarkets, getMyOrders, getBalanceHistory, getMyPositions, cancelOrder } from "~/lib/api.server";
import { formatPence } from "~/lib/format";
import { BalanceChart, type TooltipData } from "~/components/dashboard/BalanceChart";
import { TopRisks } from "~/components/dashboard/TopRisks";
import { X, TrendingUp, TrendingDown, Wallet, Lock, BarChart3, ClipboardList } from "lucide-react";

/* ── Motion presets ─────────────────────────────────────────────── */
const fadeUp = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] } },
};
const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};
import "~/styles/pages/dashboard.css";
import "~/styles/components/panels.css";
import "~/styles/components/metrics.css";
import "~/styles/components/tables.css";
import "~/styles/components/controls.css";

type TimeRange = '1D' | '1W' | '1M' | 'ALL';

export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const url = new URL(request.url);
    const timeRange = (url.searchParams.get('range') || '1W') as TimeRange;
    
    const [walletResponse, marketsResponse, ordersResponse, historyResponse, positionsResponse] = await Promise.allSettled([
      getWallet(request),
      getMarkets(),
      getMyOrders(request, 20),
      getBalanceHistory(request, timeRange).catch(() => null),
      getMyPositions(request)
    ]);

    const wallet = walletResponse.status === 'fulfilled' ? walletResponse.value : null;
    const markets = marketsResponse.status === 'fulfilled' ? marketsResponse.value?.markets || [] : [];
    const orders = ordersResponse.status === 'fulfilled' ? ordersResponse.value?.orders || [] : [];
    const history = historyResponse.status === 'fulfilled' ? historyResponse.value : null;
    const positions = positionsResponse.status === 'fulfilled' ? positionsResponse.value || [] : [];

    // Wallet balances in pounds (API returns pounds)
    const availablePounds = wallet?.balance ?? 0;
    const reservedPounds = wallet?.lockedBalance ?? 0;
    const equityPounds = availablePounds + reservedPounds;

    let equityData, availableData, reservedData;
    let eventsData: any[] = [];
    
    if (history?.history && history.history.length > 0) {
      console.log('[Dashboard Loader] Using REAL wallet history:', history.history.length, 'entries');
      
      // Deduplicate by second — multiple trades in the same second share the same unix timestamp.
      // lightweight-charts requires strictly ascending unique times; duplicates cause setData to throw.
      // Data arrives ASC from the server, so last write per second = most recent balance for that second.
      const seen = new Map<number, any>();
      for (const h of history.history) {
        seen.set(Math.floor(new Date(h.timestamp).getTime() / 1000), h);
      }
      const deduped = [...seen.entries()].sort((a, b) => a[0] - b[0]);

      equityData    = deduped.map(([t, h]) => ({ time: t, value: h.balance }));
      availableData = deduped.map(([t, h]) => ({ time: t, value: h.available }));
      reservedData  = deduped.map(([t, h]) => ({ time: t, value: h.reserved }));

      // Map individual events for color-coded chart markers
      if (history?.events) {
        eventsData = history.events.map((e: any) => ({
          time: Math.floor(new Date(e.timestamp).getTime() / 1000),
          entryType: e.entryType,
          credit: e.credit,
          debit: e.debit,
          balance: e.balance,
        }));
      }
    } else {
      console.log('[Dashboard Loader] No history at all, using stub data for empty state');
      // Only truly new accounts with zero trades get a flat stub line
      const now = Math.floor(Date.now() / 1000);
      const stubVal = equityPounds || 100;
      equityData    = [{ time: now - 86400, value: stubVal }, { time: now, value: stubVal }];
      availableData = [{ time: now - 86400, value: availablePounds || stubVal }, { time: now, value: availablePounds || stubVal }];
      reservedData  = [{ time: now - 86400, value: reservedPounds || 0 }, { time: now, value: reservedPounds || 0 }];
    }

    return json({ 
      wallet, 
      markets,
      orders: orders.filter((o: any) => {
        const status = (o.status || '').toLowerCase();
        return status === 'open' || status === 'partial';
      }).slice(0, 10),
      positions,
      timestamp: new Date().toISOString(),
      equityData,
      availableData,
      reservedData,
      eventsData,
      timeRange
    });
  } catch (error) {
    const timeRange = '1W';
    const now = Math.floor(Date.now() / 1000);
    return json({ 
      wallet: null, 
      markets: [], 
      orders: [], 
      positions: [],
      timestamp: new Date().toISOString(),
      equityData: [{ time: now - 86400, value: 0 }, { time: now, value: 0 }],
      availableData: [{ time: now - 86400, value: 0 }, { time: now, value: 0 }],
      reservedData: [{ time: now - 86400, value: 0 }, { time: now, value: 0 }],
      eventsData: [],
      timeRange
    });
  }
}

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const intent = formData.get('intent');

  if (intent === 'cancelOrder') {
    const orderId = formData.get('orderId') as string;
    if (orderId) {
      try {
        await cancelOrder(request, orderId);
        return json({ success: true, message: 'Order cancelled' });
      } catch (error) {
        return json({ success: false, message: 'Failed to cancel order' }, { status: 500 });
      }
    }
  }

  return json({ success: false, message: 'Invalid action' });
}

export default function Dashboard() {
  const { wallet, markets, orders, positions, equityData, availableData, reservedData, eventsData, timeRange } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === 'submitting';
  
  // Series visibility toggles (equity always on)
  const [showAvailable, setShowAvailable] = useState(false);
  const [showExposure, setShowExposure] = useState(false);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);

  const handleTooltip = useCallback((tip: TooltipData | null) => setTooltip(tip), []);

  const visibleSeries = useMemo(() => ({
    equity: true,
    available: showAvailable,
    exposure: showExposure,
  }), [showAvailable, showExposure]);

  // ── KPI calculations ──────────────────────────────────────────────
  const availablePence = wallet?.balance ? Math.round(wallet.balance * 100) : 0;
  const reservedPence = wallet?.lockedBalance ? Math.round(wallet.lockedBalance * 100) : 0;

  const positionValuePence = positions.reduce((sum: number, p: any) => {
    const micros = BigInt(p.netContractsMicros || '0');
    if (micros === 0n) return sum;
    const contracts = Number(micros > 0n ? micros : -micros) / 1_000_000;
    const markPrice = (p.markYesPts || 0) / 100_000 / 100;
    const isLong = micros > 0n;
    const value = contracts * (isLong ? markPrice : (1 - markPrice)) * 100;
    return sum + value;
  }, 0);
  const totalBalance = availablePence + reservedPence + positionValuePence;

  const openExposure = positions.reduce((sum: number, p: any) => {
    const micros = BigInt(p.netContractsMicros || '0');
    const contracts = Number(micros > 0n ? micros : -micros) / 1_000_000;
    const avgPrice = (p.avgEntryYesPts || 0) / 100_000;
    const isLong = micros > 0n;
    return sum + contracts * (isLong ? avgPrice / 100 : (1 - avgPrice / 100));
  }, 0);

  const totalUnrealizedPnl = positions.reduce((sum: number, p: any) => {
    const micros = BigInt(p.netContractsMicros || '0');
    const contracts = Number(micros > 0n ? micros : -micros) / 1_000_000;
    const avgPrice = (p.avgEntryYesPts || 0) / 100_000;
    const mark = (p.markYesPts || 0) / 100_000;
    const isLong = micros > 0n;
    const pnlPercent = isLong ? (mark - avgPrice) : (avgPrice - mark);
    return sum + (pnlPercent / 100) * contracts;
  }, 0);

  const openOrderCount = orders.length;
  const totalPositions = positions.length;

  // ── P&L delta from chart data ─────────────────────────────────────
  const pnlDelta = useMemo(() => {
    if (!equityData || equityData.length < 2) return { value: 0, pct: 0 };
    const first = equityData[0].value;
    const last = equityData[equityData.length - 1].value;
    const delta = last - first;
    const pct = first > 0 ? (delta / first) * 100 : 0;
    return { value: delta, pct };
  }, [equityData]);

  // ── Time range labels ─────────────────────────────────────────────
  const rangeLabel = timeRange === '1D' ? 'today' : timeRange === '1W' ? 'this week' : timeRange === '1M' ? 'this month' : 'all time';

  return (
    <div className="terminal-dashboard">

      {/* ═══════ KPI STRIP ═══════ */}
      <motion.div className="dash-kpi-strip" variants={stagger} initial="hidden" animate="show">
        {/* Equity */}
        <motion.div variants={fadeUp}>
          <Link to="/app/portfolio" className="dash-kpi-card">
            <div className="dash-kpi-row">
              <div className="dash-kpi-icon" style={{ background: 'rgba(88,166,255,0.1)' }}>
                <TrendingUp size={12} color="var(--terminal-accent)" />
              </div>
              <span className="dash-kpi-label">Equity</span>
            </div>
            <div className="dash-kpi-value" style={{ color: 'var(--terminal-text)' }}>
              £{(totalBalance / 100).toLocaleString('en-GB', { minimumFractionDigits: 2 })}
            </div>
          </Link>
        </motion.div>

        {/* Unrealized P&L */}
        <motion.div variants={fadeUp}>
          <div className="dash-kpi-card">
            <div className="dash-kpi-row">
              <div className="dash-kpi-icon" style={{ background: totalUnrealizedPnl >= 0 ? 'rgba(63,185,80,0.1)' : 'rgba(240,97,93,0.1)' }}>
                {totalUnrealizedPnl >= 0 ? <TrendingUp size={12} color="var(--terminal-green)" /> : <TrendingDown size={12} color="var(--terminal-red)" />}
              </div>
              <span className="dash-kpi-label">Unrealized P&L</span>
            </div>
            <div className="dash-kpi-value" style={{ color: totalUnrealizedPnl >= 0 ? 'var(--terminal-green)' : 'var(--terminal-red)' }}>
              {totalUnrealizedPnl >= 0 ? '+' : ''}£{Math.abs(totalUnrealizedPnl).toFixed(2)}
            </div>
          </div>
        </motion.div>

        {/* Available */}
        <motion.div variants={fadeUp}>
          <div className="dash-kpi-card">
            <div className="dash-kpi-row">
              <div className="dash-kpi-icon" style={{ background: 'rgba(63,185,80,0.1)' }}>
                <Wallet size={12} color="var(--terminal-green)" />
              </div>
              <span className="dash-kpi-label">Available</span>
            </div>
            <div className="dash-kpi-value" style={{ color: 'var(--terminal-text)' }}>
              £{(availablePence / 100).toLocaleString('en-GB', { minimumFractionDigits: 2 })}
            </div>
          </div>
        </motion.div>

        {/* Reserved */}
        <motion.div variants={fadeUp}>
          <div className="dash-kpi-card">
            <div className="dash-kpi-row">
              <div className="dash-kpi-icon" style={{ background: 'rgba(227,160,8,0.1)' }}>
                <Lock size={12} color="var(--terminal-amber)" />
              </div>
              <span className="dash-kpi-label">Reserved</span>
            </div>
            <div className="dash-kpi-value" style={{ color: 'var(--terminal-text)' }}>
              £{(reservedPence / 100).toLocaleString('en-GB', { minimumFractionDigits: 2 })}
            </div>
          </div>
        </motion.div>

        {/* Open Exposure */}
        <motion.div variants={fadeUp}>
          <Link to="/app/positions" className="dash-kpi-card">
            <div className="dash-kpi-row">
              <div className="dash-kpi-icon" style={{ background: 'rgba(245,158,11,0.1)' }}>
                <BarChart3 size={12} color="#f59e0b" />
              </div>
              <span className="dash-kpi-label">Exposure</span>
            </div>
            <div className="dash-kpi-value" style={{ color: 'var(--terminal-text)' }}>
              £{openExposure.toFixed(2)}
            </div>
            <div className="dash-kpi-sub">
              {totalPositions} pos
            </div>
          </Link>
        </motion.div>
      </motion.div>

      {/* ═══════ MAIN GRID ═══════ */}
      <div className="terminal-grid">

        {/* ─── Portfolio Performance (hero chart) ─── span 8 ─── */}
        <motion.div className="terminal-span-8 terminal-panel" style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}>
          {/* Header */}
          <div className="dash-chart-header">
            <div className="dash-chart-header-left">
              <h2 className="dash-chart-title">Portfolio Performance</h2>
              <span className={`dash-pnl-badge ${pnlDelta.value >= 0 ? 'dash-pnl-badge--pos' : 'dash-pnl-badge--neg'}`}>
                {pnlDelta.value >= 0 ? '+' : ''}£{Math.abs(pnlDelta.value).toFixed(2)} {rangeLabel}
              </span>
              <span className="dash-pnl-pct" style={{ color: pnlDelta.pct >= 0 ? 'var(--terminal-green)' : 'var(--terminal-red)' }}>
                ({pnlDelta.pct >= 0 ? '+' : ''}{pnlDelta.pct.toFixed(2)}%)
              </span>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <div className="toggle-group">
                <Link to="?range=1D" className={`toggle-item ${timeRange === '1D' ? 'active' : ''}`}>1D</Link>
                <Link to="?range=1W" className={`toggle-item ${timeRange === '1W' ? 'active' : ''}`}>1W</Link>
                <Link to="?range=1M" className={`toggle-item ${timeRange === '1M' ? 'active' : ''}`}>1M</Link>
                <Link to="?range=ALL" className={`toggle-item ${timeRange === 'ALL' ? 'active' : ''}`}>ALL</Link>
              </div>
            </div>
          </div>

          {/* Legend toggles */}
          <div className="dash-chart-legend">
            <LegendToggle color="var(--terminal-accent)" label="Equity" active solid disabled />
            <LegendToggle color="var(--terminal-green)" label="Available" active={showAvailable} onToggle={() => setShowAvailable(!showAvailable)} solid />
            <LegendToggle color="#f59e0b" label="Exposure" active={showExposure} onToggle={() => setShowExposure(!showExposure)} dashed />
          </div>

          {/* Chart */}
          <div className="dash-chart-area">
            <BalanceChart
              equity={equityData}
              available={availableData}
              exposure={reservedData}
              events={eventsData}
              timeRange={timeRange}
              visibleSeries={visibleSeries}
              onTooltip={handleTooltip}
            />

            {/* Floating tooltip */}
            {tooltip && (
              <div className="dash-tooltip">
                <div className="dash-tooltip-time">
                  {tooltip.time ? new Date(tooltip.time * 1000).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
                </div>
                {tooltip.equity !== null && (
                  <div><span style={{ color: 'var(--terminal-accent)' }}>●</span> Equity: <span style={{ color: 'var(--terminal-text)' }}>£{tooltip.equity.toFixed(2)}</span></div>
                )}
                {tooltip.available !== null && (
                  <div><span style={{ color: 'var(--terminal-green)' }}>●</span> Available: <span style={{ color: 'var(--terminal-text)' }}>£{tooltip.available.toFixed(2)}</span></div>
                )}
                {tooltip.exposure !== null && (
                  <div><span style={{ color: '#f59e0b' }}>●</span> Exposure: <span style={{ color: 'var(--terminal-text)' }}>£{tooltip.exposure.toFixed(2)}</span></div>
                )}
              </div>
            )}
          </div>
        </motion.div>

        {/* ─── Top Risks (horizontal bar chart) ─── span 4 ─── */}
        <motion.div className="terminal-span-4 terminal-panel" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.22 }}>
          <div className="terminal-panel-header">
            <h2 className="terminal-panel-title" style={{ margin: 0, fontSize: '0.8125rem' }}>Top Risks</h2>
            <Link to="/app/positions" className="dash-view-link">View All</Link>
          </div>
          <div className="terminal-panel-body no-padding" style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
            <TopRisks positions={positions} maxItems={4} />
          </div>
        </motion.div>

        {/* ─── Active Positions Table ─── span 8 ─── */}
        <motion.div className="terminal-span-8 terminal-panel" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.28 }}>
          <div className="terminal-panel-header" style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            <h2 className="terminal-panel-title" style={{ margin: 0, fontSize: '0.8125rem' }}>Active Positions</h2>
            {/* Featured: Paralysis Cure — inline pill */}
            <a href="/app/insurance/life/paralysis-cure" className="dash-featured-pill">
              <span style={{ fontSize: '0.6875rem', lineHeight: 1 }}>🫀</span>
              <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--terminal-accent)' }}>Paralysis Cure</span>
              <span style={{ fontSize: '0.5625rem', color: 'var(--terminal-muted)' }}>→</span>
            </a>
            <span style={{ flex: 1 }} />
            <Link to="/app/positions" className="dash-view-link">View All →</Link>
          </div>
          <div className="terminal-panel-body no-padding">
            <table className="terminal-table" style={{ fontSize: '0.8125rem' }}>
              <thead>
                <tr>
                  <th>Market</th>
                  <th>Side</th>
                  <th className="align-right">Size</th>
                  <th className="align-right">Entry</th>
                  <th className="align-right">Mark</th>
                  <th className="align-right">P&L</th>
                  <th className="align-right"></th>
                </tr>
              </thead>
              <tbody>
                {positions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="dash-empty">
                      No active positions — <Link to="/app/markets" className="dash-empty-link">Browse markets</Link>
                    </td>
                  </tr>
                ) : (positions.slice(0, 3).map((p: any, i: number) => {
                  const micros = BigInt(p.netContractsMicros);
                  const isLong = micros > 0n;
                  const contracts = Number(micros > 0n ? micros : -micros) / 1_000_000;
                  const side = isLong ? 'YES' : 'NO';
                  const avgPrice = p.avgEntryYesPts / 100_000;
                  const mark = p.markYesPts / 100_000;
                  const pnlPercent = isLong ? (mark - avgPrice) : (avgPrice - mark);
                  const pnlValue = (pnlPercent / 100) * contracts;
                  const cost = contracts * (isLong ? avgPrice / 100 : (1 - avgPrice / 100));

                  return (
                    <tr key={i} className="dash-position-row">
                      <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <Link to={`/app/markets/${p.marketId}`} style={{ color: 'var(--terminal-text)', textDecoration: 'none', fontSize: '0.75rem' }}>
                          {p.marketQuestion}
                        </Link>
                      </td>
                      <td>
                        <span className={`dash-side-badge ${isLong ? 'dash-side-badge--long' : 'dash-side-badge--short'}`}>{side}</span>
                      </td>
                      <td className="align-right" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--terminal-text)' }}>£{cost.toFixed(2)}</td>
                      <td className="align-right" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--terminal-muted)' }}>{avgPrice.toFixed(1)}%</td>
                      <td className="align-right" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--terminal-muted)' }}>{mark.toFixed(1)}%</td>
                      <td className="align-right" style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        color: pnlValue >= 0 ? 'var(--terminal-green)' : 'var(--terminal-red)',
                      }}>
                        {pnlValue >= 0 ? '+' : ''}£{Math.abs(pnlValue).toFixed(2)}
                      </td>
                      <td className="align-right">
                        <Link to={`/app/markets/${p.marketId}`} className="dash-trade-btn">Trade</Link>
                      </td>
                    </tr>
                  );
                }))}
              </tbody>
            </table>
          </div>
        </motion.div>

        {/* ─── Right column: Open Orders + Recent Markets ─── span 4 ─── */}
        <div className="terminal-span-4" style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem', minHeight: 0 }}>

          {/* Open Orders */}
          <motion.div className="terminal-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.32 }}>
            <div className="terminal-panel-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <ClipboardList size={14} style={{ color: 'var(--terminal-muted)' }} />
                <h2 className="terminal-panel-title" style={{ margin: 0, fontSize: '0.875rem' }}>Open Orders</h2>
                {openOrderCount > 0 && (
                  <span className="dash-count-badge">{openOrderCount}</span>
                )}
              </div>
              <Link to="/app/orders" className="dash-view-link">Manage</Link>
            </div>
            <div className="terminal-panel-body no-padding" style={{ overflow: 'auto' }}>
              {orders.length === 0 ? (
                <div className="dash-empty">
                  No open orders
                  <div style={{ marginTop: '0.5rem' }}>
                    <Link to="/app/markets" className="dash-empty-link">Place an order →</Link>
                  </div>
                </div>
              ) : (
                <div>
                  {orders.slice(0, 3).map((o: any, i: number) => (
                    <div key={o.id || i} className="dash-order-row">
                      <div className="dash-order-left">
                        <span className="dash-order-side" style={{
                          background: o.side === 'BUY_YES' ? 'rgba(63,185,80,0.1)' : 'rgba(240,97,93,0.1)',
                          color: o.side === 'BUY_YES' ? 'var(--terminal-green)' : 'var(--terminal-red)',
                        }}>
                          {o.side === 'BUY_YES' ? 'BUY' : 'SELL'}
                        </span>
                        <span className="dash-order-price">
                          {(o.pPts / 100_000).toFixed(1)}%
                        </span>
                        <span className="dash-order-size">
                          £{((o.remainingPence || o.liabilityPence || 0) / 100).toFixed(2)}
                        </span>
                      </div>
                      <Form method="post" style={{ flexShrink: 0 }}>
                        <input type="hidden" name="intent" value="cancelOrder" />
                        <input type="hidden" name="orderId" value={o.id} />
                        <button
                          type="submit"
                          disabled={isSubmitting}
                          className="dash-cancel-btn"
                          style={{ opacity: isSubmitting ? 0.4 : 1 }}
                          title="Cancel order"
                        >
                          <X size={10} />
                        </button>
                      </Form>
                    </div>
                  ))}
                  {orders.length > 3 && (
                    <div className="dash-more-link">
                      <Link to="/app/orders" className="dash-view-link">+{orders.length - 3} more →</Link>
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>

          {/* Recent Markets */}
          <motion.div className="terminal-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.38 }}>
            <div className="terminal-panel-header">
              <h2 className="terminal-panel-title" style={{ margin: 0, fontSize: '0.8125rem' }}>Recent Markets</h2>
              <Link to="/app/markets" className="dash-view-link">Browse</Link>
            </div>
            <div className="terminal-panel-body no-padding" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
              {markets.slice(0, 6).map((m: any) => (
                <Link key={m.id} to={`/app/markets/${m.id}`} className="dash-market-row">
                  <div className="dash-market-left">
                    <span className={`dash-market-dot ${m.status === 'ACTIVE' ? 'dash-market-dot--active' : 'dash-market-dot--inactive'}`} />
                    <span className="dash-market-name">{m.name}</span>
                  </div>
                  <span className="dash-market-trade-badge">Trade</span>
                </Link>
              ))}
            </div>
          </motion.div>

        </div>

      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
 *  Sub-components
 * ════════════════════════════════════════════════════════════════════ */

function LegendToggle({
  color,
  label,
  active,
  onToggle,
  solid,
  dashed,
  disabled,
}: {
  color: string;
  label: string;
  active: boolean;
  onToggle?: () => void;
  solid?: boolean;
  dashed?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      className={`dash-legend-btn ${!active ? 'dash-legend-btn--inactive' : ''}`}
    >
      <span
        className="dash-legend-line"
        style={{
          background: dashed ? 'none' : color,
          ...(dashed ? { backgroundImage: `repeating-linear-gradient(90deg, ${color} 0, ${color} 3px, transparent 3px, transparent 6px)` } : {}),
        }}
      />
      {label}
    </button>
  );
}

/* ── end ── */
