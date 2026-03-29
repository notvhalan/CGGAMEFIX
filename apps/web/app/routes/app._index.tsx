import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, Link, Form, useNavigation } from "@remix-run/react";
import { useState, useCallback, useMemo } from "react";
import { getWallet, getMarkets, getMyOrders, getBalanceHistory, getMyPositions, cancelOrder } from "~/lib/api.server";
import { formatPence } from "~/lib/format";
import { BalanceChart, type TooltipData } from "~/components/dashboard/BalanceChart";
import { TopRisks } from "~/components/dashboard/TopRisks";
import { X, TrendingUp, TrendingDown, Wallet, Lock, BarChart3, ClipboardList } from "lucide-react";
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
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(5, 1fr)',
        gap: '0.5rem',
        flexShrink: 0,
      }}>
        {/* Equity */}
        <Link to="/app/portfolio" style={{ textDecoration: 'none' }}>
          <div style={kpiCard}>
            <div style={kpiRow}>
              <div style={{ ...kpiIcon, background: 'rgba(102, 126, 234, 0.12)' }}>
                <TrendingUp size={12} color="#667eea" />
              </div>
              <span style={kpiLabel}>Equity</span>
            </div>
            <div style={{ ...kpiValue, color: '#e4e8eb' }}>
              £{(totalBalance / 100).toLocaleString('en-GB', { minimumFractionDigits: 2 })}
            </div>
          </div>
        </Link>

        {/* Unrealized P&L */}
        <div style={kpiCard}>
          <div style={kpiRow}>
            <div style={{ ...kpiIcon, background: totalUnrealizedPnl >= 0 ? 'rgba(63,185,80,0.12)' : 'rgba(248,81,73,0.12)' }}>
              {totalUnrealizedPnl >= 0 ? <TrendingUp size={12} color="#3fb950" /> : <TrendingDown size={12} color="#f85149" />}
            </div>
            <span style={kpiLabel}>Unrealized P&L</span>
          </div>
          <div style={{ ...kpiValue, color: totalUnrealizedPnl >= 0 ? '#3fb950' : '#f85149' }}>
            {totalUnrealizedPnl >= 0 ? '+' : ''}£{Math.abs(totalUnrealizedPnl).toFixed(2)}
          </div>
        </div>

        {/* Available */}
        <div style={kpiCard}>
          <div style={kpiRow}>
            <div style={{ ...kpiIcon, background: 'rgba(63,185,80,0.12)' }}>
              <Wallet size={12} color="#3fb950" />
            </div>
            <span style={kpiLabel}>Available</span>
          </div>
          <div style={{ ...kpiValue, color: '#c9d1d9' }}>
            £{(availablePence / 100).toLocaleString('en-GB', { minimumFractionDigits: 2 })}
          </div>
        </div>

        {/* Reserved */}
        <div style={kpiCard}>
          <div style={kpiRow}>
            <div style={{ ...kpiIcon, background: 'rgba(210,153,34,0.12)' }}>
              <Lock size={12} color="#d29922" />
            </div>
            <span style={kpiLabel}>Reserved</span>
          </div>
          <div style={{ ...kpiValue, color: '#c9d1d9' }}>
            £{(reservedPence / 100).toLocaleString('en-GB', { minimumFractionDigits: 2 })}
          </div>
        </div>

        {/* Open Exposure */}
        <Link to="/app/positions" style={{ textDecoration: 'none' }}>
          <div style={kpiCard}>
            <div style={kpiRow}>
              <div style={{ ...kpiIcon, background: 'rgba(245,158,11,0.12)' }}>
                <BarChart3 size={12} color="#f59e0b" />
              </div>
              <span style={kpiLabel}>Exposure</span>
            </div>
            <div style={{ ...kpiValue, color: '#c9d1d9' }}>
              £{openExposure.toFixed(2)}
            </div>
            <div style={{ fontSize: '0.625rem', color: '#6b7280' }}>
              {totalPositions} pos
            </div>
          </div>
        </Link>
      </div>

      {/* ═══════ MAIN GRID ═══════ */}
      <div className="terminal-grid">

        {/* ─── Portfolio Performance (hero chart) ─── span 8 ─── */}
        <div className="terminal-span-8 terminal-panel" style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {/* Header */}
          <div className="terminal-panel-header" style={{ borderBottom: '1px solid #1e2530', padding: '0.375rem 0.75rem', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <h2 className="terminal-panel-title" style={{ margin: 0, fontSize: '0.875rem' }}>Portfolio Performance</h2>
              {/* P&L delta badge */}
              <span style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                fontFamily: 'JetBrains Mono, monospace',
                color: pnlDelta.value >= 0 ? '#3fb950' : '#f85149',
                background: pnlDelta.value >= 0 ? 'rgba(63,185,80,0.1)' : 'rgba(248,81,73,0.1)',
                padding: '0.125rem 0.5rem',
                borderRadius: '4px',
              }}>
                {pnlDelta.value >= 0 ? '+' : ''}£{Math.abs(pnlDelta.value).toFixed(2)} {rangeLabel}
              </span>
              <span style={{
                fontSize: '0.6875rem',
                fontFamily: 'JetBrains Mono, monospace',
                color: pnlDelta.pct >= 0 ? '#3fb950' : '#f85149',
                opacity: 0.7,
              }}>
                ({pnlDelta.pct >= 0 ? '+' : ''}{pnlDelta.pct.toFixed(2)}%)
              </span>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              {/* Time range */}
              <div className="toggle-group">
                <Link to="?range=1D" className={`toggle-item ${timeRange === '1D' ? 'active' : ''}`}>1D</Link>
                <Link to="?range=1W" className={`toggle-item ${timeRange === '1W' ? 'active' : ''}`}>1W</Link>
                <Link to="?range=1M" className={`toggle-item ${timeRange === '1M' ? 'active' : ''}`}>1M</Link>
                <Link to="?range=ALL" className={`toggle-item ${timeRange === 'ALL' ? 'active' : ''}`}>ALL</Link>
              </div>
            </div>
          </div>

          {/* Legend toggles – centred */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '1rem',
            padding: '0.25rem 0.75rem 0.125rem',
            flexShrink: 0,
          }}>
            <LegendToggle color="#667eea" label="Equity" active solid disabled />
            <LegendToggle color="#3fb950" label="Available" active={showAvailable} onToggle={() => setShowAvailable(!showAvailable)} solid />
            <LegendToggle color="#f59e0b" label="Exposure" active={showExposure} onToggle={() => setShowExposure(!showExposure)} dashed />
          </div>

          {/* Chart */}
          <div style={{ position: 'relative', flex: 1, minHeight: 0, padding: '0 0.5rem 0.25rem' }}>
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
              <div style={{
                position: 'absolute',
                top: '0.75rem',
                left: '1rem',
                background: 'rgba(22, 27, 34, 0.95)',
                border: '1px solid #30363d',
                borderRadius: '6px',
                padding: '0.625rem 0.75rem',
                fontSize: '0.6875rem',
                fontFamily: 'JetBrains Mono, monospace',
                color: '#c9d1d9',
                lineHeight: 1.7,
                pointerEvents: 'none',
                zIndex: 20,
                backdropFilter: 'blur(8px)',
                minWidth: '160px',
              }}>
                <div style={{ color: '#8b949e', marginBottom: '0.25rem', fontFamily: 'Inter, system-ui, sans-serif', fontWeight: 500 }}>
                  {tooltip.time ? new Date(tooltip.time * 1000).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
                </div>
                {tooltip.equity !== null && (
                  <div><span style={{ color: '#667eea' }}>●</span> Equity: <span style={{ color: '#e4e8eb' }}>£{tooltip.equity.toFixed(2)}</span></div>
                )}
                {tooltip.available !== null && (
                  <div><span style={{ color: '#3fb950' }}>●</span> Available: <span style={{ color: '#e4e8eb' }}>£{tooltip.available.toFixed(2)}</span></div>
                )}
                {tooltip.exposure !== null && (
                  <div><span style={{ color: '#f59e0b' }}>●</span> Exposure: <span style={{ color: '#e4e8eb' }}>£{tooltip.exposure.toFixed(2)}</span></div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ─── Top Risks (horizontal bar chart) ─── span 4 ─── */}
        <div className="terminal-span-4 terminal-panel" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div className="terminal-panel-header" style={{ borderBottom: '1px solid #1e2530', padding: '0.5rem 0.75rem', flexShrink: 0 }}>
            <h2 className="terminal-panel-title" style={{ margin: 0, fontSize: '0.8125rem' }}>Top Risks</h2>
            <Link to="/app/positions" style={{ fontSize: '0.6875rem', color: '#667eea', textDecoration: 'none' }}>View All</Link>
          </div>
          <div className="terminal-panel-body no-padding" style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
            <TopRisks positions={positions} maxItems={4} />
          </div>
        </div>

        {/* ─── Active Positions Table ─── span 8 ─── */}
        <div className="terminal-span-8 terminal-panel" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div className="terminal-panel-header" style={{ borderBottom: '1px solid #1e2530', padding: '0.5rem 0.75rem', flexShrink: 0 }}>
            <h2 className="terminal-panel-title" style={{ margin: 0, fontSize: '0.8125rem' }}>Active Positions</h2>
            <Link to="/app/positions" style={{ fontSize: '0.6875rem', color: '#667eea', textDecoration: 'none' }}>View All →</Link>
          </div>
          <div className="terminal-panel-body no-padding">
            <table className="terminal-table" style={{ fontSize: '0.8125rem' }}>
              <thead>
                <tr>
                  <th style={{ padding: '0.5rem 0.75rem' }}>Market</th>
                  <th style={{ padding: '0.5rem 0.5rem' }}>Side</th>
                  <th className="align-right" style={{ padding: '0.5rem 0.5rem' }}>Size</th>
                  <th className="align-right" style={{ padding: '0.5rem 0.5rem' }}>Entry</th>
                  <th className="align-right" style={{ padding: '0.5rem 0.5rem' }}>Mark</th>
                  <th className="align-right" style={{ padding: '0.5rem 0.5rem' }}>P&L</th>
                  <th className="align-right" style={{ padding: '0.5rem 0.75rem' }}></th>
                </tr>
              </thead>
              <tbody>
                {positions.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
                      No active positions — <Link to="/app/markets" style={{ color: '#667eea', textDecoration: 'none' }}>Browse markets</Link>
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
                    <tr key={i} style={{ borderBottom: '1px solid #1e2530' }}>
                      <td style={{ padding: '0.5rem 0.75rem', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <Link to={`/app/markets/${p.marketId}`} style={{ color: '#c9d1d9', textDecoration: 'none', fontSize: '0.75rem' }}>
                          {p.marketQuestion}
                        </Link>
                      </td>
                      <td style={{ padding: '0.5rem 0.5rem' }}>
                        <span style={{
                          fontSize: '0.625rem',
                          fontWeight: 700,
                          padding: '0.125rem 0.375rem',
                          borderRadius: '3px',
                          background: isLong ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                          color: isLong ? '#10b981' : '#ef4444',
                        }}>{side}</span>
                      </td>
                      <td className="align-right" style={{ padding: '0.5rem 0.5rem', fontFamily: 'JetBrains Mono', fontSize: '0.75rem', color: '#c9d1d9' }}>£{cost.toFixed(2)}</td>
                      <td className="align-right" style={{ padding: '0.5rem 0.5rem', fontFamily: 'JetBrains Mono', fontSize: '0.75rem', color: '#8b949e' }}>{avgPrice.toFixed(1)}%</td>
                      <td className="align-right" style={{ padding: '0.5rem 0.5rem', fontFamily: 'JetBrains Mono', fontSize: '0.75rem', color: '#8b949e' }}>{mark.toFixed(1)}%</td>
                      <td className="align-right" style={{
                        padding: '0.5rem 0.5rem',
                        fontFamily: 'JetBrains Mono',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        color: pnlValue >= 0 ? '#3fb950' : '#f85149',
                      }}>
                        {pnlValue >= 0 ? '+' : ''}£{Math.abs(pnlValue).toFixed(2)}
                      </td>
                      <td className="align-right" style={{ padding: '0.5rem 0.75rem' }}>
                        <Link
                          to={`/app/markets/${p.marketId}`}
                          style={{
                            fontSize: '0.6875rem',
                            padding: '0.25rem 0.625rem',
                            borderRadius: '4px',
                            background: 'rgba(102, 126, 234, 0.12)',
                            color: '#667eea',
                            textDecoration: 'none',
                            fontWeight: 600,
                          }}
                        >
                          Trade
                        </Link>
                      </td>
                    </tr>
                  );
                }))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ─── Right column: Open Orders + Recent Markets ─── span 4 ─── */}
        <div className="terminal-span-4" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', minHeight: 0 }}>

          {/* Open Orders */}
          <div className="terminal-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div className="terminal-panel-header" style={{ borderBottom: '1px solid #1e2530', padding: '0.5rem 0.75rem', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <ClipboardList size={14} color="#8b949e" />
                <h2 className="terminal-panel-title" style={{ margin: 0, fontSize: '0.875rem' }}>Open Orders</h2>
                {openOrderCount > 0 && (
                  <span style={{
                    fontSize: '0.625rem',
                    fontWeight: 700,
                    background: 'rgba(102,126,234,0.15)',
                    color: '#667eea',
                    padding: '0.0625rem 0.375rem',
                    borderRadius: '8px',
                  }}>{openOrderCount}</span>
                )}
              </div>
              <Link to="/app/orders" style={{ fontSize: '0.6875rem', color: '#667eea', textDecoration: 'none' }}>Manage</Link>
            </div>
            <div className="terminal-panel-body no-padding" style={{ overflow: 'auto' }}>
              {orders.length === 0 ? (
                <div style={{ padding: '1.5rem 1rem', textAlign: 'center', color: '#6b7280', fontSize: '0.8125rem' }}>
                  No open orders
                  <div style={{ marginTop: '0.5rem' }}>
                    <Link to="/app/markets" style={{ color: '#667eea', textDecoration: 'none', fontSize: '0.75rem' }}>Place an order →</Link>
                  </div>
                </div>
              ) : (
                <div>
                  {orders.slice(0, 3).map((o: any, i: number) => (
                    <div
                      key={o.id || i}
                      style={{
                        padding: '0.5rem 1rem 0.5rem 0.75rem',
                        borderBottom: '1px solid #1e2530',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: '0.75rem',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: 0 }}>
                        <span style={{
                          fontSize: '0.5625rem',
                          fontWeight: 700,
                          padding: '0.0625rem 0.25rem',
                          borderRadius: '3px',
                          background: o.side === 'BUY_YES' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                          color: o.side === 'BUY_YES' ? '#10b981' : '#ef4444',
                          flexShrink: 0,
                        }}>
                          {o.side === 'BUY_YES' ? 'BUY' : 'SELL'}
                        </span>
                        <span style={{ color: '#c9d1d9', fontFamily: 'JetBrains Mono', flexShrink: 0 }}>
                          {(o.pPts / 100_000).toFixed(1)}%
                        </span>
                        <span style={{ color: '#6b7280', fontSize: '0.625rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          £{((o.remainingPence || o.liabilityPence || 0) / 100).toFixed(2)}
                        </span>
                      </div>
                      <Form method="post" style={{ flexShrink: 0 }}>
                        <input type="hidden" name="intent" value="cancelOrder" />
                        <input type="hidden" name="orderId" value={o.id} />
                        <button
                          type="submit"
                          disabled={isSubmitting}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '20px',
                            height: '20px',
                            background: 'rgba(248,81,73,0.08)',
                            border: '1px solid rgba(248,81,73,0.25)',
                            borderRadius: '4px',
                            color: '#f85149',
                            cursor: 'pointer',
                            opacity: isSubmitting ? 0.5 : 1,
                            padding: 0,
                          }}
                          title="Cancel order"
                        >
                          <X size={10} />
                        </button>
                      </Form>
                    </div>
                  ))}
                  {orders.length > 3 && (
                    <div style={{ padding: '0.375rem 0.75rem', textAlign: 'center' }}>
                      <Link to="/app/orders" style={{ color: '#667eea', textDecoration: 'none', fontSize: '0.6875rem' }}>+{orders.length - 3} more →</Link>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Recent Markets */}
          <div className="terminal-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
            <div className="terminal-panel-header" style={{ borderBottom: '1px solid #1e2530', padding: '0.5rem 0.75rem', flexShrink: 0 }}>
              <h2 className="terminal-panel-title" style={{ margin: 0, fontSize: '0.8125rem' }}>Recent Markets</h2>
              <Link to="/app/markets" style={{ fontSize: '0.6875rem', color: '#667eea', textDecoration: 'none' }}>Browse</Link>
            </div>
            <div className="terminal-panel-body no-padding" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
              {markets.slice(0, 6).map((m: any) => (
                <Link
                  key={m.id}
                  to={`/app/markets/${m.id}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.5rem',
                    padding: '0.375rem 0.75rem',
                    borderBottom: '1px solid rgba(30,37,48,0.6)',
                    textDecoration: 'none',
                    transition: 'background 0.12s',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(102,126,234,0.06)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                    <span style={{
                      width: '5px',
                      height: '5px',
                      borderRadius: '50%',
                      background: m.status === 'ACTIVE' ? '#3fb950' : '#6b7280',
                      flexShrink: 0,
                    }} />
                    <span style={{
                      fontSize: '0.6875rem',
                      color: '#c9d1d9',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      lineHeight: 1.3,
                    }}>
                      {m.name}
                    </span>
                  </div>
                  <span style={{
                    fontSize: '0.5625rem',
                    fontWeight: 600,
                    padding: '0.125rem 0.375rem',
                    borderRadius: '3px',
                    background: 'rgba(102, 126, 234, 0.1)',
                    color: '#667eea',
                    border: '1px solid rgba(102,126,234,0.2)',
                    flexShrink: 0,
                    letterSpacing: '0.02em',
                  }}>
                    Trade
                  </span>
                </Link>
              ))}
            </div>
          </div>

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
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.375rem',
        background: 'none',
        border: 'none',
        cursor: disabled ? 'default' : 'pointer',
        padding: '0.125rem 0',
        opacity: active ? 1 : 0.4,
        transition: 'opacity 0.15s',
        fontSize: '0.6875rem',
        color: '#8b949e',
      }}
    >
      <span style={{
        display: 'inline-block',
        width: '16px',
        height: '2px',
        background: color,
        borderRadius: '1px',
        ...(dashed ? { backgroundImage: `repeating-linear-gradient(90deg, ${color} 0, ${color} 3px, transparent 3px, transparent 6px)`, background: 'none' } : {}),
      }} />
      {label}
    </button>
  );
}

/* ── KPI card styles ── */
const kpiCard: React.CSSProperties = {
  background: '#161b22',
  border: '1px solid #21262d',
  borderRadius: '6px',
  padding: '0.5rem 0.75rem',
  cursor: 'pointer',
  transition: 'border-color 0.15s, background 0.15s',
};

const kpiRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.25rem',
  marginBottom: '0.125rem',
};

const kpiIcon: React.CSSProperties = {
  width: '20px',
  height: '20px',
  borderRadius: '4px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
};

const kpiLabel: React.CSSProperties = {
  fontSize: '0.6875rem',
  color: '#6b7280',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  fontWeight: 500,
};

const kpiValue: React.CSSProperties = {
  fontSize: '1rem',
  fontWeight: 700,
  fontFamily: 'JetBrains Mono, monospace',
  lineHeight: 1.2,
};
