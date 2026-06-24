'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, type PolarAngleAxisProps } from 'recharts';

function RadarAxisTick(props: PolarAngleAxisProps & { payload?: { value: string }; x?: number; y?: number; cx?: number; cy?: number; textAnchor?: string }) {
  const { x = 0, y = 0, cx = 0, cy = 0, payload } = props;
  if (!payload) return null;
  const dx = x - cx;
  const dy = y - cy;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const nx = x + (dx / len) * 6;
  const ny = y + (dy / len) * 6;
  return (
    <text x={nx} y={ny} textAnchor="middle" dominantBaseline="central" fill="var(--text)" fontSize={10} fontWeight={600}>
      {payload.value}
    </text>
  );
}
import { MotionPage, FadeIn } from '@/components/ui/motion-primitives';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loading } from '@/components/ui/loading';
import { useActiveChart } from '@/hooks/useActiveChart';
import {
  GUNA_AXIS_LABELS,
  GUNA_AXIS_SHORT_LABELS,
  GUNA_AXIS_DESCRIPTIONS,
  GUNA_AXIS_ORDER,
  type GunaAxes,
  type GunaAxisKey,
} from '@/lib/guna/mapShadbalaToAxes';

interface GunaContent {
  summary?: string;
  strengths?: string;
  challenges?: string;
  do?: string;
  dont?: string;
}

