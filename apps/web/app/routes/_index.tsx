import { Link } from "@remix-run/react";
import type { MetaFunction } from "@remix-run/node";
import { useEffect, useState } from "react";
import RealTimeGlassChart from "~/components/RealTimeGlassChart";
import "~/styles/pages/landing.css";

export const meta: MetaFunction = () => {
  return [
    { title: "GAMEFIX - Democratizing Gambling" },
    { name: "description", content: "GameFix democratizes gambling. Zero transaction fees." },
  ];
};

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
          <Link to="/how-it-works" className="nav-link">Learn</Link>
          <Link to="/legal" className="nav-link">Community</Link>
          <Link to="/auth/login" className="nav-login-btn">Login</Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="hero-section">
        {/* Background image (animated zoom-in) */}
        <div
          className="hero-bg"
          style={{
            backgroundImage: "url(/media/img/fan1.png)",
          }}
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
          <h1 className="hero-title">
            GameFix puts <span className="grad">power</span> back in your hands.
          </h1>

          {/* Showcase (your chart) */}
          <div className="hero-showcase">
            {/* Secondary glow behind chart */}
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

          <div className="hero-cta">
            <Link to="/how-it-works" className="btn btn-primary">
              Learn how it works →
            </Link>
            <Link to="/about" className="btn btn-secondary">
              Why GameFix
            </Link>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="stats-section">
        <div className="section-eyebrow">The imbalance</div>
        <h2 className="section-title">Bookmakers win by design.</h2>
        <p className="section-lead">
          Traditional sportsbooks bake in margin on every bet. GameFix removes the fee layer so prices can be set by the market.
        </p>

        <div className="stats-grid">
          <div className="glass-card">
            <div className="stat-label">Industry profit</div>
            <h3 className="stat-value">$20–40B</h3>
            <p className="stat-description">Recorded in profit by big gambling every year.</p>
          </div>

          <div className="glass-card">
            <div className="stat-label">Events</div>
            <h3 className="stat-value">12,000+</h3>
            <p className="stat-description">Individual events — there's something for everyone.</p>
          </div>

          <div className="glass-card">
            <div className="stat-label">Sports</div>
            <h3 className="stat-value">20</h3>
            <p className="stat-description">Sports and e-sports available on GameFix.</p>
          </div>

          <div className="glass-card">
            <div className="stat-label">Your fee</div>
            <h3 className="stat-value success">0%</h3>
            <p className="stat-description">No transaction fee on GameFix.</p>
          </div>
        </div>
      </section>

      {/* Backside */}
      <section className="content-section">
        <div className="content-container">
          <div>
            <div className="section-eyebrow">The idea</div>
            <h2 className="section-title">GAMEFIX BACKSIDE</h2>
            <p className="section-text">
              GameFix democratizes gambling. It puts power to the consumer.
              For every £100 you bet with a traditional bookmaker, on average £7–10 goes to the bookmaker.
              With GameFix that number becomes £0.
            </p>
          </div>

          <div className="callout">
            <h4>Exchange-first mechanics</h4>
            <p>
              Users set prices. Liquidity matches across sides. Positions can be managed live — not locked into a fixed book.
            </p>
          </div>
        </div>
      </section>

      {/* How it Works / Media */}
      <section className="features-section">
        <div className="features-grid">
          <div className="feature-content">
            <h3>How it works</h3>
            <Link to="/how-it-works" className="feature-link">
              Technical Documentation →
            </Link>

            <div className="video-container">
              <video controls style={{ width: "100%", height: "100%", display: "block" }}>
                <source src="/media/video/homemediacard1.mp4" type="video/mp4" />
                Your browser does not support the video tag.
              </video>
            </div>
          </div>

          <div className="feature-content">
            <h3>Press and Media</h3>
            <p className="feature-text">
              Choose your own odds, buy and sell your bets, cash out as much as you want.
              These are just a handful of the benefits you receive by switching.
            </p>
            <Link to="/legal" className="feature-link">
              For press and media, click here →
            </Link>

            <div style={{ marginTop: "1.4rem", display: "flex", gap: "0.85rem", flexWrap: "wrap" }}>
              <Link to="/auth/login" className="btn btn-primary">Start now →</Link>
              <Link to="/about" className="btn btn-secondary">Read the story</Link>
            </div>
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
      </footer>
    </div>
  );
}
