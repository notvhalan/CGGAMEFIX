import { useEffect, useState } from 'react';
import { getWSClient } from '~/lib/ws.client';
import { formatOdds } from '~/lib/format';

interface OrderBookProps {
  orderBook: any;
  marketId: string;
}

export function OrderBook({ orderBook: initialOrderBook, marketId }: OrderBookProps) {
  const [orderBook, setOrderBook] = useState(initialOrderBook);

  useEffect(() => {
    const ws = getWSClient();
    ws.connect();
    ws.subscribe(`book:${marketId}`);

    const handler = (data: any) => {
      setOrderBook(data);
    };

    ws.on('book_update', handler);

    return () => {
      ws.off('book_update', handler);
      ws.unsubscribe(`book:${marketId}`);
    };
  }, [marketId]);

  const bids = orderBook?.bids || [];
  const asks = orderBook?.asks || [];

  return (
    <div style={{ background: 'white', padding: '1rem', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
      <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem' }}>Order Book</h3>
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        {/* Back (Bids) */}
        <div>
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: '1fr 1fr', 
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
          </div>
          
          {bids.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#a0aec0', fontSize: '0.875rem' }}>
              No bids
            </div>
          ) : (
            bids.slice(0, 10).map((bid: any, i: number) => (
              <div 
                key={i}
                style={{ 
                  display: 'grid', 
                  gridTemplateColumns: '1fr 1fr', 
                  gap: '0.5rem',
                  padding: '0.5rem',
                  background: '#c6f6d5',
                  borderRadius: '4px',
                  marginBottom: '0.25rem',
                  fontSize: '0.875rem'
                }}
              >
                <div style={{ fontWeight: 600, color: '#22543d' }}>{formatOdds(bid.price || bid.odds || 0)}</div>
                <div style={{ textAlign: 'right', color: '#22543d' }}>${(bid.size || bid.stake || 0).toFixed(2)}</div>
              </div>
            ))
          )}
        </div>

        {/* Lay (Asks) */}
        <div>
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: '1fr 1fr', 
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
          </div>
          
          {asks.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#a0aec0', fontSize: '0.875rem' }}>
              No asks
            </div>
          ) : (
            asks.slice(0, 10).map((ask: any, i: number) => (
              <div 
                key={i}
                style={{ 
                  display: 'grid', 
                  gridTemplateColumns: '1fr 1fr', 
                  gap: '0.5rem',
                  padding: '0.5rem',
                  background: '#fed7d7',
                  borderRadius: '4px',
                  marginBottom: '0.25rem',
                  fontSize: '0.875rem'
                }}
              >
                <div style={{ fontWeight: 600, color: '#742a2a' }}>{formatOdds(ask.price || ask.odds || 0)}</div>
                <div style={{ textAlign: 'right', color: '#742a2a' }}>${(ask.size || ask.stake || 0).toFixed(2)}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
