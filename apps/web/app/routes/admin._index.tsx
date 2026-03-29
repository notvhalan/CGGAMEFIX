import { useRouteLoaderData } from "@remix-run/react";
import { KpiCard, Card, Badge, StatusBadge, MiniChart } from "~/components/admin/ui";
import {
  kpiData,
  platformHealth,
  alerts,
  activityFeed,
  tradesOverTimeData,
  concurrentUsersData,
  markets as mockMarkets,
  botSessions,
} from "~/components/admin/data/mockData";

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

export default function AdminOverview() {
  const parentData = useRouteLoaderData<any>("routes/admin");
  const realMarkets = parentData?.markets || [];

  const activeCount = realMarkets.filter((m: any) => m.status === 'active').length || kpiData.activeMarkets;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-admin-text">Dashboard Overview</h1>
        <p className="text-sm text-admin-text-dim mt-1">Real-time platform monitoring and quick actions</p>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-5 gap-3">
        <KpiCard
          label="Active Markets"
          value={activeCount}
          icon="🏛️"
          trend={{ direction: 'up', value: '+3 this week' }}
          variant="default"
        />
        <KpiCard
          label="Concurrent Users"
          value={kpiData.concurrentUsers}
          icon="👥"
          trend={{ direction: 'up', value: '+12%' }}
          variant="success"
        />
        <KpiCard
          label="Orders in Book"
          value={formatNumber(kpiData.ordersInBook)}
          icon="📋"
          trend={{ direction: 'up', value: '+8%' }}
        />
        <KpiCard
          label="Trades Today"
          value={formatNumber(kpiData.tradesToday)}
          icon="📈"
          trend={{ direction: 'up', value: '+15%' }}
          variant="success"
        />
        <KpiCard
          label="Failed Settlements"
          value={kpiData.failedSettlements}
          icon="⚠️"
          variant={kpiData.failedSettlements > 0 ? 'danger' : 'success'}
        />
      </div>

      {/* Platform Health + Alerts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Platform Health */}
        <Card title="Platform Health" subtitle="Service status" className="lg:col-span-1">
          <div className="space-y-3">
            {Object.entries(platformHealth)
              .filter(([k]) => k !== 'wsConnections')
              .map(([key, svc]) => {
                const service = svc as { status: string; latency: number; uptime: number };
                return (
                  <div key={key} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <StatusBadge status={service.status} />
                      <span className="text-sm text-admin-text capitalize">
                        {key.replace(/([A-Z])/g, ' $1').trim()}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-admin-text-dim">
                      <span>{service.latency}ms</span>
                      <span>{service.uptime}%</span>
                    </div>
                  </div>
                );
              })}
            <div className="flex items-center justify-between pt-2 border-t border-admin-border">
              <span className="text-sm text-admin-text-dim">WebSocket Connections</span>
              <span className="text-sm font-mono text-blue-400">{platformHealth.wsConnections}</span>
            </div>
          </div>
        </Card>

        {/* Active Alerts */}
        <Card
          title="Active Alerts"
          subtitle={`${alerts.filter(a => !a.acknowledged).length} unacknowledged`}
          className="lg:col-span-2"
          action={
            <Badge variant={alerts.filter(a => !a.acknowledged).length > 0 ? 'red' : 'green'} dot pulseDot>
              {alerts.filter(a => !a.acknowledged).length} active
            </Badge>
          }
        >
          <div className="space-y-2">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className={`flex items-start gap-3 p-3 rounded-lg border ${
                  alert.severity === 'critical'
                    ? 'bg-red-500/5 border-red-500/20'
                    : alert.severity === 'warning'
                    ? 'bg-amber-500/5 border-amber-500/20'
                    : 'bg-blue-500/5 border-blue-500/20'
                } ${alert.acknowledged ? 'opacity-50' : ''}`}
              >
                <span className="text-base mt-0.5">
                  {alert.severity === 'critical' ? '🔴' : alert.severity === 'warning' ? '🟡' : 'ℹ️'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-admin-text">{alert.message}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-admin-text-dim">{alert.timestamp.split('T')[1]?.slice(0, 5)}</span>
                    <Badge variant="gray">{alert.category}</Badge>
                    {alert.acknowledged && <Badge variant="blue">Acknowledged</Badge>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card title="Trades Over Time" subtitle="Last 12 hours">
          <MiniChart
            data={tradesOverTimeData}
            color="#10b981"
            height={140}
            label="trades/hr"
            lastUpdated="30 sec ago"
          />
        </Card>
        <Card title="Concurrent Users" subtitle="Last 12 hours">
          <MiniChart
            data={concurrentUsersData}
            color="#3b82f6"
            height={140}
            label="users"
            lastUpdated="30 sec ago"
          />
        </Card>
      </div>

      {/* Activity + Bot Sessions row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Activity Feed */}
        <Card title="Activity Feed" subtitle="Latest platform events">
          <div className="space-y-1">
            {activityFeed.map((item) => (
              <div key={item.id} className="flex items-center gap-3 py-2 px-2 rounded hover:bg-admin-surface-2 transition-colors">
                <span className="text-base shrink-0">{item.icon}</span>
                <span className="text-sm text-admin-text flex-1 min-w-0 truncate">{item.text}</span>
                <span className="text-xs text-admin-text-dim shrink-0">{item.time}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Running Bot Sessions */}
        <Card
          title="Bot Sessions"
          subtitle={`${botSessions.filter(b => b.status === 'running').length} running`}
          action={
            <Badge variant="green" dot pulseDot>
              {botSessions.filter(b => b.status === 'running').length} active
            </Badge>
          }
        >
          <div className="space-y-2">
            {botSessions.slice(0, 5).map((bot) => (
              <div key={bot.id} className="flex items-center justify-between p-2.5 rounded-lg bg-admin-surface-2 border border-admin-border">
                <div className="min-w-0">
                  <div className="text-sm text-admin-text font-medium truncate">{bot.marketName}</div>
                  <div className="text-xs text-admin-text-dim">{bot.botEmail.split('@')[0]}</div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <div className="text-xs text-admin-text-dim">{bot.ordersPlaced} orders</div>
                    <div className="text-xs text-admin-text-dim">{bot.takerTrades} trades</div>
                  </div>
                  <StatusBadge status={bot.status} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Quick stats footer */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-admin-surface border border-admin-border rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-admin-text">{formatNumber(kpiData.totalLiquidity)}</div>
          <div className="text-xs text-admin-text-dim mt-1">Total Liquidity (£)</div>
        </div>
        <div className="bg-admin-surface border border-admin-border rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-admin-text">{kpiData.botSessionsRunning}</div>
          <div className="text-xs text-admin-text-dim mt-1">Bot Sessions Running</div>
        </div>
        <div className="bg-admin-surface border border-admin-border rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-admin-text">{kpiData.pendingMarkets}</div>
          <div className="text-xs text-admin-text-dim mt-1">Pending Markets</div>
        </div>
        <div className="bg-admin-surface border border-admin-border rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-admin-text">{kpiData.alerts}</div>
          <div className="text-xs text-admin-text-dim mt-1">Active Alerts</div>
        </div>
      </div>
    </div>
  );
}
