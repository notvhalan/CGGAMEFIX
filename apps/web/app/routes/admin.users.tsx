import { useState } from "react";
import { Card, Badge, StatusBadge, Tabs, DataTable } from "~/components/admin/ui";
import { users, type User } from "~/components/admin/data/mockData";

const TABS = [
  { id: 'all',     label: 'All Users',  count: users.length },
  { id: 'human',   label: 'Humans',     count: users.filter(u => u.type === 'human').length },
  { id: 'bot',     label: 'Bots',       count: users.filter(u => u.type === 'bot').length },
  { id: 'admin',   label: 'Admins',     count: users.filter(u => u.type === 'admin').length },
  { id: 'online',  label: 'Online',     count: users.filter(u => u.wsStatus === 'connected').length },
];

const typeBadge = (type: User['type']) => {
  switch (type) {
    case 'admin': return <Badge variant="purple">Admin</Badge>;
    case 'bot':   return <Badge variant="cyan">Bot</Badge>;
    default:      return <Badge variant="blue">Human</Badge>;
  }
};

const wsIcon = (status: User['wsStatus']) => {
  switch (status) {
    case 'connected':    return <span className="inline-flex items-center gap-1 text-emerald-400"><span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> Connected</span>;
    case 'idle':         return <span className="inline-flex items-center gap-1 text-amber-400"><span className="w-2 h-2 rounded-full bg-amber-400" /> Idle</span>;
    case 'disconnected': return <span className="inline-flex items-center gap-1 text-admin-text-dim"><span className="w-2 h-2 rounded-full bg-gray-500" /> Offline</span>;
    default: return null;
  }
};

