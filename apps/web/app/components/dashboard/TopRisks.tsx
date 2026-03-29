import { Link } from '@remix-run/react';

/* ──────────────────────────────────────────────────────────────────────
 *  TopRisks — horizontal risk bar chart for biggest market exposures
 * ────────────────────────────────────────────────────────────────────── */

interface Position {
  marketId: string;
  marketQuestion?: string;
  netContractsMicros: string | bigint;
  avgEntryYesPts: number;
  markYesPts: number;
}

interface TopRisksProps {
  positions: Position[];
  maxItems?: number;
}

export function TopRisks({ positions, maxItems = 5 }: TopRisksProps) {
  if (positions.length === 0) {
    return (
      <div style={{ padding: '2rem 1rem', textAlign: 'center', color: '#64748b', fontSize: '0.8125rem' }}>
        No open positions
        <div style={{ marginTop: '0.5rem' }}>
          <Link to="/app/markets" style={{ color: '#667eea', textDecoration: 'none', fontSize: '0.75rem' }}>Start trading →</Link>
        </div>
      </div>
    );
  }

  // Compute risk + P&L per position and sort by risk descending
  const enriched = positions.map((p) => {
    const micros = BigInt(p.netContractsMicros || '0');
    const isLong = micros > 0n;
    const contracts = Number(micros > 0n ? micros : -micros) / 1_000_000;
    const avgPrice = (p.avgEntryYesPts || 0) / 100_000;
    const mark = (p.markYesPts || 0) / 100_000;
    const risk = contracts * (isLong ? avgPrice / 100 : (1 - avgPrice / 100));
    const pnlPct = isLong ? (mark - avgPrice) : (avgPrice - mark);
    const pnl = (pnlPct / 100) * contracts;
    return { ...p, isLong, contracts, risk, pnl, avgPrice, mark };
  }).sort((a, b) => b.risk - a.risk).slice(0, maxItems);

  const maxRisk = Math.max(...enriched.map((e) => e.risk), 0.01);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {enriched.map((p, i) => {
        const barWidth = Math.max((p.risk / maxRisk) * 100, 4);
        return (
          <div
            key={p.marketId + '-' + i}
            style={{
              padding: '0.625rem 0.875rem',
              borderBottom: i < enriched.length - 1 ? '1px solid #1e2530' : 'none',
            }}
          >
            {/* Row 1: market name + P&L */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.375rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', flex: 1, minWidth: 0 }}>
                <span
                  style={{
                    display: 'inline-block',
                    fontSize: '0.5625rem',
                    fontWeight: 700,
                    padding: '0.0625rem 0.3rem',
                    borderRadius: '3px',
                    background: p.isLong ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                    color: p.isLong ? '#10b981' : '#ef4444',
                    letterSpacing: '0.03em',
                    flexShrink: 0,
                  }}
                >
                  {p.isLong ? 'YES' : 'NO'}
                </span>
                <Link
                  to={`/app/markets/${p.marketId}`}
                  style={{
                    fontSize: '0.75rem',
                    color: '#c9d1d9',
                    textDecoration: 'none',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {p.marketQuestion || `Market ${p.marketId.slice(0, 8)}`}
                </Link>
              </div>
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  fontFamily: 'JetBrains Mono, monospace',
                  color: p.pnl >= 0 ? '#3fb950' : '#f85149',
                  flexShrink: 0,
                  marginLeft: '0.5rem',
                }}
              >
                {p.pnl >= 0 ? '+' : ''}£{p.pnl.toFixed(2)}
              </span>
            </div>

            {/* Row 2: risk bar + amount */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div
                style={{
                  flex: 1,
                  height: '6px',
                  background: '#1e2530',
                  borderRadius: '3px',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${barWidth}%`,
                    height: '100%',
                    borderRadius: '3px',
                    background: p.isLong
                      ? 'linear-gradient(90deg, rgba(16,185,129,0.5) 0%, #10b981 100%)'
                      : 'linear-gradient(90deg, rgba(239,68,68,0.5) 0%, #ef4444 100%)',
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>
              <span
                style={{
                  fontSize: '0.6875rem',
                  fontFamily: 'JetBrains Mono, monospace',
                  color: '#8b949e',
                  flexShrink: 0,
                  minWidth: '3.5rem',
                  textAlign: 'right',
                }}
              >
                £{p.risk.toFixed(2)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
