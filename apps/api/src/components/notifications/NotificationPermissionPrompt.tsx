'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { modalOverlay, modalContent } from '@/lib/motion';
import { Button } from '@/components/ui/button';
import { ensurePushSubscribed } from '@/lib/push/client';

// One-shot soft prompt that asks the user to enable browser notifications.
// Strategy:
//   - Only show when Notification.permission === 'default' (untouched).
//   - Defer ~3.5s after sign-in so the user sees their dashboard first.
//   - Persist user's decision in localStorage; re-show 'later' choices after 7 days.
//   - Never show on devices that don't support web-push (the helper signals this).

const STORAGE_KEY = 'jyotish_push_prompt_decision';
const RE_PROMPT_AFTER_DAYS = 7;

type StoredDecision = { decision: 'allowed' | 'denied' | 'later'; at: number };

function readDecision(): StoredDecision | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredDecision) : null;
  } catch {
    return null;
  }
}

function writeDecision(decision: StoredDecision['decision']): void {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ decision, at: Date.now() }),
    );
  } catch {
    // ignore quota errors
  }
}

function shouldPrompt(): boolean {
  if (typeof window === 'undefined') return false;
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return false;
  if (Notification.permission !== 'default') return false;

  const stored = readDecision();
  if (!stored) return true;
  if (stored.decision === 'allowed' || stored.decision === 'denied') return false;
  const ageDays = (Date.now() - stored.at) / (1000 * 60 * 60 * 24);
  return ageDays >= RE_PROMPT_AFTER_DAYS;
}

interface Props {
  /** Set true once the user is signed in + legal modal is closed. */
  enabled: boolean;
}

export function NotificationPermissionPrompt({ enabled }: Props) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    if (!shouldPrompt()) return;
    const timer = setTimeout(() => setOpen(true), 3500);
    return () => clearTimeout(timer);
  }, [enabled]);

  async function handleAllow() {
    if (submitting) return;
    setSubmitting(true);
    const result = await ensurePushSubscribed();
    setSubmitting(false);

    if (result.ok) {
      writeDecision('allowed');
      toast.success('You\'re all set — your reading will buzz at 7 AM.');
      setOpen(false);
      return;
    }

    if (result.reason === 'denied') {
      writeDecision('denied');
      toast.message('No problem — you can enable this any time from Settings.');
      setOpen(false);
      return;
    }

    // unsupported / no-vapid-key / network error — silently dismiss, don't pester
    writeDecision('later');
    setOpen(false);
  }

  function handleLater() {
    writeDecision('later');
    setOpen(false);
  }

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[55] flex items-center justify-center p-4">
          <motion.div
            className="absolute inset-0 bg-[rgba(17,19,26,0.65)] backdrop-blur-sm"
            variants={modalOverlay}
            initial="initial"
            animate="animate"
            exit="exit"
            onClick={handleLater}
          />
          <motion.div
            className="relative z-10 w-full max-w-sm rounded-2xl bg-surface border border-border p-6 shadow-[0_20px_60px_rgba(0,0,0,0.5)]"
            variants={modalContent}
            initial="initial"
            animate="animate"
            exit="exit"
            role="dialog"
            aria-modal="true"
            aria-labelledby="push-prompt-title"
          >
            <div className="flex items-center justify-center w-14 h-14 rounded-full bg-primary-soft border border-border-gold mb-4 mx-auto">
              <BellIcon />
            </div>

            <h2
              id="push-prompt-title"
              className="j-display text-xl text-text text-center"
            >
              Your reading, every morning
            </h2>

            <p className="mt-2 text-sm text-text-muted text-center leading-relaxed">
              Allow notifications and we&apos;ll send your astrologer&apos;s card
              at 7 AM each day — even when the app is closed.
            </p>

            <div className="mt-6 flex flex-col gap-2.5">
              <Button
                type="button"
                variant="primary"
                onClick={handleAllow}
                disabled={submitting}
                isLoading={submitting}
              >
                Allow notifications
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={handleLater}
                disabled={submitting}
              >
                Not now
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

function BellIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-primary-ink"
      aria-hidden
    >
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}
