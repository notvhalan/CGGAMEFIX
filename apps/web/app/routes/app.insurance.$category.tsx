import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
import { useState, useRef, useMemo, memo, useEffect, useCallback } from "react";
import type { MetaFunction } from "@remix-run/node";
import { getInsuranceCategoryWithContracts } from "~/lib/api.server";
import "~/styles/pages/insurance.css";

// ── Category catalogue ────────────────────────────────────────────────────
const CATEGORY_CONFIG: Record<string, {
  icon: string;
  title: string;
  question: (date: string) => string;
  condition: string;
  description: string;
  settlement: string;
  oracle: string;
  baseProb: number;   // probability % at 1 week (lowest contract)
  maxProb: number;    // probability % at 1 year (highest contract)
  curve: "slow" | "fast" | "linear";
}> = {
  life: {
    icon: "🫀",
    title: "Life",
    question: (date) => `Will a clinically approved cure for paralysis be publicly available by ${date}?`,
    condition: "Paralysis Cure",
    description:
      "Contract resolves YES if any regulatory body (FDA, EMA, MHRA) approves and publicly distributes a restorative treatment for complete spinal-cord paralysis on or before 23:59 UTC on the maturity date.",
    settlement: "FDA / EMA / MHRA public approval registry",
    oracle: "GameFix Resolution Council + 3-oracle quorum",
    baseProb: 2.4,
    maxProb: 28.5,
    curve: "slow",
  },
  health: {
    icon: "🏥",
    title: "Health",
    question: (date) => `Will UK A&E waiting times exceed 12 h average nationally by ${date}?`,
    condition: "A&E Wait Threshold",
    description:
      "Resolves YES if NHS England published statistics show the mean A&E-to-admission wait across all major trauma centres exceeds 720 minutes in any calendar week on or before the maturity date.",
    settlement: "NHS England weekly A&E statistics",
    oracle: "GameFix Resolution Council",
    baseProb: 8.0,
    maxProb: 62.0,
    curve: "fast",
  },
  climate: {
    icon: "🌧️",
    title: "Climate",
    question: (date) => `Will a Category 4+ hurricane make US mainland landfall by ${date}?`,
    condition: "Cat-4+ US Landfall",
    description:
      "Resolves YES if NOAA/NHC classifies any Atlantic-basin tropical cyclone as Category 4 or higher at the moment of US mainland landfall on or before the maturity date.",
    settlement: "NOAA National Hurricane Center best-track data",
    oracle: "GameFix Resolution Council",
    baseProb: 4.5,
    maxProb: 72.0,
    curve: "fast",
  },
  agriculture: {
    icon: "🌾",
    title: "Agriculture",
        question: (date) => `Will UK wheat yield fall below 7.5 t/ha nationally by ${date}?`,
    condition: "UK Wheat Yield Shortfall",
    description:
      "Resolves YES if the AHDB or DEFRA final harvest estimate for the current UK winter-wheat crop is published below 7.50 metric tonnes per hectare on or before the maturity date.",
    settlement: "AHDB / DEFRA final harvest estimate",
    oracle: "GameFix Resolution Council",
    baseProb: 5.0,
    maxProb: 38.0,
    curve: "linear",
  },
  liability: {
    icon: "⚖️",
    title: "Liability",
    question: (date) => `Will aggregate UK auto liability claims exceed £500M by ${date}?`,
    condition: "UK Auto Liability Threshold",
    description:
      "Resolves YES if the ABI publishes aggregate UK private motor liability paid claims exceeding £500,000,000 in any rolling 90-day window ending on or before the maturity date.",
    settlement: "Association of British Insurers (ABI) motor statistics",
    oracle: "GameFix Resolution Council",
    baseProb: 3.2,
    maxProb: 44.0,
    curve: "slow",
  },
  travel: {
    icon: "✈️",
    title: "Travel",
    question: (date) => `Will LHR–JFK cancellation rate exceed 15% weekly by ${date}?`,
    condition: "LHR–JFK Cancellation Rate",
    description:
      "Resolves YES if FlightAware or OAG data shows departures cancelled as a percentage of scheduled LHR→JFK departures exceeds 15% in any 7-day window ending on or before the maturity date.",
    settlement: "FlightAware / OAG scheduled vs. operated data",
    oracle: "GameFix Resolution Council",
    baseProb: 6.0,
    maxProb: 55.0,
    curve: "fast",
  },
};

