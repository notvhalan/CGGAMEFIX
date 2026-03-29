import React from 'react';

type BadgeVariant = 'green' | 'amber' | 'red' | 'blue' | 'gray' | 'cyan' | 'purple';

const variantClasses: Record<BadgeVariant, string> = {
  green: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  amber: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
  red: 'bg-red-500/15 text-red-400 border-red-500/20',
  blue: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  gray: 'bg-slate-500/15 text-slate-400 border-slate-500/20',
  cyan: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/20',
  purple: 'bg-purple-500/15 text-purple-400 border-purple-500/20',
};

interface BadgeProps {
  variant: BadgeVariant;
  children: React.ReactNode;
  dot?: boolean;
  pulseDot?: boolean;
  className?: string;
}

export function Badge({ variant, children, dot, pulseDot, className = '' }: BadgeProps) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded-full border ${variantClasses[variant]} ${className}`}>
      {dot && (
        <span className={`w-1.5 h-1.5 rounded-full bg-current ${pulseDot ? 'status-dot-pulse' : ''}`} />
      )}
      {children}
    </span>
  );
}

// Convenience typed status badges
export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { variant: BadgeVariant; label: string; dot?: boolean; pulseDot?: boolean }> = {
    active: { variant: 'green', label: 'Active', dot: true, pulseDot: true },
    healthy: { variant: 'green', label: 'Healthy', dot: true, pulseDot: true },
    pending: { variant: 'amber', label: 'Pending', dot: true },
    resolved: { variant: 'blue', label: 'Resolved' },
    voided: { variant: 'gray', label: 'Voided' },
    suspended: { variant: 'red', label: 'Suspended', dot: true },
    failed: { variant: 'red', label: 'Failed', dot: true },
    degraded: { variant: 'amber', label: 'Degraded', dot: true, pulseDot: true },
    running: { variant: 'green', label: 'Running', dot: true, pulseDot: true },
    stopped: { variant: 'gray', label: 'Stopped' },
    error: { variant: 'red', label: 'Error', dot: true },
    connected: { variant: 'green', label: 'Connected', dot: true },
    disconnected: { variant: 'red', label: 'Disconnected' },
    idle: { variant: 'amber', label: 'Idle', dot: true },
    open: { variant: 'green', label: 'Open' },
    filled: { variant: 'blue', label: 'Filled' },
    partial: { variant: 'amber', label: 'Partial' },
    cancelled: { variant: 'gray', label: 'Cancelled' },
    completed: { variant: 'green', label: 'Completed' },
    processing: { variant: 'cyan', label: 'Processing', dot: true, pulseDot: true },
    retrying: { variant: 'amber', label: 'Retrying', dot: true, pulseDot: true },
    awaiting: { variant: 'amber', label: 'Awaiting' },
    success: { variant: 'green', label: 'Success' },
    high: { variant: 'green', label: 'High' },
    medium: { variant: 'amber', label: 'Medium' },
    low: { variant: 'red', label: 'Low' },
    none: { variant: 'gray', label: 'None' },
    human: { variant: 'blue', label: 'Human' },
    bot: { variant: 'cyan', label: 'Bot' },
    admin: { variant: 'purple', label: 'Admin' },
  };
  const s = status.toLowerCase();
  const config = map[s] || { variant: 'gray' as BadgeVariant, label: status };
  return <Badge variant={config.variant} dot={config.dot} pulseDot={config.pulseDot}>{config.label}</Badge>;
}
