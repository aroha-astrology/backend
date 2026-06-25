'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MotionPage, FadeIn, StaggerList, StaggerItem } from '@/components/ui/motion-primitives';
import { cardHover } from '@/lib/motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Loading } from '@/components/ui/loading';
import { useActiveChart } from '@/hooks/useActiveChart';

interface DreamSymbol {
  symbol: string;
  vedic_meaning: string;
  psychological_meaning: string;
}

interface DreamResult {
  symbols: DreamSymbol[];
  overall_interpretation: string;
  astrological_connection: string;
  auspiciousness: 'auspicious' | 'inauspicious' | 'neutral';
  positive_points: string[];
  issues: string[];
  remedies: string[];
  lucky_numbers: number[];
}

const AUSPICIOUS_CONFIG = {
  auspicious:   { emoji: '✨', label: 'Auspicious',   color: '#16a34a', bg: 'rgba(22,163,74,0.12)',   border: 'rgba(22,163,74,0.25)'   },
  inauspicious: { emoji: '⚠️', label: 'Inauspicious', color: '#dc2626', bg: 'rgba(220,38,38,0.10)',   border: 'rgba(220,38,38,0.25)'   },
  neutral:      { emoji: '⚖️', label: 'Neutral',       color: '#d97706', bg: 'rgba(217,119,6,0.10)',   border: 'rgba(217,119,6,0.25)'   },
};

const SYMBOL_EMOJIS = ['🔮', '🌙', '🌊', '🐍', '🦅', '🌳', '🔥', '⭐', '🌸', '🏔️'];

