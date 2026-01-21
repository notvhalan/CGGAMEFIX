import { Form } from "@remix-run/react";
import { useState } from "react";

interface OrderTicketProps {
  marketId: string;
  wallet: any;
}

export function OrderTicket({ marketId, wallet }: OrderTicketProps) {
  const [side, setSide] = useState<'BACK' | 'LAY'>('BACK');
  const [odds, setOdds] = useState('2.00');
  const [stake, setStake] = useState('10.00');

  const potentialReturn = side === 'BACK' 
    ? (parseFloat(stake) * parseFloat(odds)).toFixed(2)
    : (parseFloat(stake) * (parseFloat(odds) - 1)).toFixed(2);

  return (
    <div style={{ background: 'white', padding: '1rem', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
      <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem' }}>Place Order</h3>

      {!wallet && (
        <div style={{ 
          padding: '1rem', 
          background: '#fef5e7', 
          color: '#b7791f', 
          borderRadius: '6px', 
          marginBottom: '1rem',
          fontSize: '0.875rem'
        }}>
          Please log in to place orders
        </div>
      )}

      <Form method="post">
        <input type="hidden" name="marketId" value={marketId} />
        <input type="hidden" name="side" value={side} />

        {/* Side Selection */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '1rem' }}>
          <button
            type="button"
            onClick={() => setSide('BACK')}
            style={{
              padding: '0.75rem',
              background: side === 'BACK' ? '#48bb78' : '#e2e8f0',
              color: side === 'BACK' ? 'white' : '#4a5568',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Back (For)
          </button>
          <button
            type="button"
            onClick={() => setSide('LAY')}
            style={{
              padding: '0.75rem',
              background: side === 'LAY' ? '#e53e3e' : '#e2e8f0',
              color: side === 'LAY' ? 'white' : '#4a5568',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Lay (Against)
          </button>
        </div>

        {/* Odds */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>
            Odds
          </label>
          <input
            type="number"
            name="odds"
            value={odds}
            onChange={(e) => setOdds(e.target.value)}
            min="1.01"
            step="0.01"
            required
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #cbd5e0',
              borderRadius: '6px',
              fontSize: '1rem',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Stake */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>
            Stake ($)
          </label>
          <input
            type="number"
            name="stake"
            value={stake}
            onChange={(e) => setStake(e.target.value)}
            min="0.01"
            step="0.01"
            required
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #cbd5e0',
              borderRadius: '6px',
              fontSize: '1rem',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Potential Return */}
        <div style={{ 
          padding: '0.75rem', 
          background: '#edf2f7', 
          borderRadius: '6px', 
          marginBottom: '1rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span style={{ fontSize: '0.875rem', color: '#4a5568' }}>
            {side === 'BACK' ? 'Potential Win' : 'Liability'}:
          </span>
          <span style={{ fontWeight: 700, color: '#1a202c' }}>${potentialReturn}</span>
        </div>

        {wallet && (
          <div style={{ fontSize: '0.875rem', color: '#718096', marginBottom: '1rem' }}>
            Available: ${wallet.balance.toFixed(2)}
          </div>
        )}

        <button
          type="submit"
          disabled={!wallet}
          style={{
            width: '100%',
            padding: '0.75rem',
            background: wallet ? '#667eea' : '#cbd5e0',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '1rem',
            fontWeight: 600,
            cursor: wallet ? 'pointer' : 'not-allowed',
          }}
        >
          Place Order
        </button>
      </Form>
    </div>
  );
}
