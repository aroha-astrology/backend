'use client';

import { useState, useEffect, useRef, useCallback, Suspense, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { MotionPage, FadeIn, StaggerList, StaggerItem, ScrollReveal } from '@/components/ui/motion-primitives';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Loading } from '@/components/ui/loading';
import { useStore } from '@/store/useStore';
import { useActiveChart } from '@/hooks/useActiveChart';
import { INDIAN_CITIES, type CityData } from '@aroha-astrology/shared';
import { createBrowserClient } from '@supabase/ssr';
import { ensurePushSubscribed } from '@/lib/push/client';
import { useTokenToast } from '@/components/ui/TokenToast';

const reportTiers = [
  {
    id: 'basic',
    label: 'Basic Report',
    pages: 15,
    features: [
      'Birth chart with Lagna, Rashi, Navamsa',
      'Planetary positions and aspects',
      'Basic Dasha analysis (current period)',
      'General personality overview',
      'Lucky numbers, colors, and gemstones',
    ],
  },
  {
    id: 'standard',
    label: 'Standard Report',
    pages: 50,
    popular: true,
    features: [
      'Everything in Basic',
      'Detailed Vimshottari Dasha (10 years)',
      'Career analysis with planetary yogas',
      'Marriage & relationship compatibility',
      'Health predictions by house analysis',
      'Financial outlook and wealth yogas',
      'Transit analysis for current year',
    ],
  },
  {
    id: 'premium',
    label: 'Premium Report',
    pages: 100,
    features: [
      'Everything in Standard',
      'Full Vimshottari Dasha (lifetime)',
      'KP system analysis',
      'Divisional charts (D1 to D60)',
      'Detailed Ashtakavarga analysis',
      'Year-by-year predictions (5 years)',
      'Remedial measures and mantras',
      'Gemstone recommendations with timings',
      'Muhurta suggestions for major life events',
      'AI-powered personalized narrative',
    ],
  },
];

type ReportStatus = 'idle' | 'generating' | 'ready' | 'error';
type ActiveTab = 'kundli' | 'numerology';

