'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ASTRO_PLANS, ASTRO_ADDONS } from '@aroha-astrology/shared';
import type { AstroPlan } from '@aroha-astrology/shared';

interface Profile {
  astro_plan: AstroPlan | null;
  customer_limit: number;
}

export default function AstrologerUpgradePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/user/me').then(r => r.json()).then(json => {
      if (!json?.data) { router.replace('/login'); return; }
      if (json.data.astro_status !== 'approved') { router.replace('/astrologer/pending'); return; }
      setProfile({ astro_plan: json.data.astro_plan, customer_limit: json.data.customer_limit });
    }).finally(() => setLoading(false));
  }, [router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-bg">
        <p className="text-text-secondary text-sm">Loading…</p>
      </div>
    );
  }

  const currentPlan = profile?.astro_plan ? ASTRO_PLANS[profile.astro_plan] : null;

  function handleContact(type: string, price: number) {
    const msg = encodeURIComponent(
      `Hi, I want to upgrade my Aroha Astrology astrologer account.\nUpgrade: ${type} (₹${price})\nPlease share payment details.`
    );
    window.open(`https://wa.me/919535960988?text=${msg}`, '_blank');
  }

  return (
    <div className="min-h-screen bg-bg px-4 py-6 pb-24">
      <div className="max-w-lg mx-auto flex flex-col gap-5">

        {/* Header */}
        <div>
          <Link href="/astrologer/dashboard" className="text-xs text-text-secondary no-underline mb-1 block">← Dashboard</Link>
          <h1 className="text-lg font-extrabold text-text font-[family-name:var(--font-serif)]">Upgrade Plan</h1>
          <p className="text-xs text-text-secondary mt-0.5">
            Current: {currentPlan ? `${currentPlan.label} — ${currentPlan.customers} clients` : 'No plan'}
            {profile?.customer_limit && profile?.astro_plan && profile.customer_limit > ASTRO_PLANS[profile.astro_plan].customers
              ? ` + ${profile.customer_limit - ASTRO_PLANS[profile.astro_plan].customers} add-on slots`
              : ''}
          </p>
        </div>

        {/* Plan upgrades */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <p className="text-xs font-bold text-text-secondary uppercase tracking-widest mb-3">Switch Plan</p>
          <div className="flex flex-col gap-3">
            {(Object.entries(ASTRO_PLANS) as [AstroPlan, { price: number; customers: number; label: string }][]).map(([key, plan]) => {
              const isCurrent = key === profile?.astro_plan;
              return (
                <div
                  key={key}
                  className={`bg-surface border rounded-xl px-4 py-4 flex items-center justify-between ${
                    isCurrent ? 'border-primary' : 'border-border'
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-text m-0">{plan.label}</p>
                      {isCurrent && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 border border-primary/25 text-primary uppercase tracking-wide">
                          Current
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-text-secondary mt-0.5">{plan.customers} clients · ₹{plan.price}/mo</p>
                  </div>
                  {!isCurrent && (
                    <button
                      onClick={() => handleContact(`${plan.label} Plan`, plan.price)}
                      className="px-3 py-1.5 rounded-lg bg-primary text-bg text-xs font-bold border-none cursor-pointer hover:opacity-90"
                    >
                      Upgrade
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </motion.div>

        {/* Add-on packs */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <p className="text-xs font-bold text-text-secondary uppercase tracking-widest mb-3">Add-on Packs</p>
          <div className="flex flex-col gap-3">
            {ASTRO_ADDONS.map((addon) => (
              <div key={addon.id} className="bg-surface border border-border rounded-xl px-4 py-4 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-text m-0">{addon.label}</p>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--accent)]/10 border border-[var(--accent)]/25 text-[var(--accent)] uppercase tracking-wide">
                      {addon.badge}
                    </span>
                  </div>
                  <p className="text-xs text-text-secondary mt-0.5">One-time · ₹{addon.price}</p>
                </div>
                <button
                  onClick={() => handleContact(`${addon.label} Add-on`, addon.price)}
                  className="px-3 py-1.5 rounded-lg bg-[var(--accent)]/10 border border-[var(--accent)]/25 text-[var(--accent)] text-xs font-bold cursor-pointer hover:bg-[var(--accent)]/20 transition-colors"
                >
                  Buy
                </button>
              </div>
            ))}
          </div>
        </motion.div>

        <p className="text-[11px] text-text-secondary text-center">
          Clicking Upgrade or Buy will open WhatsApp to complete payment with the admin.
        </p>

      </div>
    </div>
  );
}
