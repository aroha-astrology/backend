'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '@/store/useStore';

/**
 * Sticky top banner shown while the user's Apollo-derived data is in its
 * 2-hour "manual review" window. Auto-removes itself when the reveal time
 * passes. No dismiss button — the wait is the whole UX.
 */
export function AstrologerReviewBanner() {
  const user = useStore(s => s.user);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    // Tick every 60s so the countdown stays accurate without thrashing renders.
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const revealAtRaw = user?.apollo_reveal_at;
  if (!revealAtRaw) return null;

  const revealAt = new Date(revealAtRaw).getTime();
  if (!Number.isFinite(revealAt)) return null;

  const remainingMs = revealAt - now;
  const isPending = remainingMs > 0;

  return (
    <AnimatePresence>
      {isPending && (
        <motion.div
          initial={{ y: -64, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -64, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 28 }}
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 60,
            padding: '8px 16px 4px',
            paddingTop: 'max(8px, env(safe-area-inset-top))',
          }}
        >
          <div
            className="flex items-center gap-3 w-full bg-warning text-white rounded-2xl px-4 py-2.5"
            style={{ boxShadow: '0 4px 24px rgba(192,152,64,0.35)' }}
          >
            <span style={{ fontSize: 20 }}>🪔</span>
            <div style={{ flex: 1, textAlign: 'left' }}>
              <p style={{ fontSize: 13, fontWeight: 700, margin: 0, lineHeight: 1.3 }}>
                Our astrologer is reviewing your details
              </p>
              <p style={{ fontSize: 10, margin: 0, opacity: 0.78, lineHeight: 1.4 }}>
                Your personalized reading will be ready in {formatRemaining(remainingMs)}.
              </p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function formatRemaining(ms: number): string {
  const totalMin = Math.max(1, Math.round(ms / 60_000));
  if (totalMin < 60) return `~${totalMin} min`;
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (mins === 0) return `~${hours} hr`;
  return `~${hours} hr ${mins} min`;
}
