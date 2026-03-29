import React from 'react';

interface MiniChartProps {
  data: { time: string; count: number }[];
  color?: string;
  height?: number;
  label?: string;
  lastUpdated?: string;
}

export function MiniChart({ data, color = '#3b82f6', height = 120, label, lastUpdated }: MiniChartProps) {
  if (data.length === 0) return null;
  const max = Math.max(...data.map((d) => d.count));
  const min = Math.min(...data.map((d) => d.count));
  const range = max - min || 1;
  const w = 100;
  const h = height;
  const padding = 4;

  const points = data.map((d, i) => {
    const x = padding + (i / (data.length - 1)) * (w - padding * 2);
    const y = h - padding - ((d.count - min) / range) * (h - padding * 2);
    return `${x},${y}`;
  }).join(' ');

  const areaPoints = `${padding},${h - padding} ${points} ${w - padding},${h - padding}`;

  return (
    <div>
      {(label || lastUpdated) && (
        <div className="flex items-center justify-between mb-2">
          {label && <span className="text-xs font-medium text-admin-text-muted">{label}</span>}
          {lastUpdated && <span className="text-[10px] text-admin-text-dim">{lastUpdated}</span>}
        </div>
      )}
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full chart-placeholder rounded-lg" style={{ height }}>
        <defs>
          <linearGradient id={`grad-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={areaPoints} fill={`url(#grad-${color.replace('#', '')})`} />
        <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        {data.length > 0 && (() => {
          const lastD = data[data.length - 1];
          const lx = w - padding;
          const ly = h - padding - ((lastD.count - min) / range) * (h - padding * 2);
          return <circle cx={lx} cy={ly} r="2.5" fill={color} />;
        })()}
      </svg>
      <div className="flex justify-between mt-1 text-[10px] text-admin-text-dim">
        <span>{data[0]?.time}</span>
        <span>{data[data.length - 1]?.time}</span>
      </div>
    </div>
  );
}
