'use client';

import { type ButtonHTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { ButtonSkeleton } from './skeleton';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap font-semibold tracking-[0.02em] border border-transparent transition-all duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:pointer-events-none disabled:opacity-50 select-none cursor-pointer',
  {
    variants: {
      variant: {
        // Gold cosmic primary
        default:
          'bg-[linear-gradient(135deg,#D4AF37_0%,#B8893F_100%)] text-[#11131A] shadow-[0_0_18px_rgba(212,175,55,0.45),inset_0_1px_0_rgba(255,255,255,0.15)] hover:bg-[linear-gradient(135deg,#F2CA50_0%,#D4AF37_100%)] hover:-translate-y-[1px] hover:shadow-[0_0_14_rgba(242,202,80,0.55),inset_0_1px_0_rgba(255,255,255,0.20)]',
        primary:
          'bg-[linear-gradient(135deg,#D4AF37_0%,#B8893F_100%)] text-[#11131A] shadow-[0_0_18px_rgba(212,175,55,0.45),inset_0_1px_0_rgba(255,255,255,0.15)] hover:bg-[linear-gradient(135deg,#F2CA50_0%,#D4AF37_100%)] hover:-translate-y-[1px] hover:shadow-[0_0_14_rgba(242,202,80,0.55)]',
        // Glass secondary
        secondary:
          'bg-[var(--btn-secondary-bg)] backdrop-blur-md text-text border-border-strong hover:border-accent/60 hover:shadow-[0_0_16px_rgba(212,175,55,0.20)]',
        // Gold outline
        outline:
          'bg-transparent text-accent border-accent/45 hover:bg-accent/10 hover:border-accent hover:shadow-[0_0_14px_rgba(212,175,55,0.25)]',
        // Quiet ghost
        ghost:
          'bg-transparent text-text-2 hover:bg-surface-3 hover:text-text',
        // Saffron accent (warm CTA)
        accent:
          'bg-accent text-[#11131A] shadow-[0_0_16px_rgba(242,202,80,0.40)] hover:bg-primary-ink hover:-translate-y-[1px] hover:shadow-[0_0_24px_rgba(242,202,80,0.60)]',
        // Danger
        destructive:
          'bg-danger-soft text-danger border-danger/35 hover:bg-danger/20',
        // Pure glass (no gold tint)
        glass:
          'bg-[var(--glass-bg)] text-text border-border backdrop-blur-md hover:bg-[var(--glass-3-bg)]',
        // Legacy aliases — all map to primary gold
        neon:
          'bg-[linear-gradient(135deg,#D4AF37_0%,#B8893F_100%)] text-[#11131A] shadow-[0_0_18px_rgba(212,175,55,0.45)] hover:-translate-y-[1px] hover:shadow-[0_0_14_rgba(242,202,80,0.55)]',
        'neon-gold':
          'bg-[linear-gradient(135deg,#F2CA50,#B8893F)] text-[#11131A] shadow-[0_0_18px_rgba(212,175,55,0.50)] hover:opacity-95 hover:-translate-y-[1px] hover:shadow-[0_0_14_rgba(242,202,80,0.60)]',
      },
      size: {
        xs: 'px-2.5 py-1 text-[11px] rounded-full gap-1',
        sm: 'px-3.5 py-1.5 text-xs rounded-full',
        default: 'px-5 py-[9px] text-sm rounded-full',
        lg: 'px-7 py-[12px] text-[15px] rounded-full',
        xl: 'px-10 py-[14px] text-base rounded-full',
        icon: 'h-10 w-10 rounded-full p-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  isLoading?: boolean;
  pulse?: boolean;
}

function Button({
  className,
  variant,
  size,
  isLoading,
  pulse: _pulse,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <motion.button
      className={cn(buttonVariants({ variant, size, className }))}
      disabled={disabled || isLoading}
      whileTap={{ scale: 0.97 }}
      transition={{ duration: 0.1 }}
      {...(props as any)}
    >
      {isLoading ? <ButtonSkeleton width={52} height={13} /> : children}
    </motion.button>
  );
}
Button.displayName = 'Button';

export { Button, buttonVariants };
