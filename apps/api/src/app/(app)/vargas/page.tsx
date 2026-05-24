'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { useActiveChart } from '@/hooks/useActiveChart';
import { useStore } from '@/store/useStore';
import { SouthIndianChart } from '@/components/charts/SouthIndianChart';
import { NorthIndianChart } from '@/components/charts/NorthIndianChart';
import { DIVISIONAL_CALCULATORS } from '@aroha-astrology/astro-engine/charts/divisional';
import { ZODIAC_SIGNS, type DivisionalChart, type Planet, type ZodiacSign, type HouseData, type PlanetPosition } from '@aroha-astrology/shared';
import { RichText } from '@/components/ui/rich-text';
import { Skeleton, SkeletonCard } from '@/components/ui/skeleton';

// ─── Types ──────────────────────────────────────────────────────────────────

interface VargaDef {
  type: string;
  name: string;
  symbol: string;
  focus: string;
}

interface AnalysisStatus {
  chart_type: string;
  status: 'pending' | 'generating' | 'ready' | 'error';
  generated_at: string | null;
  analysis: string | null;
  key_findings: string[];
}

interface VargaEntry {
  planet: string;
  sign: string;
  signIndex: number;
}

// ─── Static data ─────────────────────────────────────────────────────────────

const VARGA_DEFS: VargaDef[] = [
  { type: 'D1',  symbol: 'D-1',  name: 'Rashi',          focus: 'Overall life, physical body, and general health' },
  { type: 'D2',  symbol: 'D-2',  name: 'Hora',           focus: 'Wealth, liquid assets, and financial prosperity' },
  { type: 'D3',  symbol: 'D-3',  name: 'Drekkana',       focus: 'Siblings, courage, and vitality' },
  { type: 'D4',  symbol: 'D-4',  name: 'Chaturthamsa',   focus: 'Fixed assets, property, and general fortune' },
  { type: 'D7',  symbol: 'D-7',  name: 'Saptamsa',       focus: 'Children, progeny, and grandchildren' },
  { type: 'D9',  symbol: 'D-9',  name: 'Navamsa',        focus: 'Marriage, spouse, and the planet\'s true strength' },
  { type: 'D10', symbol: 'D-10', name: 'Dasamsa',        focus: 'Career, profession, and status in society' },
  { type: 'D12', symbol: 'D-12', name: 'Dwadasamsa',     focus: 'Parents, ancestors, and hereditary traits' },
  { type: 'D16', symbol: 'D-16', name: 'Shodasamsa',     focus: 'Vehicles, luxuries, and comforts' },
  { type: 'D20', symbol: 'D-20', name: 'Vimsamsa',       focus: 'Spiritual progress, religious worship, and mantras' },
  { type: 'D24', symbol: 'D-24', name: 'Chaturvimsamsa', focus: 'Education, academic achievements, and knowledge' },
  { type: 'D27', symbol: 'D-27', name: 'Saptavimshamsa', focus: 'Physical strength, endurance, and stamina' },
  { type: 'D30', symbol: 'D-30', name: 'Trimsamsa',      focus: 'Misfortunes, obstacles, and general mischief' },
  { type: 'D40', symbol: 'D-40', name: 'Khavedamsa',     focus: 'Matrilineal legacy and auspicious effects' },
  { type: 'D45', symbol: 'D-45', name: 'Akshavedamsa',   focus: 'Patrilineal legacy and general character' },
  { type: 'D60', symbol: 'D-60', name: 'Shashtiamsa',    focus: 'Past life karma and deep-rooted destiny' },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: AnalysisStatus['status'] | undefined }) {
  if (!status) {
    return (
      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/[0.04] text-text-secondary/50">
        Not Generated
      </span>
    );
  }
  if (status === 'ready') {
    return (
      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">
        Ready
      </span>
    );
  }
  if (status === 'generating' || status === 'pending') {
    return (
      <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
        Generating…
      </span>
    );
  }
  return (
    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-500/20 text-red-400">
      Error
    </span>
  );
}

