import { useState } from "react";
import { useRouteLoaderData } from "@remix-run/react";
import { Badge, Card, MiniChart, Tabs } from "~/components/admin/ui";
import { concurrentUsersData, markets as mockMarkets, tradesOverTimeData, users as mockUsers } from "~/components/admin/data/mockData";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "markets", label: "Market Analytics" },
  { id: "users", label: "User Analytics" },
];

export default function AdminAnalytics() {
  const parentData = useRouteLoaderData<any>("routes/admin");
  const [tab, setTab] = useState("overview");
  const [timeRange, setTimeRange] = useState("24h");

  const snapshot = parentData?.adminSnapshot;
  const markets: any[] = snapshot?.markets?.length ? snapshot.markets : mockMarkets;
  const users: any[] = snapshot?.users?.length ? snapshot.users : mockUsers;
  const analytics = snapshot?.analytics || {};
  const tradesOverTime = (analytics.tradesOverTime?.length ? analytics.tradesOverTime : tradesOverTimeData.map((d) => d.count))
    .map((count: number, index: number) => ({ time: `${index}:00`, count }));

  const totalVolume = Number(analytics.totalVolume ?? markets.reduce((a, m) => a + Number(m.volume24h || 0), 0));
  const totalLiquidity = Number(analytics.totalLiquidity ?? markets.reduce((a, m) => a + Number(m.liquidity || 0), 0));
  const spreads = markets.map((m) => Number(m.spread || 0)).filter(Boolean);
  const avgSpread = Number(analytics.avgSpread ?? (spreads.reduce((a, b) => a + b, 0) / (spreads.length || 1)));
  const activeMarkets = Number(analytics.activeMarkets ?? markets.filter((m) => m.status === "active").length);
  const humanUsers = Number(analytics.humanUsers ?? users.filter((u) => u.type === "human").length);
  const botUsers = Number(analytics.botUsers ?? users.filter((u) => u.type === "bot").length);
  const adminUsers = Number(analytics.adminUsers ?? users.filter((u) => u.type === "admin").length);
  const onlineUsers = users.filter((u) => u.wsStatus === "connected").length;
  const tradesToday = Number(analytics.tradesToday ?? 0);

  const volumeByCategory = Object.entries(
    markets.reduce<Record<string, number>>((acc, m) => {
      const category = m.category || "General";
      acc[category] = (acc[category] || 0) + Number(m.volume24h || 0);
      return acc;
    }, {}),
  ).sort((a, b) => Number(b[1]) - Number(a[1]));

  const topMarkets = [...markets].sort((a, b) => Number(b.volume24h || 0) - Number(a.volume24h || 0)).slice(0, 5);
  const topTraders = [...users].sort((a, b) => Number(b.tradesLast10m || 0) - Number(a.tradesLast10m || 0)).slice(0, 5);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-admin-text">Analytics</h1>
          <p className="mt-1 text-sm text-admin-text-dim">Platform metrics, performance analytics, and insights</p>
        </div>
        <div className="flex items-center gap-2">
          {["1h", "6h", "24h", "7d", "30d"].map((r) => (
            <button key={r} onClick={() => setTimeRange(r)} className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${timeRange === r ? "border border-blue-500/30 bg-blue-500/20 text-blue-400" : "border border-admin-border bg-admin-surface text-admin-text-dim hover:text-admin-text"}`}>
              {r}
            </button>
          ))}
        </div>
      </div>

      <Tabs tabs={TABS} activeTab={tab} onTabChange={setTab} />

      {tab === "overview" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { label: "24h Volume", value: `GBP ${(totalVolume / 1000).toFixed(1)}K` },
              { label: "Resting Liquidity", value: totalLiquidity.toLocaleString() },
              { label: "Avg Spread", value: `${(avgSpread * 100).toFixed(1)}%` },
              { label: "Trades Today", value: tradesToday.toLocaleString() },
            ].map((k) => (
              <div key={k.label} className="rounded-xl border border-admin-border bg-admin-surface p-4">
                <span className="text-xs text-admin-text-dim">{k.label}</span>
                <div className="mt-2 text-2xl font-bold text-admin-text">{k.value}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card title="Trades Over Time" subtitle="Hourly trade count">
              <MiniChart data={tradesOverTime} height={140} color="#3b82f6" />
            </Card>
            <Card title="User Activity" subtitle={`${users.length} known accounts`}>
              <MiniChart
                data={(snapshot?.users?.length ? users.slice(0, 24).map((u) => Number(u.ordersLast10m || 0) + Number(u.tradesLast10m || 0)) : concurrentUsersData.map((d) => d.count))
                  .map((count: number, index: number) => ({ time: `${index}:00`, count }))}
                height={140}
                color="#10b981"
              />
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card title="Volume by Category" subtitle="24h trading volume breakdown">
              <div className="space-y-3">
                {volumeByCategory.map(([cat, vol]) => {
                  const pct = totalVolume ? (Number(vol) / totalVolume) * 100 : 0;
                  return (
                    <div key={cat}>
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-sm text-admin-text">{cat}</span>
                        <span className="font-mono text-xs text-admin-text-dim">GBP {Number(vol).toLocaleString()} ({pct.toFixed(1)}%)</span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-admin-surface-2">
                        <div className="h-full rounded-full bg-blue-500" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
            <Card title="Top Markets by Volume" subtitle="Highest volume in 24h">
              <div className="space-y-2">
                {topMarkets.map((m, i) => (
                  <div key={m.id} className="flex items-center gap-3 rounded-lg bg-admin-surface-2 p-2">
                    <span className="text-lg font-bold text-admin-text-dim">#{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-admin-text">{m.name || m.question}</div>
                      <div className="text-xs text-admin-text-dim">{m.category || "General"}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-sm font-medium text-admin-text">GBP {Number(m.volume24h || 0).toLocaleString()}</div>
                      <Badge variant={m.botActivity === "high" ? "green" : m.botActivity === "medium" ? "amber" : "gray"}>{m.botActivity || "none"} bot</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      )}

      {tab === "markets" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            <Card title="Markets by Status">
              <div className="space-y-2">
                {["active", "pending", "settled", "voided", "suspended"].map((status) => (
                  <div key={status} className="flex items-center justify-between">
                    <Badge variant={status === "active" ? "green" : status === "pending" ? "amber" : status === "voided" ? "gray" : "blue"}>{status}</Badge>
                    <span className="font-mono text-sm text-admin-text">{markets.filter((m) => m.status === status).length}</span>
                  </div>
                ))}
              </div>
            </Card>
            <Card title="Spread Analysis">
              <div className="space-y-2">
                {[...markets].filter((m) => Number(m.spread || 0) > 0).sort((a, b) => Number(b.spread || 0) - Number(a.spread || 0)).slice(0, 6).map((m) => (
                  <div key={m.id} className="flex items-center gap-2">
                    <span className="flex-1 truncate text-xs text-admin-text">{m.name || m.question}</span>
                    <span className="font-mono text-xs font-medium text-admin-text">{(Number(m.spread || 0) * 100).toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </Card>
            <Card title="Active Markets">
              <div className="text-4xl font-bold text-admin-text">{activeMarkets}</div>
              <div className="mt-1 text-xs text-admin-text-dim">currently tradable</div>
            </Card>
          </div>
        </div>
      )}

      {tab === "users" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { label: "Total Users", value: users.length },
              { label: "Online Now", value: onlineUsers },
              { label: "Human Users", value: humanUsers },
              { label: "Bot Users", value: botUsers },
            ].map((k) => (
              <div key={k.label} className="rounded-xl border border-admin-border bg-admin-surface p-4 text-center">
                <div className="text-2xl font-bold text-admin-text">{k.value}</div>
                <div className="text-xs text-admin-text-dim">{k.label}</div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card title="Trading Leaderboard" subtitle="Top traders by recent activity">
              <div className="space-y-2">
                {topTraders.map((u, i) => (
                  <div key={u.id} className="flex items-center gap-3 rounded-lg bg-admin-surface-2 p-3">
                    <span className="text-lg font-bold text-admin-text-dim">#{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-admin-text">{u.email}</div>
                      <Badge variant={u.type === "bot" ? "cyan" : u.type === "admin" ? "purple" : "blue"}>{u.type}</Badge>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-lg font-bold text-emerald-400">{u.tradesLast10m || 0}</div>
                      <div className="text-xs text-admin-text-dim">trades/10m</div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
            <Card title="User Composition">
              <div className="space-y-3 text-sm">
                <div className="flex justify-between text-admin-text"><span>Human</span><span>{humanUsers}</span></div>
                <div className="flex justify-between text-admin-text"><span>Bot</span><span>{botUsers}</span></div>
                <div className="flex justify-between text-admin-text"><span>Admin</span><span>{adminUsers}</span></div>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
