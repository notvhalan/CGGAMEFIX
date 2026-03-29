import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
import { useState } from "react";
import type { MetaFunction } from "@remix-run/node";
import { getLadderGroups } from "~/lib/api.server";

export const meta: MetaFunction = () => [
  { title: "Ladder Markets — GameFix" },
];

export async function loader({ request }: LoaderFunctionArgs) {
  const { groups } = await getLadderGroups();
  return json({ groups });
}

/* ── Category → icon + accent colour ───────────────────── */
const CAT_META: Record<string, { icon: string; accent: string; label: string }> = {
  life:        { icon: "💀", accent: "#a78bfa", label: "Life" },
  health:      { icon: "🏥", accent: "#f472b6", label: "Health" },
  climate:     { icon: "🌡️", accent: "#fb923c", label: "Climate" },
  agriculture: { icon: "🌾", accent: "#facc15", label: "Agriculture" },
  liability:   { icon: "⚖️", accent: "#38bdf8", label: "Liability" },
  travel:      { icon: "✈️", accent: "#34d399", label: "Travel" },
};

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export default function LadderIndex() {
  const { groups } = useLoaderData<typeof loader>();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const toggle = (id: string) =>
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  if (!groups.length) {
    return (
      <div style={{ padding: "20px 24px 48px", maxWidth: 1200, margin: "0 auto" }}>
        <Breadcrumb />
        <div style={{ textAlign: "center", padding: "80px 20px", color: "#8b9ab5" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📊</div>
          <h2 style={{ fontSize: 18, color: "#e2e8f0", margin: "0 0 8px" }}>No Ladder Markets Yet</h2>
          <p style={{ fontSize: 13, maxWidth: 400, margin: "0 auto", lineHeight: 1.6 }}>
            Ladder markets group multiple maturity contracts for the same event, enabling interval trading.
          </p>
        </div>
      </div>
    );
  }

  const totalContracts = groups.reduce((s, g) => s + g.contractCount, 0);
  const totalSubs = groups.reduce((s, g) => s + (g.subcategories?.length ?? 0), 0);

  return (
    <div style={{ padding: "20px 24px 48px", maxWidth: 1200, margin: "0 auto" }}>
      <Breadcrumb />

      {/* hero */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "#e2e8f0", margin: 0 }}>
            Ladder Markets
          </h1>
          <p style={{ fontSize: 13, color: "#8b9ab5", marginTop: 6, lineHeight: 1.5 }}>
            {groups.length} categories · {totalSubs} subcategories · {totalContracts} contracts
          </p>
        </div>
        <span style={{
          background: "rgba(74,222,128,0.12)", color: "#4ade80",
          fontSize: 12, fontWeight: 600, padding: "4px 10px",
          borderRadius: 20, whiteSpace: "nowrap",
        }}>
          {groups.length} live
        </span>
      </div>

      {/* category sections */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {groups.map((g) => {
          const meta = CAT_META[g.category] ?? { icon: "📈", accent: "#94a3b8", label: g.category };
          const isOpen = expanded[g.id] !== false; // default open
          const subs = g.subcategories ?? [];

          return (
            <div key={g.id} style={{
              background: "#0f172a",
              border: "1px solid #1e293b",
              borderRadius: 10,
              overflow: "hidden",
            }}>
              {/* Category header — collapsible */}
              <button
                onClick={() => toggle(g.id)}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 12,
                  padding: "14px 18px",
                  background: "none", border: "none", cursor: "pointer",
                  borderBottom: isOpen ? "1px solid #1e293b" : "none",
                }}
              >
                <div style={{
                  width: 38, height: 38, borderRadius: 10,
                  display: "grid", placeItems: "center", fontSize: 18,
                  background: `${meta.accent}18`, border: `1px solid ${meta.accent}30`,
                  flexShrink: 0,
                }}>
                  {meta.icon}
                </div>
                <div style={{ flex: 1, textAlign: "left" }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "#e2e8f0" }}>{g.title}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: meta.accent, marginTop: 2 }}>
                    {meta.label} · {g.contractCount} contracts · {subs.length} subcategor{subs.length === 1 ? "y" : "ies"}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Link
                    to={`/app/insurance/${g.category || "life"}`}
                    onClick={e => e.stopPropagation()}
                    style={{
                      padding: "5px 12px", borderRadius: 6, fontSize: 11, fontWeight: 600,
                      background: "rgba(16,185,129,0.15)", color: "#10b981",
                      border: "1px solid rgba(16,185,129,0.3)",
                      textDecoration: "none",
                    }}
                  >
                    View All
                  </Link>
                  <span style={{
                    fontSize: 14, color: "#64748b",
                    transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                    transition: "transform 0.2s", lineHeight: 1,
                  }}>
                    ▾
                  </span>
                </div>
              </button>

              {/* Subcategory rows */}
              {isOpen && subs.length > 0 && (
                <div>
                  {/* header row */}
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 90px 140px 110px",
                    padding: "6px 18px 6px 56px",
                    background: "rgba(0,0,0,0.25)",
                    borderBottom: "1px solid rgba(255,255,255,0.04)",
                  }}>
                    {["Subcategory", "Contracts", "Date Range", ""].map(h => (
                      <span key={h} style={{
                        fontSize: 10, fontWeight: 600, textTransform: "uppercase",
                        letterSpacing: "0.06em", color: "#64748b",
                      }}>{h}</span>
                    ))}
                  </div>

                  {subs.map((sub, i) => (
                    <Link
                      key={sub.conditionName}
                      to={`/app/insurance/${g.category || "life"}/${slugify(sub.conditionName)}`}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 90px 140px 110px",
                        padding: "10px 18px 10px 56px",
                        alignItems: "center",
                        borderBottom: i < subs.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                        transition: "background 0.1s",
                        textDecoration: "none",
                        color: "inherit",
                        cursor: "pointer",
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.03)")}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                    >
                      {/* name */}
                      <span style={{ fontSize: 13, fontWeight: 500, color: "#e2e8f0" }}>
                        {sub.conditionName}
                      </span>

                      {/* count */}
                      <span style={{
                        fontSize: 13, color: "#e2e8f0",
                        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                        fontWeight: 600,
                      }}>
                        {sub.contractCount}
                      </span>

                      {/* date range */}
                      <span style={{ fontSize: 11, color: "#64748b" }}>
                        {sub.firstMaturity && sub.lastMaturity
                          ? `${fmtShort(sub.firstMaturity)} – ${fmtShort(sub.lastMaturity)}`
                          : "—"}
                      </span>

                      {/* arrow */}
                      <span style={{
                        fontSize: 13, color: "#4ea8de",
                        textAlign: "right", fontWeight: 600,
                      }}>
                        →
                      </span>
                    </Link>
                  ))}
                </div>
              )}

              {/* No subcategories fallback */}
              {isOpen && subs.length === 0 && (
                <div style={{ padding: "12px 18px 12px 56px", fontSize: 13, color: "#64748b" }}>
                  No subcategories — <Link to={`/app/insurance/${g.category || "life"}`} style={{ color: "#4ea8de", textDecoration: "none" }}>view contracts</Link>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Breadcrumb() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#8b9ab5", marginBottom: 14 }}>
      <Link to="/app/markets" style={{ color: "#4ea8de", textDecoration: "none" }}>Markets</Link>
      <span style={{ opacity: 0.4 }}>›</span>
      <span>Ladder Markets</span>
    </div>
  );
}

function fmtShort(iso: string) {
  const d = new Date(iso);
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[d.getUTCMonth()]} '${String(d.getUTCFullYear()).slice(2)}`;
}
