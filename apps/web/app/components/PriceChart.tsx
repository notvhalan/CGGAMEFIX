export function PriceChart() {
  return (
    <div style={{ 
      background: 'white', 
      padding: '1rem', 
      borderRadius: '8px', 
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      height: '300px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      <div style={{ textAlign: 'center', color: '#a0aec0' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📈</div>
        <div style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem' }}>Price Chart</div>
        <div style={{ fontSize: '0.875rem' }}>
          Chart visualization would be implemented here
        </div>
        <div style={{ fontSize: '0.75rem', marginTop: '0.5rem', color: '#cbd5e0' }}>
          (Consider using Recharts, Chart.js, or similar library)
        </div>
      </div>
    </div>
  );
}
