'use client';

import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { useStore } from '@/store/useStore';
import { SkeletonCard } from '@/components/ui/skeleton';
import { Planet3DInline } from '@/components/3d/Planet3DInline';

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

interface ForecastItem { timeframe: string; icon: string; narrative: string }
interface HistoryItem {
  id: string;
  husband_name: string;
  wife_name: string;
  total_score: number;
  max_score: number;
  compatibility: string;
  result_data: CoupleResultFixed;
  created_at: string;
}
interface CompatZone { score: number; analysis: string }
interface ConflictArea { area: string; description: string; severity: 'low' | 'medium' | 'high' }
interface SharedRemedy { remedy: string; purpose: string; frequency: string }
interface KootaScore { koota: string; score: number; maxScore: number; description: string; compatibility: string }

type PlanetRow = { planet: string; sign: string; nakshatra: string; house: number; isRetrograde: boolean; signDegree: number; nakshatraPada: number };

interface CoupleResultFixed {
  husbandName: string;
  wifeName: string;
  partner1: { name: string; planets: PlanetRow[]; ascendant: { sign: string; degree: number } };
  partner2: { name: string; planets: PlanetRow[]; ascendant: { sign: string; degree: number } };
  ashtakoota: {
    scores: KootaScore[];
    totalScore: number;
    maxTotal: number;
    overallCompatibility: string;
    mangalMatch: { boyManglik: boolean; girlManglik: boolean; compatible: boolean };
  };
  aiAnalysis: {
    sharedForecast?: ForecastItem[] | string;
    compatibilityZones?: { career?: CompatZone; romance?: CompatZone; finances?: CompatZone; family?: CompatZone };
    conflictAreas?: ConflictArea[];
    sharedRemedies?: SharedRemedy[];
    strengthAreas?: string[];
    storyOfThem?: string;
    monthlyOutlook?: string;
  };
}

const COMPAT_COLOR = {
  excellent: '#22c55e',
  good: 'var(--primary)',
  average: '#f59e0b',
  poor: '#ef4444',
  challenging: '#ef4444',
};

function compatColor(level: string) {
  return COMPAT_COLOR[level as keyof typeof COMPAT_COLOR] ?? 'var(--primary)';
}

const PLANET_META: Record<string, { icon: string; color: string; label: string }> = {
  Sun:     { icon: '☀️', color: '#F4B942', label: 'Self & vitality' },
  Moon:    { icon: '🌙', color: '#8BC4E8', label: 'Mind & emotions' },
  Mars:    { icon: '♂',  color: '#E8735A', label: 'Energy & drive' },
  Mercury: { icon: '☿',  color: '#6BBF9E', label: 'Mind & speech' },
  Jupiter: { icon: '♃',  color: '#C4A84F', label: 'Wisdom & growth' },
  Venus:   { icon: '♀',  color: '#E8A87C', label: 'Love & beauty' },
  Saturn:  { icon: '♄',  color: '#8BA89B', label: 'Karma & discipline' },
  Rahu:    { icon: '☊',  color: '#7BA3B8', label: 'Desire & change' },
  Ketu:    { icon: '☋',  color: '#9B6B9E', label: 'Detachment' },
};

// Polite, compassionate descriptions for kootas — replaces clinical/harsh phrases
function politeDescription(koota: string, score: number, maxScore: number, raw: string): string {
  const pct = score / maxScore;
  const k = koota.toLowerCase();

  if (k.includes('yoni') && pct < 0.5) {
    return 'Your physical and emotional natures move at different rhythms. With patience and tenderness, this difference becomes a source of growth rather than friction.';
  }
  if (k.includes('gana') && pct < 0.5) {
    return 'Your temperaments draw from different sources — one more grounded, the other more spirited. Mutual respect for each other\'s pace turns this into balance.';
  }
  if (k.includes('bhakoot') && pct < 0.5) {
    return 'Lunar positions suggest some life-area tensions around finances and family. Conscious communication and shared rituals soften this beautifully.';
  }
  if (k.includes('nadi') && pct < 0.5) {
    return 'Constitutional energies are very similar, which can affect health and progeny. Traditional remedies are well-known to harmonise this completely.';
  }
  if (k.includes('vashya') && pct < 0.5) {
    return 'Mutual influence flows gently rather than strongly. Building trust slowly creates the foundation for deep harmony.';
  }
  if (pct >= 0.75) {
    return raw + ' — a real strength of your bond.';
  }
  // Fallback: gently soften harsh words
  return raw
    .replace(/incompatible/gi, 'differing')
    .replace(/inauspicious/gi, 'requiring care')
    .replace(/dosha/gi, 'energy pattern')
    .replace(/low/gi, 'softer');
}

