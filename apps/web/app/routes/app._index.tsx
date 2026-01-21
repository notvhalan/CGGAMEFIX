import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
import { getWallet, getMarkets, getMyOrders } from "~/lib/api.server";
import { StatCard } from "~/components/StatCard";
import { MarketCard } from "~/components/MarketCard";
import { Section } from "~/components/Section";
import { useState, useEffect } from "react";

export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const [walletResponse, marketsResponse, ordersResponse] = await Promise.allSettled([
      getWallet(request),
      getMarkets(),
      getMyOrders(10)
    ]);

    const wallet = walletResponse.status === 'fulfilled' ? walletResponse.value : null;
    const markets = marketsResponse.status === 'fulfilled' ? marketsResponse.value?.markets || [] : [];
    const orders = ordersResponse.status === 'fulfilled' ? ordersResponse.value?.orders || [] : [];

    return json({ 
      wallet, 
      markets: markets.slice(0, 6), // Top 6 trending
      orders: orders.slice(0, 5), // Recent 5 orders
      error: null 
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
  const { wallet, markets, orders } = useLoaderData<typeof loader>();
  const [watchlist, setWatchlist] = useState<string[]>([]);

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
  const activePositions = 0; // TODO: Get from positions API when available

  return (
    <div>
      {/* Page Header */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 700, color: '#1e293b', marginBottom: '0.5rem' }}>
          Dashboard
        </h1>
        <p style={{ color: '#64748b', fontSize: '1rem' }}>
          Welcome back! Here's your trading overview.
        </p>
      </div>

      {/* Quick Stats */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', 
        gap: '1.25rem', 
        marginBottom: '2.5rem' 
      }}>
        <StatCard
          title="Available Balance"
          value={wallet ? `$${wallet.balance.toFixed(2)}` : '$0.00'}
          icon="💰"
          subtitle={wallet ? wallet.currency : 'USD'}
          linkTo="/app/wallet"
          linkText="Manage wallet"
        />
        <StatCard
          title="Reserved Balance"
          value={wallet ? `$${wallet.lockedBalance.toFixed(2)}` : '$0.00'}
          icon="🔒"
          subtitle="In active orders"
        />
        <StatCard
          title="Open Orders"
          value={openOrders.length}
          icon="📋"
          linkTo="/app/orders"
          linkText="View all orders"
        />
        <StatCard
          title="Active Positions"
          value={activePositions}
          icon="📊"
          linkTo="/app/positions"
          linkText="View positions"
        />
      </div>

      {/* Watchlist */}
      {watchlist.length > 0 && (
        <Section 
          title="Watchlist" 
          subtitle="Your favorite markets"
          action={{ label: "Manage", to: "/markets" }}
        >
          {watchedMarkets.length > 0 ? (
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', 
              gap: '1.25rem' 
            }}>
              {watchedMarkets.map((market: any) => (
                <MarketCard
                  key={market.id}
                  marketId={market.id}
                  title={market.name || market.id}
                  description={market.description}
                  backPrice={market.backPrice}
                  layPrice={market.layPrice}
                  volume={market.volume}
                  isWatched={true}
                  onToggleWatch={handleToggleWatch}
                />
              ))}
            </div>
          ) : (
            <div style={{
              background: 'white',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              padding: '2rem',
              textAlign: 'center',
              color: '#94a3b8'
            }}>
              <p>No watched markets available. Browse markets to add them to your watchlist.</p>
              <Link
                to="/markets"
                style={{
                  display: 'inline-block',
                  marginTop: '1rem',
                  padding: '0.625rem 1.25rem',
                  background: '#667eea',
                  color: 'white',
                  borderRadius: '8px',
                  textDecoration: 'none',
                  fontWeight: 600,
                  fontSize: '0.875rem'
                }}
              >
                Browse Markets
              </Link>
            </div>
          )}
        </Section>
      )}

      {/* Trending Markets */}
      <Section 
        title="Trending Markets" 
        subtitle="Popular markets right now"
        action={{ label: "View all markets", to: "/markets" }}
      >
        {markets.length > 0 ? (
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', 
            gap: '1.25rem' 
          }}>
            {markets.map((market: any) => (
              <MarketCard
                key={market.id}
                marketId={market.id}
                title={market.name || market.id}
                description={market.description}
                backPrice={market.backPrice}
                layPrice={market.layPrice}
                volume={market.volume}
                isWatched={watchlist.includes(market.id)}
                onToggleWatch={handleToggleWatch}
              />
            ))}
          </div>
        ) : (
          <div style={{
            background: 'white',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            padding: '3rem',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📈</div>
            <p style={{ color: '#64748b', fontSize: '1rem', marginBottom: '0.5rem' }}>
              No markets available
            </p>
            <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>
              Markets will appear here when they become available
            </p>
          </div>
        )}
      </Section>

      {/* Recent Activity */}
      <Section 
        title="Recent Activity" 
        subtitle="Your latest orders and trades"
        action={{ label: "View all orders", to: "/app/orders" }}
      >
        {orders.length > 0 ? (
          <div style={{
            background: 'white',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            overflow: 'hidden'
          }}>
            {orders.map((order: any, index: number) => (
              <div
                key={order.id || index}
                style={{
                  padding: '1.25rem 1.5rem',
                  borderBottom: index < orders.length - 1 ? '1px solid #e2e8f0' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem'
                }}
              >
                <div style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '8px',
                  background: order.status === 'FILLED' ? '#dcfce7' : 
                              order.status === 'CANCELLED' ? '#fee2e2' : '#dbeafe',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.25rem'
                }}>
                  {order.status === 'FILLED' ? '✅' : 
                   order.status === 'CANCELLED' ? '❌' : '📝'}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, color: '#1e293b', marginBottom: '0.25rem' }}>
                    {order.side} {order.stake} @ {order.odds}
                  </div>
                  <div style={{ fontSize: '0.875rem', color: '#64748b' }}>
                    {order.marketId} • {order.status}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ 
                    fontSize: '0.875rem', 
                    fontWeight: 600,
                    color: order.side === 'BACK' ? '#10b981' : '#ef4444'
                  }}>
                    {order.side === 'BACK' ? '+' : '-'}${(order.stake * (order.odds - 1)).toFixed(2)}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.25rem' }}>
                    {new Date(order.createdAt || Date.now()).toLocaleDateString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{
            background: 'white',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            padding: '3rem',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📭</div>
            <p style={{ color: '#64748b', fontSize: '1rem', marginBottom: '0.5rem' }}>
              No recent activity
            </p>
            <p style={{ color: '#94a3b8', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
              Start trading by browsing available markets
            </p>
            <Link
              to="/markets"
              style={{
                display: 'inline-block',
                padding: '0.75rem 1.5rem',
                background: '#667eea',
                color: 'white',
                borderRadius: '8px',
                textDecoration: 'none',
                fontWeight: 600,
                fontSize: '0.9375rem',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#5568d3';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#667eea';
              }}
            >
              Browse Markets
            </Link>
          </div>
        )}
      </Section>

      {/* Quick Actions */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
        gap: '1rem',
        marginTop: '2.5rem'
      }}>
        <Link
          to="/app/wallet"
          style={{
            display: 'block',
            padding: '1.5rem',
            background: 'white',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            textDecoration: 'none',
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = '#667eea';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = '#e2e8f0';
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          <div style={{ fontSize: '1.5rem', marginBottom: '0.75rem' }}>💳</div>
          <div style={{ fontWeight: 600, color: '#1e293b', marginBottom: '0.25rem' }}>
            Deposit Funds
          </div>
          <div style={{ fontSize: '0.875rem', color: '#64748b' }}>
            Add money to your wallet
          </div>
        </Link>

        <Link
          to="/markets"
          style={{
            display: 'block',
            padding: '1.5rem',
            background: 'white',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            textDecoration: 'none',
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = '#667eea';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = '#e2e8f0';
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          <div style={{ fontSize: '1.5rem', marginBottom: '0.75rem' }}>🎯</div>
          <div style={{ fontWeight: 600, color: '#1e293b', marginBottom: '0.25rem' }}>
            Place a Bet
          </div>
          <div style={{ fontSize: '0.875rem', color: '#64748b' }}>
            Browse and bet on markets
          </div>
        </Link>

        <Link
          to="/app/orders"
          style={{
            display: 'block',
            padding: '1.5rem',
            background: 'white',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            textDecoration: 'none',
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = '#667eea';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = '#e2e8f0';
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          <div style={{ fontSize: '1.5rem', marginBottom: '0.75rem' }}>📊</div>
          <div style={{ fontWeight: 600, color: '#1e293b', marginBottom: '0.25rem' }}>
            View Orders
          </div>
          <div style={{ fontSize: '0.875rem', color: '#64748b' }}>
            Manage your active orders
          </div>
        </Link>

        <Link
          to="/app/settings"
          style={{
            display: 'block',
            padding: '1.5rem',
            background: 'white',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            textDecoration: 'none',
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = '#667eea';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = '#e2e8f0';
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          <div style={{ fontSize: '1.5rem', marginBottom: '0.75rem' }}>⚙️</div>
          <div style={{ fontWeight: 600, color: '#1e293b', marginBottom: '0.25rem' }}>
            Settings
          </div>
          <div style={{ fontSize: '0.875rem', color: '#64748b' }}>
            Customize your preferences
          </div>
        </Link>
      </div>
    </div>
  );
}
