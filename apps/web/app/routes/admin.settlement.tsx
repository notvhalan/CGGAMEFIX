import { useMemo, useState } from "react";
import { Form, useNavigation, useRouteLoaderData } from "@remix-run/react";
import { Badge, Button, Card, StatusBadge, Tabs } from "~/components/admin/ui";
import { settlements as mockSettlements } from "~/components/admin/data/mockData";

export { action } from "./admin";

export default function AdminSettlement() {
  const parentData = useRouteLoaderData<any>("routes/admin");
  const navigation = useNavigation();
  const liveSettlements = parentData?.adminSnapshot?.settlements || [];
  const settlements: any[] = liveSettlements.length > 0 ? liveSettlements : mockSettlements;
  const markets: any[] = parentData?.adminSnapshot?.markets || parentData?.markets || [];

  const [tab, setTab] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedSettlement, setSelectedSettlement] = useState<any | null>(null);
  const [resolveOutcome, setResolveOutcome] = useState<"YES" | "NO">("YES");

  const isResolving = navigation.state === "submitting" && navigation.formData?.get("action") === "resolveMarket";
  const isVoiding = navigation.state === "submitting" && navigation.formData?.get("action") === "voidMarket";
  const isResetting = navigation.state === "submitting" && navigation.formData?.get("action") === "resetMarketStatus";

  const tabs = useMemo(() => [
    { id: "all", label: "All", count: settlements.length },
    { id: "awaiting", label: "Awaiting", count: markets.filter((m) => m.status === "active").length },
    { id: "resolved", label: "Resolved", count: settlements.filter((s) => s.status === "resolved").length },
    { id: "failed", label: "Failed", count: settlements.filter((s) => s.settlementStatus === "failed").length },
    { id: "voided", label: "Voided", count: settlements.filter((s) => s.status === "voided").length },
  ], [markets, settlements]);

  const awaiting = markets
    .filter((m) => m.status === "active")
    .map((m) => ({
      id: `awaiting-${m.id}`,
      marketId: m.id,
      marketName: m.name || m.question || m.id,
      status: "awaiting",
      settlementStatus: "pending",
      maturityDate: m.maturityDate ? new Date(m.maturityDate).toLocaleDateString("en-GB") : "-",
      lastUpdated: m.updatedAt || m.createdAt,
    }));

  const rows = tab === "awaiting" ? awaiting : settlements;
  const filtered = rows.filter((s) => {
    if (tab !== "all" && tab !== "awaiting" && s.status !== tab && s.settlementStatus !== tab) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return [s.marketName, s.id, s.marketId].some((value) => String(value || "").toLowerCase().includes(q));
  });

  const completedCount = settlements.filter((s) => s.settlementStatus === "completed").length;
  const failedCount = settlements.filter((s) => s.settlementStatus === "failed" || s.settlementStatus === "retrying").length;
  const totalImpacted = settlements.reduce((a, s) => a + Number(s.impactedAccounts || 0), 0);

  const settlementStatusColor = (status: string) => {
    if (status === "completed") return "text-emerald-400";
    if (status === "processing") return "text-blue-400";
    if (status === "pending") return "text-amber-400";
    if (status === "retrying") return "text-orange-400";
    if (status === "failed") return "text-red-400";
    return "text-admin-text-dim";
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-admin-text">Settlement</h1>
          <p className="mt-1 text-sm text-admin-text-dim">Manage market resolution, payouts, and settlement status</p>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-emerald-400">{completedCount} Completed</span>
          <span className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-1.5 text-red-400">{failedCount} Failed/Retrying</span>
          <span className="rounded-lg border border-blue-500/20 bg-blue-500/10 px-3 py-1.5 text-blue-400">{totalImpacted} Accounts Impacted</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Card>
            <div className="mb-3 flex items-center gap-3">
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search markets..." className="flex-1 rounded-lg border border-admin-border bg-admin-surface-2 px-3 py-2 text-sm text-admin-text placeholder:text-admin-text-dim" />
            </div>
            <Tabs tabs={tabs} activeTab={tab} onTabChange={setTab} />
          </Card>

          <div className="space-y-2">
            {filtered.map((s) => (
              <div key={s.id} onClick={() => setSelectedSettlement(s)} className={`cursor-pointer rounded-xl border p-4 transition-colors ${selectedSettlement?.id === s.id ? "border-blue-500/30 bg-blue-500/5" : "border-admin-border bg-admin-surface hover:bg-admin-surface-2"}`}>
                <div className="mb-2 flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-admin-text">{s.marketName}</span>
                      <StatusBadge status={s.status} />
                    </div>
                    <div className="mt-0.5 font-mono text-xs text-admin-text-dim">{s.id} - {s.marketId}</div>
                  </div>
                  <div className="text-right">
                    <div className={`text-sm font-medium ${settlementStatusColor(s.settlementStatus)}`}>{String(s.settlementStatus || "pending")}</div>
                    {s.outcome && <div className="text-xs text-admin-text-dim">Outcome: <span className="font-medium text-admin-text">{s.outcome}</span></div>}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-4 text-xs text-admin-text-dim">
                  <span>Maturity: <span className="text-admin-text">{s.maturityDate || "-"}</span></span>
                  {s.impactedAccounts != null && <span>{s.impactedAccounts} accounts</span>}
                  <span>Updated: {s.lastUpdated ? new Date(s.lastUpdated).toLocaleString() : "-"}</span>
                </div>
                {s.reason && <div className="mt-2 rounded-lg border border-admin-border bg-admin-surface-2 px-3 py-2 text-xs text-admin-text-dim">{s.reason}</div>}
              </div>
            ))}
            {filtered.length === 0 && <div className="py-12 text-center text-sm text-admin-text-dim">No settlements match the current filter.</div>}
          </div>
        </div>

        <div className="space-y-4">
          <Card title="Resolve Market" subtitle="Settle a market with an outcome">
            <Form method="post" className="space-y-3">
              <input type="hidden" name="action" value="resolveMarket" />
              <div>
                <label className="mb-1 block text-xs font-medium text-admin-text-dim">Market</label>
                <select name="marketId" className="w-full rounded-lg border border-admin-border bg-admin-surface-2 px-3 py-2 text-sm text-admin-text" value={selectedSettlement?.marketId || ""} onChange={(e) => setSelectedSettlement(markets.find((m) => m.id === e.target.value) ? { marketId: e.target.value } : selectedSettlement)}>
                  <option value="">Select a market...</option>
                  {markets.filter((m) => m.status === "active").map((m) => <option key={m.id} value={m.id}>{m.name || m.question || m.id}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-admin-text-dim">Outcome</label>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setResolveOutcome("YES")} className={`flex-1 rounded-lg border py-2 text-sm font-medium ${resolveOutcome === "YES" ? "border-emerald-500/40 bg-emerald-500/20 text-emerald-400" : "border-admin-border bg-admin-surface-2 text-admin-text-dim"}`}>YES</button>
                  <button type="button" onClick={() => setResolveOutcome("NO")} className={`flex-1 rounded-lg border py-2 text-sm font-medium ${resolveOutcome === "NO" ? "border-red-500/40 bg-red-500/20 text-red-400" : "border-admin-border bg-admin-surface-2 text-admin-text-dim"}`}>NO</button>
                </div>
                <input type="hidden" name="winningOutcome" value={resolveOutcome} />
              </div>
              <textarea name="reason" placeholder="Resolution reason" className="w-full rounded-lg border border-admin-border bg-admin-surface-2 px-3 py-2 text-sm text-admin-text placeholder:text-admin-text-dim" />
              <Button type="submit" variant="primary" className="w-full" disabled={isResolving}>{isResolving ? "Resolving..." : "Resolve Market"}</Button>
            </Form>
          </Card>

          <Card title="Void Market" subtitle="Cancel and refund all positions">
            <Form method="post" className="space-y-3">
              <input type="hidden" name="action" value="voidMarket" />
              <select name="marketId" className="w-full rounded-lg border border-admin-border bg-admin-surface-2 px-3 py-2 text-sm text-admin-text" defaultValue={selectedSettlement?.marketId || ""}>
                <option value="">Select a market...</option>
                {markets.filter((m) => m.status === "active").map((m) => <option key={m.id} value={m.id}>{m.name || m.question || m.id}</option>)}
              </select>
              <textarea name="reason" placeholder="Void reason" className="w-full rounded-lg border border-admin-border bg-admin-surface-2 px-3 py-2 text-sm text-admin-text placeholder:text-admin-text-dim" />
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">Voiding a market refunds positions. This action cannot be undone.</div>
              <Button type="submit" variant="danger" className="w-full" disabled={isVoiding}>{isVoiding ? "Voiding..." : "Void Market"}</Button>
            </Form>
          </Card>

          <Card title="Reset Market Status" subtitle="Retry a failed settlement">
            <Form method="post" className="space-y-3">
              <input type="hidden" name="action" value="resetMarketStatus" />
              <select name="marketId" className="w-full rounded-lg border border-admin-border bg-admin-surface-2 px-3 py-2 text-sm text-admin-text">
                <option value="">Select market...</option>
                {markets.map((m) => <option key={m.id} value={m.id}>{m.name || m.question || m.id}</option>)}
              </select>
              <Button type="submit" variant="secondary" className="w-full" disabled={isResetting}>{isResetting ? "Resetting..." : "Reset to Active"}</Button>
            </Form>
          </Card>

          <Card title="Settlement Pipeline" subtitle="Processing overview">
            <div className="space-y-3">
              {[
                { label: "Pending", count: awaiting.length, color: "bg-amber-500" },
                { label: "Completed", count: completedCount, color: "bg-emerald-500" },
                { label: "Failed", count: failedCount, color: "bg-red-500" },
              ].map((row) => (
                <div key={row.label} className="flex items-center gap-3">
                  <span className="flex-1 text-sm text-admin-text">{row.label}</span>
                  <span className="font-mono text-sm font-medium text-admin-text">{row.count}</span>
                  <div className="h-1.5 w-20 overflow-hidden rounded-full bg-admin-surface-2">
                    <div className={`h-full rounded-full ${row.color}`} style={{ width: `${Math.min(row.count * 10, 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
