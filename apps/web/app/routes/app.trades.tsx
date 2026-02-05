import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
import { useState, useMemo } from "react";
import { getMyTrades } from "~/lib/api.server";
import { History, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight } from "lucide-react";

interface Trade {
  id: string;
  market_id: string;
  market_question: string;
  yes_pts: number;
  cost_pence: number;
  contracts: string;
  maker_id: string;
  taker_id: string;
  maker_fee_pence: number;
  taker_fee_pence: number;
  side: 'FOR' | 'LAY';
  executed_at: string;
  user_role: 'maker' | 'taker';
  user_fee_pence: number;
  realized_pnl_pence: number;
  lot_opened_micros: string | null;
  lot_remaining_micros: string | null;
  lot_side: string | null;
}

export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const result = await getMyTrades(request, 200);
    return json({ trades: result?.trades || [] });
  } catch (error) {
    console.error('[Trades Loader] Error:', error);
    return json({ trades: [] });
  }
}

type SortKey = 'time' | 'market' | 'side' | 'price' | 'size' | 'pnl' | 'fee';
type SortDir = 'asc' | 'desc';

export default function Trades() {
  const { trades } = useLoaderData<typeof loader>();
  const [sortKey, setSortKey] = useState<SortKey>('time');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [filter, setFilter] = useState<'all' | 'buys' | 'sells'>('all');

  // Enrich trades with calculated fields
  const enrichedTrades = useMemo(() => {
    return trades.map((t: Trade) => {
      const contracts = Number(t.contracts || 0) / 1_000_000;
      const price = (t.yes_pts || 0) / 100_000;
      const cost = (t.cost_pence || 0) / 100;
      const fee = (t.user_fee_pence || 0) / 100;
      const pnl = (t.realized_pnl_pence || 0) / 100;
      const isBuy = t.side === 'BUY_YES';
      const time = new Date(t.executed_at);
      const isOpen = t.lot_remaining_micros && Number(t.lot_remaining_micros) > 0;
      const isClosed = t.lot_opened_micros && Number(t.lot_remaining_micros) === 0;

      return {
        ...t,
        contracts,
        price,
        cost,
        fee,
        pnl,
        isBuy,
        time,
        isOpen,
        isClosed
      };
    });
  }, [trades]);

  // Filter trades
  const filteredTrades = useMemo(() => {
    if (filter === 'all') return enrichedTrades;
    if (filter === 'buys') return enrichedTrades.filter(t => t.isBuy);
    return enrichedTrades.filter(t => !t.isBuy);
  }, [enrichedTrades, filter]);

  // Sort trades
  const sortedTrades = useMemo(() => {
    return [...filteredTrades].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'time':
          cmp = a.time.getTime() - b.time.getTime();
          break;
        case 'market':
          cmp = (a.market_question || '').localeCompare(b.market_question || '');
          break;
        case 'side':
          cmp = a.isBuy === b.isBuy ? 0 : a.isBuy ? -1 : 1;
          break;
        case 'price':
          cmp = a.price - b.price;
          break;
        case 'size':
          cmp = a.cost - b.cost;
          break;
        case 'fee':
          cmp = a.fee - b.fee;
          break;
        case 'pnl':
          cmp = a.pnl - b.pnl;
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filteredTrades, sortKey, sortDir]);

  // Aggregate metrics
  const metrics = useMemo(() => {
    const totalVolume = enrichedTrades.reduce((sum, t) => sum + t.cost, 0);
    const totalFees = enrichedTrades.reduce((sum, t) => sum + t.fee, 0);
    const totalPnl = enrichedTrades.reduce((sum, t) => sum + t.pnl, 0);
    const buyCount = enrichedTrades.filter(t => t.isBuy).length;
    const sellCount = enrichedTrades.filter(t => !t.isBuy).length;
    const makerCount = enrichedTrades.filter(t => t.user_role === 'maker').length;
    const takerCount = enrichedTrades.filter(t => t.user_role === 'taker').length;
    const closedCount = enrichedTrades.filter(t => t.isClosed).length;

    // Group by day for chart
    const today = new Date();
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today);
      d.setDate(d.getDate() - (6 - i));
      return d.toDateString();
    });
    
    const volumeByDay = last7Days.map(day => {
      const dayTrades = enrichedTrades.filter(t => t.time.toDateString() === day);
      return dayTrades.reduce((sum, t) => sum + t.cost, 0);
    });

    return {
      totalVolume,
      totalFees,
      totalPnl,
      buyCount,
      sellCount,
      makerCount,
      takerCount,
      closedCount,
      totalCount: enrichedTrades.length,
      volumeByDay,
      last7Days
    };
  }, [enrichedTrades]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const formatTime = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  };

  const panelStyle: React.CSSProperties = {
    background: '#0d1117',
    border: '1px solid #2d3748',
    borderRadius: '8px',
    overflow: 'hidden'
  };

  return (
    <div style={{ padding: '1.5rem', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <History size={28} color="#667eea" />
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#e4e8eb', margin: 0 }}>
            Trade History
          </h1>
        </div>
      </div>

      {/* Metrics Row */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(5, 1fr)', 
        gap: '0.75rem',
        marginBottom: '1.25rem'
      }}>
        {/* Total Trades */}
        <div style={{ 
          background: '#1a1f26', 
          border: '1px solid #2d3748', 
          borderRadius: '6px', 
          padding: '0.875rem 1rem'
        }}>
          <div style={{ fontSize: '0.6875rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>
            Total Trades
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#e4e8eb', fontFamily: 'JetBrains Mono' }}>
            {metrics.totalCount}
          </div>
          <div style={{ fontSize: '0.6875rem', color: '#64748b' }}>
            {metrics.buyCount} buys • {metrics.sellCount} sells
          </div>
        </div>

        {/* Volume */}
        <div style={{ 
          background: '#1a1f26', 
          border: '1px solid #2d3748', 
          borderRadius: '6px', 
          padding: '0.875rem 1rem'
        }}>
          <div style={{ fontSize: '0.6875rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>
            Total Volume
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#10b981', fontFamily: 'JetBrains Mono' }}>
            £{metrics.totalVolume.toFixed(2)}
          </div>
        </div>

        {/* Fees Paid */}
        <div style={{ 
          background: '#1a1f26', 
          border: '1px solid #2d3748', 
          borderRadius: '6px', 
          padding: '0.875rem 1rem'
        }}>
          <div style={{ fontSize: '0.6875rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>
            Fees Paid
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#f59e0b', fontFamily: 'JetBrains Mono' }}>
            £{metrics.totalFees.toFixed(2)}
          </div>
        </div>

        {/* Realized P&L */}
        <div style={{ 
          background: '#1a1f26', 
          border: '1px solid #2d3748', 
          borderRadius: '6px', 
          padding: '0.875rem 1rem'
        }}>
          <div style={{ fontSize: '0.6875rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>
            Realized P&L
          </div>
          <div style={{ 
            fontSize: '1.25rem', 
            fontWeight: 700, 
            fontFamily: 'JetBrains Mono',
            color: metrics.totalPnl > 0 ? '#10b981' : metrics.totalPnl < 0 ? '#ef4444' : '#e4e8eb'
          }}>
            {metrics.totalPnl > 0 ? '+' : ''}£{metrics.totalPnl.toFixed(2)}
          </div>
          <div style={{ fontSize: '0.6875rem', color: '#64748b' }}>
            {metrics.closedCount} closed trades
          </div>
        </div>

        {/* Mini Volume Chart */}
        <div style={{ 
          background: '#1a1f26', 
          border: '1px solid #2d3748', 
          borderRadius: '6px', 
          padding: '0.875rem 1rem'
        }}>
          <div style={{ fontSize: '0.6875rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.375rem' }}>
            7-Day Volume
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '32px' }}>
            {metrics.volumeByDay.map((vol, i) => {
              const maxVol = Math.max(...metrics.volumeByDay, 1);
              const height = (vol / maxVol) * 100;
              return (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    height: `${Math.max(height, 4)}%`,
                    background: vol > 0 ? '#667eea' : '#374151',
                    borderRadius: '2px',
                    transition: 'height 0.2s'
                  }}
                  title={`${metrics.last7Days[i]}: £${vol.toFixed(2)}`}
                />
              );
            })}
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        {(['all', 'buys', 'sells'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '0.5rem 1rem',
              background: filter === f ? 'rgba(102, 126, 234, 0.15)' : 'transparent',
              border: `1px solid ${filter === f ? '#667eea' : '#2d3748'}`,
              borderRadius: '6px',
              color: filter === f ? '#667eea' : '#94a3b8',
              fontSize: '0.8125rem',
              fontWeight: 600,
              cursor: 'pointer',
              textTransform: 'capitalize',
              display: 'flex',
              alignItems: 'center',
              gap: '0.375rem'
            }}
          >
            {f === 'buys' && <ArrowUpRight size={14} color="#10b981" />}
            {f === 'sells' && <ArrowDownRight size={14} color="#ef4444" />}
            {f === 'all' ? `All (${metrics.totalCount})` : 
             f === 'buys' ? `Buys (${metrics.buyCount})` : 
             `Sells (${metrics.sellCount})`}
          </button>
        ))}
      </div>

      {/* Trades Table */}
      <div style={panelStyle}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #2d3748' }}>
                {[
                  { key: 'time', label: 'Time', align: 'left' },
                  { key: 'market', label: 'Market', align: 'left' },
                  { key: 'side', label: 'Side', align: 'left' },
                  { key: 'price', label: 'Price', align: 'right' },
                  { key: 'size', label: 'Size', align: 'right' },
                  { key: 'pnl', label: 'P&L', align: 'right' },
                  { key: 'fee', label: 'Fee', align: 'right' },
                ].map(col => (
                  <th
                    key={col.key}
                    onClick={() => handleSort(col.key as SortKey)}
                    style={{
                      padding: '0.75rem 1rem',
                      fontSize: '0.6875rem',
                      fontWeight: 600,
                      color: sortKey === col.key ? '#667eea' : '#64748b',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      textAlign: col.align as any,
                      cursor: 'pointer',
                      userSelect: 'none',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {col.label}
                    {sortKey === col.key && (
                      <span style={{ marginLeft: '0.25rem' }}>
                        {sortDir === 'asc' ? '↑' : '↓'}
                      </span>
                    )}
                  </th>
                ))}
                <th style={{ padding: '0.75rem 1rem', fontSize: '0.6875rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'left' }}>
                  Role
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedTrades.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: '3rem', textAlign: 'center' }}>
                    <History size={48} color="#374151" style={{ marginBottom: '1rem' }} />
                    <div style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '1rem' }}>
                      {filter === 'all' ? 'No trades yet' : `No ${filter}`}
                    </div>
                    <Link
                      to="/app/markets"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.375rem',
                        padding: '0.5rem 1rem',
                        background: '#667eea',
                        color: 'white',
                        borderRadius: '6px',
                        textDecoration: 'none',
                        fontSize: '0.8125rem',
                        fontWeight: 600
                      }}
                    >
                      Start Trading
                    </Link>
                  </td>
                </tr>
              ) : (
                sortedTrades.map((t, i) => (
                  <tr 
                    key={t.id || i} 
                    style={{ 
                      borderBottom: '1px solid #1f2937',
                      transition: 'background 0.15s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(102, 126, 234, 0.05)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    {/* Time */}
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <div style={{ fontSize: '0.8125rem', color: '#e4e8eb' }}>
                        {formatTime(t.time)}
                      </div>
                      <div style={{ fontSize: '0.6875rem', color: '#64748b' }}>
                        {t.time.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </td>

                    {/* Market */}
                    <td style={{ padding: '0.75rem 1rem', maxWidth: '250px' }}>
                      <Link
                        to={`/app/markets/${t.market_id}`}
                        style={{
                          color: '#e4e8eb',
                          textDecoration: 'none',
                          fontSize: '0.8125rem',
                          fontWeight: 500,
                          display: 'block',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {t.market_question || `Market ${t.market_id?.slice(0, 8)}...`}
                      </Link>
                    </td>

                    {/* Side */}
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                        padding: '0.125rem 0.5rem',
                        borderRadius: '4px',
                        fontSize: '0.6875rem',
                        fontWeight: 700,
                        background: t.isBuy ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                        color: t.isBuy ? '#10b981' : '#ef4444'
                      }}>
                        {t.isBuy ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                        {t.isBuy ? 'BUY' : 'SELL'}
                      </span>
                    </td>

                    {/* Price */}
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontFamily: 'JetBrains Mono', fontSize: '0.8125rem', color: '#e4e8eb' }}>
                      {t.price.toFixed(1)}%
                    </td>

                    {/* Size */}
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                      <div style={{ fontFamily: 'JetBrains Mono', fontSize: '0.8125rem', color: '#e4e8eb' }}>
                        £{t.cost.toFixed(2)}
                      </div>
                      <div style={{ fontSize: '0.6875rem', color: '#64748b' }}>
                        {t.contracts.toFixed(2)} ctr
                      </div>
                    </td>

                    {/* P&L */}
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                      {t.pnl !== 0 ? (
                        <span style={{ 
                          fontFamily: 'JetBrains Mono', 
                          fontSize: '0.8125rem', 
                          fontWeight: 600,
                          color: t.pnl > 0 ? '#10b981' : t.pnl < 0 ? '#ef4444' : '#64748b'
                        }}>
                          {t.pnl > 0 ? '+' : ''}£{t.pnl.toFixed(2)}
                        </span>
                      ) : t.isOpen ? (
                        <span style={{ fontSize: '0.6875rem', color: '#f59e0b' }}>
                          Open
                        </span>
                      ) : (
                        <span style={{ fontSize: '0.6875rem', color: '#64748b' }}>
                          —
                        </span>
                      )}
                    </td>

                    {/* Fee */}
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontFamily: 'JetBrains Mono', fontSize: '0.8125rem', color: '#f59e0b' }}>
                      £{t.fee.toFixed(2)}
                    </td>

                    {/* Role */}
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '0.125rem 0.5rem',
                        borderRadius: '4px',
                        fontSize: '0.625rem',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        background: t.user_role === 'maker' ? 'rgba(6, 182, 212, 0.15)' : 'rgba(167, 139, 250, 0.15)',
                        color: t.user_role === 'maker' ? '#06b6d4' : '#a78bfa'
                      }}>
                        {t.user_role}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
