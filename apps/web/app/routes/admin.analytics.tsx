import { useState } from "react";
import { Card, Badge, MiniChart, Tabs } from "~/components/admin/ui";
import {
  kpiData, markets, users, trades, orders,
  tradesOverTimeData, concurrentUsersData
} from "~/components/admin/data/mockData";

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'markets',  label: 'Market Analytics' },
  { id: 'users',    label: 'User Analytics' },
];

export default function AdminAnalytics() {
  const [tab, setTab] = useState('overview');
  const [timeRange, setTimeRange] = useState('24h');

  // Calculated stats
  const totalVolume = markets.reduce((a, m) => a + m.volume24h, 0);
  const totalLiquidity = markets.reduce((a, m) => a + m.liquidity, 0);
  const avgSpread = markets.filter(m => m.spread > 0).reduce((a, m) => a + m.spread, 0) / (markets.filter(m => m.spread > 0).length || 1);
  const activeMarkets = markets.filter(m => m.status === 'active').length;
  const humanUsers = users.filter(u => u.type === 'human').length;
  const botUsers = users.filter(u => u.type === 'bot').length;
  const onlineUsers = users.filter(u => u.wsStatus === 'connected').length;

  // Volume by category
  const volumeByCategory = Object.entries(
    markets.reduce<Record<string, number>>((acc, m) => {
      acc[m.category] = (acc[m.category] || 0) + m.volume24h;
      return acc;
    }, {})
  ).sort((a, b) => b[1] - a[1]);

  // Top markets by volume
  const topMarkets = [...markets].sort((a, b) => b.volume24h - a.volume24h).slice(0, 5);

  // Top traders
  const topTraders = [...users].sort((a, b) => b.tradesLast10m - a.tradesLast10m).slice(0, 5);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-admin-text">Analytics</h1>
          <p className="text-sm text-admin-text-dim mt-1">Platform metrics, performance analytics, and insights</p>
        </div>
        <div className="flex items-center gap-2">
          {['1h', '6h', '24h', '7d', '30d'].map(r => (
            <button
              key={r}
              onClick={() => setTimeRange(r)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                timeRange === r
                  ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                  : 'bg-admin-surface border border-admin-border text-admin-text-dim hover:text-admin-text'
              }`}
            >{r}</button>
          ))}
        </div>
      </div>

      <Tabs tabs={TABS} activeTab={tab} onTabChange={setTab} />

      {tab === 'overview' && (
        <div className="space-y-4">
          {/* KPI Grid */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: '24h Volume', value: `$${(totalVolume / 1000).toFixed(0)}K`, change: '+12.3%', up: true, icon: '📊' },
              { label: 'Total Liquidity', value: `$${(totalLiquidity / 1000).toFixed(0)}K`, change: '+8.7%', up: true, icon: '💰' },
              { label: 'Avg Spread', value: `${(avgSpread * 100).toFixed(1)}%`, change: '-0.5%', up: false, icon: '📐' },
              { label: 'Trades Today', value: kpiData.tradesToday.toLocaleString(), change: '+23.1%', up: true, icon: '📈' },
            ].map(k => (
              <div key={k.label} className="bg-admin-surface border border-admin-border rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-admin-text-dim">{k.label}</span>
                  <span className="text-lg">{k.icon}</span>
                </div>
                <div className="text-2xl font-bold text-admin-text">{k.value}</div>
                <div className={`text-xs mt-1 ${k.up ? 'text-emerald-400' : 'text-red-400'}`}>
                  {k.change} vs prev period
                </div>
              </div>
            ))}
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-2 gap-4">
            <Card title="📈 Trades Over Time" subtitle="Hourly trade count">
              <MiniChart
                data={tradesOverTimeData.map(d => d.count)}
                height={140}
                color="#3b82f6"
              />
              <div className="flex justify-between text-xs text-admin-text-dim mt-2">
                <span>00:00</span>
                <span>06:00</span>
                <span>12:00</span>
              </div>
            </Card>
            <Card title="👥 Concurrent Users" subtitle="Hourly active sessions">
              <MiniChart
                data={concurrentUsersData.map(d => d.count)}
                height={140}
                color="#10b981"
              />
              <div className="flex justify-between text-xs text-admin-text-dim mt-2">
                <span>00:00</span>
                <span>06:00</span>
                <span>12:00</span>
              </div>
            </Card>
          </div>

          {/* Volume by Category */}
          <div className="grid grid-cols-2 gap-4">
            <Card title="📊 Volume by Category" subtitle="24h trading volume breakdown">
              <div className="space-y-3">
                {volumeByCategory.map(([cat, vol]) => {
                  const pct = (vol / totalVolume) * 100;
                  return (
                    <div key={cat}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-admin-text">{cat}</span>
                        <span className="text-xs font-mono text-admin-text-dim">${vol.toLocaleString()} ({pct.toFixed(1)}%)</span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-admin-surface-2 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-blue-500 to-blue-400"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card title="🏆 Top Markets by Volume" subtitle="Highest volume in 24h">
              <div className="space-y-2">
                {topMarkets.map((m, i) => (
                  <div key={m.id} className="flex items-center gap-3 p-2 rounded-lg bg-admin-surface-2">
                    <span className={`text-lg font-bold ${i === 0 ? 'text-amber-400' : i === 1 ? 'text-gray-400' : i === 2 ? 'text-orange-400' : 'text-admin-text-dim'}`}>
                      #{i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-admin-text truncate">{m.name}</div>
                      <div className="text-xs text-admin-text-dim">{m.category}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-mono font-medium text-admin-text">${m.volume24h.toLocaleString()}</div>
                      <Badge variant={m.botActivity === 'high' ? 'emerald' : m.botActivity === 'medium' ? 'amber' : 'gray'}>
                        {m.botActivity} bot
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      )}

      {tab === 'markets' && (
        <div className="space-y-4">
          {/* Market performance grid */}
          <div className="grid grid-cols-3 gap-3">
            <Card title="📊 Active Markets" subtitle="By status">
              <div className="space-y-2">
                {['active', 'pending', 'resolved', 'voided', 'suspended'].map(status => {
                  const count = markets.filter(m => m.status === status).length;
                  return (
                    <div key={status} className="flex items-center justify-between">
                      <Badge variant={status === 'active' ? 'emerald' : status === 'pending' ? 'amber' : status === 'resolved' ? 'blue' : status === 'voided' ? 'gray' : 'red'}>
                        {status}
                      </Badge>
                      <span className="text-sm font-mono text-admin-text">{count}</span>
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card title="💧 Liquidity Distribution" subtitle="FOR vs LAY balance">
              <div className="space-y-2">
                {markets.filter(m => m.status === 'active').slice(0, 5).map(m => {
                  const total = m.forLiquidity + m.layLiquidity;
                  const forPct = total ? (m.forLiquidity / total) * 100 : 50;
                  return (
                    <div key={m.id}>
                      <div className="text-xs text-admin-text truncate mb-1">{m.name}</div>
                      <div className="flex h-2 rounded-full overflow-hidden">
                        <div className="bg-emerald-500" style={{ width: `${forPct}%` }} />
                        <div className="bg-red-500 flex-1" />
                      </div>
                      <div className="flex justify-between text-[10px] text-admin-text-dim mt-0.5">
                        <span>FOR {forPct.toFixed(0)}%</span>
                        <span>LAY {(100 - forPct).toFixed(0)}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card title="📐 Spread Analysis" subtitle="Current bid-ask spreads">
              <div className="space-y-2">
                {[...markets].filter(m => m.spread > 0).sort((a, b) => b.spread - a.spread).slice(0, 6).map(m => (
                  <div key={m.id} className="flex items-center gap-2">
                    <span className="text-xs text-admin-text truncate flex-1">{m.name}</span>
                    <span className={`text-xs font-mono font-medium ${m.spread > 0.08 ? 'text-red-400' : m.spread > 0.05 ? 'text-amber-400' : 'text-emerald-400'}`}>
                      {(m.spread * 100).toFixed(1)}%
                    </span>
                    <div className="w-12 h-1.5 rounded-full bg-admin-surface-2 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${m.spread > 0.08 ? 'bg-red-500' : m.spread > 0.05 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                        style={{ width: `${Math.min((m.spread / 0.15) * 100, 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* Market price heatmap */}
          <Card title="🌡️ Market Price Heatmap" subtitle="Current mid-prices across all active markets">
            <div className="grid grid-cols-4 gap-2">
              {markets.filter(m => m.status === 'active').map(m => {
                const hue = m.midPrice > 0.6 ? 120 : m.midPrice > 0.4 ? 60 : 0;
                return (
                  <div
                    key={m.id}
                    className="p-3 rounded-lg border border-admin-border"
                    style={{ backgroundColor: `hsla(${hue}, 50%, 50%, 0.1)` }}
                  >
                    <div className="text-xs text-admin-text truncate mb-1">{m.name}</div>
                    <div className="text-lg font-bold font-mono" style={{ color: `hsl(${hue}, 60%, 60%)` }}>
                      {(m.midPrice * 100).toFixed(0)}¢
                    </div>
                    <div className="text-[10px] text-admin-text-dim">{m.category}</div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      )}

      {tab === 'users' && (
        <div className="space-y-4">
          {/* User KPIs */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: 'Total Users', value: users.length, icon: '👥' },
              { label: 'Online Now', value: onlineUsers, icon: '🟢' },
              { label: 'Human Users', value: humanUsers, icon: '👤' },
              { label: 'Bot Users', value: botUsers, icon: '🤖' },
            ].map(k => (
              <div key={k.label} className="bg-admin-surface border border-admin-border rounded-xl p-4 text-center">
                <span className="text-2xl">{k.icon}</span>
                <div className="text-2xl font-bold text-admin-text mt-1">{k.value}</div>
                <div className="text-xs text-admin-text-dim">{k.label}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Leaderboard */}
            <Card title="🏆 Trading Leaderboard" subtitle="Top traders by recent activity">
              <div className="space-y-2">
                {topTraders.map((u, i) => (
                  <div key={u.id} className="flex items-center gap-3 p-3 rounded-lg bg-admin-surface-2">
                    <span className={`text-xl font-bold ${i === 0 ? 'text-amber-400' : i === 1 ? 'text-gray-400' : i === 2 ? 'text-orange-400' : 'text-admin-text-dim'}`}>
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-admin-text truncate">{u.email}</div>
                      <div className="text-xs text-admin-text-dim flex items-center gap-2">
                        <Badge variant={u.type === 'bot' ? 'cyan' : 'blue'}>{u.type}</Badge>
                        <span>{u.wsStatus === 'connected' ? '🟢' : '⚪'}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-mono font-bold text-emerald-400">{u.tradesLast10m}</div>
                      <div className="text-xs text-admin-text-dim">trades/10m</div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* User composition */}
            <Card title="📊 User Composition" subtitle="Breakdown by type and activity">
              <div className="space-y-4">
                {/* Type breakdown */}
                <div>
                  <h4 className="text-xs text-admin-text-dim font-medium mb-2">By Type</h4>
                  <div className="flex h-4 rounded-full overflow-hidden">
                    <div className="bg-blue-500" style={{ width: `${(humanUsers / users.length) * 100}%` }} />
                    <div className="bg-cyan-500" style={{ width: `${(botUsers / users.length) * 100}%` }} />
                    <div className="bg-purple-500 flex-1" />
                  </div>
                  <div className="flex gap-4 mt-2 text-xs text-admin-text-dim">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" /> Human ({humanUsers})</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-cyan-500" /> Bot ({botUsers})</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-purple-500" /> Admin ({users.filter(u => u.type === 'admin').length})</span>
                  </div>
                </div>

                {/* Connection status */}
                <div>
                  <h4 className="text-xs text-admin-text-dim font-medium mb-2">By Connection Status</h4>
                  <div className="flex h-4 rounded-full overflow-hidden">
                    <div className="bg-emerald-500" style={{ width: `${(users.filter(u => u.wsStatus === 'connected').length / users.length) * 100}%` }} />
                    <div className="bg-amber-500" style={{ width: `${(users.filter(u => u.wsStatus === 'idle').length / users.length) * 100}%` }} />
                    <div className="bg-gray-500 flex-1" />
                  </div>
                  <div className="flex gap-4 mt-2 text-xs text-admin-text-dim">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Connected ({users.filter(u => u.wsStatus === 'connected').length})</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> Idle ({users.filter(u => u.wsStatus === 'idle').length})</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-500" /> Offline ({users.filter(u => u.wsStatus === 'disconnected').length})</span>
                  </div>
                </div>

                {/* Activity share */}
                <div>
                  <h4 className="text-xs text-admin-text-dim font-medium mb-2">Trade Volume Share</h4>
                  {(() => {
                    const botTrades = users.filter(u => u.type === 'bot').reduce((a, u) => a + u.tradesLast10m, 0);
                    const humanTrades = users.filter(u => u.type !== 'bot').reduce((a, u) => a + u.tradesLast10m, 0);
                    const total = botTrades + humanTrades;
                    return (
                      <>
                        <div className="flex h-4 rounded-full overflow-hidden">
                          <div className="bg-cyan-500" style={{ width: `${total ? (botTrades / total) * 100 : 50}%` }} />
                          <div className="bg-blue-500 flex-1" />
                        </div>
                        <div className="flex justify-between mt-2 text-xs text-admin-text-dim">
                          <span>🤖 Bot: {botTrades} ({total ? ((botTrades / total) * 100).toFixed(0) : 0}%)</span>
                          <span>👤 Human: {humanTrades} ({total ? ((humanTrades / total) * 100).toFixed(0) : 0}%)</span>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
