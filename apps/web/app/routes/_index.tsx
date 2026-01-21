import { Link } from "@remix-run/react";
import type { MetaFunction } from "@remix-run/node";

export const meta: MetaFunction = () => {
  return [
    { title: "Betting Exchange - Peer-to-Peer Betting Platform" },
    { name: "description", content: "Trade on markets with the best odds" },
  ];
};

export default function Index() {
  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
      <nav style={{ padding: '1rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ color: 'white', margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>
          Betting Exchange
        </h1>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <Link to="/markets" style={{ color: 'white', textDecoration: 'none', fontWeight: 500 }}>
            Markets
          </Link>
          <Link to="/how-it-works" style={{ color: 'white', textDecoration: 'none', fontWeight: 500 }}>
            How It Works
          </Link>
          <Link to="/fees" style={{ color: 'white', textDecoration: 'none', fontWeight: 500 }}>
            Fees
          </Link>
          <Link to="/auth/login" style={{ 
            color: 'white', 
            textDecoration: 'none', 
            padding: '0.5rem 1rem', 
            border: '2px solid white', 
            borderRadius: '6px',
            fontWeight: 600
          }}>
            Log In
          </Link>
        </div>
      </nav>

      <main style={{ 
        maxWidth: '1200px', 
        margin: '0 auto', 
        padding: '4rem 2rem', 
        textAlign: 'center',
        color: 'white'
      }}>
        <h2 style={{ fontSize: '3rem', fontWeight: 800, marginBottom: '1rem' }}>
          The Future of Peer-to-Peer Betting
        </h2>
        <p style={{ fontSize: '1.25rem', marginBottom: '2rem', opacity: 0.9 }}>
          Get the best odds by betting directly against other users. No bookmaker margins.
        </p>
        
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginBottom: '4rem' }}>
          <Link
            to="/auth/signup"
            style={{
              padding: '1rem 2rem',
              background: 'white',
              color: '#667eea',
              textDecoration: 'none',
              borderRadius: '8px',
              fontWeight: 700,
              fontSize: '1.1rem',
            }}
          >
            Get Started
          </Link>
          <Link
            to="/markets"
            style={{
              padding: '1rem 2rem',
              background: 'transparent',
              color: 'white',
              textDecoration: 'none',
              borderRadius: '8px',
              fontWeight: 700,
              fontSize: '1.1rem',
              border: '2px solid white',
            }}
          >
            Browse Markets
          </Link>
        </div>

        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '2rem',
          marginTop: '4rem'
        }}>
          <div style={{ padding: '2rem', background: 'rgba(255,255,255,0.1)', borderRadius: '12px' }}>
            <h3 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>🎯 Better Odds</h3>
            <p style={{ opacity: 0.9 }}>
              Trade directly with other users and get significantly better odds than traditional bookmakers
            </p>
          </div>
          <div style={{ padding: '2rem', background: 'rgba(255,255,255,0.1)', borderRadius: '12px' }}>
            <h3 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>⚡ Instant Matching</h3>
            <p style={{ opacity: 0.9 }}>
              Our high-performance matching engine executes trades in milliseconds
            </p>
          </div>
          <div style={{ padding: '2rem', background: 'rgba(255,255,255,0.1)', borderRadius: '12px' }}>
            <h3 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>🔒 Secure & Fair</h3>
            <p style={{ opacity: 0.9 }}>
              Your funds are protected with industry-leading security and transparent settlement
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
