import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import type { MetaFunction } from "@remix-run/node";
import { getInsuranceCategories } from "~/lib/api.server";
import "~/styles/pages/insurance.css";

export const meta: MetaFunction = () => [
  { title: "Insurance Markets — GameFix" },
];

export async function loader(_: LoaderFunctionArgs) {
  const data = await getInsuranceCategories();
  return json({ categories: data.categories });
}

export default function InsuranceIndex() {
  const { categories } = useLoaderData<typeof loader>();
  const totalContracts = categories.reduce((s, c) => s + c.contractCount, 0);
  return (
    <div className="ins-page">
      <div className="ins-hero">
        <div className="ins-hero-badge">🔒 Insurance-Linked Markets</div>
        <h1>Event-Risk Market Explorer</h1>
        <p>
          Structured prediction markets for defined insurable events — survival, catastrophe,
          yield, and claims. Trade and hedge event risk across time using YES/NO contracts
          with fixed maturities.
        </p>
      </div>

      {/* Summary strip */}
      <div style={{
        display: 'flex',
        gap: '1.5rem',
        padding: '0.875rem 1rem',
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-primary)',
        borderRadius: '8px',
        marginBottom: '1.5rem',
        flexWrap: 'wrap',
      }}>
        {[
          { label: "Insurance types",  value: String(categories.length) },
          { label: "Active contracts", value: totalContracts > 0 ? String(totalContracts) : "—" },
          { label: "Last updated",     value: new Date().toLocaleTimeString() },
        ].map(s => (
          <div key={s.label} style={{ display: 'flex', flexDirection: 'column', gap: '0.125rem' }}>
            <span style={{ fontSize: '0.6875rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {s.label}
            </span>
            <span style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              {s.value}
            </span>
          </div>
        ))}
      </div>

      <div
        style={{
          fontSize: '0.6875rem',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--text-secondary)',
          marginBottom: '0.75rem',
        }}
      >
        Insurance Types
      </div>

      <div className="ins-grid">
        {categories.map(cat => (
          <Link key={cat.slug} to={`/app/insurance/${cat.slug}`} className="ins-card">
            <div className="ins-card-header">
              <div className="ins-card-icon">{cat.icon}</div>
              <h3 className="ins-card-title">{cat.title}</h3>
            </div>
            <p className="ins-card-desc">{cat.description}</p>
            <div className="ins-card-tags">
              {cat.tags.map((t: string) => (
                <span key={t} className="ins-tag">{t}</span>
              ))}
            </div>
            <div className="ins-card-footer">
              <span>{cat.contractCount > 0 ? `${cat.contractCount} contracts` : 'Coming soon'}</span>
              <span style={{ color: 'var(--accent-blue)', fontWeight: 600 }}>Explore →</span>
            </div>
          </Link>
        ))}
      </div>

      {/* Explainer */}
      <div style={{
        marginTop: '2rem',
        padding: '1.25rem',
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-primary)',
        borderRadius: '10px',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '1.25rem',
      }}>
        {[
          {
            icon: "📐",
            title: "Maturity Ladder",
            desc: "Each insurance type lists contracts across multiple dates — like an options expiry chain.",
          },
          {
            icon: "📈",
            title: "Survival Curve",
            desc: "YES prices fall over time as maturity extends. NO rises. The curve shows the full risk structure.",
          },
          {
            icon: "🔁",
            title: "Same Engine",
            desc: "Insurance and prediction markets share the same CLOB matching engine, settlement, and wallet.",
          },
          {
            icon: "🛡️",
            title: "Hedge Simulator",
            desc: "Use the hedge panel on each contract page to model insurance payouts against your book.",
          },
        ].map(b => (
          <div key={b.title}>
            <div style={{ fontSize: '1.25rem', marginBottom: '0.375rem' }}>{b.icon}</div>
            <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.875rem', marginBottom: '0.25rem' }}>
              {b.title}
            </div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              {b.desc}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
