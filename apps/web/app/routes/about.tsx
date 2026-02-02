import { Link } from "@remix-run/react";
import { useState, useEffect } from "react";
import "~/styles/pages/landing.css";

const Container: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 20px" }}>
    {children}
  </div>
);

const Card: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div
    style={{
      border: "1px solid rgba(240, 246, 252, 0.1)",
      borderRadius: 18,
      padding: 18,
      background: "rgba(22, 27, 34, 0.6)",
      backdropFilter: "blur(10px)",
      boxShadow: "0 10px 30px rgba(0,0,0,0.3)",
    }}
  >
    <div style={{ fontSize: 14, letterSpacing: 0.5, color: "rgba(230, 237, 243, 0.7)", marginBottom: 8 }}>
      {title.toUpperCase()}
    </div>
    <div style={{ fontSize: 15, lineHeight: 1.55, color: "rgba(230, 237, 243, 0.85)" }}>{children}</div>
  </div>
);

export default function About() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(1200px 700px at 20% 10%, rgba(35, 134, 54, 0.08), transparent 55%)," +
          "radial-gradient(900px 600px at 80% 0%, rgba(33, 136, 255, 0.06), transparent 50%)," +
          "linear-gradient(180deg, #0d1117 0%, #010409 100%)",
        color: "#e6edf3",
      }}
    >
      {/* Navigation (transparent on load, glass on scroll) */}
      <nav className={`landing-nav ${scrolled ? "scrolled" : ""}`}>
        <Link to="/" className="landing-logo">
          GAMEFIX
        </Link>

        <div className="landing-nav-links">
          <Link to="/" className="nav-link">Home</Link>
          <Link to="/about" className="nav-link active">About</Link>
          <Link to="/story" className="nav-link">Story</Link>
          <Link to="/auth/login" className="nav-login-btn">Login</Link>
        </div>
      </nav>

      <Container>
        {/* HERO */}
        <div style={{ padding: "80px 0 22px" }}>
          <div style={{ display: "inline-flex", gap: 10, alignItems: "center", padding: "6px 10px", borderRadius: 999, border: "1px solid rgba(240, 246, 252, 0.1)", background: "rgba(22, 27, 34, 0.6)" }}>
            <span style={{ fontSize: 12, color: "rgba(230, 237, 243, 0.8)" }}>ABOUT</span>
            <span style={{ fontSize: 12, color: "rgba(230, 237, 243, 0.6)" }}>GameFix</span>
          </div>

          <h1 style={{ margin: "14px 0 10px", fontSize: 44, lineHeight: 1.05, letterSpacing: -0.8 }}>
            A betting exchange built like a trading platform.
          </h1>

          <p style={{ margin: 0, maxWidth: 760, fontSize: 17, lineHeight: 1.65, color: "rgba(230, 237, 243, 0.8)" }}>
            GameFix lets users set odds with each other in a free market—no bookmaker margin baked into the price.
            The platform acts like a brokerage: matching orders, tracking positions, and charging a transparent transaction fee.
          </p>

          <div style={{ display: "flex", gap: 12, marginTop: 18, flexWrap: "wrap" }}>
            <Link
              to="/app/markets"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 10,
                padding: "12px 16px",
                borderRadius: 14,
                background: "#238636",
                color: "white",
                textDecoration: "none",
                fontSize: 14,
                boxShadow: "0 14px 30px rgba(35, 134, 54, 0.4)",
              }}
            >
              Open markets
              <span style={{ opacity: 0.8 }}>→</span>
            </Link>

            <a
              href="#how-it-works"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 10,
                padding: "12px 16px",
                borderRadius: 14,
                border: "1px solid rgba(240, 246, 252, 0.1)",
                background: "rgba(240, 246, 252, 0.06)",
                color: "#e6edf3",
                textDecoration: "none",
                fontSize: 14,
              }}
            >
              How it works
              <span style={{ opacity: 0.7 }}>↓</span>
            </a>
          </div>
        </div>

        {/* VALUE CARDS */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 14,
            marginTop: 32,
          }}
        >
          <Card title="User-set odds">
            Place orders at odds you choose. If someone agrees with your price, the market matches you.
          </Card>
          <Card title="Trade anytime">
            Markets move. You can reduce risk or lock profit before settlement—more like trading than "set and forget".
          </Card>
          <Card title="Fee, not margin">
            Traditional bookmakers embed a margin into odds. GameFix aims for fair pricing and charges a transparent transaction fee instead.
          </Card>
        </div>

        {/* HOW IT WORKS */}
        <div id="how-it-works" style={{ marginTop: 44 }}>
          <h2 style={{ fontSize: 28, margin: "0 0 10px", letterSpacing: -0.4 }}>How it works</h2>
          <p style={{ margin: "0 0 18px", maxWidth: 820, opacity: 0.82, lineHeight: 1.7 }}>
            Think of each outcome like a market. People place bids and asks (For/Lay). When prices overlap, orders match.
            You can hold the position until settlement—or trade it earlier.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
            <Card title="1. Markets are outcomes">
              Win/Draw/Lose, Yes/No—each outcome has a live price shaped by supply and demand.
            </Card>
            <Card title="2. Place an order">
              Choose For/Lay, choose your odds, choose your stake. You're setting a price, not accepting a house price.
            </Card>
            <Card title="3. Match & settle">
              If another user accepts your price, the order matches. At the end, winnings are paid by the losing side—like an exchange.
            </Card>
            <Card title="4. Trade / cash out">
              You can close or adjust your position before the event ends, based on updated odds.
            </Card>
          </div>
        </div>

        {/* STORY */}
        <div style={{ marginTop: 44, marginBottom: 40 }}>
          <h2 style={{ fontSize: 28, margin: "0 0 10px", letterSpacing: -0.4 }}>Why GameFix exists</h2>
          <div
            style={{
              border: "1px solid rgba(240, 246, 252, 0.1)",
              borderRadius: 18,
              padding: 18,
              background: "rgba(22, 27, 34, 0.6)",
            }}
          >
            <p style={{ margin: 0, color: "rgba(230, 237, 243, 0.85)", lineHeight: 1.75 }}>
              <strong style={{ color: "#e6edf3" }}>GameFix was started in 2021</strong> with a simple idea: betting markets should work more like financial markets.
              Instead of a bookmaker setting prices and embedding a margin, users should be able to set odds with each other in a transparent, competitive exchange.
            </p>

            <p style={{ margin: "12px 0 0", color: "rgba(230, 237, 243, 0.85)", lineHeight: 1.75 }}>
              Traditional bookmakers set odds and keep a built-in margin. GameFix is designed around a free market where users set prices with each other.
              The platform itself doesn't "be the house"—it provides the exchange and charges a transparent fee on transactions.
            </p>

            <details style={{ marginTop: 12 }}>
              <summary style={{ cursor: "pointer", color: "rgba(230, 237, 243, 0.75)" }}>Show the simple intuition</summary>
              <p style={{ margin: "10px 0 0", color: "rgba(230, 237, 243, 0.8)", lineHeight: 1.7 }}>
                In a free market, if a price is too generous, it gets bought quickly and moves back toward equilibrium.
                With enough activity, pricing tends to become fairer because any obvious discrepancy is competed away.
              </p>
            </details>

            <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid rgba(240, 246, 252, 0.1)" }}>
              <Link
                to="/story"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 16px",
                  background: "rgba(240, 246, 252, 0.06)",
                  color: "#e6edf3",
                  textDecoration: "none",
                  fontSize: 14,
                  fontWeight: 600,
                  borderRadius: 10,
                  border: "1px solid rgba(240, 246, 252, 0.1)",
                }}
              >
                See our journey →
              </Link>
            </div>
          </div>
        </div>

        {/* BACK TO HOME */}
        <div style={{ paddingBottom: 40, textAlign: "center" }}>
          <Link
            to="/"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid rgba(240, 246, 252, 0.1)",
              background: "rgba(240, 246, 252, 0.06)",
              color: "#e6edf3",
              textDecoration: "none",
              fontSize: 13,
            }}
          >
            ← Back to home
          </Link>
        </div>
      </Container>
    </div>
  );
}
