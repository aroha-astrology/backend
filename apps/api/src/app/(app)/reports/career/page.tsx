'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useActiveChart } from '@/hooks/useActiveChart';
import { createClient } from '@/lib/supabase/client';
import { FadeIn, StaggerList, StaggerItem } from '@/components/ui/motion-primitives';
import { Loading } from '@/components/ui/loading';

/* ── Types ─────────────────────────────────────────────────── */

interface AnalysisItem {
  area: string;
  prediction: string;
  confidence?: string;
  planetaryBasis?: string;
  timeline?: string;
}

interface RemedyItem {
  type: string;
  description: string;
  planet?: string;
  urgency?: string;
  instructions?: string;
}

interface CurrentPeriod {
  dasha?: string;
  antardasha?: string;
  effects?: string;
  startDate?: string;
  endDate?: string;
}

interface CareerPrediction {
  summary: string | string[];
  detailedAnalysis: AnalysisItem[];
  currentPeriod?: CurrentPeriod;
  remedies: RemedyItem[];
  warnings: string[];
  favorablePeriods: string[];
  unfavorablePeriods: string[];
}

/* ── Helpers ─────────────────────────────────────────────────── */

function toStringArray(v: unknown): string[] {
  if (typeof v === 'string') return v ? [v] : [];
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string' && x.length > 0);
  return [];
}

function extractJSON(raw: string): Record<string, unknown> | null {
  const tryParse = (s: string) => { try { const v = JSON.parse(s); return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null; } catch { return null; } };
  const direct = tryParse(raw.trim());
  if (direct) return direct;
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) { const r = tryParse(fence[1].trim()); if (r) return r; }
  const first = raw.indexOf('{'), last = raw.lastIndexOf('}');
  if (first >= 0 && last > first) return tryParse(raw.slice(first, last + 1));
  return null;
}

function normalise(raw: Record<string, unknown>): CareerPrediction {
  const analysis: AnalysisItem[] = (Array.isArray(raw.detailedAnalysis) ? raw.detailedAnalysis : [])
    .filter((a): a is Record<string, unknown> => !!a && typeof a === 'object')
    .map(a => ({
      area: typeof a.area === 'string' ? a.area : '',
      prediction: typeof a.prediction === 'string' ? a.prediction : Array.isArray(a.prediction) ? (a.prediction as string[]).join(' ') : '',
      confidence: typeof a.confidence === 'string' ? a.confidence : undefined,
      planetaryBasis: typeof a.planetaryBasis === 'string' ? a.planetaryBasis : undefined,
      timeline: typeof a.timeline === 'string' ? a.timeline : undefined,
    })).filter(a => a.prediction);

  const remedies: RemedyItem[] = (Array.isArray(raw.remedies) ? raw.remedies : [])
    .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
    .map(r => ({
      type: typeof r.type === 'string' ? r.type : 'remedy',
      description: typeof r.description === 'string' ? r.description : '',
      planet: typeof r.planet === 'string' ? r.planet : undefined,
      urgency: typeof r.urgency === 'string' ? r.urgency : undefined,
      instructions: typeof r.instructions === 'string' ? r.instructions : undefined,
    })).filter(r => r.description || r.instructions);

  const cpRaw = raw.currentPeriod as Record<string, unknown> | undefined;
  const currentPeriod: CurrentPeriod | undefined = cpRaw ? {
    dasha: typeof cpRaw.dasha === 'string' ? cpRaw.dasha : undefined,
    antardasha: typeof cpRaw.antardasha === 'string' ? cpRaw.antardasha : undefined,
    effects: typeof cpRaw.effects === 'string' ? cpRaw.effects : undefined,
    startDate: typeof cpRaw.startDate === 'string' ? cpRaw.startDate : undefined,
    endDate: typeof cpRaw.endDate === 'string' ? cpRaw.endDate : undefined,
  } : undefined;

  return {
    summary: raw.summary as string | string[],
    detailedAnalysis: analysis,
    currentPeriod,
    remedies,
    warnings: toStringArray(raw.warnings),
    favorablePeriods: toStringArray(raw.favorablePeriods),
    unfavorablePeriods: toStringArray(raw.unfavorablePeriods),
  };
}

/* ── Config ─────────────────────────────────────────────────── */

