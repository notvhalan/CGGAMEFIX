/*
 * GAMEFIX EXCHANGE - APP LAYOUT (Refactored & Modular)
 */

import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { Outlet, Link, useLoaderData, useLocation } from "@remix-run/react";
import { getAuthenticatedUser } from "~/lib/auth.server";
import { getWallet, getMarkets } from "~/lib/api.server";
import { useState } from "react";
import { Icons } from "~/config/icons";
import { FiActivity, FiDownload, FiTrendingUp } from "react-icons/fi";
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
  // Allow unauthenticated browsing — no redirect
  const user = await getAuthenticatedUser(request);
  
  let wallet = {
    availablePence: 0,
    reservedPence: 0,
    equityPence: 0
  };
  let markets: any[] = [];
  
  try {
    // Only fetch wallet when logged in
    const [walletData, marketsData] = await Promise.all([
      user ? getWallet(request) : Promise.resolve(null),
      getMarkets()
    ]);
    
    if (walletData) {
      wallet = {
        availablePence: (walletData.balance || 0) * 100,
        reservedPence: (walletData.lockedBalance || 0) * 100,
        equityPence: ((walletData.balance || 0) + (walletData.lockedBalance || 0)) * 100
      };
    }
    
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
          <Link to="/app" className="logo logo-terminal" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FiActivity size={18} />
            <span>GameFix</span>
          </Link>
          
          <DashboardNav />
          
          <Link
            to="/app/markets"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
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
            <FiTrendingUp size={16} />
            Trade
          </Link>
        </div>

        <SearchBar compact={isTerminal} markets={markets} />

        <div style={{ flex: 1 }} className="spacer" />

        {user ? (
          <>
            <WalletChip
              availablePence={wallet.availablePence}
              reservedPence={wallet.reservedPence}
              equityPence={wallet.equityPence}
              compact={true}
            />

            <div className="ws-status" style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
              <FiActivity size={14} style={{ color: '#3fb950' }} />
              <span>Live</span>
            </div>

            <Link
              to="/app/wallet"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
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
              <FiDownload size={16} />
              Deposit
            </Link>

            <UserMenu user={user} compact={true} />
          </>
        ) : (
          <Link
            to="/auth/login"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.375rem 0.875rem',
              background: '#238636',
              color: 'white',
              borderRadius: '6px',
              textDecoration: 'none',
              fontSize: '0.8125rem',
              fontWeight: 600,
              transition: 'background 0.2s',
              whiteSpace: 'nowrap',
              border: '1px solid rgba(240,246,252,0.1)'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = '#2ea043'}
            onMouseLeave={(e) => e.currentTarget.style.background = '#238636'}
          >
            Login
          </Link>
        )}
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
            <NavItem to="/app" icon={Icons.home} label="Dashboard" end compact />
            <NavItem to="/app/markets" icon={Icons.markets} label="Markets" compact />
            <NavItem to="/app/insurance" icon={Icons.live} label="Insurance" compact />
            <NavItem to="/app/ladder" icon={Icons.trade} label="Ladder" compact />
            <NavItem to="/app/positions" icon={Icons.positions} label="Positions" compact />
            <NavItem to="/app/orders" icon={Icons.orders} label="Orders" compact />
            <NavItem to="/app/trades" icon={Icons.trades} label="Trades" compact />
            <NavItem to="/app/wallet" icon={Icons.wallet} label="Wallet" compact />
            <div style={{ height: '2rem' }} />
            <NavItem to="/app/settings" icon={Icons.settings} label="Settings" compact />
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
          <MobileNavItem to="/app/markets" icon={Icons.markets} label="Markets" />
          <MobileNavItem to="/app/positions" icon={Icons.positions} label="Positions" />
          <MobileNavItem to="/app/orders" icon={Icons.orders} label="Orders" />
          <MobileNavItem to="/app/wallet" icon={Icons.wallet} label="Wallet" />
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
