import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { getMarkets } from "~/lib/api.server";
import { getAuthenticatedUser } from "~/lib/auth.server";
import { MarketCard } from "~/components/MarketCard";
import { useState, useEffect } from "react";
import "~/styles/pages/markets-index.css";

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
  const { markets } = useLoaderData<typeof loader>();
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
    <div className="markets-page">
      <div className="markets-header">
        <h1 className="markets-title">📈 All Markets</h1>
        <p className="markets-subtitle">Browse and bet on trending markets</p>
      </div>

      <div className="markets-search-container">
        <input
          type="search"
          placeholder="Search markets..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="markets-search-input"
        />
      </div>

      {filteredMarkets.length === 0 ? (
        <div className="markets-empty-state">
          <p className="markets-empty-title">
            {searchQuery ? 'No markets found' : 'No markets available'}
          </p>
          <p className="markets-empty-subtitle">
            {searchQuery ? 'Try a different search term' : 'Check back later for new markets'}
          </p>
        </div>
      ) : (
        <div className="markets-grid">
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
    </div>
  );
}
