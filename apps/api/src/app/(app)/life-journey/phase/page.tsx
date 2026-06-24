'use client';

import React, { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Skeleton, SkeletonText } from '@/components/ui/skeleton';
import { Planet3DInline } from '@/components/3d/Planet3DInline';
import { useTokenToast } from '@/components/ui/TokenToast';

interface JourneyEvent {
  id: string;
  short: string;
  story: string;
  feedback: 'agree' | 'maybe' | 'disagree' | null;
}

interface PhaseData {
  planet: string;
  title: string;
  tense: 'past' | 'present' | 'future';
  events: JourneyEvent[];
  startYear: number;
  endYear: number;
  startAge: number;
  endAge: number;
  name: string;
  phaseIndex: number;
  totalPhases: number;
}

interface PhaseMeta {
  planet: string;
  title: string;
  startYear: number;
  endYear: number;
}

interface PhaseResponse {
  status: 'ready' | 'generating';
  data?: PhaseData;
  meta?: PhaseMeta | null;
}

function parsePoints(story: string): string[] {
  try {
    const parsed = JSON.parse(story) as unknown;
    if (Array.isArray(parsed)) return (parsed as unknown[]).map(s => String(s));
  } catch { /* legacy paragraph */ }
  return [story];
}

const PLANET_COLOR: Record<string, string> = {
  Ketu: '#9B6B9E', Venus: '#E8A87C', Sun: '#F4B942', Moon: '#8BC4E8',
  Mars: '#E8735A', Rahu: '#7BA3B8', Jupiter: '#C4A84F', Saturn: '#8BA89B', Mercury: '#6BBF9E',
};

function PhaseSkeleton() {
  return (
    <div className="min-h-screen px-5 pt-16 pb-8">
      <Skeleton height={20} width="40%" style={{ marginBottom: 12 }} />
      <Skeleton height={32} width="80%" style={{ marginBottom: 6 }} />
      <Skeleton height={32} width="60%" style={{ marginBottom: 24 }} />
      <Skeleton height={14} width="30%" style={{ marginBottom: 16 }} />
      <SkeletonText lines={5} className="mb-8" />
      <div className="flex gap-3">
        <Skeleton height={44} style={{ flex: 1, borderRadius: 99 }} />
        <Skeleton height={44} style={{ flex: 1, borderRadius: 99 }} />
        <Skeleton height={44} style={{ flex: 1, borderRadius: 99 }} />
      </div>
    </div>
  );
}

function GeneratingScreen({ meta }: { meta?: PhaseMeta | null }) {
  const accentColor = meta?.planet ? (PLANET_COLOR[meta.planet] ?? '#7C3AED') : '#7C3AED';
  const planet = meta?.planet ?? 'Jupiter';
  return (
    <div className="min-h-[calc(100dvh-164px)] md:min-h-[calc(100dvh-64px)] flex flex-col items-center justify-center px-6 text-center">
      {/* Live rotating 3D planet — the dasha lord for this phase */}
      <div className="mb-8">
        <Planet3DInline planet={planet} size={140} />
      </div>

      {meta && (
        <p className="text-[12px] font-bold tracking-widest uppercase mb-2" style={{ color: accentColor }}>
          {meta.planet} Dasha · {meta.startYear}–{String(meta.endYear).slice(-2)}
        </p>
      )}

      <h2 className="text-[20px] font-bold text-text mb-2">
        {meta?.title ?? 'Your Journey'}
      </h2>

      <p className="text-[14px] text-text-secondary mb-1">
        Reading the stars for this phase…
      </p>
      <p className="text-[12px]" style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>
        Usually ready in under a minute
      </p>

      {/* Animated dots */}
      <div className="flex gap-1.5 mt-6">
        {[0, 1, 2].map(i => (
          <motion.div
            key={i}
            animate={{ opacity: [0.25, 1, 0.25] }}
            transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: accentColor }}
          />
        ))}
      </div>
    </div>
  );
}

