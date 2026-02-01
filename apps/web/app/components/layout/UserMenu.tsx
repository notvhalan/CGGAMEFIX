import { useState } from 'react';
import { Link, Form } from '@remix-run/react';
import "~/styles/components/user-menu.css";

interface UserMenuProps {
  user: {
    name?: string | null;
    email: string;
    avatarUrl?: string | null;
  };
  compact?: boolean;
}

export function UserMenu({ user, compact = false }: UserMenuProps) {
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const avatarSize = compact ? 24 : 28;

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setUserMenuOpen(!userMenuOpen)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          background: 'none',
          border: '1px solid #30363d',
          borderRadius: '6px',
          padding: '0.375rem 0.625rem',
          cursor: 'pointer',
          transition: 'all 0.2s'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = '#8b949e';
          e.currentTarget.style.background = '#21262d';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = '#30363d';
          e.currentTarget.style.background = 'none';
        }}
      >
        {user.avatarUrl ? (
          <img 
            src={user.avatarUrl} 
            alt={user.name || user.email}
            style={{ 
              width: `${avatarSize}px`,
              height: `${avatarSize}px`,
              borderRadius: '50%',
              objectFit: 'cover'
            }}
          />
        ) : (
          <div style={{ 
            width: `${avatarSize}px`,
            height: `${avatarSize}px`,
            borderRadius: '50%',
            background: '#58a6ff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontWeight: 600,
            fontSize: '0.75rem'
          }}>
            {user.name?.[0]?.toUpperCase() || user.email[0]?.toUpperCase()}
          </div>
        )}
        <span style={{ fontSize: '0.75rem', color: '#8b949e' }}>▾</span>
      </button>

      {userMenuOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 0.5rem)',
            right: 0,
            background: '#161b22',
            border: '1px solid #30363d',
            borderRadius: '6px',
            boxShadow: '0 8px 24px rgba(1, 4, 9, 0.5)',
            minWidth: '200px',
            padding: '0.5rem',
            zIndex: 100
          }}
          onClick={() => setUserMenuOpen(false)}
        >
          <div style={{ 
            padding: '0.75rem 1rem', 
            borderBottom: '1px solid #21262d', 
            marginBottom: '0.5rem' 
          }}>
            <div style={{ 
              fontWeight: 600, 
              fontSize: '0.875rem', 
              color: '#c9d1d9' 
            }}>
              {user.name || 'User'}
            </div>
            <div style={{ 
              fontSize: '0.75rem', 
              color: '#8b949e', 
              marginTop: '0.25rem' 
            }}>
              {user.email}
            </div>
          </div>
          
          <Link
            to="/app/settings"
            style={{
              display: 'block',
              padding: '0.625rem 1rem',
              color: '#8b949e',
              textDecoration: 'none',
              fontSize: '0.875rem',
              borderRadius: '6px',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#21262d';
              e.currentTarget.style.color = '#c9d1d9';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = '#8b949e';
            }}
          >
            ⚙️ Settings
          </Link>

          <Form method="post" action="/auth/logout">
            <button
              type="submit"
              style={{
                width: '100%',
                padding: '0.625rem 1rem',
                background: 'transparent',
                color: '#f85149',
                border: 'none',
                borderRadius: '6px',
                fontSize: '0.875rem',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = '#1c1b1f'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              🚪 Log Out
            </button>
          </Form>
        </div>
      )}
    </div>
  );
}
