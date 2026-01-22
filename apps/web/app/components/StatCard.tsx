import { Link } from '@remix-run/react';

interface StatCardProps {
  title: string;
  value: string | number;
  icon?: string;
  subtitle?: string;
  trend?: { value: number; isPositive: boolean };
  linkTo?: string;
  linkText?: string;
}

export function StatCard({ title, value, icon, subtitle, trend, linkTo, linkText }: StatCardProps) {
  return (
    <div style={{
      background: 'linear-gradient(135deg, #ffffff 0%, #fafbfc 100%)',
      border: '1px solid #e2e8f0',
      borderRadius: '16px',
      padding: '1.75rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.875rem',
      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.02)',
      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      position: 'relative',
      overflow: 'hidden'
    }}
    onMouseEnter={(e) => {
      e.currentTarget.style.boxShadow = '0 12px 32px rgba(0, 0, 0, 0.08), 0 4px 8px rgba(0, 0, 0, 0.04)';
      e.currentTarget.style.transform = 'translateY(-2px)';
      e.currentTarget.style.borderColor = '#cbd5e1';
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.02)';
      e.currentTarget.style.transform = 'translateY(0)';
      e.currentTarget.style.borderColor = '#e2e8f0';
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '0.875rem', color: '#64748b', fontWeight: 600, letterSpacing: '0.025em' }}>{title}</span>
        {icon && <span style={{ fontSize: '1.5rem', filter: 'grayscale(0.2)' }}>{icon}</span>}
      </div>
      
      <div style={{ fontSize: '2rem', fontWeight: 800, color: '#1e293b', letterSpacing: '-0.02em' }}>
        {value}
      </div>
      
      {subtitle && (
        <div style={{ fontSize: '0.875rem', color: '#64748b', lineHeight: 1.5 }}>
          {subtitle}
        </div>
      )}
      
      {trend && (
        <div style={{ 
          fontSize: '0.875rem',
          fontWeight: 600,
          color: trend.isPositive ? '#10b981' : '#ef4444',
          display: 'flex',
          alignItems: 'center',
          gap: '0.35rem',
          background: trend.isPositive ? '#f0fdf4' : '#fef2f2',
          padding: '0.375rem 0.75rem',
          borderRadius: '8px',
          width: 'fit-content'
        }}>
          {trend.isPositive ? '↑' : '↓'} {Math.abs(trend.value)}%
        </div>
      )}
      
      {linkTo && linkText && (
        <Link 
          to={linkTo}
          style={{
            fontSize: '0.875rem',
            color: '#667eea',
            textDecoration: 'none',
            fontWeight: 600,
            marginTop: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: '0.375rem',
            transition: 'color 0.2s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.color = '#5568d3'}
          onMouseLeave={(e) => e.currentTarget.style.color = '#667eea'}
        >
          {linkText} →
        </Link>
      )}
    </div>
  );
}
