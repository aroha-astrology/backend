'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useActiveChart } from '@/hooks/useActiveChart';
import { useUserLocation } from '@/hooks/useUserLocation';
import { scorePujas, type Puja, type MatchedPuja } from './match';
import { PujaGrid } from './PujaGrid';

const CITY_LOOKUP: Record<string, string> = {
  delhi: 'Delhi', mumbai: 'Mumbai', bengaluru: 'Bengaluru', chennai: 'Chennai',
  hyderabad: 'Hyderabad', kolkata: 'Kolkata', pune: 'Pune', ahmedabad: 'Ahmedabad',
  varanasi: 'Varanasi', prayagraj: 'Prayagraj',
};

function citySlugFromName(name: string | null): string | null {
  if (!name) return null;
  const n = name.toLowerCase().trim();
  if (n.includes('bangalore') || n.includes('bengaluru')) return 'bengaluru';
  if (n.includes('mumbai') || n.includes('bombay'))       return 'mumbai';
  if (n.includes('delhi'))                                 return 'delhi';
  if (n.includes('chennai') || n.includes('madras'))      return 'chennai';
  if (n.includes('hyderabad'))                             return 'hyderabad';
  if (n.includes('kolkata') || n.includes('calcutta'))    return 'kolkata';
  if (n.includes('pune'))                                  return 'pune';
  if (n.includes('ahmedabad'))                             return 'ahmedabad';
  if (n.includes('varanasi') || n.includes('banaras'))    return 'varanasi';
  if (n.includes('prayagraj') || n.includes('allahabad')) return 'prayagraj';
  return null;
}

interface PanditLite {
  specialisations: string[];
}

export default function PanditPujaPage() {
  const router = useRouter();
  const { activeChart, dataReady } = useActiveChart();
  const { location } = useUserLocation();

  const [pujas, setPujas]               = useState<Puja[]>([]);
  const [pandits, setPandits]           = useState<PanditLite[]>([]);
  const [loading, setLoading]           = useState(true);
  const [intentFilter, setIntentFilter] = useState('all');

  const userCitySlug = useMemo(() => citySlugFromName(location?.current_city ?? null), [location?.current_city]);
  const cityLabel    = userCitySlug ? CITY_LOOKUP[userCitySlug] ?? null : null;

  useEffect(() => {
    fetch('/api/pandit-puja/pujas')
      .then(r => r.json())
      .then(d => setPujas(d.pujas ?? []))
      .catch(() => setPujas([]))
      .finally(() => setLoading(false));
  }, []);

  // Fetch pandits in user's city to determine which pujas are locally available.
  useEffect(() => {
    if (!userCitySlug) { setPandits([]); return; }
    fetch(`/api/pandit-puja/pandits?city=${userCitySlug}`)
      .then(r => r.json())
      .then(d => setPandits((d.pandits ?? []) as PanditLite[]))
      .catch(() => setPandits([]));
  }, [userCitySlug]);

  const availableSlugs = useMemo(() => {
    const set = new Set<string>();
    pandits.forEach(p => (p.specialisations ?? []).forEach(s => set.add(s)));
    return set;
  }, [pandits]);

  const matchedPujas = useMemo(() => {
    const base = !dataReady
      ? pujas.map(p => ({ ...p, score: p.base_priority, matchReasons: [] as string[] }))
      : scorePujas(
          pujas,
          (activeChart?.dosha_data as Record<string, { present?: boolean; isPresent?: boolean; severity?: string; phase?: string }> | null) ?? null,
          (activeChart?.dasha_data as { currentMahadasha?: { planet: string }; currentAntardasha?: { planet: string } } | null) ?? null,
          (activeChart?.shadbala as Record<string, { totalVirupas?: number }> | null) ?? null,
          intentFilter === 'all' || intentFilter === 'foryou' ? null : intentFilter,
        );

    // Stable secondary sort: keep matched pujas first (already sorted by score),
    // then within unmatched group, bubble locally-available pujas above the rest.
    if (availableSlugs.size === 0) return base;
    const matched   = base.filter(p => p.matchReasons.length > 0);
    const unmatched = base.filter(p => p.matchReasons.length === 0);
    const local     = unmatched.filter(p => availableSlugs.has(p.slug));
    const remote    = unmatched.filter(p => !availableSlugs.has(p.slug));
    return [...matched, ...local, ...remote];
  }, [pujas, dataReady, activeChart, intentFilter, availableSlugs]);

  const highMatches = matchedPujas.filter(p => p.matchReasons.length > 0).length;

  return (
    <div className="min-h-screen bg-bg pb-28">
      {/* Header */}
      <div className="px-4 lg:px-8 pt-4 pb-5">
        <div className="flex items-center justify-between mb-3">
          <Link href="/dashboard" className="flex items-center gap-1.5 text-text-muted no-underline">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
            <span className="text-[12px]">Dashboard</span>
          </Link>
          <Link href="/pandit-puja/my-bookings" className="text-[12px] text-accent no-underline">
            My bookings →
          </Link>
        </div>

        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0" style={{ background: 'rgba(184,134,11,0.12)', border: '1px solid rgba(184,134,11,0.25)' }}>
            🕉️
          </div>
          <div>
            <h1 className="text-[22px] font-extrabold text-text leading-tight">Pandit & Puja</h1>
            {loading || !dataReady ? (
              <p className="text-[12px] text-text-muted mt-0.5">Loading puja catalogue…</p>
            ) : activeChart ? (
              <p className="text-[12px] text-text-muted mt-0.5">
                {highMatches > 0
                  ? <><span className="font-bold text-primary">{highMatches} pujas</span> matched to your chart{cityLabel ? <> &amp; pandits in {cityLabel}</> : null}</>
                  : `${pujas.length} sacred pujas — sorted for you`}
              </p>
            ) : (
              <p className="text-[12px] text-text-muted mt-0.5">{pujas.length} sacred pujas from across India</p>
            )}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <PujaGrid
          pujas={matchedPujas}
          hasChart={!!activeChart}
          intentFilter={intentFilter}
          onFilterChange={setIntentFilter}
          onPujaClick={(p: MatchedPuja) => router.push(`/pandit-puja/${p.slug}`)}
          cityLabel={cityLabel}
          availableSlugs={availableSlugs}
        />
      )}
    </div>
  );
}
