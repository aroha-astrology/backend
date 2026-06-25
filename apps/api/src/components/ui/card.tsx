'use client';

import { type HTMLAttributes, useRef } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { cn } from '@/lib/utils';

const cardVariants = cva(
  'rounded-[12px] border border-border p-6 transition-all duration-300 ease-out backdrop-blur-[8px]',
  {
    variants: {
      glass: {
        none: 'bg-[var(--card-bg)]',
        'glass-1': 'bg-[var(--card-bg)]',
        'glass-2': 'bg-[var(--glass-bg)]',
        'glass-3': 'bg-[var(--glass-3-bg)] backdrop-blur-[12px]',
      },
      hover: {
        none: '',
        glow: 'hover:-translate-y-[2px] hover:border-[rgba(242,202,80,0.35)] hover:shadow-[0_0_25px_rgba(212,175,55,0.35)]',
        lift: 'hover:-translate-y-[3px] hover:shadow-[0_18px_50px_rgba(0,0,0,0.55),0_0_14_rgba(212,175,55,0.30)]',
      },
      /**
       * Visual hierarchy. Pick exactly one per screen for `primary` — the
       * single card the user should act on first. `content` is the default
       * for informational cards; `quiet` is for supplementary chips that
       * shouldn't compete for attention.
       */
      tone: {
        primary:
          'border-[rgba(242,202,80,0.45)] shadow-[0_0_22px_rgba(212,175,55,0.28),0_8px_24px_rgba(0,0,0,0.40)]',
        content: '',
        quiet:
          'border-transparent bg-[var(--surface-2)] shadow-none backdrop-blur-0',
      },
    },
    defaultVariants: {
      glass: 'none',
      hover: 'none',
      tone: 'content',
    },
  },
);

export interface CardProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {
  /** Enable a soft 3D tilt on cursor hover (desktop only). */
  tilt3d?: boolean;
}

function Card({ className, glass, hover, tone, tilt3d, children, ...props }: CardProps) {
  if (!tilt3d) {
    return <div className={cn(cardVariants({ glass, hover, tone, className }))} {...props}>{children}</div>;
  }
  return <Tilt3DCard className={cn(cardVariants({ glass, hover, tone, className }))} {...props}>{children}</Tilt3DCard>;
}
Card.displayName = 'Card';

function Tilt3DCard({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 200, damping: 18 });
  const sy = useSpring(y, { stiffness: 200, damping: 18 });
  const rotateX = useTransform(sy, [-0.5, 0.5], [6, -6]);
  const rotateY = useTransform(sx, [-0.5, 0.5], [-6, 6]);

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    x.set((e.clientX - r.left) / r.width - 0.5);
    y.set((e.clientY - r.top) / r.height - 0.5);
  };
  const onLeave = () => { x.set(0); y.set(0); };

  return (
    <motion.div
      ref={ref}
      style={{ rotateX, rotateY, transformStyle: 'preserve-3d', perspective: 1000 }}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      className={className}
      {...(props as any)}
    >
      {children}
    </motion.div>
  );
}

function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-1 pb-4', className)} {...props} />;
}
CardHeader.displayName = 'CardHeader';

function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn('j-h1', className)}
      {...props}
    />
  );
}
CardTitle.displayName = 'CardTitle';

function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn('j-body', className)} {...props} />
  );
}
CardDescription.displayName = 'CardDescription';

function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('', className)} {...props} />;
}
CardContent.displayName = 'CardContent';

function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex items-center pt-4', className)} {...props} />;
}
CardFooter.displayName = 'CardFooter';

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, cardVariants };
