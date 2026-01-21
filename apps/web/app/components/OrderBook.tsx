import { useEffect, useState } from 'react';
import { getWSClient } from '~/lib/ws.client';
import { formatProbability, pPtsToPercentage } from '~/lib/format';

const PRICE_SCALE = 10_000_000;
const CONTRACT_SCALE = 1_000_000;

// Format contracts from microcontracts
function formatContracts(contractsMicros: bigint | string | number): string {
  const contracts = typeof contractsMicros === 'bigint' 
    ? Number(contractsMicros) / CONTRACT_SCALE / 100
    : Number(contractsMicros) / CONTRACT_SCALE / 100;
  return contracts.toFixed(2);
}

// Calculate approximate cost in GBP from contracts and yesPts
function approximateCost(contractsMicros: bigint | string | number, yesPts: number): string {
  const contracts = typeof contractsMicros === 'bigint'
    ? Number(contractsMicros)
    : Number(contractsMicros);
  const costPence = (contracts * yesPts) / (PRICE_SCALE * CONTRACT_SCALE);
  return `£${(costPence / 100).toFixed(2)}`;
}

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
        {/* FOR (Back YES) - Left Side */}
        <div>
          <div style={{ 
            padding: '0.5rem',
            background: 'linear-gradient(135deg, #48bb78 0%, #38a169 100%)',
            borderRadius: '6px 6px 0 0',
            marginBottom: '0.5rem',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'white' }}>FOR (Back YES)</div>
            <div style={{ fontSize: '0.65rem', color: '#c6f6d5', marginTop: '0.15rem' }}>Buy YES at this probability</div>
          </div>
          
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
            <div>Probability</div>
            <div style={{ textAlign: 'right' }}>Contracts</div>
          </div>
          
          {bids.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#a0aec0', fontSize: '0.875rem' }}>
              No bids
            </div>
          ) : (
            bids.slice(0, 10).map((bid: any, i: number) => {
              const yesPts = bid.yesPts || 0;
              const contractsMicros = bid.contractsMicros || bid.sizePence || 0; // Fallback for old data
              
              return (
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
                    fontSize: '0.875rem',
                    transition: 'all 0.2s'
                  }}
                  title={`Approx ${approximateCost(contractsMicros, yesPts)}`}
                >
                  <div style={{ fontWeight: 600, color: '#22543d' }}>{formatProbability(yesPts)}</div>
                  <div style={{ textAlign: 'right', color: '#22543d' }}>
                    {formatContracts(contractsMicros)}
                    <span style={{ fontSize: '0.7rem', opacity: 0.7, marginLeft: '0.25rem' }}>
                      ({approximateCost(contractsMicros, yesPts)})
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* LAY (Back NO) - Right Side */}
        <div>
          <div style={{ 
            padding: '0.5rem',
            background: 'linear-gradient(135deg, #f56565 0%, #e53e3e 100%)',
            borderRadius: '6px 6px 0 0',
            marginBottom: '0.5rem',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'white' }}>LAY (Back NO)</div>
            <div style={{ fontSize: '0.65rem', color: '#fed7d7', marginTop: '0.15rem' }}>Sell YES at this probability</div>
          </div>
          
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
            <div>Probability</div>
            <div style={{ textAlign: 'right' }}>Contracts</div>
          </div>
          
          {asks.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#a0aec0', fontSize: '0.875rem' }}>
              No asks
            </div>
          ) : (
            asks.slice(0, 10).map((ask: any, i: number) => {
              const yesPts = ask.yesPts || 0;
              const contractsMicros = ask.contractsMicros || ask.sizePence || 0; // Fallback for old data
              
              return (
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
                    fontSize: '0.875rem',
                    transition: 'all 0.2s'
                  }}
                  title={`Approx ${approximateCost(contractsMicros, yesPts)}`}
                >
                  <div style={{ fontWeight: 600, color: '#742a2a' }}>{formatProbability(yesPts)}</div>
                  <div style={{ textAlign: 'right', color: '#742a2a' }}>
                    {formatContracts(contractsMicros)}
                    <span style={{ fontSize: '0.7rem', opacity: 0.7, marginLeft: '0.25rem' }}>
                      ({approximateCost(contractsMicros, yesPts)})
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
