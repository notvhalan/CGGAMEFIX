export default function Trades() {
  return (
    <div>
      <h1 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '1rem', color: '#1a202c' }}>
        Trade History
      </h1>

      <div style={{ background: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', padding: '3rem', textAlign: 'center' }}>
        <p style={{ color: '#a0aec0' }}>No trade history</p>
      </div>
    </div>
  );
}
