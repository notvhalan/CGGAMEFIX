import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
import { useState, useEffect } from "react";
import { getWallet, getMarkets, getMyOrders, getBalanceHistory, getMyPositions } from "~/lib/api.server";
import { formatPence } from "~/lib/format";
import { BalanceChart } from "~/components/dashboard/BalanceChart";
import { SearchBar } from "~/components/layout/SearchBar";
import "~/styles/pages/dashboard.css";
import "~/styles/components/panels.css";
import "~/styles/components/metrics.css";
import "~/styles/components/tables.css";
import "~/styles/components/controls.css";

type TimeRange = '1D' | '1W' | '1M' | 'ALL';

const generateMockBalanceData = (pence: number, range: TimeRange) => {
  const now = Math.floor(Date.now() / 1000);
  const points = range === '1D' ? 48 : range === '1W' ? 168 : range === '1M' ? 720 : 2160;
  const interval = range === '1D' ? 1800 : range === '1W' ? 3600 : range === '1M' ? 3600 : 14400;
  
  const data = [];
  const startValue = pence * (0.85 + Math.random() * 0.1);
  
  for (let i = 0; i < points; i++) {
    const time = now - (points - i) * interval;
    const variance = (Math.random() - 0.5) * pence * 0.02;
    const trend = ((pence - startValue) / points) * i;
    const value = Math.max(0, startValue + trend + variance);
    data.push({ time, value });
  }
  
  return data;
};

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

    // Use real history if available, otherwise generate mock data
    const availablePence = wallet?.balancePence ?? 0;
    const reservedPence = wallet?.reservedPence ?? 0;
    const equityPence = availablePence + reservedPence;

    let equityData, availableData, reservedData;
    
    if (history?.history && history.history.length > 0) {
      console.log('[Dashboard Loader] Using REAL wallet history:', history.history.length, 'entries');
      console.log('[Dashboard Loader] Sample entry:', history.history[0]);
      
      // Deduplicate by timestamp - keep the last entry for each unique timestamp
      const deduped = history.history.reduce((acc: any[], h: any) => {
        const time = Math.floor(new Date(h.timestamp).getTime() / 1000);
        const existing = acc.find(item => item.time === time);
        if (existing) {
          // Update existing entry (keep the latest values for this timestamp)
          existing.balance = h.balance;
          existing.available = h.available;
          existing.reserved = h.reserved;
        } else {
          acc.push({
            time,
            balance: h.balance,
            available: h.available,
            reserved: h.reserved
          });
        }
        return acc;
      }, []);
      
      equityData = deduped.map(h => ({ time: h.time, value: h.balance }));
      availableData = deduped.map(h => ({ time: h.time, value: h.available }));
      reservedData = deduped.map(h => ({ time: h.time, value: h.reserved }));
      
      console.log('[Dashboard Loader] After deduplication:', deduped.length, 'unique timestamps');
      console.log('[Dashboard Loader] Transformed equity data sample:', equityData.slice(0, 3));
      console.log('[Dashboard Loader] Value range:', {
        min: Math.min(...equityData.map(d => d.value)),
        max: Math.max(...equityData.map(d => d.value))
      });
    } else {
      console.log('[Dashboard Loader] No real history found, using MOCK data. History response:', history);
      // Fallback to mock data
      equityData = generateMockBalanceData(equityPence, timeRange);
      availableData = generateMockBalanceData(availablePence, timeRange);
      reservedData = generateMockBalanceData(reservedPence, timeRange);
    }

    return json({ 
      wallet, 
      markets: markets.slice(0, 8),
      orders: orders.filter((o: any) => o.status === 'open' || o.status === 'partial').slice(0, 10),
      positions,
      timestamp: new Date().toISOString(),
      equityData,
      availableData,
      reservedData,
      timeRange
    });
  } catch (error) {
    const timeRange = '1W';
    return json({ 
      wallet: null, 
      markets: [], 
      orders: [], 
      positions: [],
      timestamp: new Date().toISOString(),
      equityData: generateMockBalanceData(10000, timeRange),
      availableData: generateMockBalanceData(8000, timeRange),
      reservedData: generateMockBalanceData(2000, timeRange),
      timeRange
    });
  }
}

