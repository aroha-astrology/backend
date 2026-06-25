'use client';

import { useState, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';
import { MotionPage, FadeIn, StaggerList, StaggerItem, ScrollReveal } from '@/components/ui/motion-primitives';
import { staggerContainer, staggerItem, cardHover } from '@/lib/motion';
import { usePanchangQuery } from '@/hooks/queries/usePanchangQuery';
import { useUserLocation } from '@/hooks/useUserLocation';
import type { RegionId, RegionalMonth } from '@aroha-astrology/shared';
import { PurchasePlanModal } from './PurchasePlanModal';
import { PurchasePlanResults } from './PurchasePlanResult';
import { MonthlyPanchangCalendar } from './MonthlyPanchangCalendar';
import { REGION_OPTIONS, REGION_META } from './regions';
import { findAdhikMaas } from './adhik-maas-ranges';

interface PanchangData {
  tithi: string;
  nakshatra: string;
  yoga: string;
  karana: string;
  vara: string;
  rahuKaal: { start: string; end: string };
  gulikaKaal: { start: string; end: string };
  yamagandaKaal: { start: string; end: string };
  choghadiya: {
    day: { name: string; start: string; end: string; type: 'good' | 'bad' | 'neutral' }[];
    night: { name: string; start: string; end: string; type: 'good' | 'bad' | 'neutral' }[];
  };
  hora: { planet: string; start: string; end: string; isCurrent: boolean }[];
  abhijitMuhurta: { start: string; end: string };
  sunrise: string;
  sunset: string;
  regionalMonths?: Record<RegionId, RegionalMonth>;
}

interface PlanRow {
  id: string;
  status: 'pending' | 'processing' | 'done' | 'error';
  category: string;
  analysis: Record<string, unknown> | null;
  resolved_booking_date: string;
  resolved_delivery_date: string;
  created_at: string;
  completed_at: string | null;
  language: string;
  metadata: Record<string, string>;
}

function isCurrentlyActive(start: string, end: string): boolean {
  const now = new Date();
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const currentMins = now.getHours() * 60 + now.getMinutes();
  const startMins = sh * 60 + sm;
  const endMins = eh * 60 + em;
  return currentMins >= startMins && currentMins < endMins;
}

const CHOGHADIYA_STYLES = {
  good: { bg: 'rgba(16,185,129,0.10)', border: 'rgba(16,185,129,0.25)', text: '#10b981', bar: '#10b981' },
  bad: { bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.22)', text: '#f87171', bar: '#f87171' },
  neutral: { bg: 'rgba(212, 175, 55,0.08)', border: 'rgba(212, 175, 55,0.22)', text: 'var(--primary)', bar: 'var(--primary)' },
};

const HORA_SYMBOLS: Record<string, string> = {
  Sun: '☉', Moon: '☽', Mars: '♂', Mercury: '☿',
  Jupiter: '♃', Venus: '♀', Saturn: '♄',
};

const HORA_COLORS: Record<string, string> = {
  Sun: '#f97316', Moon: '#a87fff', Mars: '#ef4444',
  Mercury: '#10b981', Jupiter: 'var(--primary)', Venus: '#ec4899', Saturn: '#6b7280',
};

const PURCHASE_CARDS = [
  { id: 'vehicle', icon: '🚗', label: 'Vehicle', sub: 'Car, Bike, EV' },
  { id: 'home', icon: '🏠', label: 'Home', sub: 'Apartment, Villa, Plot' },
  { id: 'commercial', icon: '🏢', label: 'Commercial', sub: 'Office, Shop, Warehouse' },
  { id: 'other', icon: '📦', label: 'Other', sub: 'Any big purchase' },
] as const;

// ─── Collapsible section wrapper ─────────────────────────────────────────────

function CollapsibleSection({
  title,
  subtitle,
  children,
  defaultOpen = false,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-2xl glass-2 overflow-hidden" style={{ border: '1px solid rgba(212, 175, 55,0.16)' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-3"
        style={{ borderBottom: open ? '1px solid rgba(212, 175, 55,0.12)' : undefined }}
      >
        <div className="text-left">
          <h2 className="font-[family-name:var(--font-serif)] text-sm font-bold text-text tracking-wide">
            {title}
          </h2>
          <p className="text-[10px] text-text-secondary mt-0.5">{subtitle}</p>
        </div>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="text-text-secondary/60 text-xs ml-4 flex-shrink-0"
        >
          ▼
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28 }}
            className="overflow-hidden"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PanchangPage() {
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [region, setRegion] = useState<RegionId>('north');

  // Two parallel panchang fetches:
  //   refData → API default reference (geographic centre of India), used as
  //             the canonical "panchang" times shown in publications.
  //   userData → user's actual coordinates, when shared. Empty otherwise.
  // Sunrise / sunset / rahu kaal etc. genuinely depend on lat/lng, so the
  // page renders both side-by-side once the user shares location.
  const { lat: userLat, lng: userLng, hasLocation, location, refresh: refreshLocation } = useUserLocation();
  const [refreshingLocation, setRefreshingLocation] = useState(false);

  const { data: refRaw, isLoading: refLoading, isError } = usePanchangQuery(date);
  const { data: userRaw, isLoading: userLoading } = usePanchangQuery(date, {
    lat: userLat,
    lng: userLng,
    enabled: hasLocation,
  });
  const data = refRaw as PanchangData | null | undefined;
  const userPanchang = userRaw as PanchangData | null | undefined;
  const loading = refLoading || (hasLocation && userLoading);
  const error = isError ? 'Could not load Panchang data. Please try again.' : '';

  async function handleRefreshLocation() {
    setRefreshingLocation(true);
    try {
      await refreshLocation();
    } finally {
      setRefreshingLocation(false);
    }
  }

  // ─── Purchase plan state ────────────────────────────────────────────────────
  type PurchaseCategory = 'vehicle' | 'home' | 'commercial' | 'other';
  const [modalOpen, setModalOpen] = useState(false);
  const [modalCategory, setModalCategory] = useState<PurchaseCategory | null>(null);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [pollingId, setPollingId] = useState<string | null>(null);
  const [plansLoaded, setPlansLoaded] = useState(false);

  // Load existing plans once on mount
  const loadPlans = useCallback(async () => {
    if (plansLoaded) return;
    try {
      const res = await fetch('/api/purchase-plan/list');
      const json = (await res.json()) as { success: boolean; data?: PlanRow[] };
      if (json.success && json.data) setPlans(json.data);
    } catch {
      // silent
    } finally {
      setPlansLoaded(true);
    }
  }, [plansLoaded]);

  // Open modal — optionally pre-select a category to skip the picker step
  function handleModalOpen(category?: PurchaseCategory) {
    setModalCategory(category ?? null);
    setModalOpen(true);
    loadPlans();
  }

  function handleSubmitted(planId: string) {
    setPollingId(planId);
    // Insert optimistic pending row at top
    setPlans((prev) => [
      {
        id: planId,
        status: 'pending',
        category: 'other',
        analysis: null,
        resolved_booking_date: '',
        resolved_delivery_date: '',
        created_at: new Date().toISOString(),
        completed_at: null,
        language: 'en',
        metadata: {},
      },
      ...prev,
    ]);
  }

  const handlePolled = useCallback((updated: PlanRow) => {
    setPlans((prev) => prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)));
  }, []);

  return (
    <MotionPage className="mx-auto max-w-7xl px-4 py-6 min-h-screen">

      {/* ── Header ── */}
      <FadeIn className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-semibold tracking-[0.2em] text-primary/70 uppercase mb-1">Vedic Calendar</p>
          <h1 className="font-[family-name:var(--font-serif)] text-2xl md:text-3xl font-bold text-text tracking-wide">
            Daily Panchang
          </h1>
          <p className="text-xs text-text-secondary mt-1">Five limbs of the Hindu calendar</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="w-28">
            <Select
              options={REGION_OPTIONS}
              value={region}
              onChange={(e) => setRegion(e.target.value as RegionId)}
              aria-label="Regional calendar"
              className="py-2 text-sm"
            />
          </div>
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-auto sm:w-52 border-[rgba(212, 175, 55,0.30)] bg-[rgba(212, 175, 55,0.04)] focus:border-primary/60 text-sm"
          />
        </div>
      </FadeIn>

      {/* ── Regional calendar info card ─────────────────────────────────────────
          Most panchang fields (tithi/nakshatra/yoga/karana/sunrise…) are pure
          astronomy and identical across regional traditions. The four things
          that genuinely shift per region — lunar month, paksha boundary,
          month system, era year — live in this card so changing the dropdown
          produces an obvious, visible update. */}
      <FadeIn className="mb-4">
        {(() => {
          const meta = REGION_META[region];
          const rm = data?.regionalMonths?.[region];
          const adhik = findAdhikMaas(date);
          const pakshaLabel = rm?.paksha === 'shukla' ? 'Shukla Paksha' : rm?.paksha === 'krishna' ? 'Krishna Paksha' : null;
          const monthName = rm?.monthName ?? adhik?.monthName ?? null;
          const monthSystemLabel = rm?.monthSystem === 'purnimanta'
            ? 'Purnimanta (month ends at full moon)'
            : rm?.monthSystem === 'amanta'
              ? 'Amanta (month ends at new moon)'
              : rm?.monthSystem === 'solar'
                ? 'Solar (Sun-sign based)'
                : null;
          const isAdhik = !!(rm?.isAdhikMaas || adhik);
          return (
            <motion.div
              key={region}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className="rounded-2xl px-4 py-3 glass-2"
              style={{ border: '1px solid rgba(212, 175, 55,0.20)' }}
            >
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
                    style={{ background: 'rgba(212, 175, 55,0.12)', border: '1px solid rgba(212, 175, 55,0.28)' }}
                  >
                    🕉
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold tracking-[0.14em] uppercase text-text-secondary">
                      {meta.label} India calendar
                    </p>
                    <p className="font-[family-name:var(--font-serif)] text-lg font-bold text-text leading-tight">
                      {monthName ? (
                        <>
                          <span className="text-primary">{isAdhik ? 'Adhik ' : ''}{monthName}</span>
                          {pakshaLabel ? <span className="text-text"> · {pakshaLabel}</span> : null}
                        </>
                      ) : (
                        <span className="text-text-secondary text-sm">Loading…</span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-[10px] font-semibold tracking-[0.14em] uppercase text-text-secondary">
                    {meta.calendarName}
                  </p>
                  <p className="font-[family-name:var(--font-serif)] text-lg font-bold text-primary leading-tight">
                    {rm?.year ?? '—'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap mt-3">
                {monthSystemLabel && (
                  <span
                    className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                    style={{ background: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.08)', color: 'var(--text-secondary)' }}
                  >
                    {monthSystemLabel}
                  </span>
                )}
                {adhik && (
                  <span
                    className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                    style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.30)', color: '#b91c1c' }}
                    title={`${adhik.label} · avoid new beginnings`}
                  >
                    🚫 {meta.adhikMaasName} · avoid new beginnings
                  </span>
                )}
              </div>
            </motion.div>
          );
        })()}
      </FadeIn>

      {/* ── Location bar — drives the "your location" column on every card ── */}
      <FadeIn className="mb-4">
        <div
          className="rounded-2xl px-4 py-3"
          style={{
            background: hasLocation ? 'rgba(212, 175, 55,0.06)' : 'rgba(245, 158, 11,0.06)',
            border: `1px solid ${hasLocation ? 'rgba(212, 175, 55,0.20)' : 'rgba(245, 158, 11,0.30)'}`,
          }}
        >
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-xl flex-shrink-0">{hasLocation ? '📍' : '🛰'}</span>
              <div className="min-w-0">
                {hasLocation ? (
                  <>
                    <p className="text-xs font-semibold text-text truncate">
                      Using your location
                      {location?.current_city ? ` · ${location.current_city}` : ''}
                      {location?.current_country ? `, ${location.current_country}` : ''}
                    </p>
                    <p className="text-[10px] text-text-secondary mt-0.5">
                      {userLat?.toFixed(3)}°, {userLng?.toFixed(3)}°
                      {location?.location_source ? ` · ${location.location_source}` : ''}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-xs font-semibold text-text">
                      Showing reference times only
                    </p>
                    <p className="text-[10px] text-text-secondary mt-0.5">
                      Share your location to see exact sunrise / sunset / rahu kaal for where you are.
                    </p>
                  </>
                )}
              </div>
            </div>
            <Button
              variant={hasLocation ? 'outline' : 'default'}
              size="sm"
              onClick={handleRefreshLocation}
              disabled={refreshingLocation}
              className="flex-shrink-0"
            >
              {refreshingLocation ? 'Locating…' : hasLocation ? 'Refresh' : 'Use my location'}
            </Button>
          </div>

          {/* Mobile-app accuracy hint — browser geolocation is approximate; the
              app uses GPS for pinpoint sunrise / muhurta times. */}
          <div
            className="mt-3 rounded-xl px-3 py-2 flex items-start gap-2"
            style={{
              background: 'rgba(245, 158, 11,0.08)',
              border: '1px solid rgba(245, 158, 11,0.25)',
            }}
          >
            <span className="text-sm leading-tight flex-shrink-0">📱</span>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-amber-800 leading-tight">
                For exact location &amp; muhurta timings, use the Aroha Astrology mobile app
              </p>
              <p className="text-[10px] text-text-secondary mt-0.5 leading-snug">
                Browser location is approximate. The app uses GPS for precise sunrise, rahu kaal and choghadiya at your spot.
              </p>
            </div>
          </div>
        </div>
      </FadeIn>

      {/* ── Monthly Calendar — pick any day to load its full panchang below ── */}
      <FadeIn className="mb-5">
        <MonthlyPanchangCalendar
          selectedDate={date}
          onSelectDate={setDate}
          lat={userLat}
          lng={userLng}
          dayLoading={loading}
          regionalLabel={(() => {
            const rm = data?.regionalMonths?.[region];
            if (!rm) return null;
            const paksha = rm.paksha === 'shukla' ? 'Shukla' : rm.paksha === 'krishna' ? 'Krishna' : null;
            return `${rm.isAdhikMaas ? 'Adhik ' : ''}${rm.monthName}${paksha ? ' · ' + paksha : ''}`;
          })()}
          dayDetails={
            data
              ? {
                  tithi: data.tithi,
                  nakshatra: data.nakshatra,
                  vara: data.vara,
                  sunrise: hasLocation && userPanchang ? userPanchang.sunrise : data.sunrise,
                  sunset: hasLocation && userPanchang ? userPanchang.sunset : data.sunset,
                  rahuKaal: hasLocation && userPanchang ? userPanchang.rahuKaal : data.rahuKaal,
                  abhijitMuhurta:
                    hasLocation && userPanchang
                      ? userPanchang.abhijitMuhurta
                      : data.abhijitMuhurta,
                }
              : undefined
          }
        />
      </FadeIn>

      {loading && (
        <div className="space-y-5 animate-pulse">
          {/* ── Generating banner ── */}
          <div
            className="rounded-2xl px-5 py-3 flex items-center gap-3"
            style={{ background: 'rgba(212, 175, 55,0.07)', border: '1px solid rgba(212, 175, 55,0.20)' }}
          >
            <div className="w-4 h-4 rounded-full border-2 border-primary/40 border-t-primary animate-spin flex-shrink-0" style={{ animationDuration: '0.8s' }} />
            <p className="text-xs font-semibold text-primary/70">Calculating panchang with Swiss Ephemeris…</p>
          </div>

          {/* ── 5 limb cards ── */}
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="rounded-2xl p-4 glass-2 h-32 flex flex-col items-center justify-center gap-2.5"
                style={{ border: '1px solid rgba(212, 175, 55,0.18)' }}
              >
                <div className="w-8 h-8 rounded-full bg-text-secondary/10" />
                <div className="w-14 h-2 rounded-full bg-text-secondary/10" />
                <div className="w-20 h-3 rounded-full bg-primary/10" />
                <div className="w-10 h-2 rounded-full bg-text-secondary/8" />
              </div>
            ))}
          </div>

          {/* ── Sunrise / Sunset ── */}
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <div
                key={i}
                className="rounded-2xl p-4 glass-1 flex items-start gap-3 h-20"
                style={{ border: '1px solid rgba(212, 175, 55,0.15)' }}
              >
                <div className="w-10 h-10 rounded-xl bg-text-secondary/10 flex-shrink-0" />
                <div className="flex-1 space-y-2 pt-0.5">
                  <div className="w-16 h-2 rounded-full bg-text-secondary/10" />
                  <div className="w-24 h-5 rounded-full bg-primary/10" />
                </div>
              </div>
            ))}
          </div>

          {/* ── Inauspicious Periods ── */}
          <div className="rounded-2xl glass-2 overflow-hidden" style={{ border: '1px solid rgba(212, 175, 55,0.16)' }}>
            <div className="px-5 py-3 border-b border-[rgba(212, 175, 55,0.12)]">
              <div className="w-44 h-4 rounded-full bg-text-secondary/10" />
              <div className="w-64 h-2 rounded-full bg-text-secondary/8 mt-1.5" />
            </div>
            <div className="p-4 grid gap-3 sm:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="rounded-xl p-3 text-center h-24 flex flex-col items-center justify-center gap-2"
                  style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.07)' }}
                >
                  <div className="w-8 h-8 rounded-full bg-text-secondary/10" />
                  <div className="w-20 h-2 rounded-full bg-text-secondary/10" />
                  <div className="w-28 h-4 rounded-full bg-primary/10" />
                </div>
              ))}
            </div>
          </div>

          {/* ── Abhijit Muhurta ── */}
          <div className="rounded-2xl p-5 glass-3 relative overflow-hidden h-32"
            style={{ border: '1px solid rgba(212, 175, 55,0.35)' }}
          >
            <div className="space-y-2.5">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-primary/20" />
                <div className="w-36 h-4 rounded-full bg-text-secondary/10" />
                <div className="ml-auto w-20 h-5 rounded-full bg-primary/10" />
              </div>
              <div className="w-full h-2.5 rounded-full bg-text-secondary/8" />
              <div className="w-4/5 h-2.5 rounded-full bg-text-secondary/8" />
              <div className="w-44 h-10 rounded-xl bg-primary/10 mt-1" />
            </div>
          </div>

          {/* ── Planning to Buy + Choghadiya + Hora headers ── */}
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-2xl glass-2 overflow-hidden"
              style={{ border: '1px solid rgba(212, 175, 55,0.16)' }}
            >
              <div className="px-5 py-4 flex items-center justify-between">
                <div className="space-y-1.5">
                  <div className="w-40 h-4 rounded-full bg-text-secondary/10" />
                  <div className="w-56 h-2 rounded-full bg-text-secondary/8" />
                </div>
                <div className="w-4 h-4 rounded-full bg-text-secondary/10" />
              </div>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="py-6 px-4 rounded-2xl glass-1 border-error/30 text-center text-sm text-error">
          {error}
        </div>
      )}

      <AnimatePresence>
        {!loading && data && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="space-y-5"
          >
            {/* ── Core Five Limbs ── */}
            <StaggerList className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
              {[
                { label: 'Tithi', value: data.tithi, icon: '🌙', desc: 'Lunar Day' },
                { label: 'Nakshatra', value: data.nakshatra, icon: '⭐', desc: 'Star' },
                { label: 'Yoga', value: data.yoga, icon: '🔮', desc: 'Auspiciousness' },
                { label: 'Karana', value: data.karana, icon: '📿', desc: 'Half Tithi' },
                { label: 'Vara', value: data.vara, icon: '📅', desc: 'Weekday' },
              ].map((item) => (
                <StaggerItem key={item.label} className="h-full">
                  <motion.div
                    {...cardHover}
                    className="rounded-2xl p-4 glass-2 text-center relative overflow-hidden h-full flex flex-col items-center justify-center"
                    style={{ border: '1px solid rgba(212, 175, 55,0.18)' }}
                  >
                    <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
                    <div className="text-2xl mb-2">{item.icon}</div>
                    <p className="text-[9px] text-text-secondary uppercase tracking-[0.15em] font-semibold mb-0.5">{item.label}</p>
                    <p className="text-sm font-bold font-[family-name:var(--font-serif)] line-clamp-2" style={{ color: 'var(--text)' }}>{item.value}</p>
                    <p className="text-[9px] text-text-secondary mt-0.5">{item.desc}</p>
                  </motion.div>
                </StaggerItem>
              ))}
            </StaggerList>

            {/* ── Sunrise / Sunset ── */}
            <FadeIn delay={0.1}>
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  { icon: '🌅', label: 'Sunrise', refValue: data.sunrise, userValue: userPanchang?.sunrise },
                  { icon: '🌇', label: 'Sunset', refValue: data.sunset, userValue: userPanchang?.sunset },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="rounded-2xl p-4 glass-1 flex items-start gap-3"
                    style={{ border: '1px solid rgba(212, 175, 55,0.15)' }}
                  >
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
                      style={{ background: 'rgba(212, 175, 55,0.10)', border: '1px solid rgba(212, 175, 55,0.22)' }}
                    >
                      {item.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] text-text-secondary uppercase tracking-wider font-semibold">{item.label}</p>
                      {hasLocation && item.userValue ? (
                        <div className="flex items-baseline gap-3 flex-wrap mt-0.5">
                          <div>
                            <p className="text-[9px] text-text-secondary uppercase tracking-wider">Your location</p>
                            <p className="text-lg font-bold text-primary font-[family-name:var(--font-serif)] leading-tight">
                              {item.userValue}
                            </p>
                          </div>
                          <div>
                            <p className="text-[9px] text-text-secondary uppercase tracking-wider">Panchang ref</p>
                            <p className="text-sm font-semibold text-text-secondary font-[family-name:var(--font-serif)] leading-tight">
                              {item.refValue}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <p className="text-lg font-bold text-primary font-[family-name:var(--font-serif)]">{item.refValue}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </FadeIn>

            {/* ── Inauspicious Periods ── */}
            <FadeIn delay={0.15}>
              <div className="rounded-2xl glass-2 overflow-hidden" style={{ border: '1px solid rgba(212, 175, 55,0.16)' }}>
                <div className="px-5 py-3 border-b border-[rgba(212, 175, 55,0.12)]">
                  <h2 className="font-[family-name:var(--font-serif)] text-sm font-bold text-text tracking-wide">
                    ⚠ Inauspicious Periods
                  </h2>
                  <p className="text-[10px] text-text-secondary mt-0.5">Avoid starting important work during these times</p>
                </div>
                <div className="p-4 grid gap-3 sm:grid-cols-3">
                  {[
                    { label: 'Rahu Kaal', ref: data.rahuKaal, user: userPanchang?.rahuKaal, icon: '🐉' },
                    { label: 'Gulika Kaal', ref: data.gulikaKaal, user: userPanchang?.gulikaKaal, icon: '☄️' },
                    { label: 'Yamaganda', ref: data.yamagandaKaal, user: userPanchang?.yamagandaKaal, icon: '⚡' },
                  ].map((kaal) => {
                    const primary = (hasLocation && kaal.user) ? kaal.user : kaal.ref;
                    const active = isCurrentlyActive(primary.start, primary.end);
                    const showDual = hasLocation && kaal.user;
                    return (
                      <div
                        key={kaal.label}
                        className="rounded-xl p-3 text-center transition-all"
                        style={{
                          background: active ? 'rgba(239,68,68,0.10)' : 'rgba(0,0,0,0.03)',
                          border: `1px solid ${active ? 'rgba(239,68,68,0.35)' : 'rgba(0,0,0,0.08)'}`,
                          boxShadow: active ? '0 0 20px rgba(239,68,68,0.10)' : 'none',
                        }}
                      >
                        <span className="text-xl block mb-1">{kaal.icon}</span>
                        <p className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider">{kaal.label}</p>
                        <p className="text-[9px] text-text-secondary uppercase tracking-wider mt-1.5">
                          {showDual ? 'Your location' : 'Panchang ref'}
                        </p>
                        <p className={`mt-0.5 text-sm font-bold ${active ? 'text-red-400' : 'text-text'}`}>
                          {primary.start} – {primary.end}
                        </p>
                        {showDual && (
                          <>
                            <p className="text-[9px] text-text-secondary uppercase tracking-wider mt-1.5">
                              Panchang ref
                            </p>
                            <p className="text-[11px] text-text-secondary font-semibold mt-0.5">
                              {kaal.ref.start} – {kaal.ref.end}
                            </p>
                          </>
                        )}
                        {active && (
                          <Badge variant="error" size="xs" className="mt-2">Active Now</Badge>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </FadeIn>

            {/* ── Abhijit Muhurta ── */}
            <ScrollReveal>
              <div
                className="rounded-2xl p-5 glass-3 relative overflow-hidden"
                style={{ border: '1px solid rgba(212, 175, 55,0.35)' }}
              >
                <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-primary to-transparent" />
                <div className="absolute inset-0 pointer-events-none" style={{
                  background: 'radial-gradient(ellipse at 50% 0%, rgba(212, 175, 55,0.08) 0%, transparent 60%)',
                }} />
                <div className="relative">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-primary text-lg">✦</span>
                    <h2 className="font-[family-name:var(--font-serif)] text-sm font-bold text-text tracking-wide">
                      Abhijit Muhurta
                    </h2>
                    <Badge variant="gold" size="xs" className="ml-auto">Most Auspicious</Badge>
                  </div>
                  <p className="text-xs text-text-secondary mb-3 leading-relaxed">
                    The golden 48 minutes around solar noon — universally auspicious for any new endeavour.
                  </p>
                  <div className="flex items-center gap-3 flex-wrap">
                    {(() => {
                      const primary = (hasLocation && userPanchang?.abhijitMuhurta) ? userPanchang.abhijitMuhurta : data.abhijitMuhurta;
                      const showDual = hasLocation && !!userPanchang?.abhijitMuhurta;
                      return (
                        <>
                          <div
                            className="rounded-xl px-4 py-2 font-mono text-base font-bold"
                            style={{
                              background: 'rgba(212, 175, 55,0.12)',
                              border: '1px solid rgba(212, 175, 55,0.35)',
                              color: 'var(--text)',
                              boxShadow: '0 0 20px rgba(212, 175, 55,0.12)',
                            }}
                          >
                            <span className="block text-[9px] uppercase tracking-wider text-text-secondary font-sans font-semibold mb-0.5">
                              {showDual ? 'Your location' : 'Panchang ref'}
                            </span>
                            {primary.start} – {primary.end}
                          </div>
                          {showDual && (
                            <div
                              className="rounded-xl px-4 py-2 font-mono text-sm font-semibold"
                              style={{
                                background: 'rgba(0,0,0,0.03)',
                                border: '1px solid rgba(0,0,0,0.08)',
                                color: 'var(--text-secondary)',
                              }}
                            >
                              <span className="block text-[9px] uppercase tracking-wider text-text-secondary font-sans font-semibold mb-0.5">
                                Panchang ref
                              </span>
                              {data.abhijitMuhurta.start} – {data.abhijitMuhurta.end}
                            </div>
                          )}
                          {isCurrentlyActive(primary.start, primary.end) && (
                            <Badge variant="success" size="md" className="neon-pulse">
                              ✦ Active Now
                            </Badge>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </ScrollReveal>

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* ── Planning to Buy? ── */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            <ScrollReveal>
              <div
                className="rounded-2xl glass-2 overflow-hidden"
                style={{ border: '1px solid rgba(212, 175, 55,0.25)' }}
              >
                {/* Section header */}
                <div
                  className="px-5 py-4 relative overflow-hidden"
                  style={{ borderBottom: '1px solid rgba(212, 175, 55,0.15)' }}
                >
                  <div className="absolute inset-0 pointer-events-none" style={{
                    background: 'radial-gradient(ellipse at 0% 50%, rgba(212, 175, 55,0.06) 0%, transparent 70%)',
                  }} />
                  <div className="relative flex items-center justify-between flex-wrap gap-3">
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-lg">🛍️</span>
                        <h2 className="font-[family-name:var(--font-serif)] text-base font-bold text-text tracking-wide">
                          Planning to Buy?
                        </h2>
                      </div>
                      <p className="text-[11px] text-text-secondary">
                        Get Vedic-powered timing with your birth chart ✨ know exactly when to book &amp; take delivery
                      </p>
                    </div>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => handleModalOpen()}
                      className="flex-shrink-0"
                    >
                      ✦ Start Analysis
                    </Button>
                  </div>
                </div>

                {/* Category cards */}
                <div className="p-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                    {PURCHASE_CARDS.map((c) => (
                      <motion.button
                        key={c.id}
                        onClick={() => handleModalOpen(c.id)}
                        whileHover={{ y: -2 }}
                        whileTap={{ scale: 0.97 }}
                        className="rounded-2xl p-4 text-center relative overflow-hidden transition-all"
                        style={{
                          background: 'rgba(212, 175, 55,0.05)',
                          border: '1px solid rgba(212, 175, 55,0.18)',
                        }}
                      >
                        <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-[rgba(212, 175, 55,0.4)] to-transparent" />
                        <span className="text-2xl block mb-2">{c.icon}</span>
                        <p className="text-xs font-bold text-text font-[family-name:var(--font-serif)]">{c.label}</p>
                        <p className="text-[9px] text-text-secondary mt-0.5">{c.sub}</p>
                      </motion.button>
                    ))}
                  </div>

                  {/* Previous analyses */}
                  {plans.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary mb-2">
                        🕐 Your Analyses
                      </p>
                      <PurchasePlanResults
                        plans={plans}
                        pollingId={pollingId}
                        onPolled={handlePolled}
                      />
                    </div>
                  )}
                </div>
              </div>
            </ScrollReveal>

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* ── Choghadiya (collapsible, closed by default) ── */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            <ScrollReveal>
              <CollapsibleSection
                title="Choghadiya"
                subtitle="Auspicious time periods — tap to expand"
                defaultOpen={false}
              >
                <div className="p-4 grid gap-5 md:grid-cols-2">
                  {[
                    { title: 'Daytime', periods: data.choghadiya.day, icon: '☀️' },
                    { title: 'Nighttime', periods: data.choghadiya.night, icon: '🌙' },
                  ].map(({ title, periods, icon }) => (
                    <div key={title}>
                      <h4 className="text-[10px] text-text-secondary uppercase tracking-wider font-semibold mb-2 flex items-center gap-1.5">
                        <span>{icon}</span> {title} Periods
                      </h4>
                      <motion.div
                        className="space-y-1.5"
                        variants={staggerContainer}
                        initial="initial"
                        animate="animate"
                      >
                        {periods.map((period, i) => {
                          const s = CHOGHADIYA_STYLES[period.type];
                          const isNow = isCurrentlyActive(period.start, period.end);
                          return (
                            <motion.div
                              key={i}
                              variants={staggerItem}
                              className="flex items-center gap-2 rounded-lg px-3 py-2 relative overflow-hidden text-sm"
                              style={{
                                background: isNow ? s.bg : 'rgba(0,0,0,0.03)',
                                border: `1px solid ${isNow ? s.border : 'rgba(0,0,0,0.07)'}`,
                              }}
                            >
                              <div className="w-[3px] h-full absolute left-0 top-0 bottom-0 rounded-l-lg" style={{ background: s.bar }} />
                              <span className="font-semibold ml-1" style={{ color: isNow ? s.text : 'var(--text-secondary)' }}>
                                {period.name}
                              </span>
                              <span className="ml-auto text-[11px] text-text-secondary font-mono">
                                {period.start} – {period.end}
                              </span>
                              {isNow && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: s.bg, color: s.text, border: `1px solid ${s.border}` }}>NOW</span>
                              )}
                            </motion.div>
                          );
                        })}
                      </motion.div>
                    </div>
                  ))}
                </div>
              </CollapsibleSection>
            </ScrollReveal>

            {/* ── Planetary Hours (Hora) (collapsible, closed by default) ── */}
            <ScrollReveal>
              <CollapsibleSection
                title="Planetary Hours (Hora)"
                subtitle="Each hour ruled by a different planet — tap to expand"
                defaultOpen={false}
              >
                <div className="p-4">
                  <StaggerList className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    {data.hora.map((h, i) => {
                      const color = HORA_COLORS[h.planet] || 'var(--primary)';
                      return (
                        <StaggerItem key={i}>
                          <div
                            className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm transition-all"
                            style={{
                              background: h.isCurrent ? `${color}15` : 'rgba(0,0,0,0.03)',
                              border: `1px solid ${h.isCurrent ? `${color}45` : 'rgba(0,0,0,0.07)'}`,
                              boxShadow: h.isCurrent ? `0 0 16px ${color}20` : 'none',
                            }}
                          >
                            <span className="text-lg leading-none" style={{ color }}>{HORA_SYMBOLS[h.planet] || '★'}</span>
                            <div className="min-w-0">
                              <p className="font-semibold text-[12px]" style={{ color: h.isCurrent ? color : 'var(--text)' }}>
                                {h.planet}
                              </p>
                              <p className="text-[10px] text-text-secondary font-mono">{h.start} – {h.end}</p>
                            </div>
                            {h.isCurrent && (
                              <div className="ml-auto w-1.5 h-1.5 rounded-full animate-pulse flex-shrink-0" style={{ background: color }} />
                            )}
                          </div>
                        </StaggerItem>
                      );
                    })}
                  </StaggerList>
                </div>
              </CollapsibleSection>
            </ScrollReveal>

          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Purchase Plan Modal ── */}
      <PurchasePlanModal
        isOpen={modalOpen}
        panchangDate={date}
        initialCategory={modalCategory}
        onClose={() => setModalOpen(false)}
        onSubmitted={handleSubmitted}
      />

    </MotionPage>
  );
}