// ── Contract generation ────────────────────────────────────────────────────
function genContracts(baseProb: number, maxProb: number, curve: "slow" | "fast" | "linear") {
  const today = new Date("2026-03-16");
  const contracts: {
    id: string;
    label: string;
    daysOut: number;
    yesProb: number;
    yesPts: number;
    noPts: number;
    spread: number;
    volume: string;
    oi: string;
  }[] = [];

  // Weekly contracts for first 3 months, then fortnightly to 1 year
  const offsets: number[] = [];
  for (let w = 1; w <= 12; w++) offsets.push(w * 7);
  for (let fn = 7; fn <= 26; fn++) offsets.push(12 * 7 + fn * 14);

  offsets.forEach((days, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() + days);
    const t = days / 365;

    let raw: number;
    if (curve === "slow")   raw = baseProb + (maxProb - baseProb) * (1 - Math.exp(-1.5 * t));
    else if (curve === "fast") raw = baseProb + (maxProb - baseProb) * (1 - Math.exp(-4 * t));
    else                       raw = baseProb + (maxProb - baseProb) * t;

    const noise   = (Math.sin(i * 17.3) * 1.2);
    const yesProb = Math.min(99, Math.max(1, raw + noise));
    const yesPts  = Math.round(yesProb);
    const noPts   = 100 - yesPts;
    const spread  = Math.max(1, Math.round(2 + (1 - t) * 4));

    const volBase = 4000 - days * 3;
    const volume  = `£${Math.max(400, Math.round(volBase + Math.sin(i * 5.1) * 800)).toLocaleString()}`;
    const oi      = `£${Math.max(200, Math.round(volBase * 1.4 + Math.sin(i * 3.3) * 600)).toLocaleString()}`;

    contracts.push({
      id: `contract-${days}`,
      label: d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
      daysOut: days,
      yesProb,
      yesPts,
      noPts,
      spread,
      volume,
      oi,
    });
  });

  return contracts;
}

// ── Loader ─────────────────────────────────────────────────────────────────
export async function loader({ params }: LoaderFunctionArgs) {
  const slug = params.category ?? "life";

  // 1. Try DB first
  const dbData = await getInsuranceCategoryWithContracts(slug);

  let contracts: (ReturnType<typeof genContracts>[number] & {
    bestBidYes: number | null;
    bestAskYes: number | null;
    lastTradeYes: number | null;
    question: string | null;
    conditionName: string | null;
  })[];
  let source: "live" | "generated" = "generated";

  if (dbData && dbData.contracts.length > 0) {
    // 2a. Real markets exist — map DB contracts to standard shape
    source = "live";
    const today = new Date("2026-03-16");
    contracts = dbData.contracts.map((c) => {
      const maturity = c.maturityDate ? new Date(c.maturityDate) : null;
      const daysOut = maturity
        ? Math.round((maturity.getTime() - today.getTime()) / 86_400_000)
        : 0;
      const label = maturity
        ? maturity.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
        : c.name;
      return {
        id: c.marketId,
        label,
        daysOut,
        yesProb: c.yesPts,
        yesPts: c.yesPts,
        noPts: c.noPts,
        spread: c.spread ?? Math.max(1, Math.round(4 - daysOut / 120)),
        volume: c.volume24hPence > 0
          ? `£${(c.volume24hPence / 100).toLocaleString()}`
          : "—",
        oi: c.oiPence > 0
          ? `£${(c.oiPence / 100).toLocaleString()}`
          : "—",
        // extra live fields surfaced in the trade ticket
        bestBidYes: c.bestBidYes ?? null,
        bestAskYes: c.bestAskYes ?? null,
        lastTradeYes: c.lastTradeYes ?? null,
        question: c.question,
        conditionName: c.conditionName,
      };
    });
  } else {
    // 2b. No real markets yet — generate curve preview from CATEGORY_CONFIG
    const cfg = CATEGORY_CONFIG[slug] ?? CATEGORY_CONFIG.life;
    contracts = genContracts(cfg.baseProb, cfg.maxProb, cfg.curve).map((c) => ({
      ...c,
      bestBidYes: null,
      bestAskYes: null,
      lastTradeYes: null,
      question: null,
      conditionName: null,
    }));
  }

  // Don't pass cfg through JSON (contains function); client re-looks it up by slug.
  return json({ slug, contracts, source });
}

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: `${CATEGORY_CONFIG[data?.slug ?? "life"]?.title ?? "Insurance"} Markets — GameFix` },
];

