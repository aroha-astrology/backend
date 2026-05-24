'use client';

import { use, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useMantras } from '@/hooks/useMantras';
import { MalaCarousel } from '@/components/mantra/MalaCarousel';
import { Loading } from '@/components/ui/loading';

const PLANET_HALO: Record<string, [string, string]> = {
  sun:       ['#f5a623', '#a06310'],
  moon:      ['#b0c4de', '#5a6a85'],
  mars:      ['#e53935', '#7a1b18'],
  mercury:   ['#4caf50', '#1f5a23'],
  jupiter:   ['#ff9800', '#7a4500'],
  venus:     ['#ff80ab', '#7a3653'],
  saturn:    ['#607d8b', '#2a3a44'],
  rahu:      ['#9c27b0', '#4a0e57'],
  ketu:      ['#795548', '#3a261d'],
  ganesha:   ['#f5a623', '#a06310'],
  saraswati: ['#ffd1e8', '#a07090'],
  shiva:     ['#b0c4de', '#5a6a85'],
};

const DEITY_GLYPH: Record<string, string> = {
  sun: '☀', moon: '🌙', mars: '♂', mercury: '☿', jupiter: '♃',
  venus: '♀', saturn: '♄', rahu: '☊', ketu: '☋',
  ganesha: 'ॐ', saraswati: '✦', shiva: 'ॐ',
};

type ClaimState = 'idle' | 'claiming' | 'claimed' | 'already' | 'error';