function PremiumReportsPageInner() {
  const { activeChartId, setActiveChartId, charts, profiles, activeProfile, dataReady } = useActiveChart();
  const setProfiles = useStore((s) => s.setProfiles);
  const setCharts = useStore((s) => s.setCharts);
  const searchParams = useSearchParams();
  const { showSuccess } = useTokenToast();
  const [activeTab, setActiveTab] = useState<ActiveTab>('numerology');

  // Fallback: if dataReady but store is still empty (safety timer beat Supabase),
  // fetch directly so the kundli selector populates.
  const [fallbackChecked, setFallbackChecked] = useState(false);
  useEffect(() => {
    if (!dataReady || fallbackChecked) return;
    if (profiles.length > 0 && charts.length > 0) { setFallbackChecked(true); return; }
    Promise.all([
      fetch('/api/profiles').then(r => r.ok ? r.json() : null).catch(() => null),
      fetch('/api/kundli').then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([profilesRes, kundliRes]) => {
      if (profilesRes?.data?.length) setProfiles(profilesRes.data);
      if (kundliRes?.data?.length) setCharts(kundliRes.data);
      setFallbackChecked(true);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataReady]);

  // --- Kundli report state ---
  const [selectedTier, setSelectedTier] = useState('');
  const [selectedProfile, setSelectedProfile] = useState(
    searchParams.get('chartId') ?? activeChartId ?? ''
  );
  const [status, setStatus] = useState<ReportStatus>('idle');
  const [downloadUrl, setDownloadUrl] = useState('');
  const [error, setError] = useState('');
  const [generating, setGenerating] = useState(false);


  // --- Numerology report state ---
  const [numName, setNumName] = useState('');
  const [numDob, setNumDob] = useState('');
  const [numGender, setNumGender] = useState<'male' | 'female'>('male');
  const [numBirthCity, setNumBirthCity] = useState('');
  const [numCurrentCity, setNumCurrentCity] = useState('');
  // City autocomplete for numerology
  const [birthCityQuery, setBirthCityQuery] = useState('');
  const [currentCityQuery, setCurrentCityQuery] = useState('');
  const [showBirthDropdown, setShowBirthDropdown] = useState(false);
  const [showCurrentDropdown, setShowCurrentDropdown] = useState(false);
  const birthCityRef = useRef<HTMLDivElement>(null);
  const currentCityRef = useRef<HTMLDivElement>(null);
  const filteredBirthCities = useMemo(() => {
    if (birthCityQuery.length < 2) return [];
    const q = birthCityQuery.toLowerCase();
    return INDIAN_CITIES.filter(c => c.name.toLowerCase().includes(q) || c.state.toLowerCase().includes(q)).slice(0, 8);
  }, [birthCityQuery]);
  const filteredCurrentCities = useMemo(() => {
    if (currentCityQuery.length < 2) return [];
    const q = currentCityQuery.toLowerCase();
    return INDIAN_CITIES.filter(c => c.name.toLowerCase().includes(q) || c.state.toLowerCase().includes(q)).slice(0, 8);
  }, [currentCityQuery]);
  const [numMaritalStatus, setNumMaritalStatus] = useState('single');
  const [numConcern, setNumConcern] = useState('career');
  const [numOccupation, setNumOccupation] = useState('');
  const [numPalmImage, setNumPalmImage] = useState<string | null>(null);
  const [numPalmHand, setNumPalmHand] = useState<'left' | 'right'>('right');
  const [numStatus, setNumStatus] = useState<ReportStatus>('idle');
  const [numError, setNumError] = useState('');
  const [numGenerating, setNumGenerating] = useState(false);
  const [numReportId, setNumReportId] = useState<string | undefined>(undefined);
  const [numDownloadUrl, setNumDownloadUrl] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 5-tap unlock state (set by dashboard tile). Persisted in localStorage so
  // the user only has to unlock once. autostart query param signals a fresh
  // unlock from the dashboard — used to trigger immediate auto-generation.
  const [numerologyUnlocked, setNumerologyUnlocked] = useState(false);
  useEffect(() => {
    try { setNumerologyUnlocked(localStorage.getItem('numerology_unlocked') === '1'); } catch { /* ignore */ }
  }, []);
  const autoFiredRef = useRef(false);

  // Helpers: keep the in-progress report id in the URL so refresh can resume.
  const setReportIdInUrl = useCallback((id: string | null) => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (id) url.searchParams.set('reportId', id);
    else url.searchParams.delete('reportId');
    window.history.replaceState({}, '', url.toString());
  }, []);

  // Close city dropdowns on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (birthCityRef.current && !birthCityRef.current.contains(e.target as Node)) setShowBirthDropdown(false);
      if (currentCityRef.current && !currentCityRef.current.contains(e.target as Node)) setShowCurrentDropdown(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const pollStatus = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/reports/status/${id}`);
      if (!res.ok) return;
      const json = await res.json();
      if (json.data.status === 'ready') {
        setStatus('ready');
        setDownloadUrl(json.data.download_url);
        if (pollRef.current) clearInterval(pollRef.current);
      } else if (json.data.status === 'error') {
        setStatus('error');
        setError('Report generation failed. Please try again.');
        if (pollRef.current) clearInterval(pollRef.current);
      }
    } catch {
      // continue polling
    }
  }, []);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // -------------------------------------------------------------------------
  // Kundli report handler — fire-and-forget + polling (same as numerology)
  // -------------------------------------------------------------------------
  const [kundliReportId, setKundliReportId] = useState<string | undefined>(undefined);
  const [kundliProgress, setKundliProgress] = useState<string | null>(null);
  const kundliPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const kundliChannelRef = useRef<{ channel: ReturnType<ReturnType<typeof createBrowserClient>['channel']>; client: ReturnType<typeof createBrowserClient> } | null>(null);

  const stopKundliTracking = useCallback(() => {
    if (kundliPollRef.current) {
      clearInterval(kundliPollRef.current);
      kundliPollRef.current = null;
    }
    if (kundliChannelRef.current) {
      try { kundliChannelRef.current.client.removeChannel(kundliChannelRef.current.channel); } catch { /* ignore */ }
      kundliChannelRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => { stopKundliTracking(); };
  }, [stopKundliTracking]);

  // Subscribe to Realtime + start fallback polling for a kundli report.
  // Reused by the generate handler and the URL recovery effect.
  const startKundliTracking = useCallback((repId: string) => {
    stopKundliTracking();

    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );

    const channel = supabase
      .channel(`report-${repId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'generated_reports',
        filter: `id=eq.${repId}`,
      }, (payload) => {
        const row = payload.new as { status: string; pdf_url?: string; error_message?: string };
        if (row.error_message) setKundliProgress(row.error_message);
        if (row.status === 'ready' && row.pdf_url) {
          stopKundliTracking();
          setStatus('ready');
          setDownloadUrl(row.pdf_url);
        } else if (row.status === 'error') {
          stopKundliTracking();
          setStatus('error');
          setError('Report generation failed. Please try again.');
        }
      })
      .subscribe();

    kundliChannelRef.current = { channel, client: supabase };

    kundliPollRef.current = setInterval(async () => {
      try {
        const sRes = await fetch(`/api/reports/status/${repId}`);
        if (!sRes.ok) return;
        const sJson = await sRes.json() as { data: { status: string; download_url?: string; progress?: string } };
        if (sJson.data.progress) setKundliProgress(sJson.data.progress);
        if (sJson.data.status === 'ready' && sJson.data.download_url) {
          stopKundliTracking();
          setStatus('ready');
          setDownloadUrl(sJson.data.download_url);
        } else if (sJson.data.status === 'error') {
          stopKundliTracking();
          setStatus('error');
          setError('Report generation failed. Please try again.');
        }
      } catch { /* continue polling */ }
    }, 8_000);
  }, [stopKundliTracking]);

  const handleGenerate = async () => {
    if (!selectedTier || !selectedProfile) {
      setError('Please select both a report type and a birth profile.');
      return;
    }

    setGenerating(true);
    setError('');
    setStatus('generating');

    try {
      const res = await fetch('/api/reports/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier: selectedTier, chartId: selectedProfile }),
      });

      if (!res.ok) throw new Error('Failed to start generation');
      const json = await res.json() as { success: boolean; data: { report_id: string } };
      const repId = json.data?.report_id;
      if (!repId) throw new Error('No report ID returned');

      setKundliReportId(repId);
      setReportIdInUrl(repId);
      setGenerating(false);

      // Fire-and-forget: subscribe to Web Push so the user is notified
      // even if they close the tab before the report finishes.
      ensurePushSubscribed().catch(() => { /* non-fatal */ });

      startKundliTracking(repId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate report.');
      setStatus('error');
      setGenerating(false);
    }
  };

  // -------------------------------------------------------------------------
  // Numerology PDF handler — fires background job, polls for completion
  // -------------------------------------------------------------------------
  const handleNumerologyGenerate = async () => {
    if (!numName.trim() || !numDob || !numGender) {
      setNumError('Please fill in all fields.');
      return;
    }

    setNumGenerating(true);
    setNumError('');
    setNumStatus('generating');

    try {
      const res = await fetch('/api/numerology/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: numName.trim(),
          dob: numDob,
          gender: numGender,
          birthCity: numBirthCity.trim() || undefined,
          currentCity: numCurrentCity.trim() || undefined,
          maritalStatus: numMaritalStatus,
          concern: numConcern,
          occupation: numOccupation.trim() || undefined,
          palmImage: numPalmImage || undefined,
          palmHand: numPalmHand,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error((errJson as { error?: string }).error ?? 'Failed to start report generation');
      }

      const json = await res.json() as { success: boolean; data: { report_id: string; status: string } };
      const reportId = json.data?.report_id;
      if (!reportId) throw new Error('No report ID returned');

      setNumReportId(reportId);
      setReportIdInUrl(reportId);
      setNumGenerating(false);
      ensurePushSubscribed().catch(() => { /* non-fatal */ });
      startNumPolling(reportId);
    } catch (e) {
      setNumError(e instanceof Error ? e.message : 'Failed to generate report. Please try again.');
      setNumStatus('error');
      setNumGenerating(false);
    }
  };

  // Auto-generate variant: skips the form and uses the user's active birth
  // profile. Called by the autostart effect below when the 5-tap unlock fires.
  // Persists the generated reportId in localStorage so future visits resume
  // the same report instead of burning another Dhanam.
  const handleNumerologyAutoGenerate = useCallback(async () => {
    if (!activeProfile) return;
    setNumGenerating(true);
    setNumError('');
    setNumStatus('generating');
    try {
      const res = await fetch('/api/numerology/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: activeProfile.name,
          dob: activeProfile.dob,
          gender: activeProfile.gender as 'male' | 'female',
          birthCity: activeProfile.pob || undefined,
          currentCity: activeProfile.pob || undefined,
        }),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error((errJson as { error?: string }).error ?? 'Failed to start report generation');
      }
      const json = await res.json() as { success: boolean; data: { report_id: string; status: string } };
      const reportId = json.data?.report_id;
      if (!reportId) throw new Error('No report ID returned');
      setNumReportId(reportId);
      setReportIdInUrl(reportId);
      try { localStorage.setItem('numerology_last_report_id', reportId); } catch { /* ignore */ }
      setNumGenerating(false);
      ensurePushSubscribed().catch(() => { /* non-fatal */ });
      startNumPolling(reportId);
    } catch (e) {
      setNumError(e instanceof Error ? e.message : 'Failed to generate report. Please try again.');
      setNumStatus('error');
      setNumGenerating(false);
    }
  }, [activeProfile, setReportIdInUrl]);

  // Autostart effect: when the user opened this page via the 5-tap unlock,
  // resume their last report if one exists, otherwise fire generation
  // immediately. Runs at most once per page load.
  useEffect(() => {
    if (autoFiredRef.current) return;
    if (activeTab !== 'numerology') return;
    if (!numerologyUnlocked) return;
    if (searchParams.get('reportId')) return; // recovery effect owns this case
    if (numStatus !== 'idle') return;
    if (!dataReady) return; // wait for store hydration

    // Resume an existing report if we have one cached.
    let lastId: string | null = null;
    try { lastId = localStorage.getItem('numerology_last_report_id'); } catch { /* ignore */ }
    if (lastId) {
      autoFiredRef.current = true;
      setReportIdInUrl(lastId);
      // The recovery effect (above) keys on searchParams.get('reportId'), but
      // it only runs once on mount. Trigger status fetch + polling directly.
      (async () => {
        try {
          const r = await fetch(`/api/numerology/report/status/${lastId}`);
          if (!r.ok) {
            // Cached id is stale — clear it and let a fresh generation fire
            // on the next visit.
            try { localStorage.removeItem('numerology_last_report_id'); } catch { /* ignore */ }
            autoFiredRef.current = false;
            return;
          }
          const j = await r.json() as { data: { status: string; download_url?: string | null } };
          setNumReportId(lastId);
          if (j.data.status === 'ready' && j.data.download_url) {
            setNumStatus('ready');
            setNumDownloadUrl(j.data.download_url);
          } else if (j.data.status === 'error') {
            setNumStatus('error');
            setNumError('Previous report generation failed. Tap below to retry.');
          } else {
            setNumStatus('generating');
            startNumPolling(lastId);
          }
        } catch { /* ignore — user can manually retry */ }
      })();
      return;
    }

    // No cached report and we have a profile — fire generation.
    if (activeProfile) {
      autoFiredRef.current = true;
      handleNumerologyAutoGenerate();
    }
  }, [activeTab, numerologyUnlocked, searchParams, numStatus, dataReady, activeProfile, handleNumerologyAutoGenerate, setReportIdInUrl]);

  const startNumPolling = (reportId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/numerology/report/status/${reportId}`);
        if (!res.ok) return;
        const json = await res.json() as { data: { status: string; download_url?: string } };
        const { status: s, download_url } = json.data;
        if (s === 'ready' && download_url) {
          if (pollRef.current) clearInterval(pollRef.current);
          setNumStatus('ready');
          setNumDownloadUrl(download_url);
        } else if (s === 'error') {
          if (pollRef.current) clearInterval(pollRef.current);
          setNumStatus('error');
          setNumError('Report generation failed. Please try again.');
        }
      } catch { /* continue polling */ }
    }, 10_000);
  };

  // -------------------------------------------------------------------------
  // Resume on refresh: if ?reportId is in the URL, fetch its status and
  // restore the matching tab into 'generating'/'ready'/'error' state.
  // -------------------------------------------------------------------------
  const recoveredRef = useRef(false);
  useEffect(() => {
    if (recoveredRef.current) return;
    const reportId = searchParams.get('reportId');
    if (!reportId) return;
    recoveredRef.current = true;

    let cancelled = false;
    (async () => {
      // Try kundli first; if it 404s, try numerology.
      try {
        const kRes = await fetch(`/api/reports/status/${reportId}`);
        if (kRes.ok) {
          const kJson = await kRes.json() as {
            data: {
              status: string;
              download_url?: string | null;
              progress?: string | null;
              report_type?: string | null;
              tier?: string | null;
              chart_id?: string | null;
            }
          };
          const d = kJson.data;
          const isKundli = (d.report_type ?? '').startsWith('kundli_');
          if (isKundli && !cancelled) {
            setActiveTab('kundli');
            setKundliReportId(reportId);
            if (d.tier) setSelectedTier(d.tier);
            if (d.chart_id) setSelectedProfile(d.chart_id);

            if (d.status === 'ready' && d.download_url) {
              setStatus('ready');
              setDownloadUrl(d.download_url);
            } else if (d.status === 'error') {
              setStatus('error');
              setError('Report generation failed. Please try again.');
            } else {
              setStatus('generating');
              if (d.progress) setKundliProgress(d.progress);
              startKundliTracking(reportId);
            }
            return;
          }
        }

        // Numerology fallback
        const nRes = await fetch(`/api/numerology/report/status/${reportId}`);
        if (!nRes.ok || cancelled) return;
        const nJson = await nRes.json() as { data: { status: string; download_url?: string | null } };
        const nd = nJson.data;
        setActiveTab('numerology');
        setNumReportId(reportId);
        if (nd.status === 'ready' && nd.download_url) {
          setNumStatus('ready');
          setNumDownloadUrl(nd.download_url);
        } else if (nd.status === 'error') {
          setNumStatus('error');
          setNumError('Report generation failed. Please try again.');
        } else {
          setNumStatus('generating');
          startNumPolling(reportId);
        }
      } catch {
        // If recovery fails, drop the param so the user can start fresh.
        setReportIdInUrl(null);
      }
    })();

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedTierData = reportTiers.find((t) => t.id === selectedTier);

  const kundliProgressUI = (() => {
    if (!kundliProgress) return null;
    const aiMatch = kundliProgress.match(/AI\s+(\d+)\/(\d+):\s*(.+)/);
    if (!aiMatch) return <p className="mt-3 text-xs text-primary">{kundliProgress}</p>;
    const done = parseInt(aiMatch[1] ?? '0');
    const total = parseInt(aiMatch[2] ?? '0');
    const section = aiMatch[3] ?? '';
    const pct = Math.round((done / total) * 100);
    return (
      <>
        <p className="mt-3 text-xs font-medium text-primary">
          Crafting: {section} ({done}/{total} chapters)
        </p>
        <div className="mx-auto mt-2.5 h-2.5 w-72 overflow-hidden rounded-full bg-surface border border-primary/20">
          <div className="h-full rounded-full bg-primary transition-all duration-700" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-1.5 text-[10px] text-text-secondary">{pct}% complete — Yogi Baba is writing your cosmic story</p>
      </>
    );
  })();

  return (
    <MotionPage className="min-h-screen mx-auto max-w-5xl px-3 py-4 bg-bg">
      <h1 className="mb-1.5 text-xl font-bold font-[family-name:var(--font-serif)] text-text">Premium Reports</h1>
      <p className="mb-4 text-xs text-text-secondary">
        Comprehensive astrology and numerology reports powered by AI.
      </p>


      {/* ================================================================ */}
      {/* NUMEROLOGY REPORT TAB                                             */}
      {/* (Kundli reports removed from this page)                           */}
      {/* ================================================================ */}
      {false && (
        <>
          {status === 'idle' && (
            <>
              <StaggerList className="mb-5 grid gap-4 md:grid-cols-3">
                {reportTiers.map((tier) => (
                  <StaggerItem key={tier.id}>
                    <Card
                      className={`relative cursor-pointer transition-all ${
                        selectedTier === tier.id
                          ? 'border-primary ring-1 ring-primary/30'
                          : 'hover:border-primary/30'
                      } ${'popular' in tier && tier.popular ? 'md:-mt-2 md:mb-2' : ''}`}
                      onClick={() => setSelectedTier(tier.id)}
                    >
                      {'popular' in tier && tier.popular && (
                        <Badge className="absolute -top-2.5 left-1/2 -translate-x-1/2">
                          Most Popular
                        </Badge>
                      )}
                      <CardHeader>
                        <CardTitle className="text-center font-[family-name:var(--font-serif)]">{tier.label}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="mb-3 text-center">
                          <p className="text-xl font-bold text-primary">Free</p>
                          <p className="text-xs text-text-secondary">{tier.pages} pages</p>
                        </div>
                        <ul className="space-y-1.5">
                          {tier.features.map((f, i) => (
                            <li key={i} className="flex items-start gap-1.5 text-xs text-text-secondary">
                              <span className="mt-0.5 text-success">+</span>
                              {f}
                            </li>
                          ))}
                        </ul>
                        <Button
                          variant={selectedTier === tier.id ? 'default' : 'outline'}
                          className="mt-4 w-full"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedTier(tier.id);
                          }}
                        >
                          {selectedTier === tier.id ? 'Selected' : 'Select'}
                        </Button>
                      </CardContent>
                    </Card>
                  </StaggerItem>
                ))}
              </StaggerList>

              <ScrollReveal>
                <Card>
                  <CardHeader>
                    <CardTitle className="font-[family-name:var(--font-serif)]">Generate Kundli Report</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {!dataReady || !fallbackChecked ? (
                      <div className="flex items-center gap-2 text-xs text-text-secondary py-2">
                        <Skeleton width={14} height={14} rounded="50%" />
                        Loading your profiles…
                      </div>
                    ) : profiles.length === 0 ? (
                      <p className="text-xs text-text-secondary">
                        No birth profiles found. Please{' '}
                        <a href="/kundli/generate" className="text-primary hover:underline">
                          create a birth profile
                        </a>{' '}
                        first.
                      </p>
                    ) : charts.length > 0 ? (
                      <Select
                        label="Select Kundli Chart"
                        options={charts.map((c) => {
                          const p = profiles.find((pr) => pr.id === c.profile_id);
                          return {
                            value: c.id,
                            label: `${p?.name ?? 'Unknown'} (${p?.dob ? new Date(p.dob).toLocaleDateString('en-IN') : 'N/A'})`,
                          };
                        })}
                        value={selectedProfile}
                        onChange={(e) => { setSelectedProfile(e.target.value); if (e.target.value) setActiveChartId(e.target.value); }}
                        placeholder="Choose a Kundli chart"
                      />
                    ) : profiles.length > 0 ? (
                      <div className="rounded-lg border border-warning/30 bg-warning/5 p-2.5 text-xs text-warning">
                        No Kundli charts generated yet. <a href="/kundli/generate" className="underline font-semibold">Generate a Kundli first</a>, then come back to create the report.
                      </div>
                    ) : (
                      <div className="rounded-lg border border-warning/30 bg-warning/5 p-2.5 text-xs text-warning">
                        No birth profiles found. <a href="/kundli/generate" className="underline font-semibold">Create a Kundli</a> to get started.
                      </div>
                    )}

                    {selectedTierData && (
                      <div className="rounded-lg bg-surface p-2.5 text-xs">
                        <div className="flex justify-between">
                          <span className="text-text-secondary">Report Type</span>
                          <span className="font-medium text-text">{selectedTierData?.label}</span>
                        </div>
                        <div className="mt-0.5 flex justify-between">
                          <span className="text-text-secondary">Pages</span>
                          <span className="font-medium text-text">{selectedTierData?.pages}</span>
                        </div>
                        <div className="mt-0.5 flex justify-between">
                          <span className="text-text-secondary">Price</span>
                          <span className="font-bold text-primary">Free</span>
                        </div>
                      </div>
                    )}

                    {error && <p className="text-xs text-error">{error}</p>}

                    <Button
                      onClick={handleGenerate}
                      isLoading={generating}
                      disabled={!selectedTier || !selectedProfile || charts.length === 0 || !dataReady || !fallbackChecked}
                      className="w-full"
                      size="lg"
                    >
                      Generate Report {selectedTierData ? `— ${selectedTierData?.label}` : ''}
                    </Button>
                  </CardContent>
                </Card>
              </ScrollReveal>
            </>
          )}

          {status === 'generating' && (
            <FadeIn>
              <Card className="py-12 text-center">
                <CardContent>
                  <Loading size="lg" />
                  <p className="mt-3 text-base font-semibold text-text">Generating your Kundli report...</p>
                  <p className="mt-1.5 text-xs text-text-secondary">
                    AI is analyzing your birth chart across 7 sections: planets, houses, yogas, doshas, dasha periods, career, relationships, and remedies.
                  </p>

                  {/* Progress bar */}
                  {kundliProgressUI ?? (
                    <>
                      <p className="mt-3 text-[10px] text-text-secondary">
                        Starting your cosmic journey... Yogi Baba is reading the stars.
                      </p>
                      <div className="mx-auto mt-2.5 h-2.5 w-72 overflow-hidden rounded-full bg-surface border border-primary/20">
                        <div className="h-full animate-pulse rounded-full bg-primary/40" style={{ width: '5%' }} />
                      </div>
                    </>
                  )}

                  <div className="mt-4 mx-auto max-w-xs rounded-xl bg-surface-2 border border-primary/15 p-3">
                    <p className="text-[11px] font-semibold text-text mb-1">⏳ Usually ready in 5–10 minutes</p>
                    <p className="text-[10px] text-text-secondary leading-relaxed">
                      Your report runs 20 AI analyses in parallel — each section is crafted as a rich, personalised story.
                    </p>
                  </div>
                  <p className="mt-2.5 text-[10px] text-text-secondary/50">
                    You&apos;ll be notified the moment it&apos;s ready — feel free to close this page and come back later.
                  </p>
                </CardContent>
              </Card>
            </FadeIn>
          )}


          {status === 'error' && (
            <FadeIn>
              <Card className="py-10 text-center">
                <CardContent>
                  <span className="text-4xl">❌</span>
                  <p className="mt-3 text-error text-sm">{error}</p>
                  <Button
                    className="mt-3"
                    onClick={() => {
                      setStatus('idle');
                      setError('');
                      setKundliReportId(undefined);
                      setKundliProgress(null);
                      setReportIdInUrl(null);
                    }}
                  >
                    Try Again
                  </Button>
                </CardContent>
              </Card>
            </FadeIn>
          )}
        </>
      )}

      {/* ================================================================ */}
      {/* NUMEROLOGY REPORT TAB                                             */}
      {/* ================================================================ */}
      {(
        <>
          {(numStatus === 'idle' || numStatus === 'error') && (
            <div className="grid gap-5 md:grid-cols-2">
              <ScrollReveal>
                <Card className="py-10 text-center">
                  <CardContent>
                    {!numerologyUnlocked ? (
                      <>
                        <span className="text-3xl">🔒</span>
                        <p className="mt-3 text-base font-semibold text-text">Numerology Report is Locked</p>
                        <p className="mt-1.5 text-xs text-text-secondary">
                          Tap the Numerology card on the dashboard five times to unlock.
                        </p>
                        <Link href="/dashboard" className="no-underline"><Button className="mt-4">Go to Dashboard</Button></Link>
                      </>
                    ) : !dataReady ? (
                      <>
                        <Loading size="lg" />
                        <p className="mt-3 text-base font-semibold text-text">Loading your birth profile…</p>
                      </>
                    ) : !activeProfile ? (
                      <>
                        <span className="text-3xl">🪔</span>
                        <p className="mt-3 text-base font-semibold text-text">Generate your Kundli first</p>
                        <p className="mt-1.5 text-xs text-text-secondary">
                          We need your birth details to compute your numerology. Complete onboarding to continue.
                        </p>
                        <Link href="/onboarding" className="no-underline"><Button className="mt-4">Complete Onboarding</Button></Link>
                      </>
                    ) : numStatus === 'error' ? (
                      <>
                        <span className="text-3xl">⚠️</span>
                        <p className="mt-3 text-base font-semibold text-text">Generation Failed</p>
                        <p className="mt-1.5 text-xs text-text-secondary">{numError || 'Something went wrong.'}</p>
                        <Button className="mt-4" onClick={() => { autoFiredRef.current = true; handleNumerologyAutoGenerate(); }}>Retry</Button>
                      </>
                    ) : (
                      <>
                        <Loading size="lg" />
                        <p className="mt-3 text-base font-semibold text-text">Preparing your report from your birth profile…</p>
                        <p className="mt-1.5 text-xs text-text-secondary">
                          Using <span className="text-text">{activeProfile.name}</span> · {activeProfile.dob}
                        </p>
                      </>
                    )}
                  </CardContent>
                </Card>
              </ScrollReveal>

              <ScrollReveal>
                <div className="space-y-3">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm font-[family-name:var(--font-serif)]">What&apos;s Included</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-1.5">
                        {[
                          'Mulank (Psychic) & Bhagyank (Destiny) analysis',
                          'Kua Number with Feng Shui lucky directions',
                          'Lo Shu Fortune Grid — frequency & missing number analysis',
                          'Compatibility matrix — friendship, business & romance',
                          'Health blueprint & career recommendations',
                          'Name numerology: Soul Urge, Personality & Name Planes',
                          '12-Month personal forecast with themes & advice',
                          'Life Cycles — 4 challenge phases',
                          'Missing number Vastu & Feng Shui remedies',
                          'Sanskrit mantras for career, health & marriage',
                          'Everyday luck: email suffix, bank names & tattoo suggestion',
                        ].map((f, i) => (
                          <li key={i} className="flex items-start gap-1.5 text-xs text-text-secondary">
                            <span className="mt-0.5 text-primary font-bold">✦</span>
                            {f}
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                </div>
              </ScrollReveal>
            </div>
          )}

          {numStatus === 'generating' && (
            <FadeIn>
              <Card className="py-12 text-center">
                <CardContent>
                  <Loading size="lg" />
                  <p className="mt-3 text-base font-semibold text-text">Generating your Numerology Report…</p>
                  <p className="mt-1.5 text-xs text-text-secondary">
                    AI is analysing your numbers across all 10 sections. This usually takes 1-3 minutes.
                    You&apos;ll be notified when it&apos;s ready — you can safely leave this page.
                  </p>
                  <div className="mx-auto mt-4 h-1.5 w-56 overflow-hidden rounded-full bg-surface">
                    <div className="h-full animate-pulse rounded-full bg-primary/60" style={{ width: '60%' }} />
                  </div>
                  <p className="mt-4 text-[10px] text-text-secondary">
                    The report will also appear in your{' '}
                    <a href="/profile" className="text-primary hover:underline">Profile</a> page when complete.
                  </p>
                </CardContent>
              </Card>
            </FadeIn>
          )}

          {numStatus === 'ready' && (
            <FadeIn>
              <Card className="py-10 text-center">
                <CardContent>
                  <span className="text-4xl">✨</span>
                  <h2 className="mt-3 text-lg font-bold font-[family-name:var(--font-serif)] text-text">Your Numerology Report is Ready!</h2>
                  <p className="mt-1.5 text-xs text-text-secondary">
                    Your comprehensive 10-section Vedic numerology report has been generated.
                  </p>
                  <div className="mt-4 flex justify-center gap-2.5 flex-wrap">
                    {numDownloadUrl && (
                      <a href={numDownloadUrl} target="_blank" rel="noopener noreferrer">
                        <Button size="lg">Download PDF</Button>
                      </a>
                    )}
                    <Button
                      variant="outline"
                      onClick={() => {
                        // Clear cached report and reset so the autostart effect
                        // re-fires generation on the next render.
                        try { localStorage.removeItem('numerology_last_report_id'); } catch { /* ignore */ }
                        autoFiredRef.current = false;
                        setNumStatus('idle');
                        setNumDownloadUrl('');
                        setNumReportId(undefined);
                        setReportIdInUrl(null);
                      }}
                    >
                      Generate Another Report
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </FadeIn>
          )}
        </>
      )}
    </MotionPage>
  );
}

export default function PremiumReportsPage() {
  return (
    <Suspense>
      <PremiumReportsPageInner />
    </Suspense>
  );
}
