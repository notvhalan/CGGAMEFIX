import { useState } from "react";
import { useRouteLoaderData, useNavigate } from "@remix-run/react";
import { Card, Badge, StatusBadge, Tabs, DataTable } from "~/components/admin/ui";
import { markets as mockMarkets, type Market } from "~/components/admin/data/mockData";

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

export default function AdminMarkets() {
  const parentData = useRouteLoaderData<any>("routes/admin");
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [sortField, setSortField] = useState<string>('volume24h');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const navigate = useNavigate();

  // Merge real markets into our mock display
  const allMarkets: Market[] = mockMarkets;

  const filteredMarkets = allMarkets
    .filter(m => {
      if (activeTab === 'active') return m.status === 'active';
      if (activeTab === 'pending') return m.status === 'pending';
      if (activeTab === 'resolved') return m.status === 'resolved' || m.status === 'voided';
      if (activeTab === 'suspended') return m.status === 'suspended';
      return true;
    })
    .filter(m => {
      if (!search) return true;
      const s = search.toLowerCase();
      return m.name.toLowerCase().includes(s) || m.category.toLowerCase().includes(s) || m.id.toLowerCase().includes(s);
    })
    .sort((a, b) => {
      const field = sortField as keyof Market;
      const aVal = a[field];
      const bVal = b[field];
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
      }
      return 0;
    });

  const tabs = [
    { id: 'all', label: 'All Markets', count: allMarkets.length },
    { id: 'active', label: 'Active', count: allMarkets.filter(m => m.status === 'active').length },
    { id: 'pending', label: 'Pending', count: allMarkets.filter(m => m.status === 'pending').length },
    { id: 'resolved', label: 'Resolved / Voided', count: allMarkets.filter(m => m.status === 'resolved' || m.status === 'voided').length },
    { id: 'suspended', label: 'Suspended', count: allMarkets.filter(m => m.status === 'suspended').length },
  ];

  const columns = [
    {
      key: 'name' as const,
      header: 'Market',
      render: (m: Market) => (
        <div>
          <div className="text-sm font-medium text-admin-text">{m.name}</div>
          <div className="text-xs text-admin-text-dim mt-0.5">{m.category} · {m.subcategory}</div>
        </div>
      ),
      width: '280px',
    },
    {
      key: 'status' as const,
      header: 'Status',
      render: (m: Market) => <StatusBadge status={m.status} />,
      width: '100px',
    },
    {
      key: 'midPrice' as const,
      header: 'Mid Price',
      render: (m: Market) => (
        <span className="font-mono text-sm">
          {m.status === 'active' ? `${(m.midPrice * 100).toFixed(0)}p` : '—'}
        </span>
      ),
      align: 'right' as const,
      sortable: true,
      width: '80px',
    },
    {
      key: 'spread' as const,
      header: 'Spread',
      render: (m: Market) => (
        <span className={`font-mono text-sm ${m.spread > 0.08 ? 'text-amber-400' : 'text-admin-text-dim'}`}>
          {m.status === 'active' ? `${(m.spread * 100).toFixed(1)}%` : '—'}
        </span>
      ),
      align: 'right' as const,
      sortable: true,
      width: '70px',
    },
    {
      key: 'volume24h' as const,
      header: '24h Volume',
      render: (m: Market) => (
        <span className="font-mono text-sm">{m.volume24h > 0 ? `£${formatNumber(m.volume24h)}` : '—'}</span>
      ),
      align: 'right' as const,
      sortable: true,
      width: '100px',
    },
    {
      key: 'openInterest' as const,
      header: 'Open Interest',
      render: (m: Market) => (
        <span className="font-mono text-sm">{m.openInterest > 0 ? `£${formatNumber(m.openInterest)}` : '—'}</span>
      ),
      align: 'right' as const,
      sortable: true,
      width: '100px',
    },
    {
      key: 'liquidity' as const,
      header: 'Liquidity',
      render: (m: Market) => (
        <span className="font-mono text-sm">{m.liquidity > 0 ? `£${formatNumber(m.liquidity)}` : '—'}</span>
      ),
      align: 'right' as const,
      sortable: true,
      width: '90px',
    },
    {
      key: 'botActivity' as const,
      header: 'Bot Activity',
      render: (m: Market) => {
        const variant = m.botActivity === 'high' ? 'green' : m.botActivity === 'medium' ? 'amber' : m.botActivity === 'low' ? 'red' : 'gray';
        return <Badge variant={variant as any}>{m.botActivity}</Badge>;
      },
      width: '90px',
    },
    {
      key: 'openOrders' as const,
      header: 'Orders',
      render: (m: Market) => <span className="font-mono text-sm text-admin-text-dim">{m.openOrders}</span>,
      align: 'right' as const,
      sortable: true,
      width: '60px',
    },
    {
      key: 'lastTrade' as const,
      header: 'Last Trade',
      render: (m: Market) => <span className="text-xs text-admin-text-dim">{m.lastTrade}</span>,
      width: '90px',
    },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-admin-text">Markets</h1>
          <p className="text-sm text-admin-text-dim mt-1">Manage and monitor all prediction markets</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="green" dot pulseDot>{allMarkets.filter(m => m.status === 'active').length} active</Badge>
        </div>
      </div>

      {/* Search + Tabs */}
      <Card noPadding>
        <div className="p-4 border-b border-admin-border">
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-admin-text-dim" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search by name, category, or ID..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full bg-admin-surface-2 border border-admin-border rounded-lg pl-9 pr-4 py-2 text-sm text-admin-text placeholder:text-admin-text-dim focus:outline-none focus:border-blue-500/50"
              />
            </div>
            <Tabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />
          </div>
        </div>

        {/* Markets Table */}
        <DataTable
          data={filteredMarkets}
          columns={columns}
          onRowClick={(m) => navigate(`/admin/markets/${m.id}`)}
          emptyMessage="No markets match your filters"
          compact
        />
      </Card>

      {/* Summary strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-admin-surface border border-admin-border rounded-lg p-3 text-center">
          <div className="text-lg font-bold text-admin-text">{allMarkets.length}</div>
          <div className="text-xs text-admin-text-dim">Total Markets</div>
        </div>
        <div className="bg-admin-surface border border-admin-border rounded-lg p-3 text-center">
          <div className="text-lg font-bold text-emerald-400">{allMarkets.filter(m => m.status === 'active').length}</div>
          <div className="text-xs text-admin-text-dim">Active</div>
        </div>
        <div className="bg-admin-surface border border-admin-border rounded-lg p-3 text-center">
          <div className="text-lg font-bold text-admin-text">£{formatNumber(allMarkets.reduce((s, m) => s + m.volume24h, 0))}</div>
          <div className="text-xs text-admin-text-dim">Total 24h Volume</div>
        </div>
        <div className="bg-admin-surface border border-admin-border rounded-lg p-3 text-center">
          <div className="text-lg font-bold text-admin-text">£{formatNumber(allMarkets.reduce((s, m) => s + m.liquidity, 0))}</div>
          <div className="text-xs text-admin-text-dim">Total Liquidity</div>
        </div>
        <div className="bg-admin-surface border border-admin-border rounded-lg p-3 text-center">
          <div className="text-lg font-bold text-admin-text">{allMarkets.reduce((s, m) => s + m.uniqueTraders, 0)}</div>
          <div className="text-xs text-admin-text-dim">Unique Traders</div>
        </div>
      </div>
    </div>
  );
}
