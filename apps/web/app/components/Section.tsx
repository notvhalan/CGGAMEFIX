import { Link } from '@remix-run/react';
import type { ReactNode } from 'react';

interface SectionProps {
  title: string;
  subtitle?: string;
  action?: {
    label: string;
    to: string;
  };
  children: ReactNode;
}

export function Section({ title, subtitle, action, children }: SectionProps) {
  return (
    <section style={{ marginBottom: '2rem' }}>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '1rem'
      }}>
        <div>
          <h2 style={{ 
            fontSize: '1.5rem', 
            fontWeight: 700, 
            color: '#1e293b',
            margin: 0
          }}>
            {title}
          </h2>
          {subtitle && (
            <p style={{ 
              fontSize: '0.875rem', 
              color: '#64748b',
              margin: '0.25rem 0 0 0'
            }}>
              {subtitle}
            </p>
          )}
        </div>
        
        {action && (
          <Link
            to={action.to}
            style={{
              fontSize: '0.875rem',
              color: '#667eea',
              textDecoration: 'none',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem'
            }}
          >
            {action.label} →
          </Link>
        )}
      </div>
      
      {children}
    </section>
  );
}