function renderInlineBold(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? (
      <strong key={i} className="font-semibold text-text">{part.slice(2, -2)}</strong>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

type GunaSource = 'lite_ai' | 'report_enriched' | 'deterministic' | null;

interface GunaResponse {
  success: boolean;
  data?: {
    axes: GunaAxes;
    profileName?: string | null;
    content: GunaContent | null;
    source: GunaSource;
    generating: boolean;
  };
  error?: string;
}

const POLL_INTERVAL_MS = 5000;
// ~3 minutes of polling — long enough for a slow NIM call + queue drain to land
// before we tell the user the AI reading didn't come through.
const MAX_POLLS = 36;

function splitBullets(text: string | undefined): string[] {
  if (!text) return [];
  return text
    .split(/\n+/)
    .map(line => line.replace(/^[•\-*]\s*/, '').trim())
    .filter(Boolean);
}

export default function GunaChakraPage() {
  const { activeChartId, setActiveChartId, charts, profiles, dataReady } = useActiveChart();

  const [chartId, setChartId] = useState<string>(activeChartId ?? '');
  const [axes, setAxes] = useState<GunaAxes | null>(null);
  const [profileName, setProfileName] = useState<string | null>(null);
  const [content, setContent] = useState<GunaContent | null>(null);
  const [source, setSource] = useState<GunaSource>(null);
  const [generating, setGenerating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const pollCountRef = useRef(0);

  useEffect(() => {
    if (!chartId && activeChartId) setChartId(activeChartId);
  }, [activeChartId, chartId]);

  const loadAxes = useCallback(async (id: string, opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/guna-chakra/${id}`);
      const json = (await res.json()) as GunaResponse;
      if (!res.ok || !json.success || !json.data) {
        throw new Error(json.error || 'Failed to load Guna Chakra');
      }
      setAxes(json.data.axes);
      setProfileName(json.data.profileName ?? null);
      setContent(json.data.content);
      setSource(json.data.source);
      setGenerating(json.data.source !== 'lite_ai' && json.data.source !== 'report_enriched');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setAxes(null);
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, []);

  // Poll until AI reading lands. Uses setInterval so polls keep firing even
  // when source stays null (null→null is not a React state change, so a
  // setTimeout-in-useEffect approach only fires once and then stops).
  useEffect(() => {
    const aiReady = source === 'lite_ai' || source === 'report_enriched';
    if (!chartId || aiReady) return;

    const interval = setInterval(() => {
      pollCountRef.current += 1;
      if (pollCountRef.current >= MAX_POLLS) {
        clearInterval(interval);
        return;
      }
      loadAxes(chartId, { silent: true });
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [chartId, source, loadAxes]);

  // Reset poll count when switching charts
  useEffect(() => {
    pollCountRef.current = 0;
  }, [chartId]);

  useEffect(() => {
    if (chartId) loadAxes(chartId);
  }, [chartId, loadAxes]);

  const handleRefresh = () => {
    pollCountRef.current = 0;
    if (chartId) loadAxes(chartId);
  };

  const radarData = axes
    ? GUNA_AXIS_ORDER.map((key) => ({ axis: GUNA_AXIS_SHORT_LABELS[key], score: axes[key] ?? 0 }))
    : [];

  const aiReady = source === 'lite_ai' || source === 'report_enriched';
  const noChart = dataReady && charts.length === 0;

  const strengths = splitBullets(content?.strengths);
  const challenges = splitBullets(content?.challenges);
  const dos = splitBullets(content?.do);
  const donts = splitBullets(content?.dont);

  return (
    <MotionPage className="mx-auto max-w-5xl px-4 py-6 min-h-screen">
      <div className="mb-5">
        <p className="text-[10px] font-semibold tracking-[0.2em] text-primary/70 uppercase mb-1">Guna Chakra</p>
        <h1 className="font-[family-name:var(--font-serif)] text-2xl md:text-3xl font-bold text-text tracking-wide">
          🕸️ Your Personality Radar
        </h1>
        <p className="mt-0.5 text-sm text-text-secondary">
          Six personality dimensions, drawn from the strengths in your birth chart.
        </p>
      </div>

      {noChart && (
        <Card className="py-10 text-center">
          <CardContent>
            <div className="text-5xl mb-3">🔮</div>
            <p className="text-base font-semibold text-text mb-1">No chart yet</p>
            <p className="text-sm text-text-secondary">Generate a kundli first to see your Guna Chakra.</p>
          </CardContent>
        </Card>
      )}

      {!noChart && charts.length > 0 && (() => {
        const activeChart = charts.find((c) => c.id === chartId) ?? charts[0];
        const displayName =
          profiles.find((p) => p.id === activeChart?.profile_id)?.name?.trim() ||
          (activeChart ? `Chart ${activeChart.id.slice(0, 8)}…` : '');
        return (
          <div className="mb-5 max-w-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-1">Profile</p>
            <p className="text-base font-semibold text-text">{displayName}</p>
          </div>
        );
      })()}

      <AnimatePresence mode="wait">
        {loading && (
          <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Card className="py-12 text-center">
              <CardContent>
                <Loading size="lg" />
                <p className="mt-3 text-sm text-text-secondary">Reading your chart…</p>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {!loading && error && (
          <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Card className="py-8 text-center">
              <CardContent>
                <p className="text-sm text-error">⚠️ {error}</p>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {!loading && !error && axes && (
          <motion.div
            key="result"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="space-y-5"
          >
            {/* Radar */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-[family-name:var(--font-serif)]">
                  {profileName ? `${profileName}'s Guna Chakra` : 'Your Guna Chakra'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {/* Extra horizontal padding so axis ticks have room to breathe on
                    narrow viewports — long words were getting clipped (Commu…
                    Analyti, :reative). Outer radius reduced for the same reason. */}
                <div className="w-full h-[340px] md:h-[420px] px-2 md:px-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={radarData} outerRadius="60%">
                      <PolarGrid stroke="rgba(60,72,88,0.18)" />
                      <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                      <PolarAngleAxis
                        dataKey="axis"
                        tick={<RadarAxisTick />}
                      />
                      <Radar
                        dataKey="score"
                        stroke="var(--primary-ink)"
                        fill="var(--primary)"
                        fillOpacity={0.4}
                        strokeWidth={2}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Per-axis cards — 7 axes lay out 2+2+2+1 on mobile, 4+3 on desktop. */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {GUNA_AXIS_ORDER.map((key, i) => (
                <FadeIn key={key} delay={i * 0.04}>
                  <Card>
                    <CardContent className="py-4">
                      <p className="text-xs font-semibold uppercase tracking-wider text-text-secondary mb-1">
                        {GUNA_AXIS_LABELS[key as GunaAxisKey]}
                      </p>
                      <p className="text-2xl font-bold text-primary leading-none mb-2">
                        {axes[key as GunaAxisKey]}
                      </p>
                      <div className="h-1.5 w-full rounded-full bg-surface-2 overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full"
                          style={{ width: `${axes[key as GunaAxisKey]}%` }}
                        />
                      </div>
                      <p className="mt-2 text-xs text-text-secondary leading-snug">
                        {GUNA_AXIS_DESCRIPTIONS[key as GunaAxisKey]}
                      </p>
                    </CardContent>
                  </Card>
                </FadeIn>
              ))}
            </div>

            {/* Generating banner */}
            {!aiReady && (
              <Card>
                <CardContent className="py-5 flex items-center gap-3">
                  <Loading size="sm" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-text">Building your personality reading…</p>
                    <p className="text-xs text-text-secondary mt-0.5">
                      The radar is ready. Strengths, challenges and recommendations will appear shortly.
                    </p>
                  </div>
                  <button
                    onClick={handleRefresh}
                    className="text-xs font-semibold text-primary hover:underline"
                  >
                    Refresh
                  </button>
                </CardContent>
              </Card>
            )}

            {/* Summary */}
            {content?.summary && (
              <FadeIn>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-[family-name:var(--font-serif)]">✨ Personality Summary</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-text leading-relaxed whitespace-pre-line">
                      {renderInlineBold(content.summary)}
                    </p>
                  </CardContent>
                </Card>
              </FadeIn>
            )}

            {/* Strengths + Challenges side-by-side on md+ */}
            {(strengths.length > 0 || challenges.length > 0) && (
              <div className="grid gap-5 md:grid-cols-2">
                {strengths.length > 0 && (
                  <FadeIn>
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-sm font-[family-name:var(--font-serif)]">💪 Strengths</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ul className="space-y-2.5">
                          {strengths.map((s, i) => (
                            <li key={i} className="flex items-start gap-2 text-sm text-text leading-snug">
                              <span className="text-primary mt-0.5 flex-shrink-0">●</span>
                              <span>{renderInlineBold(s)}</span>
                            </li>
                          ))}
                        </ul>
                      </CardContent>
                    </Card>
                  </FadeIn>
                )}
                {challenges.length > 0 && (
                  <FadeIn delay={0.05}>
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-sm font-[family-name:var(--font-serif)]">⚖️ Growth Edges</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ul className="space-y-2.5">
                          {challenges.map((s, i) => (
                            <li key={i} className="flex items-start gap-2 text-sm text-text leading-snug">
                              <span className="text-accent mt-0.5 flex-shrink-0">●</span>
                              <span>{renderInlineBold(s)}</span>
                            </li>
                          ))}
                        </ul>
                      </CardContent>
                    </Card>
                  </FadeIn>
                )}
              </div>
            )}

            {/* Do + Don't side-by-side on md+ */}
            {(dos.length > 0 || donts.length > 0) && (
              <div className="grid gap-5 md:grid-cols-2">
                {dos.length > 0 && (
                  <FadeIn>
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-sm font-[family-name:var(--font-serif)]">✅ What to do</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ul className="space-y-2.5">
                          {dos.map((s, i) => (
                            <li key={i} className="flex items-start gap-2 text-sm text-text leading-snug">
                              <span className="text-success mt-0.5 flex-shrink-0">✓</span>
                              <span>{renderInlineBold(s)}</span>
                            </li>
                          ))}
                        </ul>
                      </CardContent>
                    </Card>
                  </FadeIn>
                )}
                {donts.length > 0 && (
                  <FadeIn delay={0.05}>
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-sm font-[family-name:var(--font-serif)]">⚠️ What to avoid</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ul className="space-y-2.5">
                          {donts.map((s, i) => (
                            <li key={i} className="flex items-start gap-2 text-sm text-text leading-snug">
                              <span className="text-warning mt-0.5 flex-shrink-0">✕</span>
                              <span>{renderInlineBold(s)}</span>
                            </li>
                          ))}
                        </ul>
                      </CardContent>
                    </Card>
                  </FadeIn>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </MotionPage>
  );
}
