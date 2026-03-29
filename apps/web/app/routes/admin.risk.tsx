import { useState } from "react";
import { Card, Badge, Button } from "~/components/admin/ui";
import { markets, kpiData, alerts } from "~/components/admin/data/mockData";

interface RiskLimit {
  id: string;
  label: string;
  description: string;
  category: string;
  currentValue: number;
  unit: string;
  min: number;
  max: number;
  step: number;
  severity: 'low' | 'medium' | 'high';
}

const defaultLimits: RiskLimit[] = [
  { id: 'max-order-size', label: 'Max Order Size', description: 'Maximum single order quantity', category: 'Orders', currentValue: 10000, unit: 'contracts', min: 100, max: 100000, step: 100, severity: 'high' },
  { id: 'max-position-size', label: 'Max Position Size', description: 'Maximum net position per user per market', category: 'Positions', currentValue: 50000, unit: 'contracts', min: 1000, max: 500000, step: 1000, severity: 'high' },
  { id: 'max-open-orders', label: 'Max Open Orders', description: 'Maximum open orders per user', category: 'Orders', currentValue: 200, unit: 'orders', min: 10, max: 1000, step: 10, severity: 'medium' },
  { id: 'spread-alert-threshold', label: 'Spread Alert Threshold', description: 'Alert when spread exceeds this percentage', category: 'Market Quality', currentValue: 10, unit: '%', min: 1, max: 50, step: 1, severity: 'medium' },
  { id: 'min-liquidity-warning', label: 'Min Liquidity Warning', description: 'Warn when market liquidity drops below this', category: 'Market Quality', currentValue: 5000, unit: 'USD', min: 100, max: 100000, step: 500, severity: 'low' },
  { id: 'bot-max-orders-per-min', label: 'Bot Max Orders/Min', description: 'Rate limit for bot order placement', category: 'Bots', currentValue: 60, unit: 'orders/min', min: 5, max: 500, step: 5, severity: 'medium' },
  { id: 'settlement-timeout', label: 'Settlement Timeout', description: 'Maximum time for settlement processing', category: 'Settlement', currentValue: 300, unit: 'seconds', min: 30, max: 3600, step: 30, severity: 'high' },
  { id: 'max-daily-trades', label: 'Max Daily Trades', description: 'Circuit breaker: max trades per market per day', category: 'Circuit Breakers', currentValue: 50000, unit: 'trades', min: 1000, max: 500000, step: 1000, severity: 'high' },
];

interface AlertRule {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
  severity: 'critical' | 'warning' | 'info';
}

const defaultAlertRules: AlertRule[] = [
  { id: 'settlement-failure', label: 'Settlement Failure', description: 'Alert when any settlement fails', enabled: true, severity: 'critical' },
  { id: 'bot-session-error', label: 'Bot Session Error', description: 'Alert when a bot session encounters an error', enabled: true, severity: 'critical' },
  { id: 'wide-spread', label: 'Wide Spread Detection', description: 'Alert when spread exceeds threshold', enabled: true, severity: 'warning' },
  { id: 'low-liquidity', label: 'Low Liquidity Warning', description: 'Alert when market liquidity is below minimum', enabled: true, severity: 'warning' },
  { id: 'market-suspended', label: 'Market Suspended', description: 'Alert when a market transitions to suspended', enabled: true, severity: 'warning' },
  { id: 'new-user-signup', label: 'New User Signup', description: 'Alert on new user registration', enabled: false, severity: 'info' },
  { id: 'high-volume-trade', label: 'High Volume Trade', description: 'Alert when a single trade exceeds 1000 contracts', enabled: true, severity: 'warning' },
  { id: 'service-degraded', label: 'Service Degraded', description: 'Alert when any service health is degraded', enabled: true, severity: 'critical' },
];

