import React from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  destructive?: boolean;
}

export function Modal({ open, onClose, title, children, footer, destructive }: ModalProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center modal-overlay bg-black/60" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-admin-surface border border-admin-border rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden"
      >
        <div className={`px-5 py-4 border-b ${destructive ? 'border-red-500/30 bg-red-500/5' : 'border-admin-border'}`}>
          <h3 className={`text-lg font-semibold ${destructive ? 'text-red-400' : 'text-admin-text'}`}>{title}</h3>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && (
          <div className="px-5 py-3 border-t border-admin-border flex items-center justify-end gap-3 bg-admin-bg/50">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

// Button helpers

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'success';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
}

const btnVariants: Record<string, string> = {
  primary: 'bg-blue-600 hover:bg-blue-500 text-white border-blue-500/30',
  secondary: 'bg-admin-surface-2 hover:bg-admin-surface-3 text-admin-text border-admin-border',
  danger: 'bg-red-600/80 hover:bg-red-600 text-white border-red-500/30',
  ghost: 'bg-transparent hover:bg-admin-surface-2 text-admin-text-muted border-transparent',
  success: 'bg-emerald-600/80 hover:bg-emerald-600 text-white border-emerald-500/30',
};

const btnSizes: Record<string, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-2.5 text-sm',
};

export function Button({ variant = 'primary', size = 'md', children, className = '', ...props }: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 font-medium rounded-lg border transition-colors disabled:opacity-50 disabled:pointer-events-none ${btnVariants[variant]} ${btnSizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

// Input

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export function Input({ label, className = '', ...props }: InputProps) {
  return (
    <div>
      {label && <label className="block text-xs font-medium text-admin-text-muted mb-1">{label}</label>}
      <input
        className={`w-full bg-admin-surface-2 border border-admin-border rounded-lg px-3 py-2 text-sm text-admin-text placeholder:text-admin-text-dim focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 ${className}`}
        {...props}
      />
    </div>
  );
}

// Select

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: { value: string; label: string }[];
}

export function Select({ label, options, className = '', ...props }: SelectProps) {
  return (
    <div>
      {label && <label className="block text-xs font-medium text-admin-text-muted mb-1">{label}</label>}
      <select
        className={`w-full bg-admin-surface-2 border border-admin-border rounded-lg px-3 py-2 text-sm text-admin-text focus:outline-none focus:border-blue-500/50 ${className}`}
        {...props}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

// Slider with label

interface SliderProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  unit?: string;
}

export function Slider({ label, value, onChange, min, max, step = 1, unit = '' }: SliderProps) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-xs font-medium text-admin-text-muted">{label}</label>
        <span className="text-xs font-mono text-admin-text">{value}{unit}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full admin-slider"
      />
    </div>
  );
}
