'use client';

export const dynamic = 'force-dynamic';

import { useState, useMemo, useEffect, useRef, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useStore } from '@/store/useStore';
import { useActiveChart } from '@/hooks/useActiveChart';
import type { KundliChartRow, HouseData, PlanetPosition, ZodiacSign } from '@aroha-astrology/shared';
import { motion, AnimatePresence } from 'framer-motion';
import { PillTabs, TabPanel } from '@/components/ui/tabs';
import { useHoroscopeQuery, type HoroscopePrediction } from '@/hooks/queries/useHoroscopeQuery';
import { usePanchangQuery } from '@/hooks/queries/usePanchangQuery';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PalmInfographic, type PalmLines, type MinorLines } from '@/components/palm/PalmInfographic';
import { DashboardBirthChartCard } from '@/components/dashboard/DashboardBirthChartCard';
import { createClient } from '@/lib/supabase/client';
import { queryKeys } from '@/lib/queryKeys';
import { PersonalDailyCard } from '@/components/dashboard/PersonalDailyCard';
import { GunaChakraCard } from '@/components/dashboard/GunaChakraCard';
import { AstrologerReviewBanner } from '@/components/dashboard/AstrologerReviewBanner';
import { ASTROLOGERS } from '@/lib/astrologers';
import { APP_NAME } from '@/lib/constants';
import { AstrologerAvatar } from '@/components/AstrologerAvatar';
import { GeneratingOverlay } from '@/components/ui/GeneratingOverlay';
import { WisdomLoader } from '@/components/ui/wisdom-loader';
import { Icon, type IconName } from '@/components/ui/icon';
import { Planet3DInline } from '@/components/3d/Planet3DInline';
import { usePalmUnlock } from '@/hooks/usePalmUnlock';
import { useFeatureUnlock } from '@/hooks/useFeatureUnlock';
import { MantraPlayer } from '@/components/MantraPlayer';
import { ReferralWelcomeModal } from '@/components/referral/ReferralWelcomeModal';
import { useTokenToast } from '@/components/ui/TokenToast';

const SIGNS = ['Aries','Taurus','Gemini','Cancer','Leo','Virgo','Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces'] as const;
const SIGN_RASHI: Record<string, string> = {
  Aries:'mesha',Taurus:'vrishabha',Gemini:'mithuna',Cancer:'karka',Leo:'simha',Virgo:'kanya',
  Libra:'tula',Scorpio:'vrischika',Sagittarius:'dhanu',Capricorn:'makara',Aquarius:'kumbha',Pisces:'meena',
};
const RASHI_DATA = [
  { sign: 'Aries',       symbol: '♈', rashi: 'Mesha',     element: 'Fire'  },
  { sign: 'Taurus',      symbol: '♉', rashi: 'Vrishabha', element: 'Earth' },
  { sign: 'Gemini',      symbol: '♊', rashi: 'Mithuna',   element: 'Air'   },
  { sign: 'Cancer',      symbol: '♋', rashi: 'Karka',     element: 'Water' },
  { sign: 'Leo',         symbol: '♌', rashi: 'Simha',     element: 'Fire'  },
  { sign: 'Virgo',       symbol: '♍', rashi: 'Kanya',     element: 'Earth' },
  { sign: 'Libra',       symbol: '♎', rashi: 'Tula',      element: 'Air'   },
  { sign: 'Scorpio',     symbol: '♏', rashi: 'Vrischika', element: 'Water' },
  { sign: 'Sagittarius', symbol: '♐', rashi: 'Dhanu',     element: 'Fire'  },
  { sign: 'Capricorn',   symbol: '♑', rashi: 'Makara',    element: 'Earth' },
  { sign: 'Aquarius',    symbol: '♒', rashi: 'Kumbha',    element: 'Air'   },
  { sign: 'Pisces',      symbol: '♓', rashi: 'Meena',     element: 'Water' },
] as const;

const PLANET_DASHA_BLURB: Record<string, string> = {
  Sun:     'Identity, authority, and self-expression take centre stage.',
  Moon:    'Emotional depth, home life, and intuitive shifts dominate.',
  Mars:    'Drive, courage, and bold action — but watch the temper.',
  Mercury: 'Communication, learning, and clever moves come naturally.',
  Jupiter: 'Growth, expansion, and wisdom — trust your inner compass.',
  Venus:   'Love, beauty, creativity, and pleasure flow through life now.',
  Saturn:  'Discipline, patience, and slow karmic gains shape this period.',
  Rahu:    'Unconventional ambitions and sudden shifts — buckle up.',
  Ketu:    'Detachment, spiritual insight, and quiet inner work.',
};

function daysUntil(iso?: string): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return Math.max(0, Math.ceil((d.getTime() - Date.now()) / 86_400_000));
}

function extractMinorLines(
  analysis?: { minorLines?: Record<string, { interpretation?: string; count?: number; present?: boolean }> } | null,
): MinorLines | undefined {
  const m = analysis?.minorLines;
  if (!m) return undefined;
  return {
    sun:      m.sunLine,
    marriage: m.marriageLines,
    children: m.childrenLines,
    health:   m.healthLine,
    travel:   m.travelLines,
    mars:     m.marsLine,
  };
}

function fmtYear(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.getFullYear().toString();
}

// REPORTS_DISABLED: removed report links from REPORTS array
type Report = { id: number; name: string; icon: IconName; accent: string; href: string; locked: boolean };
const REPORTS: Report[] = [
  { id: 1, name: 'Matchmaking',          icon: 'heart',     accent: '#E91E63', href: '/couple',  locked: false },
  { id: 5, name: 'Vastu Shastra',        icon: 'home2',     accent: '#d4a843', href: '/vastu',   locked: false },
  { id: 6, name: 'Divisional Charts',    icon: 'radar',     accent: '#a87fff', href: '/vargas',  locked: false },
  { id: 7, name: 'Numerology',           icon: 'gem',       accent: '#6366F1', href: '/reports/premium?tab=numerology', locked: true },
  { id: 8, name: 'Pandit & Puja',        icon: 'yogi',      accent: '#B8860B', href: '/pandit-puja', locked: true },
  { id: 9, name: 'Name Correction',      icon: 'scroll',    accent: '#F2CA50', href: '/name-correction',   locked: true },
  { id: 10, name: 'Mobile Numerology',   icon: 'gem',       accent: '#7C3AED', href: '/mobile-numerology', locked: true },
];

// Locked feature cards rendered inside Explore More. Hidden entirely from
// non-VIP users — only VIP phones see them, and even VIPs see them locked
// with a 5-tap unlock gate (useFeatureUnlock — persisted in localStorage).
// Emoji-only to match the existing Explore More aesthetic.
type LockedFeature = { name: string; emoji: string; href: string; unlockKey: string; subtitle: string };
const LOCKED_EXPLORE_FEATURES: LockedFeature[] = [
  { name: 'TAROT',      emoji: '🎴', href: '/tarot',      unlockKey: 'tarot-unlocked',      subtitle: 'CARDS' },
  { name: 'PAST LIFE',  emoji: '🕉️', href: '/past-life',  unlockKey: 'past-life-unlocked',  subtitle: 'KARMA' },
  { name: 'PRASHNA',    emoji: '🪔', href: '/prashna',    unlockKey: 'prashna-unlocked',    subtitle: 'ASK' },
  { name: 'MUHURTA',    emoji: '⏰', href: '/muhurta',    unlockKey: 'muhurta-unlocked',    subtitle: 'TIMING' },
  { name: 'VARSHAPHAL', emoji: '📆', href: '/varshaphal', unlockKey: 'varshaphal-unlocked', subtitle: 'YEARLY' },
  { name: 'GEMSTONE',   emoji: '💎', href: '/gemstone',   unlockKey: 'gemstone-unlocked',   subtitle: 'STONES' },
  { name: 'BABY NAMES', emoji: '👶', href: '/baby-names', unlockKey: 'baby-names-unlocked', subtitle: 'NAKSHATRA' },
  { name: 'REMEDIES',   emoji: '🌿', href: '/remedies',   unlockKey: 'remedies-unlocked',   subtitle: 'SACRED' },
  { name: 'KP SYSTEM',  emoji: '📐', href: '/kp-system',  unlockKey: 'kp-system-unlocked',  subtitle: 'PRECISION' },
  { name: 'GOCHAR',     emoji: '🌠', href: '/gochar',     unlockKey: 'gochar-unlocked',     subtitle: 'TRANSITS' },
];


interface PendingKundli {
  name: string;
  dob: string;
  tob: string;
  timestamp: number;
}

const PENDING_KEY = 'jyotish:pendingKundli';
const PENDING_TTL_MS = 3 * 60 * 1000; // safety net — clear stuck flags after 3 min

function readPendingKundli(): PendingKundli | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingKundli;
    if (!parsed?.name || !parsed?.dob || !parsed?.tob || !parsed?.timestamp) return null;
    if (Date.now() - parsed.timestamp > PENDING_TTL_MS) {
      localStorage.removeItem(PENDING_KEY);
      return null;
    }
    return parsed;
  } catch { return null; }
}

const DASH_TABS = ['today', 'personal', 'insights', 'palm'] as const;
type DashTab = typeof DASH_TABS[number];

