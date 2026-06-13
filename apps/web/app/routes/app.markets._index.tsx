import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
import { getMarkets, getInsuranceCategories } from "~/lib/api.server";
import { getAuthenticatedUser } from "~/lib/auth.server";
import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import "~/styles/pages/markets-index.css";
import "~/styles/pages/insurance.css";

/* ── motion presets ───────────────────────────────────────── */
const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.06, duration: 0.45, ease: [0.16, 1, 0.3, 1] },
  }),
};

const revealChildren = {
  hidden: { opacity: 0, height: 0 },
  visible: { opacity: 1, height: "auto", transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } },
  exit:    { opacity: 0, height: 0, transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] } },
};

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await getAuthenticatedUser(request);
  try {
    const [marketsData, insuranceData] = await Promise.all([
      getMarkets(),
      getInsuranceCategories(),
    ]);
    return json({
      markets: marketsData.markets || [],
      insuranceCategories: insuranceData.categories || [],
      user,
    });
  } catch {
    return json({ markets: [], insuranceCategories: [], user });
  }
}

/* ── helpers ──────────────────────────────────────────────── */

/** Map insurance slugs to their display icons */
const INS_ICONS: Record<string, string> = {
  life: "🫀", health: "🏥", climate: "🌧️",
  agriculture: "🌾", liability: "⚖️", travel: "✈️",
};

/** Infer a prediction subcategory from market name + tags */
function inferPredictionCategory(m: any): { category: string; icon: string } {
  const n = (m.name || "").toLowerCase();
  const tags = (m.tags || []).map((t: string) => t.toLowerCase());
  const all = n + " " + tags.join(" ");

  if (/e2e|test|demo/i.test(n))                        return { category: "Testing", icon: "🧪" };
  if (/cure|disease|medical|drug|fda|treatment|paralysis|cancer/i.test(all))
                                                         return { category: "Science & Medicine", icon: "🧬" };
  if (/election|president|vote|politi|congress|senate|governor/i.test(all))
                                                         return { category: "Politics", icon: "🏛️" };
  if (/stock|crypto|bitcoin|btc|eth|price|gdp|fed|rate|inflation|nasdaq|s&p|market cap/i.test(all))
                                                         return { category: "Finance & Crypto", icon: "💹" };
  if (/sport|nfl|nba|mlb|premier|champion|world cup|super bowl|win|match|game|goal/i.test(all))
                                                         return { category: "Sports", icon: "⚽" };
  if (/ai|gpt|chip|launch|release|tech|apple|google|spacex|nasa|robot/i.test(all))
                                                         return { category: "Technology", icon: "🤖" };
  if (/weather|hurricane|earthquake|flood|climate|temp/i.test(all))
                                                         return { category: "Weather & Climate", icon: "🌍" };
  if (/movie|oscar|grammy|album|box office|entertain/i.test(all))
                                                         return { category: "Entertainment", icon: "🎬" };
  return { category: "General", icon: "📊" };
}

/* ── category sort order ──────────────────────────────────── */
const CAT_ORDER: Record<string, number> = {
  "Science & Medicine": 1, "Politics": 2, "Finance & Crypto": 3,
  "Sports": 4, "Technology": 5, "Weather & Climate": 6,
  "Entertainment": 7, "General": 8, "Testing": 99,
};

/* ── component ────────────────────────────────────────────── */

