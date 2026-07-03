import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, Link, useFetcher } from "@remix-run/react";
import { useState, useRef, useMemo, memo, useEffect, useCallback } from "react";
import type { MetaFunction } from "@remix-run/node";
import { createOrder, getInsuranceCategoryWithContracts, getLadder, submitHazardOrder, submitIntervalOrder } from "~/lib/api.server";
import type { LadderPoint, LadderInterval, LadderData } from "~/lib/api.server";
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
  // Splat route: params["*"] = "life" or "life/paralysiscure"
  const splat = (params as any)["*"] ?? "life";
  const segments = splat.split("/").filter(Boolean);
  const slug = segments[0] || "life";
  const subcategorySlug = segments[1] || null;

  // Fetch DB contracts + ladder data in parallel
  const [dbData, ladderDataRaw] = await Promise.all([
    getInsuranceCategoryWithContracts(slug),
    getLadder(slug),
  ]);
  let ladderData = ladderDataRaw;

  let contracts: (ReturnType<typeof genContracts>[number] & {
    bestBidYes: number | null;
    bestAskYes: number | null;
    lastTradeYes: number | null;
    question: string | null;
    conditionName: string | null;
    maturityDate: string | null;
  })[];
  let source: "live" | "generated" = "generated";

  if (dbData && dbData.contracts.length > 0) {
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
        bestBidYes: c.bestBidYes ?? null,
        bestAskYes: c.bestAskYes ?? null,
        lastTradeYes: c.lastTradeYes ?? null,
        question: c.question,
        conditionName: c.conditionName,
        maturityDate: c.maturityDate,
      };
    });
  } else {
    const cfg = CATEGORY_CONFIG[slug] ?? CATEGORY_CONFIG.life;
    contracts = genContracts(cfg.baseProb, cfg.maxProb, cfg.curve).map((c) => ({
      ...c,
      bestBidYes: null,
      bestAskYes: null,
      lastTradeYes: null,
      question: null,
      conditionName: null,
      maturityDate: null,
    }));
  }

  // Build condition summary from ALL contracts (before filtering) for the tab bar
  const allConditionSummary: { name: string; count: number; nearYes: number | null; farYes: number | null }[] = [];
  {
    const cMap = new Map<string, typeof contracts>();
    for (const c of contracts) {
      const key = c.conditionName ?? "Other";
      if (!cMap.has(key)) cMap.set(key, []);
      cMap.get(key)!.push(c);
    }
    for (const [name, rows] of cMap) {
      allConditionSummary.push({
        name,
        count: rows.length,
        nearYes: rows[0]?.yesPts ?? null,
        farYes: rows[rows.length - 1]?.yesPts ?? null,
      });
    }
  }

  // If a subcategory slug is provided, filter contracts to that condition
  // Slugs are lowercased/stripped versions of conditionName, e.g. "paralysiscure" → "Paralysis Cure"
  let initialCondition: string | null = null;
  if (subcategorySlug && contracts.length > 0) {
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    const match = contracts.find(c =>
      c.conditionName && normalize(c.conditionName) === normalize(subcategorySlug)
    );
    if (match?.conditionName) {
      initialCondition = match.conditionName;
      contracts = contracts.filter(c => c.conditionName === initialCondition);

      // Also filter ladder data to only include points/intervals for filtered contracts
      if (ladderData) {
        const filteredIds = new Set(contracts.map(c => c.id));
        ladderData = {
          ...ladderData,
          points: ladderData.points.filter(p => filteredIds.has(p.marketId)),
          intervals: ladderData.intervals.filter(iv =>
            iv.buyLegs.every(l => filteredIds.has(l.marketId)) &&
            iv.sellLegs.every(l => filteredIds.has(l.marketId))
          ),
        };
      }
    }
  }

  return json({ slug, contracts, source, ladder: ladderData, initialCondition, allConditionSummary });
}

