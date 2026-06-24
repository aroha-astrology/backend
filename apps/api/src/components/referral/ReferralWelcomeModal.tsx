'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';

interface ReferralWelcomeModalProps {
  open: boolean;
  code: string;
  referrerBonus: number;
  inviteeBonus: number;
  onDismiss: () => void;
}

export function ReferralWelcomeModal({
  open,
  code,
  referrerBonus,
  inviteeBonus,
  onDismiss,
}: ReferralWelcomeModalProps) {
  // Prevent body scroll while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9998] flex items-end sm:items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(10px)' }}
          onClick={onDismiss}
        >
          <motion.div
            initial={{ scale: 0.92, y: 40 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.92, y: 40 }}
            transition={{ duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-[380px] mx-4 mb-8 sm:mb-0 rounded-[18px] p-6 border border-primary/35 shadow-[0_24px_60px_rgba(0,0,0,0.65),0_0_36px_rgba(212,175,55,0.28)] overflow-hidden"
            style={{ background: 'var(--surface-2)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={onDismiss}
              aria-label="Dismiss"
              className="absolute top-4 right-4 flex h-7 w-7 items-center justify-center rounded-full text-text-muted hover:bg-surface-3 transition-colors border-none bg-transparent cursor-pointer"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="1" y1="1" x2="13" y2="13" />
                <line x1="13" y1="1" x2="1" y2="13" />
              </svg>
            </button>

            <div className="flex justify-center mb-4">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-primary/12 border border-primary/30 shadow-[0_0_22px_rgba(212,175,55,0.25)]">
                <span className="text-2xl" role="img" aria-label="gift">🎁</span>
              </div>
            </div>

            <div className="text-center mb-5">
              <p className="j-eyebrow text-[10px] mb-2 text-primary/80">Refer &amp; Earn Dhanam</p>
              <h3 className="j-display text-[18px] text-text mb-2">
                Earn +{referrerBonus} Dhanam per friend
              </h3>
              <p className="text-[12.5px] text-text-muted leading-relaxed">
                Share your code with friends. Each one earns you +{referrerBonus} Dhanam —
                they get +{inviteeBonus} to start.
              </p>
            </div>

            <div className="mx-auto mb-5 w-fit rounded-xl border border-primary/35 bg-primary/8 px-4 py-2.5">
              <p className="text-[9px] uppercase tracking-[0.18em] text-text-muted text-center">Your code</p>
              <p className="mt-0.5 j-display text-2xl text-primary text-center tracking-[0.22em]">{code}</p>
            </div>

            <div className="flex gap-2.5">
              <button
                onClick={onDismiss}
                className="flex-1 rounded-full py-2.5 text-[12px] font-semibold cursor-pointer bg-surface-2 text-text-muted hover:text-text border border-border transition-colors"
              >
                Maybe later
              </button>
              <Link
                href="/referral"
                onClick={onDismiss}
                className="flex-1 rounded-full py-2.5 text-[12px] font-bold text-center no-underline bg-[linear-gradient(135deg,#D4AF37,#B8893F)] shadow-[0_0_14px_rgba(212,175,55,0.45)] hover:shadow-[0_0_22px_rgba(242,202,80,0.60)] transition-shadow"
                style={{ color: 'var(--bg)' }}
              >
                Share now →
              </Link>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
