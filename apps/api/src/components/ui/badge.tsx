'use client';

import { type HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 font-semibold tracking-[0.06em] uppercase transition-colors',
  {
    variants: {
      variant: {
        // Default = gold cosmic chip (matches Figma "AUSPICIOUS")
        default:
          'bg-surface-3 text-accent border border-[rgba(242,202,80,0.25)]',
        success:
          'bg-success/10 text-success border border-success/25',
        warning:
          'bg-warning/10 text-warning border border-warning/25',
        error:
          'bg-danger/15 text-danger border border-danger/25',
        accent:
          'bg-accent/10 text-accent border border-accent/30',
        outline:
          'border border-border-strong text-text-muted',
        // Legacy aliases — all map to gold cosmic chip
        cosmic:
          'bg-surface-3 text-accent border border-[rgba(242,202,80,0.25)]',
        purple:
          'bg-surface-3 text-accent border border-[rgba(242,202,80,0.25)]',
        cyan:
          'bg-success/12 text-success border border-success/25',
        teal:
          'bg-success/12 text-success border border-success/25',
        gold:
          'bg-surface-3 text-accent border border-[rgba(242,202,80,0.30)] shadow-[0_0_10px_rgba(212,175,55,0.18)]',
        premium:
          'bg-[linear-gradient(135deg,#F2CA50,#B8893F)] text-[#11131A] border border-[rgba(242,202,80,0.45)] shadow-[0_0_12px_rgba(212,175,55,0.40)]',
        red:
          'bg-danger/15 text-danger border border-danger/25',
      },
      size: {
        xs: 'text-[9px] px-1.5 py-[2px] rounded-[4px]',
        sm: 'text-[10px] px-2 py-[3px] rounded-[6px]',
        md: 'text-xs px-2.5 py-1 rounded-[8px]',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'sm',
    },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, size, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant, size }), className)} {...props} />;
}

export { Badge, badgeVariants };
