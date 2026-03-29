import { useState } from "react";
import { Card, Badge, Tabs, StatusBadge } from "~/components/admin/ui";
import { auditLogs, type AuditLog } from "~/components/admin/data/mockData";

const ACTION_TYPES = [
  { id: 'all',              label: 'All' },
  { id: 'market_resolve',   label: 'Market Resolve' },
  { id: 'market_void',      label: 'Market Void' },
  { id: 'bot_start',        label: 'Bot Start' },
  { id: 'bot_stop',         label: 'Bot Stop' },
  { id: 'user_suspend',     label: 'User Suspend' },
  { id: 'order_cancel',     label: 'Order Cancel' },
  { id: 'settlement_reset', label: 'Settlement Reset' },
  { id: 'config_change',    label: 'Config Change' },
];

const actionIcon = (type: AuditLog['actionType']) => {
  switch (type) {
    case 'market_resolve':   return '⚖️';
    case 'market_void':      return '🚫';
    case 'bot_start':        return '▶️';
    case 'bot_stop':         return '⏹️';
    case 'user_suspend':     return '🔒';
    case 'order_cancel':     return '❌';
    case 'settlement_reset': return '🔄';
    case 'config_change':    return '⚙️';
    default: return '📋';
  }
};

const actionColor = (type: AuditLog['actionType']) => {
  switch (type) {
    case 'market_resolve': return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
    case 'market_void':    return 'text-red-400 bg-red-500/10 border-red-500/20';
    case 'bot_start':      return 'text-blue-400 bg-blue-500/10 border-blue-500/20';
    case 'bot_stop':       return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
    case 'user_suspend':   return 'text-purple-400 bg-purple-500/10 border-purple-500/20';
    case 'order_cancel':   return 'text-red-400 bg-red-500/10 border-red-500/20';
    case 'settlement_reset': return 'text-orange-400 bg-orange-500/10 border-orange-500/20';
    case 'config_change':  return 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20';
    default: return 'text-admin-text-dim bg-admin-surface-2 border-admin-border';
  }
};

export default function AdminAuditLogs() {
  const [actionFilter, setActionFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [resultFilter, setResultFilter] = useState<'all' | 'success' | 'failed'>('all');
  const [adminFilter, setAdminFilter] = useState('all');

  const adminEmails = [...new Set(auditLogs.map(l => l.adminUser))];

  const filtered = auditLogs.filter(log => {
    if (actionFilter !== 'all' && log.actionType !== actionFilter) return false;
    if (resultFilter !== 'all' && log.result !== resultFilter) return false;
    if (adminFilter !== 'all' && log.adminUser !== adminFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return log.summary.toLowerCase().includes(q) || log.target.toLowerCase().includes(q) || log.adminUser.toLowerCase().includes(q);
    }
    return true;
  });

  // Stats
  const successCount = auditLogs.filter(l => l.result === 'success').length;
  const failedCount = auditLogs.filter(l => l.result === 'failed').length;
  const todayCount = auditLogs.filter(l => l.timestamp.startsWith('2026-03-26')).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-admin-text">Audit Logs</h1>
          <p className="text-sm text-admin-text-dim mt-1">Admin action history and accountability trail</p>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="px-3 py-1.5 rounded-lg bg-admin-surface border border-admin-border text-admin-text">
            📋 {auditLogs.length} Total
          </span>
          <span className="px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            ✅ {successCount} Success
          </span>
          <span className="px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400">
            ❌ {failedCount} Failed
          </span>
          <span className="px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400">
            📅 {todayCount} Today
          </span>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <div className="flex items-center gap-3 mb-3">
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search summary, target, or admin..."
            className="flex-1 bg-admin-surface-2 border border-admin-border rounded-lg px-3 py-2 text-sm text-admin-text placeholder:text-admin-text-dim"
          />
          <select
            value={adminFilter}
            onChange={e => setAdminFilter(e.target.value)}
            className="bg-admin-surface-2 border border-admin-border rounded-lg px-3 py-2 text-sm text-admin-text"
          >
            <option value="all">All Admins</option>
            {adminEmails.map(email => (
              <option key={email} value={email}>{email}</option>
            ))}
          </select>
          <select
            value={resultFilter}
            onChange={e => setResultFilter(e.target.value as any)}
            className="bg-admin-surface-2 border border-admin-border rounded-lg px-3 py-2 text-sm text-admin-text"
          >
            <option value="all">All Results</option>
            <option value="success">✅ Success</option>
            <option value="failed">❌ Failed</option>
          </select>
        </div>

        {/* Action type pills */}
        <div className="flex flex-wrap gap-2">
          {ACTION_TYPES.map(at => (
            <button
              key={at.id}
              onClick={() => setActionFilter(at.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                actionFilter === at.id
                  ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                  : 'bg-admin-surface-2 border border-admin-border text-admin-text-dim hover:text-admin-text'
              }`}
            >{at.label}</button>
          ))}
        </div>
      </Card>

      {/* Audit log timeline */}
      <div className="space-y-3">
        {filtered.map((log, i) => {
          const dt = new Date(log.timestamp);
          const timeStr = dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
          const dateStr = dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
          const prevLog = i > 0 ? filtered[i - 1] : null;
          const prevDate = prevLog ? new Date(prevLog.timestamp).toLocaleDateString() : null;
          const showDateHeader = dt.toLocaleDateString() !== prevDate;

          return (
            <div key={log.id}>
              {showDateHeader && (
                <div className="flex items-center gap-3 py-2">
                  <div className="h-px flex-1 bg-admin-border" />
                  <span className="text-xs font-medium text-admin-text-dim px-2">{dateStr}</span>
                  <div className="h-px flex-1 bg-admin-border" />
                </div>
              )}

              <div className="flex gap-4 p-4 rounded-xl bg-admin-surface border border-admin-border hover:border-blue-500/20 transition-colors">
                {/* Timeline dot */}
                <div className="flex flex-col items-center pt-1">
                  <div className={`w-8 h-8 rounded-lg border flex items-center justify-center text-sm ${actionColor(log.actionType)}`}>
                    {actionIcon(log.actionType)}
                  </div>
                  {i < filtered.length - 1 && <div className="w-px flex-1 bg-admin-border mt-2" />}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between mb-1">
                    <div>
                      <span className="text-sm font-medium text-admin-text">{log.summary}</span>
                    </div>
                    <Badge variant={log.result === 'success' ? 'emerald' : 'red'}>{log.result}</Badge>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-xs text-admin-text-dim mt-1">
                    <span className="flex items-center gap-1">
                      👤 <span className="text-admin-text">{log.adminUser}</span>
                    </span>
                    <span className="flex items-center gap-1">
                      🎯 <span className="text-admin-text">{log.target}</span>
                    </span>
                    <span className="flex items-center gap-1">
                      🕐 {timeStr}
                    </span>
                    <span className={`px-2 py-0.5 rounded border text-[10px] font-medium ${actionColor(log.actionType)}`}>
                      {log.actionType.replace(/_/g, ' ')}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="text-center py-12 text-admin-text-dim text-sm">No audit logs match the current filters.</div>
        )}
      </div>
    </div>
  );
}
