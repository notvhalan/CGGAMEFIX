import { useState } from "react";
import { useNavigate, useRouteLoaderData } from "@remix-run/react";
import { Badge, Card, DataTable, StatusBadge, Tabs } from "~/components/admin/ui";
import { markets as mockMarkets } from "~/components/admin/data/mockData";

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

export default function AdminMarkets() {
  const parentData = useRouteLoaderData<any>("routes/admin");
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [sortField, setSortField] = useState("volume24h");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const liveMarkets = parentData?.adminSnapshot?.markets || parentData?.markets || [];
  const allMarkets: any[] = liveMarkets.length > 0 ? liveMarkets : mockMarkets;

  const filteredMarkets = allMarkets
    .filter((m) => {
      if (activeTab === "active") return m.status === "active";
      if (activeTab === "pending") return m.status === "pending";
      if (activeTab === "resolved") return m.status === "resolved" || m.status === "voided" || m.status === "settled";
      if (activeTab === "suspended") return m.status === "suspended";
      return true;
    })
    .filter((m) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return [m.name, m.question, m.category, m.subcategory, m.id].some((value) =>
        String(value || "").toLowerCase().includes(q),
      );
    })
    .sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortDir === "asc" ? aVal - bVal : bVal - aVal;
      }
      return 0;
    });

  const tabs = [
    { id: "all", label: "All Markets", count: allMarkets.length },
    { id: "active", label: "Active", count: allMarkets.filter((m) => m.status === "active").length },
    { id: "pending", label: "Pending", count: allMarkets.filter((m) => m.status === "pending").length },
    { id: "resolved", label: "Resolved / Voided", count: allMarkets.filter((m) => ["resolved", "voided", "settled"].includes(m.status)).length },
    { id: "suspended", label: "Suspended", count: allMarkets.filter((m) => m.status === "suspended").length },
  ];

  const columns = [
    {
      key: "name" as const,
      header: "Market",
      render: (m: any) => (
        <div>
          <div className="text-sm font-medium text-admin-text">{m.name || m.question || m.id}</div>
          <div className="mt-0.5 text-xs text-admin-text-dim">{m.category || "General"} - {m.subcategory || "Unclassified"}</div>
        </div>
      ),
      width: "280px",
    },
    { key: "status" as const, header: "Status", render: (m: any) => <StatusBadge status={m.status} />, width: "100px" },
    {
      key: "midPrice" as const,
      header: "Mid Price",
      render: (m: any) => <span className="font-mono text-sm">{m.status === "active" ? `${((m.midPrice || 0) * 100).toFixed(0)}p` : "-"}</span>,
      align: "right" as const,
      sortable: true,
      width: "80px",
    },
    {
      key: "spread" as const,
      header: "Spread",
      render: (m: any) => (
        <span className={`font-mono text-sm ${(m.spread || 0) > 0.08 ? "text-amber-400" : "text-admin-text-dim"}`}>
          {m.status === "active" ? `${((m.spread || 0) * 100).toFixed(1)}%` : "-"}
        </span>
      ),
      align: "right" as const,
      sortable: true,
      width: "70px",
    },
    {
      key: "volume24h" as const,
      header: "24h Volume",
      render: (m: any) => <span className="font-mono text-sm">{m.volume24h > 0 ? `GBP ${formatNumber(m.volume24h)}` : "-"}</span>,
      align: "right" as const,
      sortable: true,
      width: "100px",
    },
    {
      key: "liquidity" as const,
      header: "Liquidity",
      render: (m: any) => <span className="font-mono text-sm">{m.liquidity > 0 ? formatNumber(m.liquidity) : "-"}</span>,
      align: "right" as const,
      sortable: true,
      width: "90px",
    },
    {
      key: "botActivity" as const,
      header: "Bot Activity",
      render: (m: any) => {
        const variant = m.botActivity === "high" ? "green" : m.botActivity === "medium" ? "amber" : m.botActivity === "low" ? "red" : "gray";
        return <Badge variant={variant as any}>{m.botActivity || "none"}</Badge>;
      },
      width: "90px",
    },
    {
      key: "openOrders" as const,
      header: "Orders",
      render: (m: any) => <span className="font-mono text-sm text-admin-text-dim">{m.openOrders || 0}</span>,
      align: "right" as const,
      sortable: true,
      width: "60px",
    },
    {
      key: "lastTrade" as const,
      header: "Last Trade",
      render: (m: any) => <span className="text-xs text-admin-text-dim">{m.lastTrade ? new Date(m.lastTrade).toLocaleString() : "-"}</span>,
      width: "120px",
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-admin-text">Markets</h1>
          <p className="mt-1 text-sm text-admin-text-dim">Manage and monitor all prediction markets</p>
        </div>
        <Badge variant="green" dot pulseDot>{allMarkets.filter((m) => m.status === "active").length} active</Badge>
      </div>

      <Card noPadding>
        <div className="border-b border-admin-border p-4">
          <div className="flex flex-wrap items-center gap-4">
            <input
              type="text"
              placeholder="Search by name, category, or ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="min-w-[220px] flex-1 rounded-lg border border-admin-border bg-admin-surface-2 px-3 py-2 text-sm text-admin-text placeholder:text-admin-text-dim focus:border-blue-500/50 focus:outline-none"
            />
            <select value={sortField} onChange={(e) => setSortField(e.target.value)} className="rounded-lg border border-admin-border bg-admin-surface-2 px-3 py-2 text-sm text-admin-text">
              <option value="volume24h">Sort: Volume</option>
              <option value="liquidity">Sort: Liquidity</option>
              <option value="openOrders">Sort: Open Orders</option>
              <option value="spread">Sort: Spread</option>
            </select>
            <button onClick={() => setSortDir(sortDir === "asc" ? "desc" : "asc")} className="rounded-lg border border-admin-border bg-admin-surface-2 px-3 py-2 text-sm text-admin-text">
              {sortDir === "asc" ? "Asc" : "Desc"}
            </button>
            <Tabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />
          </div>
        </div>

        <DataTable
          data={filteredMarkets}
          columns={columns}
          onRowClick={(m) => navigate(`/admin/markets/${m.id}`)}
          emptyMessage="No markets match your filters"
          compact
        />
      </Card>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <div className="rounded-lg border border-admin-border bg-admin-surface p-3 text-center">
          <div className="text-lg font-bold text-admin-text">{allMarkets.length}</div>
          <div className="text-xs text-admin-text-dim">Total Markets</div>
        </div>
        <div className="rounded-lg border border-admin-border bg-admin-surface p-3 text-center">
          <div className="text-lg font-bold text-emerald-400">{allMarkets.filter((m) => m.status === "active").length}</div>
          <div className="text-xs text-admin-text-dim">Active</div>
        </div>
        <div className="rounded-lg border border-admin-border bg-admin-surface p-3 text-center">
          <div className="text-lg font-bold text-admin-text">GBP {formatNumber(allMarkets.reduce((s, m) => s + (m.volume24h || 0), 0))}</div>
          <div className="text-xs text-admin-text-dim">Total 24h Volume</div>
        </div>
        <div className="rounded-lg border border-admin-border bg-admin-surface p-3 text-center">
          <div className="text-lg font-bold text-admin-text">{formatNumber(allMarkets.reduce((s, m) => s + (m.liquidity || 0), 0))}</div>
          <div className="text-xs text-admin-text-dim">Resting Liquidity</div>
        </div>
        <div className="rounded-lg border border-admin-border bg-admin-surface p-3 text-center">
          <div className="text-lg font-bold text-admin-text">{allMarkets.reduce((s, m) => s + (m.openOrders || 0), 0)}</div>
          <div className="text-xs text-admin-text-dim">Open Orders</div>
        </div>
      </div>
    </div>
  );
}
