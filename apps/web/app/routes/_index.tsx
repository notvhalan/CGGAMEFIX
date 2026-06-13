import { Link } from "@remix-run/react";
import type { MetaFunction, LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { useEffect, useState, useRef } from "react";
import { motion, useInView } from "framer-motion";
import { Zap, BarChart3, BadgeCheck } from "lucide-react";

/* ── Motion presets — premium hardware easing ─────────────────── */
const ease = [0.16, 1, 0.3, 1] as const;
const fadeUp = { hidden: { opacity: 0, y: 32, filter: 'blur(6px)' }, visible: { opacity: 1, y: 0, filter: 'blur(0px)' } };
const stagger = { visible: { transition: { staggerChildren: 0.12 } } };
const cardReveal = { hidden: { opacity: 0, y: 44, scale: 0.95, rotateX: 4 }, visible: { opacity: 1, y: 0, scale: 1, rotateX: 0 } };

/* ── Scroll-reveal wrapper ────────────────────────────────────── */
function Reveal({ children, className, delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });
  return (
    <motion.div
      ref={ref}
      className={className}
      initial="hidden"
      animate={inView ? 'visible' : 'hidden'}
      variants={fadeUp}
      transition={{ duration: 0.85, ease, delay }}
    >
      {children}
    </motion.div>
  );
}
import { BlockMath, InlineMath } from "~/components/Math";
import { getAuthenticatedUser } from "~/lib/auth.server";
import "~/styles/pages/landing.css";
import "~/styles/pages/survival-model.css";
import "katex/dist/katex.min.css";

export const meta: MetaFunction = () => {
  return [
    { title: "GAMEFIX — Event Markets, Probability Curves, and Hazard Indices" },
    { name: "description", content: "Trade real-world event contracts across time. Live binary markets, probability term structures, and rolling hazard-index products for forecasting, hedging, and risk transfer." },
  ];
};

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await getAuthenticatedUser(request);
  if (user) return redirect("/app");
  return null;
}

/* ── Live-ticking probability ─────────────────────────────────── */
function useTicker(base: number, variance = 0.4, intervalMs = 2200) {
  const [value, setValue] = useState(base);
  const ref = useRef(base);
  useEffect(() => {
    const id = setInterval(() => {
      const drift = (Math.random() - 0.5) * variance;
      ref.current = Math.max(0.5, Math.min(99.5, ref.current + drift));
      setValue(parseFloat(ref.current.toFixed(1)));
    }, intervalMs);
    return () => clearInterval(id);
  }, [variance, intervalMs]);
  return value;
}