function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const user = useStore((s) => s.user);
  const storeLanguage = useStore((s) => s.language);
  const credits = useStore((s) => s.credits);
  const avatarUrl = useStore((s) => s.avatarUrl);
  const setCharts = useStore((s) => s.setCharts);
  const setProfiles = useStore((s) => s.setProfiles);
  const { activeChart, activeProfile, charts, profiles, activeChartId, setActiveChartId, dataReady } = useActiveChart();
  const horoscopeQuery = useHoroscopeQuery();
  const horoscopeData = horoscopeQuery.data?.data;
  const horoscopePending = horoscopeQuery.data?.pending ?? false;
  // Show the skeleton both while the request is in flight AND while the server says
  // today's content is still being generated. Drops users out of skeleton only when
  // real content for today is in hand — never falls back to yesterday's reading.
  const horoscopeLoading = horoscopeQuery.isLoading || horoscopePending;
  const { data: panchang, isLoading: panchangLoading } = usePanchangQuery();

  // Self-heal: AuthProvider's loadUser runs once on app mount / SIGNED_IN. If
  // the user just completed onboarding (which inserts profile + chart), the
  // store may still be empty when the dashboard mounts. Refetch once before
  // rendering so we don't flash the "Generate Chart" empty state.
  const [bootCheckDone, setBootCheckDone] = useState(false);
  const bootRefetchStartedRef = useRef(false);
  useEffect(() => {
    if (!dataReady || bootCheckDone) return;
    if (charts.length > 0 && profiles.length > 0) {
      setBootCheckDone(true);
      return;
    }
    if (bootRefetchStartedRef.current) return;
    bootRefetchStartedRef.current = true;
    let cancelled = false;
    fetch('/api/dashboard/init')
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (cancelled) return;
        const d = json?.data;
        if (Array.isArray(d?.profiles)) setProfiles(d.profiles);
        if (Array.isArray(d?.charts)) setCharts(d.charts);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setBootCheckDone(true); });
    return () => { cancelled = true; };
  }, [dataReady, charts.length, profiles.length, bootCheckDone, setCharts, setProfiles]);

  const [horoscope, setHoroscope] = useState<Record<string, HoroscopePrediction>>({});
  const [chatInput, setChatInput] = useState('');
  const [selectedSignOverride, setSelectedSignOverride] = useState<string | null>(null);
  const [palmExpandedId, setPalmExpandedId] = useState<string | null>(null);
  const [readyBanner, setReadyBanner] = useState(false);
  const [referralPopup, setReferralPopup] = useState<null | {
    code: string;
    referrerBonus: number;
    inviteeBonus: number;
  }>(null);
  // Holds referral data after fetch; popup is shown only once 15 min of
  // cumulative app usage is reached (tracked across sessions in localStorage).
  const [pendingReferralData, setPendingReferralData] = useState<null | {
    code: string;
    referrerBonus: number;
    inviteeBonus: number;
  }>(null);
  const { showSuccess: showToastSuccess } = useTokenToast();
  const referralToastFiredRef = useRef(false);
  const signupBonusToastFiredRef = useRef(false);

  // Accumulate total app-usage time in localStorage (increments every 5 s).
  // Used by the referral popup gate below.
  const APP_TIME_KEY = 'jyotish:app_time_ms';
  const REFERRAL_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes
  useEffect(() => {
    const id = setInterval(() => {
      try {
        const prev = parseInt(localStorage.getItem(APP_TIME_KEY) ?? '0', 10);
        localStorage.setItem(APP_TIME_KEY, String(prev + 5_000));
      } catch { /* ignore */ }
    }, 5_000);
    return () => clearInterval(id);
  }, []);

  // Once referral data is ready, wait until cumulative usage hits 15 min.
  useEffect(() => {
    if (!pendingReferralData) return;
    const check = () => {
      try {
        return parseInt(localStorage.getItem(APP_TIME_KEY) ?? '0', 10) >= REFERRAL_THRESHOLD_MS;
      } catch { return false; }
    };
    if (check()) { setReferralPopup(pendingReferralData); return; }
    const id = setInterval(() => {
      if (check()) { setReferralPopup(pendingReferralData); clearInterval(id); }
    }, 5_000);
    return () => clearInterval(id);
  }, [pendingReferralData]);

  // Referral: one-time welcome popup for users who haven't seen it yet, and
  // a "+10 Dhanam credited" toast for invitees who just landed post-onboarding.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    fetch('/api/referral')
      .then((r) => (r.ok ? r.json() : null))
      .then(async (json) => {
        if (cancelled || !json?.success) return;
        const d = json.data as {
          referralCode: string;
          referrerBonus: number;
          inviteeBonus: number;
          popupSeen: boolean;
        };

        if (!referralToastFiredRef.current || !signupBonusToastFiredRef.current) {
          try {
            const hist = await fetch('/api/credits/history?pageSize=5').then((r) => (r.ok ? r.json() : null));
            const rows = (hist?.data ?? []) as Array<{ type: string; created_at: string; amount?: number }>;

            if (!referralToastFiredRef.current) {
              const latestReferral = rows.find((tx) => tx.type === 'referral');
              if (latestReferral) {
                const ageMs = Date.now() - new Date(latestReferral.created_at).getTime();
                if (ageMs < 90_000) {
                  referralToastFiredRef.current = true;
                  showToastSuccess(`+${d.inviteeBonus} Dhanam credited!`, 'Welcome bonus from your referral code');
                }
              }
            }

            // Signup welcome bonus — show once per device after first signup.
            // Window is generous (5 min) so the toast survives the onboarding flow.
            if (!signupBonusToastFiredRef.current) {
              const latestSignup = rows.find((tx) => tx.type === 'signup_bonus');
              const SEEN_KEY = 'jyotish:signup_bonus_toast_seen';
              let alreadySeen = false;
              try { alreadySeen = localStorage.getItem(SEEN_KEY) === '1'; } catch { /* ignore */ }
              if (latestSignup && !alreadySeen) {
                const ageMs = Date.now() - new Date(latestSignup.created_at).getTime();
                if (ageMs < 5 * 60_000) {
                  signupBonusToastFiredRef.current = true;
                  try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* ignore */ }
                  showToastSuccess(
                    `+${latestSignup.amount ?? 50} Dhanam credited!`,
                    'Welcome gift · worth ₹495. Use them on any reading.',
                  );
                }
              }
            }
          } catch {
            // ignore — toast is opportunistic
          }
        }

        // Queue the popup — shown only once 15 min of usage is accumulated
        if (!d.popupSeen) {
          setPendingReferralData({
            code: d.referralCode,
            referrerBonus: d.referrerBonus,
            inviteeBonus: d.inviteeBonus,
          });
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [user, showToastSuccess]);

  const dismissReferralPopup = useCallback(() => {
    setReferralPopup(null);
    fetch('/api/referral/dismiss-popup', { method: 'POST' }).catch(() => {});
  }, []);
  const [genDailyState, setGenDailyState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [genDailyResult, setGenDailyResult] = useState<{ total: number; success: number; failed: number; skipped: number } | null>(null);
  const fetchedSigns = useRef(new Set<string>());
  const rashiCarouselRef = useRef<HTMLDivElement | null>(null);
  // Persisted unlocks (numerology and any future 5-tap features). Read once
  // on mount; tiles whose href matches are rendered as unlocked Links.
  const [numerologyUnlocked, setNumerologyUnlocked] = useState(false);
  const [nameCorrectionUnlocked, setNameCorrectionUnlocked] = useState(false);
  const [mobileNumerologyUnlocked, setMobileNumerologyUnlocked] = useState(false);
  const [panditPujaUnlocked, setPanditPujaUnlocked] = useState(false);
  useEffect(() => {
    try {
      setNumerologyUnlocked(localStorage.getItem('numerology_unlocked') === '1');
      setNameCorrectionUnlocked(localStorage.getItem('name_correction_unlocked') === '1');
      setMobileNumerologyUnlocked(localStorage.getItem('mobile_numerology_unlocked') === '1');
      setPanditPujaUnlocked(localStorage.getItem('pandit_puja_unlocked') === '1');
    } catch { /* ignore */ }
  }, []);

  const lockedClickTimestamps = useRef<Map<string, number[]>>(new Map());
  const handleLockedCardClick = useCallback((href: string) => {
    const now = Date.now();
    const prev = (lockedClickTimestamps.current.get(href) ?? []).filter(t => now - t < 1500);
    prev.push(now);
    lockedClickTimestamps.current.set(href, prev);
    if (prev.length >= 5) {
      lockedClickTimestamps.current.set(href, []);
      // Numerology unlock: persist the flag so future visits skip the 5-tap and
      // auto-start the report. autostart=1 tells /reports/premium to fire
      // generation immediately from the active birth profile, no form.
      let target = href;
      if (href.includes('tab=numerology')) {
        try { localStorage.setItem('numerology_unlocked', '1'); } catch { /* ignore */ }
        target = href + (href.includes('?') ? '&' : '?') + 'autostart=1';
      } else if (href === '/name-correction') {
        // Auto-gen lite report; the page reads from feature_insights — no autostart needed.
        try { localStorage.setItem('name_correction_unlocked', '1'); } catch { /* ignore */ }
        setNameCorrectionUnlocked(true);
      } else if (href === '/mobile-numerology') {
        try { localStorage.setItem('mobile_numerology_unlocked', '1'); } catch { /* ignore */ }
        setMobileNumerologyUnlocked(true);
      } else if (href === '/pandit-puja') {
        try { localStorage.setItem('pandit_puja_unlocked', '1'); } catch { /* ignore */ }
        setPanditPujaUnlocked(true);
      }
      router.push(target);
    }
  }, [router]);
  const rashiItemRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const rashiUserScrollingRef = useRef(false);
  const rashiScrollEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Timestamp until which scroll events should be treated as caused by our
  // own programmatic scroll (not a user gesture). Prevents the scroll
  // listener from second-guessing the auto-center.
  const programmaticScrollUntilRef = useRef(0);
  const queryClient = useQueryClient();
  const palmUnlock = usePalmUnlock();
  const mantraJaapUnlock = useFeatureUnlock('mantra-jaap-unlocked');

  // VIP phone whitelist — these accounts see every locked/hidden card in
  // Best Selling Reports and Explore More as unlocked. Normalise both sides
  // to digits-only so it matches whether the DB stored "+919535960988",
  // "919535960988", or just the 10-digit local number.
  const VIP_PHONE_DIGITS = ['919693816242', '919535960988'];
  const userPhoneDigits = (user?.phone ?? '').replace(/\D/g, '');
  const isVipUser = !!userPhoneDigits && VIP_PHONE_DIGITS.some(p =>
    userPhoneDigits === p || userPhoneDigits.endsWith(p) || userPhoneDigits.slice(-10) === p.slice(-10),
  );

  // Dashboard tab state — URL-persisted via ?tab=<key>
  const urlTab = searchParams.get('tab');
  const rawTab: DashTab = (urlTab && (DASH_TABS as readonly string[]).includes(urlTab)) ? (urlTab as DashTab) : 'today';
  const activeTab: DashTab = (rawTab === 'palm' && !palmUnlock.unlocked && !isVipUser) ? 'today' : rawTab;
  const setActiveTab = useCallback((key: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (key === 'today') params.delete('tab'); else params.set('tab', key);
    const qs = params.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ''}`, { scroll: false });
  }, [searchParams, router, pathname]);
  const tabDefs = useMemo(() => [
    { key: 'today',    label: '☀ Today',     heading: 'YOUR DAILY HOROSCOPE' },
    { key: 'personal', label: '🪷 Personal', heading: 'FROM your ASTROLOGER' },
    { key: 'insights', label: '☸ Guna', heading: 'GUNA CHAKRA' },
  ], [palmUnlock.unlocked]);
  const activeHeading = tabDefs.find(t => t.key === activeTab)?.heading ?? 'YOUR DAILY HOROSCOPE';

  // Palm readings — full history for the user (cached forever; invalidated after upload/delete)
  interface PalmReading { id: string; hand: 'left' | 'right'; imageUrl: string; createdAt: string; lines: PalmLines; analysis?: { minorLines?: Record<string, { interpretation?: string; count?: number; present?: boolean }> } | null }
  const { data: palmData, isLoading: palmLoading } = useQuery<{ readings: PalmReading[]; count: number }>({
    queryKey: ['palm-list'],
    queryFn: async () => {
      const r = await fetch('/api/palm/list');
      if (!r.ok) return { readings: [], count: 0 };
      return r.json();
    },
    staleTime: Infinity,
    gcTime: Infinity,
  });
  const palmReadings = palmData?.readings ?? [];
  const palmCount = palmData?.count ?? 0;

  const handleDeletePalm = async (readingId: string) => {
    if (!window.confirm('Delete this palm reading? This cannot be undone.')) return;
    try {
      const r = await fetch(`/api/palm/${readingId}`, { method: 'DELETE' });
      if (!r.ok) throw new Error('delete failed');
      queryClient.invalidateQueries({ queryKey: ['palm-list'] });
      queryClient.invalidateQueries({ queryKey: ['palm-latest'] });
      if (palmExpandedId === readingId) setPalmExpandedId(null);
    } catch (e) {
      console.warn('[dashboard] palm delete failed', e);
      alert('Could not delete reading. Please try again.');
    }
  };

  useEffect(() => {
    if (!horoscopeData || Object.keys(horoscopeData).length === 0) return;
    setHoroscope(horoscopeData);
    Object.keys(horoscopeData).forEach(r => fetchedSigns.current.add(r));
  }, [horoscopeData]);

  // ── Pending kundli (skeleton state) ─────────────────────────────────────────
  // Set by /kundli/generate when the user clicks "Continue Exploring" while a
  // chart is being generated server-side. Cleared either when the matching
  // chart appears in the store, when the kundli_ready realtime event fires,
  // or when the safety TTL expires.
  const [pendingKundli, setPendingKundli] = useState<PendingKundli | null>(null);
  const [overlayDismissed, setOverlayDismissed] = useState(false);
  useEffect(() => {
    const p = readPendingKundli();
    setPendingKundli(p);
    if (p) setOverlayDismissed(false);
  }, []);

  // Lazy Apollo backfill: once per session, when the loaded user has no
  // apollo_enriched_at, kick off enrichment. The endpoint is idempotent —
  // it short-circuits if Apollo has already run. Fire-and-forget; the
  // AstrologerReviewBanner will appear once the row update lands.
  const apolloBackfillFiredRef = useRef(false);
  useEffect(() => {
    if (apolloBackfillFiredRef.current) return;
    if (!user?.id) return;
    if (user.apollo_enriched_at) return;
    apolloBackfillFiredRef.current = true;
    void fetch('/api/internal/apollo-enrich', { method: 'POST', credentials: 'include' })
      .catch(() => { /* best-effort */ });
  }, [user?.id, user?.apollo_enriched_at]);

  const clearPending = useCallback(() => {
    try { localStorage.removeItem(PENDING_KEY); } catch { /* ignore */ }
    setPendingKundli(null);
  }, []);

  // If the matching chart is already in the store (e.g. chart finished before
  // user reached the dashboard, or after a refetch), switch to it and clear.
  useEffect(() => {
    if (!pendingKundli) return;
    const nameLower = pendingKundli.name.toLowerCase();
    const matchedProfile = profiles.find(
      (p) => p.name.toLowerCase() === nameLower && p.dob === pendingKundli.dob && p.tob === pendingKundli.tob,
    );
    if (!matchedProfile) return;
    const matchedChart = charts.find((c) => c.profile_id === matchedProfile.id);
    if (!matchedChart) return;
    setActiveChartId(matchedChart.id);
    clearPending();
  }, [pendingKundli, profiles, charts, setActiveChartId, clearPending]);

  // Realtime: on kundli_ready, refetch profiles+charts into the store. The
  // effect above then auto-switches the active chart and clears the skeleton.
  useEffect(() => {
    if (!user || !pendingKundli) return;
    let cancelled = false;

    const refetchChartsAndProfiles = async () => {
      try {
        const [profilesRes, chartsRes] = await Promise.all([
          fetch('/api/profiles').then((r) => r.ok ? r.json() : null).catch(() => null),
          fetch('/api/kundli').then((r) => r.ok ? r.json() : null).catch(() => null),
        ]);
        if (cancelled) return;
        if (Array.isArray(profilesRes?.data)) {
          setProfiles(profilesRes.data);
          queryClient.setQueryData(queryKeys.profiles, profilesRes.data);
        }
        if (Array.isArray(chartsRes?.data)) {
          setCharts(chartsRes.data as KundliChartRow[]);
          queryClient.setQueryData(queryKeys.charts, chartsRes.data);
        }
      } catch { /* silent — auto-clear effect will fire on next refetch */ }
    };

    const supabase = createClient();
    const channel = supabase
      .channel(`dashboard-kundli-ready:${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        (payload) => {
          const n = payload.new as { type?: string; metadata?: Record<string, unknown> };
          if (n.type !== 'kundli_ready') return;
          const chartId = (n.metadata?.chartId as string | undefined) ?? null;
          if (chartId) setActiveChartId(chartId);
          setReadyBanner(true);
          refetchChartsAndProfiles();
        },
      )
      .subscribe();

    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [user, pendingKundli, setCharts, setProfiles, setActiveChartId, queryClient]);

  // Safety net — clear the skeleton if nothing arrives within the TTL.
  useEffect(() => {
    if (!pendingKundli) return;
    const remaining = Math.max(0, PENDING_TTL_MS - (Date.now() - pendingKundli.timestamp));
    const t = setTimeout(clearPending, remaining);
    return () => clearTimeout(t);
  }, [pendingKundli, clearPending]);

  const displayName =
    user?.name?.trim() ||
    activeProfile?.name?.trim() ||
    profiles.find((p) => p.is_primary)?.name?.trim() ||
    profiles[0]?.name?.trim() ||
    user?.email?.split('@')[0] ||
    '';
  const firstName = displayName.split(' ')[0] || 'Seeker';
  const greetingHour = new Date().getHours();
  const todayStr = new Date().toISOString().split('T')[0];
  const greeting = greetingHour < 12 ? 'Good Morning' : greetingHour < 17 ? 'Good Afternoon' : 'Good Evening';

  const dashaInfo = useMemo(() => {
    if (!activeChart) return null;
    const v = (activeChart.dasha_data as {
      vimshottari?: {
        currentMahadasha?: { planet?: string; startDate?: string; endDate?: string };
        currentAntardasha?: { planet?: string; startDate?: string; endDate?: string };
        currentPratyantardasha?: { planet?: string };
        mahadashas?: Array<{ planet?: string; isActive?: boolean }>;
      };
    } | undefined)?.vimshottari;
    if (!v?.currentMahadasha?.planet) return null;
    const idx = (v.mahadashas ?? []).findIndex(m => m.isActive);
    return {
      mahadasha: v.currentMahadasha.planet,
      antardasha: v.currentAntardasha?.planet ?? null,
      pratyantar: v.currentPratyantardasha?.planet ?? null,
      mdEnd: v.currentMahadasha.endDate,
      adEnd: v.currentAntardasha?.endDate,
      phaseIndex: idx >= 0 ? idx : null,
    };
  }, [activeChart]);

  // Sade Sati depends on the *current* Saturn transit, not the natal chart, so
  // the value stored in dosha_data goes stale (and was historically computed
  // with a hardcoded saturnLongitude=0). Recompute it live from the user's
  // natal Moon sign, falling back to stored data if the fetch fails.
  const liveSadeSatiQuery = useQuery({
    queryKey: ['transits', 'sade-sati', activeChart?.id],
    enabled: !!activeChart,
    staleTime: 6 * 3600 * 1000,
    queryFn: async () => {
      if (!activeChart) return null;
      const cd = activeChart.chart_data as { planets?: Array<{ planet?: string; name?: string; sign?: string }> } | undefined;
      const moonSign = (cd?.planets ?? []).find((p) => (p.planet ?? p.name) === 'Moon')?.sign;
      if (!moonSign) return null;
      const r = await fetch(`/api/transits/sade-sati?moonSign=${encodeURIComponent(moonSign)}`);
      if (!r.ok) return null;
      const j = await r.json();
      return (j?.data ?? null) as null | {
        active: boolean;
        phase: 'rising' | 'peak' | 'setting' | 'none';
        saturnSign?: string;
        moonSign?: string;
      };
    },
  });

  const userConditions = useMemo(() => {
    if (!activeChart) return [] as Array<{ label: string; tone: 'warn' | 'danger' | 'muted' }>;
    type Dosha = { present?: boolean; active?: boolean; severity?: string; phase?: string };
    const d = (activeChart.dosha_data ?? {}) as {
      mangal?: Dosha;
      kaalSarp?: Dosha;
      sadeSati?: Dosha & { saturnSign?: string; moonSign?: string };
      pitra?: Dosha;
      kemDruma?: Dosha;
      grahan?: Dosha;
      guruChandal?: Dosha;
    };
    const out: Array<{ label: string; tone: 'warn' | 'danger' | 'muted' }> = [];

    const sadeSati = liveSadeSatiQuery.data ?? d.sadeSati;

    if (sadeSati?.active) {
      const phase = sadeSati.phase;
      const phaseLabel = phase === 'peak' ? 'Peak' : phase === 'rising' ? 'Rising' : phase === 'setting' ? 'Ending' : '';
      out.push({
        label: phaseLabel ? `Sade Sati · ${phaseLabel}` : 'Sade Sati',
        tone: 'warn',
      });
    }

    // Dhaiya — Saturn transiting 4th (Kantaka Shani) or 8th (Ashtama Shani) from natal Moon
    if (sadeSati?.saturnSign && sadeSati?.moonSign) {
      const moonIdx = (SIGNS as readonly string[]).indexOf(sadeSati.moonSign);
      const satIdx = (SIGNS as readonly string[]).indexOf(sadeSati.saturnSign);
      if (moonIdx >= 0 && satIdx >= 0) {
        const houseFromMoon = ((satIdx - moonIdx + 12) % 12) + 1;
        if (houseFromMoon === 4) out.push({ label: 'Kantaka Shani', tone: 'warn' });
        else if (houseFromMoon === 8) out.push({ label: 'Dhaiya', tone: 'warn' });
      }
    }

    if (d.mangal?.present) out.push({ label: 'Mangal Dosha', tone: 'danger' });
    if (d.kaalSarp?.present) out.push({ label: 'Kaal Sarp', tone: 'danger' });
    if (d.grahan?.present) out.push({ label: 'Grahan Dosha', tone: 'danger' });
    if (d.guruChandal?.present) out.push({ label: 'Guru Chandal', tone: 'warn' });
    if (d.pitra?.present) out.push({ label: 'Pitra Dosha', tone: 'muted' });
    if (d.kemDruma?.present) out.push({ label: 'Kemdruma', tone: 'muted' });

    return out;
  }, [activeChart, liveSadeSatiQuery.data]);

  const birthChartData = useMemo(() => {
    if (!activeChart) return null;
    const cd = activeChart.chart_data as { houses?: HouseData[]; planets?: PlanetPosition[]; ascendant?: { sign?: ZodiacSign } } | undefined;
    const houses = cd?.houses ?? [];
    const planets = cd?.planets ?? [];
    if (!houses.length || !planets.length) return null;
    const ascSign = cd?.ascendant?.sign;
    const ascHouse = ascSign ? (houses.find((h) => h.sign === ascSign)?.house ?? 1) : 1;
    return { chartData: { houses, planets }, ascendantHouse: ascHouse };
  }, [activeChart]);

  // True while a chart is actively being generated — either via the local
  // pending flag set on /kundli/generate, or because a chart row exists but
  // chart_data hasn't been populated yet. Drives the loading state on both
  // the dasha and birth chart cards so they stay in sync.
  const chartGenerating = !!pendingKundli || (!!activeChart && !birthChartData);
  const generatingName = pendingKundli?.name ?? activeProfile?.name ?? null;

  const userMoonSign = useMemo(() => {
    if (!activeChart) return null;
    const cd = activeChart.chart_data as Record<string, unknown> | undefined;
    const planets = (cd?.planets ?? []) as Array<{ planet?: string; name?: string; sign?: string }>;
    const moon = planets.find(p => (p.planet ?? p.name) === 'Moon');
    const sign = moon?.sign;
    return (sign && (SIGNS as readonly string[]).includes(sign)) ? sign : null;
  }, [activeChart]);

  const moonRashi = userMoonSign ? SIGN_RASHI[userMoonSign] : null;
  const dailyHoroscope = moonRashi ? horoscope[moonRashi] : null;

  // One-time background warmup: generate guna_chakra content right after login
  // so it's ready when the user visits the Personality tab. Skips if already done.
  const gunaWarmupFired = useRef(false);
  useEffect(() => {
    if (!activeChartId || gunaWarmupFired.current) return;
    const key = `guna_warmed_${activeChartId}`;
    if (typeof window !== 'undefined' && localStorage.getItem(key)) return;
    gunaWarmupFired.current = true;
    const lang = storeLanguage || (user as Record<string, unknown> | null)?.language as string || 'en';
    fetch(`/api/guna-chakra/${activeChartId}?language=${lang}`)
      .then(() => localStorage.setItem(key, '1'))
      .catch(() => {});
  }, [activeChartId, storeLanguage, user]);
  const isPremium = (user as Record<string, unknown> | null)?.is_premium as boolean | undefined;

  // Default to user's moon sign, allow override via selectedSignOverride
  const selectedSign = selectedSignOverride ?? userMoonSign;
  const setSelectedSign = setSelectedSignOverride;

  // True only once the user has clicked / scrolled to a sign. The prediction
  // card stays in an empty state until then so the reading isn't shown unprompted.
  const hasUserSelected = selectedSignOverride !== null;

  const activeSelectedSign = selectedSign ?? userMoonSign;
  const activeSelectedRashi = activeSelectedSign ? SIGN_RASHI[activeSelectedSign] : moonRashi;
  const activeHoroscope = activeSelectedRashi ? horoscope[activeSelectedRashi] : dailyHoroscope;

  // Center the selected rashi card in the carousel. The previous version
  // scheduled a single scrollTo two frames after mount, which on mobile
  // often fires before layout/scroll-snap have settled — the result was the
  // carousel staying at scrollLeft=0 (Aries) even though selectedSign was
  // already the user's moon sign. Retry each frame until the carousel and
  // target tile have non-zero layout sizes, then commit the scroll.
  useEffect(() => {
    if (!activeSelectedSign || horoscopeLoading) return;
    if (rashiUserScrollingRef.current) return;
    let cancelled = false;
    let attempts = 0;
    const run = () => {
      if (cancelled) return;
      const container = rashiCarouselRef.current;
      const el = rashiItemRefs.current[activeSelectedSign];
      if (!container || !el || container.clientWidth === 0 || el.offsetWidth === 0) {
        if (++attempts < 30) requestAnimationFrame(run);
        return;
      }
      const target = el.offsetLeft + el.offsetWidth / 2 - container.clientWidth / 2;
      const max = container.scrollWidth - container.clientWidth;
      const clamped = Math.max(0, Math.min(target, max));
      // Mark the next ~400ms as our own scroll so onScroll doesn't reinterpret
      // it as a user gesture and override the selection.
      programmaticScrollUntilRef.current = performance.now() + 400;
      container.scrollLeft = clamped;
    };
    requestAnimationFrame(run);
    return () => { cancelled = true; };
  }, [activeSelectedSign, horoscopeLoading]);

  // While user scrolls the carousel, sync selection to whichever card sits in the center.
  // Includes horoscopeLoading in deps so the listener attaches once the carousel
  // actually mounts (it doesn't exist during the skeleton phase).
  useEffect(() => {
    if (horoscopeLoading) return;
    const container = rashiCarouselRef.current;
    if (!container) return;
    const onScroll = () => {
      // Ignore scroll events fired by our own programmatic auto-center.
      if (performance.now() < programmaticScrollUntilRef.current) return;
      rashiUserScrollingRef.current = true;
      if (rashiScrollEndTimerRef.current) clearTimeout(rashiScrollEndTimerRef.current);
      rashiScrollEndTimerRef.current = setTimeout(() => {
        const rect = container.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        let closest: { sign: string; dist: number } | null = null;
        for (const r of RASHI_DATA) {
          const el = rashiItemRefs.current[r.sign];
          if (!el) continue;
          const er = el.getBoundingClientRect();
          const cx = er.left + er.width / 2;
          const dist = Math.abs(cx - centerX);
          if (!closest || dist < closest.dist) closest = { sign: r.sign, dist };
        }
        if (closest && closest.sign !== activeSelectedSign) setSelectedSign(closest.sign);
        rashiUserScrollingRef.current = false;
      }, 90);
    };
    container.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', onScroll);
      if (rashiScrollEndTimerRef.current) clearTimeout(rashiScrollEndTimerRef.current);
    };
  }, [activeSelectedSign, horoscopeLoading]);

  const handleChatSubmit = () => {
    if (!chatInput.trim()) return;
    router.push(`/chat?q=${encodeURIComponent(chatInput.trim())}`);
  };

  if (!dataReady || !bootCheckDone) {
    return (
      <div className="min-h-screen bg-bg flex flex-col items-center justify-center gap-6 px-6">
        <div className="text-5xl animate-pulse">🪐</div>
        <WisdomLoader section="dasha" size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg">

      {/* ── GENERATING OVERLAY ── blocks dashboard until chart is ready or user dismisses */}
      <GeneratingOverlay
        visible={!!pendingKundli && !overlayDismissed}
        type="kundli"
        name={pendingKundli?.name}
        onContinue={() => setOverlayDismissed(true)}
      />

      {/* ── REFER & EARN WELCOME ── one-time, dismissible with "Maybe later" */}
      <ReferralWelcomeModal
        open={!!referralPopup}
        code={referralPopup?.code ?? ''}
        referrerBonus={referralPopup?.referrerBonus ?? 20}
        inviteeBonus={referralPopup?.inviteeBonus ?? 10}
        onDismiss={dismissReferralPopup}
      />

      {/* ── ASTROLOGER REVIEW BANNER ── (sticky; auto-removes when reveal_at passes) */}
      <AstrologerReviewBanner />

      {/* ── READY BANNER ── */}
      {readyBanner && (
        <motion.div
          initial={{ y: -64, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 320, damping: 28 }}
          style={{ position: 'sticky', top: 0, zIndex: 60, padding: '8px 16px 4px', paddingTop: 'max(8px, env(safe-area-inset-top))' }}
        >
          <button
            type="button"
            onClick={() => setReadyBanner(false)}
            className="flex items-center gap-3 w-full bg-primary text-white border-none rounded-2xl px-4 py-2.5 cursor-pointer"
            style={{ boxShadow: '0 4px 24px rgba(212, 175, 55,0.35)' }}
          >
            <span style={{ fontSize: 20 }}>✦</span>
            <div style={{ flex: 1, textAlign: 'left' }}>
              <p style={{ fontSize: 13, fontWeight: 700, margin: 0, lineHeight: 1.3 }}>Your Kundli is ready</p>
              <p style={{ fontSize: 10, margin: 0, opacity: 0.72, lineHeight: 1.4 }}>Tap to begin using the application</p>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>
          </button>
        </motion.div>
      )}

      {/* ── TOP SECTION ── */}
      <div className="relative bg-bg px-4 lg:px-8 pt-6 pb-8">

        {/* Greeting card — yogi avatar in glass ring + namaste headline */}
        <div className="mb-4 rounded-2xl p-4 border border-border backdrop-blur-[8px] shadow-[0_0_18px_rgba(212,175,55,0.12)] relative overflow-hidden" style={{ background: 'var(--card-bg)' }}>
          <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(242,202,80,0.18) 0%, transparent 70%)' }} />
          <div className="relative flex items-center gap-3">
            <div className="relative flex-shrink-0">
              <div className="absolute inset-[-4px] rounded-full j-glow-pulse" style={{ background: 'radial-gradient(circle, rgba(242,202,80,0.35) 0%, transparent 70%)' }} />
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={firstName}
                  referrerPolicy="no-referrer"
                  className="relative w-14 h-14 rounded-full object-cover border border-[rgba(242,202,80,0.45)]"
                />
              ) : (
                <div className="relative w-14 h-14 rounded-full flex items-center justify-center bg-surface-3 border border-[rgba(242,202,80,0.45)] text-accent">
                  <Icon name="yogi" size={26} />
                </div>
              )}
            </div>
            <div>
              <p className="j-display !text-[14px] font-semibold text-text uppercase tracking-[0.04em]">
                Namaste, {firstName}!
              </p>
              <p className="text-xs text-text-muted mt-0.5">
                {greetingHour < 12 ? 'The stars are aligned for you this morning.'
                  : greetingHour < 17 ? 'The stars are aligned for you this afternoon.'
                  : 'The stars are aligned for you this evening.'}
              </p>
            </div>
          </div>
        </div>

        {/* Today's Panchang strip — at-a-glance daily signal */}
        {(() => {
          const p = panchang as Record<string, Record<string, string> | string> | null;
          const pStr = (key: string): string | null => {
            const v = p?.[key];
            if (typeof v === 'string') return v;
            if (v && typeof v === 'object') return (v as { name?: string }).name ?? null;
            return null;
          };
          const tithi = pStr('tithi');
          const nakshatra = pStr('nakshatra');
          const sunrise = pStr('sunrise');
          const sunset = pStr('sunset');

          if (!panchang && panchangLoading) {
            return (
              <div className="mb-4 rounded-2xl border border-border bg-surface p-3 flex items-stretch gap-3">
                <div className="flex-1 h-10 rounded-md bg-surface-2 animate-pulse" />
                <div className="flex-1 h-10 rounded-md bg-surface-2 animate-pulse" />
                <div className="hidden sm:block flex-1 h-10 rounded-md bg-surface-2 animate-pulse" />
              </div>
            );
          }

          if (!tithi && !nakshatra) return null;

          return null;
        })()}

        {/* Admin: Generate Daily Horoscopes for All Users */}
        {user?.is_admin && (
          <div className="mb-4 flex items-center gap-3 p-3 rounded-2xl border border-border bg-surface">
            <span className="text-base">⚙️</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-text">Admin: Generate Daily Horoscopes</p>
              {genDailyResult && (
                <p className="text-[11px] text-text-muted mt-0.5">
                  Done — {genDailyResult.success}/{genDailyResult.total} generated
                  {genDailyResult.failed > 0 ? `, ${genDailyResult.failed} failed` : ''}
                  {genDailyResult.skipped > 0 ? `, ${genDailyResult.skipped} skipped` : ''}
                </p>
              )}
              {genDailyState === 'error' && (
                <p className="text-[11px] text-danger mt-0.5">Request failed — check console</p>
              )}
            </div>
            <button
              type="button"
              disabled={genDailyState === 'loading'}
              onClick={async () => {
                setGenDailyState('loading');
                setGenDailyResult(null);
                try {
                  const res = await fetch('/api/admin/generate-daily-horoscopes', { method: 'POST' });
                  if (!res.ok) throw new Error(await res.text());
                  const data = await res.json();
                  setGenDailyResult(data);
                  setGenDailyState('done');
                } catch (err) {
                  console.error('[generate-daily]', err);
                  setGenDailyState('error');
                }
              }}
              className="flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-semibold bg-primary/10 text-primary border border-primary/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {genDailyState === 'loading' ? 'Running…' : 'Run Now'}
            </button>
          </div>
        )}

        {/* Current Dasha Widget */}
        {chartGenerating ? (
          <div
            className="block rounded-2xl p-4 border border-border bg-surface mb-4 relative overflow-hidden"
          >
            {/* Shimmer sweep */}
            <motion.div
              aria-hidden
              className="absolute inset-0 pointer-events-none"
              style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(212, 175, 55,0.10) 50%, transparent 100%)' }}
              animate={{ x: ['-100%', '100%'] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: 'linear' }}
            />
            <div className="flex items-center justify-between mb-3 relative">
              <h3 className="text-sm font-bold text-text flex items-center gap-2">
                <span>🌙</span>
                YOUR CURRENT DASHA
              </h3>
              <span
                className="text-[10px] px-2 py-1 rounded-full font-semibold flex items-center gap-1.5 bg-primary/10 text-primary"
              >
                <motion.span
                  className="w-1.5 h-1.5 rounded-full bg-primary"
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
                />
                Generating chart…
              </span>
            </div>
            <p className="text-xs leading-relaxed mb-3 relative text-text-muted">
              {generatingName ? (
                <>Computing <span className="font-semibold text-text">{generatingName}</span>&rsquo;s birth chart. All sections will unlock automatically — no need to refresh.</>
              ) : (
                <>Computing your birth chart. All sections will unlock automatically — no need to refresh.</>
              )}
            </p>
            <div className="flex gap-3 relative">
              <div className="flex-1 h-12 rounded-xl animate-pulse bg-surface-2 border border-border" />
              <div className="flex-1 h-12 rounded-xl animate-pulse bg-surface-2 border border-border" />
            </div>
          </div>
        ) : (
        <Link
          href={dashaInfo?.mahadasha
            ? `/life-journey?${activeChartId ? `chart=${activeChartId}&` : ''}tab=present`
            : '/kundli/generate'}
          className="block no-underline rounded-2xl p-5 border border-[rgba(242,202,80,0.30)] backdrop-blur-[8px] shadow-[0_0_22px_rgba(212,175,55,0.18)] mb-4 active:scale-[0.99] transition-transform relative overflow-hidden"
          style={{ background: 'var(--card-bg)' }}
        >
          <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(242,202,80,0.12) 0%, transparent 70%)' }} />
          <div className="relative flex items-start justify-between mb-3 gap-3">
            <div className="flex items-center gap-2">
              <span className="text-accent text-lg leading-none">✦</span>
              <h3 className="j-display text-[15px] text-accent font-semibold uppercase tracking-[0.10em] leading-tight">
                Your Current<br/>Dasha
              </h3>
            </div>
            {dashaInfo?.mahadasha ? (
              <span
                className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full font-semibold bg-[linear-gradient(135deg,#D4AF37,#B8893F)] shadow-[0_0_12px_rgba(212,175,55,0.40)] whitespace-nowrap"
                style={{ color: 'var(--bg)' }}
              >
                <Planet3DInline planet={dashaInfo.mahadasha} size={20} />
                {dashaInfo.mahadasha} Mahadasha
              </span>
            ) : (
              <span className="text-[11px] px-3 py-1.5 rounded-full font-semibold bg-surface-3 border border-[rgba(242,202,80,0.30)] text-accent whitespace-nowrap">
                Generate Chart →
              </span>
            )}
          </div>
          {dashaInfo?.mahadasha ? (
            <>
              <p className="relative text-[13px] leading-relaxed mb-4 text-text-2">
                <span className="font-semibold text-text">{dashaInfo.mahadasha} Mahadasha</span>
                {' '}— {PLANET_DASHA_BLURB[dashaInfo.mahadasha] ?? 'A significant cosmic chapter is active.'}
              </p>
              <div className="relative flex flex-wrap items-center gap-2">
                {dashaInfo.mdEnd && (
                  <span className="inline-flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-full font-semibold bg-surface-3 border border-border text-text-2">
                    <Icon name="calendar" size={12} className="text-accent" />
                    Ends {fmtYear(dashaInfo.mdEnd) ?? '—'}
                  </span>
                )}
                {userConditions.map((c) => {
                  const isWarn = c.tone === 'warn' || c.tone === 'danger';
                  return (
                    <span
                      key={c.label}
                      className={`inline-flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-full font-semibold border ${
                        c.tone === 'danger'
                          ? 'bg-danger/10 text-danger border-danger/25'
                          : c.tone === 'warn'
                          ? 'bg-[rgba(242,202,80,0.10)] text-accent border-[rgba(242,202,80,0.30)]'
                          : 'bg-surface-3 text-text-muted border-border'
                      }`}
                    >
                      <span className={isWarn ? 'text-accent' : 'text-text-muted'}>☀</span>
                      {c.label}
                    </span>
                  );
                })}
              </div>
            </>
          ) : (
            <p className="relative text-[13px] leading-relaxed text-text-2">
              Generate your Kundli to unlock personalised Dasha insights and life predictions.
            </p>
          )}
        </Link>
        )}

        {/* Birth Chart — only render once a chart exists. While generating,
            show a loading skeleton (even if a prior chart still has data, so
            we never expose an "Explore Full Chart" CTA for stale data while a
            new one is being computed); when the chart row hasn't been created
            at all (first-time user), hide the card so the dasha card's
            "Generate Chart" CTA carries the empty state on its own. */}
        {chartGenerating ? null : birthChartData && activeChart ? (
          <DashboardBirthChartCard
            chartData={activeChart.chart_data as unknown as import('@aroha-astrology/shared').ChartData}
            divisionalCharts={activeChart.divisional_charts as Record<string, unknown> | null}
            kundliChartId={activeChartId}
            activeProfile={activeProfile}
          />
        ) : null}
        {chartGenerating && (
          <div
            className="block rounded-2xl p-4 border border-border bg-surface mb-4 relative overflow-hidden"
          >
            <motion.div
              aria-hidden
              className="absolute inset-0 pointer-events-none"
              style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(212, 175, 55,0.10) 50%, transparent 100%)' }}
              animate={{ x: ['-100%', '100%'] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: 'linear' }}
            />
            <div className="flex items-center justify-between mb-3 relative">
              <h3 className="text-sm font-bold text-text flex items-center gap-2">
                <span>✦</span>
                YOUR BIRTH CHART
              </h3>
              <span className="text-[10px] px-2 py-1 rounded-full font-semibold flex items-center gap-1.5 bg-primary/10 text-primary">
                <motion.span
                  className="w-1.5 h-1.5 rounded-full bg-primary"
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
                />
                Generating chart…
              </span>
            </div>
            <p className="text-xs leading-relaxed mb-3 relative text-text-muted">
              {generatingName ? (
                <>Drawing <span className="font-semibold text-text">{generatingName}</span>&rsquo;s North Indian chart. This usually takes a few seconds — no need to refresh.</>
              ) : (
                <>Drawing your North Indian chart. This usually takes a few seconds — no need to refresh.</>
              )}
            </p>
            <div className="flex justify-center py-6 relative">
              <div className="w-32 h-32 rounded-xl animate-pulse bg-surface-2 border border-border" />
            </div>
          </div>
        )}

        {/* Daily Horoscope — tabbed */}
        <div className="mb-4 overflow-hidden">
          {/* Pill tabs — categorise the sections below */}
          <div className="mb-3">
            <PillTabs
              tabs={tabDefs.map(({ key, label }) => ({ key, label }))}
              active={activeTab}
              onChange={setActiveTab}
            />
          </div>

          {/* Header — title switches with active tab.
              Semantic h2 + gold pulse dot establishes this as the
              primary action on the dashboard (Card tone='primary'
              equivalent, applied to a hand-rolled section). */}
          <div className="flex items-center justify-between mb-1">
            <h2 className="j-h2 text-accent flex items-center gap-2">
              <span
                aria-hidden="true"
                className={`inline-block h-2 w-2 rounded-full ${activeTab === 'personal' ? 'bg-red-500' : 'bg-primary'}`}
                style={{ boxShadow: activeTab === 'personal' ? '0 0 8px rgba(239,68,68,0.7)' : '0 0 8px var(--glow-bright)' }}
              />
              {activeHeading}
            </h2>
            <p className="text-[10px] text-text-muted">
              {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
            </p>
          </div>
          {activeTab === 'today' && (
            <>
              <p className="text-sm font-semibold text-text mb-1">Select any sign to know more</p>
              <p className="text-xs text-text-muted leading-relaxed mb-3">
                This is a generalised prediction based on the moon sign. For an accurate reading based on your birth chart, tap{' '}
                <button
                  onClick={() => setActiveTab('personal')}
                  className="text-primary underline underline-offset-2 cursor-pointer"
                >
                  Personal
                </button>.
              </p>
            </>
          )}

          {/* mode="sync" (default) — new tab mounts immediately while old exits,
              so the dashboard feels instant on tap. Individual panels show their
              own skeletons while their data lands. */}
          <AnimatePresence initial={false}>
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4, position: 'absolute' }}
            transition={{ duration: 0.16, ease: [0.25, 0.1, 0.25, 1] }}
            className="relative w-full"
          >
          <TabPanel activeKey={activeTab} tabKey="today">
          {horoscopeLoading ? (
            <>
              {/* Status line — tells the user the skeleton isn't a broken UI.
                  When `horoscopePending` is true the server is actively composing today's reading;
                  otherwise we're just on the first network roundtrip. */}
              <div className="flex items-center gap-2 mb-2 text-[11px] text-text-muted">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary animate-pulse" aria-hidden />
                <span>
                  {horoscopePending
                    ? 'Composing today’s reading… this can take a moment. We’ll refresh automatically.'
                    : 'Loading today’s reading…'}
                </span>
              </div>
              {/* Skeleton carousel */}
              <div
                className="relative flex gap-2 overflow-hidden pb-3 pt-3 mb-3"
                style={{
                  paddingLeft: 'calc(50% - 50px)',
                  paddingRight: 'calc(50% - 50px)',
                  maskImage: 'linear-gradient(to right, transparent, black 12%, black 88%, transparent)',
                  WebkitMaskImage: 'linear-gradient(to right, transparent, black 12%, black 88%, transparent)',
                }}
              >
                {[...Array(3)].map((_, i) => (
                  <div
                    key={i}
                    className="flex-shrink-0 w-[100px] h-[140px] rounded-2xl animate-pulse bg-surface-2 border border-border"
                  />
                ))}
              </div>
              {/* Skeleton content */}
              <div
                className="rounded-2xl p-4 border border-border bg-surface relative overflow-hidden"
              >
                <motion.div
                  aria-hidden
                  className="absolute inset-0 pointer-events-none"
                  style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(212, 175, 55,0.10) 50%, transparent 100%)' }}
                  animate={{ x: ['-100%', '100%'] }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: 'linear' }}
                />
                <div className="relative space-y-3">
                  <div className="h-4 w-32 rounded animate-pulse bg-surface-2" />
                  <div className="h-12 w-full rounded animate-pulse bg-surface-2" />
                  <div className="grid grid-cols-3 gap-2">
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="h-16 rounded-xl animate-pulse bg-surface-2" />
                    ))}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Rashi Carousel — coverflow style (center-focused) */}
          <div
            ref={rashiCarouselRef}
            className="relative flex gap-2 overflow-x-auto overflow-y-hidden pb-3 pt-3 mb-3 snap-x snap-mandatory"
            style={{
              scrollbarWidth: 'none',
              WebkitOverflowScrolling: 'touch',
              paddingLeft: 'calc(50% - 50px)',
              paddingRight: 'calc(50% - 50px)',
              maskImage: 'linear-gradient(to right, transparent, black 12%, black 88%, transparent)',
              WebkitMaskImage: 'linear-gradient(to right, transparent, black 12%, black 88%, transparent)',
            }}
          >
            {RASHI_DATA.map((r, idx) => {
              const isSelected = activeSelectedSign === r.sign;
              const selectedIdx = RASHI_DATA.findIndex(x => x.sign === activeSelectedSign);
              const distance = selectedIdx >= 0 ? Math.abs(idx - selectedIdx) : 99;
              const isMoon = userMoonSign === r.sign;
              const elementColors: Record<string, string> = { Fire: '#FF6B4A', Earth: '#8B7355', Air: '#7C3AED', Water: '#3B82F6' };
              const elemColor = elementColors[r.element] ?? '#FFA07A';
              const signColors: Record<string, string> = {
                Aries: '#FF4444', Taurus: '#22C55E', Gemini: '#FBBF24', Cancer: '#E0E7FF',
                Leo: '#FB923C', Virgo: '#16A34A', Libra: '#38BDF8', Scorpio: '#DC2626',
                Sagittarius: '#A855F7', Capricorn: '#64748B', Aquarius: '#06B6D4', Pisces: '#10B981'
              };
              const signColor = signColors[r.sign] ?? '#FFA07A';
              const scale = isSelected ? 1.08 : distance === 1 ? 0.88 : distance === 2 ? 0.74 : 0.62;
              const opacity = isSelected ? 1 : distance === 1 ? 0.85 : distance === 2 ? 0.55 : 0.35;
              return (
                <button
                  key={r.sign}
                  ref={(el) => { rashiItemRefs.current[r.sign] = el; }}
                  onClick={() => setSelectedSign(r.sign)}
                  className="relative snap-center flex-shrink-0 w-[100px] rounded-2xl text-center flex flex-col items-center transition-all duration-300 ease-out"
                  style={{
                    background: isSelected
                      ? 'var(--surface-3)'
                      : 'var(--glass-bg)',
                    backdropFilter: 'blur(8px)',
                    WebkitBackdropFilter: 'blur(8px)',
                    border: isSelected
                      ? '1px solid rgba(242,202,80,0.55)'
                      : isMoon
                        ? '1px solid rgba(242,202,80,0.30)'
                        : '1px solid var(--border)',
                    boxShadow: isSelected
                      ? '0 0 22px rgba(212,175,55,0.40), inset 0 1px 0 rgba(255,255,255,0.04)'
                      : 'none',
                    transform: `scale(${scale})`,
                    opacity,
                    zIndex: isSelected ? 10 : distance === 1 ? 5 : 1,
                    padding: '14px 8px 10px',
                  }}
                >
                  {/* Tick mark centred on top border when selected */}
                  {isSelected && (
                    <span
                      className="absolute -top-2.5 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full flex items-center justify-center bg-primary/15 text-primary"
                      style={{ fontSize: 11, fontWeight: 700 }}
                    >
                      ✓
                    </span>
                  )}
                  {/* Star on top-right for moon sign (when not selected) */}
                  {isMoon && !isSelected && (
                    <span
                      className="absolute -top-2 -right-2 w-4 h-4 rounded-full flex items-center justify-center text-[9px] bg-primary/15 text-primary"
                    >
                      ★
                    </span>
                  )}
                  <span className="text-3xl leading-none mb-1.5 text-text">
                    {r.symbol}
                  </span>
                  <p
                    className="text-[11px] font-bold uppercase leading-tight text-text"
                    style={{
                      letterSpacing: '0.08em',
                      fontFamily: 'ui-serif, Georgia, "Cormorant Garamond", serif',
                    }}
                  >
                    {r.sign}
                  </p>
                  <p className="text-[9px] font-semibold leading-tight mt-0.5" style={{ color: elemColor }}>
                    {r.element}
                  </p>
                  <span
                    className="mt-2 text-[8px] font-bold uppercase px-2 py-0.5 rounded-full text-text-muted bg-surface-2 border border-border"
                    style={{ letterSpacing: '0.12em' }}
                  >
                    {r.rashi}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Horoscope content for selected sign */}
          {hasUserSelected && <div
            className="rounded-2xl p-4 border border-border backdrop-blur-[8px] shadow-[0_0_18px_rgba(212,175,55,0.10)]"
            style={{ background: 'var(--card-bg)' }}
          >
            <>
            <div className="flex items-center gap-1.5 mb-2">
              {(() => {
                const rd = RASHI_DATA.find(r => r.sign === activeSelectedSign);
                return rd ? (
                  <>
                    <span className="text-base">{rd.symbol}</span>
                    <span className="text-xs font-bold text-text">{rd.sign}</span>
                    <span className="text-[10px] text-text-muted">·</span>
                    <span className="text-[10px] text-text-muted">{rd.rashi}</span>
                    {userMoonSign === rd.sign && (
                      <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">☽ Your Moon Sign</span>
                    )}
                  </>
                ) : null;
              })()}
            </div>
            {activeHoroscope?.general ? (
              <>
                <p className="text-sm font-semibold text-text leading-relaxed mb-3">{activeHoroscope.general}</p>

                {/* ✅ Positive points */}
                {Array.isArray(activeHoroscope.positive_points) && (activeHoroscope.positive_points as string[]).length > 0 && (
                  <div className="mb-2 space-y-1">
                    {(activeHoroscope.positive_points as string[]).map((pt: string, i: number) => (
                      <div key={i} className="flex items-start gap-1.5">
                        <span className="text-green-500 text-xs mt-0.5 flex-shrink-0">✦</span>
                        <p className="text-xs text-text leading-snug">{pt}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* ⚠️ Issues */}
                {Array.isArray(activeHoroscope.issues) && (activeHoroscope.issues as string[]).length > 0 && (
                  <div className="mb-2 space-y-1">
                    {(activeHoroscope.issues as string[]).map((issue: string, i: number) => (
                      <div key={i} className="flex items-start gap-1.5">
                        <span className="text-amber-500 text-xs mt-0.5 flex-shrink-0">⚠</span>
                        <p className="text-xs text-text-muted leading-snug">{issue}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Career / Love / Health */}
                <div className="grid grid-cols-3 gap-2 mb-3">
                  {(['career','love','health'] as const).map(area => {
                    const icons = { career: '💼', love: '❤️', health: '🛡️' };
                    const text = activeHoroscope[area];
                    if (!text) return null;
                    return (
                      <div key={area} className="rounded-xl px-2 py-2 bg-surface-2 border border-border">
                        <p className="text-[10px] font-bold mb-0.5 text-text-muted">{icons[area]} {area.toUpperCase()}</p>
                        <p className="text-[10px] leading-snug line-clamp-2 text-text-muted">{text as string}</p>
                      </div>
                    );
                  })}
                </div>

                {/* Remedy + Mantra */}
                {activeHoroscope.remedy && (
                  <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                    <p className="text-[10px] font-bold text-amber-700 mb-1">🪷 Today's Remedy</p>
                    <p className="text-xs text-amber-800 leading-snug">{activeHoroscope.remedy as string}</p>
                    {activeHoroscope.remedy_mantra && activeSelectedRashi && (
                      <MantraPlayer
                        mantraText={activeHoroscope.remedy_mantra as string}
                        rashi={activeSelectedRashi}
                        date={todayStr}
                        lang={storeLanguage || (user as Record<string, unknown> | null)?.language as string || 'en'}
                        preloadedUrl={(activeHoroscope as Record<string, unknown>).remedy_mantra_audio_url as string | undefined}
                      />
                    )}
                  </div>
                )}
                {/* Lucky */}
                <div className="flex gap-2 flex-wrap mb-2">
                  {activeHoroscope.luckyColor && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface-2 text-text-muted">🎨 Color: {activeHoroscope.luckyColor as string}</span>
                  )}
                  {activeHoroscope.luckyNumber && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface-2 text-text-muted">🔢 Number: {activeHoroscope.luckyNumber}</span>
                  )}
                  {activeHoroscope.luckyDirection && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface-2 text-text-muted">🧭 Direction: {activeHoroscope.luckyDirection as string}</span>
                  )}
                </div>
              </>
            ) : (
              <p className="text-sm text-text-muted leading-relaxed mb-2">
                {(() => {
                  const p = panchang as Record<string, Record<string, string> | string> | null;
                  const tithiName = p ? (typeof p.tithi === 'object' ? p.tithi?.name : p.tithi as string) : null;
                  return tithiName
                    ? `Today is ${tithiName}. A day guided by cosmic rhythms — stay centred and observe your intentions.`
                    : 'A day of subtle cosmic energies. Take time to reflect, plan, and set clear intentions for what matters most.';
                })()}
              </p>
            )}
            <Link href="/horoscope/daily" className="block text-[11px] text-right no-underline text-text-muted">
              Full reading for all rashis →
            </Link>
              </>
          </div>}
            </>
          )}
          </TabPanel>

          {/* Personal Daily Reading — appears after premium report is ready */}
          <TabPanel activeKey={activeTab} tabKey="personal">
            <PersonalDailyCard chartId={activeChartId} language={storeLanguage || user?.language || 'en'} />
            {dailyHoroscope && (dailyHoroscope.luckyColor || dailyHoroscope.luckyNumber || dailyHoroscope.luckyDirection) && (
              <div className="flex gap-2 flex-wrap mt-3 mb-2">
                {dailyHoroscope.luckyColor && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface-2 text-text-muted">🎨 Color: {dailyHoroscope.luckyColor as string}</span>
                )}
                {dailyHoroscope.luckyNumber && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface-2 text-text-muted">🔢 Number: {dailyHoroscope.luckyNumber}</span>
                )}
                {dailyHoroscope.luckyDirection && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface-2 text-text-muted">🧭 Direction: {dailyHoroscope.luckyDirection as string}</span>
                )}
              </div>
            )}
          </TabPanel>

          {/* Guna Chakra + See My Life */}
          <TabPanel activeKey={activeTab} tabKey="insights">
            <GunaChakraCard chartId={activeChartId} />
            {dailyHoroscope && (dailyHoroscope.luckyColor || dailyHoroscope.luckyNumber || dailyHoroscope.luckyDirection) && (
              <div className="flex gap-2 flex-wrap mt-3 mb-2">
                {dailyHoroscope.luckyColor && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface-2 text-text-muted">🎨 Color: {dailyHoroscope.luckyColor as string}</span>
                )}
                {dailyHoroscope.luckyNumber && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface-2 text-text-muted">🔢 Number: {dailyHoroscope.luckyNumber}</span>
                )}
                {dailyHoroscope.luckyDirection && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface-2 text-text-muted">🧭 Direction: {dailyHoroscope.luckyDirection as string}</span>
                )}
              </div>
            )}
            <Link
              href="/life-journey"
              className="w-full py-3 rounded-xl flex items-center justify-center gap-2 font-semibold transition-all active:scale-[0.98] mb-3 bg-primary/10 text-primary border border-primary/20"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
              </svg>
              See My Life
            </Link>
          </TabPanel>

          {/* Palm Readings — gated by 5-tap unlock on /more (VIPs see unlocked) */}
          {(palmUnlock.unlocked || isVipUser) && (
          <TabPanel activeKey={activeTab} tabKey="palm">
          {palmLoading ? (
          <div
            className="w-full p-3 rounded-2xl flex gap-3 items-center bg-surface border border-border"
          >
            <div className="w-[110px] h-[110px] rounded-xl flex-shrink-0 animate-pulse bg-surface-2" />
            <div className="flex-1 flex flex-col gap-2">
              <div className="h-3 w-24 rounded animate-pulse bg-surface-2" />
              <div className="h-4 w-32 rounded animate-pulse bg-surface-2" />
              <div className="h-3 w-40 rounded animate-pulse bg-surface-2" />
            </div>
          </div>
        ) : palmReadings.length > 0 ? (
          <div className="w-full">
            <div className="flex items-center justify-between mb-2 px-1">
              <p className="text-[12px] font-semibold text-text">
                Your Palm Readings
                <span className="ml-1.5 text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                  {palmCount}
                </span>
              </p>
              <Link href="/palm" className="text-[11px] font-semibold no-underline text-primary">
                + New reading
              </Link>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>
              {palmReadings.map((reading) => {
                const isExpanded = palmExpandedId === reading.id;
                return (
                  <div
                    key={reading.id}
                    className={`flex-shrink-0 rounded-2xl bg-surface border border-border ${isExpanded ? 'w-full' : 'w-[280px]'}`}
                  >
                    <div className="p-3">
                      <button
                        type="button"
                        onClick={() => setPalmExpandedId(isExpanded ? null : reading.id)}
                        className="w-full bg-transparent border-none p-0 cursor-pointer text-left"
                      >
                        <PalmInfographic
                          imageUrl={reading.imageUrl}
                          hand={reading.hand}
                          lines={reading.lines}
                          variant="compact"
                        />
                      </button>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span className="text-[10px] text-text-muted">
                          {reading.hand === 'left' ? 'Left hand' : 'Right hand'} ·{' '}
                          {new Date(reading.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setPalmExpandedId(isExpanded ? null : reading.id)}
                            className="text-[10px] font-semibold px-2 py-0.5 rounded-md cursor-pointer border-none bg-surface-2 text-text-muted"
                          >
                            {isExpanded ? 'Collapse' : 'Expand'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeletePalm(reading.id)}
                            aria-label="Delete reading"
                            className="text-[10px] font-semibold px-2 py-0.5 rounded-md cursor-pointer border-none text-danger bg-danger/10"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                      {isExpanded && (
                        <div className="mt-3 pt-3 border-t border-border">
                          <PalmInfographic
                            imageUrl={reading.imageUrl}
                            hand={reading.hand}
                            lines={reading.lines}
                            minorLines={extractMinorLines(reading.analysis)}
                            variant="full"
                          />
                          <Link
                            href="/palm"
                            className="mt-3 inline-flex items-center gap-1 text-[12px] font-semibold no-underline"
                            style={{ color: 'var(--text)' }}
                          >
                            View full reading
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                              <path d="M9 18l6-6-6-6" />
                            </svg>
                          </Link>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <Link
            href="/palm"
            className="w-full p-4 rounded-2xl flex items-center gap-3 no-underline transition-all active:scale-[0.98] bg-surface border border-border"
          >
            <div
              className="flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center text-2xl bg-primary/10 border border-primary/20"
            >
              🖐️
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-bold text-text">Read your palm</p>
              <p className="text-[11px] text-text-muted leading-snug">Discover your destiny in your hands</p>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-text-muted">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </Link>
        )}
          </TabPanel>
          )}
          </motion.div>
          </AnimatePresence>
        </div>
      </div>


      {/* ── CREAM SECTION — locked while chart is computing ── */}
      <div style={pendingKundli ? { opacity: 0.45, pointerEvents: 'none', filter: 'blur(1.5px)', userSelect: 'none' } : {}}>

      {/* ── BEST SELLING REPORTS ── */}
      <div className="pb-6 bg-bg">
        <div className="px-4 lg:px-8 mb-3">
          <h2 className="text-lg font-bold mb-0.5 text-text">
            Best Selling Reports
          </h2>
          <p className="text-xs text-text-muted">The astrological solution for every confusion.</p>
        </div>

        {/* Planning to Buy — full-width feature card */}
        <div className="px-4 lg:px-8 mb-3">
          <Link href="/purchase-planner" className="block">
            <div
              className="rounded-2xl border relative overflow-hidden p-4 flex items-center gap-4"
              style={{
                background: 'linear-gradient(135deg, rgba(212, 175, 55,0.10) 0%, #FFFFFF 70%)',
                borderColor: 'rgba(212, 175, 55,0.30)',
                boxShadow: '0 2px 12px rgba(212, 175, 55,0.08)',
              }}
            >
              <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl flex-shrink-0 bg-primary/10 border border-primary/20">
                🛍️
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <h3 className="text-sm font-bold text-text">Planning to Buy?</h3>
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">NEW</span>
                </div>
                <p className="text-[10px] leading-snug text-text-muted">
                  Car, Home, Property — find the best Vedic date with your birth chart ✨
                </p>
                <p className="text-[10px] font-semibold mt-1.5 text-primary">Start Analysis →</p>
              </div>
            </div>
          </Link>
        </div>

        {/* Report cards — Explore More style grid */}
        <div className="grid grid-cols-3 md:grid-cols-5 gap-2 px-4 lg:px-8">
          {REPORTS.map((r) => {
            // Per-card unlock override — 5-tap unlocks persist in localStorage
            // and survive page reloads. The card flips from SOON to VEDIC and
            // becomes a normal Link.
            const unlockedByTap =
              (r.href === '/name-correction'    && nameCorrectionUnlocked) ||
              (r.href === '/mobile-numerology'  && mobileNumerologyUnlocked) ||
              (r.href === '/pandit-puja'        && panditPujaUnlocked) ||
              (r.href.includes('tab=numerology') && numerologyUnlocked);
            const showAsLocked = r.locked && !unlockedByTap;
            const cardInner = (
              <>
                {showAsLocked ? (
                  <span className="text-[8px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap bg-primary/15 text-primary border border-primary/30">SOON</span>
                ) : (
                  <span className="text-[8px] font-bold px-2 py-0.5 rounded-full text-white whitespace-nowrap bg-primary">VEDIC</span>
                )}
                <span className="mt-0.5" style={{ color: r.accent }}>
                  <Icon name={r.icon} size={28} strokeWidth={1.6} />
                </span>
                <h3 className="text-[10px] font-bold leading-tight text-text uppercase">{r.name}</h3>
                {showAsLocked ? (
                  <div className="flex items-center gap-1">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                    <span className="text-[8px] font-semibold text-primary">COMING SOON</span>
                  </div>
                ) : (
                  <span className="text-[8px] text-text-muted">EXPLORE</span>
                )}
              </>
            );
            const cardClass = `rounded-2xl py-3 px-2 border border-border flex flex-col items-center gap-1 text-center bg-surface`;
            return showAsLocked ? (
              <button
                key={r.id}
                type="button"
                className={`${cardClass} cursor-default w-full`}
                onClick={() => handleLockedCardClick(r.href)}
              >
                {cardInner}
              </button>
            ) : (
              <Link key={r.id} href={r.href} className={cardClass}>
                {cardInner}
              </Link>
            );
          })}
        </div>
      </div>



{/* Tomorrow's "From the Astrologer" card moved to /dashboard/personal-daily —
          rendered below Today and gated to unlock at 12 PM local. */}

      </div>{/* end cream-section lock wrapper */}

      {/* ── EXPLORE MORE — always visible, not gated by pendingKundli ── */}
      <div className="px-4 lg:px-8 py-6 bg-bg">
        <div className="flex items-center justify-center gap-2 mb-4">
          <span className="w-12 h-px bg-border" />
          <p className="text-xs font-semibold tracking-widest text-text-muted">— EXPLORE MORE —</p>
          <span className="w-12 h-px bg-border" />
        </div>
        <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
          {/* Panchang */}
          <Link
            href="/panchang"
            className="rounded-2xl py-3 px-2 border border-border flex flex-col items-center gap-1 text-center bg-surface"
          >
            <span className="text-2xl mt-4">📅</span>
            <h3 className="text-[10px] font-bold leading-tight text-text">PANCHANG</h3>
            {panchang?.tithi ? (
              <span className="text-[8px] font-semibold px-1.5 py-0.5 rounded-full text-center leading-snug bg-warning/10 text-warning">
                {panchang.tithi}
              </span>
            ) : (
              <span className="text-[8px] text-text-muted">TODAY</span>
            )}
          </Link>

          {/* Kundli */}
          <Link
            href="/kundli/generate"
            className="rounded-2xl py-3 px-2 border border-border flex flex-col items-center gap-1 text-center bg-surface"
          >
            <span className="text-2xl mt-0.5">🔮</span>
            <h3 className="text-[10px] font-bold leading-tight text-text">KUNDLI</h3>
            <span className="text-[8px] text-text-muted">BIRTH CHART</span>
          </Link>

          {/* Dreams */}
          <Link
            href="/dreams"
            className="rounded-2xl py-3 px-2 border border-border flex flex-col items-center gap-1 text-center bg-surface"
          >
            <span className="text-[8px] font-bold px-2 py-0.5 rounded-full text-white whitespace-nowrap bg-primary">VEDIC</span>
            <span className="text-2xl mt-0.5">🌙</span>
            <h3 className="text-[10px] font-bold leading-tight text-text">DREAMS</h3>
            <span className="text-[8px] text-text-muted">INTERPRET</span>
          </Link>

          {/* Mantra Jaap — 5-tap unlock → /mantra-jaap (VIPs see unlocked directly) */}
          {mantraJaapUnlock.unlocked || isVipUser ? (
            <Link
              href="/mantra-jaap"
              className="rounded-2xl py-3 px-2 border border-border flex flex-col items-center gap-1 text-center bg-surface"
            >
              <span className="text-[8px] font-bold px-2 py-0.5 rounded-full text-white whitespace-nowrap bg-primary">VEDIC</span>
              <span className="text-2xl mt-0.5">📿</span>
              <h3 className="text-[10px] font-bold leading-tight text-text">MANTRA JAAP</h3>
              <span className="text-[8px] text-text-muted">108 COUNT</span>
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (mantraJaapUnlock.tap()) router.push('/mantra-jaap');
              }}
              className="relative rounded-2xl py-3 px-2 border border-border flex flex-col items-center gap-1 text-center bg-surface select-none cursor-pointer"
            >
              <span className="text-[8px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap bg-primary/15 text-primary border border-primary/30">SOON</span>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-primary mt-0.5">
                <rect x="3" y="11" width="18" height="11" rx="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              <h3 className="text-[10px] font-bold leading-tight text-text">MANTRA JAAP</h3>
              <span className="text-[8px] font-semibold text-primary">COMING SOON</span>
            </button>
          )}

          {/* Additional locked features — VIP-only visibility, still gated by 5-tap unlock */}
          {isVipUser && LOCKED_EXPLORE_FEATURES.map((feature) => (
            <LockedExploreCard key={feature.href} feature={feature} />
          ))}

        </div>
      </div>
    </div>
  );
}

// Renders a single locked feature card inside Explore More. Only rendered
// for VIP users (parent gates visibility) but still shown as locked — VIPs
// must 5-tap to unlock, same as Mantra Jaap. Encapsulated so
// useFeatureUnlock isn't called in a loop in the parent.
function LockedExploreCard({ feature }: { feature: LockedFeature }) {
  const router = useRouter();
  const unlock = useFeatureUnlock(feature.unlockKey);
  if (unlock.unlocked) {
    return (
      <Link
        href={feature.href}
        className="rounded-2xl py-3 px-2 border border-border flex flex-col items-center gap-1 text-center bg-surface"
      >
        <span className="text-[8px] font-bold px-2 py-0.5 rounded-full text-white whitespace-nowrap bg-primary">VEDIC</span>
        <span className="text-2xl mt-0.5">{feature.emoji}</span>
        <h3 className="text-[10px] font-bold leading-tight text-text">{feature.name}</h3>
        <span className="text-[8px] text-text-muted">{feature.subtitle}</span>
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={() => { if (unlock.tap()) router.push(feature.href); }}
      className="relative rounded-2xl py-3 px-2 border border-border flex flex-col items-center gap-1 text-center bg-surface select-none cursor-pointer"
    >
      <span className="text-[8px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap bg-primary/15 text-primary border border-primary/30">SOON</span>
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-primary mt-0.5">
        <rect x="3" y="11" width="18" height="11" rx="2"/>
        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
      </svg>
      <h3 className="text-[10px] font-bold leading-tight text-text">{feature.name}</h3>
      <span className="text-[8px] font-semibold text-primary">COMING SOON</span>
    </button>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={null}>
      <DashboardContent />
    </Suspense>
  );
}
