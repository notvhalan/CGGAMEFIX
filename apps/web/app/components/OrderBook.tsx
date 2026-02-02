import { useEffect, useState } from 'react';
import { getWSClient } from '~/lib/ws.client';
import { formatProbability } from '~/lib/format';

const PRICE_SCALE = 10_000_000;
const CONTRACT_SCALE = 1_000_000;

// Format contracts from microcontracts
function formatContracts(contractsMicros: bigint | string | number): string {
  const contracts = typeof contractsMicros === 'bigint' 
    ? Number(contractsMicros) / CONTRACT_SCALE
    : Number(contractsMicros) / CONTRACT_SCALE;
  return contracts.toFixed(2);
}

// Calculate cost in GBP from contracts and yesPts
function calculateCost(contractsMicros: bigint | string | number, yesPts: number): string {
  const contracts = typeof contractsMicros === 'bigint'
    ? Number(contractsMicros)
    : Number(contractsMicros);
  const costPence = (contracts * yesPts) / (PRICE_SCALE * CONTRACT_SCALE);
  return `£${(costPence / 100).toFixed(2)}`;
}

// Calculate NO% from YES%
function yesToNo(yesPts: number): string {
  const noPts = PRICE_SCALE - yesPts;
  return ((noPts / PRICE_SCALE) * 100).toFixed(4);
}

interface OrderBookProps {
  orderBook: any;
  marketId: string;
  onPriceClick?: (pPts: number) => void;
  compact?: boolean;
}

