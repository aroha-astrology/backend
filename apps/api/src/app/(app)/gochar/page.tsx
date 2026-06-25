'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MotionPage, FadeIn, StaggerList, StaggerItem, ScrollReveal } from '@/components/ui/motion-primitives';
import { staggerContainer, staggerItem } from '@/lib/motion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loading } from '@/components/ui/loading';
import { useStore } from '@/store/useStore';
import { useActiveChart } from '@/hooks/useActiveChart';
import type { PlanetPosition, ZodiacSign, ChartData } from '@aroha-astrology/shared';
import { ZODIAC_TO_RASHI } from '@aroha-astrology/shared';
import { NavagrahaTransit3D } from '@/components/3d/NavagrahaTransit3D';

// ============================================================
// Types
// ============================================================

interface NextSignChange {
  planet: string;
  daysUntil: number;
  nextSign: string;
  approxDate: string;
}

interface TransitData {
  planets: PlanetPosition[];
  calculatedAt: string;
  nextSignChanges: NextSignChange[];
}

// ============================================================
// Constants
// ============================================================

const PLANET_SYMBOLS: Record<string, string> = {
  Sun: '\u2609',
  Moon: '\u263D',
  Mars: '\u2642',
  Mercury: '\u263F',
  Jupiter: '\u2643',
  Venus: '\u2640',
  Saturn: '\u2644',
  Rahu: '\u260A',
  Ketu: '\u260B',
};

const PLANET_COLORS: Record<string, string> = {
  Sun: '#f97316',
  Moon: '#a87fff',
  Mars: '#ef4444',
  Mercury: '#10b981',
  Jupiter: 'var(--primary)',
  Venus: '#ec4899',
  Saturn: '#94a3b8',
  Rahu: '#6366f1',
  Ketu: '#f43f5e',
};

const HOUSE_MEANINGS: Record<number, string> = {
  1: 'Self, personality, health',
  2: 'Wealth, family, speech',
  3: 'Siblings, courage, communication',
  4: 'Home, mother, comforts',
  5: 'Children, intelligence, creativity',
  6: 'Enemies, disease, daily work',
  7: 'Marriage, partnerships, business',
  8: 'Resilience, transformation, hidden matters',
  9: 'Luck, dharma, higher learning',
  10: 'Career, reputation, authority',
  11: 'Gains, income, social network',
  12: 'Losses, moksha, foreign lands',
};

const TRANSIT_EFFECTS: Record<string, Record<number, string>> = {
  Jupiter: {
    1: 'Favorable — growth in confidence and health',
    2: 'Favorable — increase in wealth and family harmony',
    3: 'Neutral — moderate effort needed for progress',
    4: 'Challenging — domestic adjustments, emotional introspection',
    5: 'Very favorable — creativity, children, romance thrive',
    6: 'Challenging — health caution, competition at work',
    7: 'Favorable — great for partnerships and marriage',
    8: 'Challenging — transformation period, hidden obstacles',
    9: 'Very favorable — luck, travel, spiritual growth',
    10: 'Favorable — career advancement and recognition',
    11: 'Very favorable — financial gains, fulfillment of desires',
    12: 'Neutral — spiritual progress, expenses may rise',
  },
  Saturn: {
    1: 'Challenging — Sade Sati effects, patience required',
    2: 'Challenging — financial caution, family tensions',
    3: 'Favorable — courage and determination strengthened',
    4: 'Challenging — domestic stress, property matters delayed',
    5: 'Challenging — children concerns, creative blocks',
    6: 'Favorable — victory over enemies and competition',
    7: 'Challenging — relationship tests, delays in partnerships',
    8: 'Challenging — health vigilance, unexpected changes',
    9: 'Neutral — spiritual discipline, travel delays',
    10: 'Neutral — career restructuring, hard work rewarded',
    11: 'Favorable — steady gains, social expansion',
    12: 'Challenging — increased expenses, need for rest',
  },
};

// ============================================================
// Helpers
// ============================================================

function getTransitHouse(transitSignIndex: number, ascSignIndex: number): number {
  return ((transitSignIndex - ascSignIndex + 12) % 12) + 1;
}

