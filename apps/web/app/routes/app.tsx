/*
 * GAMEFIX EXCHANGE - APP LAYOUT (Refactored & Modular)
 */

import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { Outlet, Link, useLoaderData, useLocation } from "@remix-run/react";
import { requireUser } from "~/lib/auth.server";
import { getWallet, getMarkets } from "~/lib/api.server";
import { useState } from "react";
import { NavItem, MobileNavItem } from "~/components/layout/NavItem";
import { WalletChip } from "~/components/layout/WalletChip";
import { SearchBar } from "~/components/layout/SearchBar";
import { UserMenu } from "~/components/layout/UserMenu";
import { DashboardNav } from "~/components/layout/DashboardNav";
import "~/styles/theme.css";
import "~/styles/layouts/app-layout.css";
import "~/styles/components/header.css";
import "~/styles/components/wallet-chip.css";
import "~/styles/components/dashboard-nav.css";

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request);
  
  // Fetch real wallet balance and markets from API
  let wallet = {
    availablePence: 0,
    reservedPence: 0,
    equityPence: 0
  };
  let markets: any[] = [];
  
  try {
    const [walletData, marketsData] = await Promise.all([
      getWallet(request),
      getMarkets()
    ]);
    
    wallet = {
      availablePence: walletData.balance || 0,
      reservedPence: walletData.lockedBalance || 0,
      equityPence: (walletData.balance || 0) + (walletData.lockedBalance || 0)
    };
    
    markets = marketsData.markets || [];
  } catch (error) {
    console.error('Failed to fetch data:', error);
  }
  
  return json({ user, wallet, markets });
}

export default function AppLayout() {
  const { user, wallet, markets } = useLoaderData<typeof loader>();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isTerminal = 
    location.pathname.startsWith('/app/markets') ||
    location.pathname === '/app/orders' ||
    location.pathname === '/app/positions' ||
    location.pathname === '/app/trades';

  console.log('Current pathname:', location.pathname, 'isTerminal:', isTerminal);

  // Always use compact/terminal styling for consistent padding
  const headerHeight = 48;

  return (
    <div className="layout-container">
      {/* Header */}
      <header className="header header-terminal">
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="mobile-menu-btn"
          aria-label="Toggle menu"
        >
          ☰
        </button>

        <div className="dashboard-nav-container">
          <Link to="/app" className="logo logo-terminal">
            🎮 GameFix
          </Link>
          
          <DashboardNav />
          
          <Link
            to="/app/markets"
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
        </div>

        <SearchBar compact={isTerminal} markets={markets} />

        <div style={{ flex: 1 }} className="spacer" />

        <WalletChip
          availablePence={wallet.availablePence}
          reservedPence={wallet.reservedPence}
          equityPence={wallet.equityPence}
          compact={true}
        />

        <div className="ws-status">
          <span className="ws-status-dot" />
          <span>Live</span>
        </div>

        <Link
          to="/app/wallet"
          style={{
            padding: '0.5rem 0.875rem',
            background: '#1f6feb',
            color: 'white',
            borderRadius: '6px',
            textDecoration: 'none',
            fontSize: '0.8125rem',
            fontWeight: 600,
            transition: 'background 0.2s',
            whiteSpace: 'nowrap'
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = '#388bfd'}
          onMouseLeave={(e) => e.currentTarget.style.background = '#1f6feb'}
        >
          💰 Deposit
        </Link>

        <UserMenu user={user} compact={true} />
      </header>

      <div style={{ display: 'flex', flex: 1 }}>
        {/* Sidebar */}
        <aside 
          className={`sidebar sidebar-terminal ${mobileMenuOpen ? 'sidebar-open' : ''}`}
        >
          <nav style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            gap: '0.25rem',
            height: '100%',
            padding: '0.25rem 0'
          }}>
            <NavItem to="/app" icon="🏠" label="Dashboard" end compact />
            <NavItem to="/app/markets" icon="📈" label="Markets" compact />
            <NavItem to="/app/positions" icon="📊" label="Positions" compact />
            <NavItem to="/app/orders" icon="📋" label="Orders" compact />
            <NavItem to="/app/trades" icon="🔄" label="Trades" compact />
            <NavItem to="/app/wallet" icon="💰" label="Wallet" compact />
            <div style={{ height: '2rem' }} />
            <NavItem to="/app/settings" icon="⚙️" label="Settings" compact />
            <div style={{ flex: 1 }} />
          </nav>
        </aside>

        {/* Main Content */}
        <main className="main-content main-content-terminal">
          <Outlet />
        </main>
      </div>

      {/* Mobile Bottom Nav */}
      <nav className="mobile-bottom-nav">
        <div className="mobile-bottom-nav-grid">
          <MobileNavItem to="/app/markets" icon="📈" label="Markets" />
          <MobileNavItem to="/app/positions" icon="📊" label="Positions" />
          <MobileNavItem to="/app/orders" icon="📋" label="Orders" />
          <MobileNavItem to="/app/wallet" icon="💰" label="Wallet" />
        </div>
      </nav>

      <style>{`
        .layout-container {
          --header-height: ${headerHeight}px;
        }
      `}</style>
    </div>
  );
}
