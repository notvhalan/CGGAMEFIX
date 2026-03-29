import React, { useState } from 'react';
import { Badge } from '../ui/Badge';

interface AdminLayoutProps {
  children: React.ReactNode;
  activePage: string;
  onNavigate: (page: string) => void;
}

const navItems = [
  { id: 'overview', label: 'Overview', icon: '📊' },
  { id: 'markets', label: 'Markets', icon: '🏛️' },
  { id: 'liquidity-bots', label: 'Liquidity Bots', icon: '🤖' },
  { id: 'orders', label: 'Orders', icon: '📋' },
  { id: 'contract-factory', label: 'Contract Factory', icon: '🏭' },
  { id: 'settlement', label: 'Settlement', icon: '⚖️' },
  { id: 'users', label: 'Users', icon: '👥' },
  { id: 'analytics', label: 'Analytics', icon: '📈' },
  { id: 'audit-logs', label: 'Audit Logs', icon: '📝' },
  { id: 'risk-controls', label: 'Risk Controls', icon: '🛡️' },
];

export function AdminLayout({ children, activePage, onNavigate }: AdminLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  return (
    <div className="min-h-screen bg-admin-bg text-admin-text flex flex-col">
      {/* ─── Top Navbar ──────────────────────────────────────────────── */}
      <header className="h-14 bg-admin-surface border-b border-admin-border flex items-center px-4 gap-4 shrink-0 z-30 sticky top-0">
        {/* Logo + collapse toggle */}
        <div className="flex items-center gap-3 min-w-[180px]">
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="p-1.5 rounded-md hover:bg-admin-surface-2 text-admin-text-dim transition-colors"
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          </button>
          <span className="font-bold text-base tracking-tight text-admin-text">
            <span className="text-blue-400">Game</span>Fix
          </span>
          <Badge variant="green" dot>Production</Badge>
        </div>

        {/* Global Search */}
        <div className="flex-1 max-w-xl mx-auto">
          <div className="relative">
            <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-admin-text-dim" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search markets, users, contracts..."
              className="w-full bg-admin-surface-2 border border-admin-border rounded-lg pl-9 pr-4 py-1.5 text-sm text-admin-text placeholder:text-admin-text-dim focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20"
            />
            <kbd className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-admin-text-dim bg-admin-surface-3 px-1.5 py-0.5 rounded border border-admin-border">⌘K</kbd>
          </div>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-3">
          {/* Notifications */}
          <div className="relative">
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className="p-2 rounded-lg hover:bg-admin-surface-2 text-admin-text-dim transition-colors relative"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
              </svg>
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
            </button>
          </div>

          {/* User info */}
          <div className="flex items-center gap-2 border-l border-admin-border pl-3">
            <div className="text-right hidden sm:block">
              <div className="text-xs font-medium text-admin-text">vhalan02@gmail.com</div>
            </div>
            <Badge variant="purple">Admin</Badge>
            <div className="relative">
              <button
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-bold"
              >
                V
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* ─── Left Sidebar ────────────────────────────────────────── */}
        <aside
          className={`admin-sidebar bg-admin-surface border-r border-admin-border shrink-0 overflow-y-auto admin-scrollbar ${
            sidebarCollapsed ? 'w-16' : 'w-56'
          }`}
        >
          <nav className="py-2">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors
                  ${activePage === item.id
                    ? 'bg-blue-500/10 text-blue-400 border-r-2 border-blue-400'
                    : 'text-admin-text-muted hover:bg-admin-surface-2 hover:text-admin-text'
                  }
                  ${sidebarCollapsed ? 'justify-center px-2' : ''}
                `}
                title={sidebarCollapsed ? item.label : undefined}
              >
                <span className="text-base shrink-0">{item.icon}</span>
                {!sidebarCollapsed && <span>{item.label}</span>}
              </button>
            ))}
          </nav>

          {/* Bottom sidebar info */}
          {!sidebarCollapsed && (
            <div className="px-4 py-3 border-t border-admin-border mt-2">
              <div className="flex items-center gap-2 text-xs text-admin-text-dim">
                <span className="w-2 h-2 rounded-full bg-emerald-400 status-dot-pulse" />
                All systems operational
              </div>
              <div className="text-[10px] text-admin-text-dim mt-1">v2.4.1 · Connected</div>
            </div>
          )}
        </aside>

        {/* ─── Main Content ────────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto admin-scrollbar p-6 bg-admin-bg">
          {children}
        </main>
      </div>
    </div>
  );
}