const CONFIDENCE_CFG: Record<string, { label: string; color: string; bg: string; bar: string }> = {
  high:   { label: 'High',   color: '#16a34a', bg: 'rgba(22,163,74,0.10)',   bar: '#16a34a' },
  medium: { label: 'Medium', color: '#d97706', bg: 'rgba(217,119,6,0.10)',   bar: '#d97706' },
  low:    { label: 'Low',    color: '#dc2626', bg: 'rgba(220,38,38,0.10)',   bar: '#dc2626' },
};

const URGENCY_CFG: Record<string, { color: string; bg: string }> = {
  high:   { color: '#dc2626', bg: 'rgba(220,38,38,0.10)'  },
  medium: { color: '#d97706', bg: 'rgba(217,119,6,0.10)'  },
  low:    { color: '#0284c7', bg: 'rgba(2,132,199,0.10)'  },
};

const REMEDY_ICON: Record<string, string> = {
  mantra: '📿', gemstone: '💎', charity: '🎁', fasting: '🍽️',
  puja: '🙏', yantra: '🪔', rudraksha: '📿',
};

const CAREER_ASPECTS = [
  { icon: '💼', label: 'Profession & Job' },
  { icon: '📈', label: 'Growth & Promotions' },
  { icon: '💰', label: 'Income & Business' },
  { icon: '🤝', label: 'Partnerships' },
  { icon: '🌍', label: 'Foreign Opportunities' },
  { icon: '🎯', label: 'Career Timing' },
];

/* ── Main Page ─────────────────────────────────────────────── */

