import { Link, useRouteLoaderData } from "@remix-run/react";
import { Activity, Bot, ClipboardList, Layers3 } from "lucide-react";
import { Badge, Card, KpiCard, MiniChart } from "~/components/admin/ui";
import {
  concurrentUsersData,
  kpiData,
  tradesOverTimeData,
} from "~/components/admin/data/mockData";

export default function AdminOverview() {
  const parentData = useRouteLoaderData<any>("routes/admin");
  const markets: any[] = parentData?.markets || [];
  const botStatus = parentData?.botStatus;
  const sessions: any[] = botStatus?.sessions || [];

  const activeMarkets = markets.filter((market) => String(market.status).toLowerCase() === "active").length;
  const runningSessions = sessions.filter((session) => session.status === "running").length;
  const errorSessions = sessions.filter((session) => session.status === "error");

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-admin-text">Operations Overview</h1>
          <p className="mt-1 text-sm text-admin-text-dim">Live market and liquidity-bot status</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/admin/markets"
            className="rounded-lg border border-admin-border bg-admin-surface px-3 py-2 text-xs font-medium text-admin-text-muted hover:border-blue-500/40 hover:text-admin-text"
          >
            Manage markets
          </Link>
          <Link
            to="/admin/bots"
            className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-500"
          >
            Manage liquidity bots
          </Link>
        </div>
      </div>

      {errorSessions.length > 0 && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {errorSessions.length} liquidity bot session{errorSessions.length === 1 ? "" : "s"} require attention.
          <Link to="/admin/bots" className="ml-2 font-semibold underline underline-offset-2">
            Review sessions
          </Link>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiCard
          label="Total Markets"
          value={markets.length}
          icon={<Layers3 className="h-5 w-5" />}
          subtitle="Live loader data"
        />
        <KpiCard
          label="Active Markets"
          value={activeMarkets}
          icon={<Activity className="h-5 w-5" />}
          subtitle="Live loader data"
          variant="success"
        />
        <KpiCard
          label="Running Bot Sessions"
          value={runningSessions}
          icon={<Bot className="h-5 w-5" />}
          subtitle={botStatus ? "Live gateway status" : "Gateway status unavailable"}
          variant={errorSessions.length > 0 ? "danger" : "default"}
        />
        <KpiCard
          label="Tracked Bot Orders"
          value={botStatus?.totalOrders ?? "Unavailable"}
          icon={<ClipboardList className="h-5 w-5" />}
          subtitle={botStatus ? `${botStatus.totalBots || 0} active bot workers` : "Gateway status unavailable"}
        />
      </div>

      <Card title="Live Bot Sessions" subtitle="Gateway-reported liquidity bot state">
        {sessions.length === 0 ? (
          <div className="py-8 text-center">
            <Bot className="mx-auto h-8 w-8 text-admin-text-dim" />
            <p className="mt-3 text-sm font-medium text-admin-text">No running bot sessions</p>
            <p className="mt-1 text-xs text-admin-text-dim">
              Start or inspect liquidity bots from the dedicated control page.
            </p>
            <Link to="/admin/bots" className="mt-4 inline-block text-xs font-semibold text-blue-400 hover:text-blue-300">
              Open liquidity bot controls
            </Link>
          </div>
        ) : (
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {sessions.slice(0, 6).map((session) => (
              <Link
                key={session.marketId}
                to="/admin/bots"
                className="rounded-lg border border-admin-border bg-admin-surface-2 p-3 hover:border-blue-500/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-admin-text">{session.marketName || session.marketId}</p>
                    <p className="mt-1 text-xs text-admin-text-dim">{session.botsCount || 0} bots, {session.ordersPlaced || 0} orders</p>
                  </div>
                  <Badge variant={session.status === "error" ? "red" : "green"} dot>
                    {session.status}
                  </Badge>
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>

      <div className="flex items-center gap-3 pt-2">
        <div className="h-px flex-1 bg-admin-border" />
        <Badge variant="amber">Demo analytics</Badge>
        <div className="h-px flex-1 bg-admin-border" />
      </div>

      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
        The analytics below contain sample data and must not be used for operational decisions.
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card title="Trades Over Time" subtitle="Demo data">
          <MiniChart data={tradesOverTimeData} color="#10b981" height={140} label="trades/hr" lastUpdated="Sample series" />
        </Card>
        <Card title="Concurrent Users" subtitle={`Demo value: ${kpiData.concurrentUsers}`}>
          <MiniChart data={concurrentUsersData} color="#3b82f6" height={140} label="users" lastUpdated="Sample series" />
        </Card>
      </div>
    </div>
  );
}
