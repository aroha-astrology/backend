'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MotionPage, FadeIn, StaggerList, StaggerItem } from '@/components/ui/motion-primitives';
import { Card, CardContent } from '@/components/ui/card';
import { Loading } from '@/components/ui/loading';
import { useStore } from '@/store/useStore';
import { useActiveChart } from '@/hooks/useActiveChart';

/* -------------------------------------------------------------------------- */
/*  Types & Constants                                                         */
/* -------------------------------------------------------------------------- */

interface RashiInfo { id: string; name: string; english: string; emoji: string }

const RASHIS: RashiInfo[] = [
  { id: 'mesha', name: 'Mesha', english: 'Aries', emoji: '&#9800;' },
  { id: 'vrishabha', name: 'Vrishabha', english: 'Taurus', emoji: '&#9801;' },
  { id: 'mithuna', name: 'Mithuna', english: 'Gemini', emoji: '&#9802;' },
  { id: 'karka', name: 'Karka', english: 'Cancer', emoji: '&#9803;' },
  { id: 'simha', name: 'Simha', english: 'Leo', emoji: '&#9804;' },
  { id: 'kanya', name: 'Kanya', english: 'Virgo', emoji: '&#9805;' },
  { id: 'tula', name: 'Tula', english: 'Libra', emoji: '&#9806;' },
  { id: 'vrischika', name: 'Vrischika', english: 'Scorpio', emoji: '&#9807;' },
  { id: 'dhanu', name: 'Dhanu', english: 'Sagittarius', emoji: '&#9808;' },
  { id: 'makara', name: 'Makara', english: 'Capricorn', emoji: '&#9809;' },
  { id: 'kumbha', name: 'Kumbha', english: 'Aquarius', emoji: '&#9810;' },
  { id: 'meena', name: 'Meena', english: 'Pisces', emoji: '&#9811;' },
];

interface KeyDate { date: string; event: string }
interface WeekBlock { weekNumber: number; dateRange: string; prediction: string; keyDates: KeyDate[] }
interface RatingItem { area: string; rating: number }
interface PanchangDay {
  date: string; day: number; weekday: number;
  tithiName: string; nakshatraName: string;
  isFullMoon: boolean; isNewMoon: boolean; isEkadashi: boolean;
}
interface Ingress { planet: string; fromSign: string; toSign: string; date: string }
interface RetroWindow { planet: string; start: string | null; end: string | null }
interface MoonPhase { date: string; type: 'new_moon' | 'full_moon' }
interface MonthlyTransits { ingresses: Ingress[]; retrogrades: RetroWindow[]; moonPhases: MoonPhase[] }
interface MuhurtaPick { date: string; time: string; score: number; tithi: string; nakshatra: string; reasoning: string[]; warnings: string[] }
type MuhurtaMap = Partial<Record<string, MuhurtaPick[]>>;

interface MonthlyPayload {
  summary: [string, string, string];
  theme: string;
  weeks: WeekBlock[];
  ratings: RatingItem[];
  remedy: string;
  remedy_mantra?: string;
  luckyColor: string;
  luckyNumber: number;
  luckyDirection: string;
  monthName: string;
  year: number;
  month: number;
  panchang: PanchangDay[];
  transits: MonthlyTransits;
  muhurtas: MuhurtaMap;
}

const MUHURTA_LABELS: Record<string, string> = {
  travel: 'Travel',
  business: 'Business / New Venture',
  namkaran: 'Naming Ceremony',
  griha_pravesh: 'House Warming',
  marriage: 'Marriage',
  vehicle_purchase: 'Vehicle Purchase',
  gold_purchase: 'Gold / Jewellery',
};

/* -------------------------------------------------------------------------- */
/*  Utilities                                                                 */
/* -------------------------------------------------------------------------- */

function StarRating({ rating, max = 5 }: { rating: number; max?: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className="text-xs"
          style={{ color: i < rating ? 'var(--primary)' : 'rgba(0,0,0,0.12)' }}>&#9733;</span>
      ))}
    </div>
  );
}

function fmtDayLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', weekday: 'short' });
}

/* -------------------------------------------------------------------------- */
/*  Main Page                                                                 */
/* -------------------------------------------------------------------------- */

export default function MonthlyHoroscopePage() {
  const { activeChart } = useActiveChart();
  const language = useStore((s) => s.language) || 'en';
  const [selectedRashi, setSelectedRashi] = useState<string>('mesha');
  const [payload, setPayload] = useState<MonthlyPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  // Default to user's Moon-sign rashi when chart available
  useEffect(() => {
    if (!activeChart) return;
    const chartData = activeChart.chart_data as Record<string, unknown> | undefined;
    const planets = chartData?.planets as Array<{ name: string; sign: string }> | undefined;
    const moon = planets?.find((p) => p.name === 'Moon');
    if (moon?.sign) {
      const rashiId = moon.sign.toLowerCase();
      if (RASHIS.some((r) => r.id === rashiId)) setSelectedRashi(rashiId);
    }
  }, [activeChart]);

  const ist = useMemo(() => {
    const d = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
  }, []);

  const load = useCallback(async (rashiId: string) => {
    setLoading(true);
    setError('');
    setPending(false);
    try {
      const res = await fetch(`/api/monthly?rashi=${rashiId}&year=${ist.year}&month=${ist.month}&language=${language}`);
      const json = await res.json();
      if (res.status === 202 || json.pending) {
        setPending(true);
        setPayload(null);
        return;
      }
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load monthly snapshot');
      setPayload(json.data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }, [ist.year, ist.month, language]);

  useEffect(() => { load(selectedRashi); }, [selectedRashi, load]);

  // Auto-poll while server is still generating
  useEffect(() => {
    if (!pending) return;
    const t = setInterval(() => load(selectedRashi), 30_000);
    return () => clearInterval(t);
  }, [pending, selectedRashi, load]);

  const rashiInfo = RASHIS.find((r) => r.id === selectedRashi)!;
  const monthLabel = payload
    ? `${payload.monthName} ${payload.year}`
    : new Date(ist.year, ist.month - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  return (
    <MotionPage className="mx-auto max-w-4xl px-4 py-6 min-h-screen">
      {/* Header */}
      <FadeIn>
        <div className="mb-5">
          <p className="text-[10px] font-semibold tracking-[0.2em] text-primary/70 uppercase mb-1">Vedic Astrology</p>
          <h1 className="font-[family-name:var(--font-serif)] text-2xl md:text-3xl font-bold text-text tracking-wide">Monthly Horoscope</h1>
          <p className="mt-0.5 text-sm text-text-secondary">{monthLabel} &nbsp;&middot;&nbsp; Based on Moon Sign (Rashi)</p>
        </div>
      </FadeIn>

      {/* Rashi Selector */}
      <FadeIn delay={0.05}>
        <div className="mb-5 rounded-2xl glass-2 p-4" style={{ border: '1px solid rgba(212, 175, 55,0.16)' }}>
          <p className="text-[10px] text-text-secondary uppercase tracking-wider font-semibold mb-3">Select Your Rashi</p>
          <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6 lg:grid-cols-12">
            {RASHIS.map((rashi) => (
              <motion.button
                key={rashi.id}
                type="button"
                onClick={() => setSelectedRashi(rashi.id)}
                whileTap={{ scale: 0.92 }}
                className="flex flex-col items-center gap-0.5 rounded-xl p-1.5 text-center transition-all cursor-pointer border-none"
                style={{
                  background: selectedRashi === rashi.id ? 'rgba(212, 175, 55,0.15)' : 'rgba(0,0,0,0.03)',
                  border: `1px solid ${selectedRashi === rashi.id ? 'rgba(212, 175, 55,0.45)' : 'rgba(0,0,0,0.08)'}`,
                  boxShadow: selectedRashi === rashi.id ? '0 0 12px rgba(212, 175, 55,0.12)' : 'none',
                }}
              >
                <span className="text-lg" dangerouslySetInnerHTML={{ __html: rashi.emoji }} />
                <span className="text-[9px] font-semibold" style={{ color: selectedRashi === rashi.id ? 'var(--primary)' : 'var(--text-secondary)' }}>
                  {rashi.name}
                </span>
              </motion.button>
            ))}
          </div>
        </div>
      </FadeIn>

      {/* Error */}
      {error && (
        <Card className="mb-4 border-error/50">
          <CardContent className="py-3 text-center text-sm text-error">{error}</CardContent>
        </Card>
      )}

      {/* Pending — snapshot generating */}
      {pending && (
        <Card className="mb-4">
          <CardContent className="py-6 text-center text-sm text-text-secondary">
            <Loading size="lg" section="horoscope" />
            <p className="mt-3">Casting this month&apos;s chart… this can take up to a minute the first time.</p>
          </CardContent>
        </Card>
      )}

      {/* Loading first paint */}
      {loading && !pending && !payload && (
        <div className="py-10"><Loading size="lg" section="horoscope" /></div>
      )}

      {/* Results */}
      <AnimatePresence mode="wait">
        {payload && !loading && (
          <motion.div
            key={selectedRashi}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25 }}
            className="space-y-4"
          >
            {/* Summary triad (Hook / Nuance / Action) */}
            {payload.summary?.[0] && (
              <div className="rounded-2xl glass-3 relative overflow-hidden" style={{ border: '1px solid rgba(212, 175, 55,0.22)' }}>
                <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-primary to-transparent" />
                <div className="relative p-4 space-y-3">
                  {(['Hook', 'Nuance', 'Action'] as const).map((label, i) => (
                    payload.summary[i] && (
                      <div key={label}>
                        <p className="text-[10px] font-semibold tracking-[0.2em] text-primary/70 uppercase mb-1">{label}</p>
                        <p className="text-sm leading-relaxed text-text">{payload.summary[i]}</p>
                      </div>
                    )
                  ))}
                </div>
              </div>
            )}

            {/* Monthly Theme */}
            {payload.theme && (
              <div className="rounded-2xl glass-2 overflow-hidden" style={{ border: '1px solid rgba(212, 175, 55,0.16)' }}>
                <div className="px-4 py-3 border-b" style={{ borderColor: 'rgba(212, 175, 55,0.14)' }}>
                  <h2 className="font-[family-name:var(--font-serif)] text-sm font-bold text-text tracking-wide flex items-center gap-1.5">
                    <span dangerouslySetInnerHTML={{ __html: rashiInfo.emoji }} />
                    {rashiInfo.name} ({rashiInfo.english}) — Monthly Theme
                  </h2>
                </div>
                <div className="p-4">
                  <p className="text-xs leading-relaxed text-text-secondary">{payload.theme}</p>
                </div>
              </div>
            )}

            {/* Area Ratings */}
            {payload.ratings?.length > 0 && (
              <div className="rounded-2xl glass-2 overflow-hidden" style={{ border: '1px solid rgba(212, 175, 55,0.16)' }}>
                <div className="px-4 py-3 border-b" style={{ borderColor: 'rgba(212, 175, 55,0.12)' }}>
                  <h2 className="font-[family-name:var(--font-serif)] text-sm font-bold text-text tracking-wide">Area Ratings</h2>
                </div>
                <div className="p-4">
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
                    {payload.ratings.map((r) => (
                      <motion.div
                        key={r.area}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.3 }}
                        className="flex flex-col items-center rounded-xl p-2.5"
                        style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(212, 175, 55,0.10)' }}
                      >
                        <span className="mb-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                          {r.area}
                        </span>
                        <StarRating rating={r.rating} />
                        <span className="mt-1 text-xs font-bold" style={{ color: 'var(--text)' }}>{r.rating}/5</span>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Week-by-Week */}
            {payload.weeks?.length > 0 && (
              <StaggerList className="space-y-2.5">
                {payload.weeks.map((week) => (
                  <StaggerItem key={week.weekNumber}>
                    <div className="rounded-2xl glass-1 overflow-hidden" style={{ border: '1px solid rgba(212, 175, 55,0.12)' }}>
                      <div className="px-4 py-2.5 border-b flex items-center justify-between" style={{ borderColor: 'rgba(212, 175, 55,0.10)' }}>
                        <span className="font-[family-name:var(--font-serif)] text-xs font-bold text-text tracking-wide">Week {week.weekNumber}</span>
                        <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>{week.dateRange}</span>
                      </div>
                      <div className="p-4">
                        <p className="mb-2.5 text-xs leading-relaxed text-text-secondary">{week.prediction}</p>
                        {week.keyDates.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {week.keyDates.map((kd, i) => (
                              <div key={i} className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold cursor-default" style={{ background: 'rgba(168,127,255,0.10)', border: '1px solid rgba(168,127,255,0.22)', color: '#a87fff' }} title={kd.event}>
                                {fmtDayLabel(kd.date)} &middot; {kd.event}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </StaggerItem>
                ))}
              </StaggerList>
            )}

            {/* Lucky + Remedy */}
            {(payload.luckyColor || payload.remedy) && (
              <div className="grid gap-2.5 sm:grid-cols-2">
                {(payload.luckyColor || payload.luckyDirection || payload.luckyNumber > 0) && (
                  <div className="rounded-2xl glass-1 p-4" style={{ border: '1px solid rgba(212, 175, 55,0.12)' }}>
                    <p className="text-[10px] font-semibold tracking-[0.2em] text-primary/70 uppercase mb-2">Lucky This Month</p>
                    <div className="space-y-1 text-xs text-text-secondary">
                      {payload.luckyColor && <div><span className="text-text-secondary/70">Colour: </span><span className="text-text font-medium">{payload.luckyColor}</span></div>}
                      {payload.luckyNumber > 0 && <div><span className="text-text-secondary/70">Number: </span><span className="text-text font-medium">{payload.luckyNumber}</span></div>}
                      {payload.luckyDirection && <div><span className="text-text-secondary/70">Direction: </span><span className="text-text font-medium">{payload.luckyDirection}</span></div>}
                    </div>
                  </div>
                )}
                {payload.remedy && (
                  <div className="rounded-2xl glass-1 p-4" style={{ border: '1px solid rgba(212, 175, 55,0.12)' }}>
                    <p className="text-[10px] font-semibold tracking-[0.2em] text-primary/70 uppercase mb-2">Monthly Remedy</p>
                    <p className="text-xs leading-relaxed text-text-secondary">{payload.remedy}</p>
                    {payload.remedy_mantra && (
                      <p className="mt-2 text-xs italic text-text/80">&ldquo;{payload.remedy_mantra}&rdquo;</p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Major Planetary Transits (same for everyone) */}
            {(payload.transits?.ingresses?.length > 0 || payload.transits?.retrogrades?.length > 0 || payload.transits?.moonPhases?.length > 0) && (
              <div className="rounded-2xl glass-2 overflow-hidden" style={{ border: '1px solid rgba(212, 175, 55,0.16)' }}>
                <div className="px-4 py-3 border-b" style={{ borderColor: 'rgba(212, 175, 55,0.12)' }}>
                  <h2 className="font-[family-name:var(--font-serif)] text-sm font-bold text-text tracking-wide">Major Transits This Month</h2>
                  <p className="text-[10px] text-text-secondary mt-0.5">Same sky for everyone &middot; computed from Swiss Ephemeris</p>
                </div>
                <div className="p-4 space-y-3">
                  {payload.transits.ingresses.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold tracking-wider uppercase text-text-secondary mb-1.5">Sign Changes (Ingresses)</p>
                      <ul className="space-y-1">
                        {payload.transits.ingresses.map((ig, i) => (
                          <li key={i} className="text-xs text-text">
                            <span className="text-text-secondary">{fmtDayLabel(ig.date)} &middot; </span>
                            <span className="font-semibold">{ig.planet}</span> enters <span className="font-semibold">{ig.toSign}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {payload.transits.retrogrades.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold tracking-wider uppercase text-text-secondary mb-1.5">Retrograde Windows</p>
                      <ul className="space-y-1">
                        {payload.transits.retrogrades.map((rw, i) => (
                          <li key={i} className="text-xs text-text">
                            <span className="font-semibold">{rw.planet}</span> retrograde{' '}
                            {rw.start ? fmtDayLabel(rw.start) : '(from before month)'} &nbsp;&ndash;&nbsp;{' '}
                            {rw.end ? fmtDayLabel(rw.end) : '(continues past month)'}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {payload.transits.moonPhases.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold tracking-wider uppercase text-text-secondary mb-1.5">Moon Phases</p>
                      <ul className="space-y-1">
                        {payload.transits.moonPhases.map((mp, i) => (
                          <li key={i} className="text-xs text-text">
                            <span className="text-text-secondary">{fmtDayLabel(mp.date)} &middot; </span>
                            {mp.type === 'full_moon' ? 'Full Moon (Purnima)' : 'New Moon (Amavasya)'}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Sacred Days from Panchang */}
            {payload.panchang?.length > 0 && (() => {
              const sacred = payload.panchang.filter((d) => d.isFullMoon || d.isNewMoon || d.isEkadashi);
              if (sacred.length === 0) return null;
              return (
                <div className="rounded-2xl glass-2 overflow-hidden" style={{ border: '1px solid rgba(212, 175, 55,0.16)' }}>
                  <div className="px-4 py-3 border-b" style={{ borderColor: 'rgba(212, 175, 55,0.12)' }}>
                    <h2 className="font-[family-name:var(--font-serif)] text-sm font-bold text-text tracking-wide">Sacred Days</h2>
                  </div>
                  <div className="p-4 flex flex-wrap gap-1.5">
                    {sacred.map((d) => (
                      <div key={d.date} className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold cursor-default"
                        style={{ background: 'rgba(212,175,55,0.10)', border: '1px solid rgba(212,175,55,0.22)', color: 'var(--primary)' }}>
                        {fmtDayLabel(d.date)} &middot; {d.isFullMoon ? 'Purnima' : d.isNewMoon ? 'Amavasya' : 'Ekadashi'}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Auspicious Dates (Muhurtas) */}
            {payload.muhurtas && Object.keys(payload.muhurtas).length > 0 && (
              <div className="rounded-2xl glass-2 overflow-hidden" style={{ border: '1px solid rgba(212, 175, 55,0.16)' }}>
                <div className="px-4 py-3 border-b" style={{ borderColor: 'rgba(212, 175, 55,0.12)' }}>
                  <h2 className="font-[family-name:var(--font-serif)] text-sm font-bold text-text tracking-wide">Auspicious Dates by Purpose</h2>
                  <p className="text-[10px] text-text-secondary mt-0.5">Top windows this month &middot; computed at India centre</p>
                </div>
                <div className="p-4 grid gap-2.5 sm:grid-cols-2">
                  {Object.entries(payload.muhurtas).map(([purpose, picks]) => {
                    if (!picks || picks.length === 0) return null;
                    return (
                      <div key={purpose} className="rounded-xl p-3" style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(212,175,55,0.10)' }}>
                        <p className="text-[10px] font-semibold tracking-wider uppercase text-primary/80 mb-1.5">{MUHURTA_LABELS[purpose] ?? purpose}</p>
                        <ul className="space-y-0.5">
                          {picks.slice(0, 3).map((m, i) => (
                            <li key={i} className="text-xs text-text">
                              <span className="text-text-secondary">{fmtDayLabel(m.date)}</span>
                              <span className="text-text-secondary/70"> &middot; {m.time}</span>
                              <span className="ml-1 text-[10px] text-primary/80">({m.score}/100)</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </MotionPage>
  );
}
