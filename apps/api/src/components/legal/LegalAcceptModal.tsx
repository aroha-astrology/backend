'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { modalOverlay, modalContent } from '@/lib/motion';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { useStore } from '@/store/useStore';
import { LEGAL_HIGHLIGHTS, COMPANY_NAME } from '@/lib/legal';
import type { UserRow } from '@aroha-astrology/shared';

interface LegalAcceptModalProps {
  isOpen: boolean;
  onAccepted: (updatedUser: UserRow) => void;
}

export function LegalAcceptModal({ isOpen, onAccepted }: LegalAcceptModalProps) {
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const [agreeDisclaimer, setAgreeDisclaimer] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const setUser = useStore((s) => s.setUser);

  const allChecked = agreeTerms && agreePrivacy && agreeDisclaimer;

  async function handleAccept() {
    if (!allChecked || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/user/accept-legal', { method: 'POST' });
      const json = await res.json();
      if (!res.ok || !json.success) {
        toast.error(json.error || 'Could not record your acceptance. Please try again.');
        setSubmitting(false);
        return;
      }
      const updated = json.data as UserRow;
      setUser(updated);
      onAccepted(updated);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Network error');
      setSubmitting(false);
    }
  }

  async function handleDecline() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = '/';
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <motion.div
            className="absolute inset-0 bg-[rgba(36,28,21,0.55)] backdrop-blur-sm"
            variants={modalOverlay}
            initial="initial"
            animate="animate"
            exit="exit"
          />
          <motion.div
            className="relative z-10 w-full max-w-lg rounded-2xl bg-surface border border-border p-6 shadow-[0_20px_60px_rgba(36,28,21,0.18)] max-h-[90vh] overflow-y-auto"
            variants={modalContent}
            initial="initial"
            animate="animate"
            exit="exit"
            role="dialog"
            aria-modal="true"
            aria-labelledby="legal-accept-title"
          >
            <header className="mb-4">
              <p className="j-eyebrow">Before you continue</p>
              <h2 id="legal-accept-title" className="j-display text-xl text-text mt-1">
                Welcome to {COMPANY_NAME}
              </h2>
              <p className="mt-2 text-sm text-text-muted">
                Please review and accept the following before using the app.
              </p>
            </header>

            <div className="rounded-xl bg-surface-2/60 border border-border p-4 mb-5">
              <p className="text-[11px] font-semibold text-text-2 uppercase tracking-wider mb-2">
                In short
              </p>
              <ul className="space-y-1.5">
                {LEGAL_HIGHLIGHTS.map((highlight, i) => (
                  <li key={i} className="text-[13px] leading-relaxed text-text-muted flex gap-2">
                    <span className="text-primary mt-0.5">•</span>
                    <span>{highlight}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="space-y-3 mb-6">
              <CheckboxRow
                checked={agreeTerms}
                onChange={setAgreeTerms}
                id="agree-terms"
              >
                I have read and agree to the{' '}
                <Link href="/terms" target="_blank" rel="noopener noreferrer" className="j-link">
                  Terms &amp; Conditions
                </Link>
                .
              </CheckboxRow>

              <CheckboxRow
                checked={agreePrivacy}
                onChange={setAgreePrivacy}
                id="agree-privacy"
              >
                I have read and agree to the{' '}
                <Link href="/privacy" target="_blank" rel="noopener noreferrer" className="j-link">
                  Privacy Policy
                </Link>
                .
              </CheckboxRow>

              <CheckboxRow
                checked={agreeDisclaimer}
                onChange={setAgreeDisclaimer}
                id="agree-disclaimer"
              >
                I understand that astrological predictions on {COMPANY_NAME} are{' '}
                <strong className="text-text">guidance for reflection</strong>, not professional
                medical, legal, or financial advice.
              </CheckboxRow>
            </div>

            <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2.5">
              <Button
                type="button"
                variant="ghost"
                onClick={handleDecline}
                disabled={submitting}
              >
                Decline &amp; sign out
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={handleAccept}
                disabled={!allChecked || submitting}
                isLoading={submitting}
              >
                Accept &amp; continue
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

interface CheckboxRowProps {
  id: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  children: React.ReactNode;
}

function CheckboxRow({ id, checked, onChange, children }: CheckboxRowProps) {
  return (
    <label
      htmlFor={id}
      className="flex items-start gap-3 cursor-pointer rounded-xl p-3 -m-1 hover:bg-surface-2/40 transition-colors"
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-border-strong accent-primary cursor-pointer"
      />
      <span className="text-[13px] leading-relaxed text-text">{children}</span>
    </label>
  );
}
