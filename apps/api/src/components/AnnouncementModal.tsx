'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '@/store/useStore';
import { ANNOUNCEMENTS, matchesAudience, isSeen, markSeen, type Announcement } from '@/lib/announcements';

export function AnnouncementModal() {
  const user = useStore(s => s.user);
  const [active, setActive] = useState<Announcement | null>(null);

  useEffect(() => {
    // Wait until the user object is hydrated — for phone-targeted announcements
    // we need user.phone, and for 'all' audiences we still want to avoid showing
    // on the login screen.
    if (!user) return;
    const next = ANNOUNCEMENTS.find(a => !isSeen(a.id) && matchesAudience(a.audience, user.phone));
    if (next) setActive(next);
  }, [user]);

  const dismiss = () => {
    if (active) markSeen(active.id);
    setActive(null);
  };

  return (
    <AnimatePresence>
      {active && (
        <>
          <motion.div
            key="announcement-backdrop"
            className="fixed inset-0 z-[90] bg-[rgba(8,6,4,0.55)] backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={dismiss}
          />
          <motion.div
            key="announcement-modal"
            className="fixed z-[91] left-1/2 top-1/2 w-[calc(100%-2rem)] max-w-sm rounded-2xl p-6 shadow-2xl bg-surface border border-border text-center"
            style={{ x: '-50%', y: '-50%' }}
            initial={{ opacity: 0, y: 'calc(-50% + 16px)', scale: 0.96 }}
            animate={{ opacity: 1, y: '-50%', scale: 1 }}
            exit={{ opacity: 0, y: 'calc(-50% + 16px)', scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
          >
            <div
              className="mx-auto mb-4 w-14 h-14 rounded-full flex items-center justify-center text-2xl"
              style={{
                background: 'linear-gradient(135deg, rgba(245,158,11,0.22), rgba(245,158,11,0.06))',
                border: '1px solid rgba(245,158,11,0.34)',
              }}
            >
              {active.icon}
            </div>
            <p className="text-[16px] font-extrabold text-text mb-2 font-[family-name:var(--font-serif)]">
              {active.title}
            </p>
            <p className="text-[13px] text-text-secondary leading-relaxed mb-5 whitespace-pre-line">
              {active.body}
            </p>
            <button
              onClick={dismiss}
              className="w-full py-2.5 rounded-xl text-[13px] font-bold cursor-pointer bg-primary text-white border-none"
            >
              {active.cta}
            </button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
