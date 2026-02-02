import { Link } from '@remix-run/react';
import { useState } from 'react';

interface MarketCardProps {
  marketId: string;
  title: string;
  description?: string;
  status?: string;
  type?: string;
  backPrice?: number;
  layPrice?: number;
  volume?: number;
  isWatched?: boolean;
  onToggleWatch?: (marketId: string) => void;
}

export function MarketCard({ 
  marketId, 
  title, 
  description, 
  status = 'ACTIVE',
  type = 'BINARY',
  backPrice, 
  layPrice, 
  volume,
  isWatched = false,
  onToggleWatch 
}: MarketCardProps) {
  const [watched, setWatched] = useState(isWatched);

  const handleToggleWatch = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setWatched(!watched);
    onToggleWatch?.(marketId);
  };

  return (
    <Link
      to={`/app/markets/${marketId}`}
      style={{
        display: 'block',
        background: 'rgba(22, 27, 34, 0.6)',
        border: '1px solid rgba(88, 166, 255, 0.2)',
        borderRadius: '12px',
        padding: '1.25rem',
        textDecoration: 'none',
        color: '#e6edf3',
        transition: 'all 0.2s',
        position: 'relative',
        backdropFilter: 'blur(10px)',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'rgba(88, 166, 255, 0.5)';
        e.currentTarget.style.boxShadow = '0 8px 32px rgba(88, 166, 255, 0.15)';
        e.currentTarget.style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'rgba(88, 166, 255, 0.2)';
        e.currentTarget.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.2)';
        e.currentTarget.style.transform = 'translateY(0)';
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.75rem' }}>
        <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#e6edf3', margin: 0 }}>
          {title}
        </h3>
        <button
          onClick={handleToggleWatch}
          style={{
            background: 'none',
            border: 'none',
            fontSize: '1.25rem',
            cursor: 'pointer',
            padding: '0.25rem',
            lineHeight: 1,
            filter: watched ? 'none' : 'grayscale(1) opacity(0.5)',
            transition: 'filter 0.2s'
          }}
          title={watched ? 'Remove from watchlist' : 'Add to watchlist'}
        >
          {watched ? '⭐' : '☆'}
        </button>
      </div>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.875rem', color: '#c9d1d9' }}>
        <div>
          <strong style={{ color: '#8b949e' }}>Status:</strong> <span style={{ 
            color: status === 'ACTIVE' ? '#3fb950' : '#8b949e',
            fontWeight: 600
          }}>{status}</span>
        </div>
        <div>
          <strong style={{ color: '#8b949e' }}>Type:</strong> {type}
        </div>
        <div style={{ fontSize: '0.75rem', color: '#8b949e', marginTop: '0.25rem' }}>
          ID: {marketId.substring(0, 8)}...
        </div>
      </div>
    </Link>
  );
}
