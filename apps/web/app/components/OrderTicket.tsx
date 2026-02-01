import { Form } from "@remix-run/react";
import { useState, useEffect } from "react";
import { percentageToPPts } from "~/lib/format";

// Constants from shared-types
const PRICE_SCALE = 10_000_000;
const CONTRACT_SCALE = 1_000_000;
const CONTRACT_PAYOUT_PENCE = 100;

// Conversion functions (matching shared-types)
function stakeToContracts(stakePence: number, yesPts: number): number {
  return Math.floor((stakePence * CONTRACT_SCALE * PRICE_SCALE) / (yesPts * CONTRACT_PAYOUT_PENCE));
}

function liabilityToContracts(liabilityPence: number, yesPts: number): number {
  const qPts = PRICE_SCALE - yesPts;
  return Math.floor((liabilityPence * CONTRACT_SCALE * PRICE_SCALE) / (qPts * CONTRACT_PAYOUT_PENCE));
}

function contractsCost(contractsMicros: number, yesPts: number): number {
  return Math.floor((contractsMicros * CONTRACT_PAYOUT_PENCE * yesPts) / (PRICE_SCALE * CONTRACT_SCALE));
}

function calculateTakerFee(costPence: number): number {
  return Math.floor((costPence * 10) / 10000); // 0.1%
}

interface OrderTicketProps {
  marketId: string;
  wallet: any;
  selectedPrice?: number | null;
  bestBidPPts?: number | null;
  bestAskPPts?: number | null;
  lastTradePPts?: number | null;
  compact?: boolean;
}

