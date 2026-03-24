import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
import { getMarkets } from "~/lib/api.server";
import { getAuthenticatedUser } from "~/lib/auth.server";
import { MarketCard } from "~/components/MarketCard";
import { useState, useEffect } from "react";
import "~/styles/pages/markets-index.css";
import "~/styles/pages/insurance.css";

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await getAuthenticatedUser(request);
  try {
    const data = await getMarkets();
    return json({ markets: data.markets || [], user });
  } catch {
    return json({ markets: [], user });
  }
}

// ── Insurance category definitions (static catalogue) ─────────────────────
const INSURANCE_CATEGORIES = [
  {
    slug: "life",
    icon: "🫀",
    title: "Life",
    desc: "Survival & mortality contracts on synthetic cohorts across maturity dates.",
    tags: ["Survival", "Cohort mortality", "Longevity"],
    markets: 12,
    vol: "£48,200",
  },
  {
    slug: "health",
    icon: "🏥",
    title: "Health",
    desc: "Diagnosis, hospitalisation, and recovery event markets.",
    tags: ["Diagnosis", "Hospitalisation", "Recovery"],
    markets: 6,
    vol: "£12,600",
  },
  {
    slug: "climate",
    icon: "🌧️",
    title: "Climate",
    desc: "Hurricane, flood, rainfall, and wind threshold contracts by region.",
    tags: ["Hurricane", "Flood", "Rainfall"],
    markets: 9,
    vol: "£31,400",
  },
  {
    slug: "agriculture",
    icon: "🌾",
    title: "Agriculture",
    desc: "Crop yield failure, rainfall shortfall, and seasonal threshold markets.",
    tags: ["Crop yield", "Rainfall", "Seasonal"],
    markets: 5,
    vol: "£8,900",
  },
  {
    slug: "liability",
    icon: "⚖️",
    title: "Liability",
    desc: "Claim filing, judgment, and loss-threshold contracts by industry cohort.",
    tags: ["Claims", "Judgment", "Loss threshold"],
    markets: 4,
    vol: "£6,100",
  },
  {
    slug: "travel",
    icon: "✈️",
    title: "Travel",
    desc: "Flight delay, cancellation, and disruption markets by route and window.",
    tags: ["Delay", "Cancellation", "Disruption"],
    markets: 8,
    vol: "£19,300",
  },
];

type Tab = "prediction" | "insurance";

