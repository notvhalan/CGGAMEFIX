import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, Link, Form, useNavigation } from "@remix-run/react";
import { useState } from "react";
import { getWallet, getMarkets, getMyOrders, getBalanceHistory, getMyPositions, cancelOrder } from "~/lib/api.server";
import { formatPence } from "~/lib/format";
import { BalanceChart } from "~/components/dashboard/BalanceChart";
import { X } from "lucide-react";
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
  const [chartMode, setChartMode] = useState<'equity' | 'available' | 'reserved'>('equity');
  
  if (typeof window !== 'undefined') {
    console.log('[Dashboard Effect] Rerender', { timeRange, equityDataLength: equityData?.length });
  }

  const availablePence = wallet?.balance ? Math.round(wallet.balance * 100) : 0;
  const reservedPence = wallet?.lockedBalance ? Math.round(wallet.lockedBalance * 100) : 0;
  
  // Calculate position value at mark price (same as in loader)
  const positionValuePence = positions.reduce((sum: number, p: any) => {
    const micros = BigInt(p.netContractsMicros || '0');
    if (micros === 0n) return sum;
    
    const contracts = Number(micros > 0n ? micros : -micros) / 1_000_000;
    const markPrice = (p.markYesPts || 0) / 100_000 / 100; // Convert to decimal price
    const isLong = micros > 0n;
    
    // Position value = what you could sell it for at mark price
    const value = contracts * (isLong ? markPrice : (1 - markPrice)) * 100; // Convert to pence
    return sum + value;
  }, 0);
  
  // Total equity = cash + reserved + position value
  const totalBalance = availablePence + reservedPence + positionValuePence;
  const totalPositions = positions.length;
  
  // Calculate real metrics from positions
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
  const partialOrderCount = orders.filter((o: any) => (o.status || '').toLowerCase() === 'partial').length;
  const waitingOrderCount = orders.filter((o: any) => (o.status || '').toLowerCase() === 'open').length;

  return (
    <div className="terminal-dashboard">
      {/* KPI STRIP - "How am I doing?" */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(6, 1fr)', 
        gap: '0.75rem', 
        marginBottom: '1rem',
        padding: '0 0.25rem'
      }}>
        {/* Equity */}
        <Link to="/app/portfolio" style={{ textDecoration: 'none' }}>
          <div style={{ 
            background: '#1a1f26', 
            border: '1px solid #2d3748', 
            borderRadius: '6px', 
            padding: '0.875rem 1rem',
            cursor: 'pointer',
            transition: 'border-color 0.15s',
            minHeight: '64px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center'
          }}>
            <div style={{ fontSize: '0.6875rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>
              Equity
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#e4e8eb', fontFamily: 'JetBrains Mono' }}>
              £{(totalBalance / 100).toLocaleString('en-GB', { minimumFractionDigits: 2 })}
            </div>
          </div>
        </Link>

        {/* 24h P&L */}
        <div style={{ 
          background: '#1a1f26', 
          border: '1px solid #2d3748', 
          borderRadius: '6px', 
          padding: '0.875rem 1rem'
        }}>
          <div style={{ fontSize: '0.6875rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>
            Unrealized P&L
          </div>
          <div style={{ 
            fontSize: '1.25rem', 
            fontWeight: 700, 
            color: totalUnrealizedPnl >= 0 ? '#10b981' : '#ef4444', 
            fontFamily: 'JetBrains Mono',
            display: 'flex',
            alignItems: 'center',
            gap: '0.25rem'
          }}>
            <span style={{ fontSize: '0.875rem' }}>{totalUnrealizedPnl >= 0 ? '▲' : '▼'}</span>
            £{Math.abs(totalUnrealizedPnl).toFixed(2)}
          </div>
        </div>

        {/* Available */}
        <div style={{ 
          background: '#1a1f26', 
          border: '1px solid #2d3748', 
          borderRadius: '6px', 
          padding: '0.875rem 1rem'
        }}>
          <div style={{ fontSize: '0.6875rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>
            Available
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#10b981', fontFamily: 'JetBrains Mono' }}>
            £{(availablePence / 100).toLocaleString('en-GB', { minimumFractionDigits: 2 })}
          </div>
        </div>

        {/* Reserved */}
        <div style={{ 
          background: '#1a1f26', 
          border: '1px solid #2d3748', 
          borderRadius: '6px', 
          padding: '0.875rem 1rem'
        }}>
          <div style={{ fontSize: '0.6875rem', color: '#64748b', textTransform: '0.05em', marginBottom: '0.25rem' }}>
            Reserved
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#f59e0b', fontFamily: 'JetBrains Mono' }}>
            £{(reservedPence / 100).toLocaleString('en-GB', { minimumFractionDigits: 2 })}
          </div>
        </div>

        {/* Open Exposure */}
        <Link to="/app/positions" style={{ textDecoration: 'none' }}>
          <div style={{ 
            background: '#1a1f26', 
            border: '1px solid #2d3748', 
            borderRadius: '6px', 
            padding: '0.875rem 1rem',
            cursor: 'pointer'
          }}>
            <div style={{ fontSize: '0.6875rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>
              Open Exposure
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#e4e8eb', fontFamily: 'JetBrains Mono' }}>
              £{openExposure.toFixed(2)}
            </div>
            <div style={{ fontSize: '0.6875rem', color: '#64748b' }}>{totalPositions} positions</div>
          </div>
        </Link>

        {/* Open Orders */}
        <Link to="/app/orders" style={{ textDecoration: 'none' }}>
          <div style={{ 
            background: '#1a1f26', 
            border: '1px solid #2d3748', 
            borderRadius: '6px', 
            padding: '0.875rem 1rem',
            cursor: 'pointer'
          }}>
            <div style={{ fontSize: '0.6875rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>
              Open Orders
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#e4e8eb', fontFamily: 'JetBrains Mono' }}>
              {openOrderCount}
            </div>
            <div style={{ fontSize: '0.6875rem', color: '#64748b' }}>
              {waitingOrderCount} waiting • {partialOrderCount} partial
            </div>
          </div>
        </Link>
      </div>

      <div className="terminal-grid">
        
        {/* HERO CARD: Portfolio Snapshot */}
        {/* Top Left - 8 cols */}
        <div className="terminal-span-8 terminal-panel" style={{ position: 'relative', overflow: 'hidden', minHeight: '350px' }}>
          <div className="terminal-panel-header" style={{ position: 'relative', zIndex: 10, background: 'transparent', borderBottom: 'none' }}>
            <h2 className="terminal-panel-title">Balance</h2>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              {/* Chart mode toggles */}
              <div className="toggle-group" style={{ marginRight: '1rem' }}>
                <button 
                  onClick={() => setChartMode('equity')} 
                  className={`toggle-item ${chartMode === 'equity' ? 'active' : ''}`}
                >
                  Equity
                </button>
                <button 
                  onClick={() => setChartMode('available')} 
                  className={`toggle-item ${chartMode === 'available' ? 'active' : ''}`}
                >
                  Available
                </button>
                <button 
                  onClick={() => setChartMode('reserved')} 
                  className={`toggle-item ${chartMode === 'reserved' ? 'active' : ''}`}
                >
                  Reserved
                </button>
              </div>
              {/* Time range */}
              <div className="toggle-group">
                <Link to="?range=1D" className={`toggle-item ${timeRange === '1D' ? 'active' : ''}`}>1D</Link>
                <Link to="?range=1W" className={`toggle-item ${timeRange === '1W' ? 'active' : ''}`}>1W</Link>
                <Link to="?range=1M" className={`toggle-item ${timeRange === '1M' ? 'active' : ''}`}>1M</Link>
                <Link to="?range=ALL" className={`toggle-item ${timeRange === 'ALL' ? 'active' : ''}`}>ALL</Link>
              </div>
            </div>
          </div>
          <div className="terminal-panel-body" style={{ position: 'relative', height: '290px', padding: 0 }}>
            {/* Full Height Chart */}
            <div style={{ position: 'absolute', inset: 0, zIndex: 1 }}>
              <BalanceChart 
                equity={chartMode === 'equity' ? equityData : chartMode === 'available' ? availableData : reservedData}
                available={chartMode === 'equity' ? availableData : []}
                reserved={chartMode === 'equity' ? reservedData : []}
                events={eventsData}
                timeRange={timeRange}
              />
            </div>
          </div>
        </div>

        {/* Top Right - 4 Cols - Top Risks */}
        <div className="terminal-span-4 terminal-panel">
          <div className="terminal-panel-header">
            <h2 className="terminal-panel-title">Top Risks</h2>
            <Link to="/app/positions" className="terminal-link">View All</Link>
          </div>
          <div className="terminal-panel-body no-padding">
            {positions.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b', fontSize: '0.875rem' }}>
                No open positions
                <div style={{ marginTop: '0.5rem' }}>
                  <Link to="/app/markets" style={{ color: '#667eea', textDecoration: 'none', fontSize: '0.8125rem' }}>Start trading →</Link>
                </div>
              </div>
            ) : (
              <div style={{ maxHeight: '340px', overflow: 'auto', paddingRight: '0.5rem' }}>
                {positions.slice(0, 5).map((p: any, i: number) => {
                  const micros = BigInt(p.netContractsMicros || '0');
                  const isLong = micros > 0n;
                  const contracts = Number(micros > 0n ? micros : -micros) / 1_000_000;
                  const avgPrice = (p.avgEntryYesPts || 0) / 100_000;
                  const mark = (p.markYesPts || 0) / 100_000;
                  const cost = contracts * (isLong ? avgPrice / 100 : (1 - avgPrice / 100));
                  const pnlPercent = isLong ? (mark - avgPrice) : (avgPrice - mark);
                  const pnlValue = (pnlPercent / 100) * contracts;
                  
                  return (
                    <div 
                      key={i} 
                      style={{ 
                        padding: '0.625rem 0.875rem', 
                        borderBottom: '1px solid #2d3748',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ 
                          fontSize: '0.75rem', 
                          color: '#e4e8eb', 
                          fontWeight: 600,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          marginBottom: '0.125rem'
                        }}>
                          {p.marketQuestion || `Position ${i + 1}`}
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.6875rem' }}>
                          <span className={`pill ${isLong ? 'pill-yes' : 'pill-no'}`} style={{ padding: '0.125rem 0.375rem', fontSize: '0.625rem' }}>
                            {isLong ? 'YES' : 'NO'}
                          </span>
                          <span style={{ color: '#64748b' }}>Risk: £{cost.toFixed(2)}</span>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ 
                          fontSize: '0.8125rem', 
                          fontWeight: 700, 
                          color: pnlValue >= 0 ? '#10b981' : '#ef4444',
                          fontFamily: 'JetBrains Mono'
                        }}>
                          {pnlValue >= 0 ? '+' : '-'}£{Math.abs(pnlValue).toFixed(2)}
                        </div>
                        <Link 
                          to={`/app/markets/${p.marketId}`} 
                          style={{ 
                            fontSize: '0.625rem', 
                            color: '#667eea', 
                            textDecoration: 'none' 
                          }}
                        >
                          Manage →
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Current Bets Table - Full width */}
        <div className="terminal-span-8 terminal-panel">
          <div className="terminal-panel-header">
            <h2 className="terminal-panel-title">Active Positions</h2>
            <Link to="/app/positions" className="terminal-link">View All →</Link>
          </div>
          <div className="terminal-panel-body no-padding">
             <table className="terminal-table" style={{ fontSize: '0.8125rem' }}>
               <thead>
                 <tr>
                   <th style={{ padding: '0.375rem 0.75rem' }}>Market</th>
                   <th style={{ padding: '0.375rem 0.5rem' }}>Side</th>
                   <th className="align-right" style={{ padding: '0.375rem 0.5rem' }}>Size</th>
                   <th className="align-right" style={{ padding: '0.375rem 0.5rem' }}>Entry</th>
                   <th className="align-right" style={{ padding: '0.375rem 0.5rem' }}>Mark</th>
                   <th className="align-right" style={{ padding: '0.375rem 0.5rem' }}>P&L</th>
                   <th className="align-right" style={{ padding: '0.375rem 0.75rem' }}>Actions</th>
                 </tr>
               </thead>
               <tbody>
                 {positions.length === 0 ? (
                   <tr>
                     <td colSpan={7} style={{ textAlign: 'center', padding: '1.5rem', color: '#64748b' }}>
                       No active positions — <Link to="/app/markets" style={{ color: '#667eea', textDecoration: 'none' }}>Browse markets</Link>
                     </td>
                   </tr>
                 ) : (positions.slice(0, 4).map((p: any, i: number) => {
                    const micros = BigInt(p.netContractsMicros);
                    const isLong = micros > 0n;
                    const contracts = Number(micros > 0n ? micros : -micros) / 1_000_000;
                    const side = isLong ? 'YES' : 'NO';
                    const pillClass = isLong ? 'pill-yes' : 'pill-no';
                    const avgPrice = p.avgEntryYesPts / 100_000;
                    const mark = p.markYesPts / 100_000;
                    
                    const pnlPercent = isLong ? (mark - avgPrice) : (avgPrice - mark);
                    const pnlValue = (pnlPercent / 100) * contracts;
                    const cost = contracts * (isLong ? avgPrice/100 : (1 - avgPrice/100));

                    return (
                   <tr key={i}>
                     <td className="td-mono" style={{ color: '#e4e8eb', padding: '0.375rem 0.75rem', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                       <Link to={`/app/markets/${p.marketId}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                         {p.marketQuestion}
                       </Link>
                     </td>
                     <td style={{ padding: '0.375rem 0.5rem' }}><span className={`pill ${pillClass}`} style={{ fontSize: '0.6875rem', padding: '0.125rem 0.375rem' }}>{side}</span></td>
                     <td className="align-right td-mono" style={{ padding: '0.375rem 0.5rem' }}>£{cost.toFixed(2)}</td>
                     <td className="align-right td-mono" style={{ padding: '0.375rem 0.5rem' }}>{avgPrice.toFixed(1)}%</td>
                     <td className="align-right td-mono" style={{ padding: '0.375rem 0.5rem' }}>{mark.toFixed(1)}%</td>
                     <td className="align-right td-mono" style={{ color: pnlValue >= 0 ? '#10b981' : '#ef4444', padding: '0.375rem 0.5rem', fontWeight: 600 }}>
                        {pnlValue >= 0 ? '+' : '-'}£{Math.abs(pnlValue).toFixed(2)}
                     </td>
                     <td className="align-right" style={{ padding: '0.375rem 0.75rem' }}>
                        <div style={{ display: 'flex', gap: '0.375rem', justifyContent: 'flex-end' }}>
                          <Link 
                            to={`/app/markets/${p.marketId}`} 
                            style={{
                              fontSize: '0.6875rem',
                              padding: '0.25rem 0.5rem',
                              borderRadius: '3px',
                              background: 'rgba(102, 126, 234, 0.15)',
                              color: '#667eea',
                              textDecoration: 'none',
                              fontWeight: 600
                            }}
                          >
                            Trade
                          </Link>
                        </div>
                     </td>
                   </tr>
                 )}))}
               </tbody>
             </table>
          </div>
        </div>

        {/* Open Orders & Watchlist & Activity */}
        <div className="terminal-span-4" style={{ display: 'grid', gridTemplateRows: '1fr 1fr', gap: '0.75rem' }}>
          
          {/* Tile 1: Open Orders - Now shows actual orders with cancel */}
          <div className="terminal-panel">
            <div className="terminal-panel-header">
              <h2 className="terminal-panel-title">Open Orders</h2>
              <Link to="/app/orders" className="terminal-link">Manage</Link>
            </div>
            <div className="terminal-panel-body no-padding" style={{ overflow: 'auto' }}>
              {orders.length === 0 ? (
                <div style={{ padding: '1.25rem', textAlign: 'center', color: '#64748b', fontSize: '0.8125rem' }}>
                  No open orders
                  <div style={{ marginTop: '0.5rem' }}>
                    <Link to="/app/markets" style={{ color: '#667eea', textDecoration: 'none', fontSize: '0.75rem' }}>
                      Place an order →
                    </Link>
                  </div>
                </div>
              ) : (
                <div>
                  {/* Summary header */}
                  <div style={{ 
                    padding: '0.5rem 0.75rem', 
                    background: 'rgba(102, 126, 234, 0.08)', 
                    borderBottom: '1px solid #2d3748',
                    fontSize: '0.6875rem',
                    color: '#94a3b8',
                    display: 'flex',
                    gap: '0.75rem'
                  }}>
                    <span><strong style={{ color: '#e4e8eb' }}>{openOrderCount}</strong> Active</span>
                    <span>•</span>
                    <span>{waitingOrderCount} waiting</span>
                    <span>•</span>
                    <span>{partialOrderCount} partial</span>
                  </div>
                  {/* Order list */}
                  {orders.slice(0, 4).map((o: any, i: number) => (
                    <div 
                      key={o.id || i} 
                      style={{ 
                        padding: '0.5rem 1rem 0.5rem 0.75rem', 
                        borderBottom: '1px solid #2d3748',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: '0.75rem'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: 0 }}>
                        <span className={`pill ${o.side === 'BUY_YES' ? 'pill-yes' : 'pill-no'}`} style={{ fontSize: '0.5625rem', padding: '0.0625rem 0.25rem', flexShrink: 0 }}>
                          {o.side === 'BUY_YES' ? 'BUY' : 'SELL'}
                        </span>
                        <span style={{ color: '#e4e8eb', fontFamily: 'JetBrains Mono', flexShrink: 0 }}>
                          {(o.pPts / 100_000).toFixed(1)}%
                        </span>
                        <span style={{ color: '#64748b', fontSize: '0.625rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
                            background: 'rgba(239, 68, 68, 0.1)',
                            border: '1px solid rgba(239, 68, 68, 0.3)',
                            borderRadius: '4px',
                            color: '#ef4444',
                            cursor: 'pointer',
                            opacity: isSubmitting ? 0.5 : 1,
                            padding: 0
                          }}
                          title="Cancel order"
                        >
                          <X size={10} />
                        </button>
                      </Form>
                    </div>
                  ))}
                  {orders.length > 4 && (
                    <div style={{ padding: '0.375rem 0.75rem', textAlign: 'center' }}>
                      <Link to="/app/orders" style={{ color: '#667eea', textDecoration: 'none', fontSize: '0.6875rem' }}>
                        +{orders.length - 4} more orders →
                      </Link>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Tile 2: Recent Markets / Watchlist */}
          <div className="terminal-panel">
            <div className="terminal-panel-header">
              <h2 className="terminal-panel-title">Recent Markets</h2>
              <Link to="/app/markets" className="terminal-link">Browse</Link>
            </div>
            <div className="terminal-panel-body no-padding">
              {markets.slice(0, 4).map((m: any, i: number) => (
                <div 
                  key={m.id}
                  style={{ 
                    padding: '0.5rem 1rem 0.5rem 0.75rem', 
                    borderBottom: '1px solid #2d3748',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ 
                      fontSize: '0.75rem', 
                      color: '#e4e8eb',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {m.name}
                    </div>
                    <div style={{ fontSize: '0.625rem', color: '#64748b' }}>
                      {m.status === 'ACTIVE' ? '🟢 Active' : '⚪ Closed'}
                    </div>
                  </div>
                  <Link 
                    to={`/app/markets/${m.id}`} 
                    style={{ 
                      fontSize: '0.625rem',
                      padding: '0.25rem 0.5rem',
                      borderRadius: '3px',
                      background: 'rgba(102, 126, 234, 0.15)',
                      color: '#667eea',
                      textDecoration: 'none',
                      fontWeight: 600
                    }}
                  >
                    Trade
                  </Link>
                </div>
              ))}
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
