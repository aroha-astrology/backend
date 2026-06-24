'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loading } from '@/components/ui/loading';
import { Skeleton } from '@/components/ui/skeleton';
import { INDIAN_CITIES, type CityData } from '@aroha-astrology/shared';
import { motion, AnimatePresence } from 'framer-motion';
import { MotionPage, FadeIn, StaggerList, StaggerItem, ScrollReveal, CountUp } from '@/components/ui/motion-primitives';

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

interface SavedChart {
  id: string;
  birth_profiles: {
    id: string;
    name: string;
    dob: string;
    tob: string;
    pob: string;
    latitude: number;
    longitude: number;
    timezone: string;
    gender: string;
  } | null;
}

interface PersonForm {
  name: string;
  dob: string;
  tob: string;
  pob: string;
  pobCity: CityData | null;
  gender: 'male' | 'female';
}

interface KootaScore {
  name: string;
  obtained: number;
  max: number;
  description: string;
}

interface MatchResult {
  totalScore: number;
  maxScore: number;
  verdict: string;
  verdictColor: string;
  kootas: KootaScore[];
  boyMangalDosha: { present: boolean; description: string };
  girlMangalDosha: { present: boolean; description: string };
  narrative: string;
  remedies: string[];
}

type MatchSystem = 'ashtakoota' | 'dashakoota';
type MatchMode = 'open' | 'new';

/* -------------------------------------------------------------------------- */
/*  City Autocomplete                                                         */
/* -------------------------------------------------------------------------- */

