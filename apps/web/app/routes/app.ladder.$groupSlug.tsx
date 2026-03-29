import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, Link, useFetcher } from "@remix-run/react";
import { useState, useMemo, useCallback, useRef, useEffect, memo } from "react";
import type { MetaFunction } from "@remix-run/node";
import { getLadder, submitIntervalOrder } from "~/lib/api.server";
import type { LadderPoint, LadderInterval, LadderData } from "~/lib/api.server";
import "~/styles/pages/ladder.css";

// ── Meta ────────────────────────────────────────────────────────
export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: data?.ladder ? `${data.ladder.title} — Ladder — GameFix` : "Ladder — GameFix" },
];

// ── Loader ──────────────────────────────────────────────────────
export async function loader({ params }: LoaderFunctionArgs) {
  const groupSlug = params.groupSlug ?? "";
  const ladder = await getLadder(groupSlug);
  return json({ ladder, groupSlug });
}

// ── Action (interval order submission) ──────────────────────────
export async function action({ request, params }: ActionFunctionArgs) {
  const formData = await request.formData();
  const groupSlug = params.groupSlug ?? "";
  const startMaturity = formData.get("startMaturity") as string | null;
  const endMaturity = formData.get("endMaturity") as string;
  const direction = formData.get("direction") as "BUY" | "SELL";
  const contracts = Number(formData.get("contracts") || 1);
  const executionMode = (formData.get("executionMode") as string) || "submit";

  try {
    const result = await submitIntervalOrder(request, {
      groupSlug,
      startMaturity: startMaturity || null,
      endMaturity,
      direction,
      contracts,
      executionMode: executionMode as "quote_only" | "submit",
    });
    return json({ success: true, result });
  } catch (e: any) {
    return json({ success: false, error: e.message || "Order failed" }, { status: 400 });
  }
}

