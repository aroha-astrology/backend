'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MotionPage, FadeIn, StaggerList, StaggerItem } from '@/components/ui/motion-primitives';
import { staggerContainer, staggerItem as staggerItemVariant, cardHover } from '@/lib/motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loading } from '@/components/ui/loading';
import { useStore } from '@/store/useStore';
import { useActiveChart } from '@/hooks/useActiveChart';

/* -------------------------------------------------------------------------- */
/*  Types & Constants                                                         */
/* -------------------------------------------------------------------------- */

interface RashiInfo {
  id: string;
  name: string;
  english: string;
  emoji: string;
}

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

interface QuarterPrediction {
  quarter: string;
  months: string;
  prediction: string;
}

interface MonthBrief {
  month: string;
  prediction: string;
}

interface AreaRating {
  area: string;
  rating: number;
}

interface YearlyPrediction {
  year: number;
  theme: string;
  quarters: QuarterPrediction[];
  monthBriefs: MonthBrief[];
  ratings: AreaRating[];
}

/* -------------------------------------------------------------------------- */
/*  Star Rating                                                               */
/* -------------------------------------------------------------------------- */

function StarRating({ rating, max = 5 }: { rating: number; max?: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: max }, (_, i) => (
        <span
          key={i}
          style={{ color: i < rating ? 'var(--primary)' : 'rgba(0,0,0,0.12)' }}
          className="text-xs"
        >
          &#9733;
        </span>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main Page                                                                 */
/* -------------------------------------------------------------------------- */

export default function YearlyHoroscopePage() {
  const { activeChart } = useActiveChart();
  const [selectedRashi, setSelectedRashi] = useState<string>('mesha');
  const [prediction, setPrediction] = useState<YearlyPrediction | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Auto-select rashi from user's Moon sign
  useEffect(() => {
    if (!activeChart) return;
    const chartData = activeChart.chart_data as Record<string, unknown> | undefined;
    const planets = chartData?.planets as Array<{ name: string; sign: string }> | undefined;
    if (!planets) return;
    const moon = planets.find((p) => p.name === 'Moon');
    if (moon?.sign) {
      const rashiId = moon.sign.toLowerCase();
      if (RASHIS.some((r) => r.id === rashiId)) setSelectedRashi(rashiId);
    }
  }, [activeChart]);

  const currentYear = new Date().getFullYear();

  const loadPrediction = useCallback(async (rashiId: string) => {
    setLoading(true);
    setError('');
    setPrediction(null);
    try {
      const res = await fetch(`/api/horoscope/yearly?rashi=${rashiId}&year=${currentYear}`);
      if (!res.ok) throw new Error('Failed to load yearly prediction');
      const data = await res.json();
      setPrediction(data.data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }, [currentYear]);

  useEffect(() => {
    loadPrediction(selectedRashi);
  }, [selectedRashi, loadPrediction]);

  const selectedRashiInfo = RASHIS.find((r) => r.id === selectedRashi)!;

  return (
    <MotionPage className="min-h-screen">
      {/* Header */}
      <div className="px-4 pb-4 pt-6" style={{ borderBottom: '1px solid rgba(212, 175, 55,0.10)' }}>
        <div className="mx-auto max-w-4xl">
          <FadeIn>
            <p className="text-[10px] font-semibold tracking-[0.2em] text-primary/70 uppercase mb-1">Vedic Astrology</p>
            <h1 className="font-[family-name:var(--font-serif)] text-2xl md:text-3xl font-bold text-text tracking-wide">Yearly Horoscope {currentYear}</h1>
            <p className="mt-0.5 text-sm text-text-secondary">
              Comprehensive yearly predictions for all rashis
            </p>
          </FadeIn>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-4 py-4 pb-16">

      {/* Rashi Selector */}
      <FadeIn delay={0.05}>
        <div className="mb-4 rounded-2xl p-4" style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(212, 175, 55,0.16)', backdropFilter: 'blur(12px)' }}>
          <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6 lg:grid-cols-12">
            {RASHIS.map((rashi) => (
              <motion.button
                key={rashi.id}
                type="button"
                onClick={() => setSelectedRashi(rashi.id)}
                whileTap={{ scale: 0.92 }}
                className="flex flex-col items-center gap-0.5 rounded-lg p-1.5 text-center transition-all"
                style={selectedRashi === rashi.id ? {
                  background: 'rgba(212, 175, 55,0.12)',
                  boxShadow: '0 0 0 1.5px rgba(212, 175, 55,0.45)',
                } : {}}
              >
                <span
                  className="text-lg"
                  dangerouslySetInnerHTML={{ __html: rashi.emoji }}
                />
                <span className="text-[10px] font-medium text-text-secondary">{rashi.name}</span>
              </motion.button>
            ))}
          </div>
        </div>
      </FadeIn>

      {/* Error */}
      {error && (
        <div className="mb-4 rounded-xl px-4 py-3 text-center text-sm text-error" style={{ border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.06)' }}>{error}</div>
      )}

      {/* Loading */}
      {loading && (
        <div className="py-10">
          <Loading size="lg" section="horoscope" />
        </div>
      )}

      {/* Results */}
      <AnimatePresence mode="wait">
        {prediction && !loading && (
          <motion.div
            key={selectedRashi}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25 }}
            className="space-y-4"
          >
            {/* Year Theme */}
            <div className="relative overflow-hidden rounded-2xl p-4" style={{ background: 'rgba(0,0,0,0.04)', border: '1px solid rgba(212, 175, 55,0.22)', backdropFilter: 'blur(16px)' }}>
              <div className="absolute left-0 top-0 h-0.5 w-full" style={{ background: 'linear-gradient(90deg, transparent, rgba(212, 175, 55,0.6), transparent)' }} />
              <div className="absolute inset-0 rounded-2xl pointer-events-none" style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(212, 175, 55,0.06) 0%, transparent 70%)' }} />
              <div className="mb-2 flex items-center gap-1.5">
                <span className="text-lg" dangerouslySetInnerHTML={{ __html: selectedRashiInfo.emoji }} />
                <h2 className="font-[family-name:var(--font-serif)] text-sm font-bold text-text">
                  {selectedRashiInfo.name} ({selectedRashiInfo.english}) — {currentYear} Overview
                </h2>
              </div>
              <p className="text-xs leading-relaxed text-text-secondary">{prediction.theme}</p>
            </div>

            {/* Area Ratings */}
            <div className="rounded-2xl p-4" style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(212, 175, 55,0.16)', backdropFilter: 'blur(12px)' }}>
              <h3 className="mb-3 font-[family-name:var(--font-serif)] text-sm font-bold text-text">Yearly Area Ratings</h3>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
                {prediction.ratings.map((r) => (
                  <motion.div
                    key={r.area}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.3 }}
                    className="flex flex-col items-center rounded-xl p-2.5"
                    style={{ background: 'rgba(0,0,0,0.04)', border: '1px solid rgba(212, 175, 55,0.12)' }}
                  >
                    <span className="mb-0.5 text-[10px] font-semibold uppercase text-text-secondary">
                      {r.area}
                    </span>
                    <StarRating rating={r.rating} />
                    <span className="mt-0.5 text-xs font-bold" style={{ color: 'var(--text)' }}>{r.rating}/5</span>
                  </motion.div>
                ))}
              </div>
            </div>

            {/* Quarter-wise Predictions */}
            <div className="rounded-2xl p-4" style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(212, 175, 55,0.16)', backdropFilter: 'blur(12px)' }}>
              <h3 className="mb-3 font-[family-name:var(--font-serif)] text-sm font-bold text-text">Quarter-wise Predictions</h3>
              <div className="space-y-3">
                {prediction.quarters.map((q, i) => (
                  <motion.div
                    key={q.quarter}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.08, duration: 0.3 }}
                    className="rounded-xl p-3"
                    style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(212, 175, 55,0.12)' }}
                  >
                    <div className="mb-1.5 flex items-center gap-1.5">
                      <span className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold" style={{ background: 'rgba(212, 175, 55,0.15)', color: 'var(--text)' }}>
                        {q.quarter}
                      </span>
                      <span className="text-xs text-text-secondary">{q.months}</span>
                    </div>
                    <p className="text-xs leading-relaxed text-text-secondary">{q.prediction}</p>
                  </motion.div>
                ))}
              </div>
            </div>

            {/* Month-by-Month */}
            <div className="rounded-2xl p-4" style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(212, 175, 55,0.16)', backdropFilter: 'blur(12px)' }}>
              <h3 className="mb-0.5 font-[family-name:var(--font-serif)] text-sm font-bold text-text">Month-by-Month Brief</h3>
              <p className="mb-3 text-xs text-text-secondary">Quick snapshot for each month</p>
              <StaggerList className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {prediction.monthBriefs.map((mb) => (
                  <StaggerItem key={mb.month}>
                    <div className="rounded-xl p-2.5" style={{ background: 'rgba(0,0,0,0.04)', border: '1px solid rgba(212, 175, 55,0.10)' }}>
                      <div className="mb-0.5 text-xs font-semibold" style={{ color: 'var(--text)' }}>{mb.month}</div>
                      <p className="text-[11px] leading-relaxed text-text-secondary">{mb.prediction}</p>
                    </div>
                  </StaggerItem>
                ))}
              </StaggerList>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      </div>
    </MotionPage>
  );
}
