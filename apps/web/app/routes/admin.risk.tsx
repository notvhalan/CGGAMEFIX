import { useEffect, useMemo, useState } from "react";
import { Form, useActionData, useNavigation, useRouteLoaderData } from "@remix-run/react";
import { Badge, Button, Card } from "~/components/admin/ui";
import { alerts, markets } from "~/components/admin/data/mockData";

export { action } from "./admin";

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
  severity: "low" | "medium" | "high";
  enabled?: boolean;
}

const fallbackLimits: RiskLimit[] = [
  { id: "max-order-size", label: "Max Order Size", description: "Maximum single order quantity", category: "Orders", currentValue: 10000, unit: "contracts", min: 100, max: 100000, step: 100, severity: "high", enabled: true },
  { id: "max-position-size", label: "Max Position Size", description: "Maximum net position per user per market", category: "Positions", currentValue: 50000, unit: "contracts", min: 1000, max: 500000, step: 1000, severity: "high", enabled: true },
  { id: "max-open-orders", label: "Max Open Orders", description: "Maximum open orders per user", category: "Orders", currentValue: 200, unit: "orders", min: 10, max: 1000, step: 10, severity: "medium", enabled: true },
  { id: "spread-alert-threshold", label: "Spread Alert Threshold", description: "Alert when spread exceeds this percentage", category: "Market Quality", currentValue: 10, unit: "%", min: 1, max: 50, step: 1, severity: "medium", enabled: true },
  { id: "min-liquidity-warning", label: "Min Liquidity Warning", description: "Warn when market liquidity drops below this", category: "Market Quality", currentValue: 5000, unit: "GBP", min: 100, max: 100000, step: 500, severity: "low", enabled: true },
  { id: "bot-max-orders-per-min", label: "Bot Max Orders/Min", description: "Rate limit for bot order placement", category: "Bots", currentValue: 60, unit: "orders/min", min: 5, max: 500, step: 5, severity: "medium", enabled: true },
  { id: "settlement-timeout", label: "Settlement Timeout", description: "Maximum time for settlement processing", category: "Settlement", currentValue: 300, unit: "seconds", min: 30, max: 3600, step: 30, severity: "high", enabled: true },
  { id: "max-daily-trades", label: "Max Daily Trades", description: "Circuit breaker: max trades per market per day", category: "Circuit Breakers", currentValue: 50000, unit: "trades", min: 1000, max: 500000, step: 1000, severity: "high", enabled: true },
];

const severityBadge = (severity: string) => {
  if (severity === "high" || severity === "critical") return <Badge variant="red">{severity}</Badge>;
  if (severity === "medium" || severity === "warning") return <Badge variant="amber">{severity}</Badge>;
  return <Badge variant="blue">{severity}</Badge>;
};

