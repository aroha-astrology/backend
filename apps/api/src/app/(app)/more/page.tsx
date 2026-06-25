'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useStore } from '@/store/useStore';
import { MotionPage, ScrollReveal } from '@/components/ui/motion-primitives';
import { staggerContainer, staggerItem, cardHover, pillPop } from '@/lib/motion';
import { usePalmUnlock } from '@/hooks/usePalmUnlock';

const categories = [
  {
    title: 'Your Chart',
    items: [
      { label: 'Kundli', href: '/kundli/generate', icon: '🪐', desc: 'Birth chart & analysis' },
      { label: 'Varshaphal', href: '/varshaphal', icon: '🎂', desc: 'Annual chart' },
      { label: 'KP System', href: '/kp-system', icon: '🎯', desc: 'Sub-lord analysis' },
      { label: 'Gochar', href: '/gochar', icon: '🔄', desc: 'Transit tracker' },
      { label: 'Prashna', href: '/prashna', icon: '❓', desc: 'Horary astrology' },
    ],
  },
  {
    title: 'Daily Guidance',
    items: [
      { label: 'Horoscope', href: '/horoscope/daily', icon: '🌟', desc: 'Daily predictions' },
      { label: 'Weekly', href: '/horoscope/weekly', icon: '📆', desc: 'Weekly outlook' },
      { label: 'Panchang', href: '/panchang', icon: '📅', desc: 'Today\'s panchang' },
      { label: 'Muhurta', href: '/muhurta', icon: '⏰', desc: 'Auspicious timing' },
      { label: 'Calendar', href: '/calendar', icon: '🗓️', desc: 'Festivals & tithis' },
    ],
  },
  {
    title: 'Compatibility',
    items: [
      { label: 'Match Making', href: '/couple', icon: '💑', desc: '36-guna compatibility' },
    ],
  },
  {
    title: 'Readings',
    items: [
      { label: 'Palm Reading', href: '/palm', icon: '✋', desc: 'Palmistry analysis' },
      { label: 'Tarot', href: '/tarot', icon: '🃏', desc: 'Card guidance' },
      { label: 'Dreams', href: '/dreams', icon: '💭', desc: 'Dream meanings' },
      { label: 'Vastu', href: '/vastu', icon: '🏠', desc: 'Home energy' },
    ],
  },
  {
    title: 'Remedies & Tools',
    items: [
      { label: 'Gemstone', href: '/gemstone', icon: '💎', desc: 'Gem recommendations' },
      { label: 'Remedies', href: '/remedies', icon: '🙏', desc: 'Remedies dashboard' },
      { label: 'Baby Names', href: '/baby-names', icon: '👶', desc: 'Auspicious names' },
    ],
  },
  {
    title: 'Life Decisions',
    locked: true,
    items: [
      { label: 'Vehicle', href: '/life-decisions/vehicle', icon: '🚗', desc: 'Best time to buy' },
      { label: 'Property', href: '/life-decisions/property', icon: '🏘️', desc: 'Real estate timing' },
      { label: 'Business', href: '/life-decisions/business', icon: '💼', desc: 'Launch timing' },
      { label: 'Wedding', href: '/life-decisions/wedding', icon: '💒', desc: 'Auspicious date' },
      { label: 'Baby', href: '/life-decisions/baby', icon: '👶', desc: 'Conception timing' },
      { label: 'Job', href: '/life-decisions/job', icon: '💻', desc: 'Career moves' },
      { label: 'Education', href: '/life-decisions/education', icon: '📚', desc: 'Study timing' },
      { label: 'Investment', href: '/life-decisions/investment', icon: '📈', desc: 'Market timing' },
      { label: 'Travel', href: '/life-decisions/travel', icon: '✈️', desc: 'Journey planning' },
    ],
  },
  // REPORTS_DISABLED: Reports category removed from More page
  /* REPORTS_DISABLED_START
  {
    title: 'Reports',
    items: [
      { label: 'Kundli Report', href: '/reports/premium?tab=kundli', icon: '📄', desc: '90-page PDF' },
      { label: 'Numerology', href: '/reports/premium?tab=numerology', icon: '🔢', desc: 'Free 60-page report' },
    ],
  },
  REPORTS_DISABLED_END */
  {
    title: 'Account',
    items: [
      { label: 'Dhanam', href: '/credits', icon: '✦', desc: 'Buy Dhanam' },
      { label: 'Referral', href: '/referral', icon: '🎁', desc: 'Refer & earn' },
      { label: 'Settings', href: '/settings', icon: '⚙️', desc: 'Preferences' },
      { label: 'Profile', href: '/profile', icon: '👤', desc: 'Your account' },
    ],
  },
];

