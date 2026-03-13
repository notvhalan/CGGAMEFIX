import { Link } from "@remix-run/react";
import { useState, useEffect } from "react";
import "~/styles/pages/story.css";
import "~/styles/pages/landing.css";

const Container: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="story-container">{children}</div>
);

const StorySection: React.FC<{
  children: React.ReactNode;
  imageSrc?: string;
  videoSrc?: string;
  imageAlt?: string;
  imagePlaceholder?: string;
  reverse?: boolean;
}> = ({ children, imageSrc, videoSrc, imageAlt, imagePlaceholder, reverse }) => (
  <div className={`story-section ${reverse ? "reverse" : ""}`}>
    <div className="story-section-text">{children}</div>
    <div className="story-section-image">
      {videoSrc ? (
        <video
          src={videoSrc}
          autoPlay
          loop
          muted
          playsInline
          style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "12px" }}
        />
      ) : imageSrc ? (
        <img
          src={imageSrc}
          alt={imageAlt || "Story image"}
          style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "12px" }}
        />
      ) : (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
          {imagePlaceholder || "📝"}
        </div>
      )}
    </div>
  </div>
);

export default function Story() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="story-page">
      {/* Navigation (transparent on load, glass on scroll) */}
      <nav className={`landing-nav ${scrolled ? "scrolled" : ""}`}>
        <Link to="/" className="landing-logo">
          GAMEFIX
        </Link>

        <div className="landing-nav-links">
          <Link to="/" className="nav-link">Home</Link>
          <Link to="/about" className="nav-link">About</Link>
          <Link to="/story" className="nav-link active">Story</Link>
          <Link to="/auth/login" className="nav-login-btn">Login</Link>
        </div>
      </nav>

      <Container>
        {/* HERO */}
        <div className="story-hero">
          <div className="story-badge">
            <span className="story-badge-primary">OUR STORY</span>
            <span className="story-badge-secondary">2021 → 2026</span>
          </div>

          <h1 className="story-title">
            Building a betting exchange
            <br />
            from first principles.
          </h1>
        </div>

        {/* STORY SECTIONS */}
        <div className="story-content">
          <StorySection imageSrc="/media/img/story/pl1.png" imageAlt="Early concept sketches">
            <p>
              GameFix was started in 2021 with a simple question: why does betting still work like a fixed-price product when financial markets have long moved to open exchanges? Traditional bookmakers set odds, embed margins, and limit how users interact with price. We believed betting outcomes could be treated more like tradable assets, with prices shaped by supply and demand rather than a house edge.
            </p>
          </StorySection>

          <StorySection imageSrc="/media/img/story/pl2.png" imageAlt="Whiteboard sessions" reverse>
            <p>
              The earliest work focused on fundamentals. We sketched flows, whiteboarded market structures, and explored how a two-sided order book could exist for sports outcomes. Instead of users accepting prices, they would place them—backing or laying outcomes at levels they believed were fair, with the platform acting only as the matcher.
            </p>
          </StorySection>

          <StorySection imageSrc="/media/img/story/pl3.png" imageAlt="Probability pricing interface">
            <p>
              As the core system took shape, the focus shifted to market mechanics. We refined how probabilities are represented, moving away from traditional odds displays toward percentage-based pricing. This made prices easier to reason about and closer to how risk is expressed in financial markets, helping users understand value rather than just payouts.
            </p>
          </StorySection>

          <StorySection imageSrc="/media/img/story/pl4.png" imageAlt="Position tracking UI" reverse>
            <p>
              Position tracking became the next major step. Rather than treating bets as isolated slips, GameFix began tracking user exposure across multiple orders. Users could see unrealised profit and loss, close positions early, and manage risk dynamically. The interface started to feel less like a betting site and more like a trading terminal.
            </p>
          </StorySection>

          <StorySection videoSrc="/media/video/story/pl5.mp4" imageAlt="Live orderbook">
            <p>
              With live markets and real users, transparency became non-negotiable. Every order is visible in the book, fees are explicit, and prices move purely based on participation. There are no hidden margins and no opaque adjustments—just a market responding to supply and demand in real time.
            </p>
          </StorySection>

          <StorySection imageSrc="/media/img/story/pl6.png" imageAlt="Current platform" reverse>
            <p>
              Today, GameFix is a full betting exchange built for users who want control, clarity, and fairness. It combines an active order book, real-time position management, and market-driven pricing into a single platform. The goal remains unchanged: give users the tools to trade outcomes openly, with the platform operating as infrastructure—not the house.
            </p>
          </StorySection>
        </div>

        {/* FOOTER */}
        <div className="story-footer">
          <div className="story-footer-buttons">
            <Link to="/about" className="story-btn story-btn-secondary">
              ← Back to About
            </Link>
            <Link to="/app/markets" className="story-btn story-btn-primary">
              Open markets →
            </Link>
          </div>
          <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
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
        </div>
      </Container>
    </div>
  );
}