export function OrderTicket({ 
  marketId, 
  wallet, 
  selectedPrice, 
  bestBidPPts,
  bestAskPPts,
  lastTradePPts,
  compact = false 
}: OrderTicketProps) {
  const [side, setSide] = useState<'FOR' | 'LAY'>('FOR');
  const [orderType, setOrderType] = useState<'LIMIT' | 'MARKET'>('LIMIT');
  const [probability, setProbability] = useState('50.00'); // Always YES percentage 0-100
  const [amount, setAmount] = useState('10.00'); // Max cost in pounds

  // Auto-fill price when clicked from orderbook (using useEffect to avoid render-time state updates)
  useEffect(() => {
    if (selectedPrice && selectedPrice !== percentageToPPts(parseFloat(probability))) {
      const pricePercent = (selectedPrice / 100_000).toFixed(2);
      setProbability(pricePercent);
    }
  }, [selectedPrice]);

  // Calculate mid price (ensure numeric to avoid string concatenation)
  const midPPts = bestBidPPts && bestAskPPts 
    ? Math.round((Number(bestBidPPts) + Number(bestAskPPts)) / 2)
    : null;

  // Quick price setters
  const setBestPrice = () => {
    const price = side === 'FOR' ? bestAskPPts : bestBidPPts;
    if (price) setProbability((Number(price) / 100_000).toFixed(2));
  };

  const setMidPrice = () => {
    if (midPPts) setProbability((Number(midPPts) / 100_000).toFixed(2));
  };

  const setLastPrice = () => {
    if (lastTradePPts) setProbability((Number(lastTradePPts) / 100_000).toFixed(2));
  };

  // Calculate contracts and outcomes
  const amountValue = parseFloat(amount);
  const yesInputPPts = percentageToPPts(parseFloat(probability)); // User always inputs YES%
  const amountPence = Math.round(amountValue * 100);
  
  // Determine effective price based on order type
  const marketYesPPts = side === 'FOR' ? bestAskPPts : bestBidPPts; // Buy YES takes asks, Buy NO takes bids
  const effectiveYesPPts = orderType === 'MARKET' && marketYesPPts ? marketYesPPts : yesInputPPts;
  
  // Price submitted to API (YES for FOR, NO for LAY)
  const pPtsSubmitted = side === 'FOR' ? effectiveYesPPts : (PRICE_SCALE - effectiveYesPPts);
  
  // Time in force based on order type
  const timeInForce: 'GTC' | 'IOC' = orderType === 'MARKET' ? 'IOC' : 'GTC';
  
  let yesPts: number; // For preview calculations
  let contractsMicros: number;
  let costPence: number;
  let feePence: number;
  let potentialProfit: number;
  let maxLoss: number;
  
  if (side === 'FOR') {
    // FOR (Buy YES): submit YES price as-is
    yesPts = effectiveYesPPts;
    contractsMicros = stakeToContracts(amountPence, yesPts);
    costPence = amountPence; // Cost is the max loss
    feePence = calculateTakerFee(costPence);
    
    // If YES wins: get £1 per contract, profit = payout - cost - fee
    const payoutPence = (contractsMicros * CONTRACT_PAYOUT_PENCE) / CONTRACT_SCALE;
    potentialProfit = (payoutPence / 100) - amountValue - (feePence / 100);
    maxLoss = amountValue; // Lose the cost
  } else {
    // LAY (Buy NO): submit NO price (inverted from YES input)
    yesPts = effectiveYesPPts; // Use YES price for preview calculations
    contractsMicros = liabilityToContracts(amountPence, yesPts);
    costPence = contractsCost(contractsMicros, yesPts);
    feePence = calculateTakerFee(costPence);
    
    // If NO wins (YES loses): collect the cost - fee
    potentialProfit = (costPence / 100) - (feePence / 100);
    maxLoss = amountValue; // Lose the cost
  }

  const contracts = (contractsMicros / CONTRACT_SCALE).toFixed(2);

  const containerStyle = compact ? {
    background: 'transparent',
    padding: '0.875rem',
    fontSize: '0.875rem'
  } : {
    background: 'white',
    padding: '1rem',
    borderRadius: '8px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
  };

  const inputPadding = compact ? '0.5rem' : '0.625rem';

  return (
    <div style={containerStyle}>
      {!compact && <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem' }}>Place Order</h3>}

      {!wallet && (
        <div style={{ 
          padding: compact ? '0.5rem' : '1rem', 
          background: compact ? '#b7791f40' : '#fef5e7', 
          color: compact ? '#fcd34d' : '#b7791f', 
          borderRadius: compact ? '4px' : '6px', 
          marginBottom: compact ? '0.5rem' : '1rem',
          fontSize: compact ? '0.75rem' : '0.875rem'
        }}>
          Please log in to place orders
        </div>
      )}

      <Form method="post">
        <input type="hidden" name="marketId" value={marketId} />
        <input type="hidden" name="side" value={side} />
        <input type="hidden" name="pPts" value={pPtsSubmitted} />
        <input type="hidden" name="liabilityPence" value={amountPence} />
        <input type="hidden" name="timeInForce" value={timeInForce} />

        {/* Direction: Buy YES / Buy NO */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: '1fr 1fr', 
          gap: compact ? '0.375rem' : '0.5rem', 
          marginBottom: compact ? '0.625rem' : '0.75rem' 
        }}>
          <button
            type="button"
            onClick={() => setSide('FOR')}
            style={{
              padding: compact ? '0.5rem' : '0.625rem',
              background: side === 'FOR' ? 'linear-gradient(135deg, #48bb78 0%, #38a169 100%)' : (compact ? '#1e293b' : '#e2e8f0'),
              color: side === 'FOR' ? 'white' : (compact ? '#94a3b8' : '#4a5568'),
              border: compact ? '1px solid #374151' : 'none',
              borderRadius: compact ? '4px' : '6px',
              fontWeight: 600,
              fontSize: compact ? '0.75rem' : '0.875rem',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            Buy YES
          </button>
          <button
            type="button"
            onClick={() => setSide('LAY')}
            style={{
              padding: compact ? '0.5rem' : '0.625rem',
              background: side === 'LAY' ? 'linear-gradient(135deg, #e53e3e 0%, #c53030 100%)' : (compact ? '#1e293b' : '#e2e8f0'),
              color: side === 'LAY' ? 'white' : (compact ? '#94a3b8' : '#4a5568'),
              border: compact ? '1px solid #374151' : 'none',
              borderRadius: compact ? '4px' : '6px',
              fontWeight: 600,
              fontSize: compact ? '0.75rem' : '0.875rem',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            Buy NO
          </button>
        </div>

        {/* Order Type: Limit / Market */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: '1fr 1fr', 
          gap: compact ? '0.375rem' : '0.5rem', 
          marginBottom: compact ? '0.75rem' : '1rem' 
        }}>
          <button
            type="button"
            onClick={() => setOrderType('LIMIT')}
            style={{
              padding: compact ? '0.375rem' : '0.5rem',
              background: orderType === 'LIMIT' ? (compact ? '#374151' : '#667eea') : (compact ? '#0f1419' : '#f7fafc'),
              color: orderType === 'LIMIT' ? (compact ? '#e4e8eb' : 'white') : (compact ? '#64748b' : '#718096'),
              border: compact ? '1px solid #374151' : '1px solid #e2e8f0',
              borderRadius: compact ? '3px' : '4px',
              fontWeight: orderType === 'LIMIT' ? 600 : 500,
              fontSize: compact ? '0.6875rem' : '0.8125rem',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            Limit
          </button>
          <button
            type="button"
            onClick={() => setOrderType('MARKET')}
            style={{
              padding: compact ? '0.375rem' : '0.5rem',
              background: orderType === 'MARKET' ? (compact ? '#374151' : '#667eea') : (compact ? '#0f1419' : '#f7fafc'),
              color: orderType === 'MARKET' ? (compact ? '#e4e8eb' : 'white') : (compact ? '#64748b' : '#718096'),
              border: compact ? '1px solid #374151' : '1px solid #e2e8f0',
              borderRadius: compact ? '3px' : '4px',
              fontWeight: orderType === 'MARKET' ? 600 : 500,
              fontSize: compact ? '0.6875rem' : '0.8125rem',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            Market
          </button>
        </div>

        {orderType === 'LIMIT' ? (
          // LIMIT MODE: 2-column grid (Price + Cost)
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: compact ? '1fr' : '1fr 1fr', 
            gap: compact ? '0.75rem' : '0.875rem', 
            marginBottom: compact ? '0.75rem' : '1rem' 
          }}>
            {/* Left: Price (YES %) */}
            <div>
              <label style={{ 
                display: 'block', 
                marginBottom: '0.375rem', 
                fontSize: compact ? '0.6875rem' : '0.8125rem', 
                fontWeight: 600, 
                color: compact ? '#cbd5e1' : '#2d3748' 
              }}>
                Price (YES %)
              </label>
              <input
                type="number"
                value={probability}
                onChange={(e) => setProbability(e.target.value)}
                min="0.01"
                max="99.99"
                step="0.01"
                required
                style={{
                  width: '100%',
                  padding: inputPadding,
                  border: compact ? '1px solid #374151' : '1px solid #cbd5e0',
                  borderRadius: compact ? '4px' : '5px',
                  fontSize: compact ? '0.875rem' : '0.9375rem',
                  boxSizing: 'border-box',
                  background: compact ? '#0f1419' : 'white',
                  color: compact ? '#e4e8eb' : '#2d3748',
                  fontWeight: 500
                }}
              />
              
              {/* Tick buttons */}
              <div style={{ display: 'flex', gap: compact ? '0.1875rem' : '0.25rem', marginTop: '0.375rem' }}>
                {[-1, -0.1, -0.01, 0.01, 0.1, 1].map(step => (
                  <button
                    key={step}
                    type="button"
                    onClick={() => {
                      const newProb = Math.max(0.01, Math.min(99.99, parseFloat(probability) + step));
                      setProbability(newProb.toFixed(2));
                    }}
                    style={{
                      flex: 1,
                      padding: compact ? '0.1875rem' : '0.25rem',
                      fontSize: compact ? '0.5625rem' : '0.625rem',
                      fontWeight: 700,
                      background: compact ? '#1e293b' : '#f7fafc',
                      color: step > 0 ? '#10b981' : '#ef4444',
                      border: compact ? '1px solid #374151' : '1px solid #e2e8f0',
                      borderRadius: compact ? '2px' : '3px',
                      cursor: 'pointer'
                    }}
                  >
                    {step > 0 ? '+' : ''}{step}
                  </button>
                ))}
              </div>

              {/* Quick price buttons: Best / Mid / Last */}
              <div style={{ display: 'flex', gap: compact ? '0.25rem' : '0.375rem', marginTop: '0.375rem' }}>
                <button
                  type="button"
                  onClick={setBestPrice}
                  disabled={!marketYesPPts}
                  style={{
                    flex: 1,
                    padding: compact ? '0.25rem' : '0.375rem',
                    fontSize: compact ? '0.625rem' : '0.6875rem',
                    fontWeight: 600,
                    background: marketYesPPts ? (compact ? '#374151' : '#edf2f7') : (compact ? '#1a1f2e' : '#f7fafc'),
                    color: marketYesPPts ? (compact ? '#94a3b8' : '#4a5568') : (compact ? '#475569' : '#a0aec0'),
                    border: compact ? '1px solid #475569' : '1px solid #e2e8f0',
                    borderRadius: compact ? '3px' : '4px',
                    cursor: marketYesPPts ? 'pointer' : 'not-allowed',
                    textTransform: 'uppercase',
                    letterSpacing: '0.025em'
                  }}
                  title={marketYesPPts ? `Best: ${(marketYesPPts / 100_000).toFixed(2)}%` : 'No market price'}
                >
                  Best
                </button>
                <button
                  type="button"
                  onClick={setMidPrice}
                  disabled={!midPPts}
                  style={{
                    flex: 1,
                    padding: compact ? '0.25rem' : '0.375rem',
                    fontSize: compact ? '0.625rem' : '0.6875rem',
                    fontWeight: 600,
                    background: midPPts ? (compact ? '#374151' : '#edf2f7') : (compact ? '#1a1f2e' : '#f7fafc'),
                    color: midPPts ? (compact ? '#94a3b8' : '#4a5568') : (compact ? '#475569' : '#a0aec0'),
                    border: compact ? '1px solid #475569' : '1px solid #e2e8f0',
                    borderRadius: compact ? '3px' : '4px',
                    cursor: midPPts ? 'pointer' : 'not-allowed',
                    textTransform: 'uppercase',
                    letterSpacing: '0.025em'
                  }}
                  title={midPPts ? `Mid: ${(midPPts / 100_000).toFixed(2)}%` : 'No mid price'}
                >
                  Mid
                </button>
                <button
                  type="button"
                  onClick={setLastPrice}
                  disabled={!lastTradePPts}
                  style={{
                    flex: 1,
                    padding: compact ? '0.25rem' : '0.375rem',
                    fontSize: compact ? '0.625rem' : '0.6875rem',
                    fontWeight: 600,
                    background: lastTradePPts ? (compact ? '#374151' : '#edf2f7') : (compact ? '#1a1f2e' : '#f7fafc'),
                    color: lastTradePPts ? (compact ? '#94a3b8' : '#4a5568') : (compact ? '#475569' : '#a0aec0'),
                    border: compact ? '1px solid #475569' : '1px solid #e2e8f0',
                    borderRadius: compact ? '3px' : '4px',
                    cursor: lastTradePPts ? 'pointer' : 'not-allowed',
                    textTransform: 'uppercase',
                    letterSpacing: '0.025em'
                  }}
                  title={lastTradePPts ? `Last: ${(lastTradePPts / 100_000).toFixed(2)}%` : 'No last trade'}
                >
                  Last
                </button>
              </div>
            </div>

            {/* Right: Max Cost */}
            <div>
              <label style={{ 
                display: 'block', 
                marginBottom: '0.375rem', 
                fontSize: compact ? '0.6875rem' : '0.8125rem', 
                fontWeight: 600, 
                color: compact ? '#cbd5e1' : '#2d3748' 
              }}>
                Max cost (£)
              </label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                min="0.01"
                step="0.01"
                required
                style={{
                  width: '100%',
                  padding: inputPadding,
                  border: compact ? '1px solid #374151' : '1px solid #cbd5e0',
                  borderRadius: compact ? '4px' : '5px',
                  fontSize: compact ? '0.875rem' : '0.9375rem',
                  boxSizing: 'border-box',
                  background: compact ? '#0f1419' : 'white',
                  color: compact ? '#e4e8eb' : '#2d3748',
                  fontWeight: 500
                }}
              />
              
              {/* Quick amount buttons */}
              {wallet && (
                <div style={{ display: 'flex', gap: compact ? '0.25rem' : '0.375rem', marginTop: '0.375rem', flexWrap: 'wrap' }}>
                  {[5, 10, 25, 50].map(amt => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setAmount(amt.toFixed(2))}
                      style={{
                        flex: compact ? '1 1 calc(25% - 0.1875rem)' : '1',
                        padding: compact ? '0.25rem' : '0.375rem',
                        fontSize: compact ? '0.625rem' : '0.6875rem',
                        fontWeight: 600,
                        background: compact ? '#374151' : '#edf2f7',
                        color: compact ? '#94a3b8' : '#4a5568',
                        border: compact ? '1px solid #475569' : '1px solid #e2e8f0',
                        borderRadius: compact ? '3px' : '4px',
                        cursor: 'pointer'
                      }}
                    >
                      £{amt}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      const maxAmount = (wallet.balance / 100) * 0.95; // Use 95% of balance
                      setAmount(maxAmount.toFixed(2));
                    }}
                    style={{
                      flex: compact ? '1 1 100%' : '1',
                      padding: compact ? '0.25rem' : '0.375rem',
                      fontSize: compact ? '0.625rem' : '0.6875rem',
                      fontWeight: 700,
                      background: '#667eea',
                      color: 'white',
                      border: 'none',
                      borderRadius: compact ? '3px' : '4px',
                      cursor: 'pointer',
                      marginTop: compact ? '0.25rem' : 0
                    }}
                  >
                    MAX
                  </button>
                </div>
              )}

              <div style={{ 
                fontSize: compact ? '0.625rem' : '0.6875rem', 
                color: compact ? '#64748b' : '#718096', 
                marginTop: '0.375rem',
                fontStyle: 'italic'
              }}>
                {side === 'FOR' 
                  ? 'You pay this now. If YES loses, you lose this.' 
                  : 'You pay this now. If NO loses, you lose this.'}
              </div>
            </div>
          </div>
        ) : (
          // MARKET MODE: Show market info card
          <div style={{ 
            marginBottom: compact ? '0.75rem' : '1rem',
            padding: compact ? '0.625rem' : '0.875rem',
            background: compact ? '#1a1f2e' : '#f7fafc',
            border: compact ? '1px solid #374151' : '1px solid #e2e8f0',
            borderRadius: compact ? '4px' : '6px'
          }}>
            <div style={{ 
              fontSize: compact ? '0.6875rem' : '0.8125rem', 
              fontWeight: 600, 
              color: compact ? '#cbd5e1' : '#2d3748',
              marginBottom: '0.5rem'
            }}>
              Market Order
            </div>
            
            {marketYesPPts ? (
              <>
                <div style={{ 
                  fontSize: compact ? '0.625rem' : '0.75rem', 
                  color: compact ? '#94a3b8' : '#4a5568',
                  marginBottom: '0.375rem'
                }}>
                  {side === 'FOR' 
                    ? 'Takes liquidity from LAY asks (best ask)' 
                    : 'Takes liquidity from FOR bids (best bid)'}
                </div>
                <div style={{ 
                  fontSize: compact ? '0.875rem' : '1rem', 
                  fontWeight: 700, 
                  color: compact ? '#e4e8eb' : '#2d3748',
                  marginBottom: '0.5rem'
                }}>
                  Est. price: {(marketYesPPts / 100_000).toFixed(2)}% YES
                </div>
                
                {/* Max Cost input for market orders */}
                <div style={{ marginTop: '0.625rem' }}>
                  <label style={{ 
                    display: 'block', 
                    marginBottom: '0.375rem', 
                    fontSize: compact ? '0.6875rem' : '0.8125rem', 
                    fontWeight: 600, 
                    color: compact ? '#cbd5e1' : '#2d3748' 
                  }}>
                    Max cost (£)
                  </label>
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    min="0.01"
                    step="0.01"
                    required
                    style={{
                      width: '100%',
                      padding: inputPadding,
                      border: compact ? '1px solid #374151' : '1px solid #cbd5e0',
                      borderRadius: compact ? '4px' : '5px',
                      fontSize: compact ? '0.875rem' : '0.9375rem',
                      boxSizing: 'border-box',
                      background: compact ? '#0f1419' : 'white',
                      color: compact ? '#e4e8eb' : '#2d3748',
                      fontWeight: 500
                    }}
                  />
                  
                  {/* Quick amount buttons */}
                  {wallet && (
                    <div style={{ display: 'flex', gap: compact ? '0.25rem' : '0.375rem', marginTop: '0.375rem', flexWrap: 'wrap' }}>
                      {[5, 10, 25, 50].map(amt => (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => setAmount(amt.toFixed(2))}
                          style={{
                            flex: compact ? '1 1 calc(25% - 0.1875rem)' : '1',
                            padding: compact ? '0.25rem' : '0.375rem',
                            fontSize: compact ? '0.625rem' : '0.6875rem',
                            fontWeight: 600,
                            background: compact ? '#374151' : '#edf2f7',
                            color: compact ? '#94a3b8' : '#4a5568',
                            border: compact ? '1px solid #475569' : '1px solid #e2e8f0',
                            borderRadius: compact ? '3px' : '4px',
                            cursor: 'pointer'
                          }}
                        >
                          £{amt}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          const maxAmount = (wallet.balance / 100) * 0.95;
                          setAmount(maxAmount.toFixed(2));
                        }}
                        style={{
                          flex: compact ? '1 1 100%' : '1',
                          padding: compact ? '0.25rem' : '0.375rem',
                          fontSize: compact ? '0.625rem' : '0.6875rem',
                          fontWeight: 700,
                          background: '#667eea',
                          color: 'white',
                          border: 'none',
                          borderRadius: compact ? '3px' : '4px',
                          cursor: 'pointer',
                          marginTop: compact ? '0.25rem' : 0
                        }}
                      >
                        MAX
                      </button>
                    </div>
                  )}
                </div>
                
                <div style={{ 
                  fontSize: compact ? '0.5625rem' : '0.625rem', 
                  color: compact ? '#fbbf24' : '#d97706',
                  marginTop: '0.5rem',
                  fontWeight: 500
                }}>
                  ⚠️ Executes immediately at best available price (IOC)
                </div>
              </>
            ) : (
              <div style={{ 
                fontSize: compact ? '0.625rem' : '0.75rem', 
                color: compact ? '#ef4444' : '#e53e3e',
                fontStyle: 'italic'
              }}>
                No market liquidity available
              </div>
            )}
          </div>
        )}

        {/* Summary Card: Clear risk/reward */}
        <div style={{ 
          padding: compact ? '0.625rem' : '0.875rem',
          background: compact ? '#0f1419' : '#f7fafc',
          border: compact ? '1px solid #374151' : '1px solid #e2e8f0',
          borderRadius: compact ? '4px' : '6px',
          marginBottom: compact ? '0.625rem' : '0.875rem'
        }}>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            marginBottom: compact ? '0.5rem' : '0.625rem',
            alignItems: 'baseline'
          }}>
            <span style={{ 
              fontSize: compact ? '0.6875rem' : '0.8125rem', 
              fontWeight: 600,
              color: compact ? '#94a3b8' : '#4a5568' 
            }}>
              You risk (Max loss):
            </span>
            <span style={{ 
              fontSize: compact ? '0.875rem' : '1.0625rem', 
              fontWeight: 700, 
              color: compact ? '#fbbf24' : '#d97706' 
            }}>
              £{maxLoss.toFixed(2)}
            </span>
          </div>
          
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            marginBottom: compact ? '0.5rem' : '0.625rem',
            alignItems: 'baseline'
          }}>
            <span style={{ 
              fontSize: compact ? '0.6875rem' : '0.8125rem', 
              fontWeight: 600,
              color: compact ? '#94a3b8' : '#4a5568' 
            }}>
              If correct you win:
            </span>
            <span style={{ 
              fontSize: compact ? '0.875rem' : '1.0625rem', 
              fontWeight: 700, 
              color: compact ? '#10b981' : '#38a169' 
            }}>
              £{potentialProfit.toFixed(2)}
            </span>
          </div>
          
          <div style={{ 
            height: '1px', 
            background: compact ? '#374151' : '#e2e8f0', 
            margin: compact ? '0.5rem 0' : '0.625rem 0' 
          }} />
          
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between',
            fontSize: compact ? '0.625rem' : '0.6875rem',
            color: compact ? '#64748b' : '#718096'
          }}>
            <span>Est. contracts: {contracts}</span>
            <span>Fee: £{(feePence / 100).toFixed(2)}</span>
          </div>
        </div>

        {wallet && (
          <div style={{ 
            fontSize: compact ? '0.625rem' : '0.75rem', 
            color: compact ? '#64748b' : '#718096', 
            marginBottom: compact ? '0.625rem' : '0.75rem',
            textAlign: 'center'
          }}>
            Available: £{wallet.balance.toFixed(2)}
          </div>
        )}

        <button
          type="submit"
          disabled={!wallet || (orderType === 'MARKET' && !marketYesPPts)}
          style={{
            width: '100%',
            padding: compact ? '0.625rem' : '0.875rem',
            background: wallet && (orderType === 'LIMIT' || marketYesPPts)
              ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' 
              : (compact ? '#1e293b' : '#cbd5e0'),
            color: wallet && (orderType === 'LIMIT' || marketYesPPts) ? 'white' : (compact ? '#475569' : '#a0aec0'),
            border: 'none',
            borderRadius: compact ? '4px' : '6px',
            fontSize: compact ? '0.8125rem' : '1rem',
            fontWeight: 700,
            cursor: wallet && (orderType === 'LIMIT' || marketYesPPts) ? 'pointer' : 'not-allowed',
            transition: 'all 0.2s',
            textTransform: 'uppercase',
            letterSpacing: '0.05em'
          }}
        >
          {orderType === 'MARKET' ? 'Place Market Order' : 'Place Limit Order'}
        </button>
      </Form>
    </div>
  );
}
