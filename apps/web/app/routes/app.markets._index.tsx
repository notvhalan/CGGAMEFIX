import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import {
  getInsuranceCategories,
  getInsuranceCategoryWithContracts,
  getMarkets,
  type InsuranceCategory,
  type InsuranceContract,
} from "~/lib/api.server";
import "~/styles/pages/markets-index.css";

type MarketRow = {
  id: string;
  mono: string;
  tint: string;
  category: string;
  categorySlug: string;
  name: string;
  question: string;
  probability: number;
  chg24h: number;
  contracts: number;
  bid: number | null;
  ask: number | null;
  volumePence: number;
  oiPence: number;
  resolveDate: string | null;
  href: string;
  points: number[];
};

type CategorySection = {
  slug: string;
  title: string;
  tint: string;
  rows: MarketRow[];
};

const CATEGORY_TINTS: Record<string, string> = {
  life: "#5b8dff",
  health: "#21c17a",
  climate: "#59c3d6",
  agriculture: "#f0b45b",
  liability: "#b98bff",
  travel: "#ff8ba7",
  prediction: "#6f7d95",
};

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function monogram(value: string) {
  const words = value.replace(/[^a-zA-Z0-9 ]/g, " ").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "MK";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}

function formatDate(value: string | null) {
  if (!value) return "Open";
  return new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function formatMoneyPence(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "GBP 0";
  const pounds = value / 100;
  if (pounds >= 1000) return `GBP ${(pounds / 1000).toFixed(1)}k`;
  return `GBP ${pounds.toFixed(0)}`;
}

function displayPts(value: number | null) {
  return value == null ? "--" : `${Math.round(value)}c`;
}

function signedPercent(value: number) {
  if (Math.abs(value) < 0.05) return "0.0%";
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function deriveChange(contracts: InsuranceContract[]) {
  const priced = contracts.find((contract) => contract.lastTradeYes != null);
  if (!priced || priced.lastTradeYes == null) return 0;
  return Math.max(-12, Math.min(12, priced.yesPts - priced.lastTradeYes));
}

function buildInsuranceRows(category: InsuranceCategory, contracts: InsuranceContract[]): MarketRow[] {
  const fallbackCondition = (category as any).conditionName ?? (category as any).condition_name ?? "Other";
  const baseYesPts = Number((category as any).baseYesPts ?? (category as any).base_yes_pts ?? 50);
  const questionTemplate = (category as any).questionTemplate ?? (category as any).question_template;
  const groups = new Map<string, InsuranceContract[]>();
  for (const contract of contracts) {
    const key = contract.conditionName || fallbackCondition;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(contract);
  }

  return Array.from(groups.entries()).map(([conditionName, group]) => {
    const sorted = [...group].sort((a, b) => {
      const aTime = a.maturityDate ? new Date(a.maturityDate).getTime() : Number.MAX_SAFE_INTEGER;
      const bTime = b.maturityDate ? new Date(b.maturityDate).getTime() : Number.MAX_SAFE_INTEGER;
      return aTime - bTime;
    });
    const near = sorted[0];
    const bid = near?.bestBidYes ?? null;
    const ask = near?.bestAskYes ?? null;
    const probability = bid != null && ask != null
      ? (bid + ask) / 2
      : near?.yesPts ?? baseYesPts;

    return {
      id: `${category.slug}:${conditionName}`,
      mono: monogram(conditionName),
      tint: CATEGORY_TINTS[category.slug] || CATEGORY_TINTS.prediction,
      category: category.title,
      categorySlug: category.slug,
      name: conditionName,
      question: near?.question || questionTemplate || category.description,
      probability,
      chg24h: deriveChange(sorted),
      contracts: sorted.length,
      bid,
      ask,
      volumePence: sorted.reduce((sum, contract) => sum + Number(contract.volume24hPence || 0), 0),
      oiPence: sorted.reduce((sum, contract) => sum + Number(contract.oiPence || 0), 0),
      resolveDate: sorted[sorted.length - 1]?.maturityDate ?? null,
      href: `/app/insurance/${category.slug}/${slugify(conditionName)}`,
      points: sorted.map((contract) => contract.yesPts),
    };
  });
}

function buildPredictionRows(markets: any[]): MarketRow[] {
  return markets
    .filter((market) => market.marketCategory !== "INSURANCE")
    .map((market) => ({
      id: market.id,
      mono: monogram(market.name || market.question || "Market"),
      tint: CATEGORY_TINTS.prediction,
      category: "Prediction",
      categorySlug: "prediction",
      name: market.name || "Untitled Market",
      question: market.question || market.description || market.name || "Open prediction market",
      probability: 50,
      chg24h: 0,
      contracts: 1,
      bid: null,
      ask: null,
      volumePence: 0,
      oiPence: 0,
      resolveDate: market.maturityDate || market.endTime || null,
      href: `/app/markets/${market.id}`,
      points: [50],
    }));
}

export async function loader(_: LoaderFunctionArgs) {
  const [marketsData, categoriesData] = await Promise.all([
    getMarkets().catch(() => ({ markets: [] })),
    getInsuranceCategories().catch(() => ({ categories: [] })),
  ]);

  const categoryDetails = await Promise.all(
    categoriesData.categories.map(async (category) => ({
      category,
      data: await getInsuranceCategoryWithContracts(category.slug),
    })),
  );

  const insuranceSections: CategorySection[] = categoryDetails.map(({ category, data }) => {
    const detailCategory = data?.category || category;
    return {
      slug: detailCategory.slug,
      title: detailCategory.title,
      tint: CATEGORY_TINTS[detailCategory.slug] || CATEGORY_TINTS.prediction,
      rows: buildInsuranceRows(detailCategory, data?.contracts || []),
    };
  });

  const predictionRows = buildPredictionRows(marketsData.markets || []);
  const sections = [
    ...insuranceSections.filter((section) => section.rows.length > 0),
    ...(predictionRows.length > 0 ? [{
      slug: "prediction",
      title: "Prediction",
      tint: CATEGORY_TINTS.prediction,
      rows: predictionRows,
    }] : []),
  ];

  return json({
    sections,
    categoryCount: sections.length,
    rowCount: sections.reduce((sum, section) => sum + section.rows.length, 0),
    contractCount: sections.reduce(
      (sum, section) => sum + section.rows.reduce((rowSum, row) => rowSum + row.contracts, 0),
      0,
    ),
  });
}

function hazardPaths(points: number[], seed: number) {
  const values = points.length > 1 ? points : Array.from({ length: 8 }, (_, index) => {
    const base = points[0] ?? 50;
    return Math.max(1, Math.min(99, base + Math.sin((index + seed) * 0.9) * 2));
  });
  const pad = 3;
  const usableHeight = 40 - pad * 2;
  const max = Math.max(...values, 100);
  const normalized = values.map((value, index) => {
    const x = values.length === 1 ? 100 : (index / (values.length - 1)) * 100;
    const y = 40 - pad - (value / max) * usableHeight;
    return [x, y] as const;
  });
  const line = normalized.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`).join(" ");
  const area = `${line} L100 40 L0 40 Z`;
  return { line, area };
}

function HazardSparkline({ row, index }: { row: MarketRow; index: number }) {
  const { line, area } = hazardPaths(row.points, index);
  const color = row.chg24h > 0.05 ? "#21c17a" : row.chg24h < -0.05 ? "#f0616d" : "#5b8dff";

  return (
    <svg className="mktx-sparkline" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
      <path d={area} fill={color} opacity="0.14" />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth="1.75"
        vectorEffect="non-scaling-stroke"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function MarketsIndex() {
  const { sections, categoryCount, rowCount, contractCount } = useLoaderData<typeof loader>();

  return (
    <div className="mktx-page">
      <nav className="mktx-nav" aria-label="Markets navigation">
        <Link to="/app/markets" className="mktx-brand" aria-label="GameFix markets">
          <span className="mktx-brand-mark" />
          <span>GameFix</span>
        </Link>

        <div className="mktx-tabs" aria-label="Primary">
          <Link to="/app/markets" className="mktx-tab mktx-tab-active">Markets</Link>
          <Link to="/app/positions" className="mktx-tab">Portfolio</Link>
          <Link to="/app/orders" className="mktx-tab">Orders</Link>
          <Link to="/app/markets" className="mktx-tab mktx-tab-trade">Trade</Link>
        </div>

        <label className="mktx-search">
          <span className="mktx-visually-hidden">Search markets</span>
          <input placeholder="Search markets... (press / to focus)" />
        </label>

        <div className="mktx-wallet" aria-label="Market status">
          <span>Categories <strong>{categoryCount}</strong></span>
          <span>Markets <strong>{rowCount}</strong></span>
          <span className="mktx-live">Live</span>
        </div>
      </nav>

      <main className="mktx-shell">
        <header className="mktx-header">
          <div className="mktx-title-wrap">
            <h1>Markets</h1>
            <span className="mktx-live">Live</span>
          </div>
          <div className="mktx-meta">
            {categoryCount} categories / {rowCount} market types / {contractCount} contracts
          </div>
        </header>

        <section className="mktx-category-rail" aria-label="Market categories">
          {sections.map((section) => (
            <a key={section.slug} href={`#${section.slug}`} className="mktx-category-chip">
              <span className="mktx-category-dot" style={{ backgroundColor: section.tint }} />
              <span>{section.title}</span>
              <strong>{section.rows.length}</strong>
            </a>
          ))}
        </section>

        <div className="mktx-list" aria-label="All market categories and market types">
          {sections.map((section) => (
            <section className="mktx-section" id={section.slug} key={section.slug}>
              <div className="mktx-section-header">
                <div>
                  <span className="mktx-section-kicker">Category</span>
                  <h2>{section.title}</h2>
                </div>
                <span>{section.rows.reduce((sum, row) => sum + row.contracts, 0)} contracts</span>
              </div>

              {section.rows.map((row, index) => {
                const direction = row.chg24h > 0.05 ? "up" : row.chg24h < -0.05 ? "down" : "flat";
                return (
                  <article className="mktx-row" key={row.id}>
                    <div className="mktx-mono" style={{ backgroundColor: row.tint }}>{row.mono}</div>

                    <div className="mktx-name-block">
                      <div className="mktx-row-category">{row.category}</div>
                      <h2>{row.name}</h2>
                      <p>{row.question}</p>
                    </div>

                    <div className="mktx-price-block">
                      <div className="mktx-prob">{row.probability.toFixed(1)}%</div>
                      <div className={`mktx-change mktx-${direction}`}>{signedPercent(row.chg24h)}</div>
                    </div>

                    <div className="mktx-chart">
                      <HazardSparkline row={row} index={index} />
                    </div>

                    <div className="mktx-stats">
                      <div>
                        <span className="mktx-up">{displayPts(row.bid)}</span>
                        <span className="mktx-sep"> / </span>
                        <span className="mktx-down">{displayPts(row.ask)}</span>
                      </div>
                      <div>{formatMoneyPence(row.volumePence)} vol / {row.contracts}c</div>
                      <div className="mktx-date">{formatDate(row.resolveDate)}</div>
                    </div>

                    <Link to={row.href} className="mktx-trade">Trade</Link>
                  </article>
                );
              })}
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
