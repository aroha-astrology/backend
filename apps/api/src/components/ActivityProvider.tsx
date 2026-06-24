'use client';

import { createContext, useContext, useCallback, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------
type TrackFn = (
  type: string,
  action: string,
  label?: string,
  metadata?: Record<string, unknown>,
) => void;

const ActivityContext = createContext<TrackFn>(() => {});

export function useActivity(): TrackFn {
  return useContext(ActivityContext);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function getSessionId(): string {
  if (typeof sessionStorage === 'undefined') return '';
  let id = sessionStorage.getItem('_sid');
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem('_sid', id);
  }
  return id;
}

const PAGE_NAMES: Record<string, string> = {
  '/dashboard':         'Dashboard',
  '/kundli/generate':   'Generate Kundli',
  '/horoscope/daily':   'Daily Horoscope',
  '/horoscope/weekly':  'Weekly Horoscope',
  '/horoscope/monthly': 'Monthly Horoscope',
  '/horoscope/yearly':  'Yearly Horoscope',
  '/chat':              'Chat with Yogi Baba',
  '/reports':           'Reports',
  '/credits':           'Credits',
  '/profile':           'Profile',
  '/settings':          'Settings',
  '/match/new':         'Matchmaking',
  '/baby-names':        'Baby Names',
  '/palm':              'Palm Reading',
  '/tarot':             'Tarot',
  '/dreams':            'Dream Interpretation',
  '/vastu':             'Vastu',
  '/remedies':          'Remedies',
  '/gemstone':          'Gemstone',
  '/kp-system':         'KP System',
  '/gochar':            'Planetary Transits',
  '/prashna':           'Prashna',
  '/muhurta':           'Muhurta',
  '/panchang':          'Panchang',
  '/vargas':            'Divisional Charts',
  '/varshaphal':        'Annual Predictions',
  '/calendar':          'Astrology Calendar',
  '/couple':            'Couple Analysis',
  '/video':             'Video Readings',
  '/referral':          'Referral',
  '/more':              'More',
  '/admin':             'Admin Panel',
};

function resolvePageName(pathname: string): string {
  if (PAGE_NAMES[pathname]) return PAGE_NAMES[pathname];
  if (pathname.startsWith('/kundli/')) return 'View Kundli';
  if (pathname.startsWith('/life-decisions/')) return 'Life Decisions';
  if (pathname.startsWith('/horoscope/')) return 'Horoscope';
  return pathname;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------
export function ActivityProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const lastPathname = useRef<string>('');

  const post = useCallback((payload: object) => {
    fetch('/api/activity/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => {});
  }, []);

  // Track page views whenever the route changes
  useEffect(() => {
    if (pathname === lastPathname.current) return;
    lastPathname.current = pathname;
    post({
      session_id: getSessionId(),
      event_type: 'page_view',
      page: pathname,
      label: resolvePageName(pathname),
      metadata: {
        referrer: typeof document !== 'undefined' ? document.referrer : '',
      },
    });
  }, [pathname, post]);

  // Presence heartbeat — pings while the tab is visible so admin sees a
  // live "online" dot. Cheap upsert; failures are intentionally swallowed.
  useEffect(() => {
    let cancelled = false;
    const ping = () => {
      if (cancelled) return;
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      fetch('/api/presence/ping', { method: 'POST', keepalive: true }).catch(() => {});
    };
    ping();
    const interval = window.setInterval(ping, 60_000);
    const onVisible = () => { if (document.visibilityState === 'visible') ping(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const trackEvent: TrackFn = useCallback(
    (type, action, label, metadata) => {
      post({
        session_id: getSessionId(),
        event_type: type,
        page: pathname,
        action,
        label,
        metadata: metadata ?? {},
      });
    },
    [pathname, post],
  );

  return (
    <ActivityContext.Provider value={trackEvent}>
      {children}
    </ActivityContext.Provider>
  );
}