// ── Helpers ─────────────────────────────────────────────────────
function fmtDate(iso: string) {
  const d = new Date(iso);
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]}`;
}
function fmtPence(p: number) {
  if (p >= 100_00) return `£${(p / 100).toLocaleString("en-GB", { minimumFractionDigits: 0 })}`;
  return `${p}p`;
}
function pct(n: number | null) {
  if (n == null) return "—";
  return `${n.toFixed(1)}%`;
}

// ── Chart (SVG) ─────────────────────────────────────────────────
const LadderChart = memo(function LadderChart({ points }: { points: LadderPoint[] }) {
  if (points.length < 2) return <div className="ldr-chart-empty">Need at least 2 data points for a chart</div>;

  const W = 700, H = 220, PL = 44, PR = 12, PT = 12, PB = 28;
  const cw = W - PL - PR;
  const ch = H - PT - PB;

  const maxY = Math.max(100, ...points.map(p => Math.max(p.fittedYes, p.rawYes ?? 0)));

  const toX = (i: number) => PL + (i / (points.length - 1)) * cw;
  const toY = (v: number) => PT + ch - (v / maxY) * ch;

  // Fitted line path
  const fittedPath = points.map((p, i) =>
    `${i === 0 ? "M" : "L"} ${toX(i).toFixed(1)} ${toY(p.fittedYes).toFixed(1)}`
  ).join(" ");

  // Raw dots
  const rawDots = points
    .map((p, i) => p.rawYes != null ? { x: toX(i), y: toY(p.rawYes), violated: p.violated, val: p.rawYes } : null)
    .filter(Boolean) as { x: number; y: number; violated: boolean; val: number }[];

  // Y-axis ticks
  const yTicks: number[] = [];
  const step = maxY <= 50 ? 10 : maxY <= 100 ? 20 : 25;
  for (let v = 0; v <= maxY; v += step) yTicks.push(v);

  // X-axis labels (show every Nth)
  const xLabelInterval = Math.max(1, Math.floor(points.length / 8));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="ldr-chart-canvas" preserveAspectRatio="xMidYMid meet">
      {/* Grid */}
      {yTicks.map(v => (
        <g key={v}>
          <line x1={PL} y1={toY(v)} x2={W - PR} y2={toY(v)} stroke="rgba(255,255,255,0.06)" />
          <text x={PL - 6} y={toY(v) + 4} textAnchor="end" fill="#8b9ab5" fontSize="9">{v}%</text>
        </g>
      ))}

      {/* Fitted line */}
      <path d={fittedPath} fill="none" stroke="#4ade80" strokeWidth="2" />

      {/* Area under fitted line */}
      <path
        d={`${fittedPath} L ${toX(points.length - 1).toFixed(1)} ${toY(0).toFixed(1)} L ${toX(0).toFixed(1)} ${toY(0).toFixed(1)} Z`}
        fill="rgba(74,222,128,0.08)"
      />

      {/* Raw dots */}
      {rawDots.map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r="3.5"
          fill={d.violated ? "#f87171" : "#4ea8de"}
          stroke={d.violated ? "#f87171" : "#4ea8de"}
          strokeWidth="1"
          opacity="0.85"
        />
      ))}

      {/* X labels */}
      {points.map((p, i) =>
        i % xLabelInterval === 0 ? (
          <text key={i} x={toX(i)} y={H - 4} textAnchor="middle" fill="#8b9ab5" fontSize="9">
            {fmtDate(p.maturity)}
          </text>
        ) : null
      )}
    </svg>
  );
});

// ── By-Date Table ───────────────────────────────────────────────
const ByDateTable = memo(function ByDateTable({
  points,
  onTradeClick,
}: {
  points: LadderPoint[];
  onTradeClick: (marketId: string) => void;
}) {
  return (
    <div className="ldr-table-section">
      <div className="ldr-table-header">
        <h3>Maturity Ladder</h3>
      </div>
      <table className="ldr-table">
        <thead>
          <tr>
            <th>Maturity</th>
            <th>Raw YES</th>
            <th>Fitted YES</th>
            <th>Interval Prob</th>
            <th>Bid</th>
            <th>Ask</th>
            <th>OI</th>
            <th style={{ textAlign: "right" }}>Action</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.marketId}>
              <td style={{ fontWeight: 600, whiteSpace: "nowrap" }}>
                <Link to={`/app/markets/${p.marketId}`}
                  style={{ color: "var(--text-primary)", textDecoration: "none" }}>
                  {fmtDate(p.maturity)}
                </Link>
              </td>
              <td className={p.violated ? "violated" : ""}>
                <div className="ldr-pct-bar-cell">
                  <span>{pct(p.rawYes)}</span>
                  {p.rawYes != null && (
                    <div className="ldr-pct-bar">
                      <div className="ldr-pct-bar-fill" style={{ width: `${Math.min(100, p.rawYes)}%` }} />
                    </div>
                  )}
                </div>
              </td>
              <td>
                <div className="ldr-pct-bar-cell">
                  <span>{pct(p.fittedYes)}</span>
                  <div className="ldr-pct-bar">
                    <div className="ldr-pct-bar-fill fitted" style={{ width: `${Math.min(100, p.fittedYes)}%` }} />
                  </div>
                </div>
              </td>
              <td style={{ fontFamily: "'JetBrains Mono', monospace" }}>{pct(p.intervalProb)}</td>
              <td style={{ color: p.bestBidYes != null ? "#10b981" : "var(--text-secondary)" }}>
                {pct(p.bestBidYes)}
              </td>
              <td style={{ color: p.bestAskYes != null ? "#ef4444" : "var(--text-secondary)" }}>
                {pct(p.bestAskYes)}
              </td>
              <td style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                {fmtPence(p.openInterestPence)}
              </td>
              <td style={{ textAlign: "right" }}>
                <button className="ldr-btn ldr-btn-buy" onClick={() => onTradeClick(p.marketId)}>
                  Trade
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});

// ── Interval Table ──────────────────────────────────────────────
const IntervalTable = memo(function IntervalTable({
  intervals,
  onBuy,
  onSell,
}: {
  intervals: LadderInterval[];
  onBuy: (interval: LadderInterval) => void;
  onSell: (interval: LadderInterval) => void;
}) {
  return (
    <div className="ldr-table-section">
      <div className="ldr-table-header">
        <h3>Interval Trading</h3>
      </div>
      <div>
        {/* Header row */}
        <div className="ldr-interval-row" style={{ borderBottom: "1px solid var(--border-primary)", background: "rgba(0,0,0,0.2)" }}>
          <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--text-secondary)" }}>Interval</span>
          <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--text-secondary)" }}>Implied %</span>
          <span></span>
          <span></span>
        </div>
        {intervals.map((iv, i) => (
          <div key={i} className="ldr-interval-row">
            <span className="ldr-interval-label">{iv.label}</span>
            <span className="ldr-interval-pct">{pct(iv.price)}</span>
            <button className="ldr-btn ldr-btn-buy" onClick={() => onBuy(iv)}>Buy</button>
            <button className="ldr-btn ldr-btn-sell" onClick={() => onSell(iv)}>Sell</button>
          </div>
        ))}
      </div>
    </div>
  );
});

// ── Trade Modal ─────────────────────────────────────────────────
function IntervalTradeModal({
  interval,
  direction,
  groupSlug,
  onClose,
}: {
  interval: LadderInterval;
  direction: "BUY" | "SELL";
  groupSlug: string;
  onClose: () => void;
}) {
  const fetcher = useFetcher();
  const [contracts, setContracts] = useState(1);

  const legs = direction === "BUY" ? interval.buyLegs : interval.sellLegs;
  const isSubmitting = fetcher.state !== "idle";
  const result = fetcher.data as { success?: boolean; error?: string; result?: any } | undefined;

  useEffect(() => {
    if (result?.success) {
      // Auto-close after brief display
      const t = setTimeout(onClose, 1500);
      return () => clearTimeout(t);
    }
  }, [result, onClose]);

  const handleSubmit = useCallback(() => {
    const formData = new FormData();
    formData.set("startMaturity", interval.startMaturity ?? "");
    formData.set("endMaturity", interval.endMaturity);
    formData.set("direction", direction);
    formData.set("contracts", String(contracts));
    formData.set("executionMode", "submit");
    fetcher.submit(formData, { method: "POST" });
  }, [fetcher, interval, direction, contracts]);

  return (
    <div className="ldr-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ldr-modal">
        <div className="ldr-modal-header">
          <h3>{direction === "BUY" ? "Buy" : "Sell"} Interval</h3>
          <button className="ldr-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="ldr-modal-body">
          <div className="ldr-modal-row">
            <span className="label">Interval</span>
            <span className="value">{interval.label}</span>
          </div>
          <div className="ldr-modal-row">
            <span className="label">Implied probability</span>
            <span className="value">{pct(interval.price)}</span>
          </div>
          <div className="ldr-modal-row">
            <span className="label">Direction</span>
            <span className="value" style={{ color: direction === "BUY" ? "#10b981" : "#ef4444" }}>
              {direction}
            </span>
          </div>

          <hr className="ldr-modal-divider" />

          <div className="ldr-contracts-input">
            <label>Contracts:</label>
            <input
              type="number"
              min={1}
              max={10000}
              value={contracts}
              onChange={(e) => setContracts(Math.max(1, Math.min(10000, Number(e.target.value) || 1)))}
            />
          </div>

          <hr className="ldr-modal-divider" />

          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Synthetic Legs ({legs.length})
          </div>

          {legs.map((leg, i) => (
            <div key={i} className="ldr-modal-leg">
              <div className="ldr-modal-leg-title">Leg {i + 1}</div>
              <div className="ldr-modal-row">
                <span className="label">Market</span>
                <span className="value" style={{ fontSize: 11 }}>{leg.marketId.slice(0, 8)}…</span>
              </div>
              <div className="ldr-modal-row">
                <span className="label">Side</span>
                <span className="value" style={{ color: leg.side === "BUY_YES" ? "#10b981" : "#ef4444" }}>
                  {leg.side.replace("_", " ")}
                </span>
              </div>
              <div className="ldr-modal-row">
                <span className="label">Qty</span>
                <span className="value">{contracts} × {leg.ratio}</span>
              </div>
            </div>
          ))}

          <div className="ldr-modal-warning">
            ⚠️ This trade is executed as {legs.length} linked orders and may experience partial fill risk.
            The second leg is NOT guaranteed to fill.
          </div>

          {result?.success && (
            <div style={{ background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.3)", borderRadius: 4, padding: "10px 12px", marginTop: 12, fontSize: 13, color: "#10b981" }}>
              ✓ Order submitted successfully
            </div>
          )}

          {result && !result.success && (
            <div style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 4, padding: "10px 12px", marginTop: 12, fontSize: 13, color: "#ef4444" }}>
              ✗ {result.error || "Order failed"}
            </div>
          )}
        </div>
        <div className="ldr-modal-footer">
          <button className="ldr-btn" onClick={onClose} style={{ color: "var(--text-secondary)" }}>
            Cancel
          </button>
          <button
            className={`ldr-btn-submit ${direction.toLowerCase()}`}
            onClick={handleSubmit}
            disabled={isSubmitting || result?.success}
            style={{ width: "auto", padding: "8px 28px" }}
          >
            {isSubmitting ? "Submitting…" : `${direction} ${contracts} contract${contracts > 1 ? "s" : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────
export default function LadderDetail() {
  const { ladder, groupSlug } = useLoaderData<typeof loader>();
  const [tab, setTab] = useState<"by-date" | "intervals">("by-date");
  const [tradeModal, setTradeModal] = useState<{
    interval: LadderInterval;
    direction: "BUY" | "SELL";
  } | null>(null);

  const handleTradeClick = useCallback((marketId: string) => {
    // Navigate to single-market trade page
    window.location.href = `/app/markets/${marketId}`;
  }, []);

  const handleIntervalBuy = useCallback((iv: LadderInterval) => {
    setTradeModal({ interval: iv, direction: "BUY" });
  }, []);

  const handleIntervalSell = useCallback((iv: LadderInterval) => {
    setTradeModal({ interval: iv, direction: "SELL" });
  }, []);

  if (!ladder) {
    return (
      <div className="ldr-page">
        <div className="ldr-breadcrumb">
          <Link to="/app/markets">Markets</Link>
          <span className="sep">›</span>
          <Link to="/app/ladder">Ladder</Link>
          <span className="sep">›</span>
          <span>{groupSlug}</span>
        </div>
        <div className="ldr-empty">
          <h2>Ladder Not Found</h2>
          <p>The ladder group "{groupSlug}" does not exist or has no active contracts.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="ldr-page">
      {/* Breadcrumb */}
      <div className="ldr-breadcrumb">
        <Link to="/app/markets">Markets</Link>
        <span className="sep">›</span>
        <Link to="/app/ladder">Ladder</Link>
        <span className="sep">›</span>
        <span>{ladder.title}</span>
      </div>

      {/* Header */}
      <div className="ldr-header">
        <h1>{ladder.title}</h1>
        <div className="ldr-header-meta">
          <span>📊 {ladder.pointCount} contracts</span>
          <span>🔑 {ladder.eventKey}</span>
          {ladder.category && <span>📁 {ladder.category}</span>}
          {ladder.resolutionSource && <span>📰 {ladder.resolutionSource}</span>}
        </div>
        {ladder.description && (
          <p className="ldr-header-desc">{ladder.description}</p>
        )}
      </div>

      {/* Chart */}
      {ladder.points.length >= 2 && (
        <div className="ldr-chart-section">
          <div className="ldr-chart-title">
            Cumulative Probability Curve
            <span style={{ fontWeight: 400, fontSize: 11, color: "var(--text-secondary)", marginLeft: 12 }}>
              <span style={{ color: "#4ea8de" }}>●</span> Raw &nbsp;
              <span style={{ color: "#4ade80" }}>━</span> Fitted (PAVA)
            </span>
          </div>
          <div className="ldr-chart-wrap">
            <LadderChart points={ladder.points} />
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="ldr-tabs">
        <button className={`ldr-tab ${tab === "by-date" ? "active" : ""}`} onClick={() => setTab("by-date")}>
          By Date
        </button>
        <button className={`ldr-tab ${tab === "intervals" ? "active" : ""}`} onClick={() => setTab("intervals")}>
          Intervals ({ladder.intervals.length})
        </button>
      </div>

      {/* Tab content */}
      {tab === "by-date" && (
        <ByDateTable points={ladder.points} onTradeClick={handleTradeClick} />
      )}

      {tab === "intervals" && (
        <IntervalTable
          intervals={ladder.intervals}
          onBuy={handleIntervalBuy}
          onSell={handleIntervalSell}
        />
      )}

      {/* Trade modal */}
      {tradeModal && (
        <IntervalTradeModal
          interval={tradeModal.interval}
          direction={tradeModal.direction}
          groupSlug={groupSlug}
          onClose={() => setTradeModal(null)}
        />
      )}
    </div>
  );
}