// ── Survival Curve — TradingView lightweight-charts ───────────────────────
// Mirrors the design of PriceChart.tsx: async dynamic import, two area series,
// dark theme matching the app palette.
const SurvivalCurve = memo(function SurvivalCurve({
  contracts,
  onSelectHover,
}: {
  contracts: ReturnType<typeof genContracts>;
  selectedId: string | null;           // kept in props for API compat
  onSelectHover: (id: string | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef     = useRef<any>(null);
  const yesSeriesRef = useRef<any>(null);
  const surSeriesRef = useRef<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Convert contract list to {time, value} pairs.
  // X-axis = maturity unix timestamp, Y-axis = probability 0-100.
  const today = useMemo(() => new Date("2026-03-16").getTime(), []);

  // Normalize: generated contracts use 0-100, live DB values are in micro-units (÷100 000)
  const toPercent = (v: number) => v > 100 ? v / 100_000 : v;

  const yesData = useMemo(() =>
    contracts.map(c => ({
      time: Math.floor((today + c.daysOut * 86_400_000) / 1000) as number,
      value: Math.min(100, Math.max(0, toPercent(c.yesProb))),
      _id: c.id,
    })).sort((a, b) => a.time - b.time),
  [contracts, today]); // eslint-disable-line react-hooks/exhaustive-deps

  const surData = useMemo(() =>
    yesData.map(p => ({ time: p.time, value: Math.max(0, 100 - p.value) })),
  [yesData]);

  // Create chart once
  useEffect(() => {
    if (!containerRef.current) return;
    let mounted = true;

    (async () => {
      try {
        const { createChart, ColorType, CrosshairMode, LineStyle } = await import("lightweight-charts");
        if (!mounted || !containerRef.current) return;

        const chart = createChart(containerRef.current, {
          autoSize: true,
          layout: {
            background: { type: ColorType.Solid, color: "transparent" },
            textColor: "#94a3b8",
            fontSize: 11,
          },
          grid: {
            vertLines: { color: "rgba(31,41,55,0.8)" },
            horzLines: { color: "rgba(31,41,55,0.8)" },
          },
          rightPriceScale: {
            borderColor: "#1f2937",
            scaleMargins: { top: 0.08, bottom: 0.08 },
          },
          timeScale: {
            borderColor: "#1f2937",
            rightOffset: 2,
            timeVisible: true,
            secondsVisible: false,
          },
          crosshair: {
            mode: CrosshairMode.Magnet,
            vertLine: {
              color: "rgba(88,166,255,0.5)",
              width: 1,
              style: LineStyle.Dashed,
            },
            horzLine: {
              color: "rgba(88,166,255,0.3)",
              width: 1,
              style: LineStyle.Dashed,
            },
          },
          localization: {
            priceFormatter: (p: number) => `${p.toFixed(1)}%`,
          },
        });

        // YES probability — blue area
        const yesSeries = chart.addSeries((await import("lightweight-charts")).AreaSeries, {
          lineColor: "#58a6ff",
          topColor: "rgba(88,166,255,0.25)",
          bottomColor: "rgba(88,166,255,0.02)",
          lineWidth: 2,
          priceFormat: { type: "custom", formatter: (p: number) => `${p.toFixed(1)}%` },
          title: "P(event)",
        });

        // Survival / NO probability — muted grey area
        const surSeries = chart.addSeries((await import("lightweight-charts")).AreaSeries, {
          lineColor: "rgba(139,148,158,0.55)",
          topColor: "rgba(139,148,158,0.08)",
          bottomColor: "rgba(139,148,158,0.01)",
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          priceFormat: { type: "custom", formatter: (p: number) => `${p.toFixed(1)}%` },
          title: "Survival",
        });

        chartRef.current     = chart;
        yesSeriesRef.current = yesSeries;
        surSeriesRef.current = surSeries;

        // Crosshair subscription → fires only when user moves to a new bar
        chart.subscribeCrosshairMove((param: any) => {
          if (!param?.time) { onSelectHover(null); return; }
          const match = yesData.find(p => p.time === param.time);
          if (match) onSelectHover(match._id);
        });

        setIsLoading(false);
      } catch (err) {
        console.error("[SurvivalCurve] chart init failed", err);
        setIsLoading(false);
      }
    })();

    return () => {
      mounted = false;
      chartRef.current?.remove();
      chartRef.current = null;
      yesSeriesRef.current = null;
      surSeriesRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Feed / update data whenever contracts change
  useEffect(() => {
    if (!yesSeriesRef.current || !surSeriesRef.current || isLoading) return;
    yesSeriesRef.current.setData(yesData);
    surSeriesRef.current.setData(surData);
    chartRef.current?.timeScale().fitContent();
  }, [yesData, surData, isLoading]);

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

      {isLoading && (
        <div style={{
          position: "absolute", inset: 0,
          display: "grid", placeItems: "center",
          background: "rgba(13,17,23,0.7)",
          color: "#64748b", fontSize: "0.8125rem",
        }}>
          Loading chart…
        </div>
      )}

      <div style={{
        position: "absolute", bottom: 4, left: 6,
        fontSize: "9px", color: "#4b5563",
        pointerEvents: "none",
      }}>
        Powered by TradingView
      </div>
    </div>
  );
});

// ── Memoized table row ────────────────────────────────────────────────────
const ContractRow = memo(function ContractRow({
  c, isSelected, source, onRowClick,
}: {
  c: { id: string; label: string; daysOut: number; yesPts: number; noPts: number; spread: number | null; volume: string; oi: string };
  isSelected: boolean;
  source: "live" | "generated";
  onRowClick: (id: string) => void;
}) {
  const handleClick = useCallback(() => onRowClick(c.id), [c.id, onRowClick]);
  const handleTradeClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onRowClick(c.id);
  }, [c.id, onRowClick]);
  return (
    <tr className={isSelected ? "selected" : ""} onClick={handleClick}>
      <td style={{ fontWeight: isSelected ? 600 : 400 }}>{c.label}</td>
      <td><span className="ins-time-left">{timeLeft(c.daysOut)}</span></td>
      <td className="right"><span className="ins-yes-price">{c.yesPts}¢</span></td>
      <td className="right"><span className="ins-no-price">{c.noPts}¢</span></td>
      <td className="right"><span className="ins-spread">{c.spread ?? 1}¢</span></td>
      <td className="right"><span className="ins-vol">{c.volume}</span></td>
      <td className="right"><span className="ins-vol">{c.oi}</span></td>
      <td className="right">
        {source === "live" ? (
          <Link
            to={`/app/markets/${c.id}`}
            onClick={e => e.stopPropagation()}
            className="ins-trade-btn"
            style={{ textDecoration: "none", display: "inline-block" }}
          >
            Trade →
          </Link>
        ) : (
          <button className="ins-trade-btn" onClick={handleTradeClick}>
            Trade
          </button>
        )}
      </td>
    </tr>
  );
});

// ── Time-left label helper ─────────────────────────────────────────────────
function timeLeft(days: number) {
  if (days < 14) return `${days}d`;
  if (days < 60) return `${Math.round(days / 7)}w`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${(days / 365).toFixed(1)}y`;
}

// ── Main component ─────────────────────────────────────────────────────────
export default function InsuranceCategoryPage() {
  const { slug, contracts, source } = useLoaderData<typeof loader>();
  const cfg = CATEGORY_CONFIG[slug] ?? CATEGORY_CONFIG.life;

  const [selectedId,        setSelectedId]        = useState<string | null>(contracts[0]?.id ?? null);
  const [hoveredId,         setHoveredId]         = useState<string | null>(null);
  const [side,              setSide]              = useState<"YES" | "NO">("YES");
  const [stake,             setStake]             = useState("50");
  const [selectedCondition, setSelectedCondition] = useState<string | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  // ── Memoised derived data (never recompute on hover) ──────────────────
  const conditionGroups = useMemo(() => {
    if (!contracts.some(c => c.conditionName)) return [];
    const map = new Map<string, { name: string; rows: typeof contracts; repQuestion: string | null }>();
    for (const c of contracts) {
      const key = c.conditionName ?? 'Other';
      if (!map.has(key)) map.set(key, { name: key, rows: [], repQuestion: c.question ?? null });
      map.get(key)!.rows.push(c);
    }
    return Array.from(map.values());
  }, [contracts]);

  const displayContracts = useMemo(
    () => selectedCondition ? contracts.filter(c => c.conditionName === selectedCondition) : contracts,
    [contracts, selectedCondition],
  );

  const selected = useMemo(
    () => contracts.find(c => c.id === selectedId) ?? contracts[0],
    [contracts, selectedId],
  );

  const activeConditionGroup = useMemo(
    () => conditionGroups.find(g => g.name === selectedCondition) ?? null,
    [conditionGroups, selectedCondition],
  );

  const handleRowClick = useCallback((id: string) => {
    setSelectedId(id);
    setSide("YES");
  }, []);

  const handleConditionChange = useCallback((name: string | null) => {
    setSelectedCondition(name);
    const pool = name ? contracts.filter(c => c.conditionName === name) : contracts;
    setSelectedId(pool[0]?.id ?? null);
    setSide("YES");
  }, [contracts]);

  const handleHover = useCallback((id: string | null) => setHoveredId(id), []);

  const stakeNum  = parseFloat(stake) || 0;
  const pricePts  = side === "YES" ? (selected?.yesPts ?? 50) : (selected?.noPts ?? 50);
  const payout    = stakeNum > 0 ? ((stakeNum / pricePts) * 100).toFixed(2) : "—";
  const profit    = stakeNum > 0 ? ((parseFloat(payout) - stakeNum)).toFixed(2) : "—";

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", overflowX: "hidden" }}>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="ins-cat-header">
        <Link to="/app/markets?tab=insurance"
          style={{ color: "var(--text-secondary)", fontSize: "0.8125rem", textDecoration: "none", display: "flex", alignItems: "center", gap: "0.25rem" }}>
          ← Markets
        </Link>
        <div className="ins-divider" />
        <span style={{ fontSize: "1.375rem" }}>{cfg.icon}</span>
        <h2>{cfg.title} Insurance Markets</h2>

        <div className="ins-cat-stats">
          <div className="ins-cat-stat">
            <span className="ins-cat-stat-label">Contracts</span>
            <span className="ins-cat-stat-value blue">{contracts.length}</span>
          </div>
          <div className="ins-cat-stat">
            <span className="ins-cat-stat-label">Near-term YES</span>
            <span className="ins-cat-stat-value green">{contracts[0]?.yesPts ?? "—"}¢</span>
          </div>
          <div className="ins-cat-stat">
            <span className="ins-cat-stat-label">Long-dated YES</span>
            <span className="ins-cat-stat-value amber">
              {contracts[contracts.length - 1]?.yesPts ?? "—"}¢
            </span>
          </div>
          <div className="ins-cat-stat">
            <span className="ins-cat-stat-label">Selected maturity</span>
            <span className="ins-cat-stat-value">{selected?.label ?? "—"}</span>
          </div>
        </div>
      </div>

      {/* ── Question banner ──────────────────────────────────────────────── */}
      <div style={{
        padding: "0.75rem 1.5rem",
        background: "rgba(125,86,194,0.06)",
        borderBottom: "1px solid var(--border-primary)",
        display: "flex",
        alignItems: "flex-start",
        flexWrap: "wrap",
        gap: "0.75rem",
      }}>
        <span style={{ fontSize: "1rem", marginTop: "0.0625rem", flexShrink: 0 }}>❓</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          {activeConditionGroup && (
            <div style={{
              fontSize: "0.6875rem", fontWeight: 700, textTransform: "uppercase",
              letterSpacing: "0.07em", color: "#a78bfa", marginBottom: "0.25rem",
            }}>
              {cfg.icon} {cfg.title} · {activeConditionGroup.name}
            </div>
          )}
          <p style={{
            margin: 0,
            fontSize: "0.9375rem",
            fontWeight: 600,
            color: "var(--text-primary)",
            lineHeight: 1.5,
          }}>
            {activeConditionGroup?.repQuestion ?? selected?.question ?? cfg.question(selected?.label ?? "—")}
          </p>
        </div>
        <span style={{
          marginLeft: "auto", flexShrink: 0,
          fontSize: "0.75rem", fontWeight: 600,
          padding: "0.2rem 0.6rem",
          borderRadius: 9999,
          background: side === "YES" ? "rgba(63,185,80,0.12)" : "rgba(248,81,73,0.12)",
          color: side === "YES" ? "var(--accent-green)" : "var(--accent-red)",
          border: `1px solid ${side === "YES" ? "rgba(63,185,80,0.3)" : "rgba(248,81,73,0.3)"}`,
        }}>
          {side === "YES" ? `YES ${selected?.yesPts ?? "—"}¢` : `NO ${selected?.noPts ?? "—"}¢`}
        </span>
      </div>

      {/* ── Live / Simulated banner ──────────────────────────────────────── */}
      {source === "generated" && (
        <div style={{
          padding: "0.5rem 1.5rem",
          background: "rgba(210,153,34,0.08)",
          borderBottom: "1px solid rgba(210,153,34,0.25)",
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          fontSize: "0.8125rem",
          color: "rgba(210,153,34,0.9)",
        }}>
          <span>⚠️</span>
          <span>
            <strong>Simulated preview</strong> — no live contracts yet for this category.
            Prices are generated from probability curve models.
          </span>
        </div>
      )}
      {source === "live" && (
        <div style={{
          padding: "0.375rem 1.5rem",
          background: "rgba(63,185,80,0.06)",
          borderBottom: "1px solid rgba(63,185,80,0.2)",
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          fontSize: "0.75rem",
          color: "var(--accent-green)",
        }}>
          <span>● Live</span>
          <span style={{ color: "var(--text-secondary)" }}>
            Prices are sourced from the live orderbook for each contract.
          </span>
        </div>
      )}

      {/* ── Subcategory index tabs ───────────────────────────────────────── */}
      {conditionGroups.length > 1 && (
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          padding: "0.625rem 1.5rem",
          borderBottom: "1px solid var(--border-primary)",
          background: "var(--bg-secondary)",
          overflowX: "auto",
          flexShrink: 0,
          WebkitOverflowScrolling: "touch",
          touchAction: "pan-x",
          scrollbarWidth: "none",
          msOverflowStyle: "none",
        }}>
          {/* "All" pill */}
          <button
            onClick={() => handleConditionChange(null)}
            style={{
              flexShrink: 0,
              padding: "0.3rem 0.875rem",
              borderRadius: 9999,
              border: selectedCondition === null
                ? "1px solid rgba(139,92,246,0.7)"
                : "1px solid var(--border-primary)",
              background: selectedCondition === null
                ? "rgba(139,92,246,0.15)"
                : "transparent",
              color: selectedCondition === null ? "#c4b5fd" : "var(--text-secondary)",
              fontSize: "0.8125rem",
              fontWeight: selectedCondition === null ? 700 : 500,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "0.375rem",
              transition: "all 0.12s",
            }}
          >
            <span>All</span>
            <span style={{
              background: selectedCondition === null ? "rgba(139,92,246,0.35)" : "rgba(139,148,158,0.15)",
              borderRadius: 8,
              padding: "0.0625rem 0.4rem",
              fontSize: "0.6875rem",
              fontWeight: 600,
            }}>{contracts.length}</span>
          </button>

          {/* Per-condition pills */}
          {conditionGroups.map(g => {
            const isActive = selectedCondition === g.name;
            const nearYes = g.rows[0]?.yesPts;
            const farYes  = g.rows[g.rows.length - 1]?.yesPts;
            return (
              <button
                key={g.name}
                onClick={() => handleConditionChange(g.name)}
                style={{
                  flexShrink: 0,
                  padding: "0.3rem 0.875rem",
                  borderRadius: 9999,
                  border: isActive
                    ? "1px solid rgba(139,92,246,0.7)"
                    : "1px solid var(--border-primary)",
                  background: isActive
                    ? "rgba(139,92,246,0.15)"
                    : "rgba(139,148,158,0.04)",
                  color: isActive ? "#c4b5fd" : "var(--text-secondary)",
                  fontSize: "0.8125rem",
                  fontWeight: isActive ? 700 : 500,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  transition: "all 0.12s",
                }}
              >
                <span>{g.name}</span>
                <span style={{
                  background: isActive ? "rgba(139,92,246,0.35)" : "rgba(139,148,158,0.12)",
                  borderRadius: 8,
                  padding: "0.0625rem 0.4rem",
                  fontSize: "0.6875rem",
                  fontWeight: 600,
                  color: isActive ? "#a78bfa" : "var(--text-secondary)",
                }}>{g.rows.length}</span>
                {nearYes != null && (
                  <span style={{ display: "flex", gap: "0.25rem", fontSize: "0.7rem" }}>
                    <span style={{ color: "var(--accent-green)", fontWeight: 600 }}>{nearYes}¢</span>
                    <span style={{ color: "var(--text-tertiary, rgba(139,148,158,0.5))" }}>→</span>
                    <span style={{ color: "#f59e0b", fontWeight: 600 }}>{farYes}¢</span>
                  </span>
                )}
              </button>
            );
          })}

          <span style={{
            marginLeft: "auto",
            flexShrink: 0,
            fontSize: "0.6875rem",
            color: "var(--text-secondary)",
          }}>
            {conditionGroups.length} subcategories
          </span>
        </div>
      )}

      {/* ── Split body ───────────────────────────────────────────────────── */}
      <div className="ins-body" style={{ flex: 1 }}>

        {/* ── LEFT ─────────────────────────────────────────────────────── */}
        <div className="ins-left">

          {/* Survival curve */}
          <div className="ins-curve-section">
            <div className="ins-section-title">Probability Curve — P(event by maturity)</div>

            <div className="ins-curve-wrap" style={{ height: 220 }}>
              <SurvivalCurve
                contracts={displayContracts}
                selectedId={selectedId}
                onSelectHover={handleHover}
              />
            </div>

            <div className="ins-curve-legend">
              <div className="ins-legend-item">
                <div className="ins-legend-dot" style={{ background: "#58a6ff" }} />
                <span>P(event by date) — YES price</span>
              </div>
              <div className="ins-legend-item">
                <div className="ins-legend-dot" style={{ background: "rgba(139,148,158,0.55)", borderRadius: 0, height: 2, width: 14 }} />
                <span>Survival rate (no event)</span>
              </div>
            </div>
          </div>

          {/* Maturity ladder */}
          {(() => {
            const theadRow = (
              <thead>
                <tr>
                  <th>Maturity date</th>
                  <th>Time left</th>
                  <th className="right">YES</th>
                  <th className="right">NO</th>
                  <th className="right">Spread</th>
                  <th className="right">Volume</th>
                  <th className="right">OI</th>
                  <th />
                </tr>
              </thead>
            );

            const tbodyRows = (rows: typeof contracts) => rows.map(c => (
              <ContractRow
                key={c.id}
                c={c}
                isSelected={c.id === selectedId}
                source={source}
                onRowClick={handleRowClick}
              />
            ));

            // When a specific subcategory is selected (or no groups exist), render flat table.
            // When "All" is selected and groups exist, render each group with its own header + table.
            const showGrouped = !selectedCondition && conditionGroups.length > 1;

            return (
              <div className="ins-ladder-section">
                <div className="ins-section-title">
                  {selectedCondition
                    ? <><span style={{ color: "#c4b5fd" }}>{selectedCondition}</span> — {displayContracts.length} contracts</>  
                    : <>Maturity Ladder — {contracts.length} contracts</>}
                  &nbsp;·&nbsp;
                  <span style={{ color: "var(--text-secondary)", textTransform: "none", fontWeight: 400 }}>
                    Click a row to open trade ticket
                  </span>
                </div>

                {showGrouped ? conditionGroups.map(g => (
                  <div key={g.name} style={{ marginBottom: "1.75rem" }}>
                    {/* Subcategory group header */}
                    <div style={{
                      padding: "0.4rem 0.875rem",
                      marginBottom: "0.5rem",
                      background: "rgba(139,92,246,0.08)",
                      border: "1px solid rgba(139,92,246,0.22)",
                      borderRadius: 8,
                      display: "flex",
                      alignItems: "center",
                      gap: "0.625rem",
                    }}>
                      <span style={{
                        fontSize: "0.6875rem", fontWeight: 700, letterSpacing: "0.07em",
                        textTransform: "uppercase", color: "rgba(167,139,250,0.65)",
                      }}>Subcategory</span>
                      <span style={{ fontWeight: 700, fontSize: "0.875rem", color: "#c4b5fd" }}>
                        {g.name}
                      </span>
                      {g.repQuestion && (
                        <span style={{
                          fontSize: "0.75rem", color: "var(--text-secondary)",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          flex: 1, minWidth: 0,
                        }}>{g.repQuestion}</span>
                      )}
                      <span style={{
                        flexShrink: 0,
                        background: "rgba(139,92,246,0.2)",
                        borderRadius: 10,
                        padding: "0.125rem 0.5rem",
                        fontSize: "0.6875rem", fontWeight: 600, color: "#a78bfa",
                      }}>{g.rows.length} contracts</span>
                      <button
                        onClick={() => handleConditionChange(g.name)}
                        style={{
                          flexShrink: 0,
                          padding: "0.2rem 0.6rem",
                          borderRadius: 6,
                          border: "1px solid rgba(139,92,246,0.4)",
                          background: "rgba(139,92,246,0.1)",
                          color: "#a78bfa",
                          fontSize: "0.7rem",
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >View all →</button>
                    </div>
                    <div className="ins-table-wrap" ref={tableRef}>
                      <table className="ins-table">
                        {theadRow}
                        <tbody>{tbodyRows(g.rows)}</tbody>
                      </table>
                    </div>
                  </div>
                )) : (
                  <div className="ins-table-wrap" ref={tableRef}>
                    <table className="ins-table">
                      {theadRow}
                      <tbody>{tbodyRows(displayContracts)}</tbody>
                    </table>
                  </div>
                )}
              </div>    
            );
          })()}

        </div>

        {/* ── RIGHT ────────────────────────────────────────────────────── */}
        <div className="ins-right">

          {/* Trade ticket */}
          <div className="ins-ticket">
            <div className="ins-ticket-contract">
              <div className="ins-ticket-contract-label">Selected contract</div>
              <div className="ins-ticket-contract-name" style={{ fontSize: "0.8125rem", lineHeight: 1.4 }}>
                {selected?.question ?? cfg.question(selected?.label ?? "—")}
              </div>
              <div className="ins-ticket-contract-meta">
                Maturity: {selected?.label} · {timeLeft(selected?.daysOut ?? 0)} remaining
              </div>
            </div>

            {/* YES / NO toggle */}
            <div className="ins-side-toggle">
              <button
                className={`ins-side-btn${side === "YES" ? " active-yes" : ""}`}
                onClick={() => setSide("YES")}
              >
                Buy YES &nbsp;{selected?.yesPts ?? "—"}¢
              </button>
              <button
                className={`ins-side-btn${side === "NO" ? " active-no" : ""}`}
                onClick={() => setSide("NO")}
              >
                Buy NO &nbsp;{selected?.noPts ?? "—"}¢
              </button>
            </div>

            {/* Stake */}
            <div className="ins-field">
              <label>Stake (£)</label>
              <input
                type="number"
                min="1"
                step="1"
                value={stake}
                onChange={e => setStake(e.target.value)}
                placeholder="Enter stake"
              />
            </div>

            {/* Payout summary */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              <div className="ins-summary-row">
                <span>Price</span>
                <span style={{ color: side === "YES" ? "var(--accent-green)" : "var(--accent-red)", fontWeight: 600 }}>
                  {pricePts}¢
                </span>
              </div>
              <div className="ins-summary-row">
                <span>Stake</span>
                <span>£{stakeNum > 0 ? stakeNum.toFixed(2) : "—"}</span>
              </div>
              <div className="ins-summary-row">
                <span>Potential payout</span>
                <span style={{ color: "var(--accent-green)", fontWeight: 600 }}>
                  {payout !== "—" ? `£${payout}` : "—"}
                </span>
              </div>
              <div className="ins-summary-row">
                <span>Potential profit</span>
                <span style={{ color: parseFloat(profit) > 0 ? "var(--accent-green)" : "var(--text-secondary)", fontWeight: 600 }}>
                  {profit !== "—" ? `£${profit}` : "—"}
                </span>
              </div>
            </div>

            <button className={side === "YES" ? "ins-buy-yes-btn" : "ins-buy-no-btn"}>
              Buy {side} — {pricePts}¢
            </button>
          </div>

          {/* Contract details */}
          <div className="ins-detail">
            <div style={{ fontSize: "0.6875rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-secondary)" }}>
              Contract details
            </div>

            <div className="ins-detail-def">{cfg.description}</div>

            {[
              ["Settlement source", cfg.settlement],
              ["Oracle", cfg.oracle],
              ["Contract type", "Binary — YES / NO"],
              ["Payout", "£1.00 per contract if resolved YES"],
              ["Category", cfg.title],
              ["Maturity", selected?.label ?? "—"],
              ["P(event)", `${selected?.yesProb.toFixed(1) ?? "—"}%`],
            ].map(([k, v]) => (
              <div key={k} className="ins-detail-row">
                <span>{k}</span>
                <span>{v}</span>
              </div>
            ))}
          </div>

        </div>
      </div>
    </div>
  );
}