function EventIcon({ feedback, isNew, accentColor, index }: {
  feedback: JourneyEvent['feedback'];
  isNew: boolean;
  accentColor: string;
  index: number;
}) {
  if (isNew) {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
        <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6L12 2z" fill="#7C3AED" />
      </svg>
    );
  }
  if (feedback === 'agree') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
        <circle cx="12" cy="12" r="9" fill="#dcfce7" stroke="#22c55e" strokeWidth="1.5" />
        <polyline points="8 12 11 15 16 9" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (feedback === 'maybe') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
        <circle cx="12" cy="12" r="9" fill="#fef9c3" stroke="#eab308" strokeWidth="1.5" />
        <path d="M9.5 10.5c.3-1.4 3.2-1.8 3.5 0 .2 1.4-1.8 1.9-1.8 3.5" stroke="#eab308" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="11.2" cy="17" r="0.9" fill="#eab308" />
      </svg>
    );
  }
  return (
    <div
      style={{
        flexShrink: 0,
        marginTop: 1,
        width: 20,
        height: 20,
        borderRadius: '50%',
        background: accentColor + '22',
        border: `1.5px solid ${accentColor}99`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 10,
        fontWeight: 700,
        color: accentColor,
        lineHeight: 1,
      }}
    >
      {index + 1}
    </div>
  );
}

