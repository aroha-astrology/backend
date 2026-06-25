'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  SIGN_META,
  MODALITY_GLYPH,
  POLARITY_GLYPH,
  genderLabel,
  type ZodiacSign,
} from '@/lib/zodiacMeta';

interface Props {
  sunSign: ZodiacSign | null;
  moonSign: ZodiacSign | null;
  ascendant: ZodiacSign | null;
  /** profile.gender ("male" | "female" | other | null). Drives the "Woman/Man" line. */
  gender: string | null | undefined;
  /** Link for the "Your Details" CTA. Defaults to /profile. */
  detailsHref?: string;
}

/**
 * "You" profile card — the rich zodiac identity card on the dashboard.
 *
 * Visual styling mirrors Astroline's profile card (gendered subtitle, glowing
 * avatar bubble, modality + polarity rails, Moon/Sun/Asc trio at the bottom)
 * but uses our own Unicode zodiac glyphs inside a 3D-style gradient bubble —
 * no third-party character art.
 */
export function YouProfileCard({ sunSign, moonSign, ascendant, gender, detailsHref = '/profile' }: Props) {
  // Sun sign drives the dominant identity displayed in the card.
  if (!sunSign) {
    return (
      <div className="rounded-3xl border border-border bg-surface p-6 text-center">
        <p className="text-[12px] font-semibold tracking-[0.18em] uppercase text-text-muted mb-1">You</p>
        <p className="text-sm text-text-secondary">Add your birth details to see your profile.</p>
        <Link
          href="/kundli/generate"
          className="mt-3 inline-flex items-center gap-1 rounded-full bg-primary px-4 py-1.5 text-[12px] font-semibold text-white no-underline"
        >
          Generate chart
        </Link>
      </div>
    );
  }

  const meta = SIGN_META[sunSign];
  const subtitleGender = genderLabel(gender);
  const moonMeta = moonSign ? SIGN_META[moonSign] : null;
  const ascMeta = ascendant ? SIGN_META[ascendant] : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
      className="relative overflow-hidden rounded-3xl border border-border p-5"
      style={{
        background:
          'radial-gradient(circle at 50% 20%, rgba(124,58,237,0.18) 0%, rgba(15,23,42,0) 55%), linear-gradient(180deg, rgba(13,18,28,0.92) 0%, rgba(8,12,22,0.95) 100%)',
      }}
    >
      {/* Faint star-field overlay */}
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        aria-hidden
        style={{
          backgroundImage:
            'radial-gradient(1px 1px at 12% 18%, rgba(255,255,255,0.55) 50%, transparent 51%), radial-gradient(1px 1px at 78% 32%, rgba(255,255,255,0.45) 50%, transparent 51%), radial-gradient(1px 1px at 35% 72%, rgba(255,255,255,0.4) 50%, transparent 51%), radial-gradient(1px 1px at 88% 85%, rgba(255,255,255,0.5) 50%, transparent 51%), radial-gradient(1px 1px at 18% 88%, rgba(255,255,255,0.35) 50%, transparent 51%)',
        }}
      />

      <div className="relative">
        {/* Header */}
        <div className="text-center mb-3">
          <p className="font-[family-name:var(--font-serif)] text-[24px] font-semibold tracking-wide text-[#FCD34D]">
            You
          </p>
          <p className="mt-0.5 text-[11px] text-white/70 tracking-wide">
            {subtitleGender} <span className="text-white/40">·</span> {meta.sign}{' '}
            <span className="text-white/40">·</span> {meta.element}
          </p>
        </div>

        {/* Modality / Avatar / Polarity row */}
        <div className="flex items-center justify-between mb-3">
          {/* Modality */}
          <RailItem
            icon={MODALITY_GLYPH[meta.modality]}
            label={meta.modality}
            sub="Modality"
            tint={meta.color}
          />

          {/* Glowing avatar bubble */}
          <motion.div
            initial={{ scale: 0.86, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.55, delay: 0.05, ease: 'easeOut' }}
            className="relative flex items-center justify-center"
          >
            <div
              className="absolute inset-0 rounded-full blur-2xl"
              style={{ background: meta.color, opacity: 0.32 }}
              aria-hidden
            />
            <div
              className="relative h-24 w-24 rounded-full flex items-center justify-center"
              style={{
                background: `radial-gradient(circle at 32% 30%, rgba(255,255,255,0.22) 0%, ${meta.color} 35%, #1a1228 100%)`,
                boxShadow: `0 8px 32px ${meta.color}55, inset 0 1px 0 rgba(255,255,255,0.18)`,
                border: '1px solid rgba(255,255,255,0.10)',
              }}
            >
              <span className="text-[48px] leading-none text-white drop-shadow-md" aria-hidden>
                {meta.glyph}
              </span>
            </div>
          </motion.div>

          {/* Polarity */}
          <RailItem
            icon={POLARITY_GLYPH[meta.polarity]}
            label={meta.polarity}
            sub="Polarity"
            tint={meta.color}
            align="right"
          />
        </div>

        {/* Your Details CTA */}
        <Link
          href={detailsHref}
          className="mb-4 mt-1 flex items-center justify-center rounded-full px-4 py-2 text-[12px] font-semibold text-white no-underline transition-colors hover:opacity-90"
          style={{
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.12)',
          }}
        >
          Your Details
        </Link>

        {/* Moon / Sun / Ascendant trio */}
        <div className="grid grid-cols-3 gap-2">
          <TrioItem label="Moon Sign" sign={moonMeta} />
          <TrioItem label="Sun Sign" sign={SIGN_META[sunSign]} />
          <TrioItem label="Ascendant" sign={ascMeta} />
        </div>
      </div>
    </motion.div>
  );
}

/* -------------------------------------------------------------------------- */

function RailItem({
  icon,
  label,
  sub,
  tint,
  align = 'left',
}: {
  icon: string;
  label: string;
  sub: string;
  tint: string;
  align?: 'left' | 'right';
}) {
  return (
    <div className={`flex flex-col ${align === 'right' ? 'items-end text-right' : 'items-start text-left'} flex-1`}>
      <span className="text-[20px] leading-none" style={{ color: tint }} aria-hidden>
        {icon}
      </span>
      <p className="mt-1 text-[12px] font-bold text-white leading-tight">{label}</p>
      <p className="text-[9px] tracking-wider uppercase text-white/55">{sub}</p>
    </div>
  );
}

function TrioItem({
  label,
  sign,
}: {
  label: string;
  sign: ReturnType<typeof Object> extends never ? never : (typeof SIGN_META)[ZodiacSign] | null;
}) {
  if (!sign) {
    return (
      <div className="rounded-xl px-2 py-2 text-center" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
        <p className="text-[10px] tracking-wider uppercase text-white/45">{label}</p>
        <p className="text-[11px] text-white/65 mt-0.5">—</p>
      </div>
    );
  }
  return (
    <div
      className="rounded-xl px-2 py-2 text-center"
      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
    >
      <span className="text-[18px] leading-none" style={{ color: sign.color }} aria-hidden>
        {sign.glyph}
      </span>
      <p className="text-[10px] font-bold text-white mt-1 leading-tight">{sign.sign}</p>
      <p className="text-[9px] tracking-wider uppercase text-white/55 mt-0.5">{label}</p>
    </div>
  );
}
