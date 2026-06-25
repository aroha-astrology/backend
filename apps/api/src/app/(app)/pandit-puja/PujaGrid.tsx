'use client';

import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { useMemo, useState } from 'react';
import type { MatchedPuja } from './match';

const ALL_FILTERS: { key: string; label: string }[] = [
  { key: 'all',        label: 'All' },
  { key: 'foryou',     label: '✨ For You' },
  { key: 'obstacles',  label: 'Obstacles' },
  { key: 'health',     label: 'Health' },
  { key: 'wealth',     label: 'Wealth' },
  { key: 'marriage',   label: 'Marriage' },
  { key: 'career',     label: 'Career' },
  { key: 'protection', label: 'Protection' },
  { key: 'education',  label: 'Education' },
  { key: 'home',       label: 'Home & Vastu' },
  { key: 'moksha',     label: 'Moksha' },
  { key: 'childbirth', label: 'Children' },
  { key: 'property',   label: 'Property' },
];

function PercentBadge({ score, hasMatch, reasons }: { score: number; hasMatch: boolean; reasons: string[] }) {
  const high = hasMatch && score >= 75;
  const mid  = hasMatch && score >= 50 && score < 75;
  return (
    <div
      className="absolute top-2 right-2 z-10 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-extrabold pointer-events-none"
      style={{
        background: high ? 'var(--primary)' : mid ? 'rgba(212, 175, 55,0.18)' : 'var(--surface-2)',
        color:      high ? '#fff' : mid ? 'var(--primary)' : 'var(--text-muted)',
        border:     high ? 'none' : `1px solid ${mid ? 'rgba(212, 175, 55,0.35)' : 'var(--border)'}`,
        boxShadow:  high ? '0 2px 6px rgba(212, 175, 55,0.30)' : 'none',
      }}
      title={hasMatch ? `${score}% chart match — ${reasons.join(', ')}` : `${score}% baseline`}
    >
      {high && (
        <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
      )}
      {score}%
    </div>
  );
}

function describeBenefit(reason: string): string {
  const r = reason.toLowerCase();
  if (r.includes('mangal'))      return 'Pacifies the Mars affliction in your chart — eases conflicts, anger, marital friction.';
  if (r.includes('kaal sarp'))   return 'Loosens the Rahu–Ketu axis pressure that constricts opportunities.';
  if (r.includes('sade sati'))   return 'Cushions the active 7.5-year Saturn transit you are passing through.';
  if (r.includes('pitra'))       return 'Honours ancestral debts indicated in your chart — clears family-line obstacles.';
  if (r.includes('kemdruma'))    return 'Restores Moon support — lifts emotional isolation and instability.';
  if (r.includes('grahan'))      return 'Clears eclipse-formed affliction — improves clarity, health, focus.';
  if (r.includes('guru chandal'))return 'Rebalances Jupiter when shadowed by Rahu — restores wisdom and ethics.';
  if (r.includes('mahadasha'))   return `You are running the ${reason} period — this puja strengthens its ruling planet for the years ahead.`;
  if (r.includes('antardasha'))  return `Your current sub-period (${reason}) is ruled by this planet — this puja amplifies its results.`;
  if (r.startsWith('weak '))     return `${reason} (low Shadbala) — this puja strengthens that planet's effects across all life areas it governs.`;
  return reason;
}

function formatDuration(min: number | null): string | null {
  if (!min) return null;
  if (min >= 60) {
    const h = Math.round(min / 60);
    return `${h} ${h === 1 ? 'hour' : 'hours'}`;
  }
  return `${min} min`;
}

