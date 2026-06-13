import { formatPence } from '~/lib/format';

interface WalletChipProps {
  availablePence: number;
  reservedPence: number;
  equityPence: number;
  compact?: boolean;
}

export function WalletChip({ availablePence, reservedPence, equityPence, compact = false }: WalletChipProps) {
  return (
    <div 
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: compact ? '0.625rem' : '0.75rem',
        padding: compact ? '0.3125rem 0.625rem' : '0.375rem 0.875rem',
        background: 'rgba(13,17,23,0.6)',
        border: '1px solid #21262d',
        borderRadius: '8px',
        fontSize: compact ? '0.75rem' : '0.8125rem',
        backdropFilter: 'blur(8px)',
      }} 
      className="wallet-chip"
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.3125rem' }}>
        <span style={{ color: '#6e7681', fontSize: '0.6875rem', fontWeight: 500 }}>Available</span>
        <span style={{ color: '#3fb950', fontWeight: 600, fontFamily: 'var(--font-mono, monospace)', letterSpacing: '-0.01em' }}>
          {formatPence(availablePence)}
        </span>
      </div>
      <span style={{ color: '#30363d', fontSize: '0.5rem' }}>●</span>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.3125rem' }}>
        <span style={{ color: '#6e7681', fontSize: '0.6875rem', fontWeight: 500 }}>Reserved</span>
        <span style={{ color: '#d29922', fontWeight: 600, fontFamily: 'var(--font-mono, monospace)', letterSpacing: '-0.01em' }}>
          {formatPence(reservedPence)}
        </span>
      </div>
      <span style={{ color: '#30363d', fontSize: '0.5rem' }}>●</span>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.3125rem' }}>
        <span style={{ color: '#6e7681', fontSize: '0.6875rem', fontWeight: 500 }}>Equity</span>
        <span style={{ color: '#e6edf3', fontWeight: 700, fontFamily: 'var(--font-mono, monospace)', letterSpacing: '-0.01em' }}>
          {formatPence(equityPence)}
        </span>
      </div>
    </div>
  );
}
