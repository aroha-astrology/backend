import type { Variants, Transition } from 'framer-motion';

// ── Easing curves ──────────────────────────────────────────
export const ease = {
  smooth: [0.25, 0.1, 0.25, 1] as const,
  spring: [0.16, 1, 0.3, 1] as const,
  out: [0, 0, 0.2, 1] as const,
};

// ── Page transitions ───────────────────────────────────────
export const pageTransition: Variants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.4, ease: ease.smooth } },
  exit: { opacity: 0, y: -6, transition: { duration: 0.2 } },
};

// ── Stagger containers + items ─────────────────────────────
export const staggerContainer: Variants = {
  initial: {},
  animate: { transition: { staggerChildren: 0.06, delayChildren: 0.06 } },
};

export const staggerContainerFast: Variants = {
  initial: {},
  animate: { transition: { staggerChildren: 0.04, delayChildren: 0.04 } },
};

export const staggerItem: Variants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.35, ease: ease.spring } },
};

export const staggerItemScale: Variants = {
  initial: { opacity: 0, scale: 0.92 },
  animate: { opacity: 1, scale: 1, transition: { duration: 0.3, ease: ease.spring } },
};

// ── Card hover ─────────────────────────────────────────────
export const cardHover = {
  whileHover: { y: -1, transition: { duration: 0.15, ease: ease.out } },
  whileTap: { scale: 0.98, transition: { duration: 0.1 } },
};

// ── Scale in ───────────────────────────────────────────────
export const scaleIn: Variants = {
  initial: { opacity: 0, scale: 0.92 },
  animate: { opacity: 1, scale: 1, transition: { duration: 0.25, ease: ease.spring } },
};

// ── Slide variants ─────────────────────────────────────────
export const slideInRight: Variants = {
  initial: { opacity: 0, x: 20 },
  animate: { opacity: 1, x: 0, transition: { duration: 0.3, ease: ease.out } },
};

export const slideInLeft: Variants = {
  initial: { opacity: 0, x: -20 },
  animate: { opacity: 1, x: 0, transition: { duration: 0.3, ease: ease.out } },
};

// ── Fade in ────────────────────────────────────────────────
export const fadeIn: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.4 } },
};

export const fadeInUp: Variants = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.4, ease: ease.spring } },
};

// ── Modal animations ───────────────────────────────────────
export const modalOverlay: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.15 } },
};

export const modalContent: Variants = {
  initial: { opacity: 0, scale: 0.95, y: 10 },
  animate: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.25, ease: ease.spring } },
  exit: { opacity: 0, scale: 0.97, y: 8, transition: { duration: 0.15 } },
};

// ── Pill / badge pop-in ────────────────────────────────────
export const pillPop: Variants = {
  initial: { opacity: 0, scale: 0.8 },
  animate: { opacity: 1, scale: 1, transition: { type: 'spring', stiffness: 400, damping: 25 } },
};

// ── Tab indicator ──────────────────────────────────────────
export const tabIndicator: Transition = {
  type: 'spring',
  stiffness: 400,
  damping: 30,
};

// ── Scroll reveal ──────────────────────────────────────────
export const scrollReveal: Variants = {
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0, transition: { duration: 0.5, ease: ease.spring } },
};

// ── Button tap ─────────────────────────────────────────────
export const buttonTap = {
  whileTap: { scale: 0.96, transition: { duration: 0.1 } },
};

// ── List item slide ────────────────────────────────────────
export const listItemSlide: Variants = {
  initial: { opacity: 0, x: -12 },
  animate: { opacity: 1, x: 0, transition: { duration: 0.3, ease: ease.out } },
};

// ── Glass card reveal (for bento grid items) ──────────────
export const glassReveal: Variants = {
  initial: { opacity: 0, y: 16, scale: 0.98 },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.5, ease: ease.spring },
  },
};

// ── Orbital pulse (for step indicators) ───────────────────
export const orbitalPulse: Variants = {
  initial: { scale: 1 },
  animate: {
    scale: [1, 1.06, 1],
    boxShadow: [
      '0 0 8px rgba(212, 175, 55,0.2)',
      '0 0 22px rgba(212, 175, 55,0.45)',
      '0 0 8px rgba(212, 175, 55,0.2)',
    ],
    transition: { duration: 2, repeat: Infinity, ease: 'easeInOut' },
  },
};

// ── Glow hover (for interactive cards) ───────────────────
export const neonGlowHover = {
  whileHover: {
    boxShadow: '0 8px 24px rgba(36,28,21,0.08)',
    y: -2,
    transition: { duration: 0.15, ease: ease.out },
  },
  whileTap: { scale: 0.98, transition: { duration: 0.1 } },
};

// ── Elevated card hover ───────────────────────────────────
export const cardHoverElevated = {
  whileHover: {
    y: -3,
    boxShadow: '0 12px 40px rgba(36,28,21,0.08)',
    transition: { duration: 0.15, ease: ease.out },
  },
  whileTap: { scale: 0.97, transition: { duration: 0.1 } },
};
