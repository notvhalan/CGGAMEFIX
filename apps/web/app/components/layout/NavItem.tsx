import { Link, useLocation } from '@remix-run/react';
import { type ComponentType, type SVGProps } from 'react';

interface NavItemProps {
  to: string;
  icon: ComponentType<SVGProps<SVGElement>>;
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
    const IconComponent = icon;
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
          <IconComponent size={20} style={{ opacity: isActive ? 1 : 0.85 }} />
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

  const IconComponent = icon;
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
      <IconComponent size={18} style={{ opacity: isActive ? 1 : 0.85 }} />
      <span>{label}</span>
    </Link>
  );
}

export function MobileNavItem({ to, icon, label }: { to: string; icon: ComponentType<SVGProps<SVGElement>>; label: string }) {
  const location = useLocation();
  const isActive = location.pathname.startsWith(to);
  const IconComponent = icon;

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
      <IconComponent size={24} style={{ opacity: isActive ? 1 : 0.85 }} />
      <span>{label}</span>
    </Link>
  );
}
