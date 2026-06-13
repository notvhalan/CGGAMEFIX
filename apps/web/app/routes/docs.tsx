import { Link } from "@remix-run/react";
import { useState, useEffect } from "react";
import "~/styles/pages/docs.css";
import "~/styles/pages/landing.css";

export default function Docs() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="docs-page">
      {/* ── Navigation ───────────────────────────────────────── */}
      <nav className={`landing-nav ${scrolled ? "scrolled" : ""}`}>
        <Link to="/" className="landing-logo">GAMEFIX</Link>
        <div className="landing-nav-links">
          <Link to="/" className="nav-link">Home</Link>
          <Link to="/about" className="nav-link">About</Link>
          <Link to="/story" className="nav-link">Story</Link>
          <Link to="/docs" className="nav-link active">Docs</Link>
          <Link to="/app/markets" className="nav-login-btn">Explore Markets</Link>
        </div>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────── */}
      <div className="docs-hero">
        <div className="docs-badge">
          <span className="docs-badge-primary">DOCUMENTATION</span>
          <span className="docs-badge-secondary">v2.0</span>
        </div>

        <h1 className="docs-title">
          Platform documentation
        </h1>
        <p className="docs-subtitle">
          Everything you need to understand how GameFix works — from market mechanics
          and order types to settlement rules and insurance-linked contracts.
        </p>

        <div className="docs-quick-links">
          <Link to="/app/markets" className="docs-quick-link docs-quick-link--primary">
            Open Markets <span style={{ opacity: 0.8 }}>→</span>
          </Link>
          <Link to="/about" className="docs-quick-link docs-quick-link--secondary">
            About GameFix
          </Link>
          <Link to="/story" className="docs-quick-link docs-quick-link--accent">
            Our Story
          </Link>
        </div>
      </div>

      {/* ── Content ──────────────────────────────────────────── */}
      <div className="docs-content">

        {/* ── Getting Started ─────────────────────────────────── */}
        <div className="docs-section">
          <div className="docs-section-label">Getting Started</div>
          <div className="docs-grid">
            <Link to="/about" className="docs-card docs-card--featured">
              <div className="docs-card-header">
                <span className="docs-card-icon">📖</span>
                <span className="docs-card-title">
                  About GameFix
                  <span className="docs-card-badge">Start here</span>
                </span>
              </div>
              <p className="docs-card-desc">
                What GameFix is, how it differs from traditional bookmakers, and why we built an exchange instead of a sportsbook.
              </p>
              <span className="docs-card-arrow">Read more →</span>
            </Link>

            <Link to="/story" className="docs-card">
              <div className="docs-card-header">
                <span className="docs-card-icon">🗺️</span>
                <span className="docs-card-title">Our Story</span>
              </div>
              <p className="docs-card-desc">
                The journey from a whiteboard idea in 2021 to a live exchange — the decisions, pivots, and principles behind the platform.
              </p>
              <span className="docs-card-arrow">Read more →</span>
            </Link>

            <Link to="/app/markets" className="docs-card">
              <div className="docs-card-header">
                <span className="docs-card-icon">📊</span>
                <span className="docs-card-title">Browse Markets</span>
              </div>
              <p className="docs-card-desc">
                Browse all live prediction and insurance-linked markets. Filter by category, view subcategories, and start trading.
              </p>
              <span className="docs-card-arrow">Open markets →</span>
            </Link>
          </div>
        </div>

        {/* ── How Markets Work ────────────────────────────────── */}
        <div className="docs-section">
          <div className="docs-section-label">How Markets Work</div>
          <div className="docs-grid">
            <div className="docs-card">
              <div className="docs-card-header">
                <span className="docs-card-icon">⚡</span>
                <span className="docs-card-title">Order Matching</span>
              </div>
              <p className="docs-card-desc">
                Users set prices (For/Lay) on outcomes. When a buyer's price meets a seller's, the order matches on the central limit order book — no bookmaker in between.
              </p>
            </div>

            <div className="docs-card">
              <div className="docs-card-header">
                <span className="docs-card-icon">📈</span>
                <span className="docs-card-title">Price Discovery</span>
              </div>
              <p className="docs-card-desc">
                Prices move based on supply and demand. Probabilities are expressed as percentages (0–100¢ per share), making it intuitive to gauge implied likelihood.
              </p>
            </div>

            <div className="docs-card">
              <div className="docs-card-header">
                <span className="docs-card-icon">🔄</span>
                <span className="docs-card-title">Positions & P/L</span>
              </div>
              <p className="docs-card-desc">
                Exposure is tracked across multiple orders. You can close or adjust positions before settlement, viewing unrealised profit or loss in real time.
              </p>
            </div>
          </div>
        </div>

        {/* ── Market Types ────────────────────────────────────── */}
        <div className="docs-section">
          <div className="docs-section-label">Market Types</div>
          <div className="docs-grid">
            <Link to="/app/markets" className="docs-card">
              <div className="docs-card-header">
                <span className="docs-card-icon">🎯</span>
                <span className="docs-card-title">Prediction Markets</span>
              </div>
              <p className="docs-card-desc">
                Binary and multi-outcome markets on real-world events — politics, sports, technology, entertainment, and more.
                  Each outcome trades independently with its own order book.
              </p>
              <span className="docs-card-arrow">View prediction markets →</span>
            </Link>

            <Link to="/app/markets" className="docs-card">
              <div className="docs-card-header">
                <span className="docs-card-icon">🔒</span>
                <span className="docs-card-title">Insurance-Linked Markets</span>
              </div>
              <p className="docs-card-desc">
                Contracts tied to insurable events — life, health, climate, agriculture, liability, and travel.
                  Based on survival curves and maturity ladders with exchange-grade pricing.
              </p>
              <span className="docs-card-arrow">View insurance markets →</span>
            </Link>

            <Link to="/app/ladder" className="docs-card">
              <div className="docs-card-header">
                <span className="docs-card-icon">🪜</span>
                <span className="docs-card-title">Ladder Markets</span>
              </div>
              <p className="docs-card-desc">
                Grouped maturity contracts across time horizons. Trade the term structure of event risk with a visual maturity ladder interface.
              </p>
              <span className="docs-card-arrow">View ladder markets →</span>
            </Link>
          </div>
        </div>

        {/* ── Settlement & Fees ───────────────────────────────── */}
        <div className="docs-section">
          <div className="docs-section-label">Settlement & Fees</div>
          <div className="docs-topic-list">
            <div className="docs-topic-item">
              <span className="docs-topic-icon">💰</span>
              <span className="docs-topic-title">Settlement Rules</span>
              <span className="docs-topic-desc">How outcomes resolve and payouts are calculated</span>
            </div>
            <div className="docs-topic-item">
              <span className="docs-topic-icon">📐</span>
              <span className="docs-topic-title">Fee Structure</span>
              <span className="docs-topic-desc">Transparent transaction fee — no hidden margin</span>
            </div>
            <div className="docs-topic-item">
              <span className="docs-topic-icon">🏦</span>
              <span className="docs-topic-title">Wallet & Deposits</span>
              <span className="docs-topic-desc">Fund your account and manage your balance</span>
            </div>
          </div>
        </div>

        {/* ── Trading Concepts ────────────────────────────────── */}
        <div className="docs-section">
          <div className="docs-section-label">Trading Concepts</div>
          <div className="docs-topic-list">
            <div className="docs-topic-item">
              <span className="docs-topic-icon">📋</span>
              <span className="docs-topic-title">Order Types</span>
              <span className="docs-topic-desc">Limit, market, and GTC orders</span>
            </div>
            <div className="docs-topic-item">
              <span className="docs-topic-icon">📊</span>
              <span className="docs-topic-title">The Order Book</span>
              <span className="docs-topic-desc">Depth, spread, and how price levels work</span>
            </div>
            <div className="docs-topic-item">
              <span className="docs-topic-icon">🔀</span>
              <span className="docs-topic-title">For vs Lay</span>
              <span className="docs-topic-desc">Backing an outcome versus opposing it</span>
            </div>
            <div className="docs-topic-item">
              <span className="docs-topic-icon">📉</span>
              <span className="docs-topic-title">Risk Management</span>
              <span className="docs-topic-desc">Closing positions, hedging, and cash-out</span>
            </div>
          </div>
        </div>

        {/* ── Platform Architecture ───────────────────────────── */}
        <div className="docs-section">
          <div className="docs-section-label">Platform Architecture</div>
          <div className="docs-topic-list">
            <div className="docs-topic-item">
              <span className="docs-topic-icon">⚙️</span>
              <span className="docs-topic-title">Matching Engine</span>
              <span className="docs-topic-desc">Rust-based CLOB with sub-ms latency</span>
            </div>
            <div className="docs-topic-item">
              <span className="docs-topic-icon">🌐</span>
              <span className="docs-topic-title">WebSocket Feeds</span>
              <span className="docs-topic-desc">Real-time price, depth, and trade updates</span>
            </div>
            <div className="docs-topic-item">
              <span className="docs-topic-icon">🏗️</span>
              <span className="docs-topic-title">Microservices</span>
              <span className="docs-topic-desc">API Gateway, Market Data, Settlement, Wallet</span>
            </div>
            <div className="docs-topic-item">
              <span className="docs-topic-icon">📐</span>
              <span className="docs-topic-title">Index Construction</span>
              <span className="docs-topic-desc">How synthetic cohort indices are built and maintained</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Footer ───────────────────────────────────────────── */}
      <div className="docs-footer">
        <Link to="/" className="docs-footer-back">← Back to Home</Link>
        <a
          href="https://carvum.shop"
          target="_blank"
          rel="noopener noreferrer"
          className="docs-footer-carvum"
        >
          Made by <strong style={{ fontWeight: 700, marginLeft: '0.2rem' }}>Carvum</strong>
        </a>
      </div>
    </div>
  );
}
