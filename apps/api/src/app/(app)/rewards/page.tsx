import { notFound } from 'next/navigation';

// Rewards page disabled until the daily-rewards/streak backend is wired up.
// Original implementation preserved below — uncomment + remove notFound() to restore.
export default function RewardsPage() {
  notFound();
}

/*
'use client';

import Link from 'next/link';
import { useStore } from '@/store/useStore';

const REWARD_TILES = [
  {
    icon: '📅',
    title: 'Daily Check-in',
    desc: 'Check in every day to earn Dhanam',
    reward: '+5 Dhanam',
    actionLabel: 'Claim',
    disabled: true, // TODO: not wired — no daily-rewards backend
  },
  {
    icon: '👥',
    title: 'Refer a Friend',
    desc: 'Invite a friend and both get rewarded',
    reward: '+50 Dhanam each',
    actionLabel: 'Invite',
    href: '/referral',
    disabled: false,
  },
  {
    icon: '🔥',
    title: '7-Day Streak',
    desc: 'Use the app for 7 days in a row',
    reward: '+25 Dhanam',
    actionLabel: 'Claim',
    disabled: true, // TODO: not wired — no streak backend
  },
  {
    icon: '⭐',
    title: 'Rate the App',
    desc: 'Leave a review on the App Store',
    reward: '+10 Dhanam',
    actionLabel: 'Rate Now',
    disabled: true, // TODO: not wired
  },
  {
    icon: '🎯',
    title: 'Complete Your Profile',
    desc: 'Fill in all birth details for better accuracy',
    reward: '+15 Dhanam',
    actionLabel: 'Complete',
    href: '/profile',
    disabled: false,
  },
];

export default function RewardsPage() {
  const credits = useStore((s) => s.credits);

  return (
    <div className="min-h-screen pb-24">
      <div className="px-4 pt-5 pb-4 border-b border-border">
        <p className="j-eyebrow mb-1" style={{ color: 'var(--accent)' }}>Earn & Redeem</p>
        <h1
          className="j-display text-[14px]"
          style={{ color: 'var(--text)' }}
        >
          Rewards
        </h1>
      </div>

      <div className="px-4 py-4">
        <div
          className="relative overflow-hidden rounded-2xl p-5 flex items-center justify-between border border-[rgba(242,202,80,0.30)]"
          style={{
            background:
              'linear-gradient(135deg, var(--card-bg) 0%, var(--accent-soft) 100%)',
            backdropFilter: 'blur(8px)',
            boxShadow: '0 0 22px var(--glow), 0 0 36px var(--glow-soft)',
          }}
        >
          <div
            className="absolute -top-10 -right-10 w-40 h-40 rounded-full pointer-events-none"
            style={{ background: 'radial-gradient(circle, rgba(242,202,80,0.22) 0%, transparent 70%)' }}
          />
          <div className="relative">
            <p className="j-eyebrow mb-1" style={{ color: 'rgba(225,226,235,0.6)' }}>Your Balance</p>
            <p className="j-text-gold text-[40px] font-extrabold leading-none">{credits}</p>
            <p className="text-[12px] mt-1" style={{ color: 'var(--text-muted)' }}>tokens available</p>
          </div>
          <div className="relative flex flex-col items-end gap-2">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center text-2xl"
              style={{
                background: 'var(--surface-3)',
                border: '1px solid rgba(242,202,80,0.45)',
                color: 'var(--accent)',
                boxShadow: '0 0 14px var(--glow-soft)',
              }}
            >
              ✦
            </div>
            <Link
              href="/credits"
              className="j-btn j-btn-primary text-[12px] no-underline"
              style={{ padding: '6px 16px' }}
            >
              Top Up
            </Link>
          </div>
        </div>
      </div>

      <div className="px-4 mb-3">
        <p className="j-eyebrow" style={{ color: 'var(--accent)' }}>Ways to Earn</p>
      </div>

      <div className="px-4 space-y-3">
        {REWARD_TILES.map((tile) => (
          <div
            key={tile.title}
            className="rounded-2xl p-4 flex items-center gap-3 border border-border"
            style={{
              background: 'var(--card-bg)',
              backdropFilter: 'blur(8px)',
              boxShadow: '0 0 14px var(--glow-soft)',
            }}
          >
            <div
              className="flex-shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center text-2xl"
              style={{
                background: 'var(--surface-3)',
                border: '1px solid rgba(242,202,80,0.30)',
              }}
            >
              {tile.icon}
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-bold" style={{ color: 'var(--text)' }}>{tile.title}</p>
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{tile.desc}</p>
              <p className="text-[11px] font-bold mt-0.5" style={{ color: 'var(--accent)' }}>{tile.reward}</p>
            </div>

            {tile.disabled ? (
              <button
                disabled
                className="flex-shrink-0 px-4 py-2 rounded-full text-[12px] font-bold border"
                style={{
                  background: 'var(--surface-3)',
                  borderColor: 'var(--border)',
                  color: 'var(--text-dim)',
                  cursor: 'not-allowed',
                }}
              >
                {tile.actionLabel}
              </button>
            ) : (
              <Link
                href={tile.href ?? '#'}
                className="j-btn j-btn-primary flex-shrink-0 text-[12px] no-underline active:scale-95 transition-transform"
                style={{ padding: '8px 16px' }}
              >
                {tile.actionLabel}
              </Link>
            )}
          </div>
        ))}
      </div>

      <p className="text-center text-[11px] mt-6 px-8" style={{ color: 'var(--text-dim)' }}>
        Tokens can be used for AI readings, voice calls, and premium reports.
      </p>
    </div>
  );
}
*/