/* ── Mini probability curve (SVG) — animates with live price ──── */
function ProbabilityCurve({ currentProb = 27 }: { currentProb?: number }) {
  const n = 16;
  const startP = Math.max(2, currentProb * 0.35);
  const endP = currentProb;
  const pts = Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1);
    const ease = 1 - Math.pow(1 - t, 2.2);
    return startP + (endP - startP) * ease;
  });

  const w = 300, h = 130, padX = 4, padY = 8;
  const xStep = (w - padX * 2) / (n - 1);
  const yMin = 0, yMax = 100;
  const yScale = (v: number) => padY + ((yMax - v) / (yMax - yMin)) * (h - padY * 2);

  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${padX + i * xStep},${yScale(p)}`).join(' ');
  const areaD = d + ` L${padX + (n - 1) * xStep},${h - padY} L${padX},${h - padY} Z`;

  const endX = padX + (n - 1) * xStep;
  const endY = yScale(pts[n - 1]);
  const label = currentProb.toFixed(1) + '%';

  const gridLines = [25, 50, 75];

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="prob-curve-svg" aria-label="YES probability over time">
      <defs>
        <linearGradient id="curveStroke" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#8FAED5" />
          <stop offset="50%" stopColor="#A0C2D0" />
          <stop offset="100%" stopColor="#B0D6E2" />
        </linearGradient>
        <linearGradient id="curveFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(143,174,213,0.18)" />
          <stop offset="100%" stopColor="rgba(143,174,213,0)" />
        </linearGradient>
      </defs>
      {gridLines.map(v => (
        <line key={v} x1={padX} y1={yScale(v)} x2={w - padX} y2={yScale(v)}
          stroke="rgba(255,255,255,0.04)" strokeWidth="0.5" />
      ))}
      <path d={areaD} fill="url(#curveFill)" style={{ transition: 'd 0.8s ease' }} />
      <path d={d} fill="none" stroke="url(#curveStroke)" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round"
        style={{ transition: 'd 0.8s ease' }} />
      <circle cx={endX} cy={endY} r="5" fill="rgba(176,214,226,0.2)"
        style={{ transition: 'cy 0.8s ease' }} />
      <circle cx={endX} cy={endY} r="2.5" fill="#B0D6E2"
        style={{ transition: 'cy 0.8s ease' }} />
      <rect x={endX - 38} y={endY - 18} width="42" height="15" rx="4"
        fill="rgba(13,17,23,0.92)" stroke="rgba(176,214,226,0.25)" strokeWidth="0.5"
        style={{ transition: 'y 0.8s ease' }} />
      <text x={endX - 17} y={endY - 8} fill="#B0D6E2" fontSize="8.5" fontFamily="monospace"
        textAnchor="middle" style={{ transition: 'y 0.8s ease' }}>{label}</text>
      <text x={padX} y={h - 1} fill="#484f58" fontSize="7" fontFamily="monospace">Now</text>
      <text x={w - padX - 12} y={h - 1} fill="#484f58" fontSize="7" fontFamily="monospace">1yr</text>
      <text x={padX} y={yScale(50) + 3} fill="#484f58" fontSize="6" fontFamily="monospace">50%</text>
    </svg>
  );
}

/* ═══════════════════════════════════════════════════════════════ */

export default function Index() {
  const [scrolled, setScrolled] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Seamless loop: fade out near end, reset to start, fade back in
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    let fading = false;
    const FADE_MS = 800;

    const restart = () => {
      if (fading) return;
      fading = true;
      v.classList.add('fading');
      setTimeout(() => {
        v.currentTime = 0;
        v.play();
        setTimeout(() => {
          v.classList.remove('fading');
          fading = false;
        }, 80);
      }, FADE_MS);
    };

    const onTime = () => {
      if (!fading && v.duration > 0 && v.currentTime >= v.duration - 1) {
        restart();
      }
    };

    const onEnded = () => restart();
    v.addEventListener('timeupdate', onTime);
    v.addEventListener('ended', onEnded);

    return () => {
      v.removeEventListener('timeupdate', onTime);
      v.removeEventListener('ended', onEnded);
    };
  }, []);

  // live-ticking probabilities for the hero market card
  const yesProb = useTicker(27, 0.3, 2400);
  const noProb = parseFloat((100 - yesProb).toFixed(1));

  return (
    <div className="landing-container">
      {/* ── Navbar ─────────────────────────────────────────────── */}
      <nav className={`landing-nav ${scrolled ? "scrolled" : ""}`}>
        <Link to="/" className="landing-logo">GAMEFIX</Link>
        <div className="landing-nav-links">
          <Link to="/" className="nav-link active">Home</Link>
          <Link to="/about" className="nav-link">About</Link>
          <Link to="/story" className="nav-link">Story</Link>
          <Link to="/docs" className="nav-link">Docs</Link>
          <Link to="/app/markets" className="nav-login-btn">Explore Markets</Link>
        </div>
      </nav>

      {/* ── Hero ───────────────────────────────────────────────── */}
      <section className="hero-section">
        <video ref={videoRef} className="hero-bg" src="/media/video/bgvideo.mp4" autoPlay muted playsInline />
        <div className="hero-overlay" />

        <div className="hero-content">
          {/* Left */}
          <div className="hero-left">
            <div className="hero-kicker">
              <span className="kicker-dot" />
              <span>Continuously priced event markets</span>
            </div>

            <h1 className="hero-title">
              Trade how risk evolves<br />
              <span className="grad">through time.</span>
            </h1>

            <p className="hero-subtitle">
              Live YES&nbsp;/&nbsp;NO markets, probability curves across maturities, and forward hazard indices.
            </p>

            {/* 3-step mental model */}
            <div className="hero-steps">
              <div className="hero-step">
                <span className="step-icon step-icon--buy"><Zap size={13} strokeWidth={2.5} /></span>
                <span className="step-text">Buy <strong>YES</strong> or <strong>NO</strong></span>
              </div>
              <div className="hero-step">
                <span className="step-icon step-icon--prob"><BarChart3 size={13} strokeWidth={2.5} /></span>
                <span className="step-text">Price = implied probability</span>
              </div>
              <div className="hero-step">
                <span className="step-icon step-icon--settle"><BadgeCheck size={13} strokeWidth={2.5} /></span>
                <span className="step-text">If true at maturity → <strong>£1.00</strong></span>
              </div>
            </div>

            <div className="hero-cta">
              <Link to="/app/markets" className="btn btn-primary">
                Explore Markets →
              </Link>
              <button type="button" className="btn btn-secondary" onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })}>
                How it works
              </button>
            </div>

            {/* Credibility cues */}
            <div className="hero-cred">
              <span className="hero-cred-item">Continuous order book</span>
              <span className="hero-cred-sep" />
              <span className="hero-cred-item">Multi-maturity markets</span>
              <span className="hero-cred-sep" />
              <span className="hero-cred-item">Real-time price discovery</span>
            </div>
          </div>

          {/* Right — live market card + maturity strip */}
          <div className="hero-right">
            <motion.div
              className="hero-card-system"
              initial={{ opacity: 0, y: 44, scale: 0.95, rotateX: 4 }}
              animate={{ opacity: 1, y: 0, scale: 1, rotateX: 0 }}
              transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
              style={{ perspective: 900 }}
            >
              {/* Decorative glow behind card */}
              <div className="hcs-glow" aria-hidden="true" />
              <div className="hcs-glow-accent" aria-hidden="true" />

              <div className="hero-market-card">
                {/* Top bar */}
                <div className="hmc-top-bar">
                  <div className="hmc-header-left">
                    <span className="hmc-badge"><span className="hmc-badge-dot" />Health &amp; Research</span>
                  </div>
                  <span className="hmc-live"><span className="live-dot" /> LIVE</span>
                </div>

                {/* Question */}
                <h3 className="hmc-question">
                  Will a clinically approved cure for paralysis be publicly available by Mar 2027?
                </h3>

                {/* Resolve tag */}
                <div className="hmc-resolve-row">
                  <span className="hmc-resolve-tag">Resolves to £1.00 if YES</span>
                  <span className="hmc-resolve-sep" />
                  <span className="hmc-resolve-date">Mar 31, 2027</span>
                </div>

                {/* YES / NO trade buttons */}
                <div className="hmc-prices">
                  <button className="hmc-btn hmc-btn--yes" onClick={() => window.location.href = '/app/insurance/life/paralysis-cure'}>
                    <div className="hmc-btn-inner">
                      <span className="hmc-btn-label">YES</span>
                      <span className="hmc-btn-price">{Math.round(yesProb)}<span className="hmc-btn-unit">p</span></span>
                    </div>
                    <div className="hmc-btn-fill" style={{ width: `${yesProb}%` }} />
                  </button>
                  <button className="hmc-btn hmc-btn--no" onClick={() => window.location.href = '/app/insurance/life/paralysis-cure'}>
                    <div className="hmc-btn-inner">
                      <span className="hmc-btn-label">NO</span>
                      <span className="hmc-btn-price">{Math.round(noProb)}<span className="hmc-btn-unit">p</span></span>
                    </div>
                    <div className="hmc-btn-fill" style={{ width: `${noProb}%` }} />
                  </button>
                </div>

                {/* Probability curve */}
                <div className="hmc-curve-section">
                  <div className="hmc-curve-header">
                    <span className="hmc-curve-title">Probability</span>
                    <span className="hmc-prob-val">{yesProb}%</span>
                  </div>
                  <div className="hmc-curve-wrap">
                    <ProbabilityCurve currentProb={yesProb} />
                  </div>
                </div>

                {/* Footer stats */}
                <div className="hmc-footer">
                  {[
                    { label: 'Last', value: `${Math.round(yesProb)}p` },
                    { label: '24h', value: '+0.8p', cls: 'hmc-foot--green' },
                    { label: 'Maturity', value: '365d' },
                    { label: 'Volume', value: '£124.8k' },
                  ].map((s, i) => (
                    <div key={s.label} className="hmc-foot-item">
                      <span className="hmc-foot-label">{s.label}</span>
                      <span className={`hmc-foot-value ${s.cls || ''}`}>{s.value}</span>
                    </div>
                  ))}
                </div>

                {/* Maturity strip — inside card */}
                <div className="hero-maturity-strip">
                  <div className="hms-row">
                    {[
                      { date: 'Jun 26', val: '0.95', pct: 95, cls: 'hms--green' },
                      { date: 'Dec 26', val: '0.90', pct: 90, cls: 'hms--green', active: true },
                      { date: '2028',   val: '0.72', pct: 72, cls: 'hms--green' },
                      { date: '2030',   val: '0.41', pct: 41, cls: 'hms--dim' },
                      { date: '2066',   val: '0.25', pct: 25, cls: 'hms--dim' },
                    ].map((m) => (
                      <div key={m.date} className={`hms-cell ${m.active ? 'hms-cell--active' : ''}`}>
                        <span className="hms-date">{m.date}</span>
                        <div className="hms-bar-track">
                          <div className={`hms-bar-fill ${m.cls}`} style={{ height: `${m.pct}%` }} />
                        </div>
                        <span className={`hms-val ${m.cls}`}>{m.val}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>

        <a href="#how-it-works" className="hero-scroll-indicator" aria-label="Scroll down">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </a>
      </section>

      {/* ── How It Works ─────────────────────────────────────── */}
      <section id="how-it-works" className="hiw-section">
        <div className="hiw-container">
          <div className="smm-badge">HOW IT WORKS</div>
          <h2 className="hiw-title">Price outcomes. Trade timing.</h2>
          <p className="hiw-subtitle">
            Binary contracts with live prices. Across maturities, those prices form a term structure of risk.
          </p>

          {/* Step 1-2-3 cards */}
          <motion.div
            className="hiw-grid"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-80px' }}
            variants={stagger}
          >
            <motion.div className="hiw-card" variants={fadeUp} transition={{ duration: 0.7, ease }}>
              <div className="hiw-step-num">1</div>
              <h3>Choose a market</h3>
              <p>Pick an event across insurance, catastrophe, science, or hedging categories.</p>
            </motion.div>
            <motion.div className="hiw-card" variants={fadeUp} transition={{ duration: 0.7, ease }}>
              <div className="hiw-step-num">2</div>
              <h3>Trade YES or NO</h3>
              <p>Price = implied probability. Buy at 27p if you think chances exceed 27%.</p>
            </motion.div>
            <motion.div className="hiw-card" variants={fadeUp} transition={{ duration: 0.7, ease }}>
              <div className="hiw-step-num">3</div>
              <h3>Hold, close, or trade the curve</h3>
              <p>£1 at settlement, exit early, or trade across maturities.</p>
            </motion.div>
          </motion.div>

          {/* ── Contract structure with image ──────────────── */}
          <Reveal>
          <div className="hiw-visual-row">
            <div className="hiw-visual-text">
              <span className="hiw-row-badge">CONTRACT STRUCTURE</span>
              <h3>Binary payoffs</h3>
              <ul className="hiw-plain-list">
                <li><strong>YES</strong> pays £1 if the statement is true at maturity</li>
                <li><strong>NO</strong> pays £1 if the statement is false at maturity</li>
              </ul>
              <p>
                Let <InlineMath math="\tau" /> be the event time and <InlineMath math="T" /> the maturity:
              </p>
              <div className="smm-math-block">
                <BlockMath math="Y(T) = \mathbf{1}_{\{\tau \leq T\}}, \quad N(T) = \mathbf{1}_{\{\tau > T\}}" />
              </div>
              <p>
                Survival-style markets reverse the direction:
              </p>
              <div className="smm-math-block">
                <BlockMath math="Y(T) = \mathbf{1}_{\{\tau > T\}}, \quad N(T) = \mathbf{1}_{\{\tau \leq T\}}" />
              </div>
            </div>
            <div className="hiw-visual-media">
              <img src="/media/img/PastedGraphic-2s.png" alt="Contract payoff diagram" />
            </div>
          </div>

          </Reveal>

          {/* ── From contracts to curves (NEW) ──────────── */}
          <Reveal delay={0.1}>
          <div className="hiw-visual-row hiw-visual-row--flip">
            <div className="hiw-visual-text">
              <span className="hiw-row-badge" style={{ background: 'rgba(0, 242, 234, 0.12)', color: '#00f2ea', borderColor: 'rgba(0, 242, 234, 0.25)' }}>FROM CONTRACTS TO CURVES</span>
              <h3>One contract per maturity. Many maturities form a live probability curve.</h3>
              <p>
                A strip of contracts across dates forms a <strong>probability term structure</strong> — showing not just <em>whether</em> the market expects an event, but <em>when</em>.
              </p>
            </div>
            <div className="hiw-visual-media">
              <img src="/media/img/fan1.png" alt="Probability term structure fan diagram" />
            </div>
          </div>

          </Reveal>

          {/* ── Market categories ────────────────────────── */}
          <Reveal delay={0.05}>
          <div className="hiw-categories-block">
            <span className="hiw-row-badge" style={{ background: 'rgba(0, 242, 234, 0.12)', color: '#00f2ea', borderColor: 'rgba(0, 242, 234, 0.25)' }}>MARKET CATEGORIES</span>
            <h3 className="hiw-cat-title">Not a prediction app. A risk-pricing system.</h3>
            <div className="hiw-cat-grid hiw-cat-grid--5">
              <div className="hiw-cat-card">
                <div className="hiw-cat-icon-svg"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 17l4-4 4 4 4-8 6 6" strokeLinecap="round" strokeLinejoin="round"/><path d="M21 3v4h-4" strokeLinecap="round" strokeLinejoin="round"/></svg></div>
                <h4>Insurance</h4>
                <p>Survival curves across maturities</p>
              </div>
              <div className="hiw-cat-card">
                <div className="hiw-cat-icon-svg"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 2v4M4.93 4.93l2.83 2.83M2 12h4M4.93 19.07l2.83-2.83M12 18v4M16.24 16.24l2.83 2.83M18 12h4M16.24 7.76l2.83-2.83" strokeLinecap="round"/></svg></div>
                <h4>Catastrophe risk</h4>
                <p>Event-triggered disruption pricing</p>
              </div>
              <div className="hiw-cat-card">
                <div className="hiw-cat-icon-svg"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" strokeLinecap="round"/></svg></div>
                <h4>Scientific milestones</h4>
                <p>Approvals, trials, research deadlines</p>
              </div>
              <div className="hiw-cat-card">
                <div className="hiw-cat-icon-svg"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M7 17l5-5-5-5M12 17l5-5-5-5" strokeLinecap="round" strokeLinejoin="round"/></svg></div>
                <h4>Hedging</h4>
                <p>Offsetting risk across dated contracts</p>
              </div>
              <div className="hiw-cat-card">
                <div className="hiw-cat-icon-svg"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 3v18" strokeLinecap="round"/><path d="M14 14l2 2 3-3" strokeLinecap="round" strokeLinejoin="round"/></svg></div>
                <h4>Index products</h4>
                <p>Hazard indices from contract strips</p>
              </div>
            </div>
          </div>

          </Reveal>

          {/* ── Worked example: survival term structure ── */}
          <Reveal>
          <div className="hiw-visual-row hiw-visual-row--flip">
            <div className="hiw-visual-text">
              <span className="hiw-row-badge" style={{ background: 'rgba(143,174,213,0.12)', color: '#8FAED5', borderColor: 'rgba(143,174,213,0.25)' }}>WORKED EXAMPLE</span>
              <h3>Survival term structure</h3>
              <p>
                "<em>Alive at <InlineMath math="T" /></em>" &mdash; YES pays £1 if alive.
                Prices decline with maturity, forming a live survival curve.
              </p>
              <div className="smm-survival-table hiw-table">
                <div className="smm-survival-header">
                  <span>Contract</span>
                  <span className="smm-yes-col">YES</span>
                  <span className="smm-no-col">NO</span>
                </div>
                {[
                  { label: "Alive at Feb 2026", yes: "0.95", no: "0.05" },
                  { label: "Alive at Dec 2026", yes: "0.90", no: "0.10" },
                  { label: "Alive at Feb 2066", yes: "0.25", no: "0.75" },
                ].map((row) => (
                  <div key={row.label} className="smm-survival-row">
                    <span className="smm-survival-label">{row.label}</span>
                    <span className="smm-yes-col">{row.yes}</span>
                    <span className="smm-no-col">{row.no}</span>
                  </div>
                ))}
              </div>
              <p className="hiw-note">
                Together these form a <strong>survival term structure</strong> — the market's view of mortality risk across time.
              </p>
            </div>
            <div className="hiw-visual-media">
              <img src="/media/img/PastedGraphic-3s.png" alt="Survival term structure" />
            </div>
          </div>

          </Reveal>

          {/* ── Mathematical framework ──────────────────── */}
          <Reveal delay={0.1}>
          <div className="hiw-visual-row">
            <div className="hiw-visual-text">
              <span className="hiw-row-badge" style={{ background: 'rgba(63,185,80,0.12)', color: '#3fb950', borderColor: 'rgba(63,185,80,0.25)' }}>MATHEMATICAL FRAMEWORK</span>
              <h3>Hazard-rate extraction</h3>
              <p>
                Survival probability under hazard rate <InlineMath math="\lambda(u)" />:
              </p>
              <div className="smm-math-block smm-math-block--green">
                <BlockMath math="S_t(T) = \exp\!\left(-\int_t^T \lambda(u)\,du\right)" />
              </div>
              <p>
                Forward hazard between adjacent maturities:
              </p>
              <div className="smm-math-block smm-math-block--green">
                <BlockMath math="q_t(T - \Delta, T) = \frac{S_t(T - \Delta) - S_t(T)}{S_t(T - \Delta)}" />
              </div>
              <div className="hiw-interp-pills">
                <span className="hiw-pill">Insurance contingencies</span>
                <span className="hiw-pill">Binary risk hedging</span>
                <span className="hiw-pill">Forward hazard curves</span>
              </div>
            </div>
            <div className="hiw-visual-media">
              <img src="/media/img/PastedGraphic-4s.png" alt="Hazard rate diagram" />
            </div>
          </div>

          </Reveal>

          {/* ── Index layer (NEW) ──────────────────────── */}
          <Reveal>
          <div className="hiw-visual-row hiw-visual-row--flip">
            <div className="hiw-visual-text">
              <span className="hiw-row-badge" style={{ background: 'rgba(88,166,255,0.12)', color: '#58a6ff', borderColor: 'rgba(88,166,255,0.25)' }}>INDEX LAYER</span>
              <h3>Contracts &rarr; curve &rarr; tradable index</h3>
              <p>
                Strips of dated contracts aggregate into a published <strong>Hazard Index</strong> — a forward-looking measure of event risk, analogous to VIX for volatility.
              </p>
              <div className="hiw-index-stack">
                <div className="hiw-index-level"><span className="hiw-idx-dot" /> Dated contracts</div>
                <div className="hiw-index-arrow">↓</div>
                <div className="hiw-index-level"><span className="hiw-idx-dot hiw-idx-dot--mid" /> Probability curve</div>
                <div className="hiw-index-arrow">↓</div>
                <div className="hiw-index-level hiw-index-level--end"><span className="hiw-idx-dot hiw-idx-dot--end" /> Hazard Index</div>
              </div>
            </div>
            <div className="hiw-visual-media">
              <img src="/media/img/fan1.png" alt="Index construction from contract strips" />
            </div>
          </div>

          </Reveal>

          {/* ── Daily-settled products (NEW) ────────────── */}
          <Reveal delay={0.1}>
          <div className="hiw-visual-row">
            <div className="hiw-visual-text">
              <span className="hiw-row-badge" style={{ background: 'rgba(143,174,213,0.12)', color: '#8FAED5', borderColor: 'rgba(143,174,213,0.25)' }}>DAILY-SETTLED PRODUCTS</span>
              <h3>Daily-settled hazard futures</h3>
              <p>
                Rolling products linked to realized event incidence or hazard-curve repricing. Daily mark-to-market, cash settlement.
              </p>
              <div className="hiw-settlement-timeline">
                <div className="hst-day"><span className="hst-marker" /><span className="hst-label">Day 1</span><span className="hst-val">+0.3p</span></div>
                <div className="hst-day"><span className="hst-marker" /><span className="hst-label">Day 2</span><span className="hst-val hst-neg">−0.1p</span></div>
                <div className="hst-day"><span className="hst-marker" /><span className="hst-label">Day 3</span><span className="hst-val">+0.5p</span></div>
                <div className="hst-day hst-day--settle"><span className="hst-marker hst-marker--final" /><span className="hst-label">Settlement</span><span className="hst-val hst-final">£1.00</span></div>
              </div>
            </div>
            <div className="hiw-visual-media hiw-visual-media--video">
              <video autoPlay loop muted playsInline>
                <source src="/media/video/herom3.mp4" type="video/mp4" />
              </video>
            </div>
          </div>

          </Reveal>

          {/* ── Exchange mechanics ──────────────────────── */}
          <Reveal>
          <div className="hiw-visual-row hiw-visual-row--flip">
            <div className="hiw-visual-text">
              <span className="hiw-row-badge" style={{ background: 'rgba(35,134,54,0.12)', color: '#3fb950', borderColor: 'rgba(35,134,54,0.25)' }}>EXCHANGE MECHANICS</span>
              <h3>Continuous limit order book</h3>
              <p>
                No house odds. Prices discovered through live double-auction matching.
              </p>
              <div className="hiw-exchange-callout">
                User-discovered prices · Live probability curves · No spread markup
              </div>
              <div className="hiw-exchange-fee-badge">
                0% exchange fee
              </div>
              <Link to="/how-it-works" className="hiw-doc-link">
                Documentation →
              </Link>
            </div>
            <div className="hiw-visual-media hiw-visual-media--video">
              <video autoPlay loop muted playsInline>
                <source src="/media/video/homemediacard1.mp4" type="video/mp4" />
              </video>
            </div>
          </div>

          </Reveal>

          {/* ── What this achieves (NEW) ───────────────── */}
          <Reveal delay={0.1}>
          <div className="hiw-achieves-block">
            <span className="hiw-row-badge" style={{ background: 'rgba(88,166,255,0.12)', color: '#58a6ff', borderColor: 'rgba(88,166,255,0.25)' }}>WHAT THIS ACHIEVES</span>
            <h3 className="hiw-cat-title">Beyond single-event prediction</h3>
            <div className="hiw-achieves-list">
              <div className="hiw-achieves-item">Whether an event happens</div>
              <div className="hiw-achieves-item">When risk arrives across maturities</div>
              <div className="hiw-achieves-item">How the probability curve shifts</div>
              <div className="hiw-achieves-item">Forward hazard repricing</div>
            </div>
          </div>

          </Reveal>

          {/* ── Stats strip ────────────────────────────── */}
          <Reveal>
          <div className="hiw-stats">
            <div className="hiw-stat">
              <span className="hiw-stat-val">6</span>
              <span className="hiw-stat-label">Risk categories</span>
            </div>
            <div className="hiw-stat-sep" />
            <div className="hiw-stat">
              <span className="hiw-stat-val">186</span>
              <span className="hiw-stat-label">Active markets</span>
            </div>
            <div className="hiw-stat-sep" />
            <div className="hiw-stat">
              <span className="hiw-stat-val hiw-stat-green">0%</span>
              <span className="hiw-stat-label">Exchange fee</span>
            </div>
            <div className="hiw-stat-sep" />
            <div className="hiw-stat">
              <span className="hiw-stat-val">24/7</span>
              <span className="hiw-stat-label">Continuous trading</span>
            </div>
          </div>
          </Reveal>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <footer className="landing-footer">
        <div className="footer-content">
          <div className="footer-logo">gamefix.com</div>
          <div className="footer-links">
            <Link to="/how-it-works" className="footer-link">Methodology</Link>
            <Link to="/how-it-works" className="footer-link">Index Construction</Link>
            <Link to="/how-it-works" className="footer-link">Settlement Rules</Link>
            <Link to="/docs" className="footer-link">Docs</Link>
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
            className="footer-carvum"
          >
            Made by <strong style={{ fontWeight: 700, marginLeft: '0.2rem' }}>Carvum</strong>
          </a>
        </div>
      </footer>
    </div>
  );
}
