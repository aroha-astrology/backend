'use client';

import { type SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: { value: string; label: string }[];
  placeholder?: string;
}

function Select({ className, label, error, options, placeholder, id, ...props }: SelectProps) {
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={id} className="j-eyebrow mb-2 block">
          {label}
        </label>
      )}
      <div className="relative">
        <select
          className={cn(
            'flex w-full appearance-none rounded-[10px] border border-border-strong bg-[var(--card-bg)] backdrop-blur-[6px]',
            'px-3.5 py-3 text-[15px] text-text cursor-pointer',
            'transition-all duration-150 outline-none',
            'focus:border-accent focus:shadow-[0_0_0_3px_rgba(242,202,80,0.18),0_0_14px_rgba(212,175,55,0.15)]',
            'disabled:cursor-not-allowed disabled:opacity-50',
            error && 'border-danger focus:border-danger focus:shadow-[0_0_0_3px_rgba(255,107,122,0.18)]',
            className,
          )}
          id={id}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value} className="bg-bg text-text">
              {opt.label}
            </option>
          ))}
        </select>
        <div className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-accent">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>
      {error && <p className="mt-1.5 text-xs text-danger">{error}</p>}
    </div>
  );
}
Select.displayName = 'Select';

export { Select };
