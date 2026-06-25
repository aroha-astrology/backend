'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MotionPage, FadeIn } from '@/components/ui/motion-primitives';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { Loading } from '@/components/ui/loading';
import { useActiveChart } from '@/hooks/useActiveChart';
import type { ApiResponse } from '@aroha-astrology/shared';

// Both shapes — narrative (lite_ai) and legacy enriched-from-report.
interface PastLifeContent {
  who_you_were?: string;
  what_you_mastered?: string;
  what_you_left_unfinished?: string;
  how_it_shows_up_now?: string;
  keep_with_you?: string;
  why_we_see_this?: string;
  past_life?: string;
  moksha_indicators?: string;
}

interface PastLifeResponse extends ApiResponse {
  data?: {
    content: PastLifeContent | null;
    source: string | null;
    profileName: string | null;
    generating: boolean;
  };
}

const POLL_MS = 4000;
const MAX_POLL_TICKS = 30; // ≈ 2 minutes

export default function PastLifePage() {
  const { activeChartId, setActiveChartId, charts, profiles, dataReady } = useActiveChart();
  const [chartId, setChartId] = useState<string>(activeChartId ?? '');

  const [content, setContent] = useState<PastLifeContent | null>(null);
  const [profileName, setProfileName] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showWhy, setShowWhy] = useState(false);

  useEffect(() => {
    if (!chartId && activeChartId) setChartId(activeChartId);
  }, [activeChartId, chartId]);

  const load = useCallback(async (id: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/past-life/${id}`);
      const json = (await res.json()) as PastLifeResponse;
      if (!res.ok || !json.success || !json.data) {
        throw new Error(json.error || 'Failed to load past-life reading');
      }
      setContent(json.data.content);
      setProfileName(json.data.profileName);
      setGenerating(json.data.generating);
      return Boolean(json.data.content);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      return false;
    }
  }, []);

  useEffect(() => {
    if (!chartId) return;
    let cancelled = false;
    let ticks = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function tick(initial: boolean) {
      if (cancelled) return;
      if (initial) setLoading(true);
      const ready = await load(chartId);
      if (initial) setLoading(false);
      if (!ready && ticks < MAX_POLL_TICKS) {
        ticks += 1;
        timer = setTimeout(() => tick(false), POLL_MS);
      }
    }

    setError('');
    setContent(null);
    setShowWhy(false);
    tick(true);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [chartId, load]);

  const noChart = dataReady && charts.length === 0;
  const hasNarrative = Boolean(
    content && (content.who_you_were || content.what_you_mastered || content.how_it_shows_up_now),
  );
  const hasLegacy = Boolean(content && (content.past_life || content.moksha_indicators) && !hasNarrative);

  return (
    <MotionPage className="mx-auto max-w-3xl px-4 py-6 min-h-screen">
      <div className="mb-6">
        <p className="text-[10px] font-semibold tracking-[0.2em] text-primary/70 uppercase mb-1">Past Life</p>
        <h1 className="font-[family-name:var(--font-serif)] text-2xl md:text-3xl font-bold text-text tracking-wide">
          The thread you are still carrying
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          Who you were, what you mastered, and what stayed unfinished — and how it lives in your life today.
        </p>
      </div>

      {noChart && (
        <Card className="py-10 text-center">
          <CardContent>
            <div className="text-5xl mb-3">🪔</div>
            <p className="text-base font-semibold text-text mb-1">No chart yet</p>
            <p className="text-sm text-text-secondary">Generate a kundli first to read your past life.</p>
          </CardContent>
        </Card>
      )}

      {!noChart && charts.length > 1 && (
        <div className="mb-5 max-w-sm">
          <Select
            label="Profile"
            options={charts.map((c) => {
              const name = profiles.find((p) => p.id === c.profile_id)?.name?.trim();
              return {
                value: c.id,
                label: name && name.length > 0 ? name : `Chart ${c.id.slice(0, 8)}…`,
              };
            })}
            value={chartId}
            onChange={(e) => {
              setChartId(e.target.value);
              setActiveChartId(e.target.value);
            }}
          />
        </div>
      )}

      <AnimatePresence mode="wait">
        {loading && !content && (
          <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Card className="py-12 text-center">
              <CardContent>
                <Loading size="lg" />
                <p className="mt-3 text-sm text-text-secondary">Reading your soul thread…</p>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {!loading && error && (
          <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Card className="py-8 text-center">
              <CardContent>
                <p className="text-sm text-danger">⚠️ {error}</p>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {!loading && !error && generating && !hasNarrative && !hasLegacy && (
          <motion.div key="generating" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Card className="py-10 text-center">
              <CardContent>
                <Loading size="lg" />
                <p className="mt-3 text-sm text-text-secondary">
                  Tracing your past-life imprints. This takes a minute — feel free to come back.
                </p>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {!loading && !error && content && (hasNarrative || hasLegacy) && (
          <motion.div
            key="result"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="space-y-5"
          >
            {/* Hero — who you were */}
            {hasNarrative && content.who_you_were && (
              <FadeIn>
                <div className="bg-surface border border-border rounded-2xl p-6 md:p-8 shadow-sm">
                  <p className="text-[10px] font-semibold tracking-[0.2em] text-accent uppercase mb-2">
                    Who you were
                  </p>
                  <p className="font-[family-name:var(--font-serif)] text-lg md:text-xl leading-relaxed text-text">
                    {content.who_you_were}
                  </p>
                </div>
              </FadeIn>
            )}

            {/* Mastered + Unfinished — two-up on md+ */}
            {hasNarrative && (content.what_you_mastered || content.what_you_left_unfinished) && (
              <div className="grid md:grid-cols-2 gap-4">
                {content.what_you_mastered && (
                  <FadeIn delay={0.05}>
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-xs font-semibold uppercase tracking-wider text-success">
                          What you mastered
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm leading-relaxed text-text">{content.what_you_mastered}</p>
                      </CardContent>
                    </Card>
                  </FadeIn>
                )}
                {content.what_you_left_unfinished && (
                  <FadeIn delay={0.1}>
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-xs font-semibold uppercase tracking-wider text-warning">
                          What stayed unfinished
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm leading-relaxed text-text">{content.what_you_left_unfinished}</p>
                      </CardContent>
                    </Card>
                  </FadeIn>
                )}
              </div>
            )}

            {/* Mirror — how it shows up now (the connection moment) */}
            {hasNarrative && content.how_it_shows_up_now && (
              <FadeIn delay={0.15}>
                <div className="bg-surface-2 border border-border rounded-2xl p-6 shadow-sm">
                  <p className="text-[10px] font-semibold tracking-[0.2em] text-primary uppercase mb-2">
                    How it shows up now
                  </p>
                  <p className="text-sm md:text-base leading-relaxed text-text">{content.how_it_shows_up_now}</p>
                </div>
              </FadeIn>
            )}

            {/* Keep with you — practice */}
            {hasNarrative && content.keep_with_you && (
              <FadeIn delay={0.2}>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-xs font-semibold uppercase tracking-wider text-accent">
                      ✦ Keep this with you
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm leading-relaxed text-text whitespace-pre-line">{content.keep_with_you}</p>
                  </CardContent>
                </Card>
              </FadeIn>
            )}

            {/* Legacy fallback — older rows enriched from a full report */}
            {hasLegacy && (
              <>
                {content.past_life && (
                  <FadeIn>
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-sm font-[family-name:var(--font-serif)]">
                          Past Life Imprints
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm leading-relaxed text-text whitespace-pre-line">{content.past_life}</p>
                      </CardContent>
                    </Card>
                  </FadeIn>
                )}
                {content.moksha_indicators && (
                  <FadeIn delay={0.05}>
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-sm font-[family-name:var(--font-serif)]">
                          Moksha Indicators
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm leading-relaxed text-text whitespace-pre-line">{content.moksha_indicators}</p>
                      </CardContent>
                    </Card>
                  </FadeIn>
                )}
              </>
            )}

            {/* Why we see this — collapsed footnote with chart citations */}
            {content.why_we_see_this && (
              <FadeIn delay={0.25}>
                <button
                  type="button"
                  onClick={() => setShowWhy((v) => !v)}
                  className="text-xs text-text-secondary hover:text-text transition-colors underline-offset-4 hover:underline"
                >
                  {showWhy ? 'Hide' : 'Why we see this in your chart'}
                </button>
                <AnimatePresence initial={false}>
                  {showWhy && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.25 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-3 p-4 rounded-xl border border-border bg-surface-2/50">
                        <p className="text-xs leading-relaxed text-text-secondary">{content.why_we_see_this}</p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </FadeIn>
            )}

            {/* Subtle hint to update context for a more personal mirror */}
            <FadeIn delay={0.3}>
              <p className="text-xs text-text-secondary text-center pt-2">
                {profileName ? `Reading for ${profileName}.` : ''} Update your life context in{' '}
                <a href="/settings" className="underline underline-offset-2 hover:text-text">Settings</a>{' '}
                and this reading regenerates so the mirror reflects your real life.
              </p>
            </FadeIn>
          </motion.div>
        )}
      </AnimatePresence>
    </MotionPage>
  );
}
