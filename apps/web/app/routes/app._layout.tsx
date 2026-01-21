/*
 * GAMEFIX EXCHANGE - APP LAYOUT
 * 
 * Navigation Structure:
 * ├── / (Landing) → Public
 * ├── /auth/login → Google OAuth
 * └── /app/* (Protected) → Dashboard & Trading
 *     ├── /app (Dashboard)
 *     ├── /app/wallet
 *     ├── /app/orders
 *     ├── /app/positions
 *     ├── /app/trades
 *     ├── /app/settings (5 tabs)
 *     └── /markets (Browse markets)
 */

import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { Outlet, Link, useLoaderData, Form, useNavigate } from "@remix-run/react";
import { requireUser } from "~/lib/auth.server";
import { NavLink } from "~/components/NavLink";
import { useState } from "react";

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request);
  return json({ user });
}

export default function AppLayout() {
  const { user } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/markets?search=${encodeURIComponent(searchQuery)}`);
      setSearchQuery('');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: '#f8fafc' }}>
      {/* Top Bar */}
      <header style={{
        background: 'white',
        borderBottom: '1px solid #e2e8f0',
        padding: '0 1.5rem',
        height: '64px',
        display: 'flex',
        alignItems: 'center',
        gap: '1.5rem',
        position: 'sticky',
        top: 0,
        zIndex: 50
      }}>
        {/* Mobile Menu Button */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          style={{
            display: 'none',
            background: 'none',
            border: 'none',
            fontSize: '1.5rem',
            cursor: 'pointer',
            padding: '0.5rem',
            color: '#64748b'
          }}
          className="mobile-menu-btn"
          aria-label="Toggle menu"
        >
          ☰
        </button>

        {/* Logo */}
        <Link 
          to="/app" 
          style={{ 
            color: '#667eea', 
            fontSize: '1.25rem', 
            fontWeight: 700, 
            textDecoration: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
        >
          🎮 GameFix
        </Link>

        {/* Search Bar */}
        <form onSubmit={handleSearch} style={{ flex: 1, maxWidth: '500px' }}>
          <input
            type="search"
            placeholder="Search markets..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '0.625rem 1rem',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              fontSize: '0.9375rem',
              outline: 'none',
              transition: 'all 0.2s'
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = '#667eea';
              e.currentTarget.style.boxShadow = '0 0 0 3px rgba(102, 126, 234, 0.1)';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = '#e2e8f0';
              e.currentTarget.style.boxShadow = 'none';
            }}
          />
        </form>

        <div style={{ flex: 1 }} className="spacer" />

        {/* Quick Actions */}
        <Link
          to="/markets"
          style={{
            padding: '0.625rem 1rem',
            background: '#667eea',
            color: 'white',
            borderRadius: '8px',
            textDecoration: 'none',
            fontSize: '0.875rem',
            fontWeight: 600,
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#5568d3';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = '#667eea';
          }}
        >
          📈 Markets
        </Link>

        {/* User Menu */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              background: 'none',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              padding: '0.5rem 0.75rem',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#cbd5e0';
              e.currentTarget.style.background = '#f8fafc';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#e2e8f0';
              e.currentTarget.style.background = 'none';
            }}
          >
            {user.avatarUrl ? (
              <img 
                src={user.avatarUrl} 
                alt={user.name || user.email}
                style={{ 
                  width: '32px', 
                  height: '32px', 
                  borderRadius: '50%',
                  objectFit: 'cover'
                }}
              />
            ) : (
              <div style={{ 
                width: '32px', 
                height: '32px', 
                borderRadius: '50%',
                background: '#667eea',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontWeight: 600,
                fontSize: '0.875rem'
              }}>
                {user.name?.[0]?.toUpperCase() || user.email[0]?.toUpperCase()}
              </div>
            )}
            <span style={{ fontSize: '0.875rem', color: '#1e293b', fontWeight: 500 }}>
              {user.name || user.email.split('@')[0]}
            </span>
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>▾</span>
          </button>

          {/* User Dropdown Menu */}
          {userMenuOpen && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 0.5rem)',
                right: 0,
                background: 'white',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
                minWidth: '200px',
                padding: '0.5rem',
                zIndex: 100
              }}
              onClick={() => setUserMenuOpen(false)}
            >
              <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #e2e8f0', marginBottom: '0.5rem' }}>
                <div style={{ fontWeight: 600, fontSize: '0.875rem', color: '#1e293b' }}>
                  {user.name || 'User'}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
                  {user.email}
                </div>
              </div>
              
              <Link
                to="/app/settings"
                style={{
                  display: 'block',
                  padding: '0.625rem 1rem',
                  color: '#64748b',
                  textDecoration: 'none',
                  fontSize: '0.875rem',
                  borderRadius: '6px',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#f8fafc';
                  e.currentTarget.style.color = '#1e293b';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = '#64748b';
                }}
              >
                ⚙️ Settings
              </Link>

              <Form method="post" action="/auth/logout">
                <button
                  type="submit"
                  style={{
                    width: '100%',
                    padding: '0.625rem 1rem',
                    background: 'transparent',
                    color: '#ef4444',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#fef2f2';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  🚪 Log Out
                </button>
              </Form>
            </div>
          )}
        </div>
      </header>

      <div style={{ display: 'flex', flex: 1 }}>
        {/* Sidebar Navigation */}
        <aside 
          style={{ 
            width: '240px', 
            background: 'white', 
            borderRight: '1px solid #e2e8f0',
            padding: '1.5rem 1rem',
            overflowY: 'auto'
          }}
          className={mobileMenuOpen ? 'sidebar-open' : ''}
        >
          <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <NavLink to="/app" icon="🏠" end>Dashboard</NavLink>
            <NavLink to="/app/wallet" icon="💰">Wallet</NavLink>
            <NavLink to="/app/orders" icon="📋">Orders</NavLink>
            <NavLink to="/app/positions" icon="📊">Positions</NavLink>
            <NavLink to="/app/trades" icon="🔄">Trades</NavLink>
            
            <div style={{ 
              height: '1px', 
              background: '#e2e8f0', 
              margin: '1rem 0' 
            }} />
            
            <NavLink to="/markets" icon="📈">Markets</NavLink>
            <NavLink to="/app/settings" icon="⚙️">Settings</NavLink>
          </nav>

          {/* Footer Links */}
          <div style={{ 
            marginTop: 'auto', 
            paddingTop: '1.5rem',
            borderTop: '1px solid #e2e8f0'
          }}>
            <Link
              to="/how-it-works"
              style={{
                display: 'block',
                padding: '0.5rem 1rem',
                color: '#94a3b8',
                textDecoration: 'none',
                fontSize: '0.8125rem',
                borderRadius: '6px',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#f8fafc';
                e.currentTarget.style.color = '#64748b';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = '#94a3b8';
              }}
            >
              📖 How It Works
            </Link>
            <Link
              to="/fees"
              style={{
                display: 'block',
                padding: '0.5rem 1rem',
                color: '#94a3b8',
                textDecoration: 'none',
                fontSize: '0.8125rem',
                borderRadius: '6px',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#f8fafc';
                e.currentTarget.style.color = '#64748b';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = '#94a3b8';
              }}
            >
              💵 Fees
            </Link>
          </div>
        </aside>

        {/* Main Content */}
        <main style={{ 
          flex: 1, 
          padding: '2rem',
          maxWidth: '1400px',
          margin: '0 auto',
          width: '100%'
        }}>
          <Outlet />
        </main>
      </div>

      {/* Mobile Styles */}
      <style>{`
        @media (max-width: 768px) {
          .mobile-menu-btn {
            display: block !important;
          }
          aside {
            position: fixed;
            left: -240px;
            top: 64px;
            height: calc(100vh - 64px);
            z-index: 40;
            transition: left 0.3s ease;
          }
          aside.sidebar-open {
            left: 0;
          }
          .spacer {
            display: none;
          }
        }
      `}</style>
    </div>
  );
}
