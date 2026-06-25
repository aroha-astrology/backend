'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { PalmInfographic } from '@/components/palm/PalmInfographic';

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

interface ScoreEntry { score: number; reasoning: string }

interface PalmReading {
  id: string;
  hand: 'left' | 'right';
  imageUrl: string | null;
  novaCanvasImageUrl: string | null;
  createdAt: string;
  analysis: PalmAnalysis | null;
}

interface ImageQuality {
  score?: number;
  rating?: 'excellent' | 'good' | 'fair' | 'poor' | string;
  lineVisibility?: number;
  lighting?: number;
  focus?: number;
  framing?: number;
  notes?: string;
}

interface PalmAnalysis {
  imageQuality?: ImageQuality | string;
  handType?: { element?: string; palmShape?: string; personalityProfile?: string; temperament?: string; nature?: string };
  handShape?: { type?: string; vedic_element?: string; description?: string };
  thumbAnalysis?: { willpower?: string; leadership?: string; emotionalControl?: string; interpretation?: string; willPhalanx?: string; logicPhalanx?: string; flexibility?: string };
  fingerAnalysis?: Record<string, { length?: string; bent?: string; interpretation?: string } | string> & { fingerGaps?: string; fingerDominance?: string; overallInterpretation?: string };
  mounts?: Record<string, { development?: string; interpretation?: string }>;
  majorLines?: Record<string, {
    present?: boolean; length?: string; depth?: string; curvature?: string;
    breaks?: number; islands?: number; chains?: boolean; forks?: string;
    branches?: string; timingPredictions?: string; interpretation?: string;
    strength?: string; startPoint?: string; direction?: string; slope?: string;
    endingPosition?: string; doublings?: string;
  }>;
  minorLines?: Record<string, { count?: number; present?: boolean; interpretation?: string; timingPredictions?: string; dominant?: string; islands?: boolean; forks?: boolean }>;
  careerAndMoney?: { bestFields?: string[]; businessVsJob?: string; financialStability?: string; wealthGrowthPeriods?: string[]; foreignOpportunities?: string; successTiming?: string; overallOutlook?: string };
  loveAndMarriage?: { emotionalNature?: string; loveLine?: string; marriageTiming?: string; relationshipStability?: string; heartbreakRisk?: string; compatibilityNature?: string; overallOutlook?: string };
  healthAnalysis?: { stressIndicators?: string; energyLevels?: string; emotionalHealth?: string; possibleConcerns?: string[]; constitution?: string; recommendations?: string };
  spiritualityAndKarma?: { spiritualInclination?: string; intuitionPower?: string; karmaIndicators?: string; religiousTendencies?: string; pastLifeImprints?: string; soulPurpose?: string; mysticCross?: boolean };
  ageWisePredictions?: { childhood?: string; age18to25?: string; age26to35?: string; age36to50?: string; age50plus?: string };
  specialSymbols?: Record<string, { present?: boolean; location?: string; interpretation?: string } | string[]>;
  luckyDestinyScore?: Record<string, ScoreEntry>;
  finalSummary?: { strongestStrength?: string; biggestChallenge?: string; hiddenTalent?: string; importantFuturePeriod?: string; overallDestiny?: string };
  specialMarkings?: string[];
  overallPersonality?: string;
  careerSuggestions?: string[];
  healthWarnings?: string[];
  relationshipOutlook?: string;
  financialOutlook?: string;
  luckyPeriods?: string[];
  remedies?: string[];
  vedicCorrelation?: string;
  panditMessage?: string;
  summary?: string[];
  reportDepth?: string;
  language?: string;
  // legacy polyline fields used by PalmInfographic
  [key: string]: unknown;
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

const SECTION_IDS = {
  overview: 'overview', thumb: 'thumb', fingers: 'fingers', mounts: 'mounts',
  majorLines: 'majorLines', minorLines: 'minorLines', career: 'career',
  love: 'love', health: 'health', spiritual: 'spiritual', ageWise: 'ageWise',
  symbols: 'symbols', scores: 'scores', summary: 'summary',
};

const SCORE_ICONS: Record<string, string> = {
  career: '💼', wealth: '💰', marriage: '💍', health: '🌿', fame: '⭐', spiritualGrowth: '🕉️',
};

const MOUNT_LABELS: Record<string, string> = {
  jupiter: 'Jupiter (Guru)', saturn: 'Saturn (Shani)', apollo: 'Sun (Surya)',
  mercury: 'Mercury (Budha)', venus: 'Venus (Shukra)', luna: 'Moon (Chandra)',
  mars_upper: 'Upper Mars', mars_lower: 'Lower Mars', rahu_plain: 'Rahu Plain',
  mars_positive: 'Mars+', mars_negative: 'Mars−',
};

const MOUNT_DEV_COLOR: Record<string, string> = {
  flat: '#94a3b8', normal: '#22c55e', prominent: '#f59e0b',
};

function ScoreBar({ score }: { score: number }) {
  const pct = Math.min(100, Math.max(0, (score / 10) * 100));
  const color = score >= 8 ? '#22c55e' : score >= 6 ? '#f59e0b' : score >= 4 ? '#f97316' : '#ef4444';
  return (
    <div className="flex items-center gap-2 mt-1">
      <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-[13px] font-bold tabular-nums" style={{ color }}>{score}/10</span>
    </div>
  );
}

function SectionHeader({ icon, title, sub, id }: { icon: string; title: string; sub?: string; id?: string }) {
  return (
    <div id={id} className="flex items-start gap-2 mb-3 scroll-mt-20">
      <span className="text-xl mt-0.5">{icon}</span>
      <div>
        <h2 className="text-[15px] font-bold text-white leading-tight">{title}</h2>
        {sub && <p className="text-[11px] text-white/55 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function InfoCard({ children, accent = false }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <div
      className="rounded-2xl p-4"
      style={{
        background: accent ? 'rgba(245,158,11,0.08)' : 'rgba(255,255,255,0.04)',
        border: `1px solid ${accent ? 'rgba(245,158,11,0.2)' : 'rgba(255,255,255,0.08)'}`,
      }}
    >
      {children}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-bold tracking-widest uppercase text-white/40 mb-1">{children}</p>;
}

function Body({ children }: { children: React.ReactNode }) {
  return <p className="text-[13px] leading-relaxed text-white/80">{children}</p>;
}

function Pill({ text, color = 'rgba(255,255,255,0.08)' }: { text: string; color?: string }) {
  return (
    <span
      className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-medium text-white/75 mr-1.5 mb-1.5"
      style={{ background: color, border: '1px solid rgba(255,255,255,0.12)' }}
    >
      {text}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*  Page                                                                      */
/* -------------------------------------------------------------------------- */

export default function PalmReadingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [reading, setReading] = useState<PalmReading | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [activeSection, setActiveSection] = useState('overview');

  useEffect(() => {
    if (!id) return;
    fetch(`/api/palm/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((json) => {
        if (json?.data) setReading(json.data as PalmReading);
        else setNotFound(true);
      })
      .catch((status) => {
        if (status === 404) setNotFound(true);
      })
      .finally(() => setLoading(false));
  }, [id]);

  const handleDelete = useCallback(async () => {
    if (!id) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/palm/${id}`, { method: 'DELETE' });
      if (res.ok) router.replace('/palm');
    } catch {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }, [id, router]);

  // Track scroll position for active section highlight
  useEffect(() => {
    const handler = () => {
      const sectionEls = Object.values(SECTION_IDS).map((sid) => ({ sid, el: document.getElementById(sid) })).filter((x) => x.el);
      const y = window.scrollY + 120;
      let current = sectionEls[0]?.sid ?? 'overview';
      for (const { sid, el } of sectionEls) {
        if (el && el.offsetTop <= y) current = sid;
      }
      setActiveSection(current);
    };
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0a0f' }}>
        <div className="text-center">
          <div className="text-4xl mb-3 animate-pulse">🪷</div>
          <p className="text-white/50 text-sm">Loading your palm reading…</p>
        </div>
      </div>
    );
  }

  if (notFound || !reading) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#0a0a0f' }}>
        <div className="text-center space-y-4 max-w-sm">
          <div className="text-4xl">🔍</div>
          <p className="text-white font-semibold">Reading not found</p>
          <p className="text-white/50 text-sm">This reading may have been deleted or doesn't belong to your account.</p>
          <button onClick={() => router.push('/palm')} className="mt-4 px-5 py-2 rounded-full text-sm font-semibold text-white" style={{ background: 'var(--primary)' }}>
            Go to Palm Reading
          </button>
        </div>
      </div>
    );
  }

  const a = reading.analysis ?? ({} as PalmAnalysis);
  const handLabel = reading.hand === 'left' ? 'Left Hand (Female · Janma Hast)' : 'Right Hand (Male · Karma Hast)';
  const depth = a.reportDepth ?? 'full';
  const depthLabel: Record<string, string> = { basic: 'Basic', full: 'Full Report', ultra: 'Ultra Detailed' };
  const lang = a.language ?? 'English';

  // Build PalmLines from majorLines polylines for the infographic
  const palmLines = {
    heart: (a.majorLines?.heartLine as { polyline?: [number, number][] } | undefined)?.polyline ? { polyline: (a.majorLines?.heartLine as { polyline?: [number, number][] }).polyline! } : undefined,
    head:  (a.majorLines?.headLine  as { polyline?: [number, number][] } | undefined)?.polyline ? { polyline: (a.majorLines?.headLine  as { polyline?: [number, number][] }).polyline! } : undefined,
    life:  (a.majorLines?.lifeLine  as { polyline?: [number, number][] } | undefined)?.polyline ? { polyline: (a.majorLines?.lifeLine  as { polyline?: [number, number][] }).polyline! } : undefined,
    fate:  (a.majorLines?.fateLine  as { polyline?: [number, number][] } | undefined)?.polyline ? { polyline: (a.majorLines?.fateLine  as { polyline?: [number, number][] }).polyline! } : undefined,
  };

  const scores = a.luckyDestinyScore ?? {};
  const scoreKeys = ['career', 'wealth', 'marriage', 'health', 'fame', 'spiritualGrowth'];
  const avgScore = scoreKeys.length > 0
    ? Math.round(scoreKeys.reduce((acc, k) => acc + ((scores[k] as ScoreEntry | undefined)?.score ?? 0), 0) / scoreKeys.length * 10) / 10
    : null;

  const NAV_ITEMS = [
    { id: 'overview',   label: '✋ Overview' },
    { id: 'majorLines', label: '✦ Lines' },
    { id: 'mounts',     label: '⛰️ Mounts' },
    { id: 'career',     label: '💼 Career' },
    { id: 'love',       label: '💍 Love' },
    { id: 'health',     label: '🌿 Health' },
    { id: 'ageWise',    label: '🕰️ Age' },
    { id: 'spiritual',  label: '🕉️ Spirit' },
    { id: 'symbols',    label: '🔯 Symbols' },
    { id: 'scores',     label: '⭐ Scores' },
    { id: 'summary',    label: '📜 Summary' },
  ];

  return (
    <div className="min-h-screen pb-24" style={{ color: '#f1f5f9' }}>
      {/* Top bar */}
      <div className="sticky top-0 z-30 flex items-center justify-between px-4 py-3" style={{ background: 'rgba(10,10,15,0.92)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <button onClick={() => router.back()} className="flex items-center gap-1.5 text-white/60 hover:text-white text-sm transition-colors">
          ← Back
        </button>
        <div className="text-center">
          <p className="text-[12px] font-semibold text-white">Hasta Rekha</p>
          <p className="text-[10px] text-white/40">{new Date(reading.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
        </div>
        <button
          onClick={() => setConfirmDelete(true)}
          className="text-[11px] font-medium px-3 py-1.5 rounded-full border text-red-400 border-red-400/30 hover:bg-red-400/10 transition-colors"
        >
          Delete
        </button>
      </div>

      {/* Section nav */}
      <div className="sticky top-[52px] z-20 overflow-x-auto no-scrollbar" style={{ background: 'rgba(10,10,15,0.85)', backdropFilter: 'blur(8px)' }}>
        <div className="flex gap-1 px-4 py-2" style={{ width: 'max-content', minWidth: '100%' }}>
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                document.getElementById(item.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
              className="flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-medium transition-all whitespace-nowrap"
              style={{
                background: activeSection === item.id ? 'rgba(245,158,11,0.18)' : 'rgba(255,255,255,0.04)',
                color: activeSection === item.id ? '#f59e0b' : 'rgba(255,255,255,0.5)',
                border: `1px solid ${activeSection === item.id ? 'rgba(245,158,11,0.3)' : 'rgba(255,255,255,0.06)'}`,
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-6 space-y-6">

        {/* ── Hero ── */}
        <motion.div id={SECTION_IDS.overview} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="scroll-mt-28">
          <div className="text-center mb-4">
            <p className="text-[10px] font-bold tracking-[0.3em] text-white/35 uppercase mb-1">Samudrika Shastra</p>
            <h1 className="text-2xl font-bold text-white mb-1">Your Palm Reading</h1>
            <p className="text-[12px] text-white/45">{handLabel}</p>
            <div className="flex items-center justify-center gap-2 mt-2 flex-wrap">
              <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(245,158,11,0.12)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.2)' }}>
                {depthLabel[depth] ?? depth}
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.08)' }}>
                {lang}
              </span>
              {(() => {
                const iq = a.imageQuality;
                if (!iq) return null;
                const isObj = typeof iq === 'object';
                const rating = isObj ? iq.rating : iq;
                const score = isObj ? iq.score : undefined;
                const ratingColor =
                  rating === 'excellent' ? { bg: 'rgba(34,197,94,0.14)', fg: '#22c55e', br: 'rgba(34,197,94,0.25)' } :
                  rating === 'good'      ? { bg: 'rgba(132,204,22,0.12)', fg: '#a3e635', br: 'rgba(132,204,22,0.22)' } :
                  rating === 'fair'      ? { bg: 'rgba(245,158,11,0.12)', fg: '#fbbf24', br: 'rgba(245,158,11,0.22)' } :
                  rating === 'poor'      ? { bg: 'rgba(239,68,68,0.12)',  fg: '#f87171', br: 'rgba(239,68,68,0.22)' } :
                                            { bg: 'rgba(255,255,255,0.06)', fg: 'rgba(255,255,255,0.6)', br: 'rgba(255,255,255,0.08)' };
                return (
                  <span className="text-[10px] px-2 py-0.5 rounded-full capitalize font-medium" style={{ background: ratingColor.bg, color: ratingColor.fg, border: `1px solid ${ratingColor.br}` }}>
                    Photo: {rating}{typeof score === 'number' ? ` ${score}/10` : ''}
                  </span>
                );
              })()}
              {avgScore !== null && (
                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: 'rgba(34,197,94,0.12)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.2)' }}>
                  Avg {avgScore}/10
                </span>
              )}
            </div>
          </div>

          {/* Palm infographic */}
          {reading.imageUrl && (
            <div className="mx-auto mb-4" style={{ maxWidth: 300 }}>
              <PalmInfographic
                imageUrl={reading.imageUrl}
                hand={reading.hand}
                lines={palmLines}
                variant="full"
              />
            </div>
          )}

          {/* Photo clarity breakdown */}
          {a.imageQuality && typeof a.imageQuality === 'object' && (
            <InfoCard>
              <Label>Photo Clarity</Label>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-2">
                {[
                  { key: 'lineVisibility', label: 'Line visibility' },
                  { key: 'lighting',       label: 'Lighting' },
                  { key: 'focus',          label: 'Focus' },
                  { key: 'framing',        label: 'Framing' },
                ].map(({ key, label }) => {
                  const v = (a.imageQuality as ImageQuality)[key as keyof ImageQuality];
                  if (typeof v !== 'number') return null;
                  const color = v >= 8 ? '#22c55e' : v >= 6 ? '#a3e635' : v >= 4 ? '#fbbf24' : '#f87171';
                  return (
                    <div key={key}>
                      <div className="flex items-center justify-between text-[11px] mb-1">
                        <span className="text-white/55">{label}</span>
                        <span className="font-semibold" style={{ color }}>{v}/10</span>
                      </div>
                      <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                        <div style={{ width: `${v * 10}%`, height: '100%', background: color, borderRadius: 4 }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              {(a.imageQuality as ImageQuality).notes && (
                <p className="mt-3 text-[12px] text-white/55 leading-relaxed italic">
                  {(a.imageQuality as ImageQuality).notes}
                </p>
              )}
            </InfoCard>
          )}

          {/* Nova Canvas hand map */}
          {reading.novaCanvasImageUrl && (
            <div className="mb-4 text-center">
              <p className="text-[10px] text-white/35 uppercase tracking-widest mb-2">Perfected Hand Map</p>
              <img src={reading.novaCanvasImageUrl} alt="Perfected hand map" className="mx-auto rounded-2xl" style={{ maxWidth: 280, border: '1px solid rgba(255,255,255,0.08)' }} />
            </div>
          )}

          {/* Hand type overview */}
          {(a.handType || a.handShape) && (
            <InfoCard accent>
              <Label>Hand Type · {a.handType?.element ?? a.handShape?.type}</Label>
              <Body>{a.handType?.personalityProfile ?? a.handShape?.description ?? ''}</Body>
              {(a.handType?.temperament || a.handType?.nature) && (
                <div className="mt-2 flex flex-wrap">
                  {a.handType.temperament && <Pill text={a.handType.temperament} color="rgba(245,158,11,0.12)" />}
                  {a.handType.nature && <Pill text={a.handType.nature} color="rgba(245,158,11,0.12)" />}
                </div>
              )}
            </InfoCard>
          )}

          {/* Summary hook */}
          {a.summary && a.summary[0] && (
            <InfoCard>
              <p className="text-[14px] font-semibold text-white/90 leading-snug italic">"{a.summary[0]}"</p>
              {a.summary[1] && <p className="mt-2 text-[12px] text-white/55 leading-relaxed">{a.summary[1]}</p>}
              {a.summary[2] && <p className="mt-1.5 text-[12px] text-white/55 leading-relaxed">{a.summary[2]}</p>}
            </InfoCard>
          )}
        </motion.div>

        {/* ── Thumb ── */}
        {a.thumbAnalysis && (
          <div id={SECTION_IDS.thumb} className="scroll-mt-28">
            <SectionHeader icon="👍" title="Thumb Analysis" sub="Will · Logic · Leadership" />
            <InfoCard>
              <div className="grid grid-cols-2 gap-3 mb-3">
                {[
                  { l: 'Will Phalanx', v: a.thumbAnalysis.willPhalanx },
                  { l: 'Logic Phalanx', v: a.thumbAnalysis.logicPhalanx },
                  { l: 'Flexibility', v: a.thumbAnalysis.flexibility },
                ].filter(x => x.v).map(({ l, v }) => (
                  <div key={l}>
                    <Label>{l}</Label>
                    <p className="text-[12px] text-white/70 capitalize">{v}</p>
                  </div>
                ))}
              </div>
              {a.thumbAnalysis.willpower && <><Label>Willpower</Label><Body>{a.thumbAnalysis.willpower}</Body></>}
              {a.thumbAnalysis.leadership && <div className="mt-2"><Label>Leadership</Label><Body>{a.thumbAnalysis.leadership}</Body></div>}
              {a.thumbAnalysis.emotionalControl && <div className="mt-2"><Label>Emotional Control</Label><Body>{a.thumbAnalysis.emotionalControl}</Body></div>}
              {a.thumbAnalysis.interpretation && <div className="mt-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}><Body>{a.thumbAnalysis.interpretation}</Body></div>}
            </InfoCard>
          </div>
        )}

        {/* ── Fingers ── */}
        {a.fingerAnalysis && (
          <div id={SECTION_IDS.fingers} className="scroll-mt-28">
            <SectionHeader icon="✋" title="Finger Analysis" sub="Jupiter · Saturn · Sun · Mercury" />
            <div className="space-y-2">
              {(['index', 'middle', 'ring', 'little'] as const).map((f) => {
                const fd = a.fingerAnalysis?.[f] as { length?: string; bent?: string; interpretation?: string } | undefined;
                if (!fd || typeof fd !== 'object') return null;
                const FINGER_PLANET: Record<string, string> = { index: 'Jupiter', middle: 'Saturn', ring: 'Sun', little: 'Mercury' };
                const FINGER_EMOJI: Record<string, string> = { index: '☝️', middle: '🖕', ring: '💍', little: '🤙' };
                return (
                  <InfoCard key={f}>
                    <div className="flex items-start gap-2">
                      <span className="text-lg">{FINGER_EMOJI[f]}</span>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="text-[12px] font-bold text-white capitalize">{f} Finger</p>
                          <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.4)' }}>{FINGER_PLANET[f]}</span>
                          {fd.length && <span className="text-[10px] text-white/40 capitalize">{fd.length}</span>}
                          {fd.bent === 'yes' && <span className="text-[10px] text-yellow-400/60">bent</span>}
                        </div>
                        {fd.interpretation && <Body>{fd.interpretation}</Body>}
                      </div>
                    </div>
                  </InfoCard>
                );
              })}
              {(a.fingerAnalysis.fingerGaps || a.fingerAnalysis.overallInterpretation) && (
                <InfoCard accent>
                  {a.fingerAnalysis.fingerGaps && <><Label>Finger Gaps</Label><Body>{a.fingerAnalysis.fingerGaps}</Body></>}
                  {a.fingerAnalysis.overallInterpretation && <div className="mt-2"><Body>{a.fingerAnalysis.overallInterpretation}</Body></div>}
                </InfoCard>
              )}
            </div>
          </div>
        )}

        {/* ── Mounts ── */}
        {a.mounts && Object.keys(a.mounts).length > 0 && (
          <div id={SECTION_IDS.mounts} className="scroll-mt-28">
            <SectionHeader icon="⛰️" title="Navagraha Mounts" sub="9 planetary energy centers" />
            <div className="space-y-2">
              {Object.entries(a.mounts).map(([key, mount]) => {
                if (!mount || typeof mount !== 'object') return null;
                const dev = mount.development ?? 'normal';
                return (
                  <InfoCard key={key}>
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className="text-[12px] font-bold text-white">{MOUNT_LABELS[key] ?? key}</p>
                      <span
                        className="text-[10px] px-2 py-0.5 rounded-full capitalize flex-shrink-0 font-semibold"
                        style={{ background: `${MOUNT_DEV_COLOR[dev] ?? '#94a3b8'}18`, color: MOUNT_DEV_COLOR[dev] ?? '#94a3b8', border: `1px solid ${MOUNT_DEV_COLOR[dev] ?? '#94a3b8'}30` }}
                      >
                        {dev}
                      </span>
                    </div>
                    {mount.interpretation && <Body>{mount.interpretation}</Body>}
                  </InfoCard>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Major Lines ── */}
        {a.majorLines && (
          <div id={SECTION_IDS.majorLines} className="scroll-mt-28">
            <SectionHeader icon="✦" title="Major Palm Lines" sub="Life · Heart · Head · Fate · Sun · Mercury" />
            <div className="space-y-3">
              {[
                { key: 'lifeLine',    label: 'Life Line (Ayu Rekha)',      icon: '❤️',  color: '#5eead4' },
                { key: 'heartLine',   label: 'Heart Line (Hridaya Rekha)', icon: '💙',  color: '#f87171' },
                { key: 'headLine',    label: 'Head Line (Mastishka Rekha)',icon: '🧠',  color: '#fbbf24' },
                { key: 'fateLine',    label: 'Fate Line (Bhagya Rekha)',   icon: '⭐',  color: '#e5e7eb' },
                { key: 'sunLine',     label: 'Sun Line (Surya Rekha)',     icon: '☀️',  color: '#fcd34d' },
                { key: 'mercuryLine', label: 'Mercury Line',               icon: '🌿',  color: '#a3e635' },
              ].map(({ key, label, icon, color }) => {
                const line = a.majorLines?.[key];
                if (!line || !line.interpretation) return null;
                return (
                  <div key={key} className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
                    <div className="flex items-center gap-3 px-4 py-2.5" style={{ background: `${color}12`, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      <div className="w-1 h-5 rounded-full flex-shrink-0" style={{ background: color }} />
                      <span className="text-base">{icon}</span>
                      <p className="text-[12px] font-bold text-white flex-1">{label}</p>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {line.present === false && <span className="text-[10px] text-white/30">absent</span>}
                        {line.length && <span className="text-[10px] capitalize px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.45)' }}>{line.length}</span>}
                        {line.depth && <span className="text-[10px] capitalize px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.45)' }}>{line.depth}</span>}
                      </div>
                    </div>
                    <div className="px-4 py-3 space-y-2">
                      {/* Attributes row */}
                      <div className="flex flex-wrap gap-1">
                        {(line.breaks ?? 0) > 0 && <Pill text={`${line.breaks} break${(line.breaks??0)>1?'s':''}`} />}
                        {(line.islands ?? 0) > 0 && <Pill text={`${line.islands} island${(line.islands??0)>1?'s':''}`} />}
                        {line.chains && <Pill text="chained" />}
                        {line.forks && <Pill text={`fork: ${line.forks}`} />}
                        {line.branches && <Pill text={`branches: ${line.branches}`} />}
                        {line.slope && <Pill text={line.slope} />}
                        {line.endingPosition && <Pill text={`ends: ${line.endingPosition}`} />}
                        {line.startPoint && <Pill text={`from: ${line.startPoint}`} />}
                      </div>
                      <Body>{line.interpretation}</Body>
                      {line.timingPredictions && (
                        <div className="mt-2 pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                          <Label>Timing Predictions</Label>
                          <Body>{line.timingPredictions}</Body>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Minor Lines ── */}
        {a.minorLines && Object.values(a.minorLines).some(l => l?.interpretation) && (
          <div id={SECTION_IDS.minorLines} className="scroll-mt-28">
            <SectionHeader icon="〰️" title="Minor Lines" sub="Marriage · Children · Travel" />
            <div className="space-y-2">
              {[
                { key: 'marriageLines', label: 'Marriage Lines', icon: '💍' },
                { key: 'childrenLines', label: 'Children Lines', icon: '👶' },
                { key: 'travelLines',   label: 'Travel Lines',   icon: '✈️' },
                { key: 'marsLine',      label: 'Mars Line',       icon: '🛡️' },
                { key: 'intuitonLine',  label: 'Intuition Line',  icon: '🌙' },
              ].map(({ key, label, icon }) => {
                const line = a.minorLines?.[key];
                if (!line?.interpretation) return null;
                return (
                  <InfoCard key={key}>
                    <div className="flex items-start gap-2">
                      <span className="text-base mt-0.5">{icon}</span>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-[12px] font-bold text-white">{label}</p>
                          {line.count !== undefined && <span className="text-[10px] text-white/40">×{line.count}</span>}
                          {line.present === false && <span className="text-[10px] text-white/30">absent</span>}
                        </div>
                        <Body>{line.interpretation}</Body>
                        {line.timingPredictions && (
                          <div className="mt-2 pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                            <Label>Timing</Label>
                            <Body>{line.timingPredictions}</Body>
                          </div>
                        )}
                      </div>
                    </div>
                  </InfoCard>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Career & Money ── */}
        {(a.careerAndMoney || a.careerSuggestions) && (
          <div id={SECTION_IDS.career} className="scroll-mt-28">
            <SectionHeader icon="💼" title="Career & Money" sub="Dharma, wealth, and professional path" />
            <div className="space-y-3">
              {a.careerAndMoney?.businessVsJob && (
                <InfoCard accent>
                  <Label>Business vs Job</Label>
                  <Body>{a.careerAndMoney.businessVsJob}</Body>
                </InfoCard>
              )}
              {(a.careerAndMoney?.bestFields ?? a.careerSuggestions) && (
                <InfoCard>
                  <Label>Best Career Fields</Label>
                  <div className="flex flex-wrap mt-1">
                    {(a.careerAndMoney?.bestFields ?? a.careerSuggestions ?? []).map((f, i) => (
                      <Pill key={i} text={f} color="rgba(245,158,11,0.1)" />
                    ))}
                  </div>
                </InfoCard>
              )}
              {a.careerAndMoney?.wealthGrowthPeriods && a.careerAndMoney.wealthGrowthPeriods.length > 0 && (
                <InfoCard>
                  <Label>Wealth Growth Periods</Label>
                  <ul className="space-y-1.5 mt-1">
                    {a.careerAndMoney.wealthGrowthPeriods.map((p, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-yellow-400/60 text-sm mt-0.5">◆</span>
                        <Body>{p}</Body>
                      </li>
                    ))}
                  </ul>
                </InfoCard>
              )}
              {a.careerAndMoney?.foreignOpportunities && (
                <InfoCard>
                  <Label>Foreign Opportunities</Label>
                  <Body>{a.careerAndMoney.foreignOpportunities}</Body>
                </InfoCard>
              )}
              {(a.careerAndMoney?.overallOutlook ?? a.financialOutlook) && (
                <InfoCard>
                  <Label>Financial Outlook</Label>
                  <Body>{a.careerAndMoney?.overallOutlook ?? a.financialOutlook ?? ''}</Body>
                </InfoCard>
              )}
            </div>
          </div>
        )}

        {/* ── Love & Marriage ── */}
        {(a.loveAndMarriage || a.relationshipOutlook) && (
          <div id={SECTION_IDS.love} className="scroll-mt-28">
            <SectionHeader icon="💍" title="Love & Marriage" sub="Heart line, Venus mount, marriage lines" />
            <div className="space-y-3">
              {a.loveAndMarriage?.emotionalNature && (
                <InfoCard accent>
                  <Label>Emotional Nature</Label>
                  <Body>{a.loveAndMarriage.emotionalNature}</Body>
                </InfoCard>
              )}
              {a.loveAndMarriage?.marriageTiming && (
                <InfoCard>
                  <Label>Marriage Timing</Label>
                  <Body>{a.loveAndMarriage.marriageTiming}</Body>
                </InfoCard>
              )}
              {a.loveAndMarriage?.relationshipStability && (
                <InfoCard>
                  <Label>Relationship Stability</Label>
                  <Body>{a.loveAndMarriage.relationshipStability}</Body>
                </InfoCard>
              )}
              {a.loveAndMarriage?.heartbreakRisk && (
                <InfoCard>
                  <Label>Heartbreak Risk</Label>
                  <Body>{a.loveAndMarriage.heartbreakRisk}</Body>
                </InfoCard>
              )}
              {(a.loveAndMarriage?.overallOutlook ?? a.relationshipOutlook) && (
                <InfoCard>
                  <Label>Overall Outlook</Label>
                  <Body>{a.loveAndMarriage?.overallOutlook ?? a.relationshipOutlook ?? ''}</Body>
                </InfoCard>
              )}
            </div>
          </div>
        )}

        {/* ── Health ── */}
        {(a.healthAnalysis || a.healthWarnings) && (
          <div id={SECTION_IDS.health} className="scroll-mt-28">
            <SectionHeader icon="🌿" title="Health Analysis" sub="Life line, Mercury line, constitution" />
            <div className="space-y-3">
              {a.healthAnalysis?.stressIndicators && (
                <InfoCard>
                  <Label>Stress Indicators</Label>
                  <Body>{a.healthAnalysis.stressIndicators}</Body>
                </InfoCard>
              )}
              {a.healthAnalysis?.energyLevels && (
                <InfoCard>
                  <Label>Energy & Constitution</Label>
                  <Body>{a.healthAnalysis.energyLevels}</Body>
                  {a.healthAnalysis.constitution && <div className="mt-1.5"><Body>{a.healthAnalysis.constitution}</Body></div>}
                </InfoCard>
              )}
              {(a.healthAnalysis?.possibleConcerns ?? a.healthWarnings)?.length ? (
                <InfoCard>
                  <Label>Areas to Watch</Label>
                  <ul className="space-y-1.5 mt-1">
                    {(a.healthAnalysis?.possibleConcerns ?? a.healthWarnings ?? []).map((c, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-yellow-400/60 mt-0.5">⚠</span>
                        <Body>{c}</Body>
                      </li>
                    ))}
                  </ul>
                </InfoCard>
              ) : null}
              {a.healthAnalysis?.recommendations && (
                <InfoCard accent>
                  <Label>Recommendations</Label>
                  <Body>{a.healthAnalysis.recommendations}</Body>
                </InfoCard>
              )}
            </div>
          </div>
        )}

        {/* ── Age-Wise ── */}
        {a.ageWisePredictions && (
          <div id={SECTION_IDS.ageWise} className="scroll-mt-28">
            <SectionHeader icon="🕰️" title="Age-Wise Life Predictions" sub="Timeline mapped to palm features" />
            <div className="space-y-2">
              {[
                { key: 'childhood',  label: 'Childhood (0–17)',   icon: '🌱' },
                { key: 'age18to25', label: 'Young Adult (18–25)', icon: '🌤️' },
                { key: 'age26to35', label: 'Building Years (26–35)', icon: '🏗️' },
                { key: 'age36to50', label: 'Prime Years (36–50)', icon: '🌟' },
                { key: 'age50plus', label: 'Wisdom Years (50+)', icon: '🌊' },
              ].map(({ key, label, icon }) => {
                const text = a.ageWisePredictions?.[key as keyof typeof a.ageWisePredictions];
                if (!text) return null;
                return (
                  <div key={key} className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-base">{icon}</span>
                      <p className="text-[12px] font-bold text-white">{label}</p>
                    </div>
                    <Body>{text}</Body>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Spirituality ── */}
        {(a.spiritualityAndKarma || a.spiritualityAndKarma) && (
          <div id={SECTION_IDS.spiritual} className="scroll-mt-28">
            <SectionHeader icon="🕉️" title="Spirituality & Karma" sub="Moon mount, mystic cross, soul purpose" />
            <div className="space-y-3">
              {a.spiritualityAndKarma?.soulPurpose && (
                <InfoCard accent>
                  <Label>Soul Purpose</Label>
                  <Body>{a.spiritualityAndKarma.soulPurpose}</Body>
                </InfoCard>
              )}
              {a.spiritualityAndKarma?.karmaIndicators && (
                <InfoCard>
                  <Label>Karma Indicators</Label>
                  <Body>{a.spiritualityAndKarma.karmaIndicators}</Body>
                </InfoCard>
              )}
              {a.spiritualityAndKarma?.intuitionPower && (
                <InfoCard>
                  <Label>Intuition Power</Label>
                  <Body>{a.spiritualityAndKarma.intuitionPower}</Body>
                </InfoCard>
              )}
              {a.spiritualityAndKarma?.pastLifeImprints && (
                <InfoCard>
                  <Label>Past Life Imprints</Label>
                  <Body>{a.spiritualityAndKarma.pastLifeImprints}</Body>
                </InfoCard>
              )}
              {a.spiritualityAndKarma?.religiousTendencies && (
                <InfoCard>
                  <Label>Religious Tendencies</Label>
                  <Body>{a.spiritualityAndKarma.religiousTendencies}</Body>
                </InfoCard>
              )}
            </div>
          </div>
        )}

        {/* ── Special Symbols ── */}
        {a.specialSymbols && (
          <div id={SECTION_IDS.symbols} className="scroll-mt-28">
            <SectionHeader icon="🔯" title="Special Symbols & Markings" sub="Sacred signs detected in your palm" />
            <div className="space-y-2">
              {Object.entries(a.specialSymbols).map(([key, sym]) => {
                if (key === 'other' || !sym || typeof sym !== 'object' || Array.isArray(sym)) return null;
                const s = sym as { present?: boolean; location?: string; interpretation?: string };
                if (!s.present && !s.interpretation) return null;
                const SYMBOL_ICONS: Record<string, string> = {
                  star: '★', triangle: '△', fish: '🐟', trident: '🔱', square: '□',
                  cross: '✕', mysticCross: '✚', yava: '🌾', shankh: '🐚',
                };
                return (
                  <InfoCard key={key} accent={s.present}>
                    <div className="flex items-start gap-2">
                      <span className="text-lg">{SYMBOL_ICONS[key] ?? '◈'}</span>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-[12px] font-bold text-white capitalize">{key.replace(/([A-Z])/g, ' $1')}</p>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full ${s.present ? 'text-green-400' : 'text-white/30'}`}
                            style={{ background: s.present ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.04)' }}>
                            {s.present ? 'Present' : 'Not seen'}
                          </span>
                          {s.location && <span className="text-[10px] text-white/40">{s.location}</span>}
                        </div>
                        {s.interpretation && <Body>{s.interpretation}</Body>}
                      </div>
                    </div>
                  </InfoCard>
                );
              })}
              {Array.isArray(a.specialSymbols.other) && a.specialSymbols.other.length > 0 && (
                <InfoCard>
                  <Label>Other Rare Markings</Label>
                  <ul className="space-y-1 mt-1">
                    {(a.specialSymbols.other as string[]).map((m, i) => (
                      <li key={i} className="flex items-start gap-2 text-[12px] text-white/65">
                        <span className="text-yellow-400/60 mt-0.5">◆</span>{m}
                      </li>
                    ))}
                  </ul>
                </InfoCard>
              )}
              {a.specialMarkings?.length ? (
                <InfoCard>
                  <Label>Special Markings</Label>
                  {a.specialMarkings.map((m, i) => <Body key={i}>{m}</Body>)}
                </InfoCard>
              ) : null}
            </div>
          </div>
        )}

        {/* ── Remedies ── */}
        {a.remedies?.length ? (
          <div className="scroll-mt-28">
            <SectionHeader icon="🪷" title="Remedies & Upāya" sub="Mantra · Gemstone · Charity" />
            <InfoCard>
              <ul className="space-y-2">
                {a.remedies.map((r, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-yellow-400/60 mt-0.5">✦</span>
                    <Body>{r}</Body>
                  </li>
                ))}
              </ul>
            </InfoCard>
          </div>
        ) : null}

        {/* ── Vedic Correlation ── */}
        {a.vedicCorrelation && (
          <div className="scroll-mt-28">
            <SectionHeader icon="🪐" title="Vedic Correlation" sub="Graha and palm line connections" />
            <InfoCard>
              <Body>{a.vedicCorrelation}</Body>
            </InfoCard>
          </div>
        )}

        {/* ── Lucky Destiny Scores ── */}
        {Object.keys(scores).length > 0 && (
          <div id={SECTION_IDS.scores} className="scroll-mt-28">
            <SectionHeader icon="⭐" title="Luck & Destiny Scores" sub="Based on line quality, mount development, symbols" />
            <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
              {scoreKeys.map((k, i) => {
                const s = scores[k] as ScoreEntry | undefined;
                if (!s) return null;
                return (
                  <div key={k} className={`px-4 py-3 ${i < scoreKeys.length - 1 ? 'border-b border-white/5' : ''}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-base">{SCORE_ICONS[k] ?? '◈'}</span>
                        <p className="text-[12px] font-semibold text-white capitalize">{k.replace(/([A-Z])/g, ' $1')}</p>
                      </div>
                    </div>
                    <ScoreBar score={s.score} />
                    {s.reasoning && <p className="text-[11px] text-white/45 mt-1 leading-relaxed">{s.reasoning}</p>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Final Summary ── */}
        {a.finalSummary && (
          <div id={SECTION_IDS.summary} className="scroll-mt-28">
            <SectionHeader icon="📜" title="Final Summary" sub="Pandit Hastamani Shastri's verdict" />
            <div className="space-y-3">
              {[
                { key: 'strongestStrength', label: 'Strongest Strength', icon: '💪' },
                { key: 'biggestChallenge',  label: 'Biggest Challenge',  icon: '🌊' },
                { key: 'hiddenTalent',      label: 'Hidden Talent',      icon: '💎' },
                { key: 'importantFuturePeriod', label: 'Most Important Future Period', icon: '⏳' },
              ].map(({ key, label, icon }) => {
                const text = a.finalSummary?.[key as keyof typeof a.finalSummary];
                if (!text) return null;
                return (
                  <InfoCard key={key}>
                    <div className="flex items-start gap-2">
                      <span className="text-base mt-0.5">{icon}</span>
                      <div>
                        <Label>{label}</Label>
                        <Body>{text}</Body>
                      </div>
                    </div>
                  </InfoCard>
                );
              })}
              {a.finalSummary.overallDestiny && (
                <div className="rounded-2xl p-5 text-center" style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.08), rgba(139,92,246,0.08))', border: '1px solid rgba(245,158,11,0.2)' }}>
                  <p className="text-[10px] font-bold tracking-widest uppercase text-yellow-500/60 mb-2">Overall Destiny</p>
                  <p className="text-[14px] font-semibold text-white/90 leading-relaxed italic">"{a.finalSummary.overallDestiny}"</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Pandit message ── */}
        {a.panditMessage && (
          <div className="rounded-2xl p-5" style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.1), rgba(212, 175, 55,0.08))', border: '1px solid rgba(139,92,246,0.2)' }}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xl">🙏</span>
              <p className="text-[11px] font-semibold text-purple-300/80">Pandit Hastamani Shastri</p>
            </div>
            <p className="text-[13px] text-white/75 leading-relaxed italic">{a.panditMessage}</p>
          </div>
        )}

        {/* ── Disclaimer ── */}
        <p className="text-center text-[10px] text-white/25 leading-relaxed pb-4">
          This is a traditional palmistry interpretation based on Hindu Hasta Samudrika principles and should be considered spiritual guidance, not scientific certainty.
        </p>
      </div>

      {/* ── Delete confirmation modal ── */}
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
              className="w-full max-w-sm rounded-2xl p-6 text-center"
              style={{ background: '#161620', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              <p className="text-[18px] mb-1">🗑️</p>
              <p className="text-[15px] font-bold text-white mb-2">Delete this reading?</p>
              <p className="text-[12px] text-white/50 mb-5 leading-relaxed">
                This will permanently remove your palm reading and the stored photo. This cannot be undone.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="flex-1 py-2.5 rounded-full text-[13px] font-semibold text-white/60 border border-white/15"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex-1 py-2.5 rounded-full text-[13px] font-semibold text-white"
                  style={{ background: deleting ? 'rgba(239,68,68,0.4)' : '#ef4444' }}
                >
                  {deleting ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
