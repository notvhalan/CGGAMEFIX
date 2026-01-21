import { Link, useLocation } from '@remix-run/react';
import type { ReactNode } from 'react';

interface NavLinkProps {
  to: string;
  icon?: string;
  children: ReactNode;
  end?: boolean;
}

export function NavLink({ to, icon, children, end = false }: NavLinkProps) {
  const location = useLocation();
  const isActive = end 
    ? location.pathname === to
    : location.pathname.startsWith(to);

  return (
    <Link
      to={to}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '0.75rem 1rem',
        borderRadius: '8px',
        textDecoration: 'none',
        color: isActive ? '#667eea' : '#64748b',
        background: isActive ? '#f1f5f9' : 'transparent',
        fontWeight: isActive ? 600 : 500,
        fontSize: '0.9375rem',
        transition: 'all 0.2s'
      }}
      onMouseEnter={(e) => {
        if (!isActive) {
          e.currentTarget.style.background = '#f8fafc';
          e.currentTarget.style.color = '#1e293b';
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.color = '#64748b';
        }
      }}
    >
      {icon && <span style={{ fontSize: '1.25rem' }}>{icon}</span>}
      <span>{children}</span>
    </Link>
  );
}
