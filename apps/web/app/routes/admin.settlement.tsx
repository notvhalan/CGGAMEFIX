import { useState } from "react";
import { Form, useNavigation, useRouteLoaderData } from "@remix-run/react";
import { Card, Badge, StatusBadge, Tabs, DataTable, Button } from "~/components/admin/ui";
import { settlements, type Settlement } from "~/components/admin/data/mockData";

// Re-export action from parent layout so Form POST submissions work (avoids 405)
export { action } from "./admin";

const TABS = [
  { id: 'all',       label: 'All',       count: settlements.length },
  { id: 'awaiting',  label: 'Awaiting',  count: settlements.filter(s => s.status === 'awaiting').length },
  { id: 'resolved',  label: 'Resolved',  count: settlements.filter(s => s.status === 'resolved').length },
  { id: 'failed',    label: 'Failed',    count: settlements.filter(s => ['failed'].includes(s.status)).length },
  { id: 'voided',    label: 'Voided',    count: settlements.filter(s => s.status === 'voided').length },
];

export default function AdminSettlement() {
  const parentData = useRouteLoaderData<any>("routes/admin");
  const navigation = useNavigation();
  const [tab, setTab] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedSettlement, setSelectedSettlement] = useState<Settlement | null>(null);
  const [resolveOutcome, setResolveOutcome] = useState<'YES' | 'NO'>('YES');

  const isResolving = navigation.state === 'submitting' && navigation.formData?.get('action') === 'resolveMarket';
  const isVoiding = navigation.state === 'submitting' && navigation.formData?.get('action') === 'voidMarket';
  const isResetting = navigation.state === 'submitting' && navigation.formData?.get('action') === 'resetMarketStatus';

  // Merge real markets from loader (for maturity/status) with mock settlements
  const enrichedSettlements = settlements.map(s => {
    const realMarket = parentData?.markets?.find((m: any) => m.id === s.marketId);
    return { ...s, realMarketName: realMarket?.question || s.marketName };
  });

  const filtered = enrichedSettlements.filter(s => {
    if (tab !== 'all' && s.status !== tab) return false;
    if (search) {
      const q = search.toLowerCase();
      return s.marketName.toLowerCase().includes(q) || s.id.toLowerCase().includes(q);
    }
    return true;
  });

  // Stats
  const totalImpacted = settlements.reduce((a, s) => a + (s.impactedAccounts || 0), 0);
  const failedCount = settlements.filter(s => s.settlementStatus === 'failed' || s.settlementStatus === 'retrying').length;

  const settlementStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-emerald-400';
      case 'processing': return 'text-blue-400';
      case 'pending': return 'text-amber-400';
      case 'retrying': return 'text-orange-400';
      case 'failed': return 'text-red-400';
      default: return 'text-admin-text-dim';
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-admin-text">Settlement</h1>
          <p className="text-sm text-admin-text-dim mt-1">Manage market resolution, payouts, and settlement status</p>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            ✅ {settlements.filter(s => s.settlementStatus === 'completed').length} Completed
          </span>
          <span className="px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20">
            ❌ {failedCount} Failed/Retrying
          </span>
          <span className="px-3 py-1.5 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
            👥 {totalImpacted} Accounts Impacted
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Main settlement table */}
        <div className="xl:col-span-2 space-y-4">
          {/* Search + Tabs */}
          <Card>
            <div className="flex items-center gap-3 mb-3">
              <input
                type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search markets..."
                className="flex-1 bg-admin-surface-2 border border-admin-border rounded-lg px-3 py-2 text-sm text-admin-text placeholder:text-admin-text-dim"
              />
            </div>
            <Tabs tabs={TABS} activeTab={tab} onTabChange={setTab} />
          </Card>

          {/* Settlement List */}
          <div className="space-y-2">
            {filtered.map(s => (
              <div
                key={s.id}
                onClick={() => setSelectedSettlement(s)}
                className={`p-4 rounded-xl border cursor-pointer transition-colors ${
                  selectedSettlement?.id === s.id
                    ? 'bg-blue-500/5 border-blue-500/30'
                    : 'bg-admin-surface border-admin-border hover:border-admin-border hover:bg-admin-surface-2'
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-admin-text truncate">{s.marketName}</span>
                      <StatusBadge status={s.status} />
                    </div>
                    <div className="text-xs text-admin-text-dim mt-0.5 font-mono">{s.id} · {s.marketId}</div>
                  </div>
                  <div className="text-right">
                    <div className={`text-sm font-medium ${settlementStatusColor(s.settlementStatus)}`}>
                      {s.settlementStatus === 'completed' && '✅ '}
                      {s.settlementStatus === 'failed' && '❌ '}
                      {s.settlementStatus === 'retrying' && '🔄 '}
                      {s.settlementStatus === 'pending' && '⏳ '}
                      {s.settlementStatus === 'processing' && '⚙️ '}
                      {s.settlementStatus.charAt(0).toUpperCase() + s.settlementStatus.slice(1)}
                    </div>
                    {s.outcome && <div className="text-xs text-admin-text-dim">Outcome: <span className="font-medium text-admin-text">{s.outcome}</span></div>}
                  </div>
                </div>

                <div className="flex items-center gap-4 text-xs text-admin-text-dim">
                  <span>📅 Maturity: <span className="text-admin-text">{s.maturityDate}</span></span>
                  {s.impactedAccounts && <span>👥 {s.impactedAccounts} accounts</span>}
                  <span>🕐 Updated: {new Date(s.lastUpdated).toLocaleString()}</span>
                </div>

                {s.errorMessage && (
                  <div className="mt-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
                    ⚠️ {s.errorMessage}
                  </div>
                )}
              </div>
            ))}

            {filtered.length === 0 && (
              <div className="text-center py-12 text-admin-text-dim text-sm">No settlements match the current filter.</div>
            )}
          </div>
        </div>

        {/* Right panel: Actions */}
        <div className="space-y-4">
          {/* Resolve Market */}
          <Card title="⚖️ Resolve Market" subtitle="Settle a market with an outcome">
            <Form method="post" className="space-y-3">
              <input type="hidden" name="action" value="resolveMarket" />

              <div>
                <label className="block text-xs font-medium text-admin-text-dim mb-1">Market</label>
                <select
                  name="marketId"
                  className="w-full bg-admin-surface-2 border border-admin-border rounded-lg px-3 py-2 text-sm text-admin-text"
                  defaultValue={selectedSettlement?.marketId || ''}
                >
                  <option value="">Select a market...</option>
                  {(parentData?.markets || []).map((m: any) => (
                    <option key={m.id} value={m.id}>{m.question || m.id}</option>
                  ))}
                  {enrichedSettlements.filter(s => s.status === 'awaiting').map(s => (
                    <option key={`s-${s.marketId}`} value={s.marketId}>{s.marketName}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-admin-text-dim mb-1">Outcome</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setResolveOutcome('YES')}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                      resolveOutcome === 'YES'
                        ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                        : 'bg-admin-surface-2 border-admin-border text-admin-text-dim hover:border-emerald-500/20'
                    }`}
                  >✅ YES</button>
                  <button
                    type="button"
                    onClick={() => setResolveOutcome('NO')}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                      resolveOutcome === 'NO'
                        ? 'bg-red-500/20 border-red-500/40 text-red-400'
                        : 'bg-admin-surface-2 border-admin-border text-admin-text-dim hover:border-red-500/20'
                    }`}
                  >❌ NO</button>
                </div>
                <input type="hidden" name="outcome" value={resolveOutcome} />
              </div>

              <Button type="submit" variant="primary" className="w-full" disabled={isResolving}>
                {isResolving ? '⏳ Resolving...' : '⚖️ Resolve Market'}
              </Button>
            </Form>
          </Card>

          {/* Void Market */}
          <Card title="🚫 Void Market" subtitle="Cancel and refund all positions">
            <Form method="post" className="space-y-3">
              <input type="hidden" name="action" value="voidMarket" />

              <div>
                <label className="block text-xs font-medium text-admin-text-dim mb-1">Market</label>
                <select
                  name="marketId"
                  className="w-full bg-admin-surface-2 border border-admin-border rounded-lg px-3 py-2 text-sm text-admin-text"
                  defaultValue={selectedSettlement?.marketId || ''}
                >
                  <option value="">Select a market...</option>
                  {(parentData?.markets || []).map((m: any) => (
                    <option key={m.id} value={m.id}>{m.question || m.id}</option>
                  ))}
                </select>
              </div>

              <div className="px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-400">
                ⚠️ Voiding a market will refund all positions. This action cannot be undone.
              </div>

              <Button type="submit" variant="danger" className="w-full" disabled={isVoiding}>
                {isVoiding ? '⏳ Voiding...' : '🚫 Void Market'}
              </Button>
            </Form>
          </Card>

          {/* Reset Failed */}
          <Card title="🔄 Reset Failed Settlement" subtitle="Retry a failed settlement">
            <Form method="post" className="space-y-3">
              <input type="hidden" name="action" value="resetMarketStatus" />

              <div>
                <label className="block text-xs font-medium text-admin-text-dim mb-1">Failed Settlement</label>
                <select
                  name="marketId"
                  className="w-full bg-admin-surface-2 border border-admin-border rounded-lg px-3 py-2 text-sm text-admin-text"
                >
                  <option value="">Select failed settlement...</option>
                  {enrichedSettlements
                    .filter(s => s.settlementStatus === 'failed' || s.settlementStatus === 'retrying')
                    .map(s => (
                      <option key={s.id} value={s.marketId}>
                        {s.marketName} ({s.settlementStatus})
                      </option>
                    ))
                  }
                </select>
              </div>

              <Button type="submit" variant="secondary" className="w-full" disabled={isResetting}>
                {isResetting ? '⏳ Resetting...' : '🔄 Reset & Retry'}
              </Button>
            </Form>
          </Card>

          {/* Settlement Pipeline */}
          <Card title="📊 Settlement Pipeline" subtitle="Processing overview">
            <div className="space-y-3">
              {[
                { label: 'Pending', count: settlements.filter(s => s.settlementStatus === 'pending').length, color: 'bg-amber-500', icon: '⏳' },
                { label: 'Processing', count: settlements.filter(s => s.settlementStatus === 'processing').length, color: 'bg-blue-500', icon: '⚙️' },
                { label: 'Completed', count: settlements.filter(s => s.settlementStatus === 'completed').length, color: 'bg-emerald-500', icon: '✅' },
                { label: 'Retrying', count: settlements.filter(s => s.settlementStatus === 'retrying').length, color: 'bg-orange-500', icon: '🔄' },
                { label: 'Failed', count: settlements.filter(s => s.settlementStatus === 'failed').length, color: 'bg-red-500', icon: '❌' },
              ].map(row => (
                <div key={row.label} className="flex items-center gap-3">
                  <span className="text-sm">{row.icon}</span>
                  <span className="text-sm text-admin-text flex-1">{row.label}</span>
                  <span className="text-sm font-mono font-medium text-admin-text">{row.count}</span>
                  <div className="w-20 h-1.5 rounded-full bg-admin-surface-2 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${row.color}`}
                      style={{ width: `${settlements.length ? (row.count / settlements.length) * 100 : 0}%` }}
                    />
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
