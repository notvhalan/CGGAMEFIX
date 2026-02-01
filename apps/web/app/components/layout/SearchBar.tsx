import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from '@remix-run/react';
import "~/styles/components/search-bar.css";

interface SearchResult {
  id: string;
  name: string;
  midYes: number;
  status: string;
}

interface SearchBarProps {
  compact?: boolean;
  markets?: any[];
}

export function SearchBar({ compact = false, markets = [] }: SearchBarProps) {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchFocusIndex, setSearchFocusIndex] = useState(-1);
  const searchRef = useRef<HTMLDivElement>(null);

  // Search typeahead (debounced)
  useEffect(() => {
    if (searchQuery.length < 2) {
      setSearchResults([]);
      setSearchOpen(false);
      return;
    }

    const timer = setTimeout(async () => {
      const filteredMarkets = markets
        .filter(m => m.name.toLowerCase().includes(searchQuery.toLowerCase()))
        .slice(0, 10)
        .map(m => ({
          id: m.id,
          name: m.name,
          midYes: 0.5,
          status: m.status || 'OPEN'
        }));
      
      setSearchResults(filteredMarkets);
      setSearchOpen(filteredMarkets.length > 0);
      setSearchFocusIndex(-1);
    }, 150);

    return () => clearTimeout(timer);
  }, [searchQuery, markets]);

  // Close search dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard navigation
  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setSearchOpen(false);
      setSearchQuery('');
      return;
    }
    
    if (!searchOpen || searchResults.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSearchFocusIndex(prev => Math.min(prev + 1, searchResults.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSearchFocusIndex(prev => Math.max(prev - 1, -1));
    } else if (e.key === 'Enter' && searchFocusIndex >= 0) {
      e.preventDefault();
      const selected = searchResults[searchFocusIndex];
      navigate(`/app/markets/${selected.id}`);
      setSearchOpen(false);
      setSearchQuery('');
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/markets?search=${encodeURIComponent(searchQuery)}`);
      setSearchQuery('');
      setSearchOpen(false);
    }
  };

  // Focus search on "/" key
  useEffect(() => {
    function handleGlobalKeyPress(e: KeyboardEvent) {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        const searchInput = document.getElementById('global-search') as HTMLInputElement;
        searchInput?.focus();
      }
    }
    document.addEventListener('keydown', handleGlobalKeyPress);
    return () => document.removeEventListener('keydown', handleGlobalKeyPress);
  }, []);

  return (
    <div ref={searchRef} style={{ flex: 1, maxWidth: '500px', position: 'relative' }}>
      <form onSubmit={handleSearch}>
        <input
          id="global-search"
          type="search"
          placeholder="Search markets... (press / to focus)"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={handleSearchKeyDown}
          style={{
            width: '100%',
            padding: compact ? '0.5rem 0.875rem' : '0.625rem 1rem',
            background: '#0d1117',
            border: '1px solid #30363d',
            borderRadius: '6px',
            fontSize: '0.875rem',
            color: '#c9d1d9',
            outline: 'none',
            transition: 'all 0.2s'
          }}
          onFocus={(e) => {
            if (searchResults.length > 0) setSearchOpen(true);
            e.currentTarget.style.borderColor = '#58a6ff';
            e.currentTarget.style.boxShadow = '0 0 0 3px rgba(88, 166, 255, 0.15)';
          }}
          onBlur={(e) => {
            setTimeout(() => {
              e.currentTarget.style.borderColor = '#30363d';
              e.currentTarget.style.boxShadow = 'none';
            }, 200);
          }}
        />
      </form>

      {searchOpen && searchResults.length > 0 && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 0.5rem)',
          left: 0,
          right: 0,
          background: '#161b22',
          border: '1px solid #30363d',
          borderRadius: '6px',
          boxShadow: '0 8px 24px rgba(1, 4, 9, 0.5)',
          maxHeight: '400px',
          overflowY: 'auto',
          zIndex: 100
        }}>
          {searchResults.map((result, idx) => (
            <Link
              key={result.id}
              to={`/app/markets/${result.id}`}
              onClick={() => {
                setSearchOpen(false);
                setSearchQuery('');
              }}
              style={{
                display: 'block',
                padding: '0.75rem 1rem',
                borderBottom: idx < searchResults.length - 1 ? '1px solid #21262d' : 'none',
                textDecoration: 'none',
                background: idx === searchFocusIndex ? '#21262d' : 'transparent',
                transition: 'background 0.15s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#21262d';
                setSearchFocusIndex(idx);
              }}
              onMouseLeave={(e) => {
                if (searchFocusIndex !== idx) {
                  e.currentTarget.style.background = 'transparent';
                }
              }}
            >
              <div style={{ 
                fontSize: '0.875rem', 
                color: '#c9d1d9',
                fontWeight: 500,
                marginBottom: '0.25rem'
              }}>
                {result.name}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <span style={{ 
                  fontSize: '0.75rem', 
                  color: '#8b949e',
                  textTransform: 'uppercase'
                }}>
                  {result.status}
                </span>
                <span style={{ 
                  fontSize: '0.75rem', 
                  color: result.midYes >= 0.5 ? '#3fb950' : '#f85149',
                  fontWeight: 600
                }}>
                  YES {(result.midYes * 100).toFixed(0)}%
                </span>
              </div>
            </Link>
          ))}
          
          <div style={{
            padding: '0.625rem 1rem',
            fontSize: '0.75rem',
            color: '#8b949e',
            textAlign: 'center',
            borderTop: '1px solid #21262d',
            background: '#0d1117'
          }}>
            Press Enter to search all • ↑↓ to navigate • Esc to close
          </div>
        </div>
      )}
    </div>
  );
}
