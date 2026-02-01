import { Link } from "@remix-run/react";

export default function Fees() {
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
          GameFix
        </Link>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <Link to="/markets" style={{ color: '#4a5568', textDecoration: 'none' }}>Markets</Link>
          <Link to="/how-it-works" style={{ color: '#4a5568', textDecoration: 'none' }}>How It Works</Link>
          <Link to="/auth/login" style={{ color: '#667eea', textDecoration: 'none', fontWeight: 600 }}>Log In</Link>
        </div>
      </nav>

      <main style={{ maxWidth: '800px', margin: '0 auto', padding: '3rem 2rem' }}>
        <h1 style={{ fontSize: '2.5rem', fontWeight: 700, marginBottom: '2rem', color: '#1a202c' }}>
          Fees & Charges
        </h1>

        <section style={{ marginBottom: '2rem', background: 'white', padding: '2rem', borderRadius: '8px' }}>
          <h2 style={{ fontSize: '1.75rem', fontWeight: 600, marginBottom: '1rem', color: '#2d3748' }}>
            Commission on Winnings
          </h2>
          <div style={{ fontSize: '2rem', fontWeight: 700, color: '#667eea', marginBottom: '1rem' }}>
            2%
          </div>
          <p style={{ color: '#4a5568', lineHeight: 1.6 }}>
            We only charge commission on your net winnings in each market. If you don't win, you don't pay.
          </p>
        </section>

        <section style={{ marginBottom: '2rem', background: 'white', padding: '2rem', borderRadius: '8px' }}>
          <h2 style={{ fontSize: '1.75rem', fontWeight: 600, marginBottom: '1rem', color: '#2d3748' }}>
            Deposit & Withdrawal
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <h3 style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Deposits</h3>
              <p style={{ color: '#4a5568' }}>Free</p>
            </div>
            <div>
              <h3 style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Withdrawals</h3>
              <p style={{ color: '#4a5568' }}>$2 flat fee</p>
            </div>
          </div>
        </section>

        <section style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.75rem', fontWeight: 600, marginBottom: '1rem', color: '#2d3748' }}>
            Example Calculation
          </h2>
          <div style={{ background: 'white', padding: '1.5rem', borderRadius: '8px', fontFamily: 'monospace' }}>
            <div>Bet Amount: $100</div>
            <div>Odds: 2.50</div>
            <div>Potential Win: $150</div>
            <div>Net Profit: $150</div>
            <div style={{ color: '#e53e3e' }}>Commission (2%): $3</div>
            <div style={{ fontWeight: 700, marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid #e2e8f0' }}>
              Your Total Return: $247
            </div>
          </div>
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
