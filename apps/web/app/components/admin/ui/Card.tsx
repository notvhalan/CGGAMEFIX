import React from 'react';

interface CardProps {
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  noPadding?: boolean;
}

export function Card({ title, subtitle, action, children, className = '', noPadding }: CardProps) {
  return (
    <div className={`bg-admin-surface rounded-xl border border-admin-border ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-admin-border">
          <div>
            {title && <h3 className="text-sm font-semibold text-admin-text">{title}</h3>}
            {subtitle && <p className="text-xs text-admin-text-dim mt-0.5">{subtitle}</p>}
          </div>
          {action && <div className="flex items-center gap-2">{action}</div>}
        </div>
      )}
      <div className={noPadding ? '' : 'p-5'}>{children}</div>
    </div>
  );
}
