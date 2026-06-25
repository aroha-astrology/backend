'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { Planet3DInline } from '@/components/3d/Planet3DInline';
import type { PlanetKey } from '@/components/3d/planet-registry';

export type WisdomSection =
  | 'onboarding'
  | 'dashboard'
  | 'kundli'
  | 'dasha'
  | 'career'
  | 'marriage'
  | 'health'
  | 'wealth'
  | 'vastu'
  | 'gemstone'
  | 'muhurta'
  | 'tarot'
  | 'palm'
  | 'dreams'
  | 'panchang'
  | 'chat'
  | 'report'
  | 'horoscope'
  | 'karma'
  | 'prashna';

export const WISDOM_BANK: Record<WisdomSection, string[]> = {
  onboarding: [
    'Aligning the planets at your moment of birth…',
    'Reading what the sky was saying when you arrived…',
    'Your nakshatra is being mapped…',
    'Locating the ascendant of this lifetime.',
  ],
  dashboard: [
    'Saturn rewards patience — your insights are arriving.',
    "The cosmos doesn't rush. Neither do we.",
    "Today's planetary weather is forming.",
    "Stars don't hurry. Your answer is on its way.",
    'Kāla — the river of time — flows at its own pace.',
    'The universe heard your question.',
    "Reading the sky's handwriting for you.",
    'Wisdom arrives exactly when it is ready.',
    'The planets have been waiting to speak to you.',
    'Even light takes time — your insight is travelling.',
    'Ancient science, modern patience.',
  ],
  kundli: [
    'Drawing your rashi chart — the blueprint of your soul.',
    'Placing 9 planets across 12 houses.',
    'The lagna is being computed to the second.',
    'Mapping lagna, bhava, and planetary degrees.',
    'The ayanamsha is being applied — every second counts.',
    'Nine planets, twelve houses, infinite stories.',
    "Your soul's map is being unfolded.",
  ],
  dasha: [
    'Tracing the river of your life — Vimshottari at work.',
    'Mapping 120 years of cosmic rhythm.',
    'Each planet rules its era — calculating yours now.',
    'Time is the real astrologer — letting it speak.',
    'From Ketu to Venus — 120 years of your cosmic script.',
  ],
  career: [
    'Mercury is reviewing your tenth house…',
    'Your karmic profession is being decoded.',
    "Saturn's karmic ledger is open.",
    'The tenth house holds your calling — reading it now.',
  ],
  marriage: [
    'Comparing two skies — guna milan in progress.',
    'Venus is matching frequencies.',
    'Two charts meeting — the ancient science begins.',
    'Checking nadi, gana, and mahendra koota.',
  ],
  health: [
    'The Sun governs vitality — checking its strength in your chart.',
    'The sixth house and its lord are being studied.',
  ],
  wealth: [
    'Jupiter expands fortune — measuring its placement.',
    'Reading your dhana yogas.',
    'The second and eleventh houses are being examined.',
  ],
  vastu: [
    'Vastu Purusha is being mapped onto your space.',
    'Aligning the eight directions — Ishanya to Nairutya.',
    'Brahmasthan is the heart of every home.',
    'Five elements seeking balance in your space.',
  ],
  gemstone: [
    'Matching crystal frequencies to your planets.',
    'Every stone carries a planetary signature.',
  ],
  muhurta: [
    'Searching auspicious windows in time…',
    'The right moment changes everything.',
  ],
  tarot: [
    'Shuffling the cards — the deck listens to your question.',
    'Each card is a mirror — let it speak.',
  ],
  palm: [
    'Tracing your life-line, heart-line and head-line.',
    'Your palm holds a language older than words.',
  ],
  dreams: [
    'Symbols travel between worlds — decoding yours.',
    'The dreaming mind speaks in the language of stars.',
  ],
  panchang: [
    "Reading today's tithi, vara, nakshatra, yoga and karana.",
    "Five limbs of time — the day's full portrait is forming.",
  ],
  chat: [
    'Yogi Baba is consulting the shastras…',
    'An ancient mind is forming a modern answer.',
    'Searching the shastras for your answer.',
    'The question you asked holds its own wisdom.',
  ],
  report: [
    'Hand-writing your 40-page cosmic biography…',
    'Stitching together 7 chapters of your life.',
    'Seven chapters of your life being composed.',
    'Weaving the threads of planets, houses, and time.',
    'Your cosmic biography is being written with care.',
  ],
  horoscope: [
    "Today's planetary weather is forming…",
    'The sky today is a letter — reading it for you.',
    'Transits are the whispers of tomorrow.',
  ],
  karma: [
    'Tracing past-life imprints in your chart.',
    'The south node remembers everything.',
  ],
  prashna: [
    'The moment you asked is itself the answer — analysing now.',
    'Prashna Shastra: the question and the cosmos speak together.',
  ],
};

interface WisdomLoaderProps {
  section?: WisdomSection;
  size?: 'sm' | 'md' | 'lg';
  progress?: number;
  paused?: boolean;
  dotColor?: string;
  className?: string;
}

const SIZE_MAP = {
  sm: { font: 12, gap: 8, dot: 5 },
  md: { font: 14, gap: 10, dot: 6 },
  lg: { font: 17, gap: 14, dot: 8 },
} as const;

export function WisdomLoader({
  section = 'dashboard',
  size = 'md',
  progress,
  paused = false,
  dotColor,
  className,
}: WisdomLoaderProps) {
  const lines = WISDOM_BANK[section] ?? WISDOM_BANK.dashboard;
  const [i, setI] = useState(0);

  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => setI((x) => (x + 1) % lines.length), 2800);
    return () => clearInterval(t);
  }, [paused, lines.length]);

  const sz = SIZE_MAP[size];
  const dotC = dotColor ?? 'var(--primary)';

  return (
    <div
      className={cn('inline-flex items-center text-text-muted', className)}
      style={{ gap: sz.gap }}
    >
      <span
        style={{
          width: sz.dot,
          height: sz.dot,
          borderRadius: '50%',
          background: dotC,
          animation: 'j-pulse 1.6s ease-in-out infinite',
          flexShrink: 0,
        }}
      />
      <span
        key={i}
        style={{
          fontFamily: 'var(--font-body)',
          fontStyle: 'italic',
          fontSize: sz.font,
          lineHeight: 1.4,
          animation: 'j-fade 2.8s ease-in-out infinite',
        }}
      >
        {lines[i]}
      </span>
      {typeof progress === 'number' && (
        <span
          style={{
            marginLeft: 8,
            height: 1,
            width: 60,
            background: 'var(--border)',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <span
            style={{
              position: 'absolute',
              inset: 0,
              background: dotC,
              width: `${progress}%`,
              transition: 'width 600ms var(--ease)',
            }}
          />
        </span>
      )}
    </div>
  );
}

export function WisdomLoaderBlock({
  section,
  className,
  message,
  planet,
  fullViewport = true,
}: {
  section?: WisdomSection;
  className?: string;
  message?: string;
  /** Optional 3D planet rendered above the cycling text. */
  planet?: PlanetKey | string;
  /** When true, fills the visible viewport (nav-aware). Default true. */
  fullViewport?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-4',
        fullViewport
          ? 'min-h-[calc(100dvh-164px)] md:min-h-[calc(100dvh-64px)] px-4'
          : 'py-12',
        className,
      )}
    >
      {planet && (
        <Planet3DInline planet={planet} size={120} />
      )}
      <WisdomLoader section={section} size="md" />
      {message && (
        <p className="text-center text-xs text-text-muted">{message}</p>
      )}
    </div>
  );
}
