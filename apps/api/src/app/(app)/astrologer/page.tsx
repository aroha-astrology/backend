'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ASTRO_PLANS } from '@aroha-astrology/shared';

const PLAN_ICONS: Record<string, string> = {
  basic: '🌙',
  premium: '⭐',
  premium_plus: '🌟',
};

export default function AstrologerLandingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleRegister() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/astrologer/register', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) {
        if (res.status === 401) { router.push('/login'); return; }
        setError(json.error ?? 'Something went wrong');
        return;
      }
      if (json.status === 'approved') {
        router.push('/astrologer/dashboard');
        return;
      }
      // Open WhatsApp for the user to message admin
      if (json.waUrl) window.open(json.waUrl, '_blank');
      router.push('/astrologer/pending');
    } catch {
      setError('Network error, please try again');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-bg px-4 py-10 pb-28">
      <div className="max-w-md mx-auto flex flex-col gap-8">

        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center"
        >
          <div className="text-5xl mb-4">🔮</div>
          <h1 className="text-2xl font-extrabold text-text font-[family-name:var(--font-serif)] mb-2">
            Astrologer Portal
          </h1>
          <p className="text-text-secondary text-sm leading-relaxed">
            Manage your clients, run kundli reports and auspicious timing — all in one place.
            Sign up for a plan and start growing your practice.
          </p>
        </motion.div>

        {/* Plans */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex flex-col gap-3"
        >
          <p className="text-xs font-bold text-text-secondary uppercase tracking-widest text-center">
            Plans
          </p>
          {(Object.entries(ASTRO_PLANS) as [string, { price: number; customers: number; label: string }][]).map(([key, plan]) => (
            <div
              key={key}
              className={`bg-surface border rounded-xl px-4 py-4 flex items-center justify-between ${
                key === 'premium' ? 'border-[var(--accent)]' : 'border-border'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">{PLAN_ICONS[key]}</span>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-text m-0">{plan.label}</p>
                    {key === 'premium' && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--accent)]/10 border border-[var(--accent)]/25 text-[var(--accent)] uppercase tracking-wide">
                        Popular
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-text-secondary mt-0.5">{plan.customers} customers</p>
                </div>
              </div>
              <p className="text-base font-extrabold text-primary m-0">₹{plan.price}<span className="text-xs font-normal text-text-secondary">/mo</span></p>
            </div>
          ))}

          {/* Add-ons note */}
          <p className="text-xs text-text-secondary text-center mt-1">
            Need more? Add-on packs: ₹250 (+5) · ₹500 (+11) · ₹1,000 (+25)
          </p>
        </motion.div>

        {/* Features */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-surface border border-border rounded-xl px-4 py-4 flex flex-col gap-3"
        >
          <p className="text-xs font-bold text-text-secondary uppercase tracking-widest">What you get</p>
          {[
            ['👥', 'Manage multiple clients under one account'],
            ['📊', 'Run full kundli reports for each client'],
            ['🕐', 'Muhurta — auspicious timing for business & life events'],
            ['📱', 'Dedicated mobile app for astrologers'],
          ].map(([icon, text]) => (
            <div key={text} className="flex items-start gap-3">
              <span className="text-lg flex-shrink-0">{icon}</span>
              <p className="text-sm text-text-secondary m-0 leading-relaxed">{text}</p>
            </div>
          ))}
        </motion.div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="flex flex-col gap-3"
        >
          {error && (
            <p className="text-xs text-red-400 text-center">{error}</p>
          )}
          <button
            onClick={handleRegister}
            disabled={loading}
            className="w-full py-3.5 rounded-xl bg-primary text-bg font-bold text-sm cursor-pointer border-none disabled:opacity-60 hover:opacity-90 transition-opacity"
          >
            {loading ? 'Registering…' : 'Register as Astrologer'}
          </button>
          <p className="text-[11px] text-text-secondary text-center">
            Already registered?{' '}
            <button
              onClick={() => router.push('/astrologer/dashboard')}
              className="text-primary bg-transparent border-none cursor-pointer underline p-0"
            >
              Go to dashboard
            </button>
          </p>
          <p className="text-[11px] text-text-secondary text-center mt-2">
            Also a temple priest?{' '}
            <button
              onClick={() => router.push('/pandit/join')}
              className="text-accent bg-transparent border-none cursor-pointer underline p-0"
            >
              Join as Pandit too
            </button>
          </p>
        </motion.div>

      </div>
    </div>
  );
}
