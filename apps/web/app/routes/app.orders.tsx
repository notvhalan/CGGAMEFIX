export default function Orders() {
  return (
    <div>
      <h1 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '1rem', color: '#1a202c' }}>
        My Orders
      </h1>

      <div style={{ background: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: '1rem' }}>
          <button style={{ padding: '0.5rem 1rem', background: '#667eea', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}>
            Open
          </button>
          <button style={{ padding: '0.5rem 1rem', background: 'transparent', color: '#718096', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}>
            Matched
          </button>
          <button style={{ padding: '0.5rem 1rem', background: 'transparent', color: '#718096', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}>
            Cancelled
          </button>
        </div>
        <div style={{ padding: '3rem', textAlign: 'center', color: '#a0aec0' }}>
          No open orders
        </div>
      </div>
    </div>
  );
}