export default function AdminUsers() {
  const [tab, setTab] = useState('all');
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<'ordersLast10m' | 'tradesLast10m' | 'lastSeen'>('ordersLast10m');
  const [sortDesc, setSortDesc] = useState(true);

  const filtered = users
    .filter(u => {
      if (tab === 'online') return u.wsStatus === 'connected';
      if (tab !== 'all' && u.type !== tab) return false;
      if (search) {
        const q = search.toLowerCase();
        return u.email.toLowerCase().includes(q) || u.id.toLowerCase().includes(q) || u.currentPage.toLowerCase().includes(q);
      }
      return true;
    })
    .sort((a, b) => {
      if (sortField === 'lastSeen') return 0; // keep natural order for text field
      const diff = (a[sortField] ?? 0) - (b[sortField] ?? 0);
      return sortDesc ? -diff : diff;
    });

  // Stats
  const totalOnline   = users.filter(u => u.wsStatus === 'connected').length;
  const totalHumans   = users.filter(u => u.type === 'human').length;
  const totalBots     = users.filter(u => u.type === 'bot').length;
  const totalOrders   = users.reduce((a, u) => a + u.ordersLast10m, 0);
  const totalTrades   = users.reduce((a, u) => a + u.tradesLast10m, 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-admin-text">Users</h1>
          <p className="text-sm text-admin-text-dim mt-1">Live user activity, WebSocket status, and user management</p>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-5 gap-3">
        {[
          { label: 'Total Users', value: users.length, icon: '👥' },
          { label: 'Online Now', value: totalOnline, icon: '🟢' },
          { label: 'Humans', value: totalHumans, icon: '👤' },
          { label: 'Bots', value: totalBots, icon: '🤖' },
          { label: 'Orders (10m)', value: totalOrders, icon: '📋' },
        ].map(k => (
          <div key={k.label} className="bg-admin-surface border border-admin-border rounded-xl p-3 flex items-center gap-3">
            <span className="text-2xl">{k.icon}</span>
            <div>
              <div className="text-lg font-bold text-admin-text">{k.value.toLocaleString()}</div>
              <div className="text-xs text-admin-text-dim">{k.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Search + Tabs + Sort */}
      <Card>
        <div className="flex items-center gap-3 mb-3">
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search email, ID, or page..."
            className="flex-1 bg-admin-surface-2 border border-admin-border rounded-lg px-3 py-2 text-sm text-admin-text placeholder:text-admin-text-dim"
          />
          <select
            value={sortField}
            onChange={e => setSortField(e.target.value as any)}
            className="bg-admin-surface-2 border border-admin-border rounded-lg px-3 py-2 text-sm text-admin-text"
          >
            <option value="ordersLast10m">Sort: Orders (10m)</option>
            <option value="tradesLast10m">Sort: Trades (10m)</option>
            <option value="lastSeen">Sort: Last Seen</option>
          </select>
          <button
            onClick={() => setSortDesc(!sortDesc)}
            className="bg-admin-surface-2 border border-admin-border rounded-lg px-3 py-2 text-sm text-admin-text hover:bg-admin-surface-3 transition-colors"
          >
            {sortDesc ? '↓ Desc' : '↑ Asc'}
          </button>
        </div>
        <Tabs tabs={TABS} activeTab={tab} onTabChange={setTab} />
      </Card>

      {/* Users table */}
      <div className="bg-admin-surface border border-admin-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-admin-border text-admin-text-dim text-xs uppercase tracking-wider">
              <th className="text-left px-4 py-3 font-medium">User</th>
              <th className="text-left px-4 py-3 font-medium">Type</th>
              <th className="text-left px-4 py-3 font-medium">WS Status</th>
              <th className="text-left px-4 py-3 font-medium">Current Page</th>
              <th className="text-right px-4 py-3 font-medium">Orders (10m)</th>
              <th className="text-right px-4 py-3 font-medium">Trades (10m)</th>
              <th className="text-left px-4 py-3 font-medium">Last Seen</th>
              <th className="text-left px-4 py-3 font-medium">Joined</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u, i) => (
              <tr key={u.id} className={`border-b border-admin-border hover:bg-admin-surface-2 transition-colors ${i % 2 === 0 ? '' : 'bg-admin-surface-2/30'}`}>
                <td className="px-4 py-3">
                  <div className="text-admin-text font-medium">{u.email}</div>
                  <div className="text-xs text-admin-text-dim font-mono">{u.id}</div>
                </td>
                <td className="px-4 py-3">{typeBadge(u.type)}</td>
                <td className="px-4 py-3 text-xs">{wsIcon(u.wsStatus)}</td>
                <td className="px-4 py-3">
                  <span className="text-xs text-admin-text font-mono bg-admin-surface-2 px-2 py-0.5 rounded">{u.currentPage}</span>
                </td>
                <td className="px-4 py-3 text-right">
                  <span className={`font-mono font-medium ${u.ordersLast10m > 50 ? 'text-amber-400' : 'text-admin-text'}`}>
                    {u.ordersLast10m}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <span className={`font-mono font-medium ${u.tradesLast10m > 20 ? 'text-emerald-400' : 'text-admin-text'}`}>
                    {u.tradesLast10m}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-admin-text-dim">{u.lastSeen}</td>
                <td className="px-4 py-3 text-xs text-admin-text-dim">{u.joinedDate}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <div className="text-center py-12 text-admin-text-dim text-sm">No users match the current filter.</div>
        )}
      </div>

      {/* Activity heatmap summary */}
      <div className="grid grid-cols-3 gap-3">
        <Card title="🔥 Top Traders (10m)">
          <div className="space-y-2">
            {[...users].sort((a, b) => b.tradesLast10m - a.tradesLast10m).slice(0, 5).map((u, i) => (
              <div key={u.id} className="flex items-center gap-2">
                <span className="text-xs text-admin-text-dim w-4">{i + 1}.</span>
                <span className="text-xs text-admin-text truncate flex-1">{u.email}</span>
                {typeBadge(u.type)}
                <span className="text-xs font-mono font-medium text-emerald-400">{u.tradesLast10m}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card title="📋 Top Orderers (10m)">
          <div className="space-y-2">
            {[...users].sort((a, b) => b.ordersLast10m - a.ordersLast10m).slice(0, 5).map((u, i) => (
              <div key={u.id} className="flex items-center gap-2">
                <span className="text-xs text-admin-text-dim w-4">{i + 1}.</span>
                <span className="text-xs text-admin-text truncate flex-1">{u.email}</span>
                {typeBadge(u.type)}
                <span className="text-xs font-mono font-medium text-amber-400">{u.ordersLast10m}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card title="📊 Activity Summary">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-admin-text-dim">Total orders (10m)</span>
              <span className="text-sm font-mono font-medium text-admin-text">{totalOrders}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-admin-text-dim">Total trades (10m)</span>
              <span className="text-sm font-mono font-medium text-admin-text">{totalTrades}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-admin-text-dim">Order/Trade ratio</span>
              <span className="text-sm font-mono font-medium text-admin-text">{totalTrades ? (totalOrders / totalTrades).toFixed(1) : '—'}x</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-admin-text-dim">Bot vs Human trades</span>
              <span className="text-sm font-mono font-medium text-admin-text">
                {users.filter(u => u.type === 'bot').reduce((a, u) => a + u.tradesLast10m, 0)}/{users.filter(u => u.type !== 'bot').reduce((a, u) => a + u.tradesLast10m, 0)}
              </span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