function CityAutocomplete({
  value,
  onChange,
  onSelect,
  label,
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  onSelect: (city: CityData) => void;
  label: string;
  id: string;
}) {
  const [open, setOpen] = useState(false);
  const [pincodeResults, setPincodeResults] = useState<CityData[]>([]);
  const [pincodeLoading, setPincodeLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const isPincode = /^\d{6}$/.test(value.trim());

  const filtered = useMemo(() => {
    if (isPincode || !value || value.length < 2) return [];
    const q = value.toLowerCase();
    return INDIAN_CITIES.filter(
      (c) => c.name.toLowerCase().includes(q) || c.state.toLowerCase().includes(q),
    ).slice(0, 8);
  }, [value, isPincode]);

  useEffect(() => {
    if (!isPincode) {
      setPincodeResults([]);
      return;
    }
    setPincodeLoading(true);
    fetch(`/api/location/pincode?pincode=${value.trim()}`)
      .then((r) => r.json())
      .then((data) => {
        setPincodeResults(data.results || []);
        if ((data.results || []).length > 0) setOpen(true);
      })
      .catch(() => setPincodeResults([]))
      .finally(() => setPincodeLoading(false));
  }, [isPincode, value]);

  const displayList = isPincode ? pincodeResults : filtered;

  return (
    <div className="relative w-full" ref={ref}>
      <div className="relative">
        <Input
          id={id}
          label={label}
          value={value}
          placeholder="City name or 6-digit pincode (India)"
          autoComplete="off"
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
        />
        {pincodeLoading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <Skeleton width={14} height={14} rounded="50%" />
          </div>
        )}
      </div>
      {open && displayList.length > 0 && (
        <ul className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-border bg-surface shadow-lg">
          {displayList.map((city) => (
            <li
              key={`${city.name}-${city.state}`}
              className="cursor-pointer px-3 py-2 text-sm text-text hover:bg-primary/10"
              onMouseDown={() => {
                onSelect(city);
                onChange(`${city.name}, ${city.state}`);
                setOpen(false);
              }}
            >
              <span className="font-medium">{city.name}</span>
              {isPincode && (
                <span className="ml-1.5 text-xs text-text-secondary/70">{value.trim()}</span>
              )}
              ,{' '}
              <span className="text-text-secondary">{city.state}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Circular Progress                                                         */
/* -------------------------------------------------------------------------- */

function CircularProgress({
  score,
  max,
  size = 160,
  color,
}: {
  score: number;
  max: number;
  size?: number;
  color: string;
}) {
  const radius = (size - 16) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = score / max;
  const offset = circumference * (1 - pct);

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          className="text-border"
          strokeWidth={10}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={10}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-1000"
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <CountUp value={score} className="text-2xl font-bold text-text" />
        <span className="text-xs text-text-secondary">/ {max}</span>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Saved Kundli Picker (OPEN KUNDLI tab)                                     */
/* -------------------------------------------------------------------------- */

function SavedChartPicker({
  title,
  emoji,
  savedCharts,
  selectedChartId,
  onSelectChart,
  side,
}: {
  title: string;
  emoji: string;
  savedCharts: SavedChart[];
  selectedChartId: string;
  onSelectChart: (chartId: string) => void;
  side: 'boy' | 'girl';
}) {
  const chartsWithProfiles = savedCharts.filter((c) => c.birth_profiles);
  const selectedChart = chartsWithProfiles.find((c) => c.id === selectedChartId);

  return (
    <div className="flex-1 rounded-2xl glass-2 overflow-hidden" style={{ border: '1px solid rgba(212, 175, 55,0.16)' }}>
      <div className="px-4 py-3 border-b" style={{ borderColor: 'rgba(212, 175, 55,0.12)' }}>
        <h3 className="font-[family-name:var(--font-serif)] text-sm font-bold text-text tracking-wide flex items-center gap-2">
          <span>{emoji}</span> {title}
        </h3>
      </div>
      <div className="p-4 space-y-3">
        <div className="relative">
          <select
            value={selectedChartId}
            onChange={(e) => onSelectChart(e.target.value)}
            className="w-full rounded-xl px-3 py-2.5 text-sm font-medium transition-all appearance-none cursor-pointer pr-8"
            style={{
              background: selectedChartId ? 'rgba(212, 175, 55,0.12)' : 'rgba(0,0,0,0.04)',
              border: `1px solid ${selectedChartId ? 'rgba(212, 175, 55,0.40)' : 'rgba(212, 175, 55,0.18)'}`,
              color: selectedChartId ? 'var(--text)' : 'var(--text-secondary)',
              outline: 'none',
            }}
          >
            <option value="">— Select {side === 'boy' ? "boy's" : "girl's"} kundli —</option>
            {chartsWithProfiles.map((c) => (
              <option key={c.id} value={c.id}>
                {c.birth_profiles!.name} ({c.birth_profiles!.dob})
              </option>
            ))}
          </select>
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary text-xs">▾</span>
        </div>

        <AnimatePresence>
          {selectedChart?.birth_profiles ? (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.25 }}
              className="rounded-xl p-3 space-y-2"
              style={{ background: 'rgba(212, 175, 55,0.08)', border: '1px solid rgba(212, 175, 55,0.22)' }}
            >
              <div className="flex items-center gap-2">
                <span className="text-base">{selectedChart.birth_profiles.gender === 'male' ? '♂' : '♀'}</span>
                <span className="font-semibold text-sm text-text">{selectedChart.birth_profiles.name}</span>
                <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full font-medium" style={{
                  background: 'rgba(212, 175, 55,0.15)',
                  color: 'var(--text)',
                }}>
                  Kundli Ready
                </span>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                <div>
                  <p className="text-[10px] text-text-secondary uppercase tracking-wider mb-0.5">Date of Birth</p>
                  <p className="text-xs font-medium text-text">{selectedChart.birth_profiles.dob}</p>
                </div>
                <div>
                  <p className="text-[10px] text-text-secondary uppercase tracking-wider mb-0.5">Time of Birth</p>
                  <p className="text-xs font-medium text-text">{selectedChart.birth_profiles.tob}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-[10px] text-text-secondary uppercase tracking-wider mb-0.5">Place of Birth</p>
                  <p className="text-xs font-medium text-text">{selectedChart.birth_profiles.pob}</p>
                </div>
              </div>
            </motion.div>
          ) : (
            <p className="text-[11px] text-text-secondary text-center py-2">
              {chartsWithProfiles.length === 0
                ? 'No saved kundlis yet — switch to "New Matching" to enter details directly.'
                : 'Choose a saved kundli from the list above.'}
            </p>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Manual Entry Form (NEW MATCHING tab)                                      */
/* -------------------------------------------------------------------------- */

function ManualEntryForm({
  title,
  emoji,
  person,
  setPerson,
}: {
  title: string;
  emoji: string;
  person: PersonForm;
  setPerson: (p: PersonForm) => void;
}) {
  return (
    <div className="flex-1 rounded-2xl glass-2 overflow-hidden" style={{ border: '1px solid rgba(212, 175, 55,0.16)' }}>
      <div className="px-4 py-3 border-b" style={{ borderColor: 'rgba(212, 175, 55,0.12)' }}>
        <h3 className="font-[family-name:var(--font-serif)] text-sm font-bold text-text tracking-wide flex items-center gap-2">
          <span>{emoji}</span> {title}
        </h3>
      </div>
      <div className="p-4 space-y-3">
        <Input
          id={`${title}-name`}
          label="Full Name"
          placeholder="Enter name"
          value={person.name}
          onChange={(e) => setPerson({ ...person, name: e.target.value })}
        />
        <Input
          id={`${title}-dob`}
          label="Date of Birth"
          type="date"
          value={person.dob}
          onChange={(e) => setPerson({ ...person, dob: e.target.value })}
        />
        <Input
          id={`${title}-tob`}
          label="Time of Birth"
          type="time"
          value={person.tob}
          onChange={(e) => setPerson({ ...person, tob: e.target.value })}
        />
        <CityAutocomplete
          id={`${title}-pob`}
          label="Place of Birth"
          value={person.pob}
          onChange={(v) => setPerson({ ...person, pob: v, pobCity: null })}
          onSelect={(city) => setPerson({ ...person, pob: `${city.name}, ${city.state}`, pobCity: city })}
        />
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Gender</label>
          <div className="flex gap-2.5">
            {(['male', 'female'] as const).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setPerson({ ...person, gender: g })}
                className="flex-1 rounded-xl px-3 py-2 text-sm font-medium transition-all cursor-pointer border-none"
                style={{
                  background: person.gender === g ? 'rgba(212, 175, 55,0.15)' : 'rgba(0,0,0,0.03)',
                  border: `1px solid ${person.gender === g ? 'rgba(212, 175, 55,0.45)' : 'rgba(0,0,0,0.10)'}`,
                  color: person.gender === g ? 'var(--primary)' : 'var(--text-secondary)',
                }}
              >
                {g === 'male' ? '♂ Male' : '♀ Female'}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main Page                                                                 */
/* -------------------------------------------------------------------------- */

const emptyPerson = (gender: 'male' | 'female'): PersonForm => ({
  name: '',
  dob: '',
  tob: '',
  pob: '',
  pobCity: null,
  gender,
});

export default function MatchNewPage() {
  const [mode, setMode] = useState<MatchMode>('open');
  const [boy, setBoy] = useState<PersonForm>(emptyPerson('male'));
  const [girl, setGirl] = useState<PersonForm>(emptyPerson('female'));
  const [system, setSystem] = useState<MatchSystem>('ashtakoota');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<MatchResult | null>(null);
  const [error, setError] = useState('');
  const [savedCharts, setSavedCharts] = useState<SavedChart[]>([]);
  const [boyChartId, setBoyChartId] = useState('');
  const [girlChartId, setGirlChartId] = useState('');

  useEffect(() => {
    fetch('/api/kundli')
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          const charts: SavedChart[] = d.data ?? [];
          setSavedCharts(charts);
          // If the user has no saved kundlis, default to manual entry so
          // they don't land on an empty OPEN KUNDLI tab.
          if (charts.filter((c) => c.birth_profiles).length === 0) {
            setMode('new');
          }
        }
      })
      .catch(() => {});
  }, []);

  function applyChartToPerson(chartId: string, setPerson: (p: PersonForm) => void, defaultGender: 'male' | 'female') {
    const chart = savedCharts.find((c) => c.id === chartId);
    if (!chart?.birth_profiles) return;
    const p = chart.birth_profiles;
    setPerson({
      name: p.name ?? '',
      dob: p.dob ?? '',
      tob: p.tob ?? '',
      pob: p.pob ?? '',
      pobCity: p.latitude && p.longitude
        ? { name: p.pob ?? '', state: '', latitude: p.latitude, longitude: p.longitude, timezone: p.timezone ?? 'Asia/Kolkata' }
        : null,
      gender: (p.gender as 'male' | 'female') ?? defaultGender,
    });
  }

  function handleBoyChartSelect(chartId: string) {
    setBoyChartId(chartId);
    if (chartId) applyChartToPerson(chartId, setBoy, 'male');
    else setBoy(emptyPerson('male'));
  }

  function handleGirlChartSelect(chartId: string) {
    setGirlChartId(chartId);
    if (chartId) applyChartToPerson(chartId, setGirl, 'female');
    else setGirl(emptyPerson('female'));
  }

  const boyManualReady = boy.name && boy.dob && boy.tob && boy.pobCity;
  const girlManualReady = girl.name && girl.dob && girl.tob && girl.pobCity;
  const canSubmit = mode === 'open'
    ? Boolean(boyChartId && girlChartId)
    : Boolean(boyManualReady && girlManualReady);

  async function handleSubmit() {
    if (!canSubmit) return;
    setLoading(true);
    setError('');
    setResult(null);

    try {
      const res = await fetch('/api/match/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile1: {
            name: boy.name,
            dob: boy.dob,
            tob: boy.tob,
            pob: boy.pob,
            latitude: boy.pobCity!.latitude,
            longitude: boy.pobCity!.longitude,
            timezone: boy.pobCity!.timezone,
            gender: boy.gender,
          },
          profile2: {
            name: girl.name,
            dob: girl.dob,
            tob: girl.tob,
            pob: girl.pob,
            latitude: girl.pobCity!.latitude,
            longitude: girl.pobCity!.longitude,
            timezone: girl.pobCity!.timezone,
            gender: girl.gender,
          },
          system,
          // OPEN mode references already-saved kundlis. NEW mode is one-off
          // and must NOT persist new birth_profiles per user requirement.
          saveProfiles: mode === 'open',
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error || 'Failed to calculate match');
      }

      const data = await res.json();
      const raw = data.data as {
        totalScore: number;
        maxScore: number;
        scores: Record<string, { obtained: number; max: number; description: string }>;
        detailedAnalysis: {
          overallVerdict?: string;
          summaryNarrative?: string;
          remediesIfNeeded?: string[];
          mangalDoshaAnalysis?: string;
        };
      };

      // Derive verdict string from overallVerdict
      const verdictRaw = raw.detailedAnalysis?.overallVerdict ?? '';
      const verdict = verdictRaw.toLowerCase().includes('excellent') ? 'Excellent'
        : verdictRaw.toLowerCase().includes('good') ? 'Good'
        : verdictRaw.toLowerCase().includes('average') ? 'Average'
        : verdictRaw.toLowerCase().includes('poor') || verdictRaw.toLowerCase().includes('not recommended') ? 'Poor'
        : verdictRaw || (raw.totalScore >= 28 ? 'Excellent' : raw.totalScore >= 18 ? 'Good' : raw.totalScore >= 10 ? 'Average' : 'Poor');

      // Build kootas array from scores object
      const kootas: KootaScore[] = Object.entries(raw.scores ?? {})
        .filter(([key]) => !['totalScore', 'maxScore', 'mangalMatch'].includes(key))
        .map(([name, val]) => ({
          name,
          obtained: typeof val === 'object' && val !== null ? (val.obtained ?? 0) : 0,
          max: typeof val === 'object' && val !== null ? (val.max ?? 0) : 0,
          description: typeof val === 'object' && val !== null ? (val.description ?? '') : '',
        }));

      const mangalText = raw.detailedAnalysis?.mangalDoshaAnalysis ?? '';
      setResult({
        totalScore: raw.totalScore,
        maxScore: raw.maxScore,
        verdict,
        verdictColor: getVerdictColor(verdict),
        kootas,
        boyMangalDosha: { present: mangalText.toLowerCase().includes('boy') && mangalText.toLowerCase().includes('manglik'), description: mangalText },
        girlMangalDosha: { present: mangalText.toLowerCase().includes('girl') && mangalText.toLowerCase().includes('manglik'), description: mangalText },
        narrative: raw.detailedAnalysis?.summaryNarrative ?? '',
        remedies: raw.detailedAnalysis?.remediesIfNeeded ?? [],
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  function getVerdictColor(verdict: string): string {
    switch (verdict?.toLowerCase()) {
      case 'excellent':
        return 'var(--color-success, #22c55e)';
      case 'good':
        return 'var(--primary)';
      case 'average':
        return 'var(--color-warning, #eab308)';
      case 'below average':
        return 'var(--color-warning, #f97316)';
      case 'poor':
        return 'var(--color-error, #ef4444)';
      default:
        return 'var(--primary)';
    }
  }

  function getVerdictBadgeVariant(verdict: string) {
    switch (verdict?.toLowerCase()) {
      case 'excellent':
        return 'success' as const;
      case 'good':
        return 'default' as const;
      case 'average':
        return 'warning' as const;
      case 'below average':
      case 'poor':
        return 'error' as const;
      default:
        return 'default' as const;
    }
  }

  return (
    <MotionPage className="mx-auto max-w-5xl px-4 py-6 min-h-screen">
      {/* Header */}
      <FadeIn className="mb-5">
        <p className="text-[10px] font-semibold tracking-[0.2em] text-primary/70 uppercase mb-1">Vedic Astrology</p>
        <h1 className="text-2xl font-bold text-text font-[family-name:var(--font-serif)] md:text-3xl tracking-wide">Kundli Matching</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Check compatibility between two horoscopes using traditional Vedic matching systems
        </p>
      </FadeIn>

      {/* System Selector */}
      <FadeIn delay={0.05}>
        <div className="mb-4 rounded-2xl glass-2 p-4" style={{ border: '1px solid rgba(212, 175, 55,0.16)' }}>
          <p className="text-[10px] text-text-secondary uppercase tracking-wider font-semibold mb-3">Matching System</p>
          <div className="flex gap-2.5">
            {[
              { id: 'ashtakoota', label: 'Ashtakoota', sub: '36 Gun Milan (North Indian)' },
              { id: 'dashakoota', label: 'Dashakoota', sub: '10 Porutham (South Indian)' },
            ].map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSystem(s.id as MatchSystem)}
                className="flex-1 rounded-xl px-3 py-2.5 text-center text-sm font-medium transition-all cursor-pointer border-none"
                style={{
                  background: system === s.id ? 'rgba(212, 175, 55,0.15)' : 'rgba(0,0,0,0.03)',
                  border: `1px solid ${system === s.id ? 'rgba(212, 175, 55,0.45)' : 'rgba(0,0,0,0.08)'}`,
                  boxShadow: system === s.id ? '0 0 12px rgba(212, 175, 55,0.12)' : 'none',
                }}
              >
                <div className="font-semibold" style={{ color: system === s.id ? 'var(--primary)' : 'var(--text-secondary)' }}>{s.label}</div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{s.sub}</div>
              </button>
            ))}
          </div>
        </div>
      </FadeIn>

      {/* Mode tabs — OPEN KUNDLI vs NEW MATCHING */}
      <FadeIn delay={0.08}>
        <div className="mb-4 grid grid-cols-2 gap-0 rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(212, 175, 55,0.16)' }}>
          {([
            { id: 'open', label: 'Open Kundli', sub: 'Pick from saved' },
            { id: 'new', label: 'New Matching', sub: 'Enter details' },
          ] as const).map((t) => {
            const active = mode === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setMode(t.id)}
                className="relative px-3 py-3 text-center transition-all cursor-pointer border-none"
                style={{
                  background: active ? 'rgba(212, 175, 55,0.12)' : 'rgba(0,0,0,0.04)',
                  boxShadow: active ? 'inset 0 -2px 0 0 var(--primary)' : 'none',
                }}
              >
                <div className="text-sm font-bold tracking-wide" style={{ color: active ? 'var(--primary)' : 'var(--text-secondary)' }}>
                  {t.label.toUpperCase()}
                </div>
                <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>{t.sub}</div>
              </button>
            );
          })}
        </div>
      </FadeIn>

      {/* Per-mode panels — Boy + Girl, side-by-side on md+, stacked on mobile */}
      <FadeIn delay={0.1}>
        <AnimatePresence mode="wait">
          {mode === 'open' ? (
            <motion.div
              key="open"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2 }}
              className="mb-4 grid gap-4 md:grid-cols-2"
            >
              <SavedChartPicker
                title="Var (Boy's) Kundli"
                emoji="🤵"
                savedCharts={savedCharts}
                selectedChartId={boyChartId}
                onSelectChart={handleBoyChartSelect}
                side="boy"
              />
              <SavedChartPicker
                title="Vadhu (Girl's) Kundli"
                emoji="👰"
                savedCharts={savedCharts}
                selectedChartId={girlChartId}
                onSelectChart={handleGirlChartSelect}
                side="girl"
              />
            </motion.div>
          ) : (
            <motion.div
              key="new"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2 }}
              className="mb-4 grid gap-4 md:grid-cols-2"
            >
              <ManualEntryForm
                title="Var (Boy's) Details"
                emoji="🤵"
                person={boy}
                setPerson={setBoy}
              />
              <ManualEntryForm
                title="Vadhu (Girl's) Details"
                emoji="👰"
                person={girl}
                setPerson={setGirl}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </FadeIn>

      {/* Matchmaking button — enabled only when both sides are ready */}
      <AnimatePresence>
        {canSubmit && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.25 }}
          >
            <FadeIn delay={0.15}>
              <div className="mb-5 flex justify-center">
                <Button size="xl" onClick={handleSubmit} isLoading={loading} disabled={loading}>
                  Begin Matchmaking
                </Button>
              </div>
            </FadeIn>
          </motion.div>
        )}
      </AnimatePresence>

      {error && (
        <Card className="mb-4 border-error/50">
          <CardContent className="py-3 text-center text-error">{error}</CardContent>
        </Card>
      )}

      {loading && (
        <div className="py-10">
          <Loading size="lg" section="marriage" />
        </div>
      )}

      {/* Results */}
      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.4 }}
            className="space-y-4"
          >
            {/* Score Overview */}
            <div className="rounded-2xl glass-3 relative overflow-hidden" style={{ border: '1px solid rgba(212, 175, 55,0.25)' }}>
              <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-primary to-transparent" />
              <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(212, 175, 55,0.08) 0%, transparent 60%)' }} />
              <div className="relative flex flex-col items-center gap-4 py-6 md:flex-row md:justify-center md:gap-10">
                <CircularProgress
                  score={result.totalScore}
                  max={result.maxScore}
                  size={160}
                  color={getVerdictColor(result.verdict)}
                />
                <div className="text-center md:text-left">
                  <div className="mb-2 inline-block rounded-full px-3 py-1 text-sm font-bold" style={{
                    background: 'rgba(212, 175, 55,0.15)',
                    border: '1px solid rgba(212, 175, 55,0.35)',
                    color: 'var(--text)',
                  }}>
                    {result.verdict}
                  </div>
                  <p className="mt-2 text-base text-text">
                    <CountUp value={result.totalScore} /> out of {result.maxScore} points
                  </p>
                  <p className="text-sm text-text-secondary">
                    {boy.name} &amp; {girl.name}
                  </p>
                </div>
              </div>
            </div>

            {/* Koota Scores */}
            <div className="rounded-2xl glass-2 overflow-hidden" style={{ border: '1px solid rgba(212, 175, 55,0.16)' }}>
              <div className="px-4 py-3 border-b" style={{ borderColor: 'rgba(212, 175, 55,0.12)' }}>
                <h2 className="font-[family-name:var(--font-serif)] text-sm font-bold text-text tracking-wide">Koota-wise Scores</h2>
                <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>Individual compatibility factors</p>
              </div>
              <div className="p-4">
                <StaggerList className="space-y-3">
                  {result.kootas.map((k) => {
                    const pct = (k.obtained / k.max) * 100;
                    return (
                      <StaggerItem key={k.name}>
                        <div className="mb-1 flex items-center justify-between text-sm">
                          <span className="font-medium text-text">{k.name}</span>
                          <span className="text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
                            {k.obtained} / {k.max}
                          </span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: 'rgba(0,0,0,0.08)' }}>
                          <motion.div
                            className="h-full rounded-full"
                            initial={{ width: 0 }}
                            animate={{ width: `${pct}%` }}
                            transition={{ duration: 0.7, delay: 0.2 }}
                            style={{
                              background: pct >= 75
                                ? 'linear-gradient(90deg, #16a34a, #22c55e)'
                                : pct >= 50
                                  ? 'linear-gradient(90deg, var(--primary-ink), var(--primary))'
                                  : 'linear-gradient(90deg, #b91c1c, #ef4444)',
                            }}
                          />
                        </div>
                        <p className="mt-0.5 text-[11px] text-text-secondary">{k.description}</p>
                      </StaggerItem>
                    );
                  })}
                </StaggerList>
              </div>
            </div>

            {/* Mangal Dosha */}
            <div className="grid gap-4 md:grid-cols-2">
              {[
                { name: boy.name, dosha: result.boyMangalDosha },
                { name: girl.name, dosha: result.girlMangalDosha },
              ].map(({ name, dosha }, idx) => (
                <FadeIn key={name} delay={idx * 0.1}>
                  <div className="rounded-2xl glass-1 overflow-hidden" style={{ border: `1px solid ${dosha.present ? 'rgba(239,68,68,0.25)' : 'rgba(34,197,94,0.20)'}` }}>
                    <div className="px-4 py-3 border-b" style={{ borderColor: dosha.present ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.12)' }}>
                      <h3 className="font-[family-name:var(--font-serif)] text-sm font-bold text-text tracking-wide flex items-center gap-2">
                        <span>{dosha.present ? '🔴' : '🟢'}</span>
                        {name} — Mangal Dosha
                      </h3>
                    </div>
                    <div className="p-4">
                      <div className="mb-2 inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold" style={{
                        background: dosha.present ? 'rgba(239,68,68,0.12)' : 'rgba(34,197,94,0.12)',
                        border: `1px solid ${dosha.present ? 'rgba(239,68,68,0.30)' : 'rgba(34,197,94,0.30)'}`,
                        color: dosha.present ? '#ef4444' : '#22c55e',
                      }}>
                        {dosha.present ? 'Present' : 'Absent'}
                      </div>
                      <p className="text-xs text-text-secondary">{dosha.description}</p>
                    </div>
                  </div>
                </FadeIn>
              ))}
            </div>

            {/* Narrative */}
            <ScrollReveal>
              <div className="rounded-2xl glass-2 overflow-hidden" style={{ border: '1px solid rgba(212, 175, 55,0.16)' }}>
                <div className="px-4 py-3 border-b" style={{ borderColor: 'rgba(212, 175, 55,0.12)' }}>
                  <h2 className="font-[family-name:var(--font-serif)] text-sm font-bold text-text tracking-wide">Detailed Compatibility Analysis</h2>
                </div>
                <div className="p-4">
                  <p className="whitespace-pre-line text-xs leading-relaxed text-text-secondary">{result.narrative}</p>
                </div>
              </div>
            </ScrollReveal>

            {/* Remedies */}
            {result.remedies && result.remedies.length > 0 && (
              <ScrollReveal>
                <div className="rounded-2xl glass-3 relative overflow-hidden" style={{ border: '1px solid rgba(212, 175, 55,0.25)' }}>
                  <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-primary to-transparent" />
                  <div className="px-4 py-3 border-b relative" style={{ borderColor: 'rgba(212, 175, 55,0.12)' }}>
                    <h2 className="font-[family-name:var(--font-serif)] text-sm font-bold text-text tracking-wide">🙏 Suggested Remedies</h2>
                    <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>These remedies may help strengthen compatibility</p>
                  </div>
                  <div className="relative p-4">
                    <StaggerList className="space-y-2">
                      {result.remedies.map((r, i) => (
                        <StaggerItem key={i}>
                          <div className="flex items-start gap-2 text-xs text-text-secondary">
                            <span className="mt-0.5 flex-shrink-0" style={{ color: 'var(--text)' }}>✦</span>
                            {r}
                          </div>
                        </StaggerItem>
                      ))}
                    </StaggerList>
                  </div>
                </div>
              </ScrollReveal>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </MotionPage>
  );
}
