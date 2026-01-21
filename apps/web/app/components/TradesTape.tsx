import { useEffect, useState } from 'react';
import { getWSClient } from '~/lib/ws.client';
import { formatOdds, formatRelativeTime } from '~/lib/format';

interface TradesTapeProps {
  trades: any[];
  marketId: string;
}

export function TradesTape({ trades: initialTrades, marketId }: TradesTapeProps) {
  const [trades, setTrades] = useState(initialTrades);

  useEffect(() => {
    const ws = getWSClient();
    ws.connect();
    ws.subscribe(`trades:${marketId}`);

    const handler = (data: any) => {
      setTrades((prev) => [data, ...prev].slice(0, 50));
    };

    ws.on('trade', handler);

    return () => {
      ws.off('trade', handler);
      ws.unsubscribe(`trades:${marketId}`);
    };
  }, [marketId]);

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
        <div>Odds</div>
        <div style={{ textAlign: 'right' }}>Size</div>
        <div style={{ textAlign: 'right' }}>Time</div>
      </div>

      <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
        {trades.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: '#a0aec0', fontSize: '0.875rem' }}>
            No trades yet
          </div>
        ) : (
          trades.map((trade: any, i: number) => (
            <div 
              key={i}
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
                {formatOdds(trade.price || trade.odds || 0)}
              </div>
              <div style={{ textAlign: 'right' }}>
                ${(trade.size || trade.stake || 0).toFixed(2)}
              </div>
              <div style={{ textAlign: 'right', color: '#718096', fontSize: '0.75rem' }}>
                {trade.timestamp ? formatRelativeTime(trade.timestamp) : 'now'}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