// Remedy suggestions for low-scoring kootas
const KOOTA_META: Record<string, { governs: string }> = {
  Varna:       { governs: 'Spiritual alignment & shared purpose' },
  Vashya:      { governs: 'Mutual attraction & natural influence over each other' },
  Tara:        { governs: 'Long-term health & well-being as a couple' },
  Yoni:        { governs: 'Physical chemistry & emotional intimacy' },
  GrahaMaitri: { governs: 'Mental rapport, friendship & intellectual bond' },
  Gana:        { governs: 'Temperament match — how your natures fit together' },
  Bhakoot:     { governs: 'Love, wealth growth & family prosperity' },
  Nadi:        { governs: 'Health harmony & children' },
};

function findKootaMeta(koota: string) {
  const key = Object.keys(KOOTA_META).find(k =>
    koota.toLowerCase().includes(k.toLowerCase()) ||
    (k === 'GrahaMaitri' && koota.toLowerCase().includes('graha'))
  );
  return key ? KOOTA_META[key] : null;
}

const KOOTA_REMEDIES: Record<string, { ritual: string; mantra: string; lifestyle: string }> = {
  Varna:      { ritual: 'Worship Lord Vishnu together on Thursdays', mantra: 'Chant "Om Namo Narayanaya" 108 times', lifestyle: 'Begin meals with a shared moment of gratitude' },
  Vashya:     { ritual: 'Light a ghee lamp together every evening', mantra: 'Chant the Gayatri Mantra 11 times daily', lifestyle: 'Spend 10 quiet minutes together each morning' },
  Tara:       { ritual: 'Feed birds and stray animals on Saturdays', mantra: 'Recite Maha Mrityunjaya Mantra weekly', lifestyle: 'Avoid major decisions on each other\'s birth-star days' },
  Yoni:       { ritual: 'Offer milk to a Shiva Linga on Mondays', mantra: 'Chant "Om Namah Shivaya" together at dusk', lifestyle: 'Practise mindful, gentle communication during disagreements' },
  GrahaMaitri:{ ritual: 'Donate yellow items (turmeric, gram dal) on Thursdays', mantra: 'Chant "Om Brim Brihaspataye Namah"', lifestyle: 'Share intellectual or spiritual reading weekly' },
  Gana:       { ritual: 'Recite Vishnu Sahasranama together on Sundays', mantra: 'Chant "Om Vishnave Namah" 108 times', lifestyle: 'Honour each other\'s emotional rhythms without judgement' },
  Bhakoot:    { ritual: 'Perform Lakshmi-Narayan puja monthly', mantra: 'Chant "Om Shri Lakshmi Narayanaya Namah"', lifestyle: 'Keep finances transparent; plan major moves together' },
  Nadi:       { ritual: 'Perform Maha Mrityunjaya Homa before marriage', mantra: 'Chant Maha Mrityunjaya Mantra daily', lifestyle: 'Prioritise wholesome food and Ayurvedic balance' },
};

function findRemedy(koota: string) {
  const key = Object.keys(KOOTA_REMEDIES).find(k => koota.toLowerCase().includes(k.toLowerCase().replace('grahamaitri', 'graha')));
  return key ? KOOTA_REMEDIES[key] : null;
}