export default function MarketsIndex() {
  const { markets, insuranceCategories } = useLoaderData<typeof loader>();
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());

  /* ── build categories → subcategories structure ───────── */
  const { predictionCategories, insuranceCats, totalMarkets, totalInsurance } = useMemo(() => {
    const predMarkets = (markets as any[]).filter(
      (m: any) => (m.marketCategory || "PREDICTION") === "PREDICTION"
    );
    const insMarkets = (markets as any[]).filter(
      (m: any) => m.marketCategory === "INSURANCE"
    );

    // Search filter
    const sq = searchQuery.toLowerCase();
    const filterFn = (m: any) =>
      !sq ||
      m.name?.toLowerCase().includes(sq) ||
      m.description?.toLowerCase().includes(sq) ||
      (m.conditionName || "").toLowerCase().includes(sq);

    // ── Prediction: group by inferred category → subcategory (conditionName or name-based) ──
    const catMap = new Map<string, {
      icon: string;
      subcategories: Map<string, any[]>;
    }>();

    for (const m of predMarkets.filter(filterFn)) {
      const { category, icon } = inferPredictionCategory(m);
      if (!catMap.has(category)) {
        catMap.set(category, { icon, subcategories: new Map() });
      }
      const sub = m.conditionName || m.name || "Uncategorised";
      const entry = catMap.get(category)!;
      if (!entry.subcategories.has(sub)) {
        entry.subcategories.set(sub, []);
      }
      entry.subcategories.get(sub)!.push(m);
    }

    // Sort categories by defined order
    const sorted = [...catMap.entries()].sort(
      ([a], [b]) => (CAT_ORDER[a] ?? 50) - (CAT_ORDER[b] ?? 50)
    );

    // ── Insurance: count via insurance markets from API (matches conditionName) ──
    const insCountBySlug = new Map<string, number>();
    for (const m of insMarkets) {
      const slug = m.insuranceCategory || "";
      insCountBySlug.set(slug, (insCountBySlug.get(slug) || 0) + 1);
    }

    // Build insurance categories with live counts (prefer API categories, fall back to market data)
    const insCats = (insuranceCategories as any[]).length > 0
      ? (insuranceCategories as any[]).map((c: any) => ({
          slug: c.slug,
          icon: INS_ICONS[c.slug] || "🔒",
          title: c.title,
          description: c.description,
          tags: c.tags || [],
          contractCount: c.contractCount || insCountBySlug.get(c.slug) || 0,
        }))
      : [
          { slug: "life",        icon: "🫀", title: "Life",        description: "Survival & mortality contracts on synthetic cohorts.", tags: ["Survival", "Longevity"],               contractCount: insCountBySlug.get("life") || 0 },
          { slug: "health",      icon: "🏥", title: "Health",      description: "Diagnosis, hospitalisation, and recovery markets.",   tags: ["Diagnosis", "Recovery"],                contractCount: insCountBySlug.get("health") || 0 },
          { slug: "climate",     icon: "🌧️", title: "Climate",     description: "Hurricane, flood, and wind threshold contracts.",     tags: ["Hurricane", "Flood"],                   contractCount: insCountBySlug.get("climate") || 0 },
          { slug: "agriculture", icon: "🌾", title: "Agriculture", description: "Crop yield and seasonal threshold markets.",          tags: ["Crop yield", "Seasonal"],               contractCount: insCountBySlug.get("agriculture") || 0 },
          { slug: "liability",   icon: "⚖️", title: "Liability",   description: "Claim filing and judgment event contracts.",          tags: ["Claims", "Judgment"],                   contractCount: insCountBySlug.get("liability") || 0 },
          { slug: "travel",      icon: "✈️", title: "Travel",      description: "Flight delay and disruption markets.",                tags: ["Delay", "Cancellation"],                contractCount: insCountBySlug.get("travel") || 0 },
        ];

    // Filter insurance by search too
    const filteredIns = sq
      ? insCats.filter(c =>
          c.title.toLowerCase().includes(sq) ||
          c.description.toLowerCase().includes(sq) ||
          c.tags.some((t: string) => t.toLowerCase().includes(sq))
        )
      : insCats;

    return {
      predictionCategories: sorted,
      insuranceCats: filteredIns,
      totalMarkets: predMarkets.length,
      totalInsurance: insMarkets.length,
    };
  }, [markets, insuranceCategories, searchQuery]);

  const toggleCategory = (key: string) => {
    setExpandedCats(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Auto-expand categories with few items or when searching
  useEffect(() => {
    if (searchQuery) {
      const all = new Set<string>();
      predictionCategories.forEach(([cat]) => all.add(`pred:${cat}`));
      all.add("insurance");
      setExpandedCats(all);
    }
  }, [searchQuery, predictionCategories]);

  const totalPredCats = predictionCategories.length;
  const totalSubcats = predictionCategories.reduce(
    (sum, [, v]) => sum + v.subcategories.size, 0
  );

  return (
    <div className="mkt-page">
      {/* ── Header ───────────────────────────────────────── */}
      <motion.div
        className="mkt-header"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="mkt-header-top">
          <div>
            <h1 className="mkt-title">Markets</h1>
            <p className="mkt-subtitle">
              Browse categories and subcategories — prediction markets and insurance-linked contracts.
            </p>
          </div>
          <div className="mkt-header-stats">
            <div className="mkt-stat">
              <span className="mkt-stat-value">{totalMarkets + totalInsurance}</span>
              <span className="mkt-stat-label">Total markets</span>
            </div>
            <div className="mkt-stat">
              <span className="mkt-stat-value">{totalPredCats + (insuranceCats.length > 0 ? 1 : 0)}</span>
              <span className="mkt-stat-label">Categories</span>
            </div>
            <div className="mkt-stat">
              <span className="mkt-stat-value">{totalSubcats + insuranceCats.length}</span>
              <span className="mkt-stat-label">Subcategories</span>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="mkt-search-wrap">
          <svg className="mkt-search-icon" viewBox="0 0 16 16" fill="currentColor" width="14" height="14">
            <path d="M11.5 7a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Zm-.82 4.74a6 6 0 1 1 1.06-1.06l3.04 3.04a.75.75 0 1 1-1.06 1.06l-3.04-3.04Z"/>
          </svg>
          <input
            type="search"
            placeholder="Search markets, categories, subcategories…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="mkt-search"
          />
          {searchQuery && (
            <button className="mkt-search-clear" onClick={() => setSearchQuery("")}>✕</button>
          )}
        </div>
      </motion.div>

      {/* ── Prediction Categories ─────────────────────────── */}
      {predictionCategories.map(([catName, { icon, subcategories }], idx) => {
        const key = `pred:${catName}`;
        const isExpanded = expandedCats.has(key);
        const marketCount = [...subcategories.values()].reduce((s, arr) => s + arr.length, 0);
        const subCount = subcategories.size;

        return (
          <motion.div
            key={key}
            className="mkt-category"
            custom={idx}
            initial="hidden"
            animate="visible"
            variants={fadeUp}
          >
            <button className="mkt-cat-header" onClick={() => toggleCategory(key)}>
              <span className="mkt-cat-icon">{icon}</span>
              <span className="mkt-cat-title">{catName}</span>
              <span className="mkt-cat-badge">{subCount} subcategor{subCount === 1 ? "y" : "ies"}</span>
              <span className="mkt-cat-badge mkt-cat-badge--count">{marketCount} market{marketCount !== 1 ? "s" : ""}</span>
              <span className={`mkt-cat-chevron ${isExpanded ? "mkt-cat-chevron--open" : ""}`}>▸</span>
            </button>

            <AnimatePresence initial={false}>
              {isExpanded && (
                <motion.div
                  className="mkt-subcats"
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  variants={revealChildren}
                >
                  {[...subcategories.entries()]
                    .sort(([, a], [, b]) => b.length - a.length)
                    .map(([subName, subMarkets]) => (
                      <div key={subName} className="mkt-subcat">
                        <div className="mkt-subcat-header">
                          <span className="mkt-subcat-dot" />
                          <span className="mkt-subcat-title">{subName}</span>
                          <span className="mkt-subcat-count">{subMarkets.length} market{subMarkets.length !== 1 ? "s" : ""}</span>
                        </div>
                        <div className="mkt-subcat-markets">
                          {subMarkets.map((m: any) => (
                            <Link key={m.id} to={`/app/markets/${m.id}`} className="mkt-market-row">
                              <span className="mkt-market-name">{m.name}</span>
                              <span className="mkt-market-type">{m.type || "BINARY"}</span>
                              <span className="mkt-market-status">{m.status}</span>
                              <span className="mkt-market-arrow">→</span>
                            </Link>
                          ))}
                        </div>
                      </div>
                    ))}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        );
      })}

      {/* ── Insurance Category ────────────────────────────── */}
      {insuranceCats.length > 0 && (
        <motion.div
          className="mkt-category mkt-category--insurance"
          custom={predictionCategories.length}
          initial="hidden"
          animate="visible"
          variants={fadeUp}
        >
          <button className="mkt-cat-header" onClick={() => toggleCategory("insurance")}>
            <span className="mkt-cat-icon">🔒</span>
            <span className="mkt-cat-title">Insurance-Linked Markets</span>
            <span className="mkt-cat-badge">{insuranceCats.length} subcategor{insuranceCats.length === 1 ? "y" : "ies"}</span>
            <span className="mkt-cat-badge mkt-cat-badge--count">{totalInsurance} contract{totalInsurance !== 1 ? "s" : ""}</span>
            <span className={`mkt-cat-chevron ${expandedCats.has("insurance") ? "mkt-cat-chevron--open" : ""}`}>▸</span>
          </button>

          <AnimatePresence initial={false}>
            {expandedCats.has("insurance") && (
              <motion.div
                className="mkt-subcats"
                initial="hidden"
                animate="visible"
                exit="exit"
                variants={revealChildren}
              >
                {insuranceCats.map((cat: any) => {
                  const isFeatured = cat.slug === "life";
                  return (
                  <Link
                    key={cat.slug}
                    to={`/app/insurance/${cat.slug}`}
                    className={`mkt-ins-card${isFeatured ? " mkt-ins-card--featured" : ""}`}
                  >
                    <div className="mkt-ins-card-left">
                      <span className="mkt-ins-icon">{cat.icon}</span>
                      <div>
                        <div className="mkt-ins-title">
                          {cat.title}
                          {isFeatured && <span className="mkt-ins-featured-nudge">Popular</span>}
                        </div>
                        <div className="mkt-ins-desc">{cat.description}</div>
                      </div>
                    </div>
                    <div className="mkt-ins-card-right">
                      <div className="mkt-ins-tags">
                        {(cat.tags || []).slice(0, 3).map((t: string) => (
                          <span key={t} className="mkt-ins-tag">{t}</span>
                        ))}
                      </div>
                      <span className="mkt-ins-count">{cat.contractCount} contracts</span>
                      <span className="mkt-ins-arrow">Explore →</span>
                    </div>
                  </Link>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}

      {/* ── Empty state ───────────────────────────────────── */}
      {predictionCategories.length === 0 && insuranceCats.length === 0 && (
        <motion.div
          className="mkt-empty"
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="mkt-empty-icon">📭</div>
          <div className="mkt-empty-title">{searchQuery ? "No markets found" : "No markets available"}</div>
          <div className="mkt-empty-desc">
            {searchQuery ? "Try a different search term" : "Check back later for new markets"}
          </div>
        </motion.div>
      )}
    </div>
  );
}
