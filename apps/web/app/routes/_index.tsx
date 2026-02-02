import { Link } from "@remix-run/react";
import type { MetaFunction, LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { useEffect, useState } from "react";
import RealTimeGlassChart from "~/components/RealTimeGlassChart";
import { getAuthenticatedUser } from "~/lib/auth.server";
import "~/styles/pages/landing.css";

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
            <Link to="/about" className="btn btn-primary">
              Learn how it works →
            </Link>
            <Link to="/story" className="btn btn-secondary">
              Why GameFix
            </Link>
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
                <Link to="/auth/login" style={{ padding: "12px 24px", background: "#238636", color: "white", textDecoration: "none", fontSize: "15px", fontWeight: "600", borderRadius: "10px", boxShadow: "0 4px 12px rgba(35, 134, 54, 0.3)" }}>
                  Start now →
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
      </footer>
    </div>
  );
}
