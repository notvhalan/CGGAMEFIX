import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
import { useState, useMemo } from "react";
import { getMyPositions } from "~/lib/api.server";
import { TrendingUp, TrendingDown, BarChart3, DollarSign, Activity } from "lucide-react";

interface Position {
  marketId: string;
  marketQuestion: string;
  netContractsMicros: string;
  avgEntryYesPts: number;
  markYesPts: number;
  unrealizedPnlPence: number;
  totalFeesPence: number;
  canCashOut: boolean;
}

export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const positions = await getMyPositions(request);
    return json({ positions: positions || [] });
  } catch (error) {
    console.error('[Positions Loader] Error:', error);
    return json({ positions: [] });
  }
}

type SortKey = 'market' | 'side' | 'size' | 'entry' | 'mark' | 'pnl';
type SortDir = 'asc' | 'desc';

export default function Positions() {
  const { positions } = useLoaderData<typeof loader>();
  const [sortKey, setSortKey] = useState<SortKey>('pnl');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [filter, setFilter] = useState<'all' | 'long' | 'short'>('all');

  // Calculate derived data for each position
  const enrichedPositions = useMemo(() => {
    return positions.map((p: Position) => {
      const micros = BigInt(p.netContractsMicros || '0');
      const isLong = micros > 0n;
      const contracts = Number(micros > 0n ? micros : -micros) / 1_000_000;
      const avgPrice = (p.avgEntryYesPts || 0) / 100_000;
      const mark = (p.markYesPts || 0) / 100_000;
      const pnlPercent = isLong ? (mark - avgPrice) : (avgPrice - mark);
      const pnlValue = (pnlPercent / 100) * contracts;
      const cost = contracts * (isLong ? avgPrice / 100 : (1 - avgPrice / 100));
      const marketValue = contracts * (isLong ? mark / 100 : (1 - mark / 100));

      return {
        ...p,
        isLong,
        contracts,
        avgPrice,
        mark,
        pnlPercent,
        pnlValue,
        cost,
        marketValue
      };
    });
  }, [positions]);

  // Filter positions
  const filteredPositions = useMemo(() => {
    if (filter === 'all') return enrichedPositions;
    if (filter === 'long') return enrichedPositions.filter(p => p.isLong);
    return enrichedPositions.filter(p => !p.isLong);
  }, [enrichedPositions, filter]);

  // Sort positions
  const sortedPositions = useMemo(() => {
    return [...filteredPositions].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'market':
          cmp = (a.marketQuestion || '').localeCompare(b.marketQuestion || '');
          break;
        case 'side':
          cmp = a.isLong === b.isLong ? 0 : a.isLong ? -1 : 1;
          break;
        case 'size':
          cmp = a.cost - b.cost;
          break;
        case 'entry':
          cmp = a.avgPrice - b.avgPrice;
          break;
        case 'mark':
          cmp = a.mark - b.mark;
          break;
        case 'pnl':
          cmp = a.pnlValue - b.pnlValue;
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filteredPositions, sortKey, sortDir]);

  // Aggregate metrics
  const metrics = useMemo(() => {
    const totalPnl = enrichedPositions.reduce((sum, p) => sum + p.pnlValue, 0);
    const totalCost = enrichedPositions.reduce((sum, p) => sum + p.cost, 0);
    const totalMarketValue = enrichedPositions.reduce((sum, p) => sum + p.marketValue, 0);
    const longCount = enrichedPositions.filter(p => p.isLong).length;
    const shortCount = enrichedPositions.filter(p => !p.isLong).length;
    const winningCount = enrichedPositions.filter(p => p.pnlValue > 0).length;
    const losingCount = enrichedPositions.filter(p => p.pnlValue < 0).length;

    return {
      totalPnl,
      totalCost,
      totalMarketValue,
      longCount,
      shortCount,
      winningCount,
      losingCount,
      totalCount: enrichedPositions.length
    };
  }, [enrichedPositions]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
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
          <BarChart3 size={28} color="#667eea" />
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#e4e8eb', margin: 0 }}>
            My Positions
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
        {/* Total P&L */}
        <div style={{ 
          background: '#1a1f26', 
          border: `1px solid ${metrics.totalPnl >= 0 ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`, 
          borderRadius: '6px', 
          padding: '0.875rem 1rem'
        }}>
          <div style={{ fontSize: '0.6875rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
            {metrics.totalPnl >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            Total P&L
          </div>
          <div style={{ 
            fontSize: '1.25rem', 
            fontWeight: 700, 
            color: metrics.totalPnl >= 0 ? '#10b981' : '#ef4444', 
            fontFamily: 'JetBrains Mono' 
          }}>
            {metrics.totalPnl >= 0 ? '+' : '-'}£{Math.abs(metrics.totalPnl).toFixed(2)}
          </div>
        </div>

        {/* Total Cost */}
        <div style={{ 
          background: '#1a1f26', 
          border: '1px solid #2d3748', 
          borderRadius: '6px', 
          padding: '0.875rem 1rem'
        }}>
          <div style={{ fontSize: '0.6875rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
            <DollarSign size={12} />
            Total At Risk
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#f59e0b', fontFamily: 'JetBrains Mono' }}>
            £{metrics.totalCost.toFixed(2)}
          </div>
        </div>

        {/* Market Value */}
        <div style={{ 
          background: '#1a1f26', 
          border: '1px solid #2d3748', 
          borderRadius: '6px', 
          padding: '0.875rem 1rem'
        }}>
          <div style={{ fontSize: '0.6875rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>
            Market Value
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#e4e8eb', fontFamily: 'JetBrains Mono' }}>
            £{metrics.totalMarketValue.toFixed(2)}
          </div>
        </div>

        {/* Position Count */}
        <div style={{ 
          background: '#1a1f26', 
          border: '1px solid #2d3748', 
          borderRadius: '6px', 
          padding: '0.875rem 1rem'
        }}>
          <div style={{ fontSize: '0.6875rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
            <Activity size={12} />
            Positions
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#e4e8eb', fontFamily: 'JetBrains Mono' }}>
            {metrics.totalCount}
          </div>
          <div style={{ fontSize: '0.6875rem', color: '#64748b' }}>
            {metrics.longCount} long • {metrics.shortCount} short
          </div>
        </div>

        {/* Win/Loss */}
        <div style={{ 
          background: '#1a1f26', 
          border: '1px solid #2d3748', 
          borderRadius: '6px', 
          padding: '0.875rem 1rem'
        }}>
          <div style={{ fontSize: '0.6875rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>
            Win / Loss
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'baseline' }}>
            <span style={{ fontSize: '1.25rem', fontWeight: 700, color: '#10b981', fontFamily: 'JetBrains Mono' }}>
              {metrics.winningCount}
            </span>
            <span style={{ color: '#64748b' }}>/</span>
            <span style={{ fontSize: '1.25rem', fontWeight: 700, color: '#ef4444', fontFamily: 'JetBrains Mono' }}>
              {metrics.losingCount}
            </span>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        {(['all', 'long', 'short'] as const).map(f => (
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
              textTransform: 'capitalize'
            }}
          >
            {f === 'all' ? `All (${metrics.totalCount})` : 
             f === 'long' ? `Long / YES (${metrics.longCount})` : 
             `Short / NO (${metrics.shortCount})`}
          </button>
        ))}
      </div>

      {/* Positions Table */}
      <div style={panelStyle}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #2d3748' }}>
                {[
                  { key: 'market', label: 'Market', align: 'left' },
                  { key: 'side', label: 'Side', align: 'left' },
                  { key: 'size', label: 'Size (Risk)', align: 'right' },
                  { key: 'entry', label: 'Entry', align: 'right' },
                  { key: 'mark', label: 'Mark', align: 'right' },
                  { key: 'pnl', label: 'P&L', align: 'right' },
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
                <th style={{ padding: '0.75rem 1rem', fontSize: '0.6875rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedPositions.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '3rem', textAlign: 'center' }}>
                    <BarChart3 size={48} color="#374151" style={{ marginBottom: '1rem' }} />
                    <div style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '1rem' }}>
                      {filter === 'all' ? 'No positions yet' : `No ${filter} positions`}
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
                      Browse Markets
                    </Link>
                  </td>
                </tr>
              ) : (
                sortedPositions.map((p, i) => (
                  <tr 
                    key={p.marketId || i} 
                    style={{ 
                      borderBottom: '1px solid #1f2937',
                      transition: 'background 0.15s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(102, 126, 234, 0.05)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    {/* Market */}
                    <td style={{ padding: '0.75rem 1rem', maxWidth: '300px' }}>
                      <Link
                        to={`/app/markets/${p.marketId}`}
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
                        {p.marketQuestion || `Position ${i + 1}`}
                      </Link>
                    </td>

                    {/* Side */}
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '0.125rem 0.5rem',
                        borderRadius: '4px',
                        fontSize: '0.6875rem',
                        fontWeight: 700,
                        background: p.isLong ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                        color: p.isLong ? '#10b981' : '#ef4444'
                      }}>
                        {p.isLong ? 'YES' : 'NO'}
                      </span>
                    </td>

                    {/* Size (Risk) */}
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                      <div style={{ fontFamily: 'JetBrains Mono', fontSize: '0.8125rem', color: '#e4e8eb' }}>
                        £{p.cost.toFixed(2)}
                      </div>
                      <div style={{ fontSize: '0.6875rem', color: '#64748b' }}>
                        {p.contracts.toFixed(2)} ctr
                      </div>
                    </td>

                    {/* Entry */}
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontFamily: 'JetBrains Mono', fontSize: '0.8125rem', color: '#94a3b8' }}>
                      {p.avgPrice.toFixed(1)}%
                    </td>

                    {/* Mark */}
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontFamily: 'JetBrains Mono', fontSize: '0.8125rem', color: '#e4e8eb' }}>
                      {p.mark.toFixed(1)}%
                    </td>

                    {/* P&L */}
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                      <div style={{ 
                        fontFamily: 'JetBrains Mono', 
                        fontSize: '0.8125rem', 
                        fontWeight: 600,
                        color: p.pnlValue >= 0 ? '#10b981' : '#ef4444' 
                      }}>
                        {p.pnlValue >= 0 ? '+' : '-'}£{Math.abs(p.pnlValue).toFixed(2)}
                      </div>
                      <div style={{ 
                        fontSize: '0.6875rem', 
                        color: p.pnlPercent >= 0 ? '#10b981' : '#ef4444' 
                      }}>
                        {p.pnlPercent >= 0 ? '+' : ''}{p.pnlPercent.toFixed(1)}%
                      </div>
                    </td>

                    {/* Actions */}
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                      <Link
                        to={`/app/markets/${p.marketId}`}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                          padding: '0.375rem 0.75rem',
                          background: 'rgba(102, 126, 234, 0.15)',
                          border: '1px solid rgba(102, 126, 234, 0.3)',
                          borderRadius: '4px',
                          color: '#667eea',
                          textDecoration: 'none',
                          fontSize: '0.75rem',
                          fontWeight: 600
                        }}
                      >
                        Trade
                      </Link>
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