export default function MarketsIndex() {
  const { markets } = useLoaderData<typeof loader>();
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [tab, setTab] = useState<Tab>("prediction");

  useEffect(() => {
    const saved = localStorage.getItem("watchlist");
    if (saved) {
      try { setWatchlist(JSON.parse(saved)); } catch { setWatchlist([]); }
    }
  }, []);

  const handleToggleWatch = (marketId: string) => {
    setWatchlist(prev => {
      const next = prev.includes(marketId)
        ? prev.filter(id => id !== marketId)
        : [...prev, marketId];
      localStorage.setItem("watchlist", JSON.stringify(next));
      return next;
    });
  };

  const filteredMarkets = markets.filter((m: any) =>
    searchQuery === "" ||
    m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div style={{ padding: "1.5rem 2rem", maxWidth: 1280, margin: "0 auto" }}>

      {/* ── Page header ───────────────────────────────────── */}
      <div style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--text-primary)", margin: "0 0 0.375rem" }}>
          Market Explorer
        </h1>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.9375rem", margin: 0 }}>
          Trade probabilities on real-world events — prediction markets and insurance-linked risk contracts.
        </p>
      </div>

      {/* ── Two-column hero tab selector ─────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1.75rem" }}>
        {/* Prediction panel */}
        <button
          onClick={() => setTab("prediction")}
          style={{
            textAlign: "left",
            background: tab === "prediction" ? "rgba(88,166,255,0.08)" : "var(--bg-secondary)",
            border: `1px solid ${tab === "prediction" ? "var(--accent-blue)" : "var(--border-primary)"}`,
            borderRadius: 10,
            padding: "1.25rem",
            cursor: "pointer",
            transition: "all 0.15s",
          }}
        >
          <div style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>📈</div>
          <div style={{ fontWeight: 700, fontSize: "1rem", color: "var(--text-primary)", marginBottom: "0.25rem" }}>
            Prediction Markets
          </div>
          <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
            Sports, politics, finance, and current events. Binary contracts with market-set probabilities.
          </div>
          <div style={{ marginTop: "0.75rem", display: "flex", gap: "1rem" }}>
            <span style={{ fontSize: "0.75rem", color: "var(--accent-green)", fontWeight: 600 }}>
              {markets.length} active markets
            </span>
            {tab === "prediction" && (
              <span style={{ fontSize: "0.75rem", color: "var(--accent-blue)", fontWeight: 600 }}>● Selected</span>
            )}
          </div>
        </button>

        {/* Insurance panel */}
        <button
          onClick={() => setTab("insurance")}
          style={{
            textAlign: "left",
            background: tab === "insurance" ? "rgba(125,86,194,0.08)" : "var(--bg-secondary)",
            border: `1px solid ${tab === "insurance" ? "#7d56c2" : "var(--border-primary)"}`,
            borderRadius: 10,
            padding: "1.25rem",
            cursor: "pointer",
            transition: "all 0.15s",
          }}
        >
          <div style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>🔒</div>
          <div style={{ fontWeight: 700, fontSize: "1rem", color: "var(--text-primary)", marginBottom: "0.25rem" }}>
            Insurance-Linked Markets
          </div>
          <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
            Life, climate, agriculture, and liability contracts. Structured event-risk markets across maturity dates.
          </div>
          <div style={{ marginTop: "0.75rem", display: "flex", gap: "1rem" }}>
            <span style={{ fontSize: "0.75rem", color: "#a371f7", fontWeight: 600 }}>44 active contracts</span>
            {tab === "insurance" && (
              <span style={{ fontSize: "0.75rem", color: "#7d56c2", fontWeight: 600 }}>● Selected</span>
            )}
          </div>
        </button>
      </div>

      {/* ── Prediction Markets ────────────────────────────── */}
      {tab === "prediction" && (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem", gap: "1rem", flexWrap: "wrap" }}>
            <div style={{ fontSize: "0.6875rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-secondary)" }}>
              All prediction markets · {filteredMarkets.length} listed
            </div>
            <input
              type="search"
              placeholder="Search markets…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                background: "var(--bg-secondary)",
                border: "1px solid var(--border-primary)",
                borderRadius: 6,
                padding: "0.4375rem 0.75rem",
                fontSize: "0.875rem",
                color: "var(--text-primary)",
                outline: "none",
                width: 240,
              }}
            />
          </div>

          {filteredMarkets.length === 0 ? (
            <div style={{ textAlign: "center", padding: "3rem 1rem", color: "var(--text-secondary)" }}>
              <div style={{ fontSize: "2rem", marginBottom: "0.5rem", opacity: 0.4 }}>📭</div>
              <div style={{ fontWeight: 600 }}>{searchQuery ? "No markets found" : "No markets available"}</div>
              <div style={{ fontSize: "0.875rem", marginTop: "0.25rem" }}>
                {searchQuery ? "Try a different search term" : "Check back later for new markets"}
              </div>
            </div>
          ) : (
            <div className="markets-grid">
              {filteredMarkets.map((market: any) => (
                <MarketCard
                  key={market.id}
                  marketId={market.id}
                  title={market.name}
                  description={market.description || ""}
                  status={market.status || "ACTIVE"}
                  type={market.type || "BINARY"}
                  isWatched={watchlist.includes(market.id)}
                  onToggleWatch={handleToggleWatch}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Insurance-Linked Markets ──────────────────────── */}
      {tab === "insurance" && (
        <>
          {/* Summary strip */}
          <div style={{
            display: "flex",
            gap: "1.5rem",
            padding: "0.75rem 1rem",
            background: "var(--bg-secondary)",
            border: "1px solid var(--border-primary)",
            borderRadius: 8,
            marginBottom: "1.25rem",
            flexWrap: "wrap",
          }}>
            {[
              { label: "Insurance types", value: "6" },
              { label: "Active contracts", value: "44" },
              { label: "Total OI", value: "£126,500" },
              { label: "Maturities listed", value: "78" },
            ].map(s => (
              <div key={s.label} style={{ display: "flex", flexDirection: "column", gap: "0.125rem" }}>
                <span style={{ fontSize: "0.6875rem", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{s.label}</span>
                <span style={{ fontSize: "0.9375rem", fontWeight: 600, color: "var(--text-primary)" }}>{s.value}</span>
              </div>
            ))}
          </div>

          <div style={{ fontSize: "0.6875rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-secondary)", marginBottom: "0.75rem" }}>
            Insurance types
          </div>

          <div className="ins-grid">
            {INSURANCE_CATEGORIES.map(cat => (
              <Link key={cat.slug} to={`/app/insurance/${cat.slug}`} className="ins-card">
                <div className="ins-card-header">
                  <div className="ins-card-icon">{cat.icon}</div>
                  <h3 className="ins-card-title">{cat.title}</h3>
                </div>
                <p className="ins-card-desc">{cat.desc}</p>
                <div className="ins-card-tags">
                  {cat.tags.map(t => <span key={t} className="ins-tag">{t}</span>)}
                </div>
                <div className="ins-card-footer">
                  <span>{cat.markets} contracts</span>
                  <span className="vol">{cat.vol} OI</span>
                  <span style={{ color: "var(--accent-blue)", fontWeight: 600 }}>Explore →</span>
                </div>
              </Link>
            ))}
          </div>

          {/* How it works strip */}
          <div style={{
            marginTop: "1.5rem",
            padding: "1.25rem",
            background: "var(--bg-secondary)",
            border: "1px solid var(--border-primary)",
            borderRadius: 10,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "1.25rem",
          }}>
            {[
              { icon: "📐", title: "Maturity Ladder", desc: "Each insurance type lists contracts across multiple dates — like an options expiry chain." },
              { icon: "📈", title: "Survival Curve",  desc: "YES prices fall as maturity extends. The curve shows the full risk structure at a glance." },
              { icon: "🛡️", title: "Hedge Simulator", desc: "Model insurance payouts vs your open book. Built into every contract page." },
            ].map(b => (
              <div key={b.title}>
                <div style={{ fontSize: "1.25rem", marginBottom: "0.375rem" }}>{b.icon}</div>
                <div style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: "0.875rem", marginBottom: "0.25rem" }}>{b.title}</div>
                <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>{b.desc}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