export default function AdminRiskControls() {
  const parentData = useRouteLoaderData<any>("routes/admin");
  const actionData = useActionData<any>();
  const navigation = useNavigation();
  const liveLimits = actionData?.riskSettings || parentData?.adminSnapshot?.riskSettings || [];
  const [limits, setLimits] = useState<RiskLimit[]>(liveLimits.length > 0 ? liveLimits : fallbackLimits);
  const [hasChanges, setHasChanges] = useState(false);
  const isSaving = navigation.state === "submitting" && navigation.formData?.get("action") === "save-risk-controls";

  useEffect(() => {
    if (actionData?.riskSettings?.length) {
      setLimits(actionData.riskSettings);
      setHasChanges(false);
    }
  }, [actionData]);

  const liveMarkets = parentData?.adminSnapshot?.markets || markets;
  const riskSettingsJson = JSON.stringify(limits);
  const categories = useMemo(() => [...new Set(limits.map((l) => l.category))], [limits]);
  const wideSpreads = liveMarkets.filter((m: any) => Number(m.spread || 0) > 0.08).length;
  const lowLiqMarkets = liveMarkets.filter((m: any) => m.status === "active" && Number(m.liquidity || 0) < 10000).length;
  const criticalAlerts = alerts.filter((a) => a.severity === "critical" && !a.acknowledged).length;

  const updateLimit = (id: string, value: number) => {
    setLimits((prev) => prev.map((l) => l.id === id ? { ...l, currentValue: value } : l));
    setHasChanges(true);
  };

  const resetLimits = () => {
    setLimits(liveLimits.length > 0 ? liveLimits : fallbackLimits);
    setHasChanges(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-admin-text">Risk Controls</h1>
          <p className="mt-1 text-sm text-admin-text-dim">Configure trading limits, circuit breakers, and alert thresholds</p>
        </div>
        <div className="flex items-center gap-2">
          {actionData?.success && <span className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-400">Settings saved</span>}
          <Button variant="secondary" onClick={resetLimits} disabled={!hasChanges || isSaving}>Reset</Button>
          <Form method="post">
            <input type="hidden" name="action" value="save-risk-controls" />
            <input type="hidden" name="riskSettings" value={riskSettingsJson} />
            <Button type="submit" variant="primary" disabled={!hasChanges || isSaving}>{isSaving ? "Saving..." : "Save Changes"}</Button>
          </Form>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Risk Level", value: criticalAlerts > 0 ? "ELEVATED" : "NORMAL", color: criticalAlerts > 0 ? "text-amber-400" : "text-emerald-400" },
          { label: "Critical Alerts", value: criticalAlerts.toString(), color: criticalAlerts > 0 ? "text-red-400" : "text-emerald-400" },
          { label: "Wide Spreads", value: wideSpreads.toString(), color: wideSpreads > 0 ? "text-amber-400" : "text-emerald-400" },
          { label: "Low Liquidity", value: lowLiqMarkets.toString(), color: lowLiqMarkets > 0 ? "text-amber-400" : "text-emerald-400" },
        ].map((k) => (
          <div key={k.label} className="rounded-xl border border-admin-border bg-admin-surface p-4">
            <div className="mb-2 text-xs text-admin-text-dim">{k.label}</div>
            <div className={`text-xl font-bold ${k.color}`}>{k.value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          {categories.map((cat) => (
            <Card key={cat} title={cat} subtitle={`${limits.filter((l) => l.category === cat).length} configurable limits`}>
              <div className="space-y-4">
                {limits.filter((l) => l.category === cat).map((limit) => (
                  <div key={limit.id} className="rounded-lg border border-admin-border bg-admin-surface-2 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2 text-sm font-medium text-admin-text">
                          {limit.label}
                          {severityBadge(limit.severity)}
                        </div>
                        <div className="mt-0.5 text-xs text-admin-text-dim">{limit.description}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono text-lg font-bold text-admin-text">{Number(limit.currentValue).toLocaleString()}</div>
                        <div className="text-xs text-admin-text-dim">{limit.unit}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="w-14 font-mono text-xs text-admin-text-dim">{Number(limit.min).toLocaleString()}</span>
                      <input type="range" min={limit.min} max={limit.max} step={limit.step} value={limit.currentValue} onChange={(e) => updateLimit(limit.id, Number(e.target.value))} className="flex-1 accent-blue-500" />
                      <span className="w-16 text-right font-mono text-xs text-admin-text-dim">{Number(limit.max).toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>

        <div className="space-y-4">
          <Card title="Active Alerts" subtitle={`${alerts.filter((a) => !a.acknowledged).length} unacknowledged`}>
            <div className="space-y-2">
              {alerts.filter((a) => !a.acknowledged).map((alert) => (
                <div key={alert.id} className={`rounded-lg border p-3 ${alert.severity === "critical" ? "border-red-500/20 bg-red-500/10" : alert.severity === "warning" ? "border-amber-500/20 bg-amber-500/10" : "border-blue-500/20 bg-blue-500/10"}`}>
                  <div className="text-xs text-admin-text">{alert.message}</div>
                  <div className="mt-1 text-[10px] text-admin-text-dim">{new Date(alert.timestamp).toLocaleString()} - {alert.category}</div>
                </div>
              ))}
              {alerts.filter((a) => !a.acknowledged).length === 0 && <div className="py-6 text-center text-sm text-emerald-400">No unacknowledged alerts</div>}
            </div>
          </Card>
          <Card title="Circuit Breakers" subtitle="Configured auto-halt conditions">
            <div className="space-y-2">
              {["Market Halt", "Bot Kill Switch", "Wallet Freeze", "API Rate Limit"].map((label) => (
                <div key={label} className="flex items-center gap-3 rounded-lg bg-admin-surface-2 p-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  <div className="flex-1 text-sm text-admin-text">{label}</div>
                  <Badge variant="green">armed</Badge>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
