import { Link } from '@remix-run/react';
import { useState } from 'react';

interface MarketCardProps {
  marketId: string;
  title: string;
  description?: string;
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
      to={`/markets/${marketId}`}
      style={{
        display: 'block',
        background: 'white',
        border: '1px solid #e2e8f0',
        borderRadius: '8px',
        padding: '1.25rem',
        textDecoration: 'none',
        color: 'inherit',
        transition: 'all 0.2s',
        position: 'relative'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = '#667eea';
        e.currentTarget.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.1)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = '#e2e8f0';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.75rem' }}>
        <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#1e293b', margin: 0 }}>
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
            lineHeight: 1
          }}
          title={watched ? 'Remove from watchlist' : 'Add to watchlist'}
        >
          {watched ? '⭐' : '☆'}
        </button>
      </div>
      
      {description && (
        <p style={{ fontSize: '0.875rem', color: '#64748b', margin: '0 0 1rem 0' }}>
          {description}
        </p>
      )}
      
      {(backPrice || layPrice) && (
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.75rem' }}>
          {backPrice && (
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '0.25rem' }}>BACK</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#10b981' }}>{backPrice.toFixed(2)}</div>
            </div>
          )}
          {layPrice && (
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '0.25rem' }}>LAY</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#ef4444' }}>{layPrice.toFixed(2)}</div>
            </div>
          )}
        </div>
      )}
      
      {volume !== undefined && (
        <div style={{ fontSize: '0.875rem', color: '#64748b' }}>
          Volume: ${volume.toLocaleString()}
        </div>
      )}
    </Link>
  );
}
