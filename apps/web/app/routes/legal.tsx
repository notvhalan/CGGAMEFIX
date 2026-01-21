import { Link } from "@remix-run/react";

export default function Legal() {
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
        <Link to="/markets" style={{ color: '#4a5568', textDecoration: 'none' }}>Markets</Link>
      </nav>

      <main style={{ maxWidth: '800px', margin: '0 auto', padding: '3rem 2rem' }}>
        <h1 style={{ fontSize: '2.5rem', fontWeight: 700, marginBottom: '2rem', color: '#1a202c' }}>
          Legal & Terms
        </h1>

        <section style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '1rem', color: '#2d3748' }}>
            Terms of Service
          </h2>
          <p style={{ color: '#4a5568', lineHeight: 1.6 }}>
            This is a demo application. In production, full terms of service would be displayed here.
          </p>
        </section>

        <section style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '1rem', color: '#2d3748' }}>
            Privacy Policy
          </h2>
          <p style={{ color: '#4a5568', lineHeight: 1.6 }}>
            Privacy policy and data handling information would be displayed here.
          </p>
        </section>

        <section>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '1rem', color: '#2d3748' }}>
            Responsible Gambling
          </h2>
          <p style={{ color: '#4a5568', lineHeight: 1.6 }}>
            Gambling should be entertainment. Please bet responsibly.
          </p>
        </section>
      </main>
    </div>
  );
}
