'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { capturePhoto, isNative } from '@/lib/native';
import { motion, AnimatePresence } from 'framer-motion';
import { MotionPage, FadeIn, StaggerList, StaggerItem } from '@/components/ui/motion-primitives';
import { cardHover } from '@/lib/motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loading } from '@/components/ui/loading';
import { RichText } from '@/components/ui/rich-text';
import { StructuredReading } from '@/components/ui/structured-reading';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { traceLines, type PalmPolylines } from '@/lib/palm/handLandmarks';
import { LiveCapture } from '@/components/palm/LiveCapture';
import { LINE_STYLES, INSIGHT_CHIPS } from '@/lib/palm/lineColors';
import { PalmInfographic, type PalmLines } from '@/components/palm/PalmInfographic';

/** Convert MediaPipe PalmPolylines (raw [x,y] arrays) to the PalmLines shape
 *  PalmInfographic expects ({ polyline: [...] } per line). */
function polylinesToLines(p: PalmPolylines | null): PalmLines {
  if (!p) return {};
  return {
    heart: p.heart ? { polyline: p.heart } : undefined,
    head:  p.head  ? { polyline: p.head  } : undefined,
    life:  p.life  ? { polyline: p.life  } : undefined,
    fate:  p.fate  ? { polyline: p.fate  } : undefined,
  };
}

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

interface LineReading {
  name: string;
  icon: string;
  length?: string;
  strength?: string;
  depth?: string;
  branches?: string;
  curve?: string;
  presence?: string;
  clarity?: string;
  count?: number;
  interpretation: string;
}

interface PalmAnalysis {
  handShape?: { type?: string; vedic_element?: string; description?: string };
  majorLines?: Record<string, LineData>;
  minorLines?: Record<string, LineData>;
  mounts?: Record<string, { development?: string; interpretation?: string }>;
  fingerAnalysis?: Record<string, { shape?: string; flexibility?: string; length?: string; interpretation?: string }>;
  specialMarkings?: string[];
  pastLifeImprints?: string;
  soulPurpose?: string;
  overallPersonality?: string;
  careerSuggestions?: string[];
  healthWarnings?: string[];
  luckyPeriods?: string[];
  relationshipOutlook?: string;
  financialOutlook?: string;
  remedies?: string[];
  vedicCorrelation?: string;
  panditMessage?: string;
}

type LineData = {
  present?: boolean;
  length?: string;
  depth?: string;
  branches?: string;
  curvature?: string;
  curve?: string;
  strength?: string;
  interpretation?: string;
  count?: number;
  clarity?: string;
};

interface KarmicShift {
  karmicShift: string;
  freeWillExpression: string;
  growthAreas: string[];
  alignmentScore: number;
  panditMessage: string;
}

interface CombinedReport {
  unifiedIdentity: string;
  careerAndDharma: string;
  relationships: string;
  healthAndVitality: string;
  spiritualPath: string;
  timingNow: string;
  remedies: string[];
  panditSynthesis: string;
  reconciliationNotes: string[];
}

type Hand = 'left' | 'right';
type Mode = 'single' | 'compare';
type Stage = 'idle' | 'validating' | 'preprocessing' | 'lines' | 'mounts' | 'soul' | 'comparing' | 'done' | 'queued' | 'error';
type ReportDepth = 'basic' | 'full' | 'ultra';

const LANGUAGES = [
  'English', 'Hindi', 'Bengali', 'Tamil', 'Telugu', 'Marathi', 'Gujarati',
  'Kannada', 'Malayalam', 'Punjabi', 'Odia', 'Urdu', 'Nepali',
] as const;

interface SlotState {
  dataUrl: string | null;
  fileName: string;
  validation: { ok: boolean; reason?: string; hint?: string } | null;
  analysis: PalmAnalysis | null;
  readingId: string | null;
  stage: Stage;
  stagesDone: Set<string>;
  /** MediaPipe-derived polylines snapshotted at capture/upload time. Used to show
   *  the four major lines on the captured photo while the AI analysis is still
   *  running in the background. */
  polylines: PalmPolylines | null;
}

const emptySlot = (): SlotState => ({
  dataUrl: null,
  fileName: '',
  validation: null,
  analysis: null,
  readingId: null,
  stage: 'idle',
  stagesDone: new Set(),
  polylines: null,
});

/* -------------------------------------------------------------------------- */
/*  Page                                                                      */
/* -------------------------------------------------------------------------- */