export default function CareerReportPage() {
  const router = useRouter();
  const { charts, profiles, activeChartId, setActiveChartId } = useActiveChart();
  const [loading, setLoading] = useState(false);
  const [hydrating, setHydrating] = useState(false);
  // const [harshMode, setHarshMode] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<CareerPrediction | null>(null);

  const activeChart = charts.find(c => c.id === activeChartId);
  const activeProfile = profiles.find(p => p.id === activeChart?.profile_id);

  // Load any saved career prediction for the active chart (no token, no LLM).
  useEffect(() => {
    if (!activeChartId) { setResult(null); return; }
    let cancelled = false;
    setHydrating(true);
    setResult(null);
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from('predictions')
        .select('content')
        .eq('chart_id', activeChartId)
        .eq('type', 'career')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      if (data?.content) {
        const content = data.content as Record<string, unknown> | string;
        const parsed = extractJSON(typeof content === 'string' ? content : JSON.stringify(content))
          ?? (typeof content === 'object' ? content as Record<string, unknown> : null);
        if (parsed) setResult(normalise(parsed));
      }
      setHydrating(false);
    })();
    return () => { cancelled = true; };
  }, [activeChartId]);

  const generate = async () => {
    if (!activeChartId) { setError('Please select a Kundli chart first.'); return; }
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch('/api/predictions/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chartId: activeChartId, type: 'career', harshMode: false }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? 'Failed to generate');
      const content = json.data?.content as Record<string, unknown>;
      const parsed = extractJSON(typeof content === 'string' ? content : JSON.stringify(content)) ?? (content as Record<string, unknown>);
      setResult(normalise(parsed));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  const summaryLines = result ? toStringArray(result.summary) : [];
  const cp = result?.currentPeriod;

  return (
    <div className="min-h-screen">

      {/* ── HEADER ── */}
      <div className="px-4 lg:px-8 pt-6 pb-8 bg-surface border-b border-border">
        <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-[11px] no-underline mb-5 text-text-muted">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M15 18l-6-6 6-6"/></svg>
          Dashboard
        </Link>

        <div className="flex items-start gap-4 mb-6">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl flex-shrink-0 bg-primary/10 border border-primary/20">
            ⭐
          </div>
          <div>
            <p className="j-eyebrow mb-0.5">Vedic Analysis</p>
            <h1 className="text-2xl font-bold text-text j-display">Career Report</h1>
            <p className="text-xs mt-1 text-text-muted">
              Deep analysis of your profession, growth, income &amp; timing from your birth chart.
            </p>
          </div>
        </div>

        {/* What's covered */}
        <div className="grid grid-cols-3 gap-2 mb-6">
          {CAREER_ASPECTS.map(a => (
            <div
              key={a.label}
              className="rounded-xl px-2 py-2.5 flex flex-col items-center gap-1 text-center bg-surface-2 border border-border"
            >
              <span className="text-lg">{a.icon}</span>
              <p className="text-[9px] font-semibold text-text-muted">{a.label}</p>
            </div>
          ))}
        </div>

        {/* Chart selector */}
        {charts.length === 0 ? (
          <Link
            href="/kundli/generate"
            className="w-full py-3 rounded-xl flex items-center justify-center gap-2 text-sm font-semibold no-underline bg-primary/10 border border-primary/30 text-primary"
          >
            🔮 Generate your Kundli first →
          </Link>
        ) : (
          <>
            {charts.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1 mb-3" style={{ scrollbarWidth: 'none' }}>
                {charts.map(c => {
                  const p = profiles.find(pr => pr.id === c.profile_id);
                  const active = c.id === activeChartId;
                  return (
                    <button
                      key={c.id}
                      onClick={() => { setActiveChartId(c.id); setResult(null); }}
                      className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
                      style={{
                        background: active ? 'rgba(212, 175, 55,0.15)' : 'var(--surface-2)',
                        border: active ? '1px solid var(--primary)' : '1px solid var(--border)',
                        color: active ? 'var(--primary)' : 'var(--text-muted)',
                      }}
                    >
                      {p?.name ?? c.id.slice(0, 8)}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="rounded-xl p-3 flex items-center gap-3 mb-4 bg-surface border border-border">
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 bg-primary/10 text-primary">
                {(activeProfile?.name?.[0] ?? '?').toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-text truncate">{activeProfile?.name ?? 'Your Chart'}</p>
                <p className="text-[10px] text-text-muted">
                  {activeProfile?.dob ?? ''}{activeProfile?.pob ? ` · ${activeProfile.pob}` : ''}
                </p>
              </div>
            </div>

            {/* Harsh mode toggle — commented out for now
            <div className="flex items-center justify-between mb-4 px-1">
              <div>
                <p className="text-xs font-semibold text-text">Honest Mode</p>
                <p className="text-[10px] text-text-muted">Unfiltered, direct reading — no sugarcoating</p>
              </div>
              <button
                type="button"
                onClick={() => setHarshMode(h => !h)}
                className="relative h-6 w-11 rounded-full transition-colors duration-200 flex-shrink-0"
                style={{ background: harshMode ? 'var(--primary)' : 'var(--surface-3)' }}
              >
                <span
                  className="absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-all duration-200"
                  style={{ left: harshMode ? '24px' : '4px' }}
                />
              </button>
            </div>
            */}

            {error && <p className="text-xs text-danger mb-3">⚠️ {error}</p>}

            {!result && !loading && !hydrating && (
              <button
                onClick={generate}
                className="w-full py-3.5 rounded-xl text-sm font-bold transition-all active:scale-[0.98] bg-primary text-white"
                style={{ boxShadow: '0 4px 16px rgba(212, 175, 55,0.35)' }}
              >
                ⭐ Generate Career Report — 1 Token
              </button>
            )}

            {result && !loading && (
              <button
                onClick={() => { setResult(null); setError(''); }}
                className="w-full py-2.5 rounded-xl text-xs font-semibold bg-surface-2 border border-border text-text-muted"
              >
                Regenerate Report
              </button>
            )}
          </>
        )}
      </div>

      {/* ── BODY ── */}
      <div className="px-4 lg:px-8 py-6 max-w-3xl mx-auto">

        {loading && (
          <FadeIn>
            <div className="text-center py-16">
              <div className="text-5xl mb-4 animate-pulse">⭐</div>
              <Loading size="lg" />
              <p className="mt-3 text-base font-semibold text-text">Analysing your career chart…</p>
              <p className="mt-1 text-xs text-text-muted">Reading planetary positions, dashas & yogas</p>
            </div>
          </FadeIn>
        )}

        {hydrating && !loading && (
          <div className="text-center py-12">
            <Loading size="md" />
            <p className="mt-2 text-xs text-text-muted">Loading your saved report…</p>
          </div>
        )}

        <AnimatePresence>
          {result && !loading && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="space-y-4"
            >
              {/* Summary */}
              {summaryLines.length > 0 && (
                <FadeIn>
                  <div className="rounded-2xl p-5 bg-surface border border-border">
                    <h2 className="text-sm font-bold mb-3 flex items-center gap-2 text-primary j-display">
                      <span>💼</span> Career Overview
                    </h2>
                    {summaryLines.map((s, i) => (
                      <p key={i} className="text-sm leading-relaxed mb-2 last:mb-0 text-text">{s}</p>
                    ))}
                  </div>
                </FadeIn>
              )}

              {/* Current Dasha Period */}
              {cp && (cp.dasha || cp.effects) && (
                <FadeIn delay={0.06}>
                  <div className="rounded-2xl p-4 bg-primary/[0.05] border border-primary/25" style={{ borderLeft: '4px solid var(--primary)' }}>
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className="text-lg">🪐</span>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-primary">Current Dasha Period</h3>
                      {(cp.dasha || cp.antardasha) && (
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                          {[cp.dasha, cp.antardasha].filter(Boolean).join(' → ')}
                        </span>
                      )}
                    </div>
                    {cp.effects && <p className="text-sm leading-relaxed text-text">{cp.effects}</p>}
                  </div>
                </FadeIn>
              )}

              {/* Detailed Analysis */}
              {result.detailedAnalysis.length > 0 && (
                <FadeIn delay={0.1}>
                  <div>
                    <h2 className="text-base font-bold mb-3 flex items-center gap-2 text-text">
                      <span>📊</span> Detailed Career Analysis
                    </h2>
                    <StaggerList className="space-y-2.5">
                      {result.detailedAnalysis.map((a, i) => {
                        const conf = a.confidence ? CONFIDENCE_CFG[a.confidence.toLowerCase()] : undefined;
                        return (
                          <StaggerItem key={i}>
                            <div
                              className="rounded-xl p-4 border"
                              style={{ background: 'var(--surface)', borderColor: conf ? conf.color + '33' : 'var(--border)' }}
                            >
                              <div className="flex items-start justify-between gap-2 mb-2 flex-wrap">
                                {a.area && (
                                  <h4 className="text-sm font-bold text-text">{a.area}</h4>
                                )}
                                <div className="flex items-center gap-1.5 flex-wrap ml-auto">
                                  {conf && (
                                    <span
                                      className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                                      style={{ background: conf.bg, color: conf.color }}
                                    >
                                      {conf.label} confidence
                                    </span>
                                  )}
                                  {a.timeline && (
                                    <span className="text-[9px] font-medium text-text-muted">⏳ {a.timeline}</span>
                                  )}
                                </div>
                              </div>
                              <p className="text-sm leading-relaxed mb-2 text-text">{a.prediction}</p>
                              {conf && (
                                <div className="h-1 rounded-full mb-2 bg-surface-2">
                                  <div
                                    className="h-full rounded-full"
                                    style={{
                                      background: conf.bar,
                                      width: conf.label === 'High' ? '80%' : conf.label === 'Medium' ? '55%' : '30%',
                                    }}
                                  />
                                </div>
                              )}
                              {a.planetaryBasis && (
                                <p className="text-[11px] leading-relaxed italic border-l-2 pl-2" style={{ color: '#8B7355', borderColor: 'var(--primary)' }}>
                                  🪐 {a.planetaryBasis}
                                </p>
                              )}
                            </div>
                          </StaggerItem>
                        );
                      })}
                    </StaggerList>
                  </div>
                </FadeIn>
              )}

              {/* Favourable & Unfavourable Periods */}
              {(result.favorablePeriods.length > 0 || result.unfavorablePeriods.length > 0) && (
                <FadeIn delay={0.14}>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {result.favorablePeriods.length > 0 && (
                      <div
                        className="rounded-xl p-4"
                        style={{ background: 'rgba(22,163,74,0.07)', border: '1px solid rgba(22,163,74,0.2)' }}
                      >
                        <h3 className="text-xs font-bold uppercase tracking-wider mb-2.5 flex items-center gap-1.5" style={{ color: '#16a34a' }}>
                          <span>✅</span> Favourable Periods
                        </h3>
                        <ul className="space-y-1.5">
                          {result.favorablePeriods.map((p, i) => (
                            <li key={i} className="text-xs leading-relaxed flex items-start gap-1.5 text-text">
                              <span className="mt-0.5" style={{ color: '#16a34a' }}>+</span> {p}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {result.unfavorablePeriods.length > 0 && (
                      <div
                        className="rounded-xl p-4"
                        style={{ background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.15)' }}
                      >
                        <h3 className="text-xs font-bold uppercase tracking-wider mb-2.5 flex items-center gap-1.5" style={{ color: '#dc2626' }}>
                          <span>⚠️</span> Challenging Periods
                        </h3>
                        <ul className="space-y-1.5">
                          {result.unfavorablePeriods.map((p, i) => (
                            <li key={i} className="text-xs leading-relaxed flex items-start gap-1.5 text-text">
                              <span className="mt-0.5" style={{ color: '#dc2626' }}>−</span> {p}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </FadeIn>
              )}

              {/* Warnings */}
              {result.warnings.length > 0 && (
                <FadeIn delay={0.17}>
                  <div
                    className="rounded-xl p-4"
                    style={{ background: 'rgba(217,119,6,0.07)', border: '1.5px solid rgba(217,119,6,0.2)', borderLeft: '4px solid #d97706' }}
                  >
                    <h3 className="text-xs font-bold uppercase tracking-wider mb-2.5 flex items-center gap-1.5" style={{ color: '#d97706' }}>
                      <span>⚠️</span> Cautions
                    </h3>
                    <ul className="space-y-1.5">
                      {result.warnings.map((w, i) => (
                        <li key={i} className="text-sm leading-relaxed text-text">• {w}</li>
                      ))}
                    </ul>
                  </div>
                </FadeIn>
              )}

              {/* Remedies */}
              {result.remedies.length > 0 && (
                <FadeIn delay={0.2}>
                  <div>
                    <h2 className="text-base font-bold mb-3 flex items-center gap-2 text-text">
                      <span>🙏</span> Vedic Remedies for Career
                    </h2>
                    <div className="space-y-2.5">
                      {result.remedies.map((r, i) => {
                        const icon = REMEDY_ICON[r.type.toLowerCase()] ?? '✨';
                        const urg = r.urgency ? URGENCY_CFG[r.urgency.toLowerCase()] : undefined;
                        return (
                          <div
                            key={i}
                            className="rounded-xl p-4 border flex gap-3 bg-surface border-border"
                          >
                            <span className="text-2xl flex-shrink-0 mt-0.5">{icon}</span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text)' }}>
                                  {r.type}
                                </span>
                                {r.planet && r.planet !== 'None' && (
                                  <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(212, 175, 55,0.12)', color: '#8B7355' }}>
                                    {r.planet}
                                  </span>
                                )}
                                {urg && (
                                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full ml-auto" style={{ background: urg.bg, color: urg.color }}>
                                    {r.urgency} priority
                                  </span>
                                )}
                              </div>
                              {r.description && <p className="text-sm leading-relaxed mb-1 text-text">{r.description}</p>}
                              {r.instructions && (
                                <p className="text-xs leading-relaxed text-text-muted">
                                  <span className="font-semibold">How: </span>{r.instructions}
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </FadeIn>
              )}

              <FadeIn delay={0.24}>
                <button
                  onClick={() => router.push(`/chat?chartId=${activeChartId}&topic=career&astrologer=yogi-baba`)}
                  className="w-full py-4 rounded-2xl flex items-center justify-center gap-3 font-bold text-sm active:scale-[0.98] transition-all"
                  style={{ background: 'linear-gradient(135deg,#7C3AED,#9F67FA)', color: '#fff', boxShadow: '0 4px 20px rgba(124,58,237,0.3)' }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                  </svg>
                  Talk to Astrologer about this Report
                </button>
              </FadeIn>

              <FadeIn delay={0.28}>
                <div className="text-center pt-2 pb-8">
                  <p className="text-[10px]" style={{ color: '#B8A590' }}>
                    Based on Vedic astrology + AI. Use as guidance, not absolute truth.
                  </p>
                </div>
              </FadeIn>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Empty state */}
        {!result && !loading && !hydrating && charts.length > 0 && (
          <FadeIn>
            <div className="text-center py-16">
              <div className="text-6xl mb-4">⭐</div>
              <p className="text-base font-semibold mb-1 text-text">Ready to reveal your career destiny?</p>
              <p className="text-sm text-text-muted">Tap "Generate Career Report" above to start.</p>
            </div>
          </FadeIn>
        )}
      </div>
    </div>
  );
}
