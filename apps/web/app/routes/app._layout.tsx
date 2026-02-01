/*
 * GAMEFIX EXCHANGE - APP LAYOUT (Refactored & Modular)
 */

import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { Outlet, Link, useLoaderData, useLocation } from "@remix-run/react";
import { requireUser } from "~/lib/auth.server";
import { useState } from "react";
import { NavItem, MobileNavItem } from "~/components/layout/NavItem";
import { WalletChip } from "~/components/layout/WalletChip";
import { SearchBar } from "~/components/layout/SearchBar";
import { UserMenu } from "~/components/layout/UserMenu";
import "~/styles/theme.css";
import "~/styles/layouts/app-layout.css";
import "~/styles/components/header.css";
import "~/styles/components/wallet-chip.css";

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request);
  // TODO: Fetch real wallet balance from API
  const wallet = {
    availablePence: 1_000_00,
    reservedPence: 250_00,
    equityPence: 1_250_00
  };
  return json({ user, wallet });
}

export default function AppLayout() {
  const { user, wallet } = useLoaderData<typeof loader>();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isTerminal = 
    location.pathname.startsWith('/markets') ||
    location.pathname === '/app/orders' ||
    location.pathname === '/app/positions' ||
    location.pathname === '/app/trades';

  const headerHeight = isTerminal ? 48 : 64;

  return (
    <div className="layout-container">
      {/* Header */}
      <header className={`header ${isTerminal ? 'header-terminal' : 'header-dashboard'}`}>
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="mobile-menu-btn"
          aria-label="Toggle menu"
        >
          ☰
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Link to="/app" className={`logo ${isTerminal ? 'logo-terminal' : 'logo-dashboard'}`}>
            🎮 GameFix
          </Link>
          
          {!isTerminal && (
            <Link
              to="/markets"
              style={{
                padding: '0.5rem 0.875rem',
                background: '#238636',
                color: 'white',
                borderRadius: '6px',
                textDecoration: 'none',
                fontSize: '0.8125rem',
                fontWeight: 600,
                transition: 'background 0.2s',
                whiteSpace: 'nowrap'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = '#2ea043'}
              onMouseLeave={(e) => e.currentTarget.style.background = '#238636'}
            >
              Trade
            </Link>
          )}
        </div>

        <SearchBar compact={isTerminal} />

        <div style={{ flex: 1 }} className="spacer" />

        <WalletChip
          availablePence={wallet.availablePence}
          reservedPence={wallet.reservedPence}
          equityPence={wallet.equityPence}
          compact={isTerminal}
        />

        <div className="ws-status">
          <span className="ws-status-dot" />
          <span>Live</span>
        </div>

        <Link
          to="/app/wallet"
          style={{
            padding: isTerminal ? '0.5rem 0.875rem' : '0.625rem 1rem',
            background: '#1f6feb',
            color: 'white',
            borderRadius: '6px',
            textDecoration: 'none',
            fontSize: isTerminal ? '0.8125rem' : '0.875rem',
            fontWeight: 600,
            transition: 'background 0.2s',
            whiteSpace: 'nowrap'
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = '#388bfd'}
          onMouseLeave={(e) => e.currentTarget.style.background = '#1f6feb'}
        >
          💰 Deposit
        </Link>

        <UserMenu user={user} compact={isTerminal} />
      </header>

      <div style={{ display: 'flex', flex: 1 }}>
        {/* Sidebar */}
        <aside 
          className={`sidebar ${isTerminal ? 'sidebar-terminal' : 'sidebar-dashboard'} ${mobileMenuOpen ? 'sidebar-open' : ''}`}
        >
          <nav style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            gap: isTerminal ? '0.5rem' : '0.25rem',
            height: '100%'
          }}>
            {isTerminal ? (
              <>
                <NavItem to="/app" icon="🏠" label="Dashboard" end compact />
                <NavItem to="/markets" icon="📈" label="Markets" compact />
                <NavItem to="/app/positions" icon="📊" label="Positions" compact />
                <NavItem to="/app/orders" icon="📋" label="Orders" compact />
                <NavItem to="/app/trades" icon="🔄" label="Trades" compact />
                <NavItem to="/app/wallet" icon="💰" label="Wallet" compact />
                <div style={{ flex: 1 }} />
                <NavItem to="/app/settings" icon="⚙️" label="Settings" compact />
              </>
            ) : (
              <>
                <div className="section-header">Overview</div>
                <NavItem to="/app" icon="🏠" label="Dashboard" end />
                
                <div className="section-header section-header-spaced">Trading</div>
                <NavItem to="/markets" icon="📈" label="Markets" />
                <NavItem to="/app/positions" icon="📊" label="Positions" />
                <NavItem to="/app/orders" icon="📋" label="Orders" />
                <NavItem to="/app/trades" icon="🔄" label="Trades" />
                
                <div className="section-header section-header-spaced">Account</div>
                <NavItem to="/app/wallet" icon="💰" label="Wallet" />
                <NavItem to="/app/settings" icon="⚙️" label="Settings" />

                <div style={{ 
                  marginTop: 'auto', 
                  paddingTop: '1.5rem',
                  borderTop: '1px solid #21262d'
                }}>
                  <Link
                    to="/how-it-works"
                    style={{
                      display: 'block',
                      padding: '0.5rem 1rem',
                      color: '#8b949e',
                      textDecoration: 'none',
                      fontSize: '0.8125rem',
                      borderRadius: '6px',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#21262d';
                      e.currentTarget.style.color = '#c9d1d9';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.color = '#8b949e';
                    }}
                  >
                    📖 How It Works
                  </Link>
                  <Link
                    to="/fees"
                    style={{
                      display: 'block',
                      padding: '0.5rem 1rem',
                      color: '#8b949e',
                      textDecoration: 'none',
                      fontSize: '0.8125rem',
                      borderRadius: '6px',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#21262d';
                      e.currentTarget.style.color = '#c9d1d9';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.color = '#8b949e';
                    }}
                  >
                    💵 Fees
                  </Link>
                </div>
              </>
            )}
          </nav>
        </aside>

        {/* Main Content */}
        <main className={`main-content ${isTerminal ? 'main-content-terminal' : 'main-content-dashboard'}`}>
          <Outlet />
        </main>
      </div>

      {/* Mobile Bottom Nav */}
      {isTerminal && (
        <nav className="mobile-bottom-nav">
          <div className="mobile-bottom-nav-grid">
            <MobileNavItem to="/markets" icon="📈" label="Markets" />
            <MobileNavItem to="/app/positions" icon="📊" label="Positions" />
            <MobileNavItem to="/app/orders" icon="📋" label="Orders" />
            <MobileNavItem to="/app/wallet" icon="💰" label="Wallet" />
          </div>
        </nav>
      )}

      <style>{`
        .layout-container {
          --header-height: ${headerHeight}px;
        }
      `}</style>
    </div>
  );
}
