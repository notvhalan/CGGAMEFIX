import { Link, useLocation } from '@remix-run/react';

interface NavItemProps {
  to: string;
  icon: string;
  label: string;
  end?: boolean;
  compact?: boolean;
}

export function NavItem({ to, icon, label, end = false, compact = false }: NavItemProps) {
  const location = useLocation();
  const isActive = end 
    ? location.pathname === to
    : location.pathname.startsWith(to);

  if (compact) {
    return (
      <div style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
        <Link
          to={to}
          title={label}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '48px',
            height: '44px',
            borderRadius: '6px',
            textDecoration: 'none',
            color: isActive ? '#58a6ff' : '#8b949e',
            background: isActive ? '#21262d' : 'transparent',
            borderLeft: isActive ? '3px solid #58a6ff' : '3px solid transparent',
            fontSize: '1.5rem',
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => {
            if (!isActive) {
              e.currentTarget.style.background = '#21262d';
              e.currentTarget.style.color = '#c9d1d9';
            }
            const tooltip = e.currentTarget.nextElementSibling as HTMLElement;
            if (tooltip) tooltip.style.opacity = '1';
          }}
          onMouseLeave={(e) => {
            if (!isActive) {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = '#8b949e';
            }
            const tooltip = e.currentTarget.nextElementSibling as HTMLElement;
            if (tooltip) tooltip.style.opacity = '0';
          }}
        >
          {icon}
        </Link>
        
        <div style={{
          position: 'absolute',
          left: 'calc(100% + 0.75rem)',
          top: '50%',
          transform: 'translateY(-50%)',
          background: '#161b22',
          color: '#c9d1d9',
          padding: '0.5rem 0.75rem',
          borderRadius: '6px',
          fontSize: '0.8125rem',
          fontWeight: 500,
          whiteSpace: 'nowrap',
          border: '1px solid #30363d',
          boxShadow: '0 4px 12px rgba(1, 4, 9, 0.5)',
          opacity: 0,
          pointerEvents: 'none',
          transition: 'opacity 0.2s',
          zIndex: 100
        }}>
          {label}
        </div>
      </div>
    );
  }

  return (
    <Link
      to={to}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '0.75rem 1rem',
        borderRadius: '6px',
        textDecoration: 'none',
        color: isActive ? '#58a6ff' : '#8b949e',
        background: isActive ? '#21262d' : 'transparent',
        fontWeight: isActive ? 600 : 500,
        fontSize: '0.9375rem',
        transition: 'all 0.2s'
      }}
      onMouseEnter={(e) => {
        if (!isActive) {
          e.currentTarget.style.background = '#21262d';
          e.currentTarget.style.color = '#c9d1d9';
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.color = '#8b949e';
        }
      }}
    >
      <span style={{ fontSize: '1.25rem' }}>{icon}</span>
      <span>{label}</span>
    </Link>
  );
}

export function MobileNavItem({ to, icon, label }: { to: string; icon: string; label: string }) {
  const location = useLocation();
  const isActive = location.pathname.startsWith(to);

  return (
    <Link
      to={to}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.25rem',
        padding: '0.5rem',
        textDecoration: 'none',
        color: isActive ? '#58a6ff' : '#8b949e',
        fontSize: '0.75rem',
        fontWeight: isActive ? 600 : 500,
        transition: 'color 0.2s'
      }}
    >
      <span style={{ fontSize: '1.5rem' }}>{icon}</span>
      <span>{label}</span>
    </Link>
  );
}