export default function AdminRiskControls() {
  const [limits, setLimits] = useState(defaultLimits);
  const [alertRules, setAlertRules] = useState(defaultAlertRules);
  const [hasChanges, setHasChanges] = useState(false);
  const [saved, setSaved] = useState(false);

  const updateLimit = (id: string, value: number) => {
    setLimits(prev => prev.map(l => l.id === id ? { ...l, currentValue: value } : l));
    setHasChanges(true);
    setSaved(false);
  };

  const toggleAlert = (id: string) => {
    setAlertRules(prev => prev.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r));
    setHasChanges(true);
    setSaved(false);
  };

  const handleSave = () => {
    setHasChanges(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleReset = () => {
    setLimits(defaultLimits);
    setAlertRules(defaultAlertRules);
    setHasChanges(false);
    setSaved(false);
  };

  // Current risk indicators
  const wideSpreads = markets.filter(m => m.spread > 0.08).length;
  const lowLiqMarkets = markets.filter(m => m.status === 'active' && m.liquidity < 10000).length;
  const criticalAlerts = alerts.filter(a => a.severity === 'critical' && !a.acknowledged).length;

  const severityBadge = (sev: string) => {
    switch (sev) {
      case 'critical': return <Badge variant="red">Critical</Badge>;
      case 'high':     return <Badge variant="red">High</Badge>;
      case 'warning':  return <Badge variant="amber">Warning</Badge>;
      case 'medium':   return <Badge variant="amber">Medium</Badge>;
      case 'info':     return <Badge variant="blue">Info</Badge>;
      case 'low':      return <Badge variant="blue">Low</Badge>;
      default:         return <Badge variant="gray">{sev}</Badge>;
    }
  };

  const categories = [...new Set(limits.map(l => l.category))];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-admin-text">Risk Controls</h1>
          <p className="text-sm text-admin-text-dim mt-1">Configure trading limits, circuit breakers, and alert rules</p>
        </div>
        <div className="flex items-center gap-2">
          {saved && (
            <span className="text-xs text-emerald-400 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              ✅ Settings saved
            </span>
          )}
          <Button variant="secondary" onClick={handleReset} disabled={!hasChanges}>Reset</Button>
          <Button variant="primary" onClick={handleSave} disabled={!hasChanges}>
            💾 Save Changes
          </Button>
        </div>
      </div>

      {/* Risk status overview */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Risk Level', value: criticalAlerts > 0 ? 'ELEVATED' : 'NORMAL', color: criticalAlerts > 0 ? 'text-amber-400' : 'text-emerald-400', bg: criticalAlerts > 0 ? 'bg-amber-500/10 border-amber-500/20' : 'bg-emerald-500/10 border-emerald-500/20', icon: '🛡️' },
          { label: 'Critical Alerts', value: criticalAlerts.toString(), color: criticalAlerts > 0 ? 'text-red-400' : 'text-emerald-400', bg: criticalAlerts > 0 ? 'bg-red-500/10 border-red-500/20' : 'bg-admin-surface border-admin-border', icon: '🚨' },
          { label: 'Wide Spreads', value: wideSpreads.toString(), color: wideSpreads > 0 ? 'text-amber-400' : 'text-emerald-400', bg: 'bg-admin-surface border-admin-border', icon: '📐' },
          { label: 'Low Liquidity', value: lowLiqMarkets.toString(), color: lowLiqMarkets > 0 ? 'text-amber-400' : 'text-emerald-400', bg: 'bg-admin-surface border-admin-border', icon: '💧' },
        ].map(k => (
          <div key={k.label} className={`rounded-xl p-4 border ${k.bg}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-admin-text-dim">{k.label}</span>
              <span className="text-lg">{k.icon}</span>
            </div>
            <div className={`text-xl font-bold ${k.color}`}>{k.value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Trading Limits (2 cols) */}
        <div className="xl:col-span-2 space-y-4">
          {categories.map(cat => (
            <Card key={cat} title={`${cat}`} subtitle={`${limits.filter(l => l.category === cat).length} configurable limits`}>
              <div className="space-y-4">
                {limits.filter(l => l.category === cat).map(limit => (
                  <div key={limit.id} className="p-3 rounded-lg bg-admin-surface-2 border border-admin-border">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <div className="text-sm font-medium text-admin-text flex items-center gap-2">
                          {limit.label}
                          {severityBadge(limit.severity)}
                        </div>
                        <div className="text-xs text-admin-text-dim mt-0.5">{limit.description}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-mono font-bold text-admin-text">
                          {limit.currentValue.toLocaleString()}
                        </div>
                        <div className="text-xs text-admin-text-dim">{limit.unit}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-xs text-admin-text-dim font-mono w-12">{limit.min.toLocaleString()}</span>
                      <input
                        type="range"
                        min={limit.min}
                        max={limit.max}
                        step={limit.step}
                        value={limit.currentValue}
                        onChange={e => updateLimit(limit.id, Number(e.target.value))}
                        className="flex-1 h-2 bg-admin-surface-3 rounded-full appearance-none cursor-pointer accent-blue-500"
                      />
                      <span className="text-xs text-admin-text-dim font-mono w-16 text-right">{limit.max.toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>

        {/* Alert Rules (1 col) */}
        <div className="space-y-4">
          <Card title="🔔 Alert Rules" subtitle="Enable/disable alert conditions">
            <div className="space-y-2">
              {alertRules.map(rule => (
                <div key={rule.id} className={`p-3 rounded-lg border transition-colors ${rule.enabled ? 'bg-admin-surface-2 border-admin-border' : 'bg-admin-surface border-admin-border opacity-60'}`}>
                  <div className="flex items-start gap-3">
                    <button
                      onClick={() => toggleAlert(rule.id)}
                      className={`mt-0.5 w-10 h-5 rounded-full transition-colors flex-shrink-0 relative ${
                        rule.enabled ? 'bg-blue-500' : 'bg-admin-surface-3'
                      }`}
                    >
                      <span className={`absolute w-4 h-4 rounded-full bg-white top-0.5 transition-transform ${
                        rule.enabled ? 'left-5.5 translate-x-0' : 'left-0.5'
                      }`} style={{ left: rule.enabled ? '22px' : '2px' }} />
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-admin-text">{rule.label}</span>
                        {severityBadge(rule.severity)}
                      </div>
                      <div className="text-xs text-admin-text-dim mt-0.5">{rule.description}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Active Alerts */}
          <Card title="🚨 Active Alerts" subtitle={`${alerts.filter(a => !a.acknowledged).length} unacknowledged`}>
            <div className="space-y-2">
              {alerts.filter(a => !a.acknowledged).map(alert => (
                <div key={alert.id} className={`p-3 rounded-lg border ${
                  alert.severity === 'critical' ? 'bg-red-500/10 border-red-500/20' :
                  alert.severity === 'warning' ? 'bg-amber-500/10 border-amber-500/20' :
                  'bg-blue-500/10 border-blue-500/20'
                }`}>
                  <div className="flex items-start gap-2">
                    <span className="text-sm">{alert.severity === 'critical' ? '🔴' : alert.severity === 'warning' ? '🟡' : '🔵'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-admin-text">{alert.message}</div>
                      <div className="text-[10px] text-admin-text-dim mt-1">{new Date(alert.timestamp).toLocaleString()} · {alert.category}</div>
                    </div>
                  </div>
                </div>
              ))}
              {alerts.filter(a => !a.acknowledged).length === 0 && (
                <div className="text-center py-6 text-emerald-400 text-sm">✅ No unacknowledged alerts</div>
              )}
            </div>
          </Card>

          {/* Circuit Breaker Status */}
          <Card title="⚡ Circuit Breakers" subtitle="Auto-halt conditions">
            <div className="space-y-2">
              {[
                { label: 'Market Halt', status: 'armed', description: 'Halts trading if >50K trades/day' },
                { label: 'Bot Kill Switch', status: 'armed', description: 'Stops all bots on settlement failure' },
                { label: 'Wallet Freeze', status: 'armed', description: 'Freezes withdrawals on anomaly' },
                { label: 'API Rate Limit', status: 'active', description: 'Currently rate-limiting 2 IPs' },
              ].map(cb => (
                <div key={cb.label} className="flex items-center gap-3 p-2 rounded-lg bg-admin-surface-2">
                  <span className={`w-2 h-2 rounded-full ${cb.status === 'active' ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-admin-text">{cb.label}</div>
                    <div className="text-xs text-admin-text-dim">{cb.description}</div>
                  </div>
                  <Badge variant={cb.status === 'active' ? 'amber' : 'emerald'}>{cb.status}</Badge>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
