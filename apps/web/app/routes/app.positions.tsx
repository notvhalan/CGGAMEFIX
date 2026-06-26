import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
import { useState, useMemo } from "react";
import { getMyPositions } from "~/lib/api.server";
import { TrendingUp, TrendingDown, BarChart3, DollarSign, Activity, ChevronDown, ChevronRight } from "lucide-react";

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

type SortKey = 'market' | 'size' | 'entry' | 'mark' | 'pnl';
type SortDir = 'asc' | 'desc';

export default function Positions() {
  const { positions } = useLoaderData<typeof loader>();
  const [sortKey, setSortKey] = useState<SortKey>('pnl');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [yesCollapsed, setYesCollapsed] = useState(false);
  const [noCollapsed, setNoCollapsed] = useState(false);

  // Enrich each position with derived values
  const enrichedPositions = useMemo(() => {
    return positions.map((p: Position) => {
      const micros    = BigInt(p.netContractsMicros || '0');
      const isLong    = micros > 0n;
      const contracts = Number(micros > 0n ? micros : -micros) / 1_000_000;
      const avgPrice  = (p.avgEntryYesPts || 0) / 100_000;
      const mark      = (p.markYesPts || 0) / 100_000;
      const cost        = contracts * (isLong ? avgPrice / 100 : (1 - avgPrice / 100));
      const marketValue = contracts * (isLong ? mark  / 100 : (1 - mark  / 100));
      const pnlValue   = (p.unrealizedPnlPence || 0) / 100;
      const pnlPercent = cost > 0 ? (pnlValue / cost) * 100 : 0;
      return { ...p, isLong, contracts, avgPrice, mark, pnlPercent, pnlValue, cost, marketValue };
    });
  }, [positions]);

  // Split into YES (long) and NO (short) groups
  const yesPositions = useMemo(() => enrichedPositions.filter((p: any) =>  p.isLong), [enrichedPositions]);
  const noPositions  = useMemo(() => enrichedPositions.filter((p: any) => !p.isLong), [enrichedPositions]);

  // Sort a list by current sort state
  const sortList = (list: typeof enrichedPositions) =>
    [...list].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'market': cmp = (a.marketQuestion || '').localeCompare(b.marketQuestion || ''); break;
        case 'size':   cmp = a.cost     - b.cost;     break;
        case 'entry':  cmp = a.avgPrice - b.avgPrice; break;
        case 'mark':   cmp = a.mark     - b.mark;     break;
        case 'pnl':    cmp = a.pnlValue - b.pnlValue; break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

  const sortedYes = useMemo(() => sortList(yesPositions), [yesPositions, sortKey, sortDir]);
  const sortedNo  = useMemo(() => sortList(noPositions),  [noPositions,  sortKey, sortDir]);

  // Overall metrics
  const metrics = useMemo(() => ({
    totalPnl:         enrichedPositions.reduce((s: number, p: any) => s + p.pnlValue,   0),
    totalCost:        enrichedPositions.reduce((s: number, p: any) => s + p.cost,        0),
    totalMarketValue: enrichedPositions.reduce((s: number, p: any) => s + p.marketValue, 0),
    longCount:    yesPositions.length,
    shortCount:   noPositions.length,
    totalCount:   enrichedPositions.length,
    winningCount: enrichedPositions.filter((p: any) => p.pnlValue >  0).length,
    losingCount:  enrichedPositions.filter((p: any) => p.pnlValue <  0).length,
  }), [enrichedPositions, yesPositions, noPositions]);

  // Per-group subtotals
  const groupMeta = (list: typeof enrichedPositions) => ({
    count:     list.length,
    totalCost: list.reduce((s: number, p: any) => s + p.cost,        0),
    totalPnl:  list.reduce((s: number, p: any) => s + p.pnlValue,    0),
    totalMv:   list.reduce((s: number, p: any) => s + p.marketValue, 0),
  });
  const yesMeta = useMemo(() => groupMeta(yesPositions), [yesPositions]);
  const noMeta  = useMemo(() => groupMeta(noPositions),  [noPositions]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const panelStyle: React.CSSProperties = {
    background: '#0d1117',
    border: '1px solid #2d3748',
    borderRadius: '8px',
    overflow: 'hidden',
    marginBottom: '1rem',
  };

  // Collapsible group header
  const GroupHeader = ({
    isYes, meta, collapsed, onToggle,
  }: {
    isYes: boolean;
    meta: ReturnType<typeof groupMeta>;
    collapsed: boolean;
    onToggle: () => void;
  }) => {
    const accent       = isYes ? '#10b981' : '#ef4444';
    const accentBg     = isYes ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)';
    const accentBorder = isYes ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)';
    const pnlColor     = meta.totalPnl >= 0 ? '#10b981' : '#ef4444';
    return (
      <button
        onClick={onToggle}
        style={{
          width: '100%', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', padding: '0.75rem 1rem',
          background: accentBg, border: 'none',
          borderBottom: collapsed ? 'none' : `1px solid ${accentBorder}`,
          cursor: 'pointer', textAlign: 'left',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
          {collapsed
            ? <ChevronRight size={14} color={accent} />
            : <ChevronDown  size={14} color={accent} />}
          <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: accent, letterSpacing: '0.04em' }}>
            {isYes ? 'BUY YES \u2014 Long' : 'SELL YES \u2014 Short'}
          </span>
          <span style={{
            padding: '0.1rem 0.5rem', borderRadius: '999px',
            background: accentBg, border: `1px solid ${accentBorder}`,
            fontSize: '0.6875rem', fontWeight: 700, color: accent,
          }}>
            {meta.count}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.6rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>At Risk</div>
            <div style={{ fontFamily: 'JetBrains Mono', fontSize: '0.8125rem', color: '#f59e0b', fontWeight: 600 }}>
              £{meta.totalCost.toFixed(2)}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.6rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Market Value</div>
            <div style={{ fontFamily: 'JetBrains Mono', fontSize: '0.8125rem', color: '#e4e8eb', fontWeight: 600 }}>
              £{meta.totalMv.toFixed(2)}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.6rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Group P&L</div>
            <div style={{ fontFamily: 'JetBrains Mono', fontSize: '0.8125rem', color: pnlColor, fontWeight: 700 }}>
              {meta.totalPnl >= 0 ? '+' : '-'}£{Math.abs(meta.totalPnl).toFixed(2)}
            </div>
          </div>
        </div>
      </button>
    );
  };

  // Shared sortable table for a group
  const renderTable = (rows: typeof enrichedPositions) => (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #2d3748' }}>
            {([
              { key: 'market' as SortKey, label: 'Market',      align: 'left'  },
              { key: 'size'   as SortKey, label: 'Size (Risk)',  align: 'right' },
              { key: 'entry'  as SortKey, label: 'Entry',        align: 'right' },
              { key: 'mark'   as SortKey, label: 'Mark',         align: 'right' },
              { key: 'pnl'    as SortKey, label: 'P&L',          align: 'right' },
            ] as { key: SortKey; label: string; align: 'left' | 'right' }[]).map(col => (
              <th
                key={col.key}
                onClick={() => handleSort(col.key)}
                style={{
                  padding: '0.625rem 1rem',
                  fontSize: '0.6875rem', fontWeight: 600,
                  color: sortKey === col.key ? '#667eea' : '#64748b',
                  textTransform: 'uppercase', letterSpacing: '0.05em',
                  textAlign: col.align, cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap',
                }}
              >
                {col.label}
                {sortKey === col.key && (
                  <span style={{ marginLeft: '0.25rem' }}>{sortDir === 'asc' ? '' : ''}</span>
                )}
              </th>
            ))}
            <th style={{
              padding: '0.625rem 1rem', fontSize: '0.6875rem', fontWeight: 600,
              color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right',
            }}>
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p: any, i: number) => (
            <tr
              key={p.marketId || i}
              style={{ borderBottom: '1px solid #1f2937', transition: 'background 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(102,126,234,0.05)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              {/* Market */}
              <td style={{ padding: '0.75rem 1rem', maxWidth: '300px' }}>
                <Link
                  to={`/app/markets/${p.marketId}`}
                  style={{
                    color: '#e4e8eb', textDecoration: 'none', fontSize: '0.8125rem', fontWeight: 500,
                    display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}
                >
                  {p.marketQuestion || `Position ${i + 1}`}
                </Link>
              </td>
              {/* Size */}
              <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                <div style={{ fontFamily: 'JetBrains Mono', fontSize: '0.8125rem', color: '#e4e8eb' }}>
                  £{p.cost.toFixed(2)}
                </div>
                <div style={{ fontSize: '0.6875rem', color: '#64748b' }}>{p.contracts.toFixed(2)} ctr</div>
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
                <div style={{ fontFamily: 'JetBrains Mono', fontSize: '0.8125rem', fontWeight: 600,
                  color: p.pnlValue >= 0 ? '#10b981' : '#ef4444' }}>
                  {p.pnlValue >= 0 ? '+' : '-'}£{Math.abs(p.pnlValue).toFixed(2)}
                </div>
                <div style={{ fontSize: '0.6875rem', color: p.pnlPercent >= 0 ? '#10b981' : '#ef4444' }}>
                  {p.pnlPercent >= 0 ? '+' : ''}{p.pnlPercent.toFixed(1)}%
                </div>
              </td>
              {/* Actions */}
              <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                <Link
                  to={`/app/markets/${p.marketId}`}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                    padding: '0.375rem 0.75rem', background: 'rgba(102,126,234,0.15)',
                    border: '1px solid rgba(102,126,234,0.3)', borderRadius: '4px',
                    color: '#667eea', textDecoration: 'none', fontSize: '0.75rem', fontWeight: 600,
                  }}
                >
                  Trade
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div style={{ padding: '1.5rem', maxWidth: '1400px', margin: '0 auto' }}>

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <BarChart3 size={28} color="#667eea" />
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#e4e8eb', margin: 0 }}>My Positions</h1>
      </div>

      {/* Overall metrics row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <div style={{ background: '#1a1f26',
          border: `1px solid ${metrics.totalPnl >= 0 ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
          borderRadius: '6px', padding: '0.875rem 1rem' }}>
          <div style={{ fontSize: '0.6875rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em',
            marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
            {metrics.totalPnl >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />} Total P&L
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, fontFamily: 'JetBrains Mono',
            color: metrics.totalPnl >= 0 ? '#10b981' : '#ef4444' }}>
            {metrics.totalPnl >= 0 ? '+' : '-'}£{Math.abs(metrics.totalPnl).toFixed(2)}
          </div>
        </div>
        <div style={{ background: '#1a1f26', border: '1px solid #2d3748', borderRadius: '6px', padding: '0.875rem 1rem' }}>
          <div style={{ fontSize: '0.6875rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em',
            marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
            <DollarSign size={12} /> Total At Risk
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#f59e0b', fontFamily: 'JetBrains Mono' }}>
            £{metrics.totalCost.toFixed(2)}
          </div>
        </div>
        <div style={{ background: '#1a1f26', border: '1px solid #2d3748', borderRadius: '6px', padding: '0.875rem 1rem' }}>
          <div style={{ fontSize: '0.6875rem', color: '#64748b', textTransform: 'uppercase',
            letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Market Value</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#e4e8eb', fontFamily: 'JetBrains Mono' }}>
            £{metrics.totalMarketValue.toFixed(2)}
          </div>
        </div>
        <div style={{ background: '#1a1f26', border: '1px solid #2d3748', borderRadius: '6px', padding: '0.875rem 1rem' }}>
          <div style={{ fontSize: '0.6875rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em',
            marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
            <Activity size={12} /> Positions
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#e4e8eb', fontFamily: 'JetBrains Mono' }}>
            {metrics.totalCount}
          </div>
          <div style={{ fontSize: '0.6875rem', color: '#64748b' }}>
            {metrics.longCount} yes  {metrics.shortCount} no
          </div>
        </div>
        <div style={{ background: '#1a1f26', border: '1px solid #2d3748', borderRadius: '6px', padding: '0.875rem 1rem' }}>
          <div style={{ fontSize: '0.6875rem', color: '#64748b', textTransform: 'uppercase',
            letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Win / Loss</div>
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

      {/* Empty state */}
      {metrics.totalCount === 0 && (
        <div style={{ ...panelStyle, padding: '3rem', textAlign: 'center' }}>
          <BarChart3 size={48} color="#374151" style={{ marginBottom: '1rem' }} />
          <div style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '1rem' }}>No open positions</div>
          <Link to="/app/markets" style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.375rem',
            padding: '0.5rem 1rem', background: '#667eea', color: 'white',
            borderRadius: '6px', textDecoration: 'none', fontSize: '0.8125rem', fontWeight: 600,
          }}>
            Browse Markets
          </Link>
        </div>
      )}

      {/* BUY YES  Long group */}
      {yesPositions.length > 0 && (
        <div style={panelStyle}>
          <GroupHeader isYes={true} meta={yesMeta} collapsed={yesCollapsed} onToggle={() => setYesCollapsed(v => !v)} />
          {!yesCollapsed && renderTable(sortedYes)}
        </div>
      )}

      {/* SELL YES  Short group */}
      {noPositions.length > 0 && (
        <div style={panelStyle}>
          <GroupHeader isYes={false} meta={noMeta} collapsed={noCollapsed} onToggle={() => setNoCollapsed(v => !v)} />
          {!noCollapsed && renderTable(sortedNo)}
        </div>
      )}

    </div>
  );
}