export function OrderBook({ orderBook: initialOrderBook, marketId, onPriceClick, compact = false }: OrderBookProps) {
  const [orderBook, setOrderBook] = useState(initialOrderBook);
  const [showNO, setShowNO] = useState(true);

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

  const bids = (orderBook?.bids || []).filter((b: any) => Number(b.contractsMicros || 0) > 0);
  const asks = (orderBook?.asks || []).filter((a: any) => Number(a.contractsMicros || 0) > 0);

  // Calculate mid price and spread
  const bestBid = Number(bids[0]?.yesPts) || 0;
  const bestAsk = Number(asks[0]?.yesPts) || 0;
  const midPrice = bestBid > 0 && bestAsk > 0 ? (bestBid + bestAsk) / 2 : 0;
  const spread = bestAsk > 0 && bestBid > 0 ? bestAsk - bestBid : 0;

  // Compact terminal style
  if (compact) {
    const maxDepth = Math.max(
      ...asks.slice(0, 10).map((a: any) => Number(a.contractsMicros || 0)),
      ...bids.slice(0, 10).map((b: any) => Number(b.contractsMicros || 0))
    );

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontSize: '0.75rem', fontFamily: 'monospace' }}>
        {/* Asks (Sell YES / Buy NO) - Top, highest % first */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column-reverse', padding: '0.5rem', overflowY: 'auto' }}>
          {asks.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#64748b', padding: '1rem', fontSize: '0.6875rem' }}>
              No asks
            </div>
          ) : (
            asks.slice(0, 10).map((ask: any, i: number) => {
              const yesPts = ask.yesPts || 0;
              const contractsMicros = Number(ask.contractsMicros || 0);
              const depth = maxDepth > 0 ? (contractsMicros / maxDepth) * 100 : 0;

              return (
                <div
                  key={`ask-${yesPts}-${contractsMicros}-${i}`}
                  onClick={() => onPriceClick?.(yesPts)}
                  style={{
                    position: 'relative',
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    padding: '0.25rem 0.5rem',
                    cursor: 'pointer',
                    transition: 'background 0.1s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#7f1d1d40'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  {/* Depth bar */}
                  <div style={{
                    position: 'absolute',
                    right: 0,
                    top: 0,
                    bottom: 0,
                    width: `${depth}%`,
                    background: '#ef444420',
                    zIndex: 0
                  }} />
                  
                  <div style={{ color: '#ef4444', fontWeight: 600, zIndex: 1 }}>
                    {formatProbability(yesPts)}
                  </div>
                  <div style={{ textAlign: 'right', color: '#cbd5e0', zIndex: 1 }}>
                    {formatContracts(contractsMicros)}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Spread Line */}
        <div style={{
          padding: '0.375rem 0.5rem',
          background: '#2d3748',
          textAlign: 'center',
          fontSize: '0.6875rem',
          color: '#94a3b8',
          fontWeight: 700,
          borderTop: '1px solid #374151',
          borderBottom: '1px solid #374151',
          flexShrink: 0
        }}>
          {midPrice > 0 ? (
            <>
              {formatProbability(midPrice)} 
              {spread > 0 && (
                <span style={{ marginLeft: '0.5rem', color: '#64748b' }}>
                  ±{((spread / PRICE_SCALE) * 100).toFixed(2)}%
                </span>
              )}
            </>
          ) : (
            'No market'
          )}
        </div>

        {/* Bids (Buy YES) - Bottom */}
        <div style={{ flex: 1, padding: '0.5rem', overflowY: 'auto' }}>
          {bids.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#64748b', padding: '1rem', fontSize: '0.6875rem' }}>
              No bids
            </div>
          ) : (
            bids.slice(0, 10).map((bid: any, i: number) => {
              const yesPts = bid.yesPts || 0;
              const contractsMicros = Number(bid.contractsMicros || 0);
              const depth = maxDepth > 0 ? (contractsMicros / maxDepth) * 100 : 0;

              return (
                <div
                  key={`bid-${yesPts}-${contractsMicros}-${i}`}
                  onClick={() => onPriceClick?.(yesPts)}
                  style={{
                    position: 'relative',
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    padding: '0.25rem 0.5rem',
                    cursor: 'pointer',
                    transition: 'background 0.1s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#14532d40'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  {/* Depth bar */}
                  <div style={{
                    position: 'absolute',
                    right: 0,
                    top: 0,
                    bottom: 0,
                    width: `${depth}%`,
                    background: '#10b98120',
                    zIndex: 0
                  }} />
                  
                  <div style={{ color: '#10b981', fontWeight: 600, zIndex: 1 }}>
                    {formatProbability(yesPts)}
                  </div>
                  <div style={{ textAlign: 'right', color: '#cbd5e0', zIndex: 1 }}>
                    {formatContracts(contractsMicros)}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  }

  // Original full-width style
  return (
    <div style={{ background: 'white', padding: '1rem', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0 }}>Order Book — YES contracts</h3>
        <label style={{ fontSize: '0.75rem', color: '#4a5568', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          <input 
            type="checkbox" 
            checked={showNO} 
            onChange={(e) => setShowNO(e.target.checked)}
            style={{ cursor: 'pointer' }}
          />
          Show NO%
        </label>
      </div>

      {/* Mid price strip */}
      {midPrice > 0 && (
        <div style={{ 
          textAlign: 'center', 
          padding: '0.5rem', 
          background: '#edf2f7', 
          borderRadius: '4px',
          marginBottom: '0.75rem',
          fontSize: '0.75rem',
          color: '#4a5568',
          fontFamily: 'monospace'
        }}>
          <span style={{ marginRight: '1rem' }}>
            <strong>Mid:</strong> {formatProbability(midPrice)}
          </span>
          {spread > 0 && (
            <span>
              <strong>Spread:</strong> {((spread / PRICE_SCALE) * 100).toFixed(4)}%
            </span>
          )}
        </div>
      )}
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        {/* Buy YES (Bids) - Left Side */}
        <div>
          <div style={{ 
            padding: '0.5rem',
            background: 'linear-gradient(135deg, #48bb78 0%, #38a169 100%)',
            borderRadius: '6px 6px 0 0',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'white' }}>Buy YES</div>
            <div style={{ fontSize: '0.65rem', color: '#c6f6d5', marginTop: '0.15rem' }}>Bids</div>
          </div>
          
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: showNO ? '1.2fr 0.8fr 1fr' : '1fr 1fr', 
            gap: '0.35rem',
            padding: '0.4rem 0.5rem',
            background: '#e6fffa',
            fontSize: '0.7rem',
            fontWeight: 600,
            color: '#234e52'
          }}>
            <div>YES%</div>
            {showNO && <div style={{ fontSize: '0.65rem', color: '#718096' }}>(NO%)</div>}
            <div style={{ textAlign: 'right' }}>Contracts</div>
          </div>
          
          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            {bids.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#a0aec0', fontSize: '0.875rem' }}>
                No bids
              </div>
            ) : (
              bids.slice(0, 15).map((bid: any, i: number) => {
                const yesPts = bid.yesPts || 0;
                const contractsMicros = bid.contractsMicros || bid.sizePence || 0;
                
                return (
                  <div 
                    key={`bid-full-${yesPts}-${contractsMicros}-${i}`}
                    style={{ 
                      display: 'grid', 
                      gridTemplateColumns: showNO ? '1.2fr 0.8fr 1fr' : '1fr 1fr', 
                      gap: '0.35rem',
                      padding: '0.4rem 0.5rem',
                      background: i % 2 === 0 ? '#c6f6d5' : '#d9f7e7',
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                      transition: 'background 0.15s',
                      ':hover': { background: '#9ae6b4' }
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#9ae6b4'}
                    onMouseLeave={(e) => e.currentTarget.style.background = i % 2 === 0 ? '#c6f6d5' : '#d9f7e7'}
                    title={`Click to place order • Cost: ${calculateCost(contractsMicros, yesPts)}`}
                  >
                    <div style={{ fontWeight: 600, color: '#22543d', fontFamily: 'monospace' }}>
                      {formatProbability(yesPts)}
                    </div>
                    {showNO && (
                      <div style={{ fontSize: '0.7rem', color: '#718096', fontFamily: 'monospace' }}>
                        ({yesToNo(yesPts)})
                      </div>
                    )}
                    <div style={{ textAlign: 'right', color: '#22543d', fontFamily: 'monospace' }}>
                      {formatContracts(contractsMicros)}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Sell YES (Asks) - Right Side */}
        <div>
          <div style={{ 
            padding: '0.5rem',
            background: 'linear-gradient(135deg, #f56565 0%, #e53e3e 100%)',
            borderRadius: '6px 6px 0 0',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'white' }}>Sell YES</div>
            <div style={{ fontSize: '0.65rem', color: '#fed7d7', marginTop: '0.15rem' }}>Asks (equiv Buy NO)</div>
          </div>
          
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: showNO ? '1.2fr 0.8fr 1fr' : '1fr 1fr', 
            gap: '0.35rem',
            padding: '0.4rem 0.5rem',
            background: '#fff5f5',
            fontSize: '0.7rem',
            fontWeight: 600,
            color: '#63171b'
          }}>
            <div>YES%</div>
            {showNO && <div style={{ fontSize: '0.65rem', color: '#718096' }}>(NO%)</div>}
            <div style={{ textAlign: 'right' }}>Contracts</div>
          </div>
          
          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            {asks.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#a0aec0', fontSize: '0.875rem' }}>
                No asks
              </div>
            ) : (
              asks.slice(0, 15).reverse().map((ask: any, i: number) => {
                const yesPts = ask.yesPts || 0;
                const contractsMicros = ask.contractsMicros || ask.sizePence || 0;
                
                return (
                  <div 
                    key={`ask-full-${yesPts}-${contractsMicros}-${i}`}
                    style={{ 
                      display: 'grid', 
                      gridTemplateColumns: showNO ? '1.2fr 0.8fr 1fr' : '1fr 1fr', 
                      gap: '0.35rem',
                      padding: '0.4rem 0.5rem',
                      background: i % 2 === 0 ? '#fed7d7' : '#fee5e5',
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                      transition: 'background 0.15s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#fc8181'}
                    onMouseLeave={(e) => e.currentTarget.style.background = i % 2 === 0 ? '#fed7d7' : '#fee5e5'}
                    title={`Click to place order • Cost: ${calculateCost(contractsMicros, yesPts)}`}
                  >
                    <div style={{ fontWeight: 600, color: '#742a2a', fontFamily: 'monospace' }}>
                      {formatProbability(yesPts)}
                    </div>
                    {showNO && (
                      <div style={{ fontSize: '0.7rem', color: '#718096', fontFamily: 'monospace' }}>
                        ({yesToNo(yesPts)})
                      </div>
                    )}
                    <div style={{ textAlign: 'right', color: '#742a2a', fontFamily: 'monospace' }}>
                      {formatContracts(contractsMicros)}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