export default function PalmReadingPage() {
  const queryClient = useQueryClient();
  const router = useRouter();
  // Compare mode is intentionally removed — palm reading is single-hand only,
  // locked to the user's gendered hand (female=left, male=right). We keep the
  // `mode` value typed as Mode (not narrowed to 'single') so the legacy
  // mode-checked blocks elsewhere in this file remain type-legal until the
  // next cleanup pass deletes them.
  const [mode] = useState<Mode>('single');
  const [hand, setHand] = useState<Hand>('right');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [left, setLeft] = useState<SlotState>(emptySlot);
  const [right, setRight] = useState<SlotState>(emptySlot);
  const [showNewReading, setShowNewReading] = useState(false);
  /** True when hand was auto-picked by gender (drives the caption beneath the pill). */
  const [genderDefaulted, setGenderDefaulted] = useState(false);
  /** When true, the user opted to upload a photo instead of using live camera. */
  const [useUploadFallback, setUseUploadFallback] = useState(false);
  const [reportDepth, setReportDepth] = useState<ReportDepth>('full');
  const [language, setLanguage] = useState('English');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/user/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (cancelled || !json?.success) return;
        const g = (json.data?.gender ?? null) as string | null;
        if (g === 'female') {
          setHand('left');
          setGenderDefaulted(true);
        } else if (g === 'male') {
          setHand('right');
          setGenderDefaulted(true);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const { data: latestData } = useQuery<{
    reading: { id: string; hand: string; imageUrl: string; analysis: PalmAnalysis; createdAt: string } | null;
    usage?: { used: number; max: number };
  }>({
    queryKey: ['palm-latest'],
    queryFn: async () => {
      const r = await fetch('/api/palm/latest');
      if (!r.ok) return { reading: null };
      return r.json();
    },
    staleTime: Infinity,
    gcTime: Infinity,
  });

  const savedReading = latestData?.reading?.analysis ? latestData.reading : null;
  const usage = latestData?.usage ?? { used: 0, max: 3 };
  const attemptsLeft = Math.max(0, usage.max - usage.used);
  const reachedLimit = usage.used >= usage.max;
  const isOnApp = isNative();
  const [karmic, setKarmic] = useState<KarmicShift | null>(null);
  const [combined, setCombined] = useState<CombinedReport | null>(null);
  const [combinedBusy, setCombinedBusy] = useState(false);
  const [combinedError, setCombinedError] = useState('');
  const [combinedNeedsChart, setCombinedNeedsChart] = useState(false);

  /* Reset slots when toggling mode so stale state doesn't leak across views. */
  useEffect(() => {
    setLeft(emptySlot());
    setRight(emptySlot());
    setKarmic(null);
    setCombined(null);
    setCombinedError('');
    setCombinedNeedsChart(false);
    setError('');
  }, [mode]);

  /* Combined-report generator: reconciles palm + kundli into one prediction. */
  async function handleGenerateCombined(palmReadingId: string) {
    setCombinedBusy(true);
    setCombinedError('');
    setCombinedNeedsChart(false);
    try {
      const res = await fetch('/api/reports/combined', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ palmReadingId }),
      });
      const json = await res.json().catch(() => null);
      if (res.status === 412) {
        setCombinedNeedsChart(true);
        return;
      }
      if (!res.ok || !json?.success) {
        throw new Error(json?.error ?? 'Failed to generate combined report');
      }
      setCombined(json.data?.report ?? null);
    } catch (err) {
      setCombinedError(err instanceof Error ? err.message : 'Combined report failed');
    } finally {
      setCombinedBusy(false);
    }
  }

  const activeSlot = mode === 'single' ? (hand === 'left' ? left : right) : left; // single-mode uses chosen hand
  const setActiveSlot = (updater: (s: SlotState) => SlotState) => {
    if (mode === 'single') {
      hand === 'left' ? setLeft(updater) : setRight(updater);
    }
  };

  /* ------------------------------ analyze flow ----------------------------- */

  async function handleSingleAnalyze() {
    if (!activeSlot.dataUrl) return;
    setError('');
    setBusy(true);
    setActiveSlot((s) => ({ ...s, analysis: null, readingId: null, stagesDone: new Set(), stage: 'preprocessing' }));
    try {
      const clientPolylines = await detectPolylines(activeSlot.dataUrl, hand);
      const res = await fetch('/api/palm/enqueue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: activeSlot.dataUrl, hand, clientPolylines, reportDepth, language }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        throw new Error(json?.error ?? 'Failed to queue palm reading');
      }
      queryClient.invalidateQueries({ queryKey: ['palm-latest'] });
      queryClient.invalidateQueries({ queryKey: ['palm-list'] });
      const readingId = json.data?.readingId;
      if (readingId) {
        setActiveSlot((s) => ({ ...s, readingId, stage: json.data?.cached ? 'done' : 'queued' }));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Analysis failed';
      setError(
        msg === 'PALM_READING_LIMIT_REACHED'
          ? "You've used all 3 palm readings. Pandit-ji reads each hand only a few times — the hand changes slowly."
          : msg,
      );
      setActiveSlot((s) => ({ ...s, stage: 'error' }));
    } finally {
      setBusy(false);
    }
  }

  /** Called when LiveCapture produces a fresh JPEG data URL + the latest live polylines.
   *  Prefer the live polylines (MediaPipe ran on the video frame); only fall back to
   *  re-detecting on the static capture if live detection wasn't ready. */
  async function handleLiveCapture(dataUrl: string, livePolylines: PalmPolylines | null) {
    setError('');
    setBusy(true);
    setUseUploadFallback(false);
    // Resolve polylines up-front so we can show them on the captured photo
    // even before the AI analysis comes back.
    const clientPolylines = livePolylines ?? (await detectPolylines(dataUrl, hand));
    const updateSlot = (s: SlotState): SlotState => ({
      ...s,
      dataUrl,
      fileName: 'live-capture.jpg',
      validation: { ok: true },
      analysis: null,
      readingId: null,
      stagesDone: new Set(),
      stage: 'preprocessing',
      polylines: clientPolylines,
    });
    if (hand === 'left') setLeft(updateSlot);
    else setRight(updateSlot);
    const setStage = hand === 'left' ? setLeft : setRight;
    try {
      const res = await fetch('/api/palm/enqueue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: dataUrl, hand, clientPolylines, reportDepth, language }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        throw new Error(json?.error ?? 'Failed to queue palm reading');
      }
      queryClient.invalidateQueries({ queryKey: ['palm-latest'] });
      queryClient.invalidateQueries({ queryKey: ['palm-list'] });
      const readingId = json.data?.readingId ?? null;
      setStage((s) => ({ ...s, readingId, stage: json.data?.cached ? 'done' : 'queued' }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Analysis failed';
      setError(
        msg === 'PALM_READING_LIMIT_REACHED'
          ? "You've used all 3 palm readings. Pandit-ji reads each hand only a few times — the hand changes slowly."
          : msg,
      );
      setStage((s) => ({ ...s, stage: 'error' }));
    } finally {
      setBusy(false);
    }
  }

  async function handleCompareAnalyze() {
    if (!left.dataUrl || !right.dataUrl) return;
    setError('');
    setBusy(true);
    setKarmic(null);
    setLeft((s) => ({ ...s, analysis: null, readingId: null, stagesDone: new Set(), stage: 'preprocessing' }));
    setRight((s) => ({ ...s, analysis: null, readingId: null, stagesDone: new Set(), stage: 'preprocessing' }));

    try {
      // Trace MediaPipe polylines for both hands first (parallel, on-device).
      const [leftPolys, rightPolys] = await Promise.all([
        detectPolylines(left.dataUrl, 'left'),
        detectPolylines(right.dataUrl, 'right'),
      ]);

      // Run both hands in parallel SSE streams.
      const [leftResult, rightResult] = await Promise.all([
        streamAnalysis(left.dataUrl, 'left', leftPolys, (patch) => setLeft((s) => ({ ...s, ...patch }))),
        streamAnalysis(right.dataUrl, 'right', rightPolys, (patch) => setRight((s) => ({ ...s, ...patch }))),
      ]);

      // Compare delta.
      setLeft((s) => ({ ...s, stage: 'comparing' }));
      setRight((s) => ({ ...s, stage: 'comparing' }));
      const cmp = await fetch('/api/palm/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leftReadingId: leftResult.readingId, rightReadingId: rightResult.readingId }),
      });
      if (!cmp.ok) throw new Error((await cmp.json().catch(() => null))?.error ?? 'Compare failed');
      const cmpJson = await cmp.json();
      setKarmic(cmpJson.data?.comparison ?? null);
      setLeft((s) => ({ ...s, stage: 'done' }));
      setRight((s) => ({ ...s, stage: 'done' }));
      queryClient.invalidateQueries({ queryKey: ['palm-latest'] });
      queryClient.invalidateQueries({ queryKey: ['palm-list'] });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
      setLeft((s) => ({ ...s, stage: 'error' }));
      setRight((s) => ({ ...s, stage: 'error' }));
    } finally {
      setBusy(false);
    }
  }

  /* ------------------------------ render ----------------------------------- */

  const canAnalyzeSingle = mode === 'single' && !!activeSlot.dataUrl && (!activeSlot.validation || activeSlot.validation.ok) && !busy && activeSlot.stage !== 'queued';
  const canAnalyzeCompare = mode === 'compare' && !!left.dataUrl && !!right.dataUrl &&
    (!left.validation || left.validation.ok) && (!right.validation || right.validation.ok) && !busy;

  return (
    <MotionPage className="mx-auto max-w-4xl px-4 py-6 min-h-screen">
      {/* Header */}
      <div className="mb-5">
        <p className="text-[10px] font-semibold tracking-[0.2em] text-primary/70 uppercase mb-1">Samudrika Shastra</p>
        <h1 className="font-[family-name:var(--font-serif)] text-2xl md:text-3xl font-bold text-text tracking-wide">Hasta Rekha — Palm Reading</h1>
        <p className="mt-0.5 text-sm text-text-secondary">Pandit Hastamani Shastri reads Brahma's divine script written in your hand</p>
      </div>

      {/* Pandit intro */}
      <FadeIn>
        <div className="mb-4 rounded-xl px-4 py-3 flex items-start gap-3" style={{ background: 'rgba(212, 175, 55,0.07)', border: '1px solid rgba(212, 175, 55,0.22)' }}>
          <div className="text-2xl mt-0.5">🙏</div>
          <div>
            <p className="text-[12px] font-semibold text-primary">Pandit Hastamani Shastri</p>
            <p className="text-[11px] text-text-secondary leading-relaxed mt-0.5">Samudrika Shastra master from Varanasi · Unbroken 3,000-year Brahmin lineage · 60 years of practice · 50,000 palms read</p>
          </div>
        </div>
      </FadeIn>

      {/* 3-step quick-start framing */}
      <FadeIn delay={0.05}>
        <div className="mb-4 grid grid-cols-3 gap-2">
          {[
            { n: '1', title: 'Take a clear palm photo', sub: "We'll guide the framing" },
            { n: '2', title: 'Pandit-ji reads your lines', sub: '8 mounts · 4 major lines · markings' },
            { n: '3', title: 'Get your full reading', sub: 'Soul, career, love, remedies' },
          ].map((s) => (
            <div key={s.n} className="rounded-xl border border-border bg-surface p-3">
              <div className="flex items-center gap-2 mb-1">
                <span
                  className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold"
                  style={{ background: 'var(--primary)', color: '#fff' }}
                >
                  {s.n}
                </span>
                <p className="text-[11px] font-semibold text-text leading-tight">{s.title}</p>
              </div>
              <p className="text-[10px] text-text-secondary leading-snug">{s.sub}</p>
            </div>
          ))}
        </div>
      </FadeIn>

      {/* Hand label — locked to gender. Female → left, male → right (Samudrika Shastra). */}
      {(showNewReading || !savedReading || !!activeSlot.analysis || busy || activeSlot.stage === 'queued') && (
        <FadeIn delay={0.08}>
          <div className="mb-4 flex flex-col items-center gap-2">
            <div className="flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5">
              <span className="text-[14px]">{hand === 'left' ? '🤛' : '🤜'}</span>
              <p className="text-[12px] font-semibold text-text">
                We&apos;re reading your <span className="text-[var(--primary)]">{hand}</span> hand
              </p>
            </div>
            {genderDefaulted && (
              <p className="text-center text-[10px] text-text-secondary max-w-xs leading-snug">
                In Samudrika Shastra, women&apos;s left hand and men&apos;s right hand reveal active karma.
              </p>
            )}
          </div>
        </FadeIn>
      )}

      {/* Report depth + language selector — only shown when capture is active */}
      {(showNewReading || !savedReading) && !busy && activeSlot.stage !== 'queued' && (
        <FadeIn delay={0.09}>
          <div className="mb-4 rounded-xl border border-border bg-surface px-4 py-3 space-y-3">
            {/* Depth selector */}
            <div>
              <p className="text-[10px] font-bold tracking-widest uppercase text-text-secondary mb-2">Report Depth</p>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { d: 'basic' as ReportDepth, label: 'Basic', words: '1500–2500 words', icon: '📄' },
                  { d: 'full'  as ReportDepth, label: 'Full',  words: '2500–4000 words', icon: '📋' },
                  { d: 'ultra' as ReportDepth, label: 'Ultra', words: '5000+ words',     icon: '📚' },
                ]).map(({ d, label, words, icon }) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setReportDepth(d)}
                    className="rounded-xl p-2.5 text-left transition-all"
                    style={{
                      background: reportDepth === d ? 'rgba(var(--primary-rgb, 122,150,171),0.15)' : 'var(--surface-hover)',
                      border: `1px solid ${reportDepth === d ? 'var(--primary)' : 'var(--border)'}`,
                    }}
                  >
                    <p className="text-base mb-0.5">{icon}</p>
                    <p className="text-[11px] font-bold text-text">{label}</p>
                    <p className="text-[9px] text-text-secondary leading-tight">{words}</p>
                  </button>
                ))}
              </div>
            </div>
            {/* Language selector */}
            <div>
              <p className="text-[10px] font-bold tracking-widest uppercase text-text-secondary mb-1.5">Reading Language</p>
              <div className="relative">
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-[12px] text-text appearance-none pr-8"
                >
                  {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
                <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-text-secondary text-xs">▾</span>
              </div>
            </div>
          </div>
        </FadeIn>
      )}

      {/* Single-hand capture — LiveCapture primary, UploadSlot fallback */}
      {mode === 'single' && (showNewReading || !savedReading || !!activeSlot.analysis || busy || activeSlot.stage === 'queued') && !activeSlot.analysis && !busy && activeSlot.stage !== 'queued' && (
        <FadeIn delay={0.1}>
          {reachedLimit ? (
            <Card className="mb-4 border-warning/40 bg-warning/8">
              <CardContent className="py-6 text-center space-y-2">
                <div className="text-3xl">🪷</div>
                <p className="text-[14px] font-bold text-text">You've used all 3 palm readings</p>
                <p className="text-[11px] text-text-secondary leading-relaxed max-w-xs mx-auto">
                  Pandit-ji limits each seeker to three readings — the hand changes slowly. Your latest reading stays here for you to revisit any time.
                </p>
              </CardContent>
            </Card>
          ) : !isOnApp ? (
            <Card className="mb-4 border-primary/30 bg-gradient-to-br from-primary/8 to-accent/6">
              <CardContent className="py-6 text-center space-y-3">
                <div className="text-3xl">📱</div>
                <p className="text-[14px] font-bold text-text">Palm reading is in the Aroha Astrology app</p>
                <p className="text-[11px] text-text-secondary leading-relaxed max-w-xs mx-auto">
                  Open the app to scan your palm with the live camera guide. Your existing reading stays viewable here on web.
                </p>
                <a
                  href="/more"
                  className="inline-flex items-center gap-2 rounded-full bg-[var(--primary)] px-5 py-2 text-[12px] font-semibold text-white"
                >
                  Get the app
                </a>
              </CardContent>
            </Card>
          ) : !useUploadFallback ? (
            <div className="mb-4">
              <LiveCapture
                hand={hand}
                onCapture={handleLiveCapture}
                onUseUpload={() => setUseUploadFallback(true)}
              />
            </div>
          ) : (
            <Card className="mb-4">
              <CardHeader>
                <CardTitle className="flex items-center gap-1.5 text-sm font-[family-name:var(--font-serif)]">
                  <span>&#9995;</span> Upload your {hand} palm
                </CardTitle>
                <CardDescription className="text-[11px]">JPG/PNG · max 10 MB</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <UploadSlot
                  slot={activeSlot}
                  onChange={(s) => (hand === 'left' ? setLeft(s) : setRight(s))}
                  label={hand === 'left' ? 'Left palm' : 'Right palm'}
                />
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    { icon: '☀️', tip: 'Bright light · no harsh shadows' },
                    { icon: '🤚', tip: 'Spread fingers · palm flat' },
                    { icon: '📐', tip: 'Camera directly above' },
                    { icon: '🔍', tip: 'Sharp focus · lines visible' },
                  ].map(({ icon, tip }) => (
                    <div key={tip} className="flex items-start gap-1.5 rounded-lg bg-surface-hover p-2">
                      <span className="text-base">{icon}</span>
                      <p className="text-[10px] text-text-secondary leading-snug">{tip}</p>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => setUseUploadFallback(false)}
                    className="text-[11px] font-medium text-text-secondary underline underline-offset-2"
                  >
                    ← Use camera instead
                  </button>
                  <Button size="lg" onClick={handleSingleAnalyze} isLoading={busy} disabled={!canAnalyzeSingle}>
                    Analyze Palm
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </FadeIn>
      )}

      {/* Compare-hands upload */}
      {mode === 'compare' && (
        <FadeIn delay={0.1}>
          <Card className="mb-4">
            <CardHeader>
              <CardTitle className="flex items-center gap-1.5 text-sm font-[family-name:var(--font-serif)]">
                <span>🤲</span> Both hands — Karmic shift reading
              </CardTitle>
              <CardDescription className="text-[11px]">
                Left = inherited blueprint (purvakarma). Right = current path (vartamana karma). The difference reveals your soul's free will.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <UploadSlot slot={left} onChange={setLeft} label="🤛 Left palm" />
                <UploadSlot slot={right} onChange={setRight} label="Right palm 🤜" />
              </div>
              <div className="flex justify-center pt-1">
                <Button size="lg" onClick={handleCompareAnalyze} isLoading={busy} disabled={!canAnalyzeCompare}>
                  Read both hands
                </Button>
              </div>
            </CardContent>
          </Card>
        </FadeIn>
      )}

      {error && (
        <FadeIn>
          <Card className="mb-4 border-error/50">
            <CardContent className="py-3 text-center text-error text-sm">{error}</CardContent>
          </Card>
        </FadeIn>
      )}

      {/* Background-queued success banner (single mode) — shows the captured palm
          with detected lines overlaid so the user sees the four major lines
          immediately while the detailed AI reading runs in the background. */}
      {mode === 'single' && activeSlot.stage === 'queued' && activeSlot.dataUrl && (
        <FadeIn>
          <Card className="mb-4 border-primary/40" style={{ background: 'rgba(212, 175, 55,0.07)' }}>
            <CardContent className="py-5">
              {/* Captured photo with live polylines overlaid */}
              <div className="mx-auto mb-4" style={{ maxWidth: 320 }}>
                <PalmInfographic
                  imageUrl={activeSlot.dataUrl}
                  hand={hand}
                  lines={polylinesToLines(activeSlot.polylines)}
                  variant="full"
                />
              </div>
              <div className="text-center">
                <div className="text-3xl mb-2">🙏</div>
                <p className="text-[14px] font-bold text-[var(--text)] mb-1">
                  Your four main lines are revealed
                </p>
                <p className="text-[12px] text-text-secondary leading-relaxed mb-4 max-w-sm mx-auto">
                  Pandit-ji is now decoding the full meaning — soul purpose, career, love, remedies. We&apos;ll send you a push notification when your detailed reading is ready.
                </p>
                <a
                  href="/dashboard"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-[12px] font-semibold"
                  style={{ background: 'var(--primary)', color: '#fff' }}
                >
                  ← Go to Dashboard
                </a>
              </div>
            </CardContent>
          </Card>
        </FadeIn>
      )}

      {/* Streaming progress (compare mode only) */}
      {busy && mode === 'compare' && (
        <FadeIn>
          <Card className="mb-4">
            <CardContent className="py-4">
              <Loading size="lg" section="palm" />
              <div className="mt-3 grid grid-cols-2 gap-3">
                <ProgressColumn label="Left hand" slot={left} />
                <ProgressColumn label="Right hand" slot={right} />
              </div>
            </CardContent>
          </Card>
        </FadeIn>
      )}

      {/* Single-mode uploading spinner (before enqueue completes) */}
      {busy && mode === 'single' && (
        <FadeIn>
          <Card className="mb-4">
            <CardContent className="py-4 text-center">
              <Loading size="lg" section="palm" />
            </CardContent>
          </Card>
        </FadeIn>
      )}

      {/* Combined-report CTA — appears once a reading is on disk and we have an id to pin to. */}
      {(() => {
        const sourceId = mode === 'single' ? activeSlot.readingId : right.readingId;
        const hasReading = mode === 'single' ? !!activeSlot.analysis : !!right.analysis;
        if (!hasReading || !sourceId || busy) return null;
        return (
          <FadeIn>
            <CombinedReportPanel
              palmReadingId={sourceId}
              report={combined}
              loading={combinedBusy}
              error={combinedError}
              needsChart={combinedNeedsChart}
              onGenerate={() => handleGenerateCombined(sourceId)}
            />
          </FadeIn>
        );
      })()}

      {/* Results — active reading takes priority; fall back to last saved reading */}
      {mode === 'single' && activeSlot.analysis && activeSlot.stage !== 'queued' && (
        <ResultsView analysis={activeSlot.analysis} />
      )}
      {mode === 'single' && !activeSlot.analysis && !busy && activeSlot.stage !== 'queued' && savedReading && !showNewReading && (
        <FadeIn>
          {/* ── Existing reading banner ── */}
          <div className="mb-4 rounded-xl px-4 py-3 space-y-3" style={{ background: 'rgba(212, 175, 55,0.07)', border: '1px solid rgba(212, 175, 55,0.18)' }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg">🪷</span>
                <p className="text-[12px] font-semibold text-text">Your palm reading is ready</p>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                  style={{ background: 'rgba(34,197,94,0.12)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.2)' }}>
                  {new Date(savedReading.createdAt ?? '').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                </span>
              </div>
              <span className="text-[10px] font-medium text-text-secondary">{usage.used}/{usage.max} used</span>
            </div>
            <div className="flex gap-2">
              <a
                href={`/palm/${savedReading.id}`}
                className="flex-1 text-center py-2 rounded-full text-[12px] font-semibold text-white"
                style={{ background: 'var(--primary)' }}
              >
                View Full Reading →
              </a>
              <button
                type="button"
                onClick={() => { setDeletingId(savedReading.id); setConfirmDelete(true); }}
                className="px-4 py-2 rounded-full text-[12px] font-medium border border-red-400/30 text-red-400 hover:bg-red-400/10 transition-colors"
              >
                Delete
              </button>
            </div>
            {!reachedLimit && isOnApp && (
              <button
                type="button"
                onClick={() => setShowNewReading(true)}
                className="w-full text-center text-[10px] text-text-secondary underline underline-offset-2"
              >
                Take a new reading ({attemptsLeft} {attemptsLeft === 1 ? 'attempt' : 'attempts'} left)
              </button>
            )}
          </div>
          <ResultsView analysis={savedReading.analysis} />
        </FadeIn>
      )}

      {/* ── Delete confirm modal ── */}
      <AnimatePresence>
        {confirmDelete && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
            onClick={() => setConfirmDelete(false)}
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-2xl p-6 text-center bg-surface"
              style={{ border: '1px solid var(--border)' }}
            >
              <p className="text-3xl mb-2">🗑️</p>
              <p className="text-[15px] font-bold text-text mb-2">Delete this reading?</p>
              <p className="text-[12px] text-text-secondary mb-5 leading-relaxed">
                This will permanently remove your palm reading and photo. Cannot be undone.
              </p>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setConfirmDelete(false)}>Cancel</Button>
                <button
                  className="flex-1 py-2 rounded-full text-[13px] font-semibold text-white bg-red-500 disabled:opacity-50"
                  disabled={busy}
                  onClick={async () => {
                    if (!deletingId) return;
                    setBusy(true);
                    try {
                      await fetch(`/api/palm/${deletingId}`, { method: 'DELETE' });
                      queryClient.invalidateQueries({ queryKey: ['palm-latest'] });
                      queryClient.invalidateQueries({ queryKey: ['palm-list'] });
                      setConfirmDelete(false);
                      setDeletingId(null);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {busy ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {mode === 'compare' && (left.analysis || right.analysis) && (
        <div className="space-y-4">
          {karmic && <KarmicShiftCard karmic={karmic} />}
          {left.analysis && (
            <details open className="rounded-xl border border-border bg-surface">
              <summary className="cursor-pointer px-4 py-3 text-sm font-semibold flex items-center gap-2">🤛 Left hand — Inherited blueprint</summary>
              <div className="px-4 pb-4"><ResultsView analysis={left.analysis} compact /></div>
            </details>
          )}
          {right.analysis && (
            <details open className="rounded-xl border border-border bg-surface">
              <summary className="cursor-pointer px-4 py-3 text-sm font-semibold flex items-center gap-2">🤜 Right hand — Current path</summary>
              <div className="px-4 pb-4"><ResultsView analysis={right.analysis} compact /></div>
            </details>
          )}
        </div>
      )}

      {/* Privacy notice */}
      <FadeIn delay={0.1}>
        <div className="mt-8 mb-2">
          <div className="rounded-xl border border-border bg-surface p-3">
            <p className="text-[11px] font-semibold text-text mb-1">🔒 Privacy</p>
            <p className="text-[10px] text-text-secondary leading-snug">
              Your palm photos stay private. We use them only to generate your reading and never share them.
            </p>
          </div>
        </div>
      </FadeIn>
    </MotionPage>
  );
}

/* -------------------------------------------------------------------------- */
/*  Combined-report panel — CTA that becomes the rendered report on success   */
/* -------------------------------------------------------------------------- */

function CombinedReportPanel({
  palmReadingId: _palmReadingId,
  report,
  loading,
  error,
  needsChart,
  onGenerate,
}: {
  palmReadingId: string;
  report: CombinedReport | null;
  loading: boolean;
  error: string;
  needsChart: boolean;
  onGenerate: () => void;
}) {
  if (report) return <CombinedReportView report={report} />;

  return (
    <Card className="my-4 border-accent/40 bg-gradient-to-br from-primary/8 to-accent/8">
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5 text-sm font-[family-name:var(--font-serif)]">
          <span>🪐</span> Unify with your birth chart
        </CardTitle>
        <CardDescription className="text-[11px]">
          Pandit-ji can reconcile what your hand shows with what the heavens recorded at your birth — one prediction, no contradictions.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {needsChart ? (
          <div className="rounded-md border border-warning/40 bg-warning/8 px-3 py-2 text-xs text-text-secondary">
            We need your birth details first. <a href="/kundli" className="text-primary underline">Add your Kundli</a>, then come back here.
          </div>
        ) : error ? (
          <div className="rounded-md border border-error/40 bg-error/8 px-3 py-2 text-xs text-error">{error}</div>
        ) : null}
        <div className="flex justify-center pt-1">
          <Button size="lg" onClick={onGenerate} isLoading={loading} disabled={loading || needsChart}>
            Generate combined report
          </Button>
        </div>
        <p className="text-[10px] text-text-secondary text-center">
          Reconciles palm + chart into one coherent prediction. Takes ~20-40 seconds.
        </p>
      </CardContent>
    </Card>
  );
}

function CombinedReportView({ report }: { report: CombinedReport }) {
  const sections: Array<{ title: string; icon: string; body: string }> = [
    { title: 'Unified Identity', icon: '🪔', body: report.unifiedIdentity },
    { title: 'Career & Dharma', icon: '🏛️', body: report.careerAndDharma },
    { title: 'Relationships', icon: '💞', body: report.relationships },
    { title: 'Health & Vitality', icon: '🌿', body: report.healthAndVitality },
    { title: 'Spiritual Path', icon: '🕉️', body: report.spiritualPath },
    { title: 'What Is Unfolding Now', icon: '⏳', body: report.timingNow },
  ].filter((s) => !!s.body);

  return (
    <Card className="my-4 border-primary/30 bg-gradient-to-br from-primary/6 to-accent/6">
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5 text-sm font-[family-name:var(--font-serif)]">
          <span>🪐</span> Combined Reading — Hand & Heavens Reconciled
        </CardTitle>
        <CardDescription className="text-[11px]">
          One prediction synthesised from your palm and your birth chart — no contradictions, only the deeper pattern.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {sections.map((s) => (
          <div key={s.title}>
            <p className="text-[10px] font-semibold tracking-wider uppercase text-primary/80 mb-1">
              <span className="mr-1">{s.icon}</span>{s.title}
            </p>
            <RichText className="text-xs leading-relaxed text-text-secondary">{s.body}</RichText>
          </div>
        ))}

        {report.remedies?.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold tracking-wider uppercase text-primary/80 mb-1">🪷 Reconciled Remedies</p>
            <ul className="space-y-1">
              {report.remedies.map((r, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-text-secondary">
                  <span className="text-accent mt-0.5">✦</span>
                  <RichText className="leading-relaxed flex-1">{r}</RichText>
                </li>
              ))}
            </ul>
          </div>
        )}

        {report.reconciliationNotes?.length > 0 && (
          <div className="rounded-lg border border-border bg-surface/60 p-3">
            <p className="text-[10px] font-semibold tracking-wider uppercase text-text-secondary mb-1.5">Where palm & chart agreed</p>
            <ul className="space-y-1.5">
              {report.reconciliationNotes.map((note, i) => (
                <li key={i} className="text-[11px] leading-relaxed text-text-secondary flex items-start gap-2">
                  <span className="text-primary mt-0.5">•</span>
                  <RichText className="flex-1">{note}</RichText>
                </li>
              ))}
            </ul>
          </div>
        )}

        {report.panditSynthesis && (
          <div className="border-t border-primary/20 pt-3 italic text-[12px] text-text-secondary">
            <RichText>{report.panditSynthesis}</RichText>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/*  Upload slot — handles file pick, MediaPipe validation, auto-crop preview  */
/* -------------------------------------------------------------------------- */

function UploadSlot({
  slot,
  onChange,
  label,
}: {
  slot: SlotState;
  onChange: (s: SlotState) => void;
  label: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [validating, setValidating] = useState(false);

  const processFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith('image/')) {
        onChange({ ...slot, validation: { ok: false, reason: 'bad-type', hint: 'Please upload an image file (JPG, PNG).' } });
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        onChange({ ...slot, validation: { ok: false, reason: 'too-big', hint: 'Image must be under 10 MB.' } });
        return;
      }

      const reader = new FileReader();
      reader.onload = async () => {
        const dataUrl = reader.result as string;
        onChange({ ...slot, dataUrl, fileName: file.name, validation: null, analysis: null, readingId: null });

        // Run MediaPipe validation + auto-crop (lazy-load).
        setValidating(true);
        try {
          const { validatePalmImage, cropToBbox, loadImage } = await import('@/lib/palm/handDetector');
          const img = await loadImage(dataUrl);
          const v = await validatePalmImage(img);
          if (v.ok && v.bbox) {
            const cropped = await cropToBbox(img, v.bbox);
            onChange({ ...slot, dataUrl: cropped, fileName: file.name, validation: { ok: true } });
          } else {
            onChange({ ...slot, dataUrl, fileName: file.name, validation: { ok: v.ok, reason: v.reason, hint: v.hint } });
          }
        } catch {
          // If detector fails to load, allow the upload anyway — we still preprocess server-side.
          onChange({ ...slot, dataUrl, fileName: file.name, validation: null });
        } finally {
          setValidating(false);
        }
      };
      reader.readAsDataURL(file);
    },
    [slot, onChange],
  );

  return (
    <div>
      <p className="text-[11px] font-semibold text-text-secondary mb-1.5">{label}</p>
      <motion.div
        onDrop={(e) => {
          e.preventDefault();
          setDragActive(false);
          const f = e.dataTransfer.files?.[0];
          if (f) processFile(f);
        }}
        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={(e) => { e.preventDefault(); setDragActive(false); }}
        onClick={() => fileRef.current?.click()}
        whileHover={{ scale: 1.005 }}
        whileTap={{ scale: 0.995 }}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-4 transition-colors ${
          dragActive ? 'border-primary bg-primary/5' : slot.validation?.ok === false ? 'border-warning/60' : 'border-border hover:border-primary/50 hover:bg-surface-hover'
        }`}
      >
        <AnimatePresence mode="wait">
          {slot.dataUrl ? (
            <motion.div key="preview" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-2">
              <img src={slot.dataUrl} alt={`${label} preview`} className="max-h-44 rounded-md object-contain shadow-md" />
              <p className="text-[10px] text-text-secondary truncate max-w-[200px]">{slot.fileName}</p>
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(emptySlot());
                  if (fileRef.current) fileRef.current.value = '';
                }}
              >
                Re-upload
              </Button>
            </motion.div>
          ) : (
            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center">
              <div className="mb-1 text-2xl">&#128247;</div>
              <p className="text-[11px] font-medium text-text">Drop or click to browse</p>
              <p className="mt-0.5 text-[10px] text-text-secondary">JPG, PNG up to 10 MB</p>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      <input ref={fileRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) processFile(f); }} />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) processFile(f); }} />

      {!slot.dataUrl && (
        <div className="flex gap-2 mt-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="flex-1"
            onClick={async () => {
              if (isNative()) {
                // Use Capacitor native camera — more reliable than HTML capture on Android
                const blob = await capturePhoto({ direction: 'REAR' });
                if (blob) {
                  const file = new File([blob], 'palm-capture.jpg', { type: 'image/jpeg' });
                  processFile(file);
                }
              } else {
                cameraRef.current?.click();
              }
            }}
          >
            📷 Camera
          </Button>
          <Button type="button" variant="outline" size="sm" className="flex-1" onClick={() => fileRef.current?.click()}>📁 File</Button>
        </div>
      )}

      {validating && (
        <p className="mt-1.5 text-[10px] text-text-secondary">Checking palm position…</p>
      )}

      {slot.validation && !slot.validation.ok && (
        <div className="mt-1.5 rounded-md border border-warning/40 bg-warning/10 px-2 py-1.5 text-[10px] text-warning">
          {slot.validation.hint}
        </div>
      )}

      {slot.validation?.ok && (
        <p className="mt-1.5 text-[10px] text-success">✓ Hand detected — auto-cropped for clarity</p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Progressive results renderer                                              */
/* -------------------------------------------------------------------------- */

function ProgressColumn({ label, slot }: { label: string; slot: SlotState }) {
  const steps = [
    { key: 'lines', label: 'Reading the major lines' },
    { key: 'mounts', label: 'Studying mounts & fingers' },
    { key: 'soul', label: 'Channeling soul-level wisdom' },
  ];
  return (
    <div>
      {label && <p className="text-[11px] font-semibold text-text mb-1.5">{label}</p>}
      <ul className="space-y-1">
        {steps.map((s) => {
          const done = slot.stagesDone.has(s.key);
          const active = slot.stage === s.key;
          return (
            <li key={s.key} className={`flex items-center gap-2 text-[11px] ${done ? 'text-success' : active ? 'text-primary' : 'text-text-secondary'}`}>
              <span className="w-3.5 inline-block">{done ? '✓' : active ? '•' : '○'}</span>
              <span>{s.label}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

type ReadMode = 'story' | 'full' | 'nerd';

function ResultsView({ analysis, compact = false }: { analysis: PalmAnalysis; compact?: boolean }) {
  const [readMode, setReadMode] = useState<ReadMode>('story');
  const [expandedLine, setExpandedLine] = useState<string | null>(null);

  const ml = (analysis.majorLines ?? {}) as Record<string, LineData>;
  const min = (analysis.minorLines ?? {}) as Record<string, LineData>;
  const mounts = (analysis.mounts ?? {}) as Record<string, { development?: string; interpretation?: string }>;
  const fingers = (analysis.fingerAnalysis ?? {}) as Record<string, { shape?: string; flexibility?: string; length?: string; interpretation?: string }>;

  const majorLines: LineReading[] = [
    ml.lifeLine?.interpretation && { name: 'Life Line', icon: '❤️', length: ml.lifeLine.length, depth: ml.lifeLine.depth, branches: ml.lifeLine.branches, curve: ml.lifeLine.curvature, interpretation: ml.lifeLine.interpretation },
    ml.heartLine?.interpretation && { name: 'Heart Line', icon: '💙', length: ml.heartLine.length, depth: ml.heartLine.depth, curve: ml.heartLine.curvature, interpretation: ml.heartLine.interpretation },
    ml.headLine?.interpretation && { name: 'Head Line', icon: '🧠', length: ml.headLine.length, depth: ml.headLine.depth, interpretation: ml.headLine.interpretation },
    ml.fateLine?.present !== false && ml.fateLine?.interpretation && { name: 'Fate Line', icon: '⭐', length: ml.fateLine.length, depth: ml.fateLine.depth, presence: ml.fateLine.present ? 'Present' : 'Absent', interpretation: ml.fateLine.interpretation },
  ].filter(Boolean) as LineReading[];

  const minorLines: LineReading[] = [
    min.marriageLines?.interpretation && { name: 'Marriage Lines', icon: '💍', count: min.marriageLines.count, interpretation: min.marriageLines.interpretation },
    min.childrenLines?.interpretation && { name: 'Children Lines', icon: '👶', count: min.childrenLines.count, interpretation: min.childrenLines.interpretation },
    min.sunLine?.interpretation && { name: 'Sun Line', icon: '☀️', presence: min.sunLine.present ? 'Present' : 'Absent', interpretation: min.sunLine.interpretation },
    min.healthLine?.interpretation && { name: 'Health Line', icon: '🌿', presence: min.healthLine.present ? 'Present' : 'Absent', interpretation: min.healthLine.interpretation },
    min.travelLines?.interpretation && { name: 'Travel Lines', icon: '✈️', count: min.travelLines.count, interpretation: min.travelLines.interpretation },
    min.marsLine?.interpretation && { name: 'Mars Line', icon: '🛡️', presence: min.marsLine.present ? 'Present' : 'Absent', interpretation: min.marsLine.interpretation },
  ].filter(Boolean) as LineReading[];

  /* ---- helpers ---- */

  /** First sentence only — for Story mode punchy previews */
  function firstSentence(text: string): string {
    const m = text.match(/^.{30,}?[.!?…]/);
    return m ? m[0] : text.slice(0, 120) + (text.length > 120 ? '…' : '');
  }

  const STORY_LINE_META: Array<{ key: string; line: LineReading; vibe: string }> = [
    majorLines[1] && { key: 'heart', line: majorLines[1], vibe: 'your emotional era' },
    majorLines[2] && { key: 'head',  line: majorLines[2], vibe: 'how your brain works' },
    majorLines[0] && { key: 'life',  line: majorLines[0], vibe: 'your energy & vitality' },
    majorLines[3] && { key: 'fate',  line: majorLines[3], vibe: 'your career destiny' },
  ].filter(Boolean) as Array<{ key: string; line: LineReading; vibe: string }>;

  /* ------------------------------------------------------------------ */
  /*  Mode toggle                                                         */
  /* ------------------------------------------------------------------ */

  function ModeToggle() {
    return (
      <div className="flex items-center justify-between mb-4">
        <p className="text-[10px] font-semibold tracking-[0.18em] text-text-secondary uppercase">Your Reading</p>
        <div className="inline-flex rounded-full border border-border bg-surface p-0.5 gap-0.5">
          {(['story', 'full', 'nerd'] as ReadMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setReadMode(m)}
              className={`px-3 py-1 text-[10px] font-semibold rounded-full transition-all ${
                readMode === m ? 'bg-primary text-white shadow-sm' : 'text-text-secondary hover:text-text'
              }`}
            >
              {m === 'story' ? String.fromCodePoint(10024) + ' Story' : m === 'full' ? String.fromCodePoint(128214) + ' Full' : String.fromCodePoint(128302) + ' Nerd'}
            </button>
          ))}
        </div>
      </div>
    );
  }

  /** Decorative + navigational chip strip — mirrors the capture-screen chips. */
  function InsightChipStrip() {
    if (compact) return null;
    const goTo = (anchor: string) => {
      setReadMode('nerd');
      setTimeout(() => {
        document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 120);
    };
    return (
      <div className="flex flex-wrap gap-1.5 mb-3">
        {INSIGHT_CHIPS.map((chip) => (
          <button
            key={chip.key}
            type="button"
            onClick={() => goTo(chip.anchor)}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-[11px] font-medium text-text hover:bg-surface-hover transition-colors"
          >
            <span>{chip.emoji}</span>
            <span>{chip.label}</span>
          </button>
        ))}
      </div>
    );
  }

  /** Line-card swatch — pulls colour from the shared palette. */
  function lineSwatch(name: string): string {
    const key = name.toLowerCase().replace(' line', '').replace('s lines', '').replace(' lines', '');
    const map: Record<string, keyof typeof LINE_STYLES> = {
      heart: 'heart', head: 'head', life: 'life', fate: 'fate',
      sun: 'sun', marriage: 'marriage', children: 'children',
    };
    const k = map[key];
    return k ? LINE_STYLES[k].color : 'var(--primary)';
  }

  /* ------------------------------------------------------------------ */
  /*  STORY MODE — Gen Z narrative, tap to expand                        */
  /* ------------------------------------------------------------------ */

  if (readMode === 'story' && !compact) {
    return (
      <StaggerList className="space-y-3">
        <StaggerItem><ModeToggle /></StaggerItem>
        <StaggerItem><InsightChipStrip /></StaggerItem>

        {/* Soul vibe card */}
        {(analysis.soulPurpose || analysis.overallPersonality) && (
          <StaggerItem>
            <div className="rounded-2xl p-4" style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.15), rgba(212, 175, 55,0.12))', border: '1px solid rgba(139,92,246,0.25)' }}>
              <p className="text-[10px] font-bold tracking-[0.18em] uppercase mb-2" style={{ color: 'var(--text)' }}>your vibe check ✨</p>
              <p className="text-[14px] font-semibold text-text leading-snug">
                {analysis.handShape?.type && <span className="text-primary">{analysis.handShape.type} hand.</span>}{' '}
                {analysis.soulPurpose
                  ? firstSentence(analysis.soulPurpose)
                  : analysis.overallPersonality
                    ? firstSentence(analysis.overallPersonality)
                    : null}
              </p>
            </div>
          </StaggerItem>
        )}

        {/* Line story cards — tap to expand */}
        {STORY_LINE_META.map(({ key, line, vibe }) => {
          const isOpen = expandedLine === key;
          return (
            <StaggerItem key={key}>
              <button
                type="button"
                onClick={() => setExpandedLine(isOpen ? null : key)}
                className="w-full text-left rounded-2xl border transition-all"
                style={{
                  background: isOpen ? 'rgba(0,0,0,0.04)' : 'rgba(0,0,0,0.02)',
                  border: isOpen ? '1px solid rgba(92,46,14,0.25)' : '1px solid var(--border)',
                }}
              >
                <div className="flex items-start gap-3 p-4">
                  <span className="text-xl mt-0.5">{line.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[13px] font-bold text-text">{line.name}</p>
                      <span className="text-[10px] text-text-secondary flex-shrink-0">{isOpen ? '▲' : '▼'} tap</span>
                    </div>
                    <p className="text-[10px] text-primary/80 font-medium mb-1">{vibe}</p>
                    <p className="text-[12px] text-text-secondary leading-relaxed">
                      {isOpen ? line.interpretation : firstSentence(line.interpretation)}
                    </p>
                  </div>
                </div>
              </button>
            </StaggerItem>
          );
        })}

        {/* Career + Relationship chips */}
        {(analysis.careerSuggestions?.length || analysis.relationshipOutlook) && (
          <StaggerItem>
            <div className="rounded-2xl border border-border bg-surface p-4 space-y-3">
              {analysis.careerSuggestions?.length ? (
                <div>
                  <p className="text-[10px] font-bold tracking-[0.15em] uppercase text-primary/80 mb-2">career paths that slap 💼</p>
                  <div className="flex flex-wrap gap-2">
                    {analysis.careerSuggestions.map((c, i) => (
                      <span key={i} className="text-[11px] font-medium px-2.5 py-1 rounded-full" style={{ background: 'rgba(139,92,246,0.12)', color: 'var(--text)', border: '1px solid rgba(139,92,246,0.2)' }}>
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
              {analysis.relationshipOutlook && (
                <div>
                  <p className="text-[10px] font-bold tracking-[0.15em] uppercase text-primary/80 mb-1">love life 💞</p>
                  <p className="text-[12px] text-text-secondary leading-relaxed">{firstSentence(analysis.relationshipOutlook)}</p>
                </div>
              )}
            </div>
          </StaggerItem>
        )}

        {/* Remedies — keep-it-real format */}
        {analysis.remedies?.length ? (
          <StaggerItem>
            <div className="rounded-2xl border border-border bg-surface p-4">
              <p className="text-[10px] font-bold tracking-[0.15em] uppercase text-primary/80 mb-2">what the universe wants you to do 🪷</p>
              <ul className="space-y-1.5">
                {analysis.remedies.map((r, i) => (
                  <li key={i} className="flex items-start gap-2 text-[12px] text-text-secondary">
                    <span className="text-accent mt-0.5 flex-shrink-0">✦</span>
                    <RichText className="leading-relaxed flex-1">{r}</RichText>
                  </li>
                ))}
              </ul>
            </div>
          </StaggerItem>
        ) : null}

        {/* Pandit blessing */}
        {analysis.panditMessage && (
          <StaggerItem>
            <div className="rounded-2xl border border-primary/25 p-4" style={{ background: 'rgba(212, 175, 55,0.06)' }}>
              <div className="flex items-start gap-3">
                <div className="text-2xl">🙏</div>
                <div>
                  <p className="text-[10px] font-bold tracking-[0.15em] uppercase text-primary mb-1.5">pandit-ji says</p>
                  <div className="text-[13px] leading-relaxed text-text-secondary italic">
                    <RichText>{analysis.panditMessage}</RichText>
                  </div>
                </div>
              </div>
            </div>
          </StaggerItem>
        )}
      </StaggerList>
    );
  }

  /* ------------------------------------------------------------------ */
  /*  FULL MODE — current card layout, all sections                       */
  /* ------------------------------------------------------------------ */

  const allLines = [...majorLines, ...minorLines];
  const summaryParts = [
    analysis.handShape?.description,
    analysis.overallPersonality,
    analysis.relationshipOutlook && `**Relationships:** ${analysis.relationshipOutlook}`,
    analysis.financialOutlook && `**Finances:** ${analysis.financialOutlook}`,
    analysis.vedicCorrelation && `**Vedic Correlation:** ${analysis.vedicCorrelation}`,
    analysis.careerSuggestions?.length && `**Career:** ${analysis.careerSuggestions.join(', ')}`,
    analysis.healthWarnings?.length && `**Health notes:** ${analysis.healthWarnings.join(', ')}`,
  ].filter(Boolean) as string[];

  if (readMode === 'full' || compact) {
    return (
      <StaggerList className={compact ? 'space-y-2.5' : 'space-y-4'}>
        {!compact && <StaggerItem><ModeToggle /></StaggerItem>}
        {!compact && <StaggerItem><InsightChipStrip /></StaggerItem>}
        {allLines.map((line) => (
          <StaggerItem key={line.name}>
            <motion.div {...cardHover}>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-1.5 text-sm font-[family-name:var(--font-serif)]">
                    <span>{line.icon}</span> {line.name}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {line.length && <Badge variant="outline">Length: {line.length}</Badge>}
                    {line.depth && <Badge variant="outline">Depth: {line.depth}</Badge>}
                    {line.branches && <Badge variant="outline">Branches: {line.branches}</Badge>}
                    {line.curve && <Badge variant="outline">Curve: {line.curve}</Badge>}
                    {line.presence && <Badge variant={line.presence === 'Present' ? 'success' : 'warning'}>{line.presence}</Badge>}
                    {line.count !== undefined && <Badge variant="accent">Count: {line.count}</Badge>}
                  </div>
                  <RichText className="text-xs leading-relaxed text-text-secondary">{line.interpretation}</RichText>
                </CardContent>
              </Card>
            </motion.div>
          </StaggerItem>
        ))}
        {analysis.soulPurpose && (
          <StaggerItem>
            <Card className="border-accent/30 bg-accent/5">
              <CardHeader><CardTitle className="flex items-center gap-1.5 text-sm font-[family-name:var(--font-serif)]"><span>🌟</span> Soul Purpose</CardTitle></CardHeader>
              <CardContent><RichText className="text-xs leading-relaxed text-text-secondary">{analysis.soulPurpose}</RichText></CardContent>
            </Card>
          </StaggerItem>
        )}
        {analysis.pastLifeImprints && (
          <StaggerItem>
            <Card className="border-primary/20">
              <CardHeader><CardTitle className="flex items-center gap-1.5 text-sm font-[family-name:var(--font-serif)]"><span>♾️</span> Past Life Imprints</CardTitle></CardHeader>
              <CardContent><RichText className="text-xs leading-relaxed text-text-secondary">{analysis.pastLifeImprints}</RichText></CardContent>
            </Card>
          </StaggerItem>
        )}
        {analysis.remedies?.length ? (
          <StaggerItem>
            <Card className="border-border">
              <CardHeader><CardTitle className="flex items-center gap-1.5 text-sm font-[family-name:var(--font-serif)]"><span>🪷</span> Vedic Remedies</CardTitle></CardHeader>
              <CardContent>
                <ul className="space-y-1.5">
                  {analysis.remedies.map((r, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-text-secondary">
                      <span className="text-accent mt-0.5">✦</span>
                      <RichText className="leading-relaxed flex-1">{r}</RichText>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </StaggerItem>
        ) : null}
        {summaryParts.length > 0 && (
          <StaggerItem>
            <Card className="border-primary/30">
              <CardHeader><CardTitle className="flex items-center gap-1.5 text-sm font-[family-name:var(--font-serif)]"><span>&#128302;</span> Overall Reading</CardTitle></CardHeader>
              <CardContent><StructuredReading text={summaryParts.join('\n\n')} /></CardContent>
            </Card>
          </StaggerItem>
        )}
        {analysis.panditMessage && (
          <StaggerItem>
            <div className="rounded-xl border border-primary/30 bg-primary/8 p-4">
              <div className="flex items-start gap-3">
                <div className="text-2xl">🙏</div>
                <div>
                  <p className="text-[11px] font-semibold text-primary mb-1.5">Pandit Hastamani Shastri says</p>
                  <div className="text-[12px] leading-relaxed text-text-secondary italic">
                    <RichText>{analysis.panditMessage}</RichText>
                  </div>
                </div>
              </div>
            </div>
          </StaggerItem>
        )}
      </StaggerList>
    );
  }

  /* ------------------------------------------------------------------ */
  /*  NERD MODE — everything, no filter                                   */
  /* ------------------------------------------------------------------ */

  const MOUNT_LABELS: Record<string, string> = {
    jupiter: 'Jupiter (Guru Parvat)', saturn: 'Saturn (Shani Parvat)',
    apollo: 'Apollo (Surya Parvat)', mercury: 'Mercury (Budha Parvat)',
    venus: 'Venus (Shukra Parvat)', luna: 'Luna (Chandra Parvat)',
    mars_positive: 'Mars+ (Mangal+)', mars_negative: 'Mars− (Mangal−)',
  };
  const FINGER_LABELS: Record<string, string> = { thumb: 'Thumb', index: 'Index', middle: 'Middle', ring: 'Ring', little: 'Little' };

  return (
    <StaggerList className="space-y-4">
      <StaggerItem><ModeToggle /></StaggerItem>
      <StaggerItem><InsightChipStrip /></StaggerItem>

      {/* Hand shape */}
      {analysis.handShape && (
        <StaggerItem>
          <Card>
            <CardHeader><CardTitle className="text-sm font-[family-name:var(--font-serif)]">Hand Shape</CardTitle></CardHeader>
            <CardContent className="space-y-1.5">
              <div className="flex gap-2">
                {analysis.handShape.type && <Badge variant="accent">{analysis.handShape.type}</Badge>}
                {analysis.handShape.vedic_element && <Badge variant="outline">{(analysis.handShape as Record<string, string>).vedic_element}</Badge>}
              </div>
              {analysis.handShape.description && <RichText className="text-xs leading-relaxed text-text-secondary">{analysis.handShape.description}</RichText>}
            </CardContent>
          </Card>
        </StaggerItem>
      )}

      {/* All major lines — full technical detail */}
      {allLines.map((line) => {
        const lname = line.name.toLowerCase();
        const anchorId = lname.includes('marriage')
          ? 'marriage-section'
          : lname.includes('children')
            ? 'children-section'
            : lname.includes('sun')
              ? 'sun-section'
              : lname.includes('health')
                ? 'health-section'
                : lname.includes('travel')
                  ? 'travel-section'
                  : lname.includes('mars')
                    ? 'mars-section'
                    : undefined;
        const color = lineSwatch(line.name);
        return (
          <StaggerItem key={line.name}>
            <Card id={anchorId} style={{ borderLeft: `3px solid ${color}` }}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm font-[family-name:var(--font-serif)]">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ background: color, boxShadow: `0 0 6px ${color}` }}
                    aria-hidden
                  />
                  <span>{line.icon}</span>
                  <span>{line.name}</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {line.length && <Badge variant="outline">length: {line.length}</Badge>}
                  {line.depth && <Badge variant="outline">depth: {line.depth}</Badge>}
                  {line.strength && <Badge variant="outline">strength: {line.strength}</Badge>}
                  {line.branches && <Badge variant="outline">branches: {line.branches}</Badge>}
                  {line.curve && <Badge variant="outline">curve: {line.curve}</Badge>}
                  {line.presence && <Badge variant={line.presence === 'Present' ? 'success' : 'warning'}>{line.presence}</Badge>}
                  {line.count !== undefined && <Badge variant="accent">count: {line.count}</Badge>}
                  {line.clarity && <Badge variant="outline">clarity: {line.clarity}</Badge>}
                </div>
                <RichText className="text-xs leading-relaxed text-text-secondary">{line.interpretation}</RichText>
              </CardContent>
            </Card>
          </StaggerItem>
        );
      })}

      {/* Mounts */}
      {Object.keys(mounts).length > 0 && (
        <StaggerItem>
          <Card>
            <CardHeader><CardTitle className="text-sm font-[family-name:var(--font-serif)]">Mounts (Parvat)</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-3">
                {Object.entries(mounts).map(([key, m]) => m?.interpretation ? (
                  <div key={key} className="border-b border-border pb-2 last:border-0 last:pb-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-[12px] font-semibold text-text">{MOUNT_LABELS[key] ?? key}</p>
                      {m.development && <Badge variant="outline">{m.development}</Badge>}
                    </div>
                    <p className="text-[11px] leading-relaxed text-text-secondary">{m.interpretation}</p>
                  </div>
                ) : null)}
              </div>
            </CardContent>
          </Card>
        </StaggerItem>
      )}

      {/* Finger analysis */}
      {Object.keys(fingers).length > 0 && (
        <StaggerItem>
          <Card>
            <CardHeader><CardTitle className="text-sm font-[family-name:var(--font-serif)]">Finger Analysis</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {Object.entries(fingers).map(([key, f]) => f?.interpretation ? (
                  <div key={key} className="flex gap-3 items-start">
                    <p className="text-[11px] font-semibold text-primary w-14 flex-shrink-0">{FINGER_LABELS[key] ?? key}</p>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap gap-1 mb-0.5">
                        {f.shape && <Badge variant="outline">{f.shape}</Badge>}
                        {f.length && <Badge variant="outline">{f.length}</Badge>}
                        {f.flexibility && <Badge variant="outline">{f.flexibility}</Badge>}
                      </div>
                      <p className="text-[11px] leading-relaxed text-text-secondary">{f.interpretation}</p>
                    </div>
                  </div>
                ) : null)}
              </div>
            </CardContent>
          </Card>
        </StaggerItem>
      )}

      {/* Special markings */}
      {Array.isArray(analysis.specialMarkings) && analysis.specialMarkings.length > 0 && (
        <StaggerItem>
          <Card>
            <CardHeader><CardTitle className="text-sm font-[family-name:var(--font-serif)]">Special Markings</CardTitle></CardHeader>
            <CardContent>
              <ul className="space-y-1">
                {analysis.specialMarkings.map((s, i) => (
                  <li key={i} className="text-xs text-text-secondary flex items-start gap-2">
                    <span className="text-accent mt-0.5 flex-shrink-0">◆</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </StaggerItem>
      )}

      {/* Soul + past life */}
      {analysis.soulPurpose && (
        <StaggerItem>
          <Card className="border-accent/30 bg-accent/5">
            <CardHeader><CardTitle className="text-sm font-[family-name:var(--font-serif)]">🌟 Soul Purpose</CardTitle></CardHeader>
            <CardContent><RichText className="text-xs leading-relaxed text-text-secondary">{analysis.soulPurpose}</RichText></CardContent>
          </Card>
        </StaggerItem>
      )}
      {analysis.pastLifeImprints && (
        <StaggerItem>
          <Card className="border-primary/20">
            <CardHeader><CardTitle className="text-sm font-[family-name:var(--font-serif)]">♾️ Past Life Imprints</CardTitle></CardHeader>
            <CardContent><RichText className="text-xs leading-relaxed text-text-secondary">{analysis.pastLifeImprints}</RichText></CardContent>
          </Card>
        </StaggerItem>
      )}

      {/* Full summary — all fields */}
      {(analysis.overallPersonality || analysis.relationshipOutlook || analysis.financialOutlook || analysis.vedicCorrelation) && (
        <StaggerItem>
          <Card className="border-primary/30">
            <CardHeader><CardTitle className="text-sm font-[family-name:var(--font-serif)]">📊 Full Analysis</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {analysis.overallPersonality && (
                <div><p className="text-[10px] font-bold uppercase tracking-wider text-primary/80 mb-0.5">Personality</p><RichText className="text-xs text-text-secondary">{analysis.overallPersonality}</RichText></div>
              )}
              {analysis.relationshipOutlook && (
                <div><p className="text-[10px] font-bold uppercase tracking-wider text-primary/80 mb-0.5">Relationships</p><RichText className="text-xs text-text-secondary">{analysis.relationshipOutlook}</RichText></div>
              )}
              {analysis.financialOutlook && (
                <div id="money-section"><p className="text-[10px] font-bold uppercase tracking-wider text-primary/80 mb-0.5">Finances</p><RichText className="text-xs text-text-secondary">{analysis.financialOutlook}</RichText></div>
              )}
              {analysis.vedicCorrelation && (
                <div><p className="text-[10px] font-bold uppercase tracking-wider text-primary/80 mb-0.5">Vedic Correlation</p><RichText className="text-xs text-text-secondary">{analysis.vedicCorrelation}</RichText></div>
              )}
              {analysis.careerSuggestions?.length ? (
                <div id="career-section">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-primary/80 mb-1">Career Paths</p>
                  <ul className="space-y-0.5">{analysis.careerSuggestions.map((c, i) => <li key={i} className="text-xs text-text-secondary flex gap-2"><span className="text-accent">→</span>{c}</li>)}</ul>
                </div>
              ) : null}
              {analysis.healthWarnings?.length ? (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-primary/80 mb-1">Health Warnings</p>
                  <ul className="space-y-0.5">{analysis.healthWarnings.map((h, i) => <li key={i} className="text-xs text-text-secondary flex gap-2"><span className="text-warning">⚠</span>{h}</li>)}</ul>
                </div>
              ) : null}
              {analysis.luckyPeriods?.length ? (
                <div id="lucky-periods-section">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-primary/80 mb-1">Lucky Periods</p>
                  <ul className="space-y-0.5">{(analysis.luckyPeriods as string[]).map((p, i) => <li key={i} className="text-xs text-text-secondary flex gap-2"><span className="text-success">✦</span>{p}</li>)}</ul>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </StaggerItem>
      )}

      {/* Remedies */}
      {analysis.remedies?.length ? (
        <StaggerItem>
          <Card className="border-border">
            <CardHeader><CardTitle className="text-sm font-[family-name:var(--font-serif)]">🪷 Vedic Remedies</CardTitle></CardHeader>
            <CardContent>
              <ul className="space-y-1.5">
                {analysis.remedies.map((r, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-text-secondary">
                    <span className="text-accent mt-0.5">✦</span>
                    <RichText className="leading-relaxed flex-1">{r}</RichText>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </StaggerItem>
      ) : null}

      {/* Pandit message */}
      {analysis.panditMessage && (
        <StaggerItem>
          <div className="rounded-xl border border-primary/30 bg-primary/8 p-4">
            <div className="flex items-start gap-3">
              <div className="text-2xl">🙏</div>
              <div>
                <p className="text-[11px] font-semibold text-primary mb-1.5">Pandit Hastamani Shastri says</p>
                <div className="text-[12px] leading-relaxed text-text-secondary italic">
                  <RichText>{analysis.panditMessage}</RichText>
                </div>
              </div>
            </div>
          </div>
        </StaggerItem>
      )}
    </StaggerList>
  );
}

function KarmicShiftCard({ karmic }: { karmic: KarmicShift }) {
  return (
    <Card className="border-accent/40 bg-gradient-to-br from-accent/8 to-primary/8">
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-sm font-[family-name:var(--font-serif)]">
          <span className="flex items-center gap-1.5"><span>♾️</span> Karmic Shift — Soul's Free Will</span>
          <Badge variant="accent">{karmic.alignmentScore}/100 alignment</Badge>
        </CardTitle>
        <CardDescription className="text-[11px]">The difference between your inherited blueprint and the path you walk now</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {karmic.karmicShift && <RichText className="text-xs leading-relaxed text-text">{karmic.karmicShift}</RichText>}
        {karmic.freeWillExpression && (
          <div>
            <p className="text-[10px] font-semibold text-primary uppercase tracking-wider mb-1">Free will</p>
            <RichText className="text-xs leading-relaxed text-text-secondary">{karmic.freeWillExpression}</RichText>
          </div>
        )}
        {karmic.growthAreas?.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-primary uppercase tracking-wider mb-1">Growth areas</p>
            <ul className="space-y-1">
              {karmic.growthAreas.map((g, i) => (
                <li key={i} className="text-xs text-text-secondary flex items-start gap-2">
                  <span className="text-accent mt-0.5">✦</span><RichText className="flex-1">{g}</RichText>
                </li>
              ))}
            </ul>
          </div>
        )}
        {karmic.panditMessage && (
          <div className="border-t border-accent/20 pt-3 italic text-[12px] text-text-secondary">
            <RichText>{karmic.panditMessage}</RichText>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/*  SSE client — talks to /api/palm/analyze/stream                             */
/* -------------------------------------------------------------------------- */

/** Load a data URL into an HTMLImageElement and return MediaPipe-derived polylines. */
async function detectPolylines(dataUrl: string, hand: Hand): Promise<PalmPolylines | null> {
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = (e) => reject(e);
      el.src = dataUrl;
    });
    return await traceLines(img, hand);
  } catch (err) {
    console.warn('[palm/page] hand-landmark detection failed:', err);
    return null;
  }
}

async function streamAnalysis(
  imageBase64: string,
  hand: Hand,
  clientPolylines: PalmPolylines | null,
  patch: (p: Partial<SlotState>) => void,
): Promise<{ readingId: string; analysis: PalmAnalysis }> {
  const res = await fetch('/api/palm/analyze/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64, hand, clientPolylines }),
  });

  if (!res.ok || !res.body) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(errText || 'Stream failed');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const merged: PalmAnalysis = {};
  const stagesDone = new Set<string>();
  let readingId: string | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let idx;
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const event = parseSseFrame(frame);
      if (!event) continue;

      if (event.event === 'cached') {
        Object.assign(merged, event.data.analysis ?? {});
        readingId = event.data.readingId ?? null;
        ['lines', 'mounts', 'soul'].forEach((s) => stagesDone.add(s));
        patch({ analysis: { ...merged }, stagesDone: new Set(stagesDone), stage: 'done', readingId });
      } else if (event.event === 'progress') {
        if (event.data.step === 'preprocessing') patch({ stage: 'preprocessing' });
      } else if (event.event === 'stage') {
        Object.assign(merged, event.data.data ?? {});
        stagesDone.add(event.data.stage);
        const next = (['lines', 'mounts', 'soul'] as const).find((s) => !stagesDone.has(s)) ?? 'soul';
        patch({ analysis: { ...merged }, stagesDone: new Set(stagesDone), stage: next });
      } else if (event.event === 'done') {
        readingId = event.data.readingId ?? null;
        patch({ analysis: { ...merged }, stagesDone: new Set(stagesDone), stage: 'done', readingId });
      } else if (event.event === 'error') {
        throw new Error(event.data.message ?? 'Analysis failed');
      }
    }
  }

  if (!readingId) throw new Error('Analysis did not return a reading id');
  return { readingId, analysis: merged };
}

function parseSseFrame(frame: string): { event: string; data: any } | null {
  const lines = frame.split('\n');
  let event = 'message';
  const dataLines: string[] = [];
  for (const line of lines) {
    if (line.startsWith('event: ')) event = line.slice(7).trim();
    else if (line.startsWith('data: ')) dataLines.push(line.slice(6));
  }
  if (dataLines.length === 0) return null;
  try {
    return { event, data: JSON.parse(dataLines.join('\n')) };
  } catch {
    return null;
  }
}
