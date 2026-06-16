import React, { useState } from 'react';
import {
  Activity,
  BarChart3,
  Bot,
  ClipboardList,
  Factory,
  FileText,
  Gauge,
  Menu,
  Scale,
  Shield,
  Users,
  X,
} from 'lucide-react';
import { Badge } from '../ui/Badge';

interface AdminLayoutProps {
  children: React.ReactNode;
  activePage: string;
  onNavigate: (page: string) => void;
  userEmail?: string | null;
}

const navItems = [
  { id: 'overview', label: 'Overview', icon: Gauge },
  { id: 'markets', label: 'Markets', icon: Activity },
  { id: 'liquidity-bots', label: 'Liquidity Bots', icon: Bot },
  { id: 'orders', label: 'Orders', icon: ClipboardList },
  { id: 'contract-factory', label: 'Contract Factory', icon: Factory },
  { id: 'settlement', label: 'Settlement', icon: Scale },
  { id: 'users', label: 'Users', icon: Users },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'audit-logs', label: 'Audit Logs', icon: FileText },
  { id: 'risk-controls', label: 'Risk Controls', icon: Shield },
];

export function AdminLayout({ children, activePage, onNavigate, userEmail }: AdminLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const userInitial = userEmail?.trim().charAt(0).toUpperCase() || 'A';
  const activeLabel = navItems.find((item) => item.id === activePage)?.label || 'Admin';

  const navigateTo = (page: string) => {
    setMobileSidebarOpen(false);
    onNavigate(page);
  };

  return (
    <div className="min-h-screen bg-admin-bg text-admin-text flex flex-col">
      <header className="h-14 bg-admin-surface border-b border-admin-border flex items-center px-4 gap-4 shrink-0 z-30 sticky top-0">
        <div className="flex items-center gap-3 md:min-w-[180px]">
          <button
            onClick={() => setMobileSidebarOpen(true)}
            className="md:hidden p-1.5 rounded-md hover:bg-admin-surface-2 text-admin-text-dim transition-colors"
            title="Open navigation"
            aria-label="Open navigation"
          >
            <Menu className="w-5 h-5" aria-hidden="true" />
          </button>
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="hidden md:block p-1.5 rounded-md hover:bg-admin-surface-2 text-admin-text-dim transition-colors"
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <Menu className="w-5 h-5" aria-hidden="true" />
          </button>
          <span className="font-bold text-base tracking-tight text-admin-text">
            <span className="text-blue-400">Game</span>Fix
          </span>
          <Badge variant="gray" className="hidden sm:inline-flex">Admin console</Badge>
        </div>

        <div className="flex-1 min-w-0 border-l border-admin-border pl-4">
          <span className="text-sm font-medium text-admin-text truncate block">{activeLabel}</span>
        </div>

        <div className="flex items-center gap-2 border-l border-admin-border pl-3">
          <div className="text-right hidden sm:block">
            <div className="text-xs font-medium text-admin-text">{userEmail || 'Authenticated admin'}</div>
          </div>
          <Badge variant="purple">Admin</Badge>
          <div
            className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-bold"
            aria-hidden="true"
          >
            {userInitial}
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {mobileSidebarOpen && (
          <button
            className="fixed inset-0 z-30 bg-black/60 md:hidden"
            onClick={() => setMobileSidebarOpen(false)}
            aria-label="Close navigation"
          />
        )}
        <aside
          className={`admin-sidebar fixed inset-y-0 left-0 z-40 w-64 bg-admin-surface border-r border-admin-border shrink-0 overflow-y-auto admin-scrollbar transition-transform md:static md:z-auto md:translate-x-0 ${
            mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'
          } ${
            sidebarCollapsed ? 'md:w-16' : 'md:w-56'
          }`}
        >
          <div className="h-14 px-4 flex items-center justify-between border-b border-admin-border md:hidden">
            <span className="font-bold text-admin-text"><span className="text-blue-400">Game</span>Fix Admin</span>
            <button
              onClick={() => setMobileSidebarOpen(false)}
              className="p-1.5 rounded-md hover:bg-admin-surface-2 text-admin-text-dim"
              aria-label="Close navigation"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>
          <nav className="py-2" aria-label="Admin navigation">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => navigateTo(item.id)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors
                    ${activePage === item.id
                      ? 'bg-blue-500/10 text-blue-400 border-r-2 border-blue-400'
                      : 'text-admin-text-muted hover:bg-admin-surface-2 hover:text-admin-text'
                    }
                    ${sidebarCollapsed ? 'md:justify-center md:px-2' : ''}
                  `}
                  title={sidebarCollapsed ? item.label : undefined}
                  aria-current={activePage === item.id ? 'page' : undefined}
                >
                  <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span className={sidebarCollapsed ? 'md:hidden' : ''}>{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className={`px-4 py-3 border-t border-admin-border mt-2 ${sidebarCollapsed ? 'md:hidden' : ''}`}>
              <div className="flex items-center gap-2 text-xs text-admin-text-dim">
                <span className="w-2 h-2 rounded-full bg-slate-400" />
                Service monitoring unavailable
              </div>
              <div className="text-[10px] text-admin-text-dim mt-1">Authenticated session</div>
          </div>
        </aside>

        <main className="flex-1 overflow-y-auto admin-scrollbar p-4 sm:p-6 bg-admin-bg">
          {children}
        </main>
      </div>
    </div>
  );
}
