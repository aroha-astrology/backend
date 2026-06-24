'use client';

import { type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

function Input({ className, type, label, error, id, ...props }: InputProps) {
  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={id}
          className="j-eyebrow mb-2 block"
        >
          {label}
        </label>
      )}
      <input
        id={id}
        type={type}
        className={cn(
          'flex w-full rounded-[10px] border border-border-strong bg-[var(--card-bg)] backdrop-blur-[6px] px-3.5 py-3 text-[15px] text-text placeholder:text-text-dim transition-all duration-150 outline-none',
          'focus:border-accent focus:shadow-[0_0_0_3px_rgba(242,202,80,0.18),0_0_14px_rgba(212,175,55,0.15)]',
          'disabled:cursor-not-allowed disabled:opacity-50',
          error && 'border-danger focus:border-danger focus:shadow-[0_0_0_3px_rgba(255,107,122,0.18)]',
          className,
        )}
        {...props}
      />
      {error && <p className="mt-1.5 text-xs text-danger">{error}</p>}
    </div>
  );
}
Input.displayName = 'Input';

export { Input };