export default function Dashboard() {
  const { wallet, markets, orders, positions, equityData, availableData, reservedData, timeRange } = useLoaderData<typeof loader>();
  const [watchlist, setWatchlist] = useState<string[]>([]);
  
  if (typeof window !== 'undefined') {
    console.log('[Dashboard Effect] Rerender', { timeRange, equityDataLength: equityData?.length });
  }

  const availablePence = wallet?.balancePence ?? 0;
  const reservedPence = wallet?.reservedPence ?? 0;
  const totalBalance = availablePence + reservedPence;
  const totalPositions = positions.length;
  // TODO: Calculate real PnL from history or positions
  const pnlPence = 15_00;
  const pnlPercent = totalBalance > 0 ? (pnlPence / totalBalance) * 100 : 0;

  // Load watchlist from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('watchlist');
    if (saved) {
      try {
        setWatchlist(JSON.parse(saved));
      } catch (e) {
        setWatchlist([]);
      }
    }
  }, []);

  const handleToggleWatch = (marketId: string) => {
    setWatchlist(prev => {
      const newList = prev.includes(marketId)
        ? prev.filter(id => id !== marketId)
        : [...prev, marketId];
      localStorage.setItem('watchlist', JSON.stringify(newList));
      return newList;
    });
  };

  const watchedMarkets = markets.filter((m: any) => watchlist.includes(m.id));

  return (
    <div className="terminal-dashboard">
      <div className="terminal-grid">
        
        {/* HERO CARD: Portfolio Snapshot */}
        {/* Top Left - 8 cols */}
        <div className="terminal-span-8 terminal-panel" style={{ position: 'relative', overflow: 'hidden' }}>
          <div className="terminal-panel-header" style={{ position: 'relative', zIndex: 10, background: 'transparent', borderBottom: 'none' }}>
            <h2 className="terminal-panel-title">Balance</h2>
            <div className="toggle-group">
              <Link to="?range=1D" className={`toggle-item ${timeRange === '1D' ? 'active' : ''}`}>1D</Link>
              <Link to="?range=1W" className={`toggle-item ${timeRange === '1W' ? 'active' : ''}`}>1W</Link>
              <Link to="?range=1M" className={`toggle-item ${timeRange === '1M' ? 'active' : ''}`}>1M</Link>
              <Link to="?range=ALL" className={`toggle-item ${timeRange === 'ALL' ? 'active' : ''}`}>ALL</Link>
            </div>
          </div>
          <div className="terminal-panel-body" style={{ position: 'relative', height: '320px', padding: 0 }}>
             {/* Graph Legend */}
             <div style={{ 
               position: 'absolute', 
               top: '1.25rem', 
               left: '1.25rem', 
               zIndex: 10,
               display: 'flex',
               gap: '1.5rem',
               fontSize: '0.875rem',
               color: 'var(--terminal-muted)'
             }}>
              <span>Balance History</span>
              <span>Available Funds</span>
              <span>Reserved Funds</span>
            </div>

            {/* Full Height Chart */}
            <div style={{ position: 'absolute', inset: 0, zIndex: 1 }}>
              <BalanceChart 
                equity={equityData}
                available={availableData}
                reserved={reservedData}
                timeRange={timeRange}
              />
            </div>
          </div>
        </div>

        {/* Top Right - 4 Cols - Risk / Quick Actions */}
        <div className="terminal-span-4 terminal-panel" style={{ overflow: 'visible' }}>
          <div className="terminal-panel-header">
            <h2 className="terminal-panel-title">Quick Access</h2>
          </div>
          <div className="terminal-panel-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', overflow: 'visible' }}>
            <SearchBar compact markets={markets} />

            <div>
              <div className="detail-label" style={{marginBottom: '0.5rem'}}>Exposure Breakdown</div>
              <div className="exposure-bar">
                <div className="exposure-segment" style={{ width: '40%', background: '#667eea' }}></div>
                <div className="exposure-segment" style={{ width: '30%', background: '#10b981' }}></div>
                <div className="exposure-segment" style={{ width: '20%', background: '#f59e0b' }}></div>
                <div className="exposure-segment" style={{ width: '10%', background: '#374151' }}></div>
              </div>
              <div className="exposure-legend">
                <div className="legend-item"><div className="legend-dot" style={{background: '#667eea'}}></div> Football</div>
                <div className="legend-item"><div className="legend-dot" style={{background: '#10b981'}}></div> Politics</div>
                <div className="legend-item"><div className="legend-dot" style={{background: '#f59e0b'}}></div> Crypto</div>
                <div className="legend-item"><div className="legend-dot" style={{background: '#374151'}}></div> Other</div>
              </div>
            </div>
          </div>
        </div>

        {/* Current Bets Table - Full width */}
        <div className="terminal-span-8 terminal-panel">
          <div className="terminal-panel-header">
            <h2 className="terminal-panel-title">Current Bets</h2>
            <div className="toggle-group">
               <button className="toggle-item active">All</button>
               <button className="toggle-item">Open</button>
               <button className="toggle-item">Settled</button>
            </div>
          </div>
          <div className="terminal-panel-body no-padding">
             {/* Use dummy data for now as positions API isn't fully linked in loader yet */}
             <table className="terminal-table">
               <thead>
                 <tr>
                   <th>Market</th>
                   <th>Side</th>
                   <th className="align-right">Size</th>
                   <th className="align-right">Avg Entry</th>
                   <th className="align-right">Mark</th>
                   <th className="align-right">P&L</th>
                   <th></th>
                 </tr>
               </thead>
               <tbody>
                 {positions.length === 0 ? (
                   <tr>
                     <td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: 'var(--terminal-muted)' }}>
                       No active positions
                     </td>
                   </tr>
                 ) : (positions.map((p: any, i: number) => {
                    const micros = BigInt(p.netContractsMicros);
                    const isLong = micros > 0n;
                    const contracts = Number(micros > 0n ? micros : -micros) / 1_000_000;
                    const side = isLong ? 'YES' : 'NO';
                    const pillClass = isLong ? 'pill-yes' : 'pill-no';
                    const avgPrice = p.avgEntryYesPts / 100_000;
                    const mark = p.markYesPts / 100_000;
                    
                    const pnlPercent = isLong ? (mark - avgPrice) : (avgPrice - mark);
                    const pnlValue = (pnlPercent / 100) * contracts;
                    
                    // Cost/Exposure calculation
                    // For Long: Contracts * Price
                    // For Short: Contracts * (1 - Price) ? Or is it essentially margin?
                    // We'll show Risk/Cost for now.
                    const cost = contracts * (isLong ? avgPrice/100 : (1 - avgPrice/100));

                    return (
                   <tr key={i}>
                     <td className="td-mono" style={{ color: 'white' }}>{p.marketQuestion}</td>
                     <td><span className={`pill ${pillClass}`}>{side}</span></td>
                     <td className="align-right td-mono">£{cost.toFixed(2)}</td>
                     <td className="align-right td-mono">{avgPrice.toFixed(1)}%</td>
                     <td className="align-right td-mono">{mark.toFixed(1)}%</td>
                     <td className="align-right td-mono" style={{ color: pnlValue >= 0 ? 'var(--terminal-green)' : 'var(--terminal-red)' }}>
                        {pnlValue >= 0 ? '+' : '-'}£{Math.abs(pnlValue).toFixed(2)}
                     </td>
                     <td className="align-right">
                        <Link to={`/markets/${p.marketId}`} style={{textDecoration: 'none', color: 'inherit'}}>➜</Link>
                     </td>
                   </tr>
                 )}))}
                 <tr className="empty-row" style={{ height: '100%' }}></tr>
               </tbody>
             </table>
             <div style={{ padding: '1rem', textAlign: 'center' }}>
                <Link to="/app/positions" className="terminal-link">View all active positions</Link>
             </div>
          </div>
        </div>

        {/* Open Orders & Watchlist Tiles */}
        <div className="terminal-span-4" style={{ display: 'grid', gridTemplateRows: '1fr 1fr', gap: '1.25rem' }}>
          
          {/* Tile 1: Open Orders */}
          <div className="terminal-panel">
            <div className="terminal-panel-header">
              <h2 className="terminal-panel-title">Open Orders</h2>
              <Link to="/app/orders" className="terminal-link">Manage</Link>
            </div>
            <div className="terminal-panel-body">
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '2.5rem', fontWeight: 700, color: 'white', fontFamily: 'JetBrains Mono' }}>
                  {orders.length}
                </span>
                <span className="detail-label">Active</span>
              </div>
              <div style={{ display: 'flex', gap: '1rem', color: 'var(--terminal-muted)', fontSize: '0.875rem' }}>
                 <span>2 waiting fill</span>
                 <span>•</span>
                 <span>1 partial</span>
              </div>
              <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
                 <div style={{ flex: 1, padding: '0.5rem', background: 'rgba(16, 185, 129, 0.1)', borderRadius: '4px', textAlign: 'center' }}>
                    <div className="detail-label" style={{ color: 'var(--terminal-green)' }}>FOR</div>
                    <div className="detail-value">4</div>
                 </div>
                 <div style={{ flex: 1, padding: '0.5rem', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '4px', textAlign: 'center' }}>
                    <div className="detail-label" style={{ color: 'var(--terminal-red)' }}>LAY</div>
                    <div className="detail-value">1</div>
                 </div>
              </div>
            </div>
          </div>

          {/* Tile 2: Watchlist */}
          <div className="terminal-panel">
            <div className="terminal-panel-header">
              <h2 className="terminal-panel-title">Watchlist</h2>
              <Link to="/markets" className="terminal-link">Browse</Link>
            </div>
            <div className="terminal-panel-body no-padding">
              {watchedMarkets.length === 0 ? (
                <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--terminal-muted)', fontSize: '0.875rem' }}>
                  No markets in watchlist
                </div>
              ) : (
                <table className="terminal-table" style={{ fontSize: '0.75rem' }}>
                  <tbody>
                    {watchedMarkets.slice(0, 3).map((m: any) => (
                    <tr key={m.id}>
                      <td style={{ padding: '0.5rem 1rem' }}>{m.name}</td>
                      <td className="td-mono align-right" style={{ color: 'var(--terminal-green)', padding: '0.5rem 1rem' }}>
                        -
                      </td>
                      <td className="align-right" style={{ padding: '0.5rem 1rem' }}>
                        <Link to={`/markets/${m.id}`} className="pill" style={{ background: 'rgba(255, 255, 255, 0.1)', color: 'white', textDecoration: 'none' }}>Trade</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              )}
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