function PlanetTable({
  chartType,
  divisionalCharts,
}: {
  chartType: string;
  divisionalCharts: Record<string, VargaEntry[]> | null;
}) {
  const d1 = divisionalCharts?.['D1'] ?? [];
  const varga = divisionalCharts?.[chartType] ?? [];
  const d1Map: Record<string, string> = {};
  for (const e of d1) d1Map[e.planet] = e.sign;

  if (varga.length === 0) return null;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-text-secondary/50 border-b border-white/[0.06]">
            <th className="text-left py-1.5 pr-3 font-semibold">Planet</th>
            <th className="text-left py-1.5 pr-3 font-semibold">D-1 Sign</th>
            <th className="text-left py-1.5 pr-3 font-semibold">{chartType} Sign</th>
            <th className="text-left py-1.5 font-semibold">Strength</th>
          </tr>
        </thead>
        <tbody>
          {varga.map((e) => {
            const d1Sign = d1Map[e.planet] ?? '—';
            const isVargottama = e.sign === d1Sign;
            return (
              <tr key={e.planet} className="border-b border-white/[0.03]">
                <td className="py-1.5 pr-3 font-medium text-text">{e.planet}</td>
                <td className="py-1.5 pr-3 text-text-secondary">{d1Sign}</td>
                <td className="py-1.5 pr-3 text-text-secondary">{e.sign}</td>
                <td className="py-1.5">
                  {isVargottama && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 uppercase tracking-wide">
                      Vargottama
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Build a minimal chartData for the chart components from a single varga's
// planet entries + the natal D1 ascendant longitude. Houses are derived by
// rotating signs from the varga ascendant; planet `house` is the 1-based offset
// from the varga ascendant signIndex.
function buildVargaChartData(
  vargaEntries: VargaEntry[],
  vargaType: DivisionalChart,
  ascLongitude: number,
): { houses: HouseData[]; planets: PlanetPosition[] } {
  const calc = DIVISIONAL_CALCULATORS[vargaType];
  const ascSignIndex = calc(ascLongitude);

  const houses: HouseData[] = Array.from({ length: 12 }, (_, i) => {
    const signIdx = (ascSignIndex + i) % 12;
    return {
      house: i + 1,
      cusp: 0,
      sign: ZODIAC_SIGNS[signIdx] as ZodiacSign,
      signIndex: signIdx,
      lord: 'Sun' as Planet,
      planets: [],
    };
  });

  const planets: PlanetPosition[] = vargaEntries.map((e) => {
    const house = ((e.signIndex - ascSignIndex + 12) % 12) + 1;
    return {
      planet: e.planet as Planet,
      longitude: 0,
      latitude: 0,
      speed: 0,
      sign: e.sign as ZodiacSign,
      signIndex: e.signIndex,
      signDegree: 0,
      nakshatra: 'Ashwini',
      nakshatraIndex: 0,
      nakshatraPada: 1,
      nakshatraLord: 'Ketu' as Planet,
      isRetrograde: false,
      house,
    };
  });

  // Populate house.planets list so North-Indian chart can match them
  for (const p of planets) {
    const h = houses.find((x) => x.house === p.house);
    if (h) h.planets.push(p.planet);
  }

  return { houses, planets };
}

function VargaChart({
  vargaType,
  vargaEntries,
  ascLongitude,
  style,
}: {
  vargaType: DivisionalChart;
  vargaEntries: VargaEntry[];
  ascLongitude: number;
  style: 'north' | 'south';
}) {
  const chartData = useMemo(
    () => buildVargaChartData(vargaEntries, vargaType, ascLongitude),
    [vargaEntries, vargaType, ascLongitude],
  );
  return (
    <div className="flex justify-center">
      {style === 'north' ? (
        <NorthIndianChart chartData={chartData} ascendantHouse={1} title={vargaType} />
      ) : (
        <SouthIndianChart chartData={chartData} ascendantHouse={1} title={vargaType} />
      )}
    </div>
  );
}

function ExpandedAnalysis({
  def,
  analysis,
  divisionalCharts,
  ascLongitude,
  chartStyle,
}: {
  def: VargaDef;
  analysis: AnalysisStatus;
  divisionalCharts: Record<string, VargaEntry[]> | null;
  ascLongitude: number | null;
  chartStyle: 'north' | 'south';
}) {
  const vargaEntries = divisionalCharts?.[def.type] ?? [];

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.25, ease: 'easeInOut' }}
      className="overflow-hidden"
    >
      <div className="pt-3 mt-3 border-t border-white/[0.06] space-y-4">
        {/* Visual kundli */}
        {ascLongitude !== null && vargaEntries.length > 0 && (
          <VargaChart
            vargaType={def.type as DivisionalChart}
            vargaEntries={vargaEntries}
            ascLongitude={ascLongitude}
            style={chartStyle}
          />
        )}

        {/* Planet positions table */}
        <PlanetTable chartType={def.type} divisionalCharts={divisionalCharts} />

        {/* Narrative — bullet points */}
        {analysis.analysis && (
          <div className="space-y-2">
            {analysis.analysis
              .split('\n')
              .map((line) => line.trim())
              .filter((line) => line.startsWith('•') || line.startsWith('-'))
              .map((line, i) => {
                const text = line.replace(/^[•\-]\s*/, '');
                return (
                  <div key={i} className="flex items-start gap-2.5">
                    <span
                      className="flex-shrink-0 mt-[3px] w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold"
                      style={{ background: 'rgba(124,58,237,0.18)', color: '#A78BFA' }}
                    >
                      ✦
                    </span>
                    <p className="text-[12px] text-text-secondary leading-relaxed flex-1">
                      <RichText>{text}</RichText>
                    </p>
                  </div>
                );
              })}
            {/* Fallback: if AI didn't use bullet format, show as plain text */}
            {!analysis.analysis.includes('•') && !analysis.analysis.includes('- ') && (
              <p className="text-[12px] text-text-secondary leading-relaxed">
                <RichText>{analysis.analysis}</RichText>
              </p>
            )}
          </div>
        )}

        {/* Key findings */}
        {analysis.key_findings.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-primary mb-2">
              Key Findings
            </p>
            <ul className="space-y-1.5">
              {analysis.key_findings.map((f, i) => (
                <li key={i} className="flex items-start gap-2 text-[12px] text-text-secondary">
                  <span className="mt-1 flex-shrink-0 w-1.5 h-1.5 rounded-full bg-primary/60" />
                  {f}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function VargasPage() {
  const { activeChart, activeProfile, dataReady, charts, profiles, setActiveChartId } = useActiveChart();
  const setCharts = useStore((s) => s.setCharts);
  const setProfiles = useStore((s) => s.setProfiles);
  const chartStyle = useStore((s) => s.chartStyle);

  const [analyses, setAnalyses] = useState<Record<string, AnalysisStatus>>({});
  const [loadingStatuses, setLoadingStatuses] = useState(false);
  const [generatingSet, setGeneratingSet] = useState<Set<string>>(new Set());
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [chartDropdownOpen, setChartDropdownOpen] = useState(false);
  const [chartFetched, setChartFetched] = useState(false);
  const [fullChartData, setFullChartData] = useState<Record<string, VargaEntry[]> | null>(null);
  const [ascLongitude, setAscLongitude] = useState<number | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const kundliChartId = activeChart?.id ?? null;
  // divisional_charts isn't loaded by AuthProvider — fetched on demand below
  const divisionalCharts = fullChartData;

  // Always refresh from /api/kundli + /api/profiles on mount — AuthProvider's
  // direct supabase-js query can be empty/stale even when the user has charts.
  // Same pattern profile page uses.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [chartsRes, profilesRes] = await Promise.all([
          fetch('/api/kundli'),
          fetch('/api/profiles'),
        ]);
        if (cancelled) return;
        if (chartsRes.ok) {
          const j = await chartsRes.json();
          if (Array.isArray(j.data)) setCharts(j.data);
        }
        if (profilesRes.ok) {
          const j = await profilesRes.json();
          if (Array.isArray(j.data)) setProfiles(j.data);
        }
      } catch (e) {
        console.error('[vargas] kundli/profile refresh failed:', e);
      } finally {
        if (!cancelled) setChartFetched(true);
      }
    })();
    return () => { cancelled = true; };
  }, [setCharts, setProfiles]);

  // Fetch full chart (with divisional_charts JSONB + ascendant) when active chart changes
  useEffect(() => {
    if (!kundliChartId) { setFullChartData(null); setAscLongitude(null); return; }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/kundli/${kundliChartId}`);
        if (!res.ok) return;
        const j = await res.json();
        if (cancelled) return;
        const chart = j?.data?.chart ?? j?.data ?? null;
        const dc = (chart?.divisionalCharts ?? chart?.divisional_charts ?? null) as Record<string, VargaEntry[]> | null;
        setFullChartData(dc);
        const asc = (chart?.chartData?.ascendant ?? chart?.chart_data?.ascendant) as { longitude?: number; signIndex?: number; degree?: number } | undefined;
        // Prefer raw longitude; fall back to signIndex*30 + degree if absent
        const lng =
          typeof asc?.longitude === 'number'
            ? asc.longitude
            : (typeof asc?.signIndex === 'number' && typeof asc?.degree === 'number')
              ? asc.signIndex * 30 + asc.degree
              : null;
        setAscLongitude(lng);
      } catch (e) {
        console.error('[vargas] fetch divisional_charts failed:', e);
      }
    })();
    return () => { cancelled = true; };
  }, [kundliChartId]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!chartDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setChartDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [chartDropdownOpen]);

  // Reset expanded card when switching kundli
  useEffect(() => { setExpandedCard(null); }, [kundliChartId]);

  // Load existing analysis statuses
  const loadStatuses = useCallback(async () => {
    if (!kundliChartId) return;
    setLoadingStatuses(true);
    try {
      const res = await fetch(`/api/divisional-charts/${kundliChartId}`);
      if (!res.ok) return;
      const json = await res.json() as { analyses: AnalysisStatus[] };
      const map: Record<string, AnalysisStatus> = {};
      for (const a of json.analyses) map[a.chart_type] = a;
      setAnalyses(map);
    } finally {
      setLoadingStatuses(false);
    }
  }, [kundliChartId]);

  useEffect(() => {
    if (kundliChartId) void loadStatuses();
  }, [kundliChartId, loadStatuses]);

  // Poll pending/generating rows until they resolve
  useEffect(() => {
    const hasPending = Object.values(analyses).some(
      (a) => a.status === 'pending' || a.status === 'generating',
    );
    if (!hasPending) return;
    const t = setTimeout(() => void loadStatuses(), 4000);
    return () => clearTimeout(t);
  }, [analyses, loadStatuses]);

  const triggerGenerate = async (chartType: string) => {
    if (!kundliChartId) return;
    if (generatingSet.has(chartType)) return;

    setGeneratingSet((s) => new Set(s).add(chartType));
    // Optimistic update
    setAnalyses((prev) => ({
      ...prev,
      [chartType]: { chart_type: chartType, status: 'pending', generated_at: null, analysis: null, key_findings: [] },
    }));

    try {
      await fetch('/api/divisional-charts/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kundliChartId, chartType }),
      });
    } catch (e) {
      console.error('[vargas] generate failed:', e);
    } finally {
      setGeneratingSet((s) => { const n = new Set(s); n.delete(chartType); return n; });
    }
  };

  const generateAllMissing = async () => {
    const missing = VARGA_DEFS
      .filter((d) => !analyses[d.type] || analyses[d.type].status === 'error')
      .map((d) => d.type);
    for (const ct of missing) {
      await triggerGenerate(ct);
      // Small stagger to avoid hammering the API
      await new Promise((r) => setTimeout(r, 300));
    }
  };

  // ─── Loading state — skeleton mirrors the final layout ──────────────────

  if (!dataReady || !chartFetched) {
    return (
      <div className="px-3 pb-24 pt-4 max-w-2xl mx-auto space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2 flex-1 min-w-0">
            <Skeleton height={20} width={176} />
            <Skeleton height={12} width={128} />
          </div>
          <Skeleton height={40} width={144} rounded="12px" />
        </div>
        <SkeletonCard />
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>
    );
  }

  // ─── Empty state ──────────────────────────────────────────────────────────

  if (!activeChart) {
    return (
      <div className="min-h-[calc(100dvh-164px)] flex flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-4xl">🔭</p>
        <p className="text-lg font-semibold text-text">No birth chart found</p>
        <p className="text-sm text-text-secondary max-w-xs">
          Generate your Kundli first to explore divisional charts.
        </p>
        <Link
          href="/kundli/generate"
          className="mt-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-primary text-white no-underline"
        >
          Generate Kundli
        </Link>
      </div>
    );
  }

  const readyCount = Object.values(analyses).filter((a) => a.status === 'ready').length;
  const missingCount = VARGA_DEFS.filter(
    (d) => !analyses[d.type] || analyses[d.type].status === 'error',
  ).length;

  return (
    <div className="px-3 pb-24 pt-4 max-w-2xl mx-auto space-y-4">
      {/* Header with kundli switcher */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-start justify-between gap-3"
      >
        <div className="space-y-1 min-w-0">
          <h1 className="text-xl font-bold text-text">Divisional Charts</h1>
          <p className="text-[13px] text-text-secondary truncate">
            Varga Kundli analysis
          </p>
        </div>

        {/* Kundli dropdown */}
        {charts.length > 0 && (
          <div ref={dropdownRef} className="relative flex-shrink-0">
            <button
              onClick={() => setChartDropdownOpen((v) => !v)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-left transition-colors"
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: `1px solid ${chartDropdownOpen ? 'rgba(226,179,64,0.5)' : 'rgba(226,179,64,0.2)'}`,
                backdropFilter: 'blur(12px)',
              }}
            >
              <span className="text-base">🪐</span>
              <div className="text-left">
                <p className="text-[11px] font-bold text-text leading-tight max-w-[110px] truncate">
                  {activeProfile?.name ?? `Chart #${(kundliChartId ?? '').slice(0, 6)}`}
                </p>
                <p className="text-[9px] text-text-secondary leading-tight">
                  {activeProfile?.dob ?? 'Birth Chart'}
                </p>
              </div>
              <svg
                width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                className="text-primary transition-transform"
                style={{ transform: chartDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            <AnimatePresence>
              {chartDropdownOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.97 }}
                  transition={{ duration: 0.18 }}
                  className="absolute right-0 top-full mt-1.5 w-56 rounded-xl overflow-hidden shadow-2xl z-20 glass-3"
                  style={{ border: '1px solid rgba(212, 175, 55,0.22)' }}
                >
                  <div className="px-3 py-2" style={{ borderBottom: '1px solid rgba(212, 175, 55,0.12)' }}>
                    <p className="text-[10px] font-semibold text-primary uppercase tracking-widest">Select Chart</p>
                  </div>
                  {charts.map((c) => {
                    const prof = profiles.find((p) => p.id === c.profile_id);
                    const isActive = c.id === kundliChartId;
                    return (
                      <button
                        key={c.id}
                        onClick={() => { setActiveChartId(c.id); setChartDropdownOpen(false); }}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors cursor-pointer border-none"
                        style={{
                          background: isActive ? 'rgba(212, 175, 55,0.10)' : 'transparent',
                          borderBottom: '1px solid rgba(0,0,0,0.06)',
                        }}
                      >
                        <div
                          className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-sm"
                          style={{
                            background: isActive ? 'rgba(212, 175, 55,0.18)' : 'rgba(0,0,0,0.04)',
                            border: isActive ? '1px solid rgba(212, 175, 55,0.35)' : '1px solid var(--border)',
                            color: isActive ? 'var(--primary)' : 'inherit',
                          }}
                        >
                          {isActive ? '✓' : '🪐'}
                        </div>
                        <div className="min-w-0">
                          <p className="text-[12px] font-semibold text-text truncate">
                            {prof?.name ?? `Chart #${c.id.slice(0, 6)}`}
                          </p>
                          <p className="text-[10px] text-text-secondary">{prof?.dob ?? ''}</p>
                        </div>
                      </button>
                    );
                  })}
                  <Link
                    href="/kundli/generate"
                    onClick={() => setChartDropdownOpen(false)}
                    className="flex items-center gap-2 px-3 py-2.5 no-underline transition-colors"
                    style={{ borderTop: '1px solid rgba(212, 175, 55,0.10)' }}
                  >
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-sm font-bold"
                      style={{ background: 'rgba(212, 175, 55,0.10)', border: '1px solid rgba(212, 175, 55,0.25)', color: 'var(--text)' }}>
                      +
                    </div>
                    <span className="text-[12px] font-semibold text-primary">New Kundli</span>
                  </Link>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </motion.div>

      {/* Summary bar */}
      {!loadingStatuses && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-surface px-3.5 py-2.5"
        >
          <p className="text-[12px] text-text-secondary">
            <span className="font-semibold text-text">{readyCount}</span> / {VARGA_DEFS.length} analyses ready
          </p>
          {missingCount > 0 && (
            <button
              onClick={() => void generateAllMissing()}
              className="text-[11px] font-semibold text-primary hover:text-primary/80 transition-colors"
            >
              Generate All Missing ({missingCount})
            </button>
          )}
        </motion.div>
      )}

      {/* Chart cards */}
      <div className="space-y-2">
        {VARGA_DEFS.map((def, i) => {
          const status = analyses[def.type];
          const isExpanded = expandedCard === def.type;
          const isReady = status?.status === 'ready';
          const isPendingOrGenerating =
            status?.status === 'pending' || status?.status === 'generating';

          return (
            <motion.div
              key={def.type}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className="rounded-xl overflow-hidden"
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: `1px solid ${isReady ? 'rgba(226,179,64,0.18)' : 'rgba(255,255,255,0.06)'}`,
              }}
            >
              <div className="p-3">
                <div className="flex items-start gap-3">
                  {/* Symbol badge */}
                  <div
                    className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center"
                    style={{
                      background: isReady ? 'rgba(226,179,64,0.12)' : 'rgba(124,58,237,0.10)',
                      border: `1px solid ${isReady ? 'rgba(226,179,64,0.28)' : 'rgba(124,58,237,0.22)'}`,
                    }}
                  >
                    <span className="text-[10px] font-bold" style={{ color: isReady ? '#E2B340' : '#A78BFA' }}>{def.symbol}</span>
                  </div>

                  {/* Name & focus */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[13px] font-semibold text-text">{def.name}</span>
                      <StatusBadge status={status?.status} />
                    </div>
                    <p className="text-[11px] text-text-secondary/70 mt-0.5 leading-snug line-clamp-2">
                      {def.focus}
                    </p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 mt-2.5">
                  {isReady && (
                    <button
                      onClick={() => setExpandedCard(isExpanded ? null : def.type)}
                      className="text-[11px] font-semibold px-3 py-1.5 rounded-lg transition-colors"
                      style={{ background: 'rgba(226,179,64,0.12)', border: '1px solid rgba(226,179,64,0.28)', color: '#E2B340' }}
                    >
                      {isExpanded ? 'Collapse' : 'View Analysis'}
                    </button>
                  )}

                  {!isPendingOrGenerating && !isReady && (
                    <button
                      onClick={() => void triggerGenerate(def.type)}
                      disabled={generatingSet.has(def.type)}
                      className="text-[11px] font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                      style={{ background: 'rgba(124,58,237,0.10)', border: '1px solid rgba(124,58,237,0.22)', color: '#A78BFA' }}
                    >
                      Generate Analysis
                    </button>
                  )}

                  {isPendingOrGenerating && (
                    <span className="text-[11px] text-amber-400/70 flex items-center gap-1.5">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                      Processing…
                    </span>
                  )}

                  {isReady && (
                    <button
                      onClick={() => void triggerGenerate(def.type)}
                      className="text-[11px] text-text-secondary/70 hover:text-text-secondary/90 transition-colors"
                    >
                      Regenerate
                    </button>
                  )}
                </div>
              </div>

              {/* Expandable analysis */}
              <AnimatePresence>
                {isExpanded && isReady && (
                  <div className="px-3 pb-3">
                    <ExpandedAnalysis
                      def={def}
                      analysis={status}
                      divisionalCharts={divisionalCharts}
                      ascLongitude={ascLongitude}
                      chartStyle={chartStyle}
                    />
                  </div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
