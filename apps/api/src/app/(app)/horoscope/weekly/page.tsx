'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MotionPage, FadeIn, StaggerList, StaggerItem } from '@/components/ui/motion-primitives';
import { staggerContainer, staggerItem as staggerItemVariant, cardHover } from '@/lib/motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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

interface DailyHighlight {
  day: string;
  highlight: string;
}

interface WeeklyPrediction {
  overview: string;
  daily_highlights: DailyHighlight[];
  lucky_day: string;
  challenging_day: string;
  career: string;
  relationships: string;
  health: string;
  remedy_of_the_week: string;
}

/* -------------------------------------------------------------------------- */
/*  Main Page                                                                 */
/* -------------------------------------------------------------------------- */

export default function WeeklyHoroscopePage() {
  const { activeChart } = useActiveChart();
  const [selectedRashi, setSelectedRashi] = useState<string>('mesha');
  const [prediction, setPrediction] = useState<WeeklyPrediction | null>(null);
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

  // Compute current week range for display
  const weekRange = (() => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(now);
    monday.setDate(now.getDate() + mondayOffset);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const fmt = (d: Date) =>
      d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    return `${fmt(monday)} - ${fmt(sunday)}`;
  })();

  const loadPrediction = useCallback(async (rashiId: string) => {
    setLoading(true);
    setError('');
    setPrediction(null);
    try {
      const res = await fetch('/api/horoscope/weekly', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rashi: rashiId }),
      });
      if (!res.ok) throw new Error('Failed to load weekly prediction');
      const data = await res.json();
      setPrediction(data.data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPrediction(selectedRashi);
  }, [selectedRashi, loadPrediction]);

  const selectedRashiInfo = RASHIS.find((r) => r.id === selectedRashi)!;

  return (
    <MotionPage className="mx-auto max-w-4xl px-4 py-6 min-h-screen">
      {/* Header */}
      <FadeIn>
        <div className="mb-5">
          <p className="text-[10px] font-semibold tracking-[0.2em] text-primary/70 uppercase mb-1">Vedic Astrology</p>
          <h1 className="font-[family-name:var(--font-serif)] text-2xl md:text-3xl font-bold text-text tracking-wide">Weekly Horoscope</h1>
          <p className="mt-0.5 text-sm text-text-secondary">{weekRange}</p>
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
            {/* Weekly Overview */}
            <div className="rounded-2xl glass-2 overflow-hidden" style={{ border: '1px solid rgba(212, 175, 55,0.20)' }}>
              <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-primary to-transparent" style={{ position: 'relative' }} />
              <div className="px-4 py-3 border-b" style={{ borderColor: 'rgba(212, 175, 55,0.12)' }}>
                <h2 className="font-[family-name:var(--font-serif)] text-sm font-bold text-text tracking-wide flex items-center gap-1.5">
                  <span dangerouslySetInnerHTML={{ __html: selectedRashiInfo.emoji }} />
                  {selectedRashiInfo.name} ({selectedRashiInfo.english}) — Weekly Overview
                </h2>
              </div>
              <div className="p-4">
                <p className="text-xs leading-relaxed text-text-secondary mb-3">{prediction.overview}</p>
                <div className="flex flex-wrap gap-1.5">
                  {prediction.lucky_day && (
                    <div className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold" style={{ background: 'rgba(34,197,94,0.10)', border: '1px solid rgba(34,197,94,0.25)', color: '#22c55e' }}>
                      ✦ Lucky: {prediction.lucky_day}
                    </div>
                  )}
                  {prediction.challenging_day && (
                    <div className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold" style={{ background: 'rgba(234,179,8,0.10)', border: '1px solid rgba(234,179,8,0.25)', color: '#eab308' }}>
                      ⚡ Challenging: {prediction.challenging_day}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Area Cards */}
            <StaggerList className="grid gap-2.5 sm:grid-cols-3">
              {[
                { key: 'career', label: 'Career', icon: '💼' },
                { key: 'relationships', label: 'Relationships', icon: '♥' },
                { key: 'health', label: 'Health', icon: '☯' },
              ].map(({ key, label, icon }) => (
                <StaggerItem key={key}>
                  <div className="rounded-2xl glass-1 p-3.5 h-full" style={{ border: '1px solid rgba(212, 175, 55,0.12)' }}>
                    <div className="flex items-center gap-1.5 mb-2">
                      <span className="text-sm">{icon}</span>
                      <span className="text-xs font-bold text-text uppercase tracking-wider font-[family-name:var(--font-serif)]">{label}</span>
                    </div>
                    <p className="text-xs leading-relaxed text-text-secondary">{prediction[key as keyof typeof prediction] as string}</p>
                  </div>
                </StaggerItem>
              ))}
            </StaggerList>

            {/* Day-by-Day Highlights */}
            <div className="rounded-2xl glass-2 overflow-hidden" style={{ border: '1px solid rgba(212, 175, 55,0.16)' }}>
              <div className="px-4 py-3 border-b" style={{ borderColor: 'rgba(212, 175, 55,0.12)' }}>
                <h2 className="font-[family-name:var(--font-serif)] text-sm font-bold text-text tracking-wide">Day-by-Day Highlights</h2>
                <p className="text-[10px] text-text-secondary mt-0.5">Your daily guidance for the week</p>
              </div>
              <div className="p-4 space-y-2">
                {prediction.daily_highlights.map((dh, i) => {
                  const isLucky = prediction.lucky_day && dh.day.toLowerCase().includes(prediction.lucky_day.toLowerCase());
                  const isChallenging = prediction.challenging_day && dh.day.toLowerCase().includes(prediction.challenging_day.toLowerCase());

                  return (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05, duration: 0.25 }}
                      className="rounded-xl p-2.5"
                      style={{
                        background: isLucky ? 'rgba(34,197,94,0.06)' : isChallenging ? 'rgba(234,179,8,0.06)' : 'rgba(0,0,0,0.03)',
                        border: `1px solid ${isLucky ? 'rgba(34,197,94,0.25)' : isChallenging ? 'rgba(234,179,8,0.25)' : 'rgba(212, 175, 55,0.10)'}`,
                        borderLeft: `3px solid ${isLucky ? '#22c55e' : isChallenging ? '#eab308' : 'rgba(212, 175, 55,0.30)'}`,
                      }}
                    >
                      <div className="mb-0.5 flex items-center gap-1.5">
                        <span className="text-xs font-semibold text-text">{dh.day}</span>
                        {isLucky && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}>Lucky</span>}
                        {isChallenging && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(234,179,8,0.15)', color: '#eab308' }}>Challenging</span>}
                      </div>
                      <p className="text-xs text-text-secondary">{dh.highlight}</p>
                    </motion.div>
                  );
                })}
              </div>
            </div>

            {/* Remedy of the Week */}
            {prediction.remedy_of_the_week && (
              <div className="rounded-2xl glass-3 relative overflow-hidden" style={{ border: '1px solid rgba(212, 175, 55,0.30)' }}>
                <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-primary to-transparent" />
                <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(212, 175, 55,0.06) 0%, transparent 60%)' }} />
                <div className="relative px-4 py-3 border-b" style={{ borderColor: 'rgba(212, 175, 55,0.14)' }}>
                  <h2 className="font-[family-name:var(--font-serif)] text-sm font-bold text-text tracking-wide">🙏 Remedy of the Week</h2>
                </div>
                <div className="relative p-4">
                  <p className="text-xs leading-relaxed text-text-secondary">{prediction.remedy_of_the_week}</p>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </MotionPage>
  );
}