function PujaCard({ puja, onClick, availableInCity, hasChart }: { puja: MatchedPuja; onClick: () => void; availableInCity: boolean; hasChart: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const imageUrl = supabaseUrl && puja.image_path
    ? `${supabaseUrl}/storage/v1/object/public/pujas/${puja.image_path}`
    : null;
  const isMatch = puja.matchReasons.length > 0;
  const duration = formatDuration(puja.duration_min);

  return (
    <motion.div
      className="relative rounded-2xl border bg-surface overflow-hidden"
      style={{
        borderColor: isMatch ? 'rgba(212, 175, 55,0.35)' : 'var(--border)',
        boxShadow: isMatch ? '0 1px 0 rgba(212, 175, 55,0.10)' : 'none',
      }}
    >
      <PercentBadge score={puja.score} hasMatch={isMatch} reasons={puja.matchReasons} />

      <motion.button
        onClick={onClick}
        whileTap={{ scale: 0.98 }}
        className="flex flex-row items-center gap-3 p-3 cursor-pointer text-left w-full bg-transparent border-none"
      >
        <div
          className="relative w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden"
          style={{ background: 'linear-gradient(135deg, rgba(212, 175, 55,0.12) 0%, var(--surface-2) 100%)' }}
        >
          {imageUrl ? (
            <Image src={imageUrl} alt={puja.name_en} fill className="object-cover" sizes="56px" />
          ) : (
            <span className="text-2xl">{deityEmoji(puja.deity)}</span>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="text-[12px] font-extrabold text-text leading-tight pr-12">{puja.name_en}</h3>
          <p className="text-[10px] text-text-muted leading-snug line-clamp-2 mt-0.5">{puja.short_desc}</p>

          <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
            {puja.matchReasons.slice(0, 2).map(r => (
              <span
                key={r}
                className="text-[8px] px-1.5 py-0.5 rounded-md font-bold"
                style={{ background: 'rgba(212, 175, 55,0.12)', color: 'var(--text)' }}
              >
                {r}
              </span>
            ))}
            {duration && puja.matchReasons.length === 0 && (
              <span className="text-[8px] text-text-muted">⏱ {duration}</span>
            )}
            {availableInCity && (
              <span
                className="text-[8px] px-1.5 py-0.5 rounded-md font-semibold"
                style={{ background: 'rgba(46,160,67,0.10)', color: '#2EA043' }}
              >
                ✓ Available nearby
              </span>
            )}
            <span className="text-[10px] font-semibold text-primary ml-auto flex items-center gap-0.5 flex-shrink-0">
              Find Pandit <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
            </span>
          </div>
        </div>
      </motion.button>

      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full px-3 py-1.5 text-[10px] font-bold flex items-center justify-center gap-1 cursor-pointer border-none border-t"
        style={{
          background: expanded ? 'rgba(212, 175, 55,0.06)' : 'transparent',
          color: 'var(--text)',
          borderTopColor: 'var(--border)',
          borderTopStyle: 'solid',
          borderTopWidth: '1px',
        }}
        aria-expanded={expanded}
      >
        {expanded ? 'See less' : 'See more — benefits for your chart'}
        <motion.svg
          width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <polyline points="6 9 12 15 18 9"/>
        </motion.svg>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="expanded"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            style={{ overflow: 'hidden' }}
          >
            <div
              className="px-3 py-3 border-t"
              style={{ background: 'rgba(212, 175, 55,0.04)', borderTopColor: 'var(--border)' }}
            >
              {isMatch ? (
                <>
                  <p className="text-[9px] font-extrabold uppercase tracking-wide mb-1.5" style={{ color: 'var(--text)', letterSpacing: '0.06em' }}>
                    ✨ Why it benefits your chart
                  </p>
                  <ul className="space-y-1.5 mb-3 list-none p-0">
                    {puja.matchReasons.map(reason => (
                      <li key={reason} className="flex items-start gap-1.5 text-[10.5px] text-text leading-snug">
                        <span className="text-primary font-extrabold flex-shrink-0 mt-0.5">›</span>
                        <span><span className="font-bold">{reason}:</span> {describeBenefit(reason)}</span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : hasChart ? (
                <p className="text-[10.5px] text-text-muted leading-snug mb-3">
                  No direct dosha or dasha match in your chart — this puja is offered for its general spiritual merit and the life-areas it traditionally governs.
                </p>
              ) : (
                <p className="text-[10.5px] text-text-muted leading-snug mb-3">
                  Add your birth details to see exactly how this puja can benefit your chart.
                </p>
              )}

              {puja.long_desc && puja.long_desc !== puja.short_desc && (
                <>
                  <p className="text-[9px] font-extrabold uppercase tracking-wide text-text-muted mb-1" style={{ letterSpacing: '0.06em' }}>
                    About this puja
                  </p>
                  <p className="text-[10.5px] text-text leading-snug mb-3">{puja.long_desc}</p>
                </>
              )}

              <div className="flex items-center gap-3 flex-wrap text-[10px] text-text-muted">
                {puja.deity && <span><span className="font-bold text-text">Deity:</span> {puja.deity}</span>}
                {duration && <span><span className="font-bold text-text">Duration:</span> {duration}</span>}
                {puja.intent_tags.length > 0 && (
                  <span><span className="font-bold text-text">Helps with:</span> {puja.intent_tags.slice(0, 4).join(', ')}</span>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function deityEmoji(deity: string): string {
  const d = deity.toLowerCase();
  if (d.includes('ganesha') || d.includes('ganesh'))   return '🐘';
  if (d.includes('shiva') || d.includes('rudra'))       return '🔱';
  if (d.includes('vishnu') || d.includes('narayan'))    return '🪷';
  if (d.includes('durga') || d.includes('chandi') || d.includes('kali')) return '⚔️';
  if (d.includes('lakshmi'))                             return '💛';
  if (d.includes('saraswati'))                          return '🎵';
  if (d.includes('hanuman'))                             return '🙏';
  if (d.includes('surya') || d.includes('sun'))         return '☀️';
  if (d.includes('chandra') || d.includes('moon'))      return '🌙';
  if (d.includes('shani') || d.includes('saturn'))      return '🪐';
  if (d.includes('mangal') || d.includes('mars'))       return '🔴';
  if (d.includes('rahu') || d.includes('ketu'))         return '🐍';
  if (d.includes('pitru') || d.includes('ancestor'))    return '🕯️';
  if (d.includes('vastu'))                               return '🏛️';
  return '🕉️';
}

interface Props {
  pujas: MatchedPuja[];
  hasChart: boolean;
  intentFilter: string;
  onFilterChange: (f: string) => void;
  onPujaClick: (puja: MatchedPuja) => void;
  cityLabel: string | null;
  availableSlugs: Set<string>;
}

export function PujaGrid({ pujas, hasChart, intentFilter, onFilterChange, onPujaClick, cityLabel, availableSlugs }: Props) {
  const matched   = pujas.filter(p => p.matchReasons.length > 0);
  const others    = pujas.filter(p => p.matchReasons.length === 0);
  const showSections = hasChart && matched.length > 0 && intentFilter === 'all';

  // Only render filters that actually have data in the unfiltered set, plus 'all' and 'foryou'.
  const visibleFilters = useMemo(() => {
    const tagsInUse = new Set<string>();
    pujas.forEach(p => p.intent_tags.forEach(t => tagsInUse.add(t)));
    return ALL_FILTERS.filter(f => {
      if (f.key === 'all') return true;
      if (f.key === 'foryou') return hasChart && matched.length > 0;
      return tagsInUse.has(f.key);
    });
  }, [pujas, hasChart, matched.length]);

  const visiblePujas = intentFilter === 'foryou' ? matched : pujas;

  return (
    <div>
      {/* Filter pills */}
      <div className="flex gap-2 overflow-x-auto pb-2 px-4 lg:px-8 mb-4" style={{ scrollbarWidth: 'none' }}>
        {visibleFilters.map(f => (
          <button
            key={f.key}
            onClick={() => onFilterChange(f.key)}
            className="flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-semibold cursor-pointer border transition-all"
            style={{
              background:  intentFilter === f.key ? 'var(--primary)' : 'var(--surface-2)',
              color:       intentFilter === f.key ? '#fff' : 'var(--text-muted)',
              borderColor: intentFilter === f.key ? 'var(--primary)' : 'var(--border)',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {!hasChart && (
        <div
          className="mx-4 lg:mx-8 mb-4 rounded-2xl px-4 py-3 flex items-center gap-2"
          style={{ background: 'rgba(212, 175, 55,0.08)', border: '1px solid rgba(212, 175, 55,0.20)' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <p className="text-[11px] text-text-muted leading-snug">
            Add your birth details to see pujas ranked by your chart, current dasha, and doshas.
          </p>
        </div>
      )}

      {visiblePujas.length === 0 ? (
        <p className="text-center text-[13px] text-text-muted py-12">No pujas found for this filter.</p>
      ) : showSections ? (
        <>
          <SectionHeader
            title="Recommended for you"
            subtitle={`Matched to your chart, current dasha${cityLabel ? ` & pandits in ${cityLabel}` : ''}`}
            highlight
          />
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 px-4 lg:px-8 mb-6">
            {matched.map(p => (
              <PujaCard key={p.id} puja={p} onClick={() => onPujaClick(p)} availableInCity={availableSlugs.has(p.slug)} hasChart={hasChart} />
            ))}
          </div>
          <SectionHeader title="More sacred pujas" subtitle={`${others.length} other rituals from across India`} />
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 px-4 lg:px-8">
            {others.map(p => (
              <PujaCard key={p.id} puja={p} onClick={() => onPujaClick(p)} availableInCity={availableSlugs.has(p.slug)} hasChart={hasChart} />
            ))}
          </div>
        </>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 px-4 lg:px-8">
          {visiblePujas.map(p => (
            <PujaCard key={p.id} puja={p} onClick={() => onPujaClick(p)} availableInCity={availableSlugs.has(p.slug)} hasChart={hasChart} />
          ))}
        </div>
      )}
    </div>
  );
}

function SectionHeader({ title, subtitle, highlight = false }: { title: string; subtitle: string; highlight?: boolean }) {
  return (
    <div className="px-4 lg:px-8 mb-3 mt-1">
      <h2 className="text-[14px] font-extrabold text-text flex items-center gap-1.5">
        {highlight && <span className="text-base">✨</span>}
        {title}
      </h2>
      <p className="text-[10px] text-text-muted mt-0.5">{subtitle}</p>
    </div>
  );
}