export default function MorePage() {
  const credits = useStore((s) => s.credits);
  const user = useStore((s) => s.user);
  const router = useRouter();
  const palm = usePalmUnlock();

  useEffect(() => {
    if (user !== undefined && user?.email !== 's9475220017@gmail.com') {
      router.replace('/dashboard');
    }
  }, [user, router]);

  if (!user || user.email !== 's9475220017@gmail.com') return null;

  return (
    <MotionPage className="min-h-screen pt-4 pb-24">
      <div className="w-[90%] max-w-[1240px] mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-lg font-bold text-text font-[family-name:var(--font-serif)]">All Services</h1>
          <Link href="/credits" className="no-underline">
            <div className="flex items-center gap-1.5 bg-primary/8 border border-primary/20 rounded-full py-1 px-3">
              <svg className="w-3 h-3 fill-primary" viewBox="0 0 24 24">
                <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
              </svg>
              <span className="text-[12px] font-bold text-primary">{credits}</span>
              <span className="text-[10px] text-text-secondary">credits</span>
            </div>
          </Link>
        </div>

        {/* Categories */}
        <div className="flex flex-col gap-5">
          {categories.map((cat, catIdx) => {
            const isLocked = (cat as { locked?: boolean }).locked === true;
            return (
            <ScrollReveal key={cat.title}>
              <section>
                <div className="flex items-center gap-2 mb-2.5">
                  <h2 className="text-[10px] font-bold text-text-secondary uppercase tracking-widest font-[family-name:var(--font-serif)] gradient-text-primary">
                    {cat.title}
                  </h2>
                  {isLocked && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-border bg-surface-2/60 text-[9px] font-semibold tracking-wider uppercase text-text-muted">
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                      Coming soon
                    </span>
                  )}
                </div>
                <motion.div
                  className="grid grid-cols-[repeat(auto-fill,minmax(90px,1fr))] gap-2"
                  variants={staggerContainer}
                  initial="initial"
                  whileInView="animate"
                  viewport={{ once: true }}
                >
                  {cat.items.map((item) => {
                    const isPalmLocked = item.href === '/palm' && !palm.unlocked;
                    const itemLocked = isLocked || isPalmLocked;
                    const tile = (
                      <motion.div
                        className="glass-1 rounded-xl py-3 px-2 flex flex-col items-center gap-1.5 text-center transition-all duration-300 relative"
                        style={itemLocked ? { opacity: 0.55, cursor: 'not-allowed' } : { cursor: 'pointer' }}
                        whileHover={itemLocked ? undefined : { y: -2, borderColor: 'rgba(212, 175, 55,0.30)', boxShadow: '0 4px 20px rgba(212, 175, 55,0.12)' }}
                        whileTap={itemLocked ? undefined : { scale: 0.97 }}
                        transition={{ duration: 0.15 }}
                      >
                        {itemLocked && (
                          <span className="absolute top-1.5 right-1.5 text-text-muted">
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                          </span>
                        )}
                        <span className="text-xl">{item.icon}</span>
                        <div>
                          <p className="text-[11px] font-semibold text-text mb-0.5">{item.label}</p>
                          <p className="text-[9px] text-text-secondary leading-snug">{item.desc}</p>
                        </div>
                      </motion.div>
                    );
                    return (
                      <motion.div key={item.href} variants={staggerItem}>
                        {isPalmLocked ? (
                          <button
                            type="button"
                            aria-label="Palm Reading (locked)"
                            onClick={() => {
                              if (palm.tap()) router.push(item.href);
                            }}
                            className="no-underline w-full p-0 bg-transparent border-none cursor-pointer text-left"
                          >
                            {tile}
                          </button>
                        ) : isLocked ? (
                          <div aria-disabled="true" role="link" className="no-underline">{tile}</div>
                        ) : (
                          <Link href={item.href} className="no-underline">{tile}</Link>
                        )}
                      </motion.div>
                    );
                  })}
                </motion.div>
              </section>
            </ScrollReveal>
            );
          })}
        </div>
      </div>
    </MotionPage>
  );
}
