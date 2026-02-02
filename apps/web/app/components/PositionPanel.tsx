import { Form } from '@remix-run/react';
import { formatPence, formatPercent, formatProbability } from '~/lib/format';
import { useState } from 'react';
import { Eye } from 'lucide-react';

interface TradePosition {
  sizePence: number;
  yesPricePts: number;
  feePence: number;
  executedAt: string;
}

export interface Position {
  netYesPence: number;
  netContractsMicros: string | bigint; // Can be string from API or BigInt in local stsate
  avgEntryYesPts: number;
  markYesPts: number;
  unrealizedPnlPence: number;
  totalFeesPence: number;
  canCashOut: boolean;
  buyPositions: TradePosition[];
  sellPositions: TradePosition[];
}

interface PositionPanelProps {
  position: Position | null;
  isLoading?: boolean;
  compact?: boolean;
  onOpenDetails?: () => void;
}

export function PositionPanel({ position, isLoading, compact = false, onOpenDetails }: PositionPanelProps) {
  const [showDetails, setShowDetails] = useState(false);
  
  if (isLoading) {
    return (
      <div style={{ background: 'white', padding: '1rem', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem' }}>Your Position</h3>
        <div style={{ color: '#718096' }}>Loading position...</div>
      </div>
    );
  }

  // Position exists if netContractsMicros !== 0 (not based on cashflow!)
  const netContractsMicros = position 
    ? (typeof position.netContractsMicros === 'string' 
        ? BigInt(position.netContractsMicros) 
        : position.netContractsMicros)
    : 0n;

  if (!position || netContractsMicros === 0n) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ 
          padding: '0.625rem 0.875rem',
          borderBottom: '1px solid #2d3748',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexShrink: 0
        }}>
          <div style={{ 
            fontSize: '0.75rem',
            fontWeight: 700,
            color: '#94a3b8',
            textTransform: 'uppercase',
            letterSpacing: '0.05em'
          }}>
            Position
          </div>
          <button
            type="button"
            disabled
            style={{
              padding: '0.25rem 0.5rem',
              fontSize: '0.625rem',
              fontWeight: 700,
              background: '#374151',
              color: '#6e7681',
              border: 'none',
              borderRadius: '3px',
              cursor: 'not-allowed',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              opacity: 0.5
            }}
          >
            ▶ Details
          </button>
        </div>

        {/* Empty state */}
        <div style={{ 
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem',
        }}>
          <div style={{ 
            color: '#6e7681', 
            fontSize: '0.875rem',
            textAlign: 'center'
          }}>
            No open position
          </div>
        </div>
      </div>
    );
  }

  const { netYesPence, avgEntryYesPts, markYesPts, unrealizedPnlPence, totalFeesPence, canCashOut, buyPositions, sellPositions } = position;
  
  // Direction is based on contracts, not cashflow!
  const isLong = netContractsMicros > 0n;
  const positionSize = Math.abs(netYesPence);
  
  // Format as probability percentage (divide by 100,000)
  const avgEntryPercent = avgEntryYesPts / 100_000;
  const markPercent = markYesPts / 100_000;
  
  // Calculate estimated cash out fee (0.1% of position size)
  const estimatedFee = Math.floor(positionSize / 1000); // 0.1% = divide by 1000
  
  // Calculate total buy and sell volumes
  const totalBuyPence = buyPositions.reduce((sum, p) => sum + p.sizePence, 0);
  const totalSellPence = sellPositions.reduce((sum, p) => sum + p.sizePence, 0);
  
  // Compact terminal style
  if (compact) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ 
          padding: '0.625rem 0.875rem',
          borderBottom: '1px solid #2d3748',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexShrink: 0
        }}>
          <div style={{ 
            fontSize: '0.75rem',
            fontWeight: 700,
            color: '#94a3b8',
            textTransform: 'uppercase',
            letterSpacing: '0.05em'
          }}>
            Position
          </div>
          <button
            type="button"
            onClick={() => onOpenDetails ? onOpenDetails() : setShowDetails(!showDetails)}
            style={{
              padding: '0.25rem 0.5rem',
              fontSize: '0.625rem',
              fontWeight: 700,
              background: showDetails ? '#667eea' : '#374151',
              color: 'white',
              border: 'none',
              borderRadius: '3px',
              cursor: 'pointer',
              textTransform: 'uppercase',
              letterSpacing: '0.05em'
            }}
          >
            {showDetails ? '▼ Hide' : '▶ Details'}
          </button>
        </div>

        {/* Summary */}
        <div style={{ 
          padding: '0.75rem',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '0.5rem 0.75rem',
          fontSize: '0.6875rem',
          flexShrink: 0,
          background: isLong ? '#10b98108' : '#ef444408',
          borderBottom: showDetails ? '1px solid #2d3748' : 'none'
        }}>
          {/* Direction - spans full width */}
          <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'space-between', paddingBottom: '0.5rem', borderBottom: '1px solid #2d374820' }}>
            <span style={{ color: '#94a3b8', fontSize: '0.625rem', textTransform: 'uppercase' }}>Direction</span>
            <span style={{ fontWeight: 700, color: isLong ? '#10b981' : '#ef4444', fontSize: '0.8125rem' }}>
              {isLong ? '▲ FOR' : '▼ LAY'}
            </span>
          </div>
          
          {/* Two column layout for metrics */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ color: '#6e7681', fontSize: '0.625rem', marginBottom: '0.125rem' }}>Net Size</span>
            <span style={{ fontWeight: 600, color: '#e4e8eb', fontSize: '0.75rem' }}>{formatPence(positionSize)}</span>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ color: '#6e7681', fontSize: '0.625rem', marginBottom: '0.125rem' }}>Avg Entry</span>
            <span style={{ fontWeight: 600, color: '#e4e8eb', fontSize: '0.75rem' }}>{avgEntryPercent.toFixed(2)}%</span>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ color: '#6e7681', fontSize: '0.625rem', marginBottom: '0.125rem' }}>Mark</span>
            <span style={{ fontWeight: 600, color: '#e4e8eb', fontSize: '0.75rem' }}>{markPercent.toFixed(2)}%</span>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ color: '#6e7681', fontSize: '0.625rem', marginBottom: '0.125rem' }}>Unreal. P&L</span>
            <span style={{ 
              fontWeight: 700, 
              fontSize: '0.875rem',
              color: unrealizedPnlPence >= 0 ? '#10b981' : '#ef4444' 
            }}>
              {unrealizedPnlPence >= 0 ? '+' : ''}{formatPence(unrealizedPnlPence)}
            </span>
          </div>
        </div>

        {/* Details Section (collapsible) */}
        {showDetails && (
          <div style={{ 
            flex: 1,
            overflowY: 'auto',
            padding: '0.875rem',
            fontSize: '0.75rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem'
          }}>
            {/* Total Fees */}
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.75rem', borderBottom: '1px solid #2d3748' }}>
              <span style={{ color: '#94a3b8' }}>Total Fees Paid:</span>
              <span style={{ color: '#64748b', fontWeight: 600 }}>{formatPence(totalFeesPence)}</span>
            </div>

            {/* Buy Positions */}
            {buyPositions.length > 0 && (
              <div>
                <div style={{ 
                  fontSize: '0.6875rem', 
                  fontWeight: 700, 
                  color: '#10b981', 
                  marginBottom: '0.5rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em'
                }}>
                  ▲ Buy Positions ({buyPositions.length})
                </div>
                <div style={{ fontSize: '0.6875rem', color: '#64748b', marginBottom: '0.5rem' }}>
                  Total: {formatPence(totalBuyPence)}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                  {buyPositions.map((pos, idx) => (
                    <div key={idx} style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between',
                      padding: '0.375rem 0.5rem',
                      background: '#10b98110',
                      border: '1px solid #10b98130',
                      borderRadius: '4px',
                      fontSize: '0.6875rem'
                    }}>

                      <span>{formatPence(pos.sizePence)} @ {formatProbability(pos.yesPricePts)}</span>
                      <span style={{ color: '#718096' }}>Fee: {formatPence(pos.feePence)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Sell Positions */}
            {sellPositions.length > 0 && (
              <div>
                <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#e53e3e', marginBottom: '0.5rem' }}>
                  Sell Positions ({sellPositions.length})
                </h4>
                <div style={{ fontSize: '0.75rem', color: '#718096', marginBottom: '0.25rem' }}>
                  Total: {formatPence(totalSellPence)}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                  {sellPositions.map((pos, idx) => (
                    <div key={idx} style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between',
                      padding: '0.375rem 0.5rem',
                      background: '#fff5f5',
                      borderRadius: '4px',
                      fontSize: '0.75rem'
                    }}>
                      <span>{formatPence(pos.sizePence)} @ {formatProbability(pos.yesPricePts)}</span>
                      <span style={{ color: '#718096' }}>Fee: {formatPence(pos.feePence)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        
      </div>
    );
  }
  
  // Full-width style (non-compact)
  return (
    <div style={{ background: 'white', padding: '1rem', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
      <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem' }}>Your Position</h3>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
          <span style={{ color: '#a0aec0' }}>Direction:</span>
          <span style={{ fontWeight: 600, color: isLong ? '#38a169' : '#e53e3e' }}>
            {isLong ? 'FOR (YES)' : 'LAY (YES)'}
          </span>
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
          <span style={{ color: '#a0aec0' }}>Net Size:</span>
          <span style={{ fontWeight: 600 }}>{formatPence(positionSize)}</span>
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
          <span style={{ color: '#a0aec0' }}>Avg Entry:</span>
          <span style={{ fontWeight: 600 }}>{formatPercent(avgEntryPercent)}</span>
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
          <span style={{ color: '#a0aec0' }}>Mark Price:</span>
          <span style={{ fontWeight: 600 }}>{formatPercent(markPercent)}</span>
        </div>
        
        <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '0.75rem', marginTop: '0.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1rem' }}>
            <span style={{ color: '#4a5568', fontWeight: 600 }}>Unrealized P&L:</span>
            <span style={{ 
              fontWeight: 700, 
              color: unrealizedPnlPence >= 0 ? '#38a169' : '#e53e3e' 
            }}>
              {unrealizedPnlPence >= 0 ? '+' : ''}{formatPence(unrealizedPnlPence)}
            </span>
          </div>
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
          <span style={{ color: '#a0aec0' }}>Total Fees Paid:</span>
          <span style={{ color: '#718096' }}>{formatPence(totalFeesPence)}</span>
        </div>
        
        {/* Toggle Details Button */}
        <button
          onClick={() => setShowDetails(!showDetails)}
          style={{
            marginTop: '0.5rem',
            padding: '0.5rem',
            background: '#f7fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '6px',
            color: '#4a5568',
            fontSize: '0.875rem',
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
          onMouseOver={(e) => e.currentTarget.style.background = '#edf2f7'}
          onMouseOut={(e) => e.currentTarget.style.background = '#f7fafc'}
        >
          {showDetails ? '▼' : '▶'} {showDetails ? 'Hide' : 'Show'} Position Details
        </button>
        
        {/* Detailed Positions */}
        {showDetails && (
          <div style={{ marginTop: '0.5rem', borderTop: '1px solid #e2e8f0', paddingTop: '0.75rem' }}>
            {/* Buy Positions */}
            {buyPositions.length > 0 && (
              <div style={{ marginBottom: '1rem' }}>
                <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#38a169', marginBottom: '0.5rem' }}>
                  Buy Positions ({buyPositions.length})
                </h4>
                <div style={{ fontSize: '0.75rem', color: '#718096', marginBottom: '0.25rem' }}>
                  Total: {formatPence(totalBuyPence)}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                  {buyPositions.map((pos, idx) => (
                    <div key={idx} style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between',
                      padding: '0.375rem 0.5rem',
                      background: '#f0fff4',
                      borderRadius: '4px',
                      fontSize: '0.75rem'
                    }}>
                      <span>{formatPence(pos.sizePence)} @ {formatProbability(pos.yesPricePts)}</span>
                      <span style={{ color: '#718096' }}>Fee: {formatPence(pos.feePence)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Sell Positions */}
            {sellPositions.length > 0 && (
              <div>
                <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#e53e3e', marginBottom: '0.5rem' }}>
                  Sell Positions ({sellPositions.length})
                </h4>
                <div style={{ fontSize: '0.75rem', color: '#718096', marginBottom: '0.25rem' }}>
                  Total: {formatPence(totalSellPence)}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                  {sellPositions.map((pos, idx) => (
                    <div key={idx} style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between',
                      padding: '0.375rem 0.5rem',
                      background: '#fff5f5',
                      borderRadius: '4px',
                      fontSize: '0.75rem'
                    }}>
                      <span>{formatPence(pos.sizePence)} @ {formatProbability(pos.yesPricePts)}</span>
                      <span style={{ color: '#718096' }}>Fee: {formatPence(pos.feePence)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* Cash Out Button */}
      {canCashOut ? (
        <Form method="post">
          <input type="hidden" name="intent" value="cashout" />
          <button
            type="submit"
            style={{
              width: '100%',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: 'white',
              fontWeight: 600,
              padding: '0.75rem 1rem',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '1rem',
              boxShadow: '0 4px 6px rgba(102, 126, 234, 0.25)',
              transition: 'all 0.2s'
            }}
            onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-1px)'}
            onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}
          >
            💰 Cash Out Now
          </button>
          <div style={{ 
            marginTop: '0.5rem',
            padding: '0.5rem',
            background: '#f7fafc',
            borderRadius: '6px',
            fontSize: '0.75rem',
            color: '#718096',
            textAlign: 'center'
          }}>
            <div style={{ fontWeight: 500 }}>Estimated Fee: {formatPence(estimatedFee)}</div>
            <div style={{ marginTop: '0.25rem', fontSize: '0.7rem' }}>
              Places IOC order at best available price
            </div>
          </div>
        </Form>
      ) : (
        <div>
          <button
            disabled
            style={{
              width: '100%',
              background: '#e2e8f0',
              color: '#a0aec0',
              fontWeight: 600,
              padding: '0.75rem 1rem',
              borderRadius: '8px',
              border: 'none',
              cursor: 'not-allowed',
              fontSize: '1rem'
            }}
          >
            Cash Out Unavailable
          </button>
          <p style={{ fontSize: '0.75rem', color: '#a0aec0', marginTop: '0.5rem', textAlign: 'center' }}>
            Insufficient liquidity in orderbook
          </p>
        </div>
      )}
    </div>
  );
}
