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
        gap: '1rem',
        padding: compact ? '0.375rem 0.75rem' : '0.5rem 1rem',
        background: '#0d1117',
        border: '1px solid #30363d',
        borderRadius: '6px',
        fontSize: compact ? '0.75rem' : '0.8125rem'
      }} 
      className="wallet-chip"
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span style={{ color: '#8b949e' }}>Available</span>
        <span style={{ color: '#3fb950', fontWeight: 600 }}>
          {formatPence(availablePence)}
        </span>
      </div>
      <div style={{ width: '1px', height: '16px', background: '#30363d' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span style={{ color: '#8b949e' }}>Reserved</span>
        <span style={{ color: '#d29922', fontWeight: 600 }}>
          {formatPence(reservedPence)}
        </span>
      </div>
      <div style={{ width: '1px', height: '16px', background: '#30363d' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span style={{ color: '#8b949e' }}>Equity</span>
        <span style={{ color: '#c9d1d9', fontWeight: 700 }}>
          {formatPence(equityPence)}
        </span>
      </div>
    </div>
  );
}
