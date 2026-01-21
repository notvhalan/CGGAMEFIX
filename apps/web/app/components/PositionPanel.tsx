import { Form } from '@remix-run/react';
import { formatPence, formatPercent, formatProbability } from '~/lib/format';
import { useState } from 'react';

interface TradePosition {
  sizePence: number;
  yesPricePts: number;
  feePence: number;
  executedAt: string;
}

export interface Position {
  netYesPence: number;
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
}

export function PositionPanel({ position, isLoading }: PositionPanelProps) {
  const [showDetails, setShowDetails] = useState(false);
  
  if (isLoading) {
    return (
      <div style={{ background: 'white', padding: '1rem', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem' }}>Your Position</h3>
        <div style={{ color: '#718096' }}>Loading position...</div>
      </div>
    );
  }

  if (!position || position.netYesPence === 0) {
    return (
      <div style={{ background: 'white', padding: '1rem', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem' }}>Your Position</h3>
        <div style={{ color: '#718096' }}>No open position</div>
      </div>
    );
  }

  const { netYesPence, avgEntryYesPts, markYesPts, unrealizedPnlPence, totalFeesPence, canCashOut, buyPositions, sellPositions } = position;
  const isLong = netYesPence > 0;
  const positionSize = Math.abs(netYesPence);
  
  // Format as probability percentage (divide by 100,000)
  const avgEntryPercent = avgEntryYesPts / 100_000;
  const markPercent = markYesPts / 100_000;
  
  // Calculate estimated cash out fee (0.1% of position size)
  const estimatedFee = Math.floor(positionSize / 1000); // 0.1% = divide by 1000
  
  // Calculate total buy and sell volumes
  const totalBuyPence = buyPositions.reduce((sum, p) => sum + p.sizePence, 0);
  const totalSellPence = sellPositions.reduce((sum, p) => sum + p.sizePence, 0);
  
  return (
    <div style={{ background: 'white', padding: '1rem', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
      <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem' }}>Your Position</h3>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {/* Position Direction & Size */}
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: '#718096' }}>Direction:</span>
          <span style={{ fontWeight: 600, color: isLong ? '#38a169' : '#e53e3e' }}>
            {isLong ? 'LONG (YES)' : 'SHORT (YES)'}
          </span>
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: '#718096' }}>Net Size:</span>
          <span style={{ fontWeight: 600 }}>{formatPence(positionSize)}</span>
        </div>
        
        {/* Entry Price */}
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: '#718096' }}>Avg Entry:</span>
          <span style={{ fontWeight: 500 }}>{avgEntryPercent.toFixed(4)}%</span>
        </div>
        
        {/* Mark Price */}
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: '#718096' }}>Mark Price:</span>
          <span style={{ fontWeight: 500 }}>{markPercent.toFixed(4)}%</span>
        </div>
        
        {/* Unrealized P&L */}
        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #e2e8f0', paddingTop: '0.75rem' }}>
          <span style={{ color: '#718096' }}>Unrealized P&L:</span>
          <span style={{ fontWeight: 700, color: unrealizedPnlPence >= 0 ? '#38a169' : '#e53e3e' }}>
            {unrealizedPnlPence >= 0 ? '+' : ''}{formatPence(unrealizedPnlPence)}
          </span>
        </div>
        
        {/* Total Fees Paid */}
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
        
        {/* Cash Out Button */}
        {canCashOut ? (
          <Form method="post" style={{ paddingTop: '1rem' }}>
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
          <div style={{ paddingTop: '1rem' }}>
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
    </div>
  );
}
