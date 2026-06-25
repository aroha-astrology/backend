'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';

const WA_NUMBER = '919535960988';

export default function AstrologerPendingPage() {
  const router = useRouter();

  // Poll every 10s — redirect once approved
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/user/me');
        if (!res.ok) return;
        const json = await res.json();
        const status = json?.data?.astro_status;
        if (status === 'approved') router.replace('/astrologer/dashboard');
        if (status === 'rejected') router.replace('/astrologer/rejected');
      } catch { /* ignore */ }
    }, 10000);
    return () => clearInterval(interval);
  }, [router]);

  function openWhatsApp() {
    const text = encodeURIComponent(
      'Hi, I just registered as an astrologer on Aroha Astrology. Please review and approve my account.'
    );
    window.open(`https://wa.me/${WA_NUMBER}?text=${text}`, '_blank');
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4 py-10">
      <div className="max-w-sm w-full flex flex-col items-center gap-6 text-center">

        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="w-20 h-20 rounded-full bg-[var(--accent)]/10 border border-[var(--accent)]/25 flex items-center justify-center text-4xl"
        >
          ⏳
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <h1 className="text-xl font-extrabold text-text font-[family-name:var(--font-serif)] mb-2">
            Account Under Review
          </h1>
          <p className="text-text-secondary text-sm leading-relaxed">
            Your registration is being reviewed. To speed up approval, send us a WhatsApp message
            with your name and how you practice astrology.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="w-full bg-surface border border-border rounded-xl px-4 py-4 flex flex-col gap-3"
        >
          <p className="text-xs font-bold text-text-secondary uppercase tracking-widest">
            Contact for faster approval
          </p>
          <div className="flex items-center gap-3">
            <span className="text-2xl">💬</span>
            <div className="text-left">
              <p className="text-sm font-semibold text-text m-0">WhatsApp</p>
              <p className="text-xs text-text-secondary">+91 95359 60988</p>
            </div>
          </div>
          <button
            onClick={openWhatsApp}
            className="w-full py-3 rounded-xl bg-[#25D366] text-white font-bold text-sm cursor-pointer border-none hover:opacity-90 transition-opacity"
          >
            Message on WhatsApp
          </button>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="text-[11px] text-text-secondary"
        >
          This page checks automatically every 10 seconds.
          You&apos;ll be redirected once your account is approved.
        </motion.p>

      </div>
    </div>
  );
}
