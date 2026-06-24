'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { useStore } from '@/store/useStore';
import { queryKeys } from '@/lib/queryKeys';
import { LegalAcceptModal } from '@/components/legal/LegalAcceptModal';
import { NotificationPermissionPrompt } from '@/components/notifications/NotificationPermissionPrompt';
import { LEGAL_VERSION } from '@/lib/legal';
import type { UserRow, BirthProfileRow, KundliChartRow } from '@aroha-astrology/shared';

const SETTINGS_CACHE_KEY = 'user_settings_v3';
const PROFILES_CACHE_KEY = 'user_profiles_v1';

function loadCachedSettings(): UserRow | null {
  try {
    const raw = localStorage.getItem(SETTINGS_CACHE_KEY);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw) as { ts: number; data: UserRow };
    // Expire after 1 hour
    if (Date.now() - ts > 60 * 60 * 1000) { localStorage.removeItem(SETTINGS_CACHE_KEY); return null; }
    return data;
  } catch { return null; }
}

function cacheSettings(data: UserRow) {
  try {
    localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
  } catch {}
}

function loadCachedProfiles(): BirthProfileRow[] | null {
  try {
    const raw = localStorage.getItem(PROFILES_CACHE_KEY);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw) as { ts: number; data: BirthProfileRow[] };
    // Expire after 10 minutes
    if (Date.now() - ts > 10 * 60 * 1000) { localStorage.removeItem(PROFILES_CACHE_KEY); return null; }
    return data;
  } catch { return null; }
}