/* -------------------------------------------------------------------------- */
/*  Score Ring                                                                */
/* -------------------------------------------------------------------------- */
function ScoreRing({ score, max, color }: { score: number; max: number; color: string }) {
  const r = 54; const circ = 2 * Math.PI * r;
  const pct = score / max;
  return (
    <svg width={130} height={130} viewBox="0 0 130 130">
      <circle cx={65} cy={65} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={10} />
      <circle cx={65} cy={65} r={r} fill="none" stroke={color} strokeWidth={10}
        strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)}
        transform="rotate(-90 65 65)" style={{ transition: 'stroke-dashoffset 1s ease' }} />
      <text x={65} y={61} textAnchor="middle" fontSize={22} fontWeight="800" fill="var(--text)">{score}</text>
      <text x={65} y={76} textAnchor="middle" fontSize={11} fill="var(--text-secondary)">/ {max}</text>
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*  Zone Bar                                                                  */
/* -------------------------------------------------------------------------- */
function ZoneBar({ label, icon, score, analysis }: { label: string; icon: string; score: number; analysis: string }) {
  const color = score >= 8 ? '#22c55e' : score >= 6 ? 'var(--primary)' : score >= 4 ? '#f59e0b' : '#ef4444';
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-1.5">
        <span className="flex items-center gap-1.5 text-[13px] font-semibold text-text">
          <span>{icon}</span> {label}
        </span>
        <span className="text-[13px] font-bold" style={{ color }}>{score}/10</span>
      </div>
      <div className="h-2 w-full rounded-full overflow-hidden bg-surface-2">
        <motion.div className="h-full rounded-full" style={{ backgroundColor: color }}
          initial={{ width: 0 }} animate={{ width: `${(score / 10) * 100}%` }}
          transition={{ duration: 0.8, delay: 0.2 }} />
      </div>
      <p className="text-[12px] mt-1.5 leading-relaxed text-text-muted">{analysis}</p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main Page                                                                 */
/* -------------------------------------------------------------------------- */
export default function CoupleDashboardPage() {
  const { charts, profiles } = useStore();
  const [chart1Id, setChart1Id] = useState('');
  const [chart2Id, setChart2Id] = useState('');
  const [husbandChartId, setHusbandChartId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<CoupleResultFixed | null>(null);
  const [expandedKoota, setExpandedKoota] = useState<string | null>(null);

  const [history, setHistory] = useState<HistoryItem[]>([]);

  useEffect(() => {
    fetch('/api/couple')
      .then(r => r.json())
      .then(d => { if (d.success) setHistory(d.data); })
      .catch(() => {});
  }, []);

  const chartOptions = useMemo(() => charts.map((c) => {
    const p = profiles.find((p) => p.id === c.profile_id);
    return { value: c.id, label: p ? `${p.name}` : `Chart ${c.id.slice(0, 6)}` };
  }), [charts, profiles]);

  const canSubmit = chart1Id && chart2Id && chart1Id !== chart2Id;

  async function handleAnalyze() {
    if (!canSubmit) return;
    setLoading(true); setError(''); setResult(null);
    try {
      const res = await fetch('/api/couple', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chart1Id, chart2Id, husbandChartId: husbandChartId || chart1Id }),
      });
      if (!res.ok) { const e = await res.json().catch(() => null); throw new Error(e?.error || 'Failed'); }
      const data = await res.json();
      const r = data.data as CoupleResultFixed;
      setResult(r);
      // Refresh history so the new entry appears on next view
      fetch('/api/couple').then(x => x.json()).then(d => { if (d.success) setHistory(d.data); }).catch(() => {});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally { setLoading(false); }
  }

  // Normalise sharedForecast — API may return array or legacy string
  const forecasts: ForecastItem[] = useMemo(() => {
    if (!result?.aiAnalysis?.sharedForecast) return [];
    const sf = result.aiAnalysis.sharedForecast;
    if (Array.isArray(sf)) return sf as ForecastItem[];
    // Legacy string: split into bullets
    return String(sf).split('\n').filter(Boolean).map((line, i) => ({
      timeframe: i === 0 ? 'This Week' : i === 1 ? 'This Month' : '3-Month Outlook',
      icon: i === 0 ? '🌙' : i === 1 ? '🌟' : '🔮',
      narrative: line.replace(/^[-*•]\s*/, ''),
    }));
  }, [result]);

  const accentColor = result ? compatColor(result.ashtakoota.overallCompatibility) : 'var(--primary)';

  return (
    <div className="min-h-screen pb-24">

      {/* ── Header ── */}
      <div className="px-5 pt-6 pb-4">
        <p className="j-eyebrow mb-1">VEDIC ASTROLOGY</p>
        <h1 className="j-display text-[26px] text-text leading-tight">
          Match Making
        </h1>
        <p className="text-[13px] mt-0.5 text-text-muted">
          Deep Kundli compatibility for husband &amp; wife
        </p>
      </div>

      {/* ── History Cards ── */}
      {!result && history.length > 0 && (
        <div className="px-5 mb-4">
          <p className="j-eyebrow mb-2.5">📖 PREVIOUS READINGS</p>
          <div className="space-y-2">
            {history.map((item) => {
              const hColor = item.compatibility === 'excellent' ? '#22c55e'
                : item.compatibility === 'good' ? 'var(--primary)'
                : item.compatibility === 'average' ? '#f59e0b' : '#ef4444';
              const label = item.compatibility.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
              const date = new Date(item.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
              return (
                <button key={item.id}
                  onClick={() => setResult(item.result_data)}
                  className="w-full flex items-center gap-3 rounded-2xl px-4 py-3 bg-surface border border-border text-left cursor-pointer transition-all hover:border-primary/40"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-text truncate">
                      {item.husband_name} <span className="text-base">💕</span> {item.wife_name}
                    </p>
                    <p className="text-[10px] text-text-muted mt-0.5">{date}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-[11px] font-bold px-2.5 py-1 rounded-full"
                      style={{ background: hColor + '18', color: hColor, border: `1px solid ${hColor}30` }}>
                      {label}
                    </span>
                    <span className="text-[13px] font-bold" style={{ color: hColor }}>
                      {item.total_score}/{item.max_score}
                    </span>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Selector Card ── */}
      {!result && (
        <div className="mx-5 rounded-2xl p-5 mb-5 bg-surface border border-border space-y-4">

          {/* Var — Boy */}
          <div>
            <label className="j-eyebrow mb-1.5 block">🤵 Var (Boy's) Details</label>
            <select
              value={chart1Id}
              onChange={e => { setChart1Id(e.target.value); setHusbandChartId(e.target.value); }}
              className="w-full rounded-xl border border-border bg-bg text-text text-[13px] px-3 py-2.5 outline-none focus:border-primary"
            >
              <option value="">— Select boy's chart —</option>
              {chartOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <Link
              href="/kundli/generate"
              className="inline-flex items-center gap-1 mt-2 text-[11px] text-primary no-underline hover:underline"
            >
              + Add &amp; Generate Birth Chart
            </Link>
          </div>

          {/* Vadhu — Girl */}
          <div>
            <label className="j-eyebrow mb-1.5 block">👰 Vadhu (Girl's) Details</label>
            <select
              value={chart2Id}
              onChange={e => setChart2Id(e.target.value)}
              className="w-full rounded-xl border border-border bg-bg text-text text-[13px] px-3 py-2.5 outline-none focus:border-primary"
            >
              <option value="">— Select girl's chart —</option>
              {chartOptions.filter(opt => opt.value !== chart1Id).map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <Link
              href="/kundli/generate"
              className="inline-flex items-center gap-1 mt-2 text-[11px] text-primary no-underline hover:underline"
            >
              + Add &amp; Generate Birth Chart
            </Link>
          </div>

          {error && <p className="text-[12px] text-danger">{error}</p>}

          <button
            onClick={handleAnalyze}
            disabled={!canSubmit || loading}
            className="w-full py-3.5 rounded-2xl font-bold text-[14px] text-bg border-none cursor-pointer transition-all disabled:opacity-40"
            style={{ background: canSubmit ? 'var(--primary)' : 'var(--surface-2)' }}
          >
            {loading ? '✨ Reading the stars…' : 'Reveal Compatibility'}
          </button>
        </div>
      )}

      {/* ── Loading ── */}
      {loading && (
        <div className="px-5 space-y-3 py-4">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      )}

      {/* ── Results ── */}
      <AnimatePresence>
      {result && !loading && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="px-5 space-y-5">

          {/* Hero — Score + Names */}
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
            className="rounded-3xl p-6 text-center bg-surface border border-border">
            <div className="flex items-center justify-center gap-3 mb-4">
              <span className="text-[15px] font-bold text-text">{result.husbandName || result.partner1.name}</span>
              <motion.span
                className="text-2xl inline-block"
                animate={{ scale: [1, 1.35, 1, 1.2, 1] }}
                transition={{ duration: 1.2, repeat: Infinity, repeatDelay: 0.8, ease: 'easeInOut' }}
              >💕</motion.span>
              <span className="text-[15px] font-bold text-text">{result.wifeName || result.partner2.name}</span>
            </div>
            <div className="flex justify-center mb-4">
              <ScoreRing score={result.ashtakoota.totalScore} max={result.ashtakoota.maxTotal} color={accentColor} />
            </div>
            <span className="inline-block px-4 py-1.5 rounded-full text-[13px] font-bold mb-3" style={{ backgroundColor: accentColor + '22', color: accentColor, border: `1px solid ${accentColor}44` }}>
              {result.ashtakoota.overallCompatibility.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}
            </span>
            {result.aiAnalysis.storyOfThem && (
              <p className="j-display text-[13px] leading-relaxed mt-3 text-text">
                "{result.aiAnalysis.storyOfThem}"
              </p>
            )}
            {/* Mangal dosha badges */}
            <div className="flex justify-center gap-2 mt-3 flex-wrap">
              <span className="text-[10px] px-2.5 py-1 rounded-full bg-surface-2 text-text-muted">
                {result.husbandName || 'Husband'}: {result.ashtakoota.mangalMatch.boyManglik ? '🔴 Manglik' : '✅ Non-Manglik'}
              </span>
              <span className="text-[10px] px-2.5 py-1 rounded-full bg-surface-2 text-text-muted">
                {result.wifeName || 'Wife'}: {result.ashtakoota.mangalMatch.girlManglik ? '🔴 Manglik' : '✅ Non-Manglik'}
              </span>
            </div>
          </motion.div>

          {/* Strengths */}
          {result.aiAnalysis.strengthAreas && result.aiAnalysis.strengthAreas.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
              className="rounded-2xl p-4 bg-success/[0.06] border border-success/20">
              <p className="text-[11px] font-bold tracking-wider mb-3 text-success">✨ RELATIONSHIP STRENGTHS</p>
              <div className="flex flex-wrap gap-2">
                {result.aiAnalysis.strengthAreas.map((s, i) => (
                  <span key={i} className="text-[12px] px-3 py-1 rounded-full font-medium"
                    style={{ background: 'rgba(34,197,94,0.12)', color: '#16a34a', border: '1px solid rgba(34,197,94,0.35)' }}>
                    {s}
                  </span>
                ))}
              </div>
            </motion.div>
          )}

          {/* Shared Forecast — Storytelling Cards */}
          {forecasts.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
              <p className="j-eyebrow mb-3">🔭 YOUR STORY TOGETHER</p>
              <div className="space-y-3">
                {forecasts.map((item, i) => (
                  <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 + i * 0.08 }}
                    className="rounded-2xl p-4 flex gap-3 bg-surface border border-border">
                    <div className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-xl bg-primary/10">
                      {item.icon}
                    </div>
                    <div className="flex-1">
                      <p className="text-[11px] font-bold mb-1.5 tracking-wide text-primary">{item.timeframe.toUpperCase()}</p>
                      <p className="j-display text-[13px] leading-relaxed text-text">
                        {item.narrative}
                      </p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Compatibility Zones */}
          {result.aiAnalysis.compatibilityZones && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
              className="rounded-2xl p-5 bg-surface border border-border">
              <p className="j-eyebrow mb-4">❤️ LIFE AREAS</p>
              {result.aiAnalysis.compatibilityZones.romance && <ZoneBar label="Romance" icon="💑" score={result.aiAnalysis.compatibilityZones.romance.score} analysis={result.aiAnalysis.compatibilityZones.romance.analysis} />}
              {result.aiAnalysis.compatibilityZones.career && <ZoneBar label="Career & Ambition" icon="💼" score={result.aiAnalysis.compatibilityZones.career.score} analysis={result.aiAnalysis.compatibilityZones.career.analysis} />}
              {result.aiAnalysis.compatibilityZones.finances && <ZoneBar label="Finances" icon="💰" score={result.aiAnalysis.compatibilityZones.finances.score} analysis={result.aiAnalysis.compatibilityZones.finances.analysis} />}
              {result.aiAnalysis.compatibilityZones.family && <ZoneBar label="Family & Home" icon="🏡" score={result.aiAnalysis.compatibilityZones.family.score} analysis={result.aiAnalysis.compatibilityZones.family.analysis} />}
            </motion.div>
          )}

          {/* Planet Comparison — presentable card list */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.22 }}
            className="rounded-2xl overflow-hidden bg-surface border border-border">
            <div className="px-5 py-4">
              <p className="j-eyebrow mb-1">🌌 PLANETARY MIRROR</p>
              <p className="text-[12px] text-text-muted">Where each star sat at your birth</p>
            </div>
            {/* Header row with two names */}
            <div className="flex border-t border-border bg-bg/50">
              <div className="flex-1 px-4 py-2.5 text-[10px] font-bold tracking-wider text-text-muted">PLANET</div>
              <div className="flex-1 px-3 py-2.5 text-[11px] font-semibold flex items-center gap-1.5 text-primary">
                <span>🤵</span><span className="truncate">{(result.husbandName || result.partner1.name).split(' ')[0]}</span>
              </div>
              <div className="flex-1 px-3 py-2.5 text-[11px] font-semibold flex items-center gap-1.5 text-accent">
                <span>👰</span><span className="truncate">{(result.wifeName || result.partner2.name).split(' ')[0]}</span>
              </div>
            </div>
            {result.partner1.planets.map((p1) => {
              const p2 = result.partner2.planets.find(p => p.planet === p1.planet);
              const meta = PLANET_META[p1.planet];
              const sameSign = p2 && p1.sign === p2.sign;
              if (!meta) return null;
              return (
                <div key={p1.planet} className="flex items-center border-t border-border/40">
                  <div className="flex-1 px-4 py-3 flex items-center gap-2.5">
                    <span className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: meta.color + '22', border: `1px solid ${meta.color}44` }}>
                      <Planet3DInline planet={p1.planet} size={22} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[12px] font-bold text-text">{p1.planet}</p>
                      <p className="text-[9px] truncate text-text-muted">{meta.label}</p>
                    </div>
                  </div>
                  <div className="flex-1 px-3 py-3">
                    <p className="text-[12px] font-medium text-text truncate">
                      {p1.sign} <span className="text-text-muted">{p1.signDegree.toFixed(1)}°</span>
                    </p>
                    <p className="text-[10px] text-text-muted">{p1.nakshatra} · P{p1.nakshatraPada}</p>
                  </div>
                  <div className={`flex-1 px-3 py-3 ${sameSign ? 'bg-success/5' : ''}`}>
                    {p2 ? (
                      <>
                        <p className={`text-[12px] font-medium truncate ${sameSign ? 'text-success' : 'text-text'}`}>
                          {p2.sign} <span className="text-text-muted">{p2.signDegree.toFixed(1)}°</span>
                          {sameSign && <span className="ml-1 text-[9px]">✨</span>}
                        </p>
                        <p className="text-[10px] text-text-muted">{p2.nakshatra} · P{p2.nakshatraPada}</p>
                      </>
                    ) : <span className="text-[11px] text-text-dim">—</span>}
                  </div>
                </div>
              );
            })}
            {/* Ascendant row */}
            <div className="flex items-center border-t border-border/40 bg-primary/[0.03]">
              <div className="flex-1 px-4 py-3 flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-lg flex items-center justify-center text-xs flex-shrink-0 bg-primary/15 border border-primary/30 text-primary">
                  ↑
                </span>
                <div>
                  <p className="text-[12px] font-bold text-text">Ascendant</p>
                  <p className="text-[9px] text-text-muted">Rising sign</p>
                </div>
              </div>
              <div className="flex-1 px-3 py-3">
                <p className="text-[12px] font-medium text-text">{result.partner1.ascendant.sign}</p>
                <p className="text-[10px] text-text-muted">{result.partner1.ascendant.degree.toFixed(1)}°</p>
              </div>
              <div className="flex-1 px-3 py-3">
                <p className="text-[12px] font-medium text-text">{result.partner2.ascendant.sign}</p>
                <p className="text-[10px] text-text-muted">{result.partner2.ascendant.degree.toFixed(1)}°</p>
              </div>
            </div>
          </motion.div>

          {/* Ashtakoota Breakdown — collapsible */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
            className="rounded-2xl overflow-hidden bg-surface border border-border">
            <div className="px-5 py-4">
              <p className="j-eyebrow mb-1">🪐 ASHTAKOOTA HARMONY</p>
              <p className="text-[12px] text-text-muted">Tap any to read its meaning &amp; remedies</p>
            </div>
            {result.ashtakoota.scores.map((k) => {
              const pct = k.score / k.maxScore;
              const kColor = pct >= 0.75 ? '#22c55e' : pct >= 0.5 ? 'var(--primary)' : '#ef4444';
              const isOpen = expandedKoota === k.koota;
              const meta = findKootaMeta(k.koota);
              const compatLabel = k.compatibility
                ? k.compatibility.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
                : pct >= 0.75 ? 'Excellent' : pct >= 0.5 ? 'Good' : 'Needs attention';
              return (
                <div key={k.koota} className="border-t border-border/40">
                  <button onClick={() => setExpandedKoota(isOpen ? null : k.koota)}
                    className="w-full flex items-center gap-3 px-5 py-3 bg-transparent border-none cursor-pointer text-left">
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-[13px] font-semibold text-text">{k.koota}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                            style={{ background: kColor + '18', color: kColor, border: `1px solid ${kColor}30` }}>
                            {compatLabel}
                          </span>
                          <span className="text-[12px] font-bold" style={{ color: kColor }}>{k.score}/{k.maxScore}</span>
                        </div>
                      </div>
                      {meta && <p className="text-[10.5px] text-text-muted mb-1.5">{meta.governs}</p>}
                      <div className="h-1.5 w-full rounded-full overflow-hidden bg-border/60">
                        <div className="h-full rounded-full" style={{ width: `${pct * 100}%`, backgroundColor: kColor }} />
                      </div>
                    </div>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2"
                      style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s', flexShrink: 0 }}>
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>
                  {isOpen && (() => {
                    const polite = politeDescription(k.koota, k.score, k.maxScore, k.description);
                    const remedy = pct < 0.75 ? findRemedy(k.koota) : null;
                    return (
                      <div className="px-5 pb-4 space-y-3">
                        {meta && (
                          <div className="rounded-xl px-3 py-2 bg-surface-2 border border-border/50">
                            <p className="text-[10px] font-bold tracking-wider text-text-muted mb-0.5">WHAT THIS MEANS</p>
                            <p className="text-[12px] text-text-muted">{meta.governs}</p>
                          </div>
                        )}
                        <p className="j-display text-[12.5px] leading-relaxed text-text">
                          {polite}
                        </p>
                        {remedy && (
                          <div className="rounded-xl p-3 bg-primary/[0.06] border border-primary/20">
                            <p className="j-eyebrow mb-2.5">🙏 GENTLE REMEDIES</p>
                            <div className="space-y-2">
                              <div className="flex gap-2.5 items-start">
                                <span className="text-base flex-shrink-0">🪔</span>
                                <p className="text-[12px] leading-relaxed text-text">{remedy.ritual}</p>
                              </div>
                              <div className="flex gap-2.5 items-start">
                                <span className="text-base flex-shrink-0">📿</span>
                                <p className="text-[12px] leading-relaxed text-text">{remedy.mantra}</p>
                              </div>
                              <div className="flex gap-2.5 items-start">
                                <span className="text-base flex-shrink-0">🌿</span>
                                <p className="text-[12px] leading-relaxed text-text">{remedy.lifestyle}</p>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              );
            })}
          </motion.div>

          {/* Conflict Areas */}
          {result.aiAnalysis.conflictAreas && result.aiAnalysis.conflictAreas.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
              className="rounded-2xl p-5 bg-danger/[0.05] border border-danger/20">
              <p className="text-[11px] font-bold tracking-wider mb-3 text-danger">⚡ AREAS TO WATCH</p>
              <div className="space-y-3">
                {result.aiAnalysis.conflictAreas.map((c, i) => (
                  <div key={i} className="flex gap-3">
                    <span className="text-base flex-shrink-0">{c.severity === 'high' ? '🔴' : c.severity === 'medium' ? '🟡' : '🟢'}</span>
                    <div>
                      <p className="text-[13px] font-semibold text-text mb-0.5">{c.area}</p>
                      <p className="text-[12px] leading-relaxed text-text-muted">{c.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Remedies */}
          {result.aiAnalysis.sharedRemedies && result.aiAnalysis.sharedRemedies.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
              className="rounded-2xl p-5 bg-primary/[0.05] border border-primary/20">
              <p className="j-eyebrow mb-3">🙏 SHARED REMEDIES</p>
              <div className="space-y-3">
                {result.aiAnalysis.sharedRemedies.map((r, i) => (
                  <div key={i} className="flex gap-3 items-start">
                    <span className="text-[20px] flex-shrink-0 text-primary">✦</span>
                    <div>
                      <p className="text-[13px] font-semibold text-text">{r.remedy}</p>
                      <p className="text-[12px] mt-0.5 text-text-muted">{r.purpose}</p>
                      <span className="text-[10px] px-2 py-0.5 rounded-full mt-1 inline-block bg-primary/10 text-primary">{r.frequency}</span>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Analyze Again */}
          <button onClick={() => setResult(null)}
            className="w-full py-3 rounded-2xl text-[13px] font-semibold border-none cursor-pointer bg-surface-2 text-text-muted">
            ← Analyze Another Couple
          </button>
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  );
}
