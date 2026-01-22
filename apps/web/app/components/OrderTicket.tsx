import { Form } from "@remix-run/react";
import { useState } from "react";
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
  compact?: boolean;
}

export function OrderTicket({ marketId, wallet, selectedPrice, compact = false }: OrderTicketProps) {
  const [side, setSide] = useState<'FOR' | 'LAY'>('FOR');
  const [probability, setProbability] = useState('50.00'); // Percentage 0-100
  const [amount, setAmount] = useState('10.00'); // Pounds (stake for FOR, liability for LAY)

  // Auto-fill price when clicked from orderbook
  if (selectedPrice && selectedPrice !== percentageToPPts(parseFloat(probability))) {
    const pricePercent = (selectedPrice / 100_000).toFixed(2);
    setProbability(pricePercent);
  }

  // Calculate contracts and outcomes
  const amountValue = parseFloat(amount);
  const probValue = parseFloat(probability) / 100; // Convert to 0-1
  const pPts = percentageToPPts(parseFloat(probability));
  const amountPence = Math.round(amountValue * 100);
  
  let yesPts: number;
  let contractsMicros: number;
  let costPence: number;
  let feePence: number;
  let potentialProfit: number;
  let maxLoss: number;
  
  if (side === 'FOR') {
    // FOR: user inputs YES probability and stake
    yesPts = pPts;
    contractsMicros = stakeToContracts(amountPence, yesPts);
    costPence = amountPence; // Cost is the stake
    feePence = calculateTakerFee(costPence);
    
    // If YES wins: get £1 per contract, profit = payout - stake - fee
    const payoutPence = (contractsMicros * CONTRACT_PAYOUT_PENCE) / CONTRACT_SCALE;
    potentialProfit = (payoutPence / 100) - amountValue - (feePence / 100);
    maxLoss = amountValue; // Lose the stake
  } else {
    // LAY: user inputs NO probability and liability
    const qPts = pPts; // User enters NO probability
    yesPts = PRICE_SCALE - qPts;
    contractsMicros = liabilityToContracts(amountPence, yesPts);
    costPence = contractsCost(contractsMicros, yesPts);
    feePence = calculateTakerFee(costPence);
    
    // If NO wins (YES loses): collect the cost - fee
    potentialProfit = (costPence / 100) - (feePence / 100);
    maxLoss = amountValue; // Lose the liability
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

  const buttonSize = compact ? '0.5rem' : '0.75rem';
  const inputPadding = compact ? '0.5rem' : '0.75rem';

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
        <input type="hidden" name="pPts" value={pPts} />
        <input type="hidden" name="liabilityPence" value={amountPence} />

        {/* Side Selection */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '1rem' }}>
          <button
            type="button"
            onClick={() => setSide('FOR')}
            style={{
              padding: '0.75rem',
              background: side === 'FOR' ? 'linear-gradient(135deg, #48bb78 0%, #38a169 100%)' : '#e2e8f0',
              color: side === 'FOR' ? 'white' : '#4a5568',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            FOR (Back YES)
          </button>
          <button
            type="button"
            onClick={() => setSide('LAY')}
            style={{
              padding: '0.75rem',
              background: side === 'LAY' ? 'linear-gradient(135deg, #e53e3e 0%, #c53030 100%)' : '#e2e8f0',
              color: side === 'LAY' ? 'white' : '#4a5568',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            LAY (Back NO)
          </button>
        </div>

        {/* Probability */}
        <div style={{ marginBottom: compact ? '0.75rem' : '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.375rem', fontSize: compact ? '0.6875rem' : '0.875rem', fontWeight: 500, color: compact ? '#94a3b8' : 'inherit' }}>
            {side === 'FOR' ? (compact ? 'Price (YES %)' : 'Probability (YES %)') : (compact ? 'Price (NO %)' : 'Probability (NO %)')}
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
              borderRadius: compact ? '4px' : '6px',
              fontSize: compact ? '0.875rem' : '1rem',
              boxSizing: 'border-box',
              background: compact ? '#0f1419' : 'white',
              color: compact ? '#e4e8eb' : 'inherit'
            }}
          />
          {/* Price step buttons */}
          {compact && (
            <div style={{ display: 'flex', gap: '0.25rem', marginTop: '0.375rem' }}>
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
                    padding: '0.25rem',
                    fontSize: '0.625rem',
                    fontWeight: 600,
                    background: '#374151',
                    color: step > 0 ? '#10b981' : '#ef4444',
                    border: 'none',
                    borderRadius: '3px',
                    cursor: 'pointer'
                  }}
                >
                  {step > 0 ? '+' : ''}{step}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Stake or Liability */}
        <div style={{ marginBottom: compact ? '0.75rem' : '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.375rem', fontSize: compact ? '0.6875rem' : '0.875rem', fontWeight: 500, color: compact ? '#94a3b8' : 'inherit' }}>
            {side === 'FOR' ? 'Stake (£)' : 'Liability (£)'}
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
              borderRadius: compact ? '4px' : '6px',
              fontSize: compact ? '0.875rem' : '1rem',
              boxSizing: 'border-box',
              background: compact ? '#0f1419' : 'white',
              color: compact ? '#e4e8eb' : 'inherit'
            }}
          />
          {/* Quick amount buttons */}
          {compact && wallet && (
            <div style={{ display: 'flex', gap: '0.25rem', marginTop: '0.375rem' }}>
              {[5, 10, 25, 50].map(amt => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => setAmount(amt.toFixed(2))}
                  style={{
                    flex: 1,
                    padding: '0.25rem',
                    fontSize: '0.625rem',
                    fontWeight: 600,
                    background: '#374151',
                    color: '#94a3b8',
                    border: 'none',
                    borderRadius: '3px',
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
                  flex: 1,
                  padding: '0.25rem',
                  fontSize: '0.625rem',
                  fontWeight: 600,
                  background: '#667eea',
                  color: 'white',
                  border: 'none',
                  borderRadius: '3px',
                  cursor: 'pointer'
                }}
              >
                MAX
              </button>
            </div>
          )}
        </div>

        {/* Contracts Preview */}
        <div style={{ 
          padding: '0.75rem', 
          background: '#f7fafc', 
          border: '1px solid #e2e8f0',
          borderRadius: '6px', 
          marginBottom: '1rem',
          fontSize: '0.875rem'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <span style={{ color: '#4a5568' }}>Contracts:</span>
            <span style={{ fontWeight: 700, color: '#2d3748' }}>{contracts}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <span style={{ color: '#4a5568' }}>Fee (0.1%):</span>
            <span style={{ fontWeight: 600, color: '#718096' }}>£{(feePence / 100).toFixed(2)}</span>
          </div>
          <div style={{ height: '1px', background: '#e2e8f0', margin: '0.5rem 0' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <span style={{ color: '#4a5568' }}>Potential Profit:</span>
            <span style={{ fontWeight: 700, color: '#22543d' }}>£{potentialProfit.toFixed(2)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#4a5568' }}>Max Loss:</span>
            <span style={{ fontWeight: 700, color: '#742a2a' }}>£{maxLoss.toFixed(2)}</span>
          </div>
        </div>

        {wallet && (
          <div style={{ fontSize: '0.875rem', color: '#718096', marginBottom: '1rem' }}>
            Available: £{(wallet.balance / 100).toFixed(2)}
          </div>
        )}

        <button
          type="submit"
          disabled={!wallet}
          style={{
            width: '100%',
            padding: '0.75rem',
            background: wallet ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : '#cbd5e0',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '1rem',
            fontWeight: 600,
            cursor: wallet ? 'pointer' : 'not-allowed',
            transition: 'all 0.2s',
          }}
        >
          Place Order
        </button>
      </Form>
    </div>
  );
}
