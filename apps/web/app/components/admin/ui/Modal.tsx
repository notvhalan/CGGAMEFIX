import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  destructive?: boolean;
}

export function Modal({ open, onClose, title, children, footer, destructive }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const dialog = dialogRef.current;
    const focusable = dialog?.querySelector<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    (focusable ?? dialog)?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== 'Tab' || !dialog) return;

      const items = Array.from(dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ));
      if (items.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center modal-overlay bg-black/60"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="bg-admin-surface border border-admin-border rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden"
      >
        <div className={`px-5 py-4 border-b flex items-center justify-between gap-4 ${destructive ? 'border-red-500/30 bg-red-500/5' : 'border-admin-border'}`}>
          <h3 id={titleId} className={`text-lg font-semibold ${destructive ? 'text-red-400' : 'text-admin-text'}`}>{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-admin-text-dim hover:bg-admin-surface-2 hover:text-admin-text focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
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
