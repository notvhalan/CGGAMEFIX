import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
import { getWallet, getMarkets, getMyOrders } from "~/lib/api.server";
import { StatCard } from "~/components/StatCard";
import { MarketCard } from "~/components/MarketCard";
import { Section } from "~/components/Section";
import { useState, useEffect, useMemo } from "react";

// Helper functions
const formatMoney = (value: number | null | undefined): string => {
  if (value === null || value === undefined || isNaN(value)) return "—";
  return `$${value.toFixed(2)}`;
};

const formatPercent = (value: number | null | undefined): string => {
  if (value === null || value === undefined || isNaN(value)) return "—";
  return `${value.toFixed(1)}%`;
};

const safeNumber = (value: any, fallback: string = "—"): string => {
  if (value === null || value === undefined || isNaN(Number(value))) return fallback;
  return String(value);
};

const timeAgo = (date: string | Date): string => {
  const seconds = Math.floor((new Date().getTime() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
};

export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const [walletResponse, marketsResponse, ordersResponse] = await Promise.allSettled([
      getWallet(request),
      getMarkets(),
      getMyOrders(request, 10)
    ]);

    const wallet = walletResponse.status === 'fulfilled' ? walletResponse.value : null;
    const markets = marketsResponse.status === 'fulfilled' ? marketsResponse.value?.markets || [] : [];
    const orders = ordersResponse.status === 'fulfilled' ? ordersResponse.value?.orders || [] : [];

    return json({ 
      wallet, 
      markets: markets.slice(0, 8), // Top 8 trending
      orders: orders.slice(0, 6), // Recent 6 orders
      error: null,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Dashboard loader error:', error);
    return json({ 
      wallet: null, 
      markets: [], 
      orders: [],
      error: 'Failed to load dashboard data' 
    });
  }
}

export default function AppIndex() {
  const { wallet, markets, orders, timestamp } = useLoaderData<typeof loader>();
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [selectedMarket, setSelectedMarket] = useState<string>("");
  const [tradeType, setTradeType] = useState<"YES" | "NO">("YES");
  const [tradeAmount, setTradeAmount] = useState<string>("");

  // Load watchlist from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('watchlist');
    if (saved) {
      try {
        setWatchlist(JSON.parse(saved));
      } catch (e) {
        setWatchlist([]);
      }
    }
  }, []);

  const handleToggleWatch = (marketId: string) => {
    setWatchlist(prev => {
      const newList = prev.includes(marketId)
        ? prev.filter(id => id !== marketId)
        : [...prev, marketId];
      localStorage.setItem('watchlist', JSON.stringify(newList));
      return newList;
    });
  };

  const watchedMarkets = markets.filter(m => watchlist.includes(m.id));
  const openOrders = orders.filter((o: any) => o.status === 'OPEN' || o.status === 'PENDING');
  const totalEquity = (wallet?.balance || 0) + (wallet?.lockedBalance || 0);

  // Generate mini balance history (7 days for compact view)
  const balanceHistory = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const baseBalance = wallet?.balance || 1000;
      const variation = Math.sin(i / 2) * 50 + Math.random() * 30;
      return Math.max(0, baseBalance + variation);
    });
  }, [wallet?.balance]);

  const minBalance = Math.min(...balanceHistory);
  const maxBalance = Math.max(...balanceHistory);
  const balanceChange = balanceHistory.length > 1 ? 
    ((balanceHistory[balanceHistory.length - 1] - balanceHistory[0]) / balanceHistory[0] * 100) : 0;

  return (
    <div style={{ maxWidth: '1600px', margin: '0 auto' }}>
      {/* A) Header */}
      <div style={{ 
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '1.5rem',
        padding: '1.5rem',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        borderRadius: '12px',
        color: 'white',
        boxShadow: '0 4px 12px rgba(102, 126, 234, 0.2)'
      }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0, marginBottom: '0.25rem' }}>
            👋 Welcome back
          </h1>
          <p style={{ fontSize: '0.8125rem', opacity: 0.9, margin: 0 }}>
            Last updated: {new Date(timestamp).toLocaleTimeString()}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <Link
            to="/markets"
            style={{
              padding: '0.625rem 1.25rem',
              background: 'white',
              color: '#667eea',
              borderRadius: '8px',
              textDecoration: 'none',
              fontWeight: 600,
              fontSize: '0.875rem',
              transition: 'all 0.2s'
            }}
          >
            Browse Markets
          </Link>
          <Link
            to="/app/wallet"
            style={{
              padding: '0.625rem 1.25rem',
              background: 'rgba(255, 255, 255, 0.2)',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              color: 'white',
              borderRadius: '8px',
              textDecoration: 'none',
              fontWeight: 600,
              fontSize: '0.875rem',
              transition: 'all 0.2s'
            }}
          >
            Deposit
          </Link>
        </div>
      </div>

      {/* B) Row 1: Capital + Exposure + Performance */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(12, 1fr)',
        gap: '1rem',
        marginBottom: '1rem'
      }}>
        {/* Capital Card */}
        <div style={{ gridColumn: 'span 4' }}>
          <div style={{
            background: 'white',
            border: '1px solid #e2e8f0',
            borderRadius: '12px',
            padding: '1.25rem',
            height: '100%'
          }}>
            <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#64748b', margin: 0, marginBottom: '1rem' }}>
              Capital
            </h3>
            <div style={{ marginBottom: '0.875rem' }}>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.25rem' }}>Available</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1e293b' }}>
                {formatMoney(wallet?.balance)}
              </div>
            </div>
            <div style={{ marginBottom: '0.875rem' }}>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.25rem' }}>Reserved</div>
              <div style={{ fontSize: '1.125rem', fontWeight: 600, color: '#64748b' }}>
                {formatMoney(wallet?.lockedBalance)}
              </div>
            </div>
            <div style={{ paddingTop: '0.875rem', borderTop: '1px solid #f1f5f9', marginBottom: '0.875rem' }}>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.25rem' }}>Total Equity</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1e293b' }}>
                {formatMoney(totalEquity)}
              </div>
            </div>
            <Link
              to="/app/wallet"
              style={{
                fontSize: '0.8125rem',
                color: '#667eea',
                textDecoration: 'none',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem'
              }}
            >
              Manage wallet →
            </Link>
          </div>
        </div>

        {/* Exposure Card */}
        <div style={{ gridColumn: 'span 4' }}>
          <div style={{
            background: 'white',
            border: '1px solid #e2e8f0',
            borderRadius: '12px',
            padding: '1.25rem',
            height: '100%'
          }}>
            <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#64748b', margin: 0, marginBottom: '1rem' }}>
              Exposure
            </h3>
            <div style={{ marginBottom: '0.875rem' }}>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.25rem' }}>Open Orders</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1e293b' }}>
                {safeNumber(openOrders.length, '0')}
              </div>
            </div>
            <div style={{ marginBottom: '0.875rem' }}>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.25rem' }}>Active Positions</div>
              <div style={{ fontSize: '1.125rem', fontWeight: 600, color: '#64748b' }}>
                {safeNumber(0, '0')}
              </div>
            </div>
            <div style={{ paddingTop: '0.875rem', borderTop: '1px solid #f1f5f9', marginBottom: '0.875rem' }}>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.25rem' }}>Notional at Risk</div>
              <div style={{ fontSize: '1.125rem', fontWeight: 600, color: '#ef4444' }}>
                {formatMoney(wallet?.lockedBalance)}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.8125rem' }}>
              <Link to="/app/orders" style={{ color: '#667eea', textDecoration: 'none', fontWeight: 600 }}>
                View orders →
              </Link>
              <Link to="/app/positions" style={{ color: '#667eea', textDecoration: 'none', fontWeight: 600 }}>
                Positions →
              </Link>
            </div>
          </div>
        </div>

        {/* Performance Card with Balance History Graph */}
        <div style={{ gridColumn: 'span 4' }}>
          <div style={{
            background: 'white',
            border: '1px solid #e2e8f0',
            borderRadius: '12px',
            padding: '1.25rem',
            height: '100%'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '1rem' }}>
              <div>
                <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#64748b', margin: 0, marginBottom: '0.25rem' }}>
                  Balance History
                </h3>
                <p style={{ fontSize: '0.6875rem', color: '#94a3b8', margin: 0 }}>Last 7 days</p>
              </div>
              <div style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                color: balanceChange >= 0 ? '#10b981' : '#ef4444',
                background: balanceChange >= 0 ? '#f0fdf4' : '#fef2f2',
                padding: '0.25rem 0.5rem',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem'
              }}>
                {balanceChange >= 0 ? '↑' : '↓'} {Math.abs(balanceChange).toFixed(1)}%
              </div>
            </div>

            {/* Enhanced Balance History Chart */}
            <div style={{ position: 'relative', marginBottom: '1rem' }}>
              <svg width="100%" height="120" style={{ overflow: 'visible' }}>
                {/* Grid lines */}
                {[0, 1, 2, 3].map(i => (
                  <line
                    key={i}
                    x1="0"
                    y1={i * 30}
                    x2="100%"
                    y2={i * 30}
                    stroke="#f1f5f9"
                    strokeWidth="1"
                  />
                ))}

                {/* Gradient fill */}
                <defs>
                  <linearGradient id="balanceGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor={balanceChange >= 0 ? "#10b981" : "#ef4444"} stopOpacity="0.2" />
                    <stop offset="100%" stopColor={balanceChange >= 0 ? "#10b981" : "#ef4444"} stopOpacity="0" />
                  </linearGradient>
                </defs>

                {/* Area fill */}
                <polygon
                  fill="url(#balanceGradient)"
                  points={[
                    '0%,120',
                    ...balanceHistory.map((val, i) => {
                      const x = (i / (balanceHistory.length - 1)) * 100;
                      const y = 110 - ((val - minBalance) / (maxBalance - minBalance)) * 100;
                      return `${x}%,${y}`;
                    }),
                    '100%,120'
                  ].join(' ')}
                />

                {/* Line */}
                <polyline
                  fill="none"
                  stroke={balanceChange >= 0 ? "#10b981" : "#ef4444"}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={balanceHistory.map((val, i) => {
                    const x = (i / (balanceHistory.length - 1)) * 100;
                    const y = 110 - ((val - minBalance) / (maxBalance - minBalance)) * 100;
                    return `${x}%,${y}`;
                  }).join(' ')}
                />

                {/* Data points */}
                {balanceHistory.map((val, i) => {
                  const x = (i / (balanceHistory.length - 1)) * 100;
                  const y = 110 - ((val - minBalance) / (maxBalance - minBalance)) * 100;
                  return (
                    <circle
                      key={i}
                      cx={`${x}%`}
                      cy={y}
                      r="3"
                      fill="white"
                      stroke={balanceChange >= 0 ? "#10b981" : "#ef4444"}
                      strokeWidth="2"
                    />
                  );
                })}
              </svg>

              {/* Value labels */}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', fontSize: '0.6875rem', color: '#94a3b8' }}>
                <span>Day 1</span>
                <span>{formatMoney(balanceHistory[Math.floor(balanceHistory.length / 2)])}</span>
                <span>Today</span>
              </div>
            </div>

            {/* Quick Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', fontSize: '0.75rem', borderTop: '1px solid #f1f5f9', paddingTop: '0.75rem' }}>
              <div>
                <div style={{ color: '#94a3b8', marginBottom: '0.25rem' }}>Volume</div>
                <div style={{ fontWeight: 600, color: '#1e293b' }}>$2,450</div>
              </div>
              <div>
                <div style={{ color: '#94a3b8', marginBottom: '0.25rem' }}>Trades</div>
                <div style={{ fontWeight: 600, color: '#1e293b' }}>18</div>
              </div>
              <div>
                <div style={{ color: '#94a3b8', marginBottom: '0.25rem' }}>Fees</div>
                <div style={{ fontWeight: 600, color: '#1e293b' }}>$24.50</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* C) Row 2: Markets + Quick Trade */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(12, 1fr)',
        gap: '1rem',
        marginBottom: '1rem'
      }}>
        {/* Trending Markets */}
        <div style={{ gridColumn: 'span 8' }}>
          <div style={{
            background: 'white',
            border: '1px solid #e2e8f0',
            borderRadius: '12px',
            padding: '1.25rem'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div>
                <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: '#1e293b', margin: 0 }}>
                  Trending Markets
                </h3>
                <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: 0 }}>
                  Popular right now
                </p>
              </div>
              <Link
                to="/markets"
                style={{
                  fontSize: '0.8125rem',
                  color: '#667eea',
                  textDecoration: 'none',
                  fontWeight: 600
                }}
              >
                View all →
              </Link>
            </div>

            {markets.length > 0 ? (
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', 
                gap: '0.75rem' 
              }}>
                {markets.map((market: any) => (
                  <Link
                    key={market.id}
                    to={`/markets/${market.id}`}
                    style={{
                      display: 'block',
                      padding: '0.875rem',
                      background: '#fafbfc',
                      border: '1px solid #f1f5f9',
                      borderRadius: '8px',
                      textDecoration: 'none',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = '#667eea';
                      e.currentTarget.style.background = 'white';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = '#f1f5f9';
                      e.currentTarget.style.background = '#fafbfc';
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.5rem' }}>
                      <div style={{ fontWeight: 600, color: '#1e293b', fontSize: '0.8125rem', flex: 1, lineHeight: 1.3 }}>
                        {market.name || market.id.slice(0, 20)}
                      </div>
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleToggleWatch(market.id);
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: '0.875rem',
                          padding: 0
                        }}
                      >
                        {watchlist.includes(market.id) ? '⭐' : '☆'}
                      </button>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.75rem', marginBottom: '0.5rem' }}>
                      <div style={{ 
                        flex: 1,
                        padding: '0.375rem 0.5rem',
                        background: '#dcfce7',
                        color: '#16a34a',
                        borderRadius: '4px',
                        textAlign: 'center',
                        fontWeight: 600
                      }}>
                        YES {formatPercent(market.backPrice)}
                      </div>
                      <div style={{ 
                        flex: 1,
                        padding: '0.375rem 0.5rem',
                        background: '#fee2e2',
                        color: '#dc2626',
                        borderRadius: '4px',
                        textAlign: 'center',
                        fontWeight: 600
                      }}>
                        NO {formatPercent(market.layPrice)}
                      </div>
                    </div>
                    <div style={{ fontSize: '0.6875rem', color: '#94a3b8' }}>
                      Vol: ${market.volume || '—'}
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div style={{
                padding: '2rem',
                textAlign: 'center',
                color: '#94a3b8',
                fontSize: '0.875rem'
              }}>
                No markets available
              </div>
            )}
          </div>
        </div>

        {/* Quick Trade Panel */}
        <div style={{ gridColumn: 'span 4' }}>
          <div style={{
            background: 'white',
            border: '1px solid #e2e8f0',
            borderRadius: '12px',
            padding: '1.25rem',
            height: '100%'
          }}>
            <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: '#1e293b', margin: 0, marginBottom: '1rem' }}>
              Quick Trade
            </h3>

            {wallet ? (
              <>
                <div style={{ marginBottom: '0.75rem' }}>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: '#64748b', marginBottom: '0.375rem', fontWeight: 500 }}>
                    Select Market
                  </label>
                  <select
                    value={selectedMarket}
                    onChange={(e) => setSelectedMarket(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      border: '1px solid #e2e8f0',
                      borderRadius: '6px',
                      fontSize: '0.8125rem',
                      background: 'white'
                    }}
                  >
                    <option value="">Choose a market...</option>
                    {markets.slice(0, 5).map((m: any) => (
                      <option key={m.id} value={m.id}>
                        {m.name || m.id.slice(0, 30)}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ marginBottom: '0.75rem' }}>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: '#64748b', marginBottom: '0.375rem', fontWeight: 500 }}>
                    Side
                  </label>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      onClick={() => setTradeType('YES')}
                      style={{
                        flex: 1,
                        padding: '0.5rem',
                        background: tradeType === 'YES' ? '#10b981' : 'white',
                        color: tradeType === 'YES' ? 'white' : '#64748b',
                        border: '1px solid',
                        borderColor: tradeType === 'YES' ? '#10b981' : '#e2e8f0',
                        borderRadius: '6px',
                        fontSize: '0.8125rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                    >
                      Buy YES
                    </button>
                    <button
                      onClick={() => setTradeType('NO')}
                      style={{
                        flex: 1,
                        padding: '0.5rem',
                        background: tradeType === 'NO' ? '#ef4444' : 'white',
                        color: tradeType === 'NO' ? 'white' : '#64748b',
                        border: '1px solid',
                        borderColor: tradeType === 'NO' ? '#ef4444' : '#e2e8f0',
                        borderRadius: '6px',
                        fontSize: '0.8125rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                    >
                      Buy NO
                    </button>
                  </div>
                </div>

                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: '#64748b', marginBottom: '0.375rem', fontWeight: 500 }}>
                    Amount
                  </label>
                  <input
                    type="number"
                    value={tradeAmount}
                    onChange={(e) => setTradeAmount(e.target.value)}
                    placeholder="0.00"
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      border: '1px solid #e2e8f0',
                      borderRadius: '6px',
                      fontSize: '0.8125rem'
                    }}
                  />
                </div>

                <button
                  disabled={!selectedMarket}
                  style={{
                    width: '100%',
                    padding: '0.625rem',
                    background: selectedMarket ? '#667eea' : '#e2e8f0',
                    color: selectedMarket ? 'white' : '#94a3b8',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    cursor: selectedMarket ? 'pointer' : 'not-allowed',
                    transition: 'all 0.2s'
                  }}
                  onClick={() => {
                    if (selectedMarket) {
                      window.location.href = `/markets/${selectedMarket}`;
                    }
                  }}
                >
                  Open Trade Ticket
                </button>
              </>
            ) : (
              <div style={{
                padding: '2rem 1rem',
                textAlign: 'center',
                background: '#fafbfc',
                borderRadius: '8px'
              }}>
                <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🔒</div>
                <p style={{ fontSize: '0.8125rem', color: '#64748b', marginBottom: '0.75rem' }}>
                  Log in to start trading
                </p>
                <Link
                  to="/login"
                  style={{
                    display: 'inline-block',
                    padding: '0.5rem 1rem',
                    background: '#667eea',
                    color: 'white',
                    borderRadius: '6px',
                    textDecoration: 'none',
                    fontSize: '0.8125rem',
                    fontWeight: 600
                  }}
                >
                  Log In
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* D) Row 3: Activity + Watchlist */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(12, 1fr)',
        gap: '1rem',
        marginBottom: '1rem'
      }}>
        {/* Recent Activity */}
        <div style={{ gridColumn: 'span 8' }}>
          <div style={{
            background: 'white',
            border: '1px solid #e2e8f0',
            borderRadius: '12px',
            padding: '1.25rem'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div>
                <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: '#1e293b', margin: 0 }}>
                  Recent Activity
                </h3>
                <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: 0 }}>
                  Your latest orders
                </p>
              </div>
              <Link
                to="/app/orders"
                style={{
                  fontSize: '0.8125rem',
                  color: '#667eea',
                  textDecoration: 'none',
                  fontWeight: 600
                }}
              >
                View all →
              </Link>
            </div>

            {orders.length > 0 ? (
              <div style={{ borderTop: '1px solid #f1f5f9' }}>
                {orders.map((order: any, index: number) => {
                  const sideLabel = order.side === 'BACK' ? 'Buy YES' : 'Buy NO';
                  const priceDisplay = order.odds ? `${((order.odds - 1) * 100).toFixed(1)}%` : '—';
                  const amountDisplay = formatMoney(order.stake);
                  const statusColors: any = {
                    'OPEN': { bg: '#dbeafe', text: '#1e40af' },
                    'PENDING': { bg: '#fef3c7', text: '#92400e' },
                    'FILLED': { bg: '#dcfce7', text: '#15803d' },
                    'MATCHED': { bg: '#dcfce7', text: '#15803d' },
                    'CANCELLED': { bg: '#fee2e2', text: '#991b1b' }
                  };
                  const statusColor = statusColors[order.status] || { bg: '#f1f5f9', text: '#64748b' };

                  return (
                    <div
                      key={order.id || index}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1.2fr 0.8fr 0.8fr 0.8fr 0.8fr 0.6fr',
                        gap: '0.75rem',
                        alignItems: 'center',
                        padding: '0.75rem 0.5rem',
                        borderBottom: index < orders.length - 1 ? '1px solid #f8fafc' : 'none',
                        fontSize: '0.8125rem'
                      }}
                    >
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <div style={{ fontWeight: 600, color: '#1e293b', marginBottom: '0.125rem' }}>
                          {order.marketId?.slice(0, 25) || 'Unknown Market'}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                          {order.createdAt ? timeAgo(order.createdAt) : '—'}
                        </div>
                      </div>
                      <div>
                        <span style={{
                          display: 'inline-block',
                          padding: '0.25rem 0.5rem',
                          background: order.side === 'BACK' ? '#dcfce7' : '#fee2e2',
                          color: order.side === 'BACK' ? '#15803d' : '#991b1b',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                          fontWeight: 600
                        }}>
                          {sideLabel}
                        </span>
                      </div>
                      <div style={{ fontWeight: 600, color: '#1e293b' }}>
                        {priceDisplay}
                      </div>
                      <div style={{ fontWeight: 600, color: '#1e293b' }}>
                        {amountDisplay}
                      </div>
                      <div>
                        <span style={{
                          display: 'inline-block',
                          padding: '0.25rem 0.5rem',
                          background: statusColor.bg,
                          color: statusColor.text,
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                          fontWeight: 600
                        }}>
                          {order.status}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{
                padding: '2rem',
                textAlign: 'center',
                color: '#94a3b8',
                fontSize: '0.875rem',
                background: '#fafbfc',
                borderRadius: '8px'
              }}>
                <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📭</div>
                No recent activity
              </div>
            )}
          </div>
        </div>

        {/* Watchlist */}
        <div style={{ gridColumn: 'span 4' }}>
          <div style={{
            background: 'white',
            border: '1px solid #e2e8f0',
            borderRadius: '12px',
            padding: '1.25rem'
          }}>
            <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: '#1e293b', margin: 0, marginBottom: '1rem' }}>
              Watchlist
            </h3>

            {watchedMarkets.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                {watchedMarkets.slice(0, 5).map((market: any) => (
                  <div
                    key={market.id}
                    style={{
                      padding: '0.75rem',
                      background: '#fafbfc',
                      border: '1px solid #f1f5f9',
                      borderRadius: '8px'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.5rem' }}>
                      <div style={{ flex: 1, fontSize: '0.8125rem', fontWeight: 600, color: '#1e293b', lineHeight: 1.3 }}>
                        {market.name || market.id.slice(0, 20)}
                      </div>
                      <button
                        onClick={() => handleToggleWatch(market.id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: '0.875rem',
                          padding: 0,
                          marginLeft: '0.5rem'
                        }}
                      >
                        ⭐
                      </button>
                    </div>
                    <div style={{ display: 'flex', gap: '0.375rem', marginBottom: '0.5rem' }}>
                      <span style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 600 }}>
                        YES {formatPercent(market.backPrice)}
                      </span>
                      <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>•</span>
                      <span style={{ fontSize: '0.75rem', color: '#ef4444', fontWeight: 600 }}>
                        NO {formatPercent(market.layPrice)}
                      </span>
                    </div>
                    <Link
                      to={`/markets/${market.id}`}
                      style={{
                        display: 'inline-block',
                        padding: '0.375rem 0.75rem',
                        background: '#667eea',
                        color: 'white',
                        borderRadius: '4px',
                        textDecoration: 'none',
                        fontSize: '0.75rem',
                        fontWeight: 600
                      }}
                    >
                      Trade
                    </Link>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{
                padding: '2rem 1rem',
                textAlign: 'center',
                background: '#fafbfc',
                borderRadius: '8px'
              }}>
                <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⭐</div>
                <p style={{ fontSize: '0.8125rem', color: '#64748b', marginBottom: '0.75rem' }}>
                  No watched markets
                </p>
                <p style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                  Star markets to track them here
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* E) Footer: Quick Actions */}
      <div style={{
        display: 'flex',
        gap: '0.75rem',
        padding: '1rem',
        background: 'white',
        border: '1px solid #e2e8f0',
        borderRadius: '12px'
      }}>
        <Link
          to="/app/wallet"
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            padding: '0.75rem',
            background: '#fafbfc',
            border: '1px solid #f1f5f9',
            borderRadius: '8px',
            textDecoration: 'none',
            color: '#1e293b',
            fontSize: '0.8125rem',
            fontWeight: 600,
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.borderColor = '#667eea'}
          onMouseLeave={(e) => e.currentTarget.style.borderColor = '#f1f5f9'}
        >
          <span>💳</span> Deposit
        </Link>
        <Link
          to="/app/wallet"
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            padding: '0.75rem',
            background: '#fafbfc',
            border: '1px solid #f1f5f9',
            borderRadius: '8px',
            textDecoration: 'none',
            color: '#1e293b',
            fontSize: '0.8125rem',
            fontWeight: 600,
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.borderColor = '#667eea'}
          onMouseLeave={(e) => e.currentTarget.style.borderColor = '#f1f5f9'}
        >
          <span>💸</span> Withdraw
        </Link>
        <Link
          to="/app/orders"
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            padding: '0.75rem',
            background: '#fafbfc',
            border: '1px solid #f1f5f9',
            borderRadius: '8px',
            textDecoration: 'none',
            color: '#1e293b',
            fontSize: '0.8125rem',
            fontWeight: 600,
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.borderColor = '#667eea'}
          onMouseLeave={(e) => e.currentTarget.style.borderColor = '#f1f5f9'}
        >
          <span>📋</span> Orders
        </Link>
        <Link
          to="/app/settings"
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            padding: '0.75rem',
            background: '#fafbfc',
            border: '1px solid #f1f5f9',
            borderRadius: '8px',
            textDecoration: 'none',
            color: '#1e293b',
            fontSize: '0.8125rem',
            fontWeight: 600,
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.borderColor = '#667eea'}
          onMouseLeave={(e) => e.currentTarget.style.borderColor = '#f1f5f9'}
        >
          <span>⚙️</span> Settings
        </Link>
      </div>
    </div>
  );
}