export default function DreamsPage() {
  const { activeChartId, setActiveChartId, charts, profiles } = useActiveChart();
  const [dream, setDream] = useState('');
  const [chartId, setChartId] = useState(activeChartId ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<DreamResult | null>(null);

  const handleInterpret = async () => {
    if (dream.trim().length < 20) {
      setError('Please describe your dream in at least 20 characters.');
      return;
    }
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch('/api/dreams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dream: dream.trim(), chartId: chartId || undefined }),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error((errJson as { error?: string }).error ?? 'Failed to interpret dream');
      }
      const json = await res.json();
      setResult(json.data as DreamResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const cfg = result ? AUSPICIOUS_CONFIG[result.auspiciousness] : null;

  return (
    <MotionPage className="mx-auto max-w-5xl px-4 py-6 min-h-screen">

      {/* Header */}
      <div className="mb-5">
        <p className="text-[10px] font-semibold tracking-[0.2em] text-primary/70 uppercase mb-1">Swapna Shastra</p>
        <h1 className="font-[family-name:var(--font-serif)] text-2xl md:text-3xl font-bold text-text tracking-wide">
          🌙 Dream Interpretation
        </h1>
        <p className="mt-0.5 text-sm text-text-secondary">
          Discover what your dreams reveal through ancient Vedic wisdom &amp; modern psychology.
        </p>
      </div>

      <AnimatePresence mode="wait">

        {/* ── INPUT FORM ── */}
        {!result && !loading && (
          <motion.div
            key="form"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.3 }}
            className="grid gap-5 md:grid-cols-2"
          >
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-[family-name:var(--font-serif)]">✍️ Describe Your Dream</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-text-secondary">
                  Be specific — include people, objects, emotions, colours, and actions for a richer reading.
                </p>
                <div className="w-full">
                  <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-text-secondary/70">
                    What did you dream?
                  </label>
                  <textarea
                    className="flex min-h-[140px] w-full rounded-lg border border-border bg-surface/60 px-3 py-2.5 text-sm text-text placeholder:text-text-secondary/50 transition-all duration-200 focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:bg-surface resize-none"
                    placeholder="I was walking through a forest with tall trees. There was a river nearby and I saw a white snake…"
                    value={dream}
                    onChange={(e) => setDream(e.target.value)}
                  />
                  <p className="mt-0.5 text-[11px] text-text-secondary/60">
                    {dream.trim().length} / 20 characters minimum
                  </p>
                </div>

                {charts.length > 0 && (
                  <Select
                    label="🔮 Link Kundli Chart (optional)"
                    options={[
                      { value: '', label: 'No chart — general interpretation' },
                      ...charts.map((c) => {
                        const name = profiles.find((p) => p.id === c.profile_id)?.name?.trim();
                        return {
                          value: c.id,
                          label: name && name.length > 0 ? name : `Chart ${c.id.slice(0, 8)}…`,
                        };
                      }),
                    ]}
                    value={chartId}
                    onChange={(e) => { setChartId(e.target.value); if (e.target.value) setActiveChartId(e.target.value); }}
                  />
                )}

                {error && <p className="text-xs text-error">⚠️ {error}</p>}

                <Button onClick={handleInterpret} disabled={dream.trim().length < 20} className="w-full" size="lg">
                  🌙 Interpret My Dream
                </Button>
              </CardContent>
            </Card>

            <FadeIn delay={0.15}>
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-[family-name:var(--font-serif)]">📜 About Swapna Shastra</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2.5">
                    {[
                      { icon: '🕉️', text: 'Ancient Vedic science from Hindu scriptures — Puranas & Brihat Samhita' },
                      { icon: '🌓', text: 'Dreams at Brahma Muhurta (pre-dawn) are most prophetic' },
                      { icon: '⚖️', text: 'Classified as auspicious, inauspicious, or neutral' },
                      { icon: '🧠', text: 'Modern psychological perspectives complement Vedic analysis' },
                      { icon: '🪐', text: 'Link your Kundli for personalised astrological connections' },
                      { icon: '💊', text: 'Get Vedic remedies when dreams indicate challenges' },
                    ].map((item, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-text-secondary">
                        <span className="text-base leading-none mt-0.5">{item.icon}</span>
                        <span>{item.text}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </FadeIn>
          </motion.div>
        )}

        {/* ── LOADING ── */}
        {loading && (
          <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Card className="py-12 text-center">
              <CardContent>
                <div className="text-5xl mb-4 animate-pulse">🌙</div>
                <Loading size="lg" />
                <p className="mt-3 text-base font-semibold text-text">Reading your dream…</p>
                <p className="mt-1.5 text-xs text-text-secondary">
                  Consulting Swapna Shastra & modern psychology
                </p>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* ── RESULTS ── */}
        {result && !loading && (
          <motion.div
            key="results"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="space-y-4"
          >
            {/* Auspiciousness banner + overall */}
            {cfg && (
              <FadeIn>
                <div
                  className="rounded-2xl p-4 flex items-start gap-4 flex-wrap"
                  style={{ background: cfg.bg, border: `1.5px solid ${cfg.border}` }}
                >
                  <span className="text-4xl">{cfg.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold" style={{ color: cfg.color }}>{cfg.label} Dream</p>
                    <p className="text-sm text-text leading-relaxed mt-1">{result.overall_interpretation}</p>
                    {result.lucky_numbers.length > 0 && (
                      <div className="flex items-center gap-1.5 flex-wrap mt-2">
                        <span className="text-[11px] font-semibold text-text-secondary">🍀 Lucky numbers:</span>
                        {result.lucky_numbers.map((n) => (
                          <span
                            key={n}
                            className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                            style={{ background: cfg.color + '22', color: cfg.color, border: `1px solid ${cfg.border}` }}
                          >
                            {n}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </FadeIn>
            )}

            {/* ✅ Positive Points */}
            {result.positive_points?.length > 0 && (
              <FadeIn delay={0.08}>
                <Card style={{ borderLeft: '3px solid #16a34a' }}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-[family-name:var(--font-serif)] flex items-center gap-2">
                      <span className="text-lg">🌟</span> What This Dream Blesses You With
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {result.positive_points.map((pt, i) => (
                        <li key={i} className="flex items-start gap-2.5">
                          <span className="mt-1 w-4 h-4 rounded-full bg-green-100 flex items-center justify-center text-[10px] flex-shrink-0">✓</span>
                          <p className="text-sm text-text leading-relaxed">{pt}</p>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </FadeIn>
            )}

            {/* ⚠️ Issues / Warnings */}
            {result.issues?.length > 0 && (
              <FadeIn delay={0.12}>
                <Card style={{ borderLeft: '3px solid #dc2626' }}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-[family-name:var(--font-serif)] flex items-center gap-2">
                      <span className="text-lg">⚠️</span> Areas to Watch
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {result.issues.map((issue, i) => (
                        <li key={i} className="flex items-start gap-2.5">
                          <span className="mt-1 text-red-500 text-xs flex-shrink-0">●</span>
                          <p className="text-sm text-text leading-relaxed">{issue}</p>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </FadeIn>
            )}

            {/* 🔮 Dream Symbols */}
            {result.symbols.length > 0 && (
              <FadeIn delay={0.16}>
                <div>
                  <h2 className="mb-3 text-base font-bold font-[family-name:var(--font-serif)] text-text flex items-center gap-2">
                    <span>✨</span> Dream Symbols
                  </h2>
                  <StaggerList className="grid gap-3 sm:grid-cols-2">
                    {result.symbols.map((sym, i) => (
                      <StaggerItem key={i}>
                        <motion.div {...cardHover}>
                          <Card className="transition-all hover:border-primary/30 h-full">
                            <CardHeader className="pb-2">
                              <CardTitle className="text-sm font-[family-name:var(--font-serif)] flex items-center gap-2">
                                <span className="text-xl">{SYMBOL_EMOJIS[i % SYMBOL_EMOJIS.length]}</span>
                                {sym.symbol}
                              </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2.5">
                              <div className="rounded-lg p-2.5" style={{ background: 'rgba(124,58,237,0.07)' }}>
                                <p className="text-[10px] font-bold uppercase tracking-wider text-primary/80 mb-1">🕉️ Vedic Meaning</p>
                                <p className="text-xs text-text leading-relaxed">{sym.vedic_meaning}</p>
                              </div>
                              <div className="rounded-lg p-2.5" style={{ background: 'rgba(245,158,11,0.07)' }}>
                                <p className="text-[10px] font-bold uppercase tracking-wider text-accent/80 mb-1">🧠 Psychology</p>
                                <p className="text-xs text-text leading-relaxed">{sym.psychological_meaning}</p>
                              </div>
                            </CardContent>
                          </Card>
                        </motion.div>
                      </StaggerItem>
                    ))}
                  </StaggerList>
                </div>
              </FadeIn>
            )}

            {/* 🪐 Astrological Connection */}
            {result.astrological_connection && (
              <FadeIn delay={0.2}>
                <Card style={{ borderLeft: '3px solid #7C3AED' }}>
                  <CardContent className="py-3 flex gap-3 items-start">
                    <span className="text-2xl mt-0.5">🪐</span>
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-primary/80 mb-1">Astrological Connection</p>
                      <p className="text-sm text-text-secondary leading-relaxed">{result.astrological_connection}</p>
                    </div>
                  </CardContent>
                </Card>
              </FadeIn>
            )}

            {/* 🙏 Remedies */}
            {result.remedies.length > 0 && (
              <FadeIn delay={0.24}>
                <Card style={{ borderLeft: '3px solid #d97706' }}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-[family-name:var(--font-serif)] flex items-center gap-2">
                      <span className="text-lg">🙏</span> Vedic Remedies
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2.5">
                      {result.remedies.map((remedy, i) => (
                        <li key={i} className="flex items-start gap-2.5">
                          <span
                            className="mt-0.5 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 text-white"
                            style={{ background: '#d97706' }}
                          >
                            {i + 1}
                          </span>
                          <p className="text-sm text-text leading-relaxed">{remedy}</p>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </FadeIn>
            )}

            <FadeIn delay={0.28}>
              <div className="text-center pt-2">
                <Button
                  variant="outline"
                  onClick={() => { setResult(null); setDream(''); setChartId(''); }}
                >
                  🌙 Interpret Another Dream
                </Button>
              </div>
            </FadeIn>
          </motion.div>
        )}

      </AnimatePresence>
    </MotionPage>
  );
}