// ── Action (interval order submission) ─────────────────────────────────────
export async function action({ request, params }: ActionFunctionArgs) {
  const formData = await request.formData();
  const splat = (params as any)["*"] ?? "";
  const groupSlug = splat.split("/")[0] || "";
  const contractType = (formData.get("contractType") as string) || "interval";
  const startMaturity = formData.get("startMaturity") as string | null;
  const endMaturity = formData.get("endMaturity") as string;
  const startMarketId = formData.get("startMarketId") as string | null;
  const endMarketId = formData.get("endMarketId") as string | null;
  const direction = formData.get("direction") as "BUY" | "SELL";
  const contracts = Number(formData.get("contracts") || 1);
  const executionMode = (formData.get("executionMode") as string) || "submit";

  try {
    if (contractType === "cumulative") {
      const marketId = String(formData.get("marketId") || "");
      const side = formData.get("side") as "BUY_YES" | "SELL_YES";
      const pPts = Number(formData.get("pPts") || 0);
      const liabilityPence = Number(formData.get("liabilityPence") || 0);

      if (!marketId || !side || !pPts || !liabilityPence) {
        throw new Error("Missing required cumulative order fields");
      }

      const result = await createOrder(request, {
        marketId,
        side,
        pPts,
        liabilityPence,
        timeInForce: "GTC",
      });
      return json({ success: true, result });
    }

    if (contractType === "hazard") {
      const result = await submitHazardOrder(request, {
        groupSlug,
        startMaturity: startMaturity || null,
        endMaturity,
        startMarketId: startMarketId || null,
        endMarketId: endMarketId || null,
        direction,
        contracts,
        executionMode: executionMode as "quote_only" | "submit",
      });
      return json({ success: true, result });
    }

    const result = await submitIntervalOrder(request, {
      groupSlug,
      startMaturity: startMaturity || null,
      endMaturity,
      startMarketId: startMarketId || null,
      endMarketId: endMarketId || null,
      direction,
      contracts,
      executionMode: executionMode as "quote_only" | "submit",
    });
    return json({ success: true, result });
  } catch (e: any) {
    return json({ success: false, error: e.message || "Order failed" }, { status: 400 });
  }
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

// ── Ladder helpers ─────────────────────────────────────────────────────────
function fmtDate(iso: string) {
  const d = new Date(iso);
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]}`;
}
function pct(n: number | null) {
  if (n == null) return "—";
  return `${n.toFixed(1)}%`;
}
function fmtPence(p: number) {
  if (p >= 100_00) return `£${(p / 100).toLocaleString("en-GB", { minimumFractionDigits: 0 })}`;
  return `${p}p`;
}

// ── PAVA Ladder Chart (TradingView lightweight-charts) ────────────────────
const LadderChart = memo(function LadderChart({ points }: { points: LadderPoint[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const fittedRef = useRef<any>(null);
  const rawRef = useRef<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Convert points → {time, value} sorted & deduplicated by maturity date
  // lightweight-charts requires strictly ascending unique timestamps
  const fittedData = useMemo(() => {
    const map = new Map<number, number>();
    for (const p of points) {
      const t = Math.floor(new Date(p.maturity).getTime() / 1000);
      const prev = map.get(t);
      // average if multiple points share the same timestamp
      map.set(t, prev != null ? (prev + p.fittedYes) / 2 : p.fittedYes);
    }
    return Array.from(map, ([time, value]) => ({ time: time as number, value }))
      .sort((a, b) => a.time - b.time);
  }, [points]);

  const rawData = useMemo(() => {
    const map = new Map<number, number>();
    for (const p of points) {
      if (p.rawYes == null) continue;
      const t = Math.floor(new Date(p.maturity).getTime() / 1000);
      const prev = map.get(t);
      map.set(t, prev != null ? (prev + p.rawYes) / 2 : p.rawYes);
    }
    return Array.from(map, ([time, value]) => ({ time: time as number, value }))
      .sort((a, b) => a.time - b.time);
  }, [points]);

  // Create chart once
  useEffect(() => {
    if (!containerRef.current || points.length < 2) return;
    let mounted = true;

    (async () => {
      try {
        const lc = await import("lightweight-charts");
        const { createChart, ColorType, CrosshairMode, LineStyle } = lc;
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
            timeVisible: false,
            secondsVisible: false,
          },
          crosshair: {
            mode: CrosshairMode.Magnet,
            vertLine: { color: "rgba(74,222,128,0.4)", width: 1, style: LineStyle.Dashed },
            horzLine: { color: "rgba(74,222,128,0.3)", width: 1, style: LineStyle.Dashed },
          },
          localization: {
            priceFormatter: (p: number) => `${p.toFixed(1)}%`,
          },
        });

        // Fitted line — green area
        const fittedSeries = chart.addSeries(lc.AreaSeries, {
          lineColor: "#4ade80",
          topColor: "rgba(74,222,128,0.18)",
          bottomColor: "rgba(74,222,128,0.02)",
          lineWidth: 2,
          priceFormat: { type: "custom" as const, formatter: (p: number) => `${p.toFixed(1)}%` },
          title: "Fitted",
          crosshairMarkerVisible: true,
          crosshairMarkerRadius: 4,
        });

        // Raw market prices — blue line with markers
        const rawSeries = chart.addSeries(lc.LineSeries, {
          color: "#4ea8de",
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          priceFormat: { type: "custom" as const, formatter: (p: number) => `${p.toFixed(1)}%` },
          title: "Raw",
          crosshairMarkerVisible: true,
          crosshairMarkerRadius: 4,
          crosshairMarkerBackgroundColor: "#4ea8de",
        });

        chartRef.current = chart;
        fittedRef.current = fittedSeries;
        rawRef.current = rawSeries;

        setIsLoading(false);
      } catch (err) {
        console.error("[LadderChart] init failed", err);
        setIsLoading(false);
      }
    })();

    return () => {
      mounted = false;
      chartRef.current?.remove();
      chartRef.current = null;
      fittedRef.current = null;
      rawRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Feed data whenever points change
  useEffect(() => {
    if (!fittedRef.current || !rawRef.current || isLoading) return;
    fittedRef.current.setData(fittedData);
    rawRef.current.setData(rawData);
    chartRef.current?.timeScale().fitContent();
  }, [fittedData, rawData, isLoading]);

  if (points.length < 2) {
    return <div style={{ padding: "1rem", color: "var(--text-secondary)", fontSize: "0.8125rem" }}>Need at least 2 data points for curve</div>;
  }

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

// ── Interval Trade Modal ──────────────────────────────────────────────────
function IntervalTradeModal({
  interval,
  direction,
  slug,
  onClose,
}: {
  interval: LadderInterval;
  direction: "BUY" | "SELL";
  slug: string;
  onClose: () => void;
}) {
  const fetcher = useFetcher();
  const [contracts, setContracts] = useState(1);

  const legs = direction === "BUY" ? interval.buyLegs : interval.sellLegs;
  const isSubmitting = fetcher.state !== "idle";
  const result = fetcher.data as { success?: boolean; error?: string; result?: any } | undefined;

  useEffect(() => {
    if (result?.success) {
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
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <div style={{
        background: "var(--bg-primary, #0d1117)", border: "1px solid var(--border-primary)",
        borderRadius: 8, width: 400, maxWidth: "90vw", overflow: "hidden",
      }}>
        <div style={{
          padding: "0.875rem 1rem", borderBottom: "1px solid var(--border-primary)",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <h3 style={{ margin: 0, fontSize: "0.9375rem" }}>
            {direction === "BUY" ? "Buy" : "Sell"} Interval
          </h3>
          <button onClick={onClose} style={{
            background: "none", border: "none", color: "var(--text-secondary)",
            fontSize: "1.25rem", cursor: "pointer",
          }}>×</button>
        </div>
        <div style={{ padding: "1rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem", fontSize: "0.8125rem" }}>
            <span style={{ color: "var(--text-secondary)" }}>Interval</span>
            <span>{interval.label}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem", fontSize: "0.8125rem" }}>
            <span style={{ color: "var(--text-secondary)" }}>Implied probability</span>
            <span>{pct(interval.price)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.75rem", fontSize: "0.8125rem" }}>
            <span style={{ color: "var(--text-secondary)" }}>Direction</span>
            <span style={{ color: direction === "BUY" ? "#10b981" : "#ef4444", fontWeight: 600 }}>
              {direction}
            </span>
          </div>

          <div style={{ borderTop: "1px solid var(--border-primary)", margin: "0.75rem 0" }} />

          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
            <label style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>Contracts:</label>
            <input
              type="number" min={1} max={10000} value={contracts}
              onChange={(e) => setContracts(Math.max(1, Math.min(10000, Number(e.target.value) || 1)))}
              style={{
                width: 80, padding: "0.375rem 0.5rem", borderRadius: 4,
                border: "1px solid var(--border-primary)",
                background: "var(--bg-secondary, #161b22)",
                color: "var(--text-primary)", fontSize: "0.8125rem",
              }}
            />
          </div>

          <div style={{ borderTop: "1px solid var(--border-primary)", margin: "0.75rem 0" }} />

          <div style={{ fontSize: "0.6875rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.5rem", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Synthetic Legs ({legs.length})
          </div>

          {legs.map((leg, i) => (
            <div key={i} style={{
              padding: "0.5rem 0.625rem", marginBottom: "0.375rem",
              background: "rgba(255,255,255,0.03)", borderRadius: 4,
              border: "1px solid var(--border-primary)",
            }}>
              <div style={{ fontSize: "0.6875rem", fontWeight: 600, color: "#8b9ab5", marginBottom: "0.25rem" }}>Leg {i + 1}</div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem" }}>
                <span style={{ color: "var(--text-secondary)" }}>Market</span>
                <span style={{ fontSize: "0.6875rem" }}>{leg.marketId.slice(0, 8)}…</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem" }}>
                <span style={{ color: "var(--text-secondary)" }}>Side</span>
                <span style={{ color: leg.side === "BUY_YES" ? "#10b981" : "#ef4444" }}>
                  {leg.side.replace("_", " ")}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem" }}>
                <span style={{ color: "var(--text-secondary)" }}>Qty</span>
                <span>{contracts} × {leg.ratio}</span>
              </div>
            </div>
          ))}

          <div style={{
            background: "rgba(210,153,34,0.1)", border: "1px solid rgba(210,153,34,0.25)",
            borderRadius: 4, padding: "0.5rem 0.625rem", marginTop: "0.75rem",
            fontSize: "0.75rem", color: "rgba(210,153,34,0.9)",
          }}>
            ⚠️ This trade is executed as {legs.length} linked orders and may experience partial fill risk.
          </div>

          {result?.success && (
            <div style={{ background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.3)", borderRadius: 4, padding: "0.625rem", marginTop: "0.75rem", fontSize: "0.8125rem", color: "#10b981" }}>
              ✓ Order submitted successfully
            </div>
          )}

          {result && !result.success && (
            <div style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 4, padding: "0.625rem", marginTop: "0.75rem", fontSize: "0.8125rem", color: "#ef4444" }}>
              ✗ {result.error || "Order failed"}
            </div>
          )}
        </div>
        <div style={{
          padding: "0.75rem 1rem", borderTop: "1px solid var(--border-primary)",
          display: "flex", justifyContent: "flex-end", gap: "0.5rem",
        }}>
          <button onClick={onClose} style={{
            padding: "0.375rem 0.875rem", borderRadius: 4, border: "1px solid var(--border-primary)",
            background: "transparent", color: "var(--text-secondary)", cursor: "pointer", fontSize: "0.8125rem",
          }}>Cancel</button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || result?.success}
            style={{
              padding: "0.375rem 1.25rem", borderRadius: 4,
              border: "none", cursor: isSubmitting ? "wait" : "pointer",
              fontSize: "0.8125rem", fontWeight: 600,
              background: direction === "BUY" ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.2)",
              color: direction === "BUY" ? "#10b981" : "#ef4444",
            }}
          >
            {isSubmitting ? "Submitting…" : `${direction} ${contracts} contract${contracts > 1 ? "s" : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
type HazardCategory = {
  mono: string;
  tint: string;
  name: string;
  question: string;
  prob: number;
  chg24h: number;
  contracts: number;
  bid: string;
  ask: string;
  vol: string;
  resolveDate: string;
};

const HAZARD_CATEGORIES: HazardCategory[] = [
  {
    mono: "PC",
    tint: "#5b8dff",
    name: "Paralysis Cure",
    question: "Will a cure for paralysis be discovered before 23 Mar 2026?",
    prob: 80.1,
    chg24h: 4.2,
    contracts: 36,
    bid: "79.6",
    ask: "81.1",
    vol: "48.2k",
    resolveDate: "23 Mar 2026",
  },
  {
    mono: "LE",
    tint: "#b98bff",
    name: "Life Expectancy Milestone",
    question: "Will average UK life expectancy exceed 85 by 2030?",
    prob: 62.4,
    chg24h: -1.8,
    contracts: 24,
    bid: "61.9",
    ask: "63.1",
    vol: "31.7k",
    resolveDate: "31 Dec 2030",
  },
  {
    mono: "AB",
    tint: "#ff8ba7",
    name: "Alzheimer's Breakthrough",
    question: "Will an approved disease-modifying drug launch before 2027?",
    prob: 44.3,
    chg24h: 2.6,
    contracts: 18,
    bid: "43.8",
    ask: "45.0",
    vol: "22.9k",
    resolveDate: "30 Jun 2027",
  },
  {
    mono: "CM",
    tint: "#59c3d6",
    name: "Cancer Mortality Rate",
    question: "Will UK cancer mortality fall below 200 / 100k by 2028?",
    prob: 51.7,
    chg24h: 0.9,
    contracts: 30,
    bid: "51.1",
    ask: "52.4",
    vol: "39.1k",
    resolveDate: "31 Dec 2028",
  },
  {
    mono: "GT",
    tint: "#f0b45b",
    name: "Gene Therapy Approval",
    question: "Will >=5 new gene therapies gain approval in 2026?",
    prob: 37.9,
    chg24h: -3.1,
    contracts: 21,
    bid: "37.2",
    ask: "38.5",
    vol: "18.4k",
    resolveDate: "31 Dec 2026",
  },
  {
    mono: "AR",
    tint: "#f0616d",
    name: "Antibiotic Resistance Crisis",
    question: "Will a WHO-declared AMR emergency occur before 2027?",
    prob: 28.5,
    chg24h: 5.4,
    contracts: 15,
    bid: "27.9",
    ask: "29.2",
    vol: "14.6k",
    resolveDate: "31 Dec 2026",
  },
];

function hazardPoints(prob: number) {
  return Array.from({ length: 24 }, (_, i) => {
    const t = i / 23;
    const logistic = 1 / (1 + Math.exp(-9 * (t - 0.42)));
    const seed = Math.sin((i + 1) * 12.9898 + prob * 78.233) * 43758.5453;
    const noise = (seed - Math.floor(seed) - 0.5) * 0.09 * prob;
    const value = Math.max(2, Math.min(98, prob * logistic + noise));
    return [t * 100, 37 - (value / 100) * 34] as const;
  });
}

function HazardSparkline({ category }: { category: HazardCategory }) {
  const points = hazardPoints(category.prob);
  const line = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`).join(" ");
  const area = `${line} L100 40 L0 40 Z`;
  const color = category.chg24h >= 0 ? "#21c17a" : "#f0616d";

  return (
    <svg className="hazard-sparkline" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
      <path d={area} fill={color} opacity="0.14" />
      <path d={line} fill="none" stroke={color} strokeWidth="1.75" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function LifeHazardMarketMockup() {
  return (
    <div className="hazard-market-page">
<main className="hazard-market-panel">
        <header className="hazard-market-header">
          <div className="hazard-title-wrap">
            <h1>Markets</h1>
            <span className="hazard-live-pill"><span aria-hidden="true">●</span> Live</span>
          </div>
          <div className="hazard-market-meta">6 categories · 144 contracts</div>
        </header>

        <section className="hazard-category-list" aria-label="Prediction market categories">
          {HAZARD_CATEGORIES.map((category) => {
            const direction = category.chg24h >= 0 ? "up" : "down";
            return (
              <article className="hazard-category-row" key={category.mono}>
                <div className="hazard-monogram" style={{ backgroundColor: category.tint }}>
                  {category.mono}
                </div>
                <div className="hazard-name-block">
                  <div className="hazard-category-name">{category.name}</div>
                  <div className="hazard-category-question">{category.question}</div>
                </div>
                <div className="hazard-price-block">
                  <div className="hazard-prob">{category.prob.toFixed(1)}%</div>
                  <div className={`hazard-change ${direction}`}>
                    {category.chg24h >= 0 ? "+" : ""}{category.chg24h.toFixed(1)}%
                  </div>
                </div>
                <div className="hazard-chart-block">
                  <HazardSparkline category={category} />
                </div>
                <div className="hazard-stats-block">
                  <div>
                    <span className="hazard-bid">{category.bid}&cent;</span>
                    <span className="hazard-stat-sep"> / </span>
                    <span className="hazard-ask">{category.ask}&cent;</span>
                  </div>
                  <div>{"\u00a3"}{category.vol} vol · {category.contracts}c</div>
                  <div className="hazard-resolve">{category.resolveDate}</div>
                </div>
                <button className="hazard-trade-btn" type="button">Trade ›</button>
              </article>
            );
          })}
        </section>
      </main>
    </div>
  );
}

type RealHazardCard = {
  mono: string;
  tint: string;
  name: string;
  question: string;
  prob: number;
  chg24h: number;
  contracts: number;
  bid: number | null;
  ask: number | null;
  vol: string;
  resolveDate: string;
  href: string;
  points: number[];
  closingSoon: boolean;
};

const HAZARD_TINTS = ["#5b8dff", "#59c3d6", "#b98bff", "#ff8ba7", "#f0b45b", "#f0616d"];

function conditionSlug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function conditionMono(value: string) {
  const words = value.replace(/[^a-zA-Z0-9 ]/g, " ").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "IN";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}

function moneyValue(value: string | null | undefined) {
  if (!value) return 0;
  const cleaned = value.replace(/[^0-9.]/g, "");
  return Number(cleaned || 0);
}

function compactMoney(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0";
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return value.toFixed(0);
}

function buildRealHazardCards(slug: string, cfg: typeof CATEGORY_CONFIG[string], contracts: any[]): RealHazardCard[] {
  const grouped = new Map<string, any[]>();
  for (const contract of contracts) {
    const key = contract.conditionName ?? cfg.condition ?? "Market";
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(contract);
  }

  return Array.from(grouped.entries()).map(([name, rows], index) => {
    const sorted = [...rows].sort((a, b) => Number(a.daysOut ?? 0) - Number(b.daysOut ?? 0));
    const priced = sorted.find(row => row.bestBidYes != null || row.bestAskYes != null) ?? sorted[0];
    const anchor = sorted[sorted.length - 1] ?? priced;
    const prob = anchor?.yesPts ?? priced?.yesPts ?? cfg.baseProb;
    const prior = priced?.lastTradeYes ?? sorted[0]?.yesPts ?? prob;
    const chg24h = Math.max(-12, Math.min(12, prob - prior));
    const nearestDays = Number(sorted[0]?.daysOut ?? 999);

    return {
      mono: conditionMono(name),
      tint: HAZARD_TINTS[index % HAZARD_TINTS.length],
      name,
      question: anchor?.question ?? cfg.question(anchor?.label ?? "the selected maturity"),
      prob,
      chg24h,
      contracts: sorted.length,
      bid: priced?.bestBidYes ?? null,
      ask: priced?.bestAskYes ?? null,
      vol: compactMoney(sorted.reduce((sum, row) => sum + moneyValue(row.volume), 0)),
      resolveDate: anchor?.label ?? "Open",
      href: `/app/insurance/${slug}/${conditionSlug(name)}`,
      points: sorted.map(row => row.yesPts ?? prob),
      closingSoon: nearestDays >= 0 && nearestDays <= 14,
    };
  });
}

function RealHazardSparkline({ card }: { card: RealHazardCard }) {
  const values = card.points.length > 1 ? card.points : hazardPoints(card.prob).map(([, y]) => Math.max(1, 100 - y * 2.5));
  const points = values.map((value, index) => {
    const x = values.length === 1 ? 100 : (index / (values.length - 1)) * 100;
    const y = 37 - (Math.max(1, Math.min(99, value)) / 100) * 34;
    return [x, y] as const;
  });
  const line = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`).join(" ");
  const area = `${line} L100 40 L0 40 Z`;
  const color = card.chg24h >= 0 ? "#21c17a" : "#f0616d";

  return (
    <svg className="hazard-sparkline" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
      <path d={area} fill={color} opacity="0.14" />
      <path d="M0 20 L100 20" fill="none" stroke="rgba(255,255,255,0.08)" strokeDasharray="1 3" vectorEffect="non-scaling-stroke" />
      <path d={line} fill="none" stroke={color} strokeWidth="1.75" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

type TerminalRow = {
  contract: any;
  maturity: string;
  maturityIso: string | null;
  rawYes: number;
  fittedYes: number;
  survival: number;
  windowProb: number;
  rawWindow: number;
  condHazard: number;
  rawHazard: number;
  lambdaDay: number;
  bid: number | null;
  ask: number | null;
  oi: string;
  flagged: boolean;
};

type TerminalState = {
  chartMode: "cumulative" | "hazard" | "survival";
  tableTab: "byDate" | "intervals";
  selectedRow: number;
  tradeMode: "cumulative" | "interval" | "hazard";
  sideIdx: 0 | 1;
  stake: string;
  annualize: boolean;
  warnDismissed: boolean;
};

function pava(values: number[]) {
  const blocks = values.map(value => ({ sum: value, count: 1 }));
  for (let i = 0; i < blocks.length - 1; i++) {
    if (blocks[i].sum / blocks[i].count <= blocks[i + 1].sum / blocks[i + 1].count) continue;
    blocks[i] = { sum: blocks[i].sum + blocks[i + 1].sum, count: blocks[i].count + blocks[i + 1].count };
    blocks.splice(i + 1, 1);
    i = Math.max(-1, i - 2);
  }
  return blocks.flatMap(block => Array.from({ length: block.count }, () => block.sum / block.count));
}

function clampProb(value: number) {
  return Math.max(0.001, Math.min(0.999, value));
}

function marketMid(contract: any) {
  if (contract.bestBidYes != null && contract.bestAskYes != null) return (contract.bestBidYes + contract.bestAskYes) / 200;
  if (contract.lastTradeYes != null) return contract.lastTradeYes / 100;
  return (contract.yesPts ?? 50) / 100;
}

function deriveTerminalRows(contracts: any[]): TerminalRow[] {
  const sorted = [...contracts].sort((a, b) => Number(a.daysOut ?? 0) - Number(b.daysOut ?? 0));
  const raw = sorted.map(contract => clampProb(marketMid(contract)));
  const fitted = pava(raw).map(clampProb);
  return sorted.map((contract, index) => {
    const prevFit = index === 0 ? 0 : fitted[index - 1];
    const prevRaw = index === 0 ? 0 : raw[index - 1];
    const windowProb = Math.max(0, fitted[index] - prevFit);
    const rawWindow = Math.max(0, raw[index] - prevRaw);
    const condHazard = prevFit >= 0.999 ? 0 : windowProb / Math.max(0.001, 1 - prevFit);
    const rawHazard = prevRaw >= 0.999 ? 0 : rawWindow / Math.max(0.001, 1 - prevRaw);
    const deltaDays = Math.max(1, index === 0
      ? Number(contract.daysOut ?? 1)
      : Number(contract.daysOut ?? 1) - Number(sorted[index - 1]?.daysOut ?? 0));
    const lambdaDay = prevFit >= 0.999
      ? 0
      : -Math.log(Math.max(0.001, 1 - fitted[index]) / Math.max(0.001, 1 - prevFit)) / deltaDays;

    return {
      contract,
      maturity: contract.label ?? "Open",
      maturityIso: contract.maturityDate ?? null,
      rawYes: raw[index],
      fittedYes: fitted[index],
      survival: 1 - fitted[index],
      windowProb,
      rawWindow,
      condHazard,
      rawHazard,
      lambdaDay,
      bid: contract.bestBidYes ?? contract.yesPts ?? null,
      ask: contract.bestAskYes ?? contract.yesPts ?? null,
      oi: contract.oi ?? "--",
      flagged: Math.abs(rawWindow - windowProb) > 0.05,
    };
  });
}

function percent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function cents(value: number | null) {
  return value == null ? "--" : `${Math.round(value)}c`;
}

function TerminalChart({
  rows,
  state,
  setState,
}: {
  rows: TerminalRow[];
  state: TerminalState;
  setState: (updater: (prev: TerminalState) => TerminalState) => void;
}) {
  const [ApexChart, setApexChart] = useState<any>(null);

  useEffect(() => {
    import("react-apexcharts").then(m => setApexChart(() => m.default));
  }, []);

  const isHazard = state.chartMode === "hazard";
  const selectedIdx = Math.min(state.selectedRow, Math.max(0, rows.length - 1));
  const selectedMaturity = rows[selectedIdx]?.maturity ?? null;

  const fittedValues = rows.map(r =>
    parseFloat(((isHazard ? r.condHazard : state.chartMode === "survival" ? r.survival : r.fittedYes) * 100).toFixed(2))
  );
  const rawValues = rows.map(r =>
    parseFloat(((isHazard ? r.rawHazard : state.chartMode === "survival" ? 1 - r.rawYes : r.rawYes) * 100).toFixed(2))
  );

  const series = [
    {
      name: isHazard ? "Cond. Hazard" : state.chartMode === "survival" ? "Survival" : "Fitted YES",
      type: isHazard ? "bar" : "area",
      data: fittedValues,
    },
    {
      name: isHazard ? "Raw Hazard" : "Raw",
      type: "line",
      data: rawValues,
    },
  ];

  const options = {
    chart: {
      background: "transparent",
      toolbar: { show: false },
      animations: { enabled: false },
      fontFamily: "inherit",
      events: {
        dataPointSelection(_: any, __: any, config: any) {
          setState(prev => ({ ...prev, selectedRow: config.dataPointIndex }));
        },
      },
    },
    theme: { mode: "dark" as const },
    colors: isHazard ? ["#8b5cf6", "#8b5cf6"] : ["#21c17a", "#6bd4b1"],
    stroke: {
      width: isHazard ? [0, 2] : [2, 2],
      curve: "smooth" as const,
      dashArray: [0, 5],
    },
    fill: {
      type: isHazard ? ["solid", "solid"] : ["gradient", "solid"],
      gradient: {
        shade: "dark" as const,
        type: "vertical" as const,
        opacityFrom: 0.28,
        opacityTo: 0.02,
      },
      opacity: [isHazard ? 0.65 : 1, 0],
    },
    plotOptions: {
      bar: {
        borderRadius: 2,
        columnWidth: "60%",
      },
    },
    dataLabels: { enabled: false },
    xaxis: {
      categories: rows.map(r => r.maturity),
      labels: {
        rotate: -45,
        rotateAlways: false,
        style: { colors: "#64748b", fontSize: "10px", fontFamily: "inherit" },
        maxHeight: 60,
      },
      axisBorder: { color: "#1f2937" },
      axisTicks: { color: "#1f2937" },
    },
    yaxis: {
      labels: {
        style: { colors: "#64748b", fontSize: "10px", fontFamily: "inherit" },
        formatter: (val: number) => `${val.toFixed(1)}%`,
      },
      min: 0,
    },
    grid: {
      borderColor: "rgba(31,41,55,0.8)",
      xaxis: { lines: { show: false } },
    },
    tooltip: {
      theme: "dark" as const,
      y: { formatter: (val: number) => `${val.toFixed(2)}%` },
    },
    markers: {
      size: [3, 2],
      hover: { sizeOffset: 2 },
    },
    legend: {
      position: "top" as const,
      horizontalAlign: "left" as const,
      offsetY: 0,
      labels: { colors: "#94a3b8" },
      fontSize: "11px",
    },
    annotations: {
      xaxis: selectedMaturity
        ? [{
            x: selectedMaturity,
            borderColor: "rgba(88,166,255,0.5)",
            strokeDashArray: 3,
          }]
        : [],
    },
  };

  if (!ApexChart) {
    return (
      <div className="term-chart" style={{ display: "grid", placeItems: "center", color: "#64748b", fontSize: "0.8125rem" }}>
        Loading chart…
      </div>
    );
  }

  return (
    <div className="term-chart">
      <div className="term-chart-canvas">
        <ApexChart type="line" series={series} options={options} height="100%" width="100%" />
      </div>
      <div className="term-axis-caption">
        y-axis: {isHazard
          ? "conditional probability this interval"
          : state.chartMode === "survival"
          ? "probability event has not happened by this date"
          : "probability event has happened by this date"}
      </div>
    </div>
  );
}

function InsuranceTerminalPage({
  slug,
  contracts,
  source,
  allConditionSummary,
  initialCondition,
}: {
  slug: string;
  contracts: any[];
  source: "live" | "generated";
  allConditionSummary: { name: string; count: number; nearYes: number | null; farYes: number | null }[];
  initialCondition: string | null;
}) {
  const cfg = CATEGORY_CONFIG[slug] ?? CATEGORY_CONFIG.life;
  const rows = useMemo(() => deriveTerminalRows(contracts), [contracts]);
  const [state, setState] = useState<TerminalState>({
    chartMode: "cumulative",
    tableTab: "byDate",
    selectedRow: Math.min(1, Math.max(0, rows.length - 1)),
    tradeMode: "cumulative",
    sideIdx: 0,
    stake: "50",
    annualize: false,
    warnDismissed: false,
  });
  const selectedIndex = Math.min(state.selectedRow, Math.max(0, rows.length - 1));
  const selected = rows[selectedIndex] ?? rows[0];
  const flaggedRows = rows.filter(row => row.flagged);
  const tradePrice = selected
    ? state.tradeMode === "hazard" ? selected.condHazard : state.tradeMode === "interval" ? selected.windowProb : selected.fittedYes
    : 0.5;
  const sidePrice = state.sideIdx === 0 ? tradePrice : 1 - tradePrice;
  const stake = Number(state.stake || 0);
  const payout = sidePrice > 0 ? stake / sidePrice : 0;
  const selectedQuestion = selected?.contract.question ?? cfg.question(selected?.maturity ?? "the selected maturity");
  const tradeFetcher = useFetcher();
  const tradeResult = tradeFetcher.data as { success?: boolean; error?: string; result?: any } | undefined;
  const isSubmittingTrade = tradeFetcher.state !== "idle";
  const selectedStartIso = selectedIndex > 0 ? rows[selectedIndex - 1]?.maturityIso ?? null : null;
  const selectedStartLabel = selectedIndex > 0 ? rows[selectedIndex - 1]?.maturity ?? "Now" : "Now";
  const canSubmitTrade = Boolean(selected && (state.tradeMode === "cumulative" || selected.maturityIso));
  const ticketModeLabel = state.tradeMode === "hazard"
    ? "Conditional hazard"
    : state.tradeMode === "interval"
    ? "Interval window"
    : "Cumulative";
  const ticketQuestion = state.tradeMode === "hazard"
    ? `Conditional on no event by ${selectedStartLabel}, will it happen by ${selected?.maturity ?? "the selected maturity"}?`
    : state.tradeMode === "interval"
    ? `Will it happen between ${selectedStartLabel} and ${selected?.maturity ?? "the selected maturity"}?`
    : selectedQuestion;
  const ticketDetail = state.tradeMode === "hazard"
    ? "Voids/refunds if the event has already happened before the window starts."
    : state.tradeMode === "interval"
    ? "Executed as a synthetic spread: long later cumulative, short earlier cumulative."
    : `Maturity ${selected?.maturity ?? "--"} - fitted YES ${percent(selected?.fittedYes ?? 0)}`;
  const ticketPriceLabel = state.tradeMode === "hazard"
    ? "Hazard price"
    : state.tradeMode === "interval"
    ? "Window price"
    : "Price";

  const handleTicketSubmit = useCallback(() => {
    if (!selected || !canSubmitTrade || sidePrice <= 0 || stake <= 0) return;

    const formData = new FormData();
    formData.set("contractType", state.tradeMode);
    formData.set("executionMode", "submit");

    if (state.tradeMode === "cumulative") {
      formData.set("marketId", selected.contract.id);
      formData.set("side", state.sideIdx === 0 ? "BUY_YES" : "SELL_YES");
      formData.set("pPts", String(Math.round(tradePrice * 10_000_000)));
      formData.set("liabilityPence", String(Math.round(stake * 100)));
    } else {
      formData.set("startMaturity", selectedStartIso ?? "");
      formData.set("endMaturity", selected.maturityIso ?? "");
      formData.set("startMarketId", selectedIndex > 0 ? rows[selectedIndex - 1]?.contract.id ?? "" : "");
      formData.set("endMarketId", selected.contract.id);
      formData.set("direction", state.sideIdx === 0 ? "BUY" : "SELL");
      formData.set("contracts", String(Math.max(0.0001, payout)));
    }

    tradeFetcher.submit(formData, { method: "POST" });
  }, [
    canSubmitTrade,
    payout,
    selected,
    selectedStartIso,
    sidePrice,
    stake,
    state.sideIdx,
    state.tradeMode,
    tradeFetcher,
    tradePrice,
  ]);

  return (
    <div className="term-page">
      <main className="term-center">
        <div className="term-scroll">
          <header className="term-header">
            <div>
              <Link to="/app/markets" className="term-back">← Markets</Link>
              <h1>{cfg.title} Insurance Markets</h1>
            </div>
            <div className="term-readouts">
              <span><small>Contracts</small>{rows.length}</span>
              <span><small>Near-term YES</small>{cents(rows[0]?.bid ?? rows[0]?.contract.yesPts ?? null)}</span>
              <span><small>Long-dated YES</small>{cents(rows[rows.length - 1]?.bid ?? rows[rows.length - 1]?.contract.yesPts ?? null)}</span>
              <span><small>Selected maturity</small>{selected?.maturity ?? "--"}</span>
            </div>
          </header>

          <section className="term-question">
            <div className="term-question-mark">?</div>
            <div>
              <div className="term-kicker">{cfg.title} · {initialCondition ?? cfg.condition}</div>
              <h2>{selectedQuestion}</h2>
              {source === "live" && <p>Live prices sourced from the live orderbook for each contract.</p>}
            </div>
            <span className="term-yes-pill">YES {cents(selected?.bid ?? selected?.contract.yesPts ?? null)}</span>
          </section>

          {allConditionSummary.length > 1 && (
            <div className="term-pills">
              <Link to={`/app/insurance/${slug}`}>← All</Link>
              {allConditionSummary.map(group => (
                <Link
                  key={group.name}
                  className={group.name === initialCondition ? "active" : ""}
                  to={`/app/insurance/${slug}/${conditionSlug(group.name)}`}
                >
                  {group.name} <span>{group.nearYes ?? "--"}c → {group.farYes ?? "--"}c</span>
                </Link>
              ))}
              <small>{allConditionSummary.length} subcategories</small>
            </div>
          )}

          {flaggedRows.length > 0 && !state.warnDismissed && (
            <div className="term-warning">
              <strong>Monotonic-fit artifact detected</strong>
              <span>
                The fitted curve diverges from raw orderbook windows near {flaggedRows[0].maturity}. Trade off the raw column or narrower windows until the fit is re-run.
              </span>
              <button onClick={() => setState(prev => ({ ...prev, warnDismissed: true }))}>Dismiss</button>
            </div>
          )}

          <section className="term-card">
            <div className="term-card-head">
              <div>
                <h3>
                  {state.chartMode === "hazard" ? "Forward hazard" : state.chartMode === "survival" ? "Survival curve" : "PAVA-fitted cumulative probability"}
                </h3>
                <span><i /> Raw <b /> Fitted</span>
              </div>
              <div className="term-segment">
                {(["cumulative", "hazard", "survival"] as const).map(mode => (
                  <button key={mode} className={state.chartMode === mode ? "active" : ""} onClick={() => setState(prev => ({ ...prev, chartMode: mode }))}>
                    {mode === "hazard" ? "Forward hazard" : mode[0].toUpperCase() + mode.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <TerminalChart rows={rows} state={state} setState={setState} />
          </section>

          <section className="term-card term-table-card">
            <div className="term-card-head">
              <div className="term-tabs">
                <button className={state.tableTab === "byDate" ? "active" : ""} onClick={() => setState(prev => ({ ...prev, tableTab: "byDate" }))}>By Date</button>
                <button className={state.tableTab === "intervals" ? "active" : ""} onClick={() => setState(prev => ({ ...prev, tableTab: "intervals" }))}>Intervals ({rows.length})</button>
              </div>
              <div className="term-lambda">
                Continuous λ:
                <button className={!state.annualize ? "active" : ""} onClick={() => setState(prev => ({ ...prev, annualize: false }))}>per day</button>
                <button className={state.annualize ? "active" : ""} onClick={() => setState(prev => ({ ...prev, annualize: true }))}>annualized</button>
              </div>
            </div>
            <table className="term-table">
              <thead>
                <tr>
                  <th>{state.tableTab === "byDate" ? "Maturity" : "Interval"}</th>
                  <th>Fitted YES</th>
                  <th>Survival</th>
                  <th>Window prob</th>
                  <th>Cond. hazard</th>
                  <th>Bid</th>
                  <th>Ask</th>
                  <th>OI</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr
                    key={row.contract.id}
                    className={`${selectedIndex === index ? "selected" : ""} ${row.flagged ? "flagged" : ""}`}
                    onClick={() => setState(prev => ({ ...prev, selectedRow: index }))}
                  >
                    <td>{state.tableTab === "byDate" ? row.maturity : `${index === 0 ? "Now" : rows[index - 1].maturity} → ${row.maturity}`} {row.flagged && <em>CHECK FIT</em>}</td>
                    <td>{percent(row.fittedYes)}</td>
                    <td>{percent(row.survival)}</td>
                    <td>{percent(row.windowProb)}</td>
                    <td><strong>{percent(row.condHazard)}</strong><small>λ {(row.lambdaDay * (state.annualize ? 365 : 1)).toFixed(4)} / {state.annualize ? "yr" : "day"}</small></td>
                    <td className="bid">{cents(row.bid)}</td>
                    <td className="ask">{cents(row.ask)}</td>
                    <td>{row.oi}</td>
                    <td><Link to={`/app/markets/${row.contract.id}`} onClick={event => event.stopPropagation()}>Trade →</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      </main>

      <aside className={`term-ticket mode-${state.tradeMode}`}>
        <div className="term-ticket-head">
          <h3>Contract Details</h3>
          <span>•••</span>
        </div>
        <label>Contract type</label>
        <div className="term-segment term-ticket-segment">
          {(["cumulative", "interval", "hazard"] as const).map(mode => (
            <button key={mode} className={state.tradeMode === mode ? "active" : ""} onClick={() => setState(prev => ({ ...prev, tradeMode: mode }))}>{mode[0].toUpperCase() + mode.slice(1)}</button>
          ))}
        </div>
        <div className="term-ticket-contract">
          <small>{ticketModeLabel} - selected contract</small>
          <strong>{ticketQuestion}</strong>
          <span>{ticketDetail}</span>
        </div>
        {state.tradeMode !== "cumulative" && (
          <div className="term-ticket-structure">
            <div>
              <span>Window</span>
              <strong>{selectedStartLabel} - {selected?.maturity ?? "--"}</strong>
            </div>
            <div>
              <span>{state.tradeMode === "hazard" ? "Conditional hazard" : "Window probability"}</span>
              <strong>{percent(tradePrice)}</strong>
            </div>
            <p>
              {state.tradeMode === "hazard"
                ? "Underlying interval legs are scaled by survival at the start of the window."
                : "This is a linked two-leg interval order with partial fill risk."}
            </p>
          </div>
        )}
        {selected?.flagged && (
          <div className="term-ticket-warning">Fit warning: consider raw prices or a narrower interval.</div>
        )}
        <div className="term-side">
          <button className={state.sideIdx === 0 ? "active yes" : ""} onClick={() => setState(prev => ({ ...prev, sideIdx: 0 }))}>Buy YES <strong>{Math.round(tradePrice * 100)}c</strong></button>
          <button className={state.sideIdx === 1 ? "active no" : ""} onClick={() => setState(prev => ({ ...prev, sideIdx: 1 }))}>Buy NO <strong>{Math.round((1 - tradePrice) * 100)}c</strong></button>
        </div>
        <label>Stake (£)</label>
        <input value={state.stake} onChange={event => setState(prev => ({ ...prev, stake: event.target.value }))} />
        <dl>
          <div><dt>{ticketPriceLabel}</dt><dd>{Math.round(sidePrice * 100)}c</dd></div>
          <div><dt>Stake</dt><dd>£{stake.toFixed(2)}</dd></div>
          <div><dt>Potential payout</dt><dd>£{payout.toFixed(2)}</dd></div>
          <div><dt>Potential profit</dt><dd>+£{Math.max(0, payout - stake).toFixed(2)}</dd></div>
          <div><dt>Contracts</dt><dd>{payout.toFixed(2)}</dd></div>
        </dl>
        {tradeResult?.error && <div className="term-ticket-warning">{tradeResult.error}</div>}
        {tradeResult?.success && (
          <div className="term-ticket-success">
            {state.tradeMode === "hazard" ? "Hazard contract submitted" : state.tradeMode === "interval" ? "Interval contract submitted" : "Order submitted"}
          </div>
        )}
        <button
          type="button"
          className="term-buy"
          disabled={!canSubmitTrade || isSubmittingTrade || sidePrice <= 0 || stake <= 0}
          onClick={handleTicketSubmit}
        >
          {isSubmittingTrade ? "Submitting..." : `Buy ${state.sideIdx === 0 ? "YES" : "NO"} - ${Math.round(sidePrice * 100)}c`}
        </button>
      </aside>
    </div>
  );
}

function RealHazardCategoryPage({
  slug,
  contracts,
  source,
  initialCondition,
}: {
  slug: string;
  contracts: any[];
  source: "live" | "generated";
  initialCondition: string | null;
}) {
  const cfg = CATEGORY_CONFIG[slug] ?? CATEGORY_CONFIG.life;
  const cards = buildRealHazardCards(slug, cfg, contracts);
  const totalContracts = cards.reduce((sum, card) => sum + card.contracts, 0);
  const sortedCards = [...cards].sort((a, b) => {
    if (a.closingSoon !== b.closingSoon) return a.closingSoon ? -1 : 1;
    return b.contracts - a.contracts;
  });

  return (
    <div className="hazard-market-page">
      <main className="hazard-market-panel">
        <header className="hazard-category-header">
          <div className="hazard-title-wrap">
            <span className="hazard-category-badge">{cfg.title.slice(0, 2).toUpperCase()}</span>
            <h1>{cfg.title} Insurance Markets</h1>
            {source === "live" && <span className="hazard-live-pill"><span aria-hidden="true">o</span> Live</span>}
          </div>
        </header>

        <div className="hazard-control-bar">
          <div className="hazard-control-group">
            <span className="hazard-control-label">Sort</span>
            <button className="hazard-control active" type="button">Volume</button>
            <button className="hazard-control" type="button">Probability</button>
            <button className="hazard-control" type="button">Closing soon</button>
          </div>
          <div className="hazard-control-divider" />
          <div className="hazard-control-group">
            <span className="hazard-control-label">Lean</span>
            <button className="hazard-control active" type="button">All</button>
            <button className="hazard-control yes" type="button">YES-leaning</button>
            <button className="hazard-control no" type="button">NO-leaning</button>
          </div>
          <div className="hazard-market-meta">
            {cards.length} markets / {totalContracts} contracts{initialCondition ? ` / ${initialCondition}` : ""}
          </div>
        </div>

        <section className="hazard-card-grid" aria-label={`${cfg.title} insurance market types`}>
          {sortedCards.map((card) => {
            const direction = card.chg24h >= 0 ? "up" : "down";
            return (
              <article className={`hazard-market-card${card.closingSoon ? " closing" : ""}`} key={card.name}>
                <div className="hazard-card-top">
                  <div className="hazard-monogram" style={{ backgroundColor: card.tint }}>{card.mono}</div>
                  <div className="hazard-name-block">
                    <div className="hazard-category-name">{card.name}</div>
                    <div className="hazard-category-question">{card.question}</div>
                  </div>
                  {card.closingSoon && <span className="hazard-closing-pill">Closing soon</span>}
                </div>

                <div className="hazard-card-mid">
                  <div className="hazard-price-block">
                    <div className="hazard-prob">{card.prob.toFixed(1)}%</div>
                    <div className={`hazard-change ${direction}`}>
                      {card.chg24h >= 0 ? "+" : ""}{card.chg24h.toFixed(1)}% <span>24H</span>
                    </div>
                  </div>
                  <div className="hazard-chart-block">
                    <RealHazardSparkline card={card} />
                  </div>
                </div>

                <div className="hazard-card-bottom">
                  <div className="hazard-stats-inline">
                    <span className="hazard-bid">{card.bid != null ? `${card.bid.toFixed(1)}c` : "--"}</span>
                    <span className="hazard-stat-sep"> / </span>
                    <span className="hazard-ask">{card.ask != null ? `${card.ask.toFixed(1)}c` : "--"}</span>
                    <span className="hazard-stat-sep"> / </span>
                    <span>{"\u00a3"}{card.vol} vol</span>
                    <span className="hazard-stat-sep"> / </span>
                    <span>{card.contracts} contracts</span>
                  </div>
                  <div className="hazard-card-actions">
                    <span className="hazard-resolve">Resolves {card.resolveDate}</span>
                    <Link to={card.href} className="hazard-trade-link">Trade</Link>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      </main>
    </div>
  );
}

export default function InsuranceCategoryPage() {
  const { slug, contracts, source, ladder, initialCondition, allConditionSummary } = useLoaderData<typeof loader>();
  const cfg = CATEGORY_CONFIG[slug] ?? CATEGORY_CONFIG.life;
  if (initialCondition) {
    return (
      <InsuranceTerminalPage
        slug={slug}
        contracts={contracts}
        source={source}
        initialCondition={initialCondition}
        allConditionSummary={allConditionSummary}
      />
    );
  }
  return <RealHazardCategoryPage slug={slug} contracts={contracts} source={source} initialCondition={initialCondition} />;

  const [selectedId,        setSelectedId]        = useState<string | null>(contracts[0]?.id ?? null);
  const [hoveredId,         setHoveredId]         = useState<string | null>(null);
  const [side,              setSide]              = useState<"YES" | "NO">("YES");
  const [stake,             setStake]             = useState("50");
  const [selectedCondition, setSelectedCondition] = useState<string | null>(initialCondition ?? null);
  const [ladderTab, setLadderTab] = useState<"by-date" | "intervals">("by-date");
  const [tradeModal, setTradeModal] = useState<{ interval: LadderInterval; direction: "BUY" | "SELL" } | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const tableRef = useRef<HTMLDivElement>(null);

  // Sync state when loader data changes (e.g. navigating between subcategories)
  // Use contracts[0]?.id as a proxy to detect when the contracts array actually changed
  const contractsKey = contracts.map(c => c.id).join(",");
  useEffect(() => {
    setSelectedCondition(initialCondition ?? null);
    setSelectedId(contracts[0]?.id ?? null);
    setSide("YES");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCondition, contractsKey]);

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
    <div className="ins-category-shell">

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
      {allConditionSummary.length > 1 && (
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
          {/* "All" link — only shown when NOT on a subcategory route */}
          {!initialCondition && (
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
              }}>{allConditionSummary.reduce((s, g) => s + g.count, 0)}</span>
            </button>
          )}

          {/* Back to all — only shown on subcategory route */}
          {initialCondition && (
            <Link
              to={`/app/insurance/${slug}`}
              style={{
                flexShrink: 0,
                padding: "0.3rem 0.875rem",
                borderRadius: 9999,
                border: "1px solid var(--border-primary)",
                background: "transparent",
                color: "var(--text-secondary)",
                fontSize: "0.8125rem",
                fontWeight: 500,
                textDecoration: "none",
                display: "flex",
                alignItems: "center",
                gap: "0.375rem",
                transition: "all 0.12s",
              }}
            >
              <span>← All</span>
            </Link>
          )}

          {/* Per-condition pills — navigate to subcategory URL */}
          {allConditionSummary.map(g => {
            const isActive = selectedCondition === g.name;
            const condSlug = g.name.toLowerCase().replace(/[^a-z0-9]/g, "");
            return (
              <Link
                key={g.name}
                to={`/app/insurance/${slug}/${condSlug}`}
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
                  textDecoration: "none",
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
                }}>{g.count}</span>
                {g.nearYes != null && (
                  <span style={{ display: "flex", gap: "0.25rem", fontSize: "0.7rem" }}>
                    <span style={{ color: "var(--accent-green)", fontWeight: 600 }}>{g.nearYes}¢</span>
                    <span style={{ color: "var(--text-tertiary, rgba(139,148,158,0.5))" }}>→</span>
                    <span style={{ color: "#f59e0b", fontWeight: 600 }}>{g.farYes}¢</span>
                  </span>
                )}
              </Link>
            );
          })}

          <span style={{
            marginLeft: "auto",
            flexShrink: 0,
            fontSize: "0.6875rem",
            color: "var(--text-secondary)",
          }}>
            {allConditionSummary.length} subcategories
          </span>
        </div>
      )}

      {/* ── Split body ───────────────────────────────────────────────────── */}
      <div className="ins-body" style={{ flex: 1 }}>

        {/* ── LEFT ─────────────────────────────────────────────────────── */}
        <div className="ins-left">

          {/* ── PAVA Probability Curve ────────────────────────────────── */}
          {ladder && (ladder as LadderData).points.length >= 2 && (
            <div style={{
              padding: "0.75rem",
              marginBottom: "0.75rem",
              background: "rgba(74,222,128,0.03)",
              border: "1px solid var(--border-primary)",
              borderRadius: 8,
            }}>
              <div style={{
                display: "flex", alignItems: "center", gap: "0.75rem",
                marginBottom: "0.5rem",
              }}>
                <span style={{ fontSize: "0.6875rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#4ade80" }}>
                  📊 PAVA-Fitted Probability Curve
                </span>
                <span style={{ fontSize: "0.6875rem", color: "var(--text-secondary)" }}>
                  <span style={{ color: "#4ea8de" }}>●</span> Raw &nbsp;
                  <span style={{ color: "#4ade80" }}>━</span> Fitted
                </span>
              </div>
              <div style={{ height: 200 }}>
                <LadderChart points={(ladder as LadderData).points as LadderPoint[]} />
              </div>
            </div>
          )}

          {/* ── Ladder Tabs: By-Date / Intervals ─────────────────────────── */}
          {ladder && ladder.points.length > 0 && (
            <div style={{ marginBottom: "1rem" }}>
              <div style={{
                display: "flex", gap: "0.25rem",
                padding: "0 0.5rem",
                borderBottom: "1px solid var(--border-primary)",
                marginBottom: "0.75rem",
              }}>
                <button
                  onClick={() => setLadderTab("by-date")}
                  style={{
                    padding: "0.5rem 1rem",
                    background: "none", border: "none", cursor: "pointer",
                    borderBottom: ladderTab === "by-date" ? "2px solid #4ade80" : "2px solid transparent",
                    color: ladderTab === "by-date" ? "#4ade80" : "var(--text-secondary)",
                    fontWeight: ladderTab === "by-date" ? 600 : 400,
                    fontSize: "0.8125rem",
                  }}
                >
                  By Date
                </button>
                <button
                  onClick={() => setLadderTab("intervals")}
                  style={{
                    padding: "0.5rem 1rem",
                    background: "none", border: "none", cursor: "pointer",
                    borderBottom: ladderTab === "intervals" ? "2px solid #4ade80" : "2px solid transparent",
                    color: ladderTab === "intervals" ? "#4ade80" : "var(--text-secondary)",
                    fontWeight: ladderTab === "intervals" ? 600 : 400,
                    fontSize: "0.8125rem",
                  }}
                >
                  Intervals ({(ladder as LadderData).intervals.length})
                </button>
              </div>

              {ladderTab === "by-date" && (
                <div style={{ overflowX: "auto" }}>
                  <table className="ins-table">
                    <thead>
                      <tr>
                        <th>Maturity</th>
                        <th className="right">Raw YES</th>
                        <th className="right">Fitted YES</th>
                        <th className="right">Interval %</th>
                        <th className="right">Bid</th>
                        <th className="right">Ask</th>
                        <th className="right">OI</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {(ladder as LadderData).points.map((p: LadderPoint) => (
                        <tr key={p.marketId} className={p.marketId === selectedId ? "selected" : ""} onClick={() => handleRowClick(p.marketId)}>
                          <td style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{fmtDate(p.maturity)}</td>
                          <td className="right" style={{ color: p.violated ? "#f87171" : "var(--text-primary)" }}>
                            {pct(p.rawYes)}
                          </td>
                          <td className="right" style={{ color: "#4ade80" }}>{pct(p.fittedYes)}</td>
                          <td className="right" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.75rem" }}>
                            {pct(p.intervalProb)}
                          </td>
                          <td className="right" style={{ color: p.bestBidYes != null ? "#10b981" : "var(--text-secondary)" }}>
                            {pct(p.bestBidYes)}
                          </td>
                          <td className="right" style={{ color: p.bestAskYes != null ? "#ef4444" : "var(--text-secondary)" }}>
                            {pct(p.bestAskYes)}
                          </td>
                          <td className="right" style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                            {fmtPence(p.openInterestPence)}
                          </td>
                          <td className="right">
                            <Link to={`/app/markets/${p.marketId}`}
                              onClick={(e) => e.stopPropagation()}
                              className="ins-trade-btn"
                              style={{ textDecoration: "none", display: "inline-block" }}>
                              Trade →
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {ladderTab === "intervals" && (
                <div>
                  <div style={{
                    display: "grid", gridTemplateColumns: "1fr auto auto auto",
                    gap: "0.5rem", padding: "0.5rem 0.75rem",
                    borderBottom: "1px solid var(--border-primary)",
                    background: "rgba(0,0,0,0.2)",
                  }}>
                    <span style={{ fontSize: "0.6875rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--text-secondary)" }}>Interval</span>
                    <span style={{ fontSize: "0.6875rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--text-secondary)" }}>Implied %</span>
                    <span></span>
                    <span></span>
                  </div>
                  {(ladder as LadderData).intervals.map((iv: LadderInterval, i: number) => (
                    <div key={i} style={{
                      display: "grid", gridTemplateColumns: "1fr auto auto auto",
                      gap: "0.5rem", padding: "0.5rem 0.75rem",
                      borderBottom: "1px solid var(--border-primary)",
                      alignItems: "center",
                    }}>
                      <span style={{ fontSize: "0.8125rem", fontWeight: 500 }}>{iv.label}</span>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.8125rem", color: "#4ade80" }}>
                        {pct(iv.price)}
                      </span>
                      <button
                        onClick={() => setTradeModal({ interval: iv, direction: "BUY" })}
                        style={{
                          padding: "0.25rem 0.75rem", borderRadius: 4,
                          border: "1px solid rgba(16,185,129,0.35)", background: "rgba(16,185,129,0.12)",
                          color: "#10b981", fontSize: "0.75rem", fontWeight: 600, cursor: "pointer",
                        }}
                      >Buy</button>
                      <button
                        onClick={() => setTradeModal({ interval: iv, direction: "SELL" })}
                        style={{
                          padding: "0.25rem 0.75rem", borderRadius: 4,
                          border: "1px solid rgba(239,68,68,0.35)", background: "rgba(239,68,68,0.12)",
                          color: "#ef4444", fontSize: "0.75rem", fontWeight: 600, cursor: "pointer",
                        }}
                      >Sell</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}



        </div>

        {/* ── RIGHT ────────────────────────────────────────────────────── */}
        <div className="ins-right">

          {/* Contract details — collapsible */}
          <div className="ins-detail">
            <button
              onClick={() => setDetailOpen(o => !o)}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                width: "100%", background: "none", border: "none", padding: 0,
                cursor: "pointer",
              }}
            >
              <span style={{ fontSize: "0.6875rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-secondary)" }}>
                Contract details
              </span>
              <span style={{
                fontSize: 14, color: "var(--text-secondary)",
                transform: detailOpen ? "rotate(180deg)" : "rotate(0deg)",
                transition: "transform 0.2s",
                lineHeight: 1,
              }}>
                ▾
              </span>
            </button>

            {detailOpen && (
              <>
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
              </>
            )}
          </div>

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

            <Link
              to={selected ? `/app/markets/${selected.id}` : "#"}
              className={side === "YES" ? "ins-buy-yes-btn" : "ins-buy-no-btn"}
              style={{ display: "block", textAlign: "center", textDecoration: "none" }}
            >
              Buy {side} — {pricePts}¢
            </Link>
          </div>

        </div>
      </div>

      {/* ── Interval Trade Modal ──────────────────────────────────────── */}
      {tradeModal && (
        <IntervalTradeModal
          interval={tradeModal.interval}
          direction={tradeModal.direction}
          slug={slug}
          onClose={() => setTradeModal(null)}
        />
      )}
    </div>
  );
}


