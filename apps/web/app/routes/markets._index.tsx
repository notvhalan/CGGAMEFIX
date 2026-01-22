import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
import { getMarkets } from "~/lib/api.server";
import { getAuthenticatedUser } from "~/lib/auth.server";
import { MarketCard } from "~/components/MarketCard";
import { useState, useEffect } from "react";

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await getAuthenticatedUser(request);
  
  try {
    const data = await getMarkets();
    return json({ markets: data.markets || [], user });
  } catch (error) {
    console.error('Failed to load markets:', error);
    return json({ markets: [], user });
  }
}

export default function MarketsIndex() {
  const { markets, user } = useLoaderData<typeof loader>();
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

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

  const filteredMarkets = markets.filter((market: any) => 
    searchQuery === '' || 
    market.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    market.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      {/* Navigation Bar */}
      <nav style={{ 
        padding: '1rem 2rem', 
        background: 'white', 
        borderBottom: '1px solid #e2e8f0',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        position: 'sticky',
        top: 0,
        zIndex: 50
      }}>
        <Link to={user ? "/app" : "/"} style={{ color: '#667eea', fontSize: '1.5rem', fontWeight: 700, textDecoration: 'none' }}>
          🎮 GameFix
        </Link>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          {user ? (
            <>
              <Link to="/app" style={{ color: '#4a5568', textDecoration: 'none', fontWeight: 500 }}>Dashboard</Link>
              <Link to="/app/wallet" style={{ color: '#4a5568', textDecoration: 'none', fontWeight: 500 }}>Wallet</Link>
              <Link to="/app/orders" style={{ color: '#4a5568', textDecoration: 'none', fontWeight: 500 }}>Orders</Link>
              <Link to="/app/settings" style={{ 
                padding: '0.5rem 1rem', 
                background: '#667eea', 
                color: 'white', 
                borderRadius: '8px',
                textDecoration: 'none',
                fontWeight: 600,
                fontSize: '0.875rem'
              }}>
                {user.name || user.email.split('@')[0]} ⚙️
              </Link>
            </>
          ) : (
            <>
              <Link to="/how-it-works" style={{ color: '#4a5568', textDecoration: 'none' }}>How It Works</Link>
              <Link to="/fees" style={{ color: '#4a5568', textDecoration: 'none' }}>Fees</Link>
              <Link to="/auth/login" style={{ 
                padding: '0.5rem 1rem', 
                background: '#667eea', 
                color: 'white', 
                borderRadius: '8px',
                textDecoration: 'none',
                fontWeight: 600
              }}>
                Log In
              </Link>
            </>
          )}
        </div>
      </nav>

      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem' }}>
        {/* Header */}
        <div style={{ marginBottom: '2rem' }}>
          <h1 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '0.5rem', color: '#1e293b' }}>
            All Markets
          </h1>
          <p style={{ color: '#64748b', fontSize: '1rem' }}>
            Browse and bet on trending markets
          </p>
        </div>

        {/* Search Bar */}
        <div style={{ marginBottom: '2rem' }}>
          <input
            type="search"
            placeholder="Search markets..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              maxWidth: '500px',
              padding: '0.75rem 1rem',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              fontSize: '1rem',
              outline: 'none',
              transition: 'all 0.2s'
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = '#667eea';
              e.currentTarget.style.boxShadow = '0 0 0 3px rgba(102, 126, 234, 0.1)';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = '#e2e8f0';
              e.currentTarget.style.boxShadow = 'none';
            }}
          />
        </div>

        {/* Markets Grid */}
        {filteredMarkets.length === 0 ? (
          <div style={{ 
            padding: '3rem', 
            textAlign: 'center', 
            background: 'white', 
            borderRadius: '12px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }}>
            <p style={{ fontSize: '1.25rem', color: '#4a5568', marginBottom: '0.5rem' }}>
              {searchQuery ? 'No markets found' : 'No markets available'}
            </p>
            <p style={{ color: '#a0aec0' }}>
              {searchQuery ? 'Try a different search term' : 'Check back later for new markets'}
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '1.5rem', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))' }}>
            {filteredMarkets.map((market: any) => (
              <MarketCard
                key={market.id}
                marketId={market.id}
                title={market.name}
                description={market.description || ''}
                status={market.status || 'ACTIVE'}
                type={market.type || 'BINARY'}
                isWatched={watchlist.includes(market.id)}
                onToggleWatch={handleToggleWatch}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
