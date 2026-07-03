import { useState } from "react";
import { useRouteLoaderData } from "@remix-run/react";
import { Badge, Card } from "~/components/admin/ui";
import { auditLogs as mockAuditLogs } from "~/components/admin/data/mockData";

const ACTION_TYPES = [
  { id: "all", label: "All" },
  { id: "market_resolve", label: "Market Resolve" },
  { id: "market_void", label: "Market Void" },
  { id: "bot_start", label: "Bot Start" },
  { id: "bot_stop", label: "Bot Stop" },
  { id: "settlement_reset", label: "Settlement Reset" },
  { id: "config_change", label: "Config Change" },
  { id: "insurance_create", label: "Insurance Create" },
  { id: "insurance_delete", label: "Insurance Delete" },
];

const actionColor = (type: string) => {
  if (type === "market_resolve") return "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
  if (type === "market_void" || type === "insurance_delete") return "text-red-400 bg-red-500/10 border-red-500/20";
  if (type === "bot_start") return "text-blue-400 bg-blue-500/10 border-blue-500/20";
  if (type === "bot_stop") return "text-amber-400 bg-amber-500/10 border-amber-500/20";
  if (type === "config_change") return "text-cyan-400 bg-cyan-500/10 border-cyan-500/20";
  return "text-admin-text-dim bg-admin-surface-2 border-admin-border";
};

export default function AdminAuditLogs() {
  const parentData = useRouteLoaderData<any>("routes/admin");
  const liveLogs = parentData?.adminSnapshot?.auditLogs || [];
  const auditLogs: any[] = liveLogs.length > 0 ? liveLogs : mockAuditLogs;
  const [actionFilter, setActionFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [resultFilter, setResultFilter] = useState<"all" | "success" | "failed">("all");
  const [adminFilter, setAdminFilter] = useState("all");

  const adminEmails = [...new Set(auditLogs.map((l) => l.adminUser))];
  const filtered = auditLogs.filter((log) => {
    if (actionFilter !== "all" && log.actionType !== actionFilter) return false;
    if (resultFilter !== "all" && log.result !== resultFilter) return false;
    if (adminFilter !== "all" && log.adminUser !== adminFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return [log.summary, log.target, log.adminUser].some((value) => String(value || "").toLowerCase().includes(q));
  });

  const successCount = auditLogs.filter((l) => l.result === "success").length;
  const failedCount = auditLogs.filter((l) => l.result === "failed").length;
  const todayCount = auditLogs.filter((l) => new Date(l.timestamp).toDateString() === new Date().toDateString()).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-admin-text">Audit Logs</h1>
          <p className="mt-1 text-sm text-admin-text-dim">Admin action history and accountability trail</p>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="rounded-lg border border-admin-border bg-admin-surface px-3 py-1.5 text-admin-text">{auditLogs.length} Total</span>
          <span className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-emerald-400">{successCount} Success</span>
          <span className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-1.5 text-red-400">{failedCount} Failed</span>
          <span className="rounded-lg border border-blue-500/20 bg-blue-500/10 px-3 py-1.5 text-blue-400">{todayCount} Today</span>
        </div>
      </div>

      <Card>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search summary, target, or admin..." className="min-w-[220px] flex-1 rounded-lg border border-admin-border bg-admin-surface-2 px-3 py-2 text-sm text-admin-text placeholder:text-admin-text-dim" />
          <select value={adminFilter} onChange={(e) => setAdminFilter(e.target.value)} className="rounded-lg border border-admin-border bg-admin-surface-2 px-3 py-2 text-sm text-admin-text">
            <option value="all">All Admins</option>
            {adminEmails.map((email) => <option key={email} value={email}>{email}</option>)}
          </select>
          <select value={resultFilter} onChange={(e) => setResultFilter(e.target.value as any)} className="rounded-lg border border-admin-border bg-admin-surface-2 px-3 py-2 text-sm text-admin-text">
            <option value="all">All Results</option>
            <option value="success">Success</option>
            <option value="failed">Failed</option>
          </select>
        </div>
        <div className="flex flex-wrap gap-2">
          {ACTION_TYPES.map((at) => (
            <button key={at.id} onClick={() => setActionFilter(at.id)} className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${actionFilter === at.id ? "border border-blue-500/30 bg-blue-500/20 text-blue-400" : "border border-admin-border bg-admin-surface-2 text-admin-text-dim hover:text-admin-text"}`}>
              {at.label}
            </button>
          ))}
        </div>
      </Card>

      <div className="space-y-3">
        {filtered.map((log, i) => {
          const dt = new Date(log.timestamp);
          return (
            <div key={log.id || i} className="flex gap-4 rounded-xl border border-admin-border bg-admin-surface p-4 transition-colors hover:border-blue-500/20">
              <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-xs font-semibold ${actionColor(log.actionType)}`}>
                {String(log.actionType || "?").slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-start justify-between gap-3">
                  <span className="text-sm font-medium text-admin-text">{log.summary}</span>
                  <Badge variant={log.result === "success" ? "green" : "red"}>{log.result}</Badge>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs text-admin-text-dim">
                  <span><span className="text-admin-text">{log.adminUser}</span></span>
                  <span><span className="text-admin-text">{log.target}</span></span>
                  <span>{Number.isNaN(dt.getTime()) ? "-" : dt.toLocaleString()}</span>
                  <span className={`rounded border px-2 py-0.5 text-[10px] font-medium ${actionColor(log.actionType)}`}>{String(log.actionType || "").replace(/_/g, " ")}</span>
                </div>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && <div className="py-12 text-center text-sm text-admin-text-dim">No audit logs match the current filters.</div>}
      </div>
    </div>
  );
}
