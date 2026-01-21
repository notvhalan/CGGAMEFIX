import { formatMoney } from '~/lib/format';

interface WalletPanelProps {
  wallet: any;
}

export function WalletPanel({ wallet }: WalletPanelProps) {
  if (!wallet) {
    return null;
  }

  return (
    <div style={{ 
      background: 'white', 
      padding: '1rem', 
      borderRadius: '8px', 
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      marginBottom: '1rem'
    }}>
      <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem', color: '#718096' }}>
        Wallet
      </h3>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
        <span style={{ fontSize: '0.875rem', color: '#4a5568' }}>Available:</span>
        <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>
          {formatMoney(wallet.balance, wallet.currency)}
        </span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '0.875rem', color: '#4a5568' }}>Locked:</span>
        <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#e53e3e' }}>
          {formatMoney(wallet.lockedBalance, wallet.currency)}
        </span>
      </div>
    </div>
  );
}
