import { useMemo, useState } from "react";
import { useRouteLoaderData } from "@remix-run/react";
import { Badge, Card, Tabs } from "~/components/admin/ui";
import { users as mockUsers } from "~/components/admin/data/mockData";

const typeBadge = (type: string) => {
  if (type === "admin") return <Badge variant="purple">Admin</Badge>;
  if (type === "bot") return <Badge variant="cyan">Bot</Badge>;
  return <Badge variant="blue">Human</Badge>;
};

const wsIcon = (status: string) => {
  if (status === "connected") return <span className="inline-flex items-center gap-1 text-emerald-400"><span className="h-2 w-2 rounded-full bg-emerald-400" /> Connected</span>;
  if (status === "idle") return <span className="inline-flex items-center gap-1 text-amber-400"><span className="h-2 w-2 rounded-full bg-amber-400" /> Idle</span>;
  return <span className="inline-flex items-center gap-1 text-admin-text-dim"><span className="h-2 w-2 rounded-full bg-gray-500" /> Offline</span>;
};

export default function AdminUsers() {
  const parentData = useRouteLoaderData<any>("routes/admin");
  const liveUsers = parentData?.adminSnapshot?.users || [];
  const users: any[] = liveUsers.length > 0 ? liveUsers : mockUsers;
  const [tab, setTab] = useState("all");
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<"ordersLast10m" | "tradesLast10m" | "lastSeen">("ordersLast10m");
  const [sortDesc, setSortDesc] = useState(true);

  const tabs = useMemo(() => [
    { id: "all", label: "All Users", count: users.length },
    { id: "human", label: "Humans", count: users.filter((u) => u.type === "human").length },
    { id: "bot", label: "Bots", count: users.filter((u) => u.type === "bot").length },
    { id: "admin", label: "Admins", count: users.filter((u) => u.type === "admin").length },
    { id: "online", label: "Online", count: users.filter((u) => u.wsStatus === "connected").length },
  ], [users]);

  const filtered = users
    .filter((u) => {
      if (tab === "online") return u.wsStatus === "connected";
      if (tab !== "all" && u.type !== tab) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      return [u.email, u.id, u.currentPage].some((value) => String(value || "").toLowerCase().includes(q));
    })
    .sort((a, b) => {
      if (sortField === "lastSeen") return sortDesc ? String(b.lastSeen).localeCompare(String(a.lastSeen)) : String(a.lastSeen).localeCompare(String(b.lastSeen));
      const diff = Number(a[sortField] || 0) - Number(b[sortField] || 0);
      return sortDesc ? -diff : diff;
    });

  const totalOnline = users.filter((u) => u.wsStatus === "connected").length;
  const totalHumans = users.filter((u) => u.type === "human").length;
  const totalBots = users.filter((u) => u.type === "bot").length;
  const totalOrders = users.reduce((a, u) => a + Number(u.ordersLast10m || 0), 0);
  const totalTrades = users.reduce((a, u) => a + Number(u.tradesLast10m || 0), 0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-admin-text">Users</h1>
        <p className="mt-1 text-sm text-admin-text-dim">User activity and account classification</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          { label: "Total Users", value: users.length },
          { label: "Online Now", value: totalOnline },
          { label: "Humans", value: totalHumans },
          { label: "Bots", value: totalBots },
          { label: "Orders (10m)", value: totalOrders },
        ].map((k) => (
          <div key={k.label} className="rounded-xl border border-admin-border bg-admin-surface p-3">
            <div className="text-lg font-bold text-admin-text">{Number(k.value).toLocaleString()}</div>
            <div className="text-xs text-admin-text-dim">{k.label}</div>
          </div>
        ))}
      </div>

      <Card>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search email, ID, or page..."
            className="min-w-[220px] flex-1 rounded-lg border border-admin-border bg-admin-surface-2 px-3 py-2 text-sm text-admin-text placeholder:text-admin-text-dim"
          />
          <select value={sortField} onChange={(e) => setSortField(e.target.value as any)} className="rounded-lg border border-admin-border bg-admin-surface-2 px-3 py-2 text-sm text-admin-text">
            <option value="ordersLast10m">Sort: Orders (10m)</option>
            <option value="tradesLast10m">Sort: Trades (10m)</option>
            <option value="lastSeen">Sort: Last Seen</option>
          </select>
          <button onClick={() => setSortDesc(!sortDesc)} className="rounded-lg border border-admin-border bg-admin-surface-2 px-3 py-2 text-sm text-admin-text">
            {sortDesc ? "Desc" : "Asc"}
          </button>
        </div>
        <Tabs tabs={tabs} activeTab={tab} onTabChange={setTab} />
      </Card>

      <div className="overflow-hidden rounded-xl border border-admin-border bg-admin-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-admin-border text-xs uppercase tracking-wider text-admin-text-dim">
              <th className="px-4 py-3 text-left font-medium">User</th>
              <th className="px-4 py-3 text-left font-medium">Type</th>
              <th className="px-4 py-3 text-left font-medium">WS Status</th>
              <th className="px-4 py-3 text-left font-medium">Current Page</th>
              <th className="px-4 py-3 text-right font-medium">Orders (10m)</th>
              <th className="px-4 py-3 text-right font-medium">Trades (10m)</th>
              <th className="px-4 py-3 text-left font-medium">Last Seen</th>
              <th className="px-4 py-3 text-left font-medium">Joined</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u, i) => (
              <tr key={u.id} className={`border-b border-admin-border transition-colors hover:bg-admin-surface-2 ${i % 2 ? "bg-admin-surface-2/30" : ""}`}>
                <td className="px-4 py-3">
                  <div className="font-medium text-admin-text">{u.email}</div>
                  <div className="font-mono text-xs text-admin-text-dim">{u.id}</div>
                </td>
                <td className="px-4 py-3">{typeBadge(u.type)}</td>
                <td className="px-4 py-3 text-xs">{wsIcon(u.wsStatus)}</td>
                <td className="px-4 py-3"><span className="rounded bg-admin-surface-2 px-2 py-0.5 font-mono text-xs text-admin-text">{u.currentPage || "-"}</span></td>
                <td className="px-4 py-3 text-right font-mono text-admin-text">{u.ordersLast10m || 0}</td>
                <td className="px-4 py-3 text-right font-mono text-admin-text">{u.tradesLast10m || 0}</td>
                <td className="px-4 py-3 text-xs text-admin-text-dim">{u.lastSeen || "-"}</td>
                <td className="px-4 py-3 text-xs text-admin-text-dim">{u.joinedDate || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <div className="py-12 text-center text-sm text-admin-text-dim">No users match the current filter.</div>}
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Card title="Top Traders (10m)">
          <div className="space-y-2">
            {[...users].sort((a, b) => Number(b.tradesLast10m || 0) - Number(a.tradesLast10m || 0)).slice(0, 5).map((u, i) => (
              <div key={u.id} className="flex items-center gap-2">
                <span className="w-4 text-xs text-admin-text-dim">{i + 1}.</span>
                <span className="flex-1 truncate text-xs text-admin-text">{u.email}</span>
                {typeBadge(u.type)}
                <span className="font-mono text-xs font-medium text-emerald-400">{u.tradesLast10m || 0}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Top Orderers (10m)">
          <div className="space-y-2">
            {[...users].sort((a, b) => Number(b.ordersLast10m || 0) - Number(a.ordersLast10m || 0)).slice(0, 5).map((u, i) => (
              <div key={u.id} className="flex items-center gap-2">
                <span className="w-4 text-xs text-admin-text-dim">{i + 1}.</span>
                <span className="flex-1 truncate text-xs text-admin-text">{u.email}</span>
                {typeBadge(u.type)}
                <span className="font-mono text-xs font-medium text-amber-400">{u.ordersLast10m || 0}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Activity Summary">
          <div className="space-y-3">
            <div className="flex justify-between text-xs"><span className="text-admin-text-dim">Total orders (10m)</span><span className="font-mono text-admin-text">{totalOrders}</span></div>
            <div className="flex justify-between text-xs"><span className="text-admin-text-dim">Total trades (10m)</span><span className="font-mono text-admin-text">{totalTrades}</span></div>
            <div className="flex justify-between text-xs"><span className="text-admin-text-dim">Order/Trade ratio</span><span className="font-mono text-admin-text">{totalTrades ? (totalOrders / totalTrades).toFixed(1) : "-"}x</span></div>
          </div>
        </Card>
      </div>
    </div>
  );
}