function cacheProfiles(data: BirthProfileRow[]) {
  try {
    localStorage.setItem(PROFILES_CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
  } catch {}
}

// Routes where we never redirect to onboarding (to avoid loops / broken flows)
const ONBOARDING_SKIP_PREFIXES = ['/onboarding', '/auth', '/login', '/signup', '/admin', '/api'];

// Routes where the legal-acceptance modal should NOT appear. These pages must
// stay reachable (the modal links into /terms and /privacy) and the auth pages
// run before the user is signed in.
const LEGAL_GATE_SKIP_PREFIXES = ['/terms', '/privacy', '/login', '/signup', '/auth'];

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  // Use a ref so the loadUser closure always reads the latest path without re-running the effect
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;
  const setUser = useStore((s) => s.setUser);
  const setCredits = useStore((s) => s.setCredits);
  const setAvatarUrl = useStore((s) => s.setAvatarUrl);
  const setTheme = useStore((s) => s.setTheme);
  const setLanguage = useStore((s) => s.setLanguage);
  const setChartStyle = useStore((s) => s.setChartStyle);
  const setProfiles = useStore((s) => s.setProfiles);
  const setCharts = useStore((s) => s.setCharts);
  const setDataReady = useStore((s) => s.setDataReady);
  const [legalModalOpen, setLegalModalOpen] = useState(false);
  const userInStore = useStore((s) => s.user);

  useEffect(() => {
    const supabase = createClient();

    async function loadUser() {
      try {
        // 1. Instantly restore from localStorage — zero flicker on reload
        const cached = loadCachedSettings();
        if (cached) {
          setUser(cached);
          if (cached.credits != null) setCredits(cached.credits);
          if (cached.theme) setTheme(cached.theme);
          if (cached.language) setLanguage(cached.language);
          if (cached.chart_style) setChartStyle(cached.chart_style);
        }

        // Restore cached profiles immediately so the onboarding redirect decision
        // is made before the API responds — prevents dashboard flash on re-login
        const cachedProfiles = loadCachedProfiles();
        if (cachedProfiles) {
          setProfiles(cachedProfiles);
          qc.setQueryData(queryKeys.profiles, cachedProfiles);
        }

        // 2. Single bootstrap call — one auth round-trip, all DB queries run in parallel server-side
        const initJson = await fetch('/api/dashboard/init')
          .then(r => r.ok ? r.json() : null)
          .catch(() => null);

        // 3. Apply all data from the combined response
        const d = initJson?.data;
        if (!d) return;

        if (d.user) {
          const userData = d.user as UserRow;
          setUser(userData);
          cacheSettings(userData);
          if (userData.theme) setTheme(userData.theme);
          if (userData.language) setLanguage(userData.language);
          if (userData.chart_style) setChartStyle(userData.chart_style);
          qc.setQueryData(queryKeys.userSettings, userData);

          // Gate: prompt for acceptance if missing or stale.
          const accepted =
            !!userData.legal_accepted_at &&
            (userData.legal_version ?? 0) >= LEGAL_VERSION;
          const path = pathnameRef.current;
          const onLegalPage = LEGAL_GATE_SKIP_PREFIXES.some((p) => path.startsWith(p));
          if (!accepted && !onLegalPage) {
            setLegalModalOpen(true);
          }
        }

        if (Array.isArray(d.profiles)) {
          setProfiles(d.profiles);
          qc.setQueryData(queryKeys.profiles, d.profiles);

          if (d.profiles.length > 0) {
            // Save profiles so the next page load is instant (no onboarding flash)
            cacheProfiles(d.profiles);
          } else {
            // No profiles: clear any stale cache and send to onboarding
            try { localStorage.removeItem(PROFILES_CACHE_KEY); } catch {}
            const path = pathnameRef.current;
            const skip = ONBOARDING_SKIP_PREFIXES.some((p) => path.startsWith(p));
            if (!skip) router.replace('/onboarding');
          }
        }

        if (Array.isArray(d.charts)) {
          setCharts(d.charts as KundliChartRow[]);
          qc.setQueryData(queryKeys.charts, d.charts);

          // Background: generate past life data in user's language if not yet done
          if (d.charts.length > 0) {
            fetch('/api/queue/enqueue-past-life', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chartId: d.charts[0].id }),
            }).catch(() => {});
          }
        }

        if (typeof d.credits === 'number') {
          setCredits(d.credits);
          qc.setQueryData(queryKeys.credits, d.credits);
        }

        // 4. Pull avatar from OAuth metadata (non-blocking, best-effort)
        supabase.auth.getUser().then(({ data: { user: authUser } }) => {
          const avatar =
            (authUser?.user_metadata?.avatar_url as string | undefined) ||
            (authUser?.user_metadata?.picture as string | undefined) ||
            null;
          if (avatar) setAvatarUrl(avatar);
        }).catch(() => {});

      } catch (err) {
        console.error('[AuthProvider] loadUser threw', err);
      } finally {
        setDataReady(true);
      }
    }

    // Safety net: unblock pages after 15s if fetch hangs
    const safetyTimer = setTimeout(() => setDataReady(true), 15000);
    loadUser().finally(() => clearTimeout(safetyTimer));

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        setUser(null);
        setAvatarUrl(null);
        setProfiles([]);
        setCharts([]);
        setLegalModalOpen(false);
        try {
          localStorage.removeItem(SETTINGS_CACHE_KEY);
          localStorage.removeItem(PROFILES_CACHE_KEY);
        } catch {}
        qc.clear();
      } else if (event === 'SIGNED_IN' && session?.user) {
        // Only re-load on a genuine new sign-in (different user)
        const currentUser = useStore.getState().user;
        if (currentUser && currentUser.id === session.user.id) return;
        loadUser();
      }
    });

    return () => { clearTimeout(safetyTimer); subscription.unsubscribe(); };
  }, [qc, router, setUser, setCredits, setAvatarUrl, setTheme, setLanguage, setChartStyle, setProfiles, setCharts, setDataReady]);

  return (
    <>
      {children}
      <LegalAcceptModal
        isOpen={legalModalOpen}
        onAccepted={(updated) => {
          cacheSettings(updated);
          setLegalModalOpen(false);
        }}
      />
      <NotificationPermissionPrompt enabled={!!userInStore && !legalModalOpen} />
    </>
  );
}