export default function MantraJaapDetailPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = use(params);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: mantras, isLoading } = useMantras();
  const mantra = mantras?.find((m) => m.key === key);

  const [count, setCount] = useState(0);
  const [canTap, setCanTap] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [muted, setMuted] = useState(false);
  const [claimState, setClaimState] = useState<ClaimState>('idle');

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const playMantra = useCallback(() => {
    if (!mantra?.audio_url) {
      setCanTap(true);
      return;
    }
    if (!audioRef.current) {
      audioRef.current = new Audio(mantra.audio_url);
      audioRef.current.preload = 'auto';
      audioRef.current.addEventListener('ended', () => {
        setIsPlaying(false);
        setCanTap(true);
      });
    }
    audioRef.current.currentTime = 0;
    audioRef.current.muted = muted;
    setCanTap(false);
    setIsPlaying(true);
    audioRef.current.play().catch(() => {
      // autoplay was blocked — let user tap anyway
      setCanTap(true);
      setIsPlaying(false);
    });
    if (muted) {
      const wait = mantra.audio_duration_ms ?? 3000;
      setTimeout(() => {
        setIsPlaying(false);
        setCanTap(true);
      }, wait);
    }
  }, [mantra?.audio_url, mantra?.audio_duration_ms, muted]);

  // Auto-play first recitation once audio URL is known.
  useEffect(() => {
    if (mantra?.audio_url) {
      playMantra();
    } else if (mantra) {
      setCanTap(true);
    }
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mantra?.audio_url]);

  function handleCount() {
    if (!mantra || !canTap || isComplete) return;
    const next = count + 1;
    setCount(next);
    setCanTap(false);
    if (next >= mantra.jaap_count) {
      setIsComplete(true);
      claimReward();
    } else {
      playMantra();
    }
  }

  async function claimReward() {
    if (!mantra) return;
    setClaimState('claiming');
    try {
      const res = await fetch('/api/credits/jaap-reward', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: mantra.key }),
      });
      if (res.status === 409) {
        setClaimState('already');
        return;
      }
      if (!res.ok) {
        setClaimState('error');
        return;
      }
      setClaimState('claimed');
      queryClient.invalidateQueries({ queryKey: ['mantras', 'claimed_today'] });
      queryClient.invalidateQueries({ queryKey: ['credits-balance'] });
    } catch {
      setClaimState('error');
    }
  }

  if (isLoading || !mantra) {
    return (
      <div className="py-16 text-center">
        <Loading size="lg" />
      </div>
    );
  }

  const halo = PLANET_HALO[mantra.key] ?? ['#D4AF37', '#A07820'];
  const glyph = DEITY_GLYPH[mantra.key] ?? '✦';
  const progress = Math.min(1, count / mantra.jaap_count);

  return (
    <div className="px-4 lg:px-8 py-6 max-w-xl mx-auto">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="Back"
          className="w-9 h-9 rounded-xl border border-border bg-surface flex items-center justify-center text-primary"
        >
          ←
        </button>
        <p className="text-sm font-bold tracking-[0.25em] text-primary font-[family-name:var(--font-serif)]">
          MANTRA JAAP
        </p>
        <div className="w-9 h-9" />
      </div>

      {/* Deity badge */}
      <div className="flex justify-center mb-4">
        <div
          className="w-28 h-28 rounded-full flex items-center justify-center border border-primary/35 shadow-lg"
          style={{ background: `linear-gradient(135deg, ${halo[0]}, ${halo[1]})` }}
        >
          <span className="text-5xl" style={{ color: '#1E0E07' }}>{glyph}</span>
        </div>
      </div>

      {/* Name + description */}
      <h1 className="text-2xl md:text-3xl font-bold text-center text-primary mb-2 font-[family-name:var(--font-serif)]">
        {mantra.name}
      </h1>
      <p className="text-sm text-center text-text-muted mb-4 px-4 leading-snug">
        {mantra.description}
      </p>

      <div className="flex justify-center mb-6">
        <span className="text-xs font-semibold px-3 py-1 rounded-full border border-primary/35 bg-primary/10 text-primary">
          Reward  ₹{mantra.reward_credits}
        </span>
      </div>

      {/* Mantra text divider */}
      <div className="flex items-center gap-2 mb-4">
        <div className="flex-1 h-px bg-primary/20" />
        <span className="text-primary text-xs">✦</span>
        <p className="text-sm font-semibold text-primary font-[family-name:var(--font-serif)] text-center px-2">
          {mantra.mantra_text}
        </p>
        <span className="text-primary text-xs">✦</span>
        <div className="flex-1 h-px bg-primary/20" />
      </div>

      {/* Audio button */}
      <div className="flex justify-center mb-4">
        <button
          type="button"
          onClick={() => {
            setMuted((m) => {
              const next = !m;
              if (audioRef.current) audioRef.current.muted = next;
              return next;
            });
          }}
          className="w-11 h-11 rounded-full border border-border bg-surface flex items-center justify-center text-primary"
          aria-label={muted ? 'Unmute' : 'Mute'}
        >
          {muted ? '🔇' : '🔊'}
        </button>
      </div>

      {/* Mala carousel + counter */}
      <div className="relative flex flex-col items-center mt-2">
        <MalaCarousel
          count={count}
          jaapCount={mantra.jaap_count}
          mukhi={mantra.mukhi}
          locked={!canTap || isComplete}
          isPlaying={isPlaying}
          onTap={handleCount}
        />

        <p className="mt-2 text-sm font-semibold text-text">
          {count}/{mantra.jaap_count}
        </p>

        {/* Progress bar */}
        <div className="mt-3 w-full max-w-xs h-1 rounded-full bg-primary/10 overflow-hidden">
          <div className="h-full bg-primary" style={{ width: `${progress * 100}%` }} />
        </div>

        {!isComplete && (
          <p className="mt-4 text-xs text-text-muted">
            {isPlaying ? 'Listen…' : canTap ? 'Tap the bead to count' : 'Loading audio…'}
          </p>
        )}
      </div>

      {/* Complete state */}
      {isComplete && (
        <div className="mt-6 rounded-2xl border border-primary/30 bg-primary/10 p-5 text-center">
          <p className="text-lg font-bold text-primary mb-1 font-[family-name:var(--font-serif)]">
            Session Complete
          </p>
          <p className="text-sm text-text mb-4">
            {claimState === 'claiming' && 'Granting reward…'}
            {claimState === 'claimed' && `+₹${mantra.reward_credits} added to your wallet`}
            {claimState === 'already' && 'You already claimed this mantra today'}
            {claimState === 'error' && 'Could not grant reward. Try again later.'}
            {claimState === 'idle' && 'Tap below to claim your reward.'}
          </p>
          <div className="flex gap-3 justify-center">
            {claimState === 'idle' && (
              <button
                type="button"
                onClick={claimReward}
                className="px-5 py-2 rounded-xl bg-primary text-[#1E0E07] font-bold text-sm"
              >
                Claim ₹{mantra.reward_credits}
              </button>
            )}
            <Link
              href="/mantra-jaap"
              className="px-5 py-2 rounded-xl border border-primary/40 text-primary font-semibold text-sm"
            >
              Done
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
