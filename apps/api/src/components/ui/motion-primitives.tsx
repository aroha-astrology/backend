'use client';

import { type ReactNode, type HTMLAttributes, useEffect, useRef, useState } from 'react';
import {
  motion,
  AnimatePresence,
  useReducedMotion,
  useInView,
  useMotionValue,
  useSpring,
  useTransform,
  type Variants,
  type HTMLMotionProps,
} from 'framer-motion';
import {
  pageTransition,
  staggerContainer,
  staggerContainerFast,
  staggerItem,
  fadeInUp,
  scrollReveal,
  ease,
} from '@/lib/motion';

// ── MotionPage ─────────────────────────────────────────────
// Wrap each page's root content for enter/exit animation
export function MotionPage({
  children,
  className,
  ...props
}: HTMLMotionProps<'div'> & { children: ReactNode }) {
  const prefersReduced = useReducedMotion();
  return (
    <motion.div
      variants={pageTransition}
      initial={prefersReduced ? false : 'initial'}
      animate="animate"
      exit="exit"
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
}

// ── StaggerList ────────────────────────────────────────────
// Container that staggers its children's entrance
export function StaggerList({
  children,
  className,
  fast = false,
  ...props
}: HTMLMotionProps<'div'> & { children: ReactNode; fast?: boolean }) {
  const prefersReduced = useReducedMotion();
  return (
    <motion.div
      variants={fast ? staggerContainerFast : staggerContainer}
      initial={prefersReduced ? false : 'initial'}
      animate="animate"
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
}

// ── StaggerItem ────────────────────────────────────────────
// Child inside a StaggerList
export function StaggerItem({
  children,
  className,
  ...props
}: HTMLMotionProps<'div'> & { children: ReactNode }) {
  return (
    <motion.div variants={staggerItem} className={className} {...props}>
      {children}
    </motion.div>
  );
}

// ── FadeIn ─────────────────────────────────────────────────
// Simple fade+slide wrapper with configurable delay
export function FadeIn({
  children,
  delay = 0,
  className,
  ...props
}: HTMLMotionProps<'div'> & { children: ReactNode; delay?: number }) {
  const prefersReduced = useReducedMotion();
  return (
    <motion.div
      initial={prefersReduced ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: ease.spring }}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
}

// ── ScrollReveal ───────────────────────────────────────────
// Reveals content when it scrolls into view (once)
export function ScrollReveal({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const prefersReduced = useReducedMotion();
  return (
    <motion.div
      initial={prefersReduced ? false : { opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      viewport={{ once: true, margin: '-50px' }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ── CountUp ────────────────────────────────────────────────
// Animated number counter
export function CountUp({
  value,
  duration = 1,
  className,
}: {
  value: number;
  duration?: number;
  className?: string;
}) {
  const [display, setDisplay] = useState(0);
  const prefersReduced = useReducedMotion();
  const prevRef = useRef(0);

  useEffect(() => {
    if (prefersReduced) {
      setDisplay(value);
      return;
    }
    const start = prevRef.current;
    const diff = value - start;
    if (diff === 0) return;

    const startTime = performance.now();
    let raf: number;

    const step = (now: number) => {
      const elapsed = Math.min((now - startTime) / (duration * 1000), 1);
      // ease-out quad
      const t = 1 - (1 - elapsed) * (1 - elapsed);
      setDisplay(Math.round(start + diff * t));
      if (elapsed < 1) {
        raf = requestAnimationFrame(step);
      } else {
        prevRef.current = value;
      }
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, duration, prefersReduced]);

  return <span className={className}>{display}</span>;
}

// ── Tilt3D ─────────────────────────────────────────────────
// Wrap a card-like element for soft 3D tilt on cursor hover.
// Desktop-only effect; respects reduced-motion (returns plain div).
export function Tilt3D({
  children,
  className,
  max = 8,
}: {
  children: ReactNode;
  className?: string;
  max?: number;
}) {
  const prefersReduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 220, damping: 18 });
  const sy = useSpring(y, { stiffness: 220, damping: 18 });
  const rotateX = useTransform(sy, [-0.5, 0.5], [max, -max]);
  const rotateY = useTransform(sx, [-0.5, 0.5], [-max, max]);

  if (prefersReduced) return <div className={className}>{children}</div>;

  return (
    <motion.div
      ref={ref}
      style={{ rotateX, rotateY, transformStyle: 'preserve-3d', perspective: 1000 }}
      onMouseMove={(e) => {
        const el = ref.current; if (!el) return;
        const r = el.getBoundingClientRect();
        x.set((e.clientX - r.left) / r.width - 0.5);
        y.set((e.clientY - r.top) / r.height - 0.5);
      }}
      onMouseLeave={() => { x.set(0); y.set(0); }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ── FloatY ─────────────────────────────────────────────────
// Gentle infinite vertical drift, for hero orbs / decorative tokens
export function FloatY({
  children,
  className,
  distance = 8,
  duration = 6,
}: {
  children: ReactNode;
  className?: string;
  distance?: number;
  duration?: number;
}) {
  const prefersReduced = useReducedMotion();
  if (prefersReduced) return <div className={className}>{children}</div>;
  return (
    <motion.div
      animate={{ y: [0, -distance, 0] }}
      transition={{ duration, repeat: Infinity, ease: 'easeInOut' }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ── MagneticHover ──────────────────────────────────────────
// Cursor "pulls" the element toward it within a small radius
export function MagneticHover({
  children,
  className,
  strength = 20,
}: {
  children: ReactNode;
  className?: string;
  strength?: number;
}) {
  const prefersReduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 150, damping: 14 });
  const sy = useSpring(y, { stiffness: 150, damping: 14 });

  if (prefersReduced) return <div className={className}>{children}</div>;

  return (
    <motion.div
      ref={ref}
      style={{ x: sx, y: sy }}
      onMouseMove={(e) => {
        const el = ref.current; if (!el) return;
        const r = el.getBoundingClientRect();
        const dx = (e.clientX - (r.left + r.width / 2)) / r.width;
        const dy = (e.clientY - (r.top + r.height / 2)) / r.height;
        x.set(dx * strength); y.set(dy * strength);
      }}
      onMouseLeave={() => { x.set(0); y.set(0); }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
