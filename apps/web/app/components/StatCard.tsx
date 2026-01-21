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
      background: 'white',
      border: '1px solid #e2e8f0',
      borderRadius: '8px',
      padding: '1.5rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.75rem'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '0.875rem', color: '#64748b', fontWeight: 500 }}>{title}</span>
        {icon && <span style={{ fontSize: '1.25rem' }}>{icon}</span>}
      </div>
      
      <div style={{ fontSize: '1.875rem', fontWeight: 700, color: '#1e293b' }}>
        {value}
      </div>
      
      {subtitle && (
        <div style={{ fontSize: '0.875rem', color: '#64748b' }}>
          {subtitle}
        </div>
      )}
      
      {trend && (
        <div style={{ 
          fontSize: '0.875rem',
          color: trend.isPositive ? '#10b981' : '#ef4444',
          display: 'flex',
          alignItems: 'center',
          gap: '0.25rem'
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
            fontWeight: 500,
            marginTop: 'auto'
          }}
        >
          {linkText} →
        </Link>
      )}
    </div>
  );
}
