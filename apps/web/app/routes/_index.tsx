import { Link } from "@remix-run/react";
import type { MetaFunction, LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { useEffect, useState } from "react";
import { BlockMath, InlineMath } from "~/components/Math";
import RealTimeGlassChart from "~/components/RealTimeGlassChart";
import { getAuthenticatedUser } from "~/lib/auth.server";
import "~/styles/pages/landing.css";
import "~/styles/pages/survival-model.css";
import "katex/dist/katex.min.css";

export const meta: MetaFunction = () => {
  return [
    { title: "GAMEFIX - Democratizing Gambling" },
    { name: "description", content: "GameFix democratizes gambling. Zero transaction fees." },
  ];
};

export async function loader({ request }: LoaderFunctionArgs) {
  // If user is already logged in, redirect to app
  const user = await getAuthenticatedUser(request);
  if (user) {
    return redirect("/app");
  }
  return null;
}

export default function Index() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="landing-container">
      {/* Navigation (transparent on load, glass on scroll) */}
      <nav className={`landing-nav ${scrolled ? "scrolled" : ""}`}>
        <Link to="/" className="landing-logo">
          GAMEFIX
        </Link>

        <div className="landing-nav-links">
          <Link to="/" className="nav-link active">Home</Link>
          <Link to="/about" className="nav-link">About</Link>
          <Link to="/story" className="nav-link">Story</Link>
          <Link to="/app" className="nav-login-btn">Browse</Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="hero-section">
        {/* Background video on loop */}
        <video
          className="hero-bg"
          src="/media/video/herom3.mp4"
          autoPlay
          loop
          muted
          playsInline
        />

        {/* Overlay */}
        <div className="hero-overlay" />

        {/* Ambient glow (keep your existing class) */}
        <div
          className="ambient-glow"
          style={{
            top: "22%",
            left: "52%",
            background: "radial-gradient(circle, rgba(88, 166, 255, 0.22) 0%, transparent 60%)",
          }}
        />

        <div className="hero-content">
          {/* Left: headline + CTA */}
          <div className="hero-left">
            <h1 className="hero-title">
              A new <span className="grad">financial</span> instrument.
            </h1>
            <p className="hero-subtitle">
              Trade the probability of any real-world event as a liquid, continuously-priced asset.
            </p>
            <div className="hero-cta">
              <Link to="/about" className="btn btn-primary">
                Learn how it works →
              </Link>
              <Link to="/story" className="btn btn-secondary">
                Why GameFix
              </Link>
            </div>
          </div>

          {/* Right: live chart */}
          <div className="hero-right">
            <div className="hero-showcase">
              <div
                className="ambient-glow"
                style={{
                  width: "520px",
                  height: "520px",
                  top: "50%",
                  left: "50%",
                  background:
                    "radial-gradient(circle, rgba(0, 242, 234, 0.16) 0%, transparent 70%)",
                }}
              />
              <RealTimeGlassChart />
            </div>
          </div>
        </div>

        {/* Scroll indicator */}
        <a href="#insurance-markets" className="hero-scroll-indicator" aria-label="Scroll down">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </a>
      </section>

      {/* Insurance Markets */}
      <section id="insurance-markets" className="smm-section">
        <div className="smm-container">

          {/* Full-width header */}
          <div className="smm-header">
            <div className="smm-badge">MATHEMATICAL FRAMEWORK</div>
            <h2 className="smm-title">Insurance markets</h2>
            <p className="smm-intro">
              We consider a binary event market in which a contract references whether a
              specified event has occurred by a future time. Life insurance provides the
              clearest motivating example, but the same formal structure extends naturally
              to broader insurance-linked and event-linked risks.
            </p>
          </div>

          {/* Row 1 — Contract definition */}
          <div className="smm-row">
            <div className="smm-row-text">
              <h3>Contract definition</h3>
              <p>
                Let <InlineMath math="\tau" /> denote the random time at which a defined
                event occurs. In the life insurance setting, <InlineMath math="\tau" /> is
                interpreted as the time of death. For any maturity <InlineMath math="T" />,
                define the binary payoffs
              </p>
              <div className="smm-math-block">
                <BlockMath math="Y(T) = \mathbf{1}_{\{\tau > T\}}" />
                <BlockMath math="N(T) = \mathbf{1}_{\{\tau \leq T\}}" />
              </div>
              <p>so that</p>
              <div className="smm-math-block">
                <BlockMath math="Y(T) + N(T) = 1." />
              </div>
              <p>
                Accordingly, the contract admits a binary decomposition. The{" "}
                <strong>YES</strong> side pays one unit if the event has not occurred by
                time <InlineMath math="T" />, while the complementary{" "}
                <strong>NO</strong> side pays one unit if the event occurs on or before
                time <InlineMath math="T" />.
              </p>
            </div>
            <div className="smm-row-media">
              <img src="/media/img/PastedGraphic-2s.png" alt="Contract payoff diagram" />
            </div>
          </div>

          {/* Life insurance worked example — full width */}
          <div className="smm-example-row">
            <h3>Example: Life insurance</h3>
            <p>
              In the case of life insurance, the relevant event is death. Let{" "}
              <InlineMath math="\tau" /> denote the time of death of an insured individual.
              A contract maturing at time <InlineMath math="T" /> can therefore be
              interpreted as a survival-linked binary instrument:{" "}
              <InlineMath math="Y(T) = \mathbf{1}_{\{\tau > T\}}" /> pays one unit if the
              individual is alive at time <InlineMath math="T" />, and{" "}
              <InlineMath math="N(T) = \mathbf{1}_{\{\tau \leq T\}}" /> pays one unit if
              the individual has died on or before time <InlineMath math="T" />.
            </p>
            <p>Illustratively, if the market implies the following prices:</p>
            <div className="smm-survival-table">
              <div className="smm-survival-header">
                <span>Contract</span>
                <span className="smm-yes-col">YES</span>
                <span className="smm-no-col">NO</span>
              </div>
              {[
                { label: "Alive at February 2026", yes: "0.95", no: "0.05" },
                { label: "Alive at December 2026", yes: "0.90", no: "0.10" },
                { label: "Alive at February 2066", yes: "0.25", no: "0.75" },
              ].map((row) => (
                <div key={row.label} className="smm-survival-row">
                  <span className="smm-survival-label">{row.label}</span>
                  <span className="smm-yes-col">{row.yes}</span>
                  <span className="smm-no-col">{row.no}</span>
                </div>
              ))}
            </div>
            <p>
              These values can be interpreted as market-implied survival probabilities
              across maturities. The resulting sequence forms a{" "}
              <strong>survival term structure</strong>, with the YES side declining as
              maturity extends further into the future.
            </p>
          </div>

          {/* Row 2 — Market price as conditional probability */}
          <div className="smm-row smm-row-flip">
            <div className="smm-row-text">
              <h3>Market price as conditional probability</h3>
              <p>
                Let <InlineMath math="\mathcal{F}_t" /> denote the information set
                available at time <InlineMath math="t" />. The fair value of the
                survival-side contract is the conditional probability that the event has
                not occurred by maturity:
              </p>
              <div className="smm-math-block">
                <BlockMath math="P(t,T) = \mathbb{P}(\tau > T \mid \mathcal{F}_t)" />
              </div>
              <p>and the fair value of the event-side contract is</p>
              <div className="smm-math-block">
                <BlockMath math="Q(t,T) = \mathbb{P}(\tau \leq T \mid \mathcal{F}_t)." />
              </div>
              <p>These satisfy</p>
              <div className="smm-math-block">
                <BlockMath math="P(t,T) + Q(t,T) = 1." />
              </div>
              <p>
                Thus, the contract price may be interpreted directly as a conditional
                probability derived from the market's information at time{" "}
                <InlineMath math="t" />.
              </p>
            </div>
            <div className="smm-row-media">
              <img src="/media/img/PastedGraphic-3s.png" alt="Conditional probability diagram" />
            </div>
          </div>

          {/* Row 3 — Hazard-rate representation */}
          <div className="smm-row">
            <div className="smm-row-text">
              <h3>Hazard-rate representation</h3>
              <p>
                A convenient continuous-time representation is obtained through an event
                intensity, or hazard rate, <InlineMath math="\lambda(u)" />. In this
                formulation, the market-implied survival probability is given by
              </p>
              <div className="smm-math-block smm-math-block--green">
                <BlockMath math="P(t,T) = \exp\!\left(-\int_t^T \lambda(u)\,du\right)" />
              </div>
              <p>with complementary event probability</p>
              <div className="smm-math-block smm-math-block--green">
                <BlockMath math="Q(t,T) = 1 - P(t,T)." />
              </div>
              <p>
                Hence, under non-negative hazard, the YES side declines monotonically
                with maturity, yielding the term-structure properties
              </p>
              <div className="smm-math-block">
                <BlockMath math="T_1 \leq T_2 \implies P(t,T_1) \geq P(t,T_2)" />
                <BlockMath math="T \to \infty \implies P(t,T) \to 0." />
              </div>
              <p>
                In the life insurance case, this curve represents the market-implied
                probability that an individual remains alive up to each future horizon.
              </p>
            </div>
            <div className="smm-row-media">
              <img src="/media/img/PastedGraphic-4s.png" alt="Hazard rate diagram" />
            </div>
          </div>

          {/* Interpretation cards */}
          <div className="smm-interp-grid">
            <div className="smm-interp-card">
              <h4>Insurance interpretation</h4>
              <p>
                Insurance premiums are fundamentally linked to the probability and timing
                of uncertain events. The market formulation above provides a tradable
                representation of that same underlying event risk. In the life insurance
                case, the contract maps directly to survival and mortality contingencies.
              </p>
            </div>
            <div className="smm-interp-card">
              <h4>Hedging interpretation</h4>
              <p>
                Event-linked contracts may be interpreted as instruments for transferring,
                pricing, or offsetting exposure to a defined future contingency across a
                specified time horizon. This allows uncertain risks to be decomposed into
                tradable binary claims indexed by time.
              </p>
            </div>
            <div className="smm-interp-card">
              <h4>Generalisation</h4>
              <p>
                Although motivated by life insurance, the same structure extends to health
                outcomes, climate events, agricultural losses, liability triggers,
                operational failures, and other clearly specified contingencies.
              </p>
            </div>
          </div>

          {/* Abstract */}
          <div className="smm-abstract">
            <h4>Abstract</h4>
            <p>
              We define an event-probability market in which binary contracts reference
              whether a specified event has occurred by a future time. Under this
              framework, the contract price is interpretable as a conditional probability,
              and under a hazard-rate representation the resulting term structure admits a
              continuous-time decay form. Life insurance provides the most direct
              motivating example, with contract prices corresponding to market-implied
              survival probabilities across maturities. More generally, the same
              construction applies to a wide range of insurance-linked and event-linked
              contingencies.
            </p>
          </div>

        </div>
      </section>
      {/* Stats */}
      <section className="stats-section" style={{ background: "radial-gradient(1200px 700px at 20% 10%, rgba(35, 134, 54, 0.06), transparent 55%), radial-gradient(900px 600px at 80% 0%, rgba(33, 136, 255, 0.04), transparent 50%)" }}>
        <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "40px 20px" }}>
          <div style={{ textAlign: "center", marginBottom: "40px" }}>
            <div style={{ display: "inline-block", padding: "6px 14px", background: "rgba(35, 134, 54, 0.2)", color: "#3fb950", fontSize: "13px", borderRadius: "20px", marginBottom: "16px", letterSpacing: "0.5px", border: "1px solid rgba(35, 134, 54, 0.3)" }}>
              THE IMBALANCE
            </div>
            <h2 style={{ fontSize: "36px", margin: "0 0 16px", color: "#e6edf3", letterSpacing: "-0.5px" }}>
              Bookmakers win by design.
            </h2>
            <p style={{ fontSize: "17px", lineHeight: "1.65", color: "rgba(230, 237, 243, 0.75)", maxWidth: "700px", margin: "0 auto" }}>
              Traditional sportsbooks bake in margin on every bet. GameFix removes the fee layer so prices can be set by the market.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "20px" }}>
            <div style={{ background: "rgba(22, 27, 34, 0.6)", border: "1px solid rgba(240, 246, 252, 0.1)", borderRadius: "16px", padding: "28px 24px", backdropFilter: "blur(10px)" }}>
              <div style={{ fontSize: "12px", letterSpacing: "0.5px", color: "rgba(230, 237, 243, 0.6)", marginBottom: "8px", textTransform: "uppercase" }}>Industry profit</div>
              <h3 style={{ fontSize: "36px", margin: "0 0 8px", color: "#e6edf3", fontWeight: "700" }}>$20–40B</h3>
              <p style={{ margin: "0", fontSize: "14px", lineHeight: "1.5", color: "rgba(230, 237, 243, 0.7)" }}>Recorded in profit by big gambling every year.</p>
            </div>

            <div style={{ background: "rgba(22, 27, 34, 0.6)", border: "1px solid rgba(240, 246, 252, 0.1)", borderRadius: "16px", padding: "28px 24px", backdropFilter: "blur(10px)" }}>
              <div style={{ fontSize: "12px", letterSpacing: "0.5px", color: "rgba(230, 237, 243, 0.6)", marginBottom: "8px", textTransform: "uppercase" }}>Events</div>
              <h3 style={{ fontSize: "36px", margin: "0 0 8px", color: "#e6edf3", fontWeight: "700" }}>12,000+</h3>
              <p style={{ margin: "0", fontSize: "14px", lineHeight: "1.5", color: "rgba(230, 237, 243, 0.7)" }}>Individual events — there's something for everyone.</p>
            </div>

            <div style={{ background: "rgba(22, 27, 34, 0.6)", border: "1px solid rgba(240, 246, 252, 0.1)", borderRadius: "16px", padding: "28px 24px", backdropFilter: "blur(10px)" }}>
              <div style={{ fontSize: "12px", letterSpacing: "0.5px", color: "rgba(230, 237, 243, 0.6)", marginBottom: "8px", textTransform: "uppercase" }}>Sports</div>
              <h3 style={{ fontSize: "36px", margin: "0 0 8px", color: "#e6edf3", fontWeight: "700" }}>20</h3>
              <p style={{ margin: "0", fontSize: "14px", lineHeight: "1.5", color: "rgba(230, 237, 243, 0.7)" }}>Sports and e-sports available on GameFix.</p>
            </div>

            <div style={{ background: "rgba(22, 27, 34, 0.6)", border: "1px solid rgba(240, 246, 252, 0.1)", borderRadius: "16px", padding: "28px 24px", backdropFilter: "blur(10px)" }}>
              <div style={{ fontSize: "12px", letterSpacing: "0.5px", color: "#3fb950", marginBottom: "8px", textTransform: "uppercase" }}>Your fee</div>
              <h3 style={{ fontSize: "36px", margin: "0 0 8px", color: "#3fb950", fontWeight: "700" }}>0%</h3>
              <p style={{ margin: "0", fontSize: "14px", lineHeight: "1.5", color: "rgba(230, 237, 243, 0.7)" }}>No transaction fee on GameFix.</p>
            </div>
          </div>
        </div>
      </section>

      {/* The Idea */}
      <section style={{ padding: "50px 20px" }}>
        <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: "64px", alignItems: "center" }}>
            <div>
              <div style={{ display: "inline-block", padding: "6px 14px", background: "rgba(33, 136, 255, 0.2)", color: "#58a6ff", fontSize: "13px", borderRadius: "20px", marginBottom: "16px", letterSpacing: "0.5px", border: "1px solid rgba(33, 136, 255, 0.3)" }}>
                THE IDEA
              </div>
              <h2 style={{ fontSize: "32px", margin: "0 0 20px", color: "#e6edf3", letterSpacing: "-0.5px" }}>
                Exchange-first mechanics
              </h2>
              <p style={{ fontSize: "17px", lineHeight: "1.7", color: "rgba(230, 237, 243, 0.8)", margin: "0 0 24px" }}>
                GameFix democratizes gambling. It puts power to the consumer. For every £100 you bet with a traditional bookmaker, on average £7–10 goes to the bookmaker. With GameFix that number becomes £0.
              </p>
              <div style={{ background: "rgba(33, 136, 255, 0.1)", border: "1px solid rgba(33, 136, 255, 0.2)", borderRadius: "12px", padding: "20px", marginBottom: "32px" }}>
                <p style={{ fontSize: "15px", lineHeight: "1.6", color: "rgba(230, 237, 243, 0.85)", margin: "0" }}>
                  Users set prices. Liquidity matches across sides. Positions can be managed live — not locked into a fixed book.
                </p>
              </div>

              <h3 style={{ fontSize: "24px", margin: "0 0 16px", color: "#e6edf3" }}>How it works</h3>
              <Link to="/how-it-works" style={{ display: "inline-block", color: "#58a6ff", textDecoration: "none", fontSize: "15px" }}>
                Technical Documentation →
              </Link>
            </div>

            <div style={{ aspectRatio: "3/4", maxWidth: "100%" }}>
              <video 
                autoPlay 
                loop 
                muted 
                playsInline 
                style={{ width: "100%", height: "100%", display: "block", objectFit: "cover", borderRadius: "12px" }}
              >
                <source src="/media/video/homemediacard1.mp4" type="video/mp4" />
                Your browser does not support the video tag.
              </video>
            </div>
          </div>
        </div>
      </section>

      {/* Press and Media */}
      <section style={{ padding: "50px 20px", background: "rgba(22, 27, 34, 0.3)" }}>
        <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "64px", alignItems: "center", direction: "rtl" }}>
            <div style={{ direction: "ltr" }}>
              <h2 style={{ fontSize: "32px", margin: "0 0 20px", color: "#e6edf3", letterSpacing: "-0.5px" }}>
                Press and Media
              </h2>
              <p style={{ fontSize: "17px", lineHeight: "1.7", color: "rgba(230, 237, 243, 0.8)", margin: "0 0 24px" }}>
                Choose your own odds, buy and sell your bets, cash out as much as you want. These are just a handful of the benefits you receive by switching.
              </p>
              <Link to="/legal" style={{ display: "inline-block", color: "#58a6ff", textDecoration: "none", fontSize: "15px", marginBottom: "24px" }}>
                For press and media, click here →
              </Link>

              <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                <Link to="/app" style={{ padding: "12px 24px", background: "#238636", color: "white", textDecoration: "none", fontSize: "15px", fontWeight: "600", borderRadius: "10px", boxShadow: "0 4px 12px rgba(35, 134, 54, 0.3)" }}>
                  Browse →
                </Link>
                <Link to="/story" style={{ padding: "12px 24px", background: "rgba(240, 246, 252, 0.06)", color: "#e6edf3", textDecoration: "none", fontSize: "15px", fontWeight: "600", borderRadius: "10px", border: "1px solid rgba(240, 246, 252, 0.1)" }}>
                  Read the story
                </Link>
              </div>
            </div>
            <div style={{ direction: "ltr" }}></div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="footer-content">
          <div className="footer-logo">gamefix.com</div>
          <div className="footer-links">
            <Link to="/legal" className="footer-link">Privacy Policy</Link>
            <Link to="/legal" className="footer-link">Terms of Use</Link>
            <Link to="/legal" className="footer-link">Contact Us</Link>
          </div>
        </div>
        <div style={{ textAlign: 'center', paddingTop: '1rem', paddingBottom: '0.5rem' }}>
          <a
            href="https://carvum.shop"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              color: '#8b949e',
              fontSize: '0.8125rem',
              fontWeight: 500,
              textDecoration: 'none',
              padding: '0.375rem 0.875rem',
              borderRadius: '999px',
              border: '1px solid rgba(139, 148, 158, 0.2)',
              background: 'rgba(139, 148, 158, 0.05)',
              transition: 'color 0.2s, border-color 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#58a6ff';
              e.currentTarget.style.borderColor = 'rgba(88, 166, 255, 0.35)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = '#8b949e';
              e.currentTarget.style.borderColor = 'rgba(139, 148, 158, 0.2)';
            }}
          >
            Made by <strong style={{ fontWeight: 700, marginLeft: '0.2rem' }}>Carvum</strong>
          </a>
        </div>
      </footer>
    </div>
  );
}
