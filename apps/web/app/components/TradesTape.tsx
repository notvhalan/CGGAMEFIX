import { useEffect, useState, useRef } from 'react';
import { formatProbability, formatPence, formatRelativeTime } from '~/lib/format';

interface TradesTapeProps {
  trades: any[];
  marketId: string;
  compact?: boolean;
}

export function TradesTape({ trades: initialTrades, marketId, compact = false }: TradesTapeProps) {
  const [flashingTrades, setFlashingTrades] = useState<Set<string>>(new Set());
  const prevTradesRef = useRef<any[]>([]);

  // Flash animation for new trades
  useEffect(() => {
    const newTradeIds = initialTrades
      .filter(trade => !prevTradesRef.current.some(prev => prev.id === trade.id))
      .map(trade => trade.id);
    
    if (newTradeIds.length > 0) {
      setFlashingTrades(new Set(newTradeIds));
      setTimeout(() => {
        setFlashingTrades(new Set());
      }, 300);
    }
    
    prevTradesRef.current = initialTrades;
  }, [initialTrades]);

  if (compact) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Horizontal Ticker Tape */}
        <div style={{ 
          flex: 1,
          overflowX: 'auto',
          overflowY: 'hidden',
          display: 'flex',
          alignItems: 'center',
          padding: '0.75rem',
          fontSize: '0.75rem',
          fontFamily: 'monospace',
          gap: '2rem'
        }}>          {initialTrades.length === 0 ? (
            <div style={{ color: '#64748b', fontSize: '0.6875rem', padding: '1rem' }}>
              No trades yet
            </div>
          ) : (
            initialTrades.slice(0, 20).map((trade: any, i: number) => {
              const currentPrice = trade.yes_pts || 0;
              const prevPrice = i < initialTrades.length - 1 ? (initialTrades[i + 1].yes_pts || 0) : currentPrice;
              const isUp = currentPrice > prevPrice;
              const isDown = currentPrice < prevPrice;
              const isFlashing = flashingTrades.has(trade.id);

              return (
                <div 
                  key={trade.id || i}
                  style={{ 
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.5rem 1rem',
                    background: isFlashing 
                      ? (isUp ? '#10b98130' : isDown ? '#ef444430' : '#64748b20')
                      : '#1a1f2640',
                    borderRadius: '4px',
                    border: '1px solid #2d3748',
                    transition: 'background 0.3s',
                    whiteSpace: 'nowrap',
                    flexShrink: 0
                  }}
                >
                  <div style={{ 
                    fontWeight: 700,
                    fontSize: '0.875rem',
                    color: isUp ? '#10b981' : isDown ? '#ef4444' : '#e4e8eb'
                  }}>
                    {formatProbability(currentPrice)}
                  </div>
                  <div style={{ color: '#cbd5e0', fontSize: '0.75rem' }}>
                    {formatPence(trade.cost_pence || 0)}
                  </div>
                  <div style={{ color: '#64748b', fontSize: '0.625rem' }}>
                    {trade.executed_at ? formatRelativeTime(trade.executed_at) : 'now'}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  }

  // Original non-compact style
  return (
    <div style={{ background: 'white', padding: '1rem', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
      <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem' }}>Recent Trades</h3>
      
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: '1fr 1fr 1fr', 
        gap: '0.5rem',
        padding: '0.5rem',
        background: '#edf2f7',
        borderRadius: '4px',
        marginBottom: '0.5rem',
        fontSize: '0.75rem',
        fontWeight: 600,
        color: '#4a5568'
      }}>
        <div>Probability</div>
        <div style={{ textAlign: 'right' }}>Size</div>
        <div style={{ textAlign: 'right' }}>Time</div>
      </div>

      <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
        {initialTrades.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: '#a0aec0', fontSize: '0.875rem' }}>
            No trades yet
          </div>
        ) : (
          initialTrades.map((trade: any, i: number) => (
            <div 
              key={trade.id || i}
              style={{ 
                display: 'grid', 
                gridTemplateColumns: '1fr 1fr 1fr', 
                gap: '0.5rem',
                padding: '0.5rem',
                borderBottom: '1px solid #edf2f7',
                fontSize: '0.875rem'
              }}
            >
              <div style={{ fontWeight: 600 }}>
                {formatProbability(trade.yes_pts || 0)}
              </div>
              <div style={{ textAlign: 'right' }}>
                {((trade.contracts || 0) / 1_000_000).toFixed(2)}
              </div>
              <div style={{ textAlign: 'right', color: '#718096', fontSize: '0.75rem' }}>
                {trade.executed_at ? formatRelativeTime(trade.executed_at) : 'now'}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
