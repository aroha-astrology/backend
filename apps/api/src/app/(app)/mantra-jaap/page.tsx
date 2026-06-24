'use client';

import Link from 'next/link';
import { useMantras, useClaimedTodayKeys, type Mantra } from '@/hooks/useMantras';
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

export default function MantraJaapListPage() {
  const { data: mantras, isLoading } = useMantras();
  const { data: claimedKeys } = useClaimedTodayKeys();

  return (
    <div className="px-4 lg:px-8 py-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <p className="text-xs font-semibold tracking-widest text-primary uppercase mb-2">
          Vedic Astrology
        </p>
        <h1 className="text-2xl md:text-3xl font-bold text-text mb-2 font-[family-name:var(--font-serif)]">
          Mantra Jaap
        </h1>
        <p className="text-sm text-text-muted">
          Chant mantras and find peace, earn rewards as you stay consistent.
        </p>
      </div>

      {isLoading && (
        <div className="py-12 text-center">
          <Loading size="lg" />
        </div>
      )}

      {!isLoading && mantras && (
        <div className="space-y-2">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold tracking-wider uppercase text-text-muted">
              {mantras.length} Mantras
            </p>
            <div className="text-xs px-2.5 py-1 rounded-full border border-border bg-primary/5 text-primary font-semibold">
              Claimed: {claimedKeys?.size ?? 0}/{mantras.length}
            </div>
          </div>

          {mantras.map((m) => (
            <MantraRow
              key={m.key}
              mantra={m}
              claimed={claimedKeys?.has(m.key) ?? false}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MantraRow({ mantra, claimed }: { mantra: Mantra; claimed: boolean }) {
  const halo = PLANET_HALO[mantra.key] ?? ['#D4AF37', '#A07820'];
  const glyph = DEITY_GLYPH[mantra.key] ?? '✦';

  return (
    <Link
      href={`/mantra-jaap/${mantra.key}`}
      className={`block rounded-2xl border border-border bg-surface px-3 py-3 transition-colors hover:bg-surface-2 ${
        claimed ? 'opacity-65' : ''
      }`}
    >
      <div className="flex items-center gap-3">
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 border border-primary/30"
          style={{ background: `linear-gradient(135deg, ${halo[0]}, ${halo[1]})` }}
        >
          <span className="text-xl" style={{ color: '#1E0E07' }}>{glyph}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-text">{mantra.name}</p>
          <p className="text-xs text-text-muted truncate">{mantra.mantra_text}</p>
        </div>
        <div className="flex-shrink-0">
          {claimed ? (
            <span className="text-[11px] font-medium px-2.5 py-1 rounded-full border border-border bg-surface-2 text-text-muted">
              Claimed ✓
            </span>
          ) : (
            <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full border border-primary/35 bg-primary/10 text-primary">
              Claim ₹{mantra.reward_credits} ›
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
