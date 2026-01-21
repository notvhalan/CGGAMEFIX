import { Link } from "@remix-run/react";

// Use window.ENV if available, otherwise default to localhost
const getApiUrl = () => {
  if (typeof window !== 'undefined' && (window as any).ENV?.API_BASE_URL) {
    return (window as any).ENV.API_BASE_URL;
  }
  return 'http://localhost:3000';
};

export default function Login() {
  const API_BASE_URL = getApiUrl();
  return (
    <div style={{ 
      minHeight: '100vh', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
    }}>
      <div style={{ 
        width: '100%', 
        maxWidth: '400px', 
        padding: '2rem',
        background: 'white',
        borderRadius: '12px',
        boxShadow: '0 10px 25px rgba(0,0,0,0.2)'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <Link to="/" style={{ color: '#667eea', fontSize: '1.75rem', fontWeight: 700, textDecoration: 'none' }}>
            Betting Exchange
          </Link>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 600, marginTop: '1rem', color: '#1a202c' }}>
            Log In
          </h2>
          <p style={{ color: '#718096', fontSize: '0.875rem', marginTop: '0.5rem' }}>
            Sign in with your Google account to continue
          </p>
        </div>

        {/* Google Sign-In Button */}
        <a
          href={`${API_BASE_URL}/v1/auth/google`}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.75rem',
            width: '100%',
            padding: '0.875rem',
            background: 'white',
            color: '#1a202c',
            border: '2px solid #e2e8f0',
            borderRadius: '8px',
            fontSize: '1rem',
            fontWeight: 600,
            textDecoration: 'none',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = '#667eea';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.15)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = '#e2e8f0';
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M19.6 10.227c0-.709-.064-1.39-.182-2.045H10v3.868h5.382a4.6 4.6 0 01-1.996 3.018v2.51h3.232c1.891-1.742 2.982-4.305 2.982-7.35z" fill="#4285F4"/>
            <path d="M10 20c2.7 0 4.964-.895 6.618-2.423l-3.232-2.509c-.895.6-2.04.955-3.386.955-2.605 0-4.81-1.76-5.595-4.123H1.064v2.59A9.996 9.996 0 0010 20z" fill="#34A853"/>
            <path d="M4.405 11.9c-.2-.6-.314-1.24-.314-1.9 0-.66.114-1.3.314-1.9V5.51H1.064A9.996 9.996 0 000 10c0 1.614.386 3.14 1.064 4.49l3.34-2.59z" fill="#FBBC05"/>
            <path d="M10 3.977c1.468 0 2.786.505 3.823 1.496l2.868-2.868C14.959.99 12.695 0 10 0 6.09 0 2.71 2.24 1.064 5.51l3.34 2.59C5.19 5.736 7.395 3.977 10 3.977z" fill="#EA4335"/>
          </svg>
          Continue with Google
        </a>

        <div style={{ 
          margin: '1.5rem 0', 
          textAlign: 'center',
          color: '#a0aec0',
          fontSize: '0.875rem'
        }}>
          You'll be redirected to Google to sign in, then back to your dashboard at /app.
        </div>

        <div style={{ textAlign: 'center', marginTop: '1rem' }}>
          <Link to="/" style={{ color: '#a0aec0', fontSize: '0.9rem', textDecoration: 'none' }}>
            ← Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