function getTransitEffect(planet: string, house: number): string {
  const planetEffects = TRANSIT_EFFECTS[planet];
  if (planetEffects && planetEffects[house]) {
    return planetEffects[house];
  }
  const benefics = ['Jupiter', 'Venus', 'Mercury', 'Moon'];
  const isBenefic = benefics.includes(planet);
  if ([1, 5, 9].includes(house)) return isBenefic ? 'Favorable — trine activation' : 'Mixed — effort needed';
  if ([4, 7, 10].includes(house)) return isBenefic ? 'Favorable — kendra activation' : 'Challenging — adjustments needed';
  if ([6, 8, 12].includes(house)) return 'Challenging — caution advised';
  return 'Neutral — moderate influence';
}

// ============================================================
// Component
// ============================================================

export default function GocharPage() {
  const [data, setData] = useState<TransitData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { activeChart } = useActiveChart();

  const natalChart: ChartData | null = (() => {
    if (!activeChart) return null;
    if (activeChart?.chart_data && typeof activeChart.chart_data === 'object') {
      return activeChart.chart_data as unknown as ChartData;
    }
    return null;
  })();

  const ascSignIndex = natalChart?.ascendant?.signIndex ?? null;

  const fetchTransits = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/gochar');
      if (!res.ok) throw new Error('Failed to load transit data');
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Unknown error');
      setData(json.data);
    } catch {
      setError('Could not load transit data. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTransits();
  }, [fetchTransits]);

  const retroPlanets = data?.planets.filter((p) => p.isRetrograde) ?? [];

  return (
    <MotionPage className="mx-auto max-w-7xl px-4 py-6 min-h-screen">

      {/* ── Header ── */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-semibold tracking-[0.2em] text-primary/70 uppercase mb-1">Planetary Transits</p>
          <h1 className="font-[family-name:var(--font-serif)] text-2xl md:text-3xl font-bold text-text tracking-wide">
            Gochar Tracker
          </h1>
          <p className="text-xs text-text-secondary mt-1">
            Current positions and their effects on your chart
          </p>
        </div>
        <Button onClick={fetchTransits} disabled={loading} variant="ghost" size="sm">
          {loading ? 'Refreshing…' : '↻ Refresh'}
        </Button>
      </div>

      {loading && <Loading size="lg" section="kundli" className="py-20" />}
      {error && (
        <div className="py-6 px-4 rounded-2xl glass-1 border-error/30 text-center text-sm text-error">{error}</div>
      )}

      {!loading && data && (
        <div className="space-y-5">

          {/* ── 3D Navagraha Live Scene ── */}
          <FadeIn>
            <div className="relative overflow-hidden rounded-[16px] border border-border bg-[var(--card-bg)] backdrop-blur-[8px] shadow-[0_0_25px_rgba(212,175,55,0.18)]">
              <div className="absolute top-4 left-5 z-10 pointer-events-none">
                <p className="j-eyebrow text-[10px]">Live Cosmos</p>
                <h2 className="j-display text-base text-text mt-0.5">Navagraha in Motion</h2>
              </div>
              <NavagrahaTransit3D planets={data.planets.map((p) => ({
                planet: p.planet,
                longitude: typeof p.longitude === 'number' ? p.longitude : 0,
                isRetrograde: p.isRetrograde,
              }))} height={400} />
            </div>
          </FadeIn>

          {/* ── Retrograde Alert ── */}
          <AnimatePresence>
            {retroPlanets.length > 0 && (
              <FadeIn>
                <div
                  className="rounded-2xl px-5 py-3.5 flex flex-wrap items-center gap-3"
                  style={{
                    background: 'rgba(212, 175, 55,0.06)',
                    border: '1px solid rgba(212, 175, 55,0.25)',
                    boxShadow: '0 0 24px rgba(212, 175, 55,0.06)',
                  }}
                >
                  <span className="text-xs font-bold text-primary uppercase tracking-wider">℞ Retrograde Planets:</span>
                  {retroPlanets.map((p) => (
                    <Badge key={p.planet} variant="gold">
                      {PLANET_SYMBOLS[p.planet]} {p.planet}
                    </Badge>
                  ))}
                </div>
              </FadeIn>
            )}
          </AnimatePresence>

          {/* ── Current Transit Positions Table ── */}
          <ScrollReveal>
            <div className="rounded-2xl glass-2 overflow-hidden" style={{ border: '1px solid rgba(212, 175, 55,0.16)' }}>
              <div className="px-5 py-3 border-b border-[rgba(212, 175, 55,0.12)]">
                <h2 className="font-[family-name:var(--font-serif)] text-sm font-bold text-text tracking-wide">
                  Current Transit Positions
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(212, 175, 55,0.10)' }}>
                      {['Planet', 'Sign (Rashi)', 'Degree', 'Nakshatra', 'Status'].map((h) => (
                        <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-text-secondary uppercase tracking-wider">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <motion.tbody variants={staggerContainer} initial="initial" animate="animate">
                    {data.planets.map((p) => {
                      const color = PLANET_COLORS[p.planet] || 'var(--primary)';
                      return (
                        <motion.tr
                          key={p.planet}
                          variants={staggerItem}
                          className="transition-colors hover:bg-[rgba(212, 175, 55,0.04)]"
                          style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              <div
                                className="w-8 h-8 rounded-lg flex items-center justify-center text-base flex-shrink-0"
                                style={{ background: `${color}15`, border: `1px solid ${color}35`, color }}
                              >
                                {PLANET_SYMBOLS[p.planet]}
                              </div>
                              <span className="text-sm font-semibold text-text">{p.planet}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-text">
                            {p.sign}{' '}
                            <span className="text-text-secondary text-xs">
                              ({ZODIAC_TO_RASHI[p.sign as ZodiacSign]})
                            </span>
                          </td>
                          <td className="px-4 py-3 font-mono text-sm text-primary">
                            {p.signDegree.toFixed(2)}°
                          </td>
                          <td className="px-4 py-3 text-sm text-text">
                            {p.nakshatra}{' '}
                            <span className="text-text-secondary text-xs">P{p.nakshatraPada}</span>
                          </td>
                          <td className="px-4 py-3">
                            {p.isRetrograde ? (
                              <Badge variant="warning" size="xs">℞ Retro</Badge>
                            ) : (
                              <Badge variant="teal" size="xs">Direct</Badge>
                            )}
                          </td>
                        </motion.tr>
                      );
                    })}
                  </motion.tbody>
                </table>
              </div>
              <p className="px-5 py-2.5 text-[10px] text-text-secondary border-t border-[rgba(0,0,0,0.08)]">
                Calculated at {new Date(data.calculatedAt).toLocaleString()} · Lahiri Ayanamsa
              </p>
            </div>
          </ScrollReveal>

          {/* ── Impact on Your Chart ── */}
          {ascSignIndex !== null ? (
            <ScrollReveal>
              <div className="rounded-2xl glass-2 overflow-hidden" style={{ border: '1px solid rgba(212, 175, 55,0.16)' }}>
                <div className="px-5 py-3 border-b border-[rgba(212, 175, 55,0.12)]">
                  <h2 className="font-[family-name:var(--font-serif)] text-sm font-bold text-text tracking-wide">
                    Impact on Your Natal Chart
                  </h2>
                  <p className="text-[10px] text-text-secondary mt-0.5">
                    Ascendant: <span className="text-primary font-semibold">{natalChart?.ascendant?.sign}</span>
                  </p>
                </div>
                <div className="p-4">
                  <StaggerList className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {data.planets.map((p) => {
                      const house = getTransitHouse(p.signIndex, ascSignIndex);
                      const effect = getTransitEffect(p.planet, house);
                      const isPositive = effect.startsWith('Favorable') || effect.startsWith('Very favorable');
                      const isChallenging = effect.startsWith('Challenging');
                      const color = PLANET_COLORS[p.planet] || 'var(--primary)';
                      const cardBg = isPositive ? 'rgba(16,185,129,0.06)' : isChallenging ? 'rgba(239,68,68,0.06)' : 'rgba(0,0,0,0.03)';
                      const cardBorder = isPositive ? 'rgba(16,185,129,0.22)' : isChallenging ? 'rgba(239,68,68,0.22)' : 'rgba(0,0,0,0.08)';

                      return (
                        <StaggerItem key={p.planet}>
                          <div
                            className="rounded-xl p-3.5 transition-all"
                            style={{ background: cardBg, border: `1px solid ${cardBorder}` }}
                          >
                            <div className="flex items-center justify-between mb-1.5">
                              <div className="flex items-center gap-2">
                                <span style={{ color, fontSize: 16 }}>{PLANET_SYMBOLS[p.planet]}</span>
                                <span className="text-sm font-bold text-text">{p.planet}</span>
                              </div>
                              <Badge variant={isPositive ? 'success' : isChallenging ? 'error' : 'outline'} size="xs">
                                H{house}
                              </Badge>
                            </div>
                            <p className="text-[10px] text-text-secondary mb-1">
                              {p.sign} ({ZODIAC_TO_RASHI[p.sign as ZodiacSign]})
                            </p>
                            <p className="text-xs text-text leading-snug">{effect}</p>
                            <p className="text-[10px] text-text-secondary mt-1 italic">{HOUSE_MEANINGS[house]}</p>
                            {p.isRetrograde && (
                              <Badge variant="warning" size="xs" className="mt-2">℞ Retrograde</Badge>
                            )}
                          </div>
                        </StaggerItem>
                      );
                    })}
                  </StaggerList>
                </div>
              </div>
            </ScrollReveal>
          ) : (
            <FadeIn>
              <div
                className="rounded-2xl p-5 glass-1 text-center"
                style={{ border: '1px solid rgba(212, 175, 55,0.14)' }}
              >
                <span className="text-3xl block mb-2">🪐</span>
                <h3 className="font-[family-name:var(--font-serif)] text-sm font-semibold text-text mb-1">No Natal Chart Found</h3>
                <p className="text-xs text-text-secondary">
                  Generate a Kundli to see how current transits impact your natal houses.
                </p>
              </div>
            </FadeIn>
          )}

          {/* ── Upcoming Sign Changes ── */}
          <ScrollReveal>
            <div className="rounded-2xl glass-2 overflow-hidden" style={{ border: '1px solid rgba(212, 175, 55,0.16)' }}>
              <div className="px-5 py-3 border-b border-[rgba(212, 175, 55,0.12)]">
                <h2 className="font-[family-name:var(--font-serif)] text-sm font-bold text-text tracking-wide">
                  Upcoming Sign Changes
                </h2>
              </div>
              <div className="p-4">
                <StaggerList className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {data.nextSignChanges
                    .slice()
                    .sort((a, b) => a.daysUntil - b.daysUntil)
                    .map((change) => {
                      const isImminent = change.daysUntil <= 7;
                      const isSoon = change.daysUntil <= 30;
                      const color = PLANET_COLORS[change.planet] || 'var(--primary)';

                      return (
                        <StaggerItem key={change.planet}>
                          <div
                            className="rounded-xl p-3.5 transition-all"
                            style={{
                              background: isImminent ? 'rgba(212, 175, 55,0.07)' : 'rgba(0,0,0,0.03)',
                              border: `1px solid ${isImminent ? 'rgba(212, 175, 55,0.30)' : 'rgba(0,0,0,0.08)'}`,
                              boxShadow: isImminent ? '0 0 20px rgba(212, 175, 55,0.06)' : 'none',
                            }}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <span style={{ color, fontSize: 16 }}>{PLANET_SYMBOLS[change.planet]}</span>
                                <span className="text-sm font-bold text-text">{change.planet}</span>
                              </div>
                              {isImminent ? (
                                <Badge variant="gold" size="xs">Imminent</Badge>
                              ) : isSoon ? (
                                <Badge variant="default" size="xs">Soon</Badge>
                              ) : (
                                <Badge variant="outline" size="xs">Upcoming</Badge>
                              )}
                            </div>
                            <p className="text-xs text-text">
                              → <span className="font-semibold">
                                {change.nextSign} ({ZODIAC_TO_RASHI[change.nextSign as ZodiacSign]})
                              </span>
                            </p>
                            <div className="flex items-center justify-between mt-1.5">
                              <span className="text-[10px] text-text-secondary">~{change.daysUntil} days</span>
                              <span className="text-[10px] text-primary font-semibold">{change.approxDate}</span>
                            </div>
                          </div>
                        </StaggerItem>
                      );
                    })}
                </StaggerList>
                <p className="mt-4 text-[10px] text-text-secondary">
                  Approximate dates based on average planetary speeds. May vary with retrograde motion.
                </p>
              </div>
            </div>
          </ScrollReveal>

        </div>
      )}
    </MotionPage>
  );
}
