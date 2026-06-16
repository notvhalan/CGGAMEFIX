import React from 'react';

interface KpiCardProps {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  trend?: { value: string; direction: 'up' | 'down' | 'flat' };
  variant?: 'default' | 'success' | 'warning' | 'danger';
  onClick?: () => void;
  subtitle?: string;
}

const variantBorder: Record<string, string> = {
  default: 'border-admin-border hover:border-blue-500/40',
  success: 'border-emerald-500/20 hover:border-emerald-500/40',
  warning: 'border-amber-500/20 hover:border-amber-500/40',
  danger: 'border-red-500/20 hover:border-red-500/40',
};

export function KpiCard({ label, value, icon, trend, variant = 'default', onClick, subtitle }: KpiCardProps) {
  return (
    <div
      onClick={onClick}
      className={`kpi-card bg-admin-surface rounded-xl border p-4 ${variantBorder[variant]} ${onClick ? 'cursor-pointer' : ''}`}
    >
      <div className="flex items-start justify-between mb-2">
        <span className="text-xs font-medium text-admin-text-muted uppercase tracking-wider">{label}</span>
        {icon && <span className="text-admin-text-dim">{icon}</span>}
      </div>
      <div className="flex items-end gap-2">
        <span className="text-2xl font-bold text-admin-text tabular-nums">
          {typeof value === 'number' ? value.toLocaleString() : value}
        </span>
        {trend && (
          <span className={`text-xs font-medium pb-0.5 ${
            trend.direction === 'up' ? 'text-emerald-400' :
            trend.direction === 'down' ? 'text-red-400' : 'text-admin-text-dim'
          }`}>
            {trend.direction === 'up' ? '↑' : trend.direction === 'down' ? '↓' : '→'} {trend.value}
          </span>
        )}
      </div>
      {subtitle && <span className="text-xs text-admin-text-dim mt-1 block">{subtitle}</span>}
    </div>
  );
}