function EventRow({
  event,
  expanded,
  busy,
  isNew,
  accentColor,
  index,
  onToggle,
  onFeedback,
}: {
  event: JourneyEvent;
  expanded: boolean;
  busy: boolean;
  isNew: boolean;
  accentColor: string;
  index: number;
  onToggle: () => void;
  onFeedback: (kind: 'agree' | 'maybe' | 'disagree') => void;
}) {
  const fb = event.feedback;
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.3 }}
      className="rounded-2xl"
      style={{
        background: expanded ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.03)',
        border: expanded ? `1px solid ${accentColor}44` : '1px solid rgba(255,255,255,0.08)',
      }}
    >
      <button
        onClick={onToggle}
        disabled={busy}
        className="w-full flex items-start gap-3 px-3 py-3 border-none bg-transparent cursor-pointer text-left"
        style={{ WebkitTapHighlightColor: 'transparent' }}
      >
        <EventIcon feedback={fb} isNew={isNew} accentColor={accentColor} index={index} />
        <p className="flex-1 text-[14px] text-text leading-relaxed">{event.short}</p>
        {isNew && !expanded && (
          <span
            className="text-[9px] font-bold px-1.5 py-0.5 rounded-full self-center flex-shrink-0"
            style={{ background: 'rgba(124,58,237,0.12)', color: '#7C3AED', border: '1px solid rgba(124,58,237,0.25)' }}
          >
            NEW
          </span>
        )}
        {!expanded && !isNew && (
          <span
            className="text-[10px] self-center flex-shrink-0 font-medium"
            style={{ color: accentColor + 'AA' }}
          >
            tap
          </span>
        )}
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke={accentColor} strokeOpacity="0.7" strokeWidth="2" strokeLinecap="round"
          style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', flexShrink: 0, marginTop: 4 }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="story"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 pt-1">
              {busy ? (
                <p className="text-[13px] leading-relaxed mb-3" style={{ color: 'var(--text-secondary)' }}>
                  ✨ Getting fresh insights…
                </p>
              ) : (
                <ul className="space-y-2 mb-3 list-none p-0 m-0">
                  {parsePoints(event.story).map((pt, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="flex-shrink-0 mt-[3px] text-[10px]" style={{ color: '#F59E0B' }}>◆</span>
                      <span className="text-[13px] leading-snug flex-1" style={{ color: 'var(--text)' }}>{pt}</span>
                    </li>
                  ))}
                </ul>
              )}

              {/* Per-event feedback buttons */}
              <div className="flex items-center gap-2">
                <FbButton
                  icon={
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  }
                  label="Agree"
                  active={fb === 'agree'}
                  disabled={busy}
                  color="#22c55e"
                  onClick={() => onFeedback('agree')}
                />
                <FbButton
                  icon={
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <path d="M12 8v4M12 16h.01" />
                      <circle cx="12" cy="12" r="9" />
                    </svg>
                  }
                  label="Maybe"
                  active={fb === 'maybe'}
                  disabled={busy}
                  color="#eab308"
                  onClick={() => onFeedback('maybe')}
                />
                <FbButton
                  icon={
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  }
                  label="Disagree"
                  active={fb === 'disagree'}
                  disabled={busy}
                  color="#f87171"
                  onClick={() => onFeedback('disagree')}
                />

              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function FbButton({
  icon, label, active, disabled, color, onClick,
}: {
  icon?: React.ReactNode; label: string; active: boolean; disabled: boolean; color: string; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1 text-[12px] font-semibold px-3 py-1.5 rounded-full border-none cursor-pointer transition-all"
      style={{
        background: active ? color + '33' : color + '14',
        color,
        border: `1px solid ${active ? color + '66' : color + '2A'}`,
        opacity: disabled ? 0.5 : 1,
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {icon}
      {label}
    </button>
  );
}

function PhaseDetailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const chartId = searchParams.get('chart') ?? '';
  const phaseIndex = parseInt(searchParams.get('index') ?? '0', 10);

  const { showSuccess } = useTokenToast();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [newEventIds, setNewEventIds] = useState<Set<string>>(new Set());

  const handleToggle = (eventId: string) => {
    const isOpening = expandedId !== eventId;
    if (isOpening) {
      setNewEventIds(prev => { const s = new Set(prev); s.delete(eventId); return s; });
    }
    setExpandedId(isOpening ? eventId : null);
  };

  const queryKey = ['life-journey-phase', chartId, phaseIndex] as const;

  const { data: response, isLoading: loading, error: queryError } = useQuery<PhaseResponse>({
    queryKey,
    queryFn: async () => {
      const r = await fetch('/api/life-journey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chartId, phaseIndex }),
      });
      const res = await r.json();
      if (!res.success) throw new Error(res.error ?? 'Failed to load phase');
      return { status: res.status as 'ready' | 'generating', data: res.data as PhaseData | undefined, meta: res.meta as PhaseMeta | null | undefined };
    },
    enabled: !!chartId,
    // Keep polling while generating; stop once ready
    refetchInterval: (query) => query.state.data?.status === 'generating' ? 3000 : false,
    // Don't serve stale 'generating' responses from cache
    staleTime: (query) => query.state.data?.status === 'generating' ? 0 : Infinity,
    gcTime: Infinity,
  });
  const data = response?.data;
  const error = queryError instanceof Error ? queryError.message : queryError ? 'Failed to load' : '';

  const goToPhase = (idx: number) => {
    setExpandedId(null);
    router.push(`/life-journey/phase?chart=${chartId}&index=${idx}`);
  };

  async function handleFeedback(eventId: string, kind: 'agree' | 'maybe' | 'disagree') {
    if (!data || busyId) return;
    setBusyId(eventId);
    try {
      const res = await fetch('/api/life-journey/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, feedback: kind }),
      });
      const body = await res.json();
      if (!body.success || !body.data) throw new Error(body.error ?? 'Failed');

      // For agree / maybe / disagree the API now returns the same row with
      // its updated feedback. Disagree no longer regenerates inline — the
      // nightly cron does that, so we only flip local feedback state and
      // tell the user to come back tomorrow.
      queryClient.setQueryData<PhaseData>(queryKey, (prev) => {
        if (!prev) return prev;
        return { ...prev, events: prev.events.map(e => e.id === eventId ? { ...e, feedback: kind } : e) };
      });
      if (kind === 'disagree') {
        showSuccess('Thanks for the feedback', "We'll make this more accurate by tomorrow. Come back to see your fresh reading.");
      }
    } catch (e) {
      console.error('[phase feedback]', e);
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <PhaseSkeleton />;

  if (response?.status === 'generating') return <GeneratingScreen meta={response.meta} />;

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-error text-sm mb-3">{error || 'Phase not found'}</p>
          <button onClick={() => router.back()} className="text-primary text-sm border-none bg-transparent cursor-pointer">
            ← Go back
          </button>
        </div>
      </div>
    );
  }

  const accentColor = PLANET_COLOR[data.planet] ?? 'var(--primary)';
  const hasNext = data.phaseIndex + 1 < data.totalPhases;
  const hasPrev = data.phaseIndex > 0;

  return (
    <div className="min-h-screen">
      <div
        className="sticky top-0 z-10 px-5 py-3 flex items-center"
        style={{ background: 'rgba(245,239,224,0.95)', backdropFilter: 'blur(20px)', borderBottom: '1px solid var(--border)' }}
      >
        <button
          onClick={() => router.push(`/life-journey${chartId ? `?chart=${chartId}` : ''}`)}
          className="flex items-center gap-1.5 text-text-secondary text-[13px] bg-transparent border-none cursor-pointer"
          style={{ WebkitTapHighlightColor: 'transparent' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
          Go back
        </button>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={phaseIndex}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          className="px-5 pt-5 pb-8"
        >
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <span
              className="text-[12px] font-bold px-2.5 py-1 rounded-lg"
              style={{ background: 'rgba(0,0,0,0.10)', color: 'var(--text-secondary)', border: '1px solid rgba(0,0,0,0.12)' }}
            >
              {data.startYear}–{String(data.endYear).slice(-2)}
            </span>
            <span className="text-[13px] text-text font-semibold">
              {data.startAge}–{data.endAge} yrs old
            </span>
            <span className="text-[13px] text-text-secondary">
              {data.name}{' '}
              {data.tense === 'future' ? 'will likely feel' : data.tense === 'present' ? 'is experiencing' : 'likely felt'}
            </span>
          </div>

          <div className="flex gap-3 mb-6">
            <div
              className="flex-shrink-0 w-1 rounded-full"
              style={{ background: `linear-gradient(to bottom, ${accentColor}, transparent)`, minHeight: 64 }}
            />
            <h1 className="text-[26px] font-extrabold text-text leading-tight">
              {data.title}
            </h1>
          </div>

          <p className="text-[13px] font-semibold text-text-secondary mb-1 tracking-wide">
            {data.tense === 'future' ? "What's Ahead" : data.tense === 'present' ? 'Unfolding Now' : 'Likely Events'}
          </p>
          <p className="text-[11px] mb-4" style={{ color: 'var(--text-secondary)' }}>
            Tap to expand · Agree / Maybe save it · Disagree refreshes by tomorrow
          </p>

          <div className="space-y-2 mb-8">
            <AnimatePresence initial={false}>
              {data.events.map((event, idx) => (
                <EventRow
                  key={event.id}
                  event={event}
                  expanded={expandedId === event.id}
                  busy={busyId === event.id}
                  isNew={newEventIds.has(event.id)}
                  accentColor={accentColor}
                  index={idx}
                  onToggle={() => handleToggle(event.id)}
                  onFeedback={(kind) => handleFeedback(event.id, kind)}
                />
              ))}
            </AnimatePresence>
          </div>

          {hasNext && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.3 }}
              className="mt-4"
            >
              <div className="flex items-center gap-1.5 text-text-secondary text-[12px] mb-2">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M12 19V5M5 12l7-7 7 7" />
                </svg>
                Next Up:
              </div>
              <button
                type="button"
                onClick={() => goToPhase(data.phaseIndex + 1)}
                className="w-full flex items-center justify-between rounded-2xl px-4 py-3 border-none cursor-pointer active:scale-[0.98] transition-transform"
                style={{
                  background: 'rgba(0,0,0,0.04)',
                  border: '1px solid rgba(0,0,0,0.10)',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                <div className="flex items-center gap-3">
                  <span
                    className="text-[11px] font-bold px-2 py-0.5 rounded-md"
                    style={{ background: 'rgba(0,0,0,0.10)', color: 'var(--text-secondary)' }}
                  >
                    Phase {data.phaseIndex + 2}/{data.totalPhases}
                  </span>
                  <span className="text-[13px] text-text-secondary">
                    During {data.endAge + 1}+ yrs old
                  </span>
                </div>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(0,0,0,0.40)" strokeWidth="2" strokeLinecap="round">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </button>
            </motion.div>
          )}

          {hasPrev && (
            <button
              type="button"
              onClick={() => goToPhase(data.phaseIndex - 1)}
              className="w-full mt-2 flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 border-none cursor-pointer active:scale-[0.98] transition-transform"
              style={{ background: 'transparent', color: 'var(--text-secondary)', WebkitTapHighlightColor: 'transparent' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M15 18l-6-6 6-6" />
              </svg>
              <span className="text-[12px]">Previous phase</span>
            </button>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

export default function PhaseDetailPage() {
  return (
    <Suspense fallback={<PhaseSkeleton />}>
      <PhaseDetailContent />
    </Suspense>
  );
}
