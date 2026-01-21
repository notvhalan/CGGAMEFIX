import { Link } from "@remix-run/react";

export default function HowItWorks() {
  return (
    <div style={{ minHeight: '100vh', background: '#f7fafc' }}>
      <nav style={{ 
        padding: '1rem 2rem', 
        background: 'white', 
        borderBottom: '1px solid #e2e8f0',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <Link to="/" style={{ color: '#667eea', fontSize: '1.5rem', fontWeight: 700, textDecoration: 'none' }}>
          Betting Exchange
        </Link>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <Link to="/markets" style={{ color: '#4a5568', textDecoration: 'none' }}>Markets</Link>
          <Link to="/fees" style={{ color: '#4a5568', textDecoration: 'none' }}>Fees</Link>
          <Link to="/auth/login" style={{ color: '#667eea', textDecoration: 'none', fontWeight: 600 }}>Log In</Link>
        </div>
      </nav>

      <main style={{ maxWidth: '800px', margin: '0 auto', padding: '3rem 2rem' }}>
        <h1 style={{ fontSize: '2.5rem', fontWeight: 700, marginBottom: '2rem', color: '#1a202c' }}>
          How It Works
        </h1>

        <section style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.75rem', fontWeight: 600, marginBottom: '1rem', color: '#2d3748' }}>
            What is a Betting Exchange?
          </h2>
          <p style={{ color: '#4a5568', lineHeight: 1.6, marginBottom: '1rem' }}>
            A betting exchange is a peer-to-peer marketplace where you can bet directly against other users,
            instead of against a bookmaker. This typically results in better odds and more flexibility.
          </p>
        </section>

        <section style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.75rem', fontWeight: 600, marginBottom: '1rem', color: '#2d3748' }}>
            Back vs Lay
          </h2>
          <div style={{ background: 'white', padding: '1.5rem', borderRadius: '8px', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem', color: '#667eea' }}>
              Back (Bet For)
            </h3>
            <p style={{ color: '#4a5568', lineHeight: 1.6 }}>
              Backing means betting that something will happen. This is like traditional betting.
              If your selection wins, you profit. If it loses, you lose your stake.
            </p>
          </div>
          <div style={{ background: 'white', padding: '1.5rem', borderRadius: '8px' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem', color: '#e53e3e' }}>
              Lay (Bet Against)
            </h3>
            <p style={{ color: '#4a5568', lineHeight: 1.6 }}>
              Laying means betting that something won't happen. You act as the bookmaker.
              If your selection loses, you profit. If it wins, you pay out the backer.
            </p>
          </div>
        </section>

        <section style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.75rem', fontWeight: 600, marginBottom: '1rem', color: '#2d3748' }}>
            How Orders Work
          </h2>
          <ol style={{ color: '#4a5568', lineHeight: 1.8, paddingLeft: '1.5rem' }}>
            <li>Place your order with the odds and stake you want</li>
            <li>Your order goes into the orderbook</li>
            <li>When someone matches your order, the bet is confirmed</li>
            <li>After the market settles, winnings are automatically distributed</li>
          </ol>
        </section>

        <Link
          to="/markets"
          style={{
            display: 'inline-block',
            padding: '1rem 2rem',
            background: '#667eea',
            color: 'white',
            borderRadius: '8px',
            textDecoration: 'none',
            fontWeight: 600,
          }}
        >
          Start Trading
        </Link>
      </main>
    </div>
  );
}
