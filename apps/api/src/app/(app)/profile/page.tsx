'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { capturePhoto, isNative } from '@/lib/native';
import { Modal } from '@/components/ui/modal';
import { createClient } from '@/lib/supabase/client';
import { useStore } from '@/store/useStore';
import { motion } from 'framer-motion';
import { MotionPage, StaggerList, StaggerItem } from '@/components/ui/motion-primitives';
import { ButtonSkeleton } from '@/components/ui/skeleton';
import { useProfilesQuery } from '@/hooks/queries/useProfilesQuery';
import { useChartsQuery } from '@/hooks/queries/useChartsQuery';
import { useVideosQuery, useReportsQuery } from '@/hooks/queries/useProfilePageData';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';

// ---------------------------------------------------------------------------
// Puja booking constants
// ---------------------------------------------------------------------------
const BOOKING_STATUS_LABEL: Record<string, string> = {
  pending_pandit:       'Awaiting pandit',
  accepted:             'Confirmed',
  reassignment_pending: 'Pick new pandit',
  in_progress:          'In progress',
  video_uploaded:       'Video ready',
  prasad_dispatched:    'Prasad shipped',
  completed:            'Completed',
  cancelled:            'Cancelled',
  refunded:             'Refunded',
};
const BOOKING_STATUS_TONE: Record<string, string> = {
  pending_pandit:       'bg-accent/15 text-accent border-accent/20',
  accepted:             'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  reassignment_pending: 'bg-orange-500/15 text-orange-400 border-orange-500/20',
  in_progress:          'bg-blue-500/15 text-blue-400 border-blue-500/20',
  video_uploaded:       'bg-purple-500/15 text-purple-400 border-purple-500/20',
  prasad_dispatched:    'bg-teal-500/15 text-teal-400 border-teal-500/20',
  completed:            'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  cancelled:            'bg-red-500/10 text-red-400 border-red-500/20',
  refunded:             'bg-text-muted/15 text-text-muted border-border',
};

function slugToTitle(slug: string) {
  return slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

interface PujaBooking {
  id: string;
  puja_slug: string;
  status: string;
  total_dhanam: number;
  member_count: number;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface VideoReading {
  id: string;
  type: string;
  language: string;
  focus_area: string;
  status: string;
  created_at: string;
  video_url?: string;
}

interface GeneratedReport {
  id: string;
  report_type: string;
  subject_name: string;
  subject_dob?: string;
  subject_gender?: string;
  metadata?: Record<string, unknown>;
  pdf_filename?: string;
  pdf_url?: string;
  status?: string;
  error_message?: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Badge components
// ---------------------------------------------------------------------------
function StatusBadge({ status }: { status: string }) {
  const isOk = status === 'ready' || status === 'completed' || status === 'complete';
  const isErr = status === 'error';
  return (
    <span
      className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full border ${
        isOk
          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500'
          : isErr
          ? 'bg-red-500/10 border-red-500/30 text-red-500'
          : 'bg-amber-500/10 border-amber-500/30 text-amber-500'
      }`}
    >
      {status}
    </span>
  );
}

function ReportTypeBadge({ type }: { type: string }) {
  const isNumerology = type === 'numerology';
  return (
    <span
      className={`text-[9px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider ${
        isNumerology
          ? 'bg-purple-500/[0.12] border-purple-500/30 text-purple-400'
          : 'bg-primary/10 border-primary/25 text-primary'
      }`}
    >
      {type.replace('_', ' ')}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------
export default function ProfilePage() {
  const router = useRouter();
  const user = useStore((s) => s.user);
  const setUser = useStore((s) => s.setUser);
  const avatarUrl = useStore((s) => s.avatarUrl);

  // Query hooks — cached, no re-fetch on page revisit
  const profilesQuery = useProfilesQuery();
  const chartsQuery = useChartsQuery();
  const videosQuery = useVideosQuery();
  const reportsQuery = useReportsQuery();

  const storeProfiles = useStore((s) => s.profiles);
  const storeCharts = useStore((s) => s.charts);
  const profiles = profilesQuery.data ?? storeProfiles;
  const charts = chartsQuery.data ?? storeCharts;
  const [generatedReports, setGeneratedReports] = useState<GeneratedReport[]>([]);
  const videos = (videosQuery.data ?? []) as VideoReading[];

  const loading = profilesQuery.isLoading || reportsQuery.isLoading;
  const [accountDeleteOpen, setAccountDeleteOpen] = useState(false);
  const [accountDeleting, setAccountDeleting] = useState(false);
  const [accountDeleteError, setAccountDeleteError] = useState<string | null>(null);
  const [deleteReasons, setDeleteReasons] = useState<string[]>([]);
  const [deleteOtherReason, setDeleteOtherReason] = useState('');
  const [activeSection, setActiveSection] = useState<'reports'>('reports');
  const [toast, setToast] = useState<string | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Puja bookings
  const pujaBookingsQuery = useQuery<PujaBooking[]>({
    queryKey: ['puja-bookings-profile'],
    queryFn: async () => {
      const r = await fetch('/api/puja-bookings');
      if (!r.ok) return [];
      const json = await r.json() as { bookings: PujaBooking[] };
      return json.bookings ?? [];
    },
    staleTime: 60_000,
    gcTime: Infinity,
  });
  const pujaBookings = pujaBookingsQuery.data ?? [];

  // Palm readings — full history shared with the dashboard carousel
  interface PalmReadingItem {
    id: string;
    hand: 'left' | 'right';
    imageUrl: string;
    createdAt: string;
  }
  const queryClient = useQueryClient();
  const palmQuery = useQuery<{ readings: PalmReadingItem[]; count: number }>({
    queryKey: ['palm-list'],
    queryFn: async () => {
      const r = await fetch('/api/palm/list');
      if (!r.ok) return { readings: [], count: 0 };
      return r.json();
    },
    staleTime: Infinity,
    gcTime: Infinity,
  });
  const palmReadings = palmQuery.data?.readings ?? [];
  const palmCount = palmQuery.data?.count ?? 0;
  const [deletingPalmId, setDeletingPalmId] = useState<string | null>(null);

  const handleDeletePalmReading = async (readingId: string) => {
    if (!window.confirm('Delete this palm reading? This cannot be undone.')) return;
    setDeletingPalmId(readingId);
    try {
      const r = await fetch(`/api/palm/${readingId}`, { method: 'DELETE' });
      if (!r.ok) throw new Error('delete failed');
      queryClient.invalidateQueries({ queryKey: ['palm-list'] });
      queryClient.invalidateQueries({ queryKey: ['palm-latest'] });
    } catch (e) {
      console.warn('[profile] palm delete failed', e);
      setToast('Could not delete reading. Please try again.');
    } finally {
      setDeletingPalmId(null);
    }
  };

  // Keep local reports state in sync with query data
  useEffect(() => {
    if (reportsQuery.data) setGeneratedReports(reportsQuery.data as GeneratedReport[]);
  }, [reportsQuery.data]);

  // Poll pending/processing numerology reports every 10 seconds
  useEffect(() => {
    const pending = generatedReports.filter(
      (r) => (r.status === 'pending' || r.status === 'processing' || r.status === 'generating'),
    );
    if (pending.length === 0) {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      return;
    }

    if (pollIntervalRef.current) return; // already polling

    pollIntervalRef.current = setInterval(async () => {
      const stillPending = generatedReports.filter(
        (r) => (r.status === 'pending' || r.status === 'processing' || r.status === 'generating'),
      );
      if (stillPending.length === 0) {
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
        return;
      }

      const updates = await Promise.all(
        stillPending.map(async (r) => {
          try {
            const statusUrl = r.report_type === 'numerology'
              ? `/api/numerology/report/status/${r.id}`
              : `/api/reports/status/${r.id}`;
            const res = await fetch(statusUrl);
            if (!res.ok) return null;
            return { id: r.id, ...((await res.json()) as { data: { status: string; download_url?: string } }).data };
          } catch { return null; }
        }),
      );

      setGeneratedReports((prev) => {
        let changed = false;
        const next = prev.map((r) => {
          const update = updates.find((u) => u && u.id === r.id);
          if (!update) return r;
          const newStatus = update.status === 'ready' ? 'complete' : update.status;
          if (newStatus !== r.status) {
            changed = true;
            if (newStatus === 'complete') {
              setToast(`Report for ${r.subject_name} is ready! Click Download to get your PDF.`);
              if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
                new Notification('Numerology Report Ready!', {
                  body: `The report for ${r.subject_name} is ready to download.`,
                  icon: '/icons/icon-192.png',
                });
              }
            }
            return { ...r, status: newStatus, pdf_url: update.download_url ?? r.pdf_url };
          }
          return r;
        });
        return changed ? next : prev;
      });
    }, 10_000);

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generatedReports.map((r) => r.id + r.status).join(',')]);

  // Auto-hide toast after 6 seconds
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  const handleClearPending = async () => {
    try {
      const res = await fetch('/api/reports/my-reports?status=pending,generating,processing', { method: 'DELETE' });
      const json = await res.json() as { deleted?: number };
      setGeneratedReports((prev) => prev.filter((r) => !['pending', 'generating', 'processing'].includes(r.status ?? '')));
      setToast(`Deleted ${json.deleted ?? 0} pending report(s)`);
    } catch { setToast('Failed to delete'); }
  };

  const toggleDeleteReason = (reason: string) => {
    setDeleteReasons((prev) =>
      prev.includes(reason) ? prev.filter((r) => r !== reason) : [...prev, reason],
    );
  };

  const handleDeleteAccount = async () => {
    setAccountDeleting(true);
    setAccountDeleteError(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.rpc('delete_my_account', {
        p_reasons: deleteReasons,
        p_other_reason: deleteOtherReason.trim() || null,
      });
      if (error) throw error;
      await supabase.auth.signOut();
      try { await fetch('/api/auth/signout', { method: 'POST' }); } catch { /* ignore */ }
      setUser(null);
      router.replace('/');
    } catch (err: unknown) {
      console.error('[profile] account delete failed', err);
      setAccountDeleteError(
        err instanceof Error ? err.message : 'Could not delete account. Please try again.',
      );
      setAccountDeleting(false);
    }
  };

  const isPremium = (user as unknown as Record<string, unknown>)?.is_premium === true;
  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
    : '';
  const initial = user?.name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || '?';

  return (
    <MotionPage className="min-h-screen px-4 pt-6 pb-20 bg-bg">
      <div className="w-[90%] max-w-[1240px] mx-auto">
        <h1 className="j-display text-xl mb-6 text-text">Profile</h1>

        {/* User card */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="rounded-2xl p-5 mb-4 bg-surface border border-border shadow-[0_2px_12px_rgba(36,28,21,0.06)]"
        >
          <div className="flex items-center gap-5">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={user?.name ?? 'User'}
                referrerPolicy="no-referrer"
                className="w-[68px] h-[68px] rounded-full object-cover flex-shrink-0 border-2 border-primary/30"
              />
            ) : (
              <div className="w-[68px] h-[68px] rounded-full flex items-center justify-center text-2xl font-bold flex-shrink-0 bg-primary/10 border-2 border-primary/30 text-primary">
                {initial}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h2 className="j-display text-[17px] text-text truncate">{user?.name || 'User'}</h2>
              <p className="text-[12px] mt-0.5 text-text-muted truncate">{user?.email}</p>
              <div className="flex gap-2 mt-2 flex-wrap">
                {memberSince && (
                  <span className="text-[10px] font-medium py-0.5 px-2.5 rounded-full text-text-muted border border-border">
                    Member since {memberSince}
                  </span>
                )}
                {isPremium && (
                  <span className="text-[10px] font-semibold py-0.5 px-2.5 rounded-full bg-warning/10 border border-warning/30 text-warning">
                    ✦ Premium
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <Link href="/settings" className="flex-1 py-2 px-3 rounded-xl text-[12px] font-semibold no-underline bg-surface-2 border border-border text-text text-center">
              Edit →
            </Link>
            {isNative() && (
              <button
                className="flex-1 py-2 px-3 rounded-xl text-[12px] font-semibold bg-primary/10 border border-primary/30 text-primary text-center"
                onClick={async () => {
                  const blob = await capturePhoto({ direction: 'FRONT' });
                  if (blob) {
                    // Q-4: avatar persistence pipeline not yet built.
                    // This confirms the native front camera works end-to-end.
                    alert('Selfie captured ✓ (avatar upload coming soon)');
                  }
                }}
              >
                📸 Selfie
              </button>
            )}
          </div>
        </motion.div>

        {loading ? (
          <div className="text-center py-12 text-[13px] text-text-muted">Loading...</div>
        ) : (
          <StaggerList className="flex flex-col gap-4">

            {/* Birth Profiles */}
            <StaggerItem>
              <div className="rounded-2xl overflow-hidden bg-surface border border-border">
                <div className="flex items-center justify-between px-4 py-3.5 border-b border-border">
                  <span className="text-[13px] font-semibold text-text">Saved Birth Profiles</span>
                  <Link href="/kundli/generate" className="text-[11px] font-semibold text-primary no-underline py-1 px-3 rounded-md border border-primary/30 bg-primary/[0.06]">
                    + Add New
                  </Link>
                </div>
                {profiles.length === 0 ? (
                  <div className="py-8 px-4 text-center text-text-muted text-[12px]">
                    No birth profiles saved yet.
                  </div>
                ) : (
                  profiles.map((p) => (
                    <div key={p.id} className="px-4 py-3 border-b border-border/60">
                      <p className="text-[13px] font-medium text-text">{p.name}</p>
                      <p className="text-[11px] mt-0.5 text-text-muted">
                        {new Date(p.dob).toLocaleDateString('en-IN')} · {p.tob} · {p.pob}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </StaggerItem>

            {/* Generated Kundlis */}
            <StaggerItem>
              <div className="rounded-2xl overflow-hidden bg-surface border border-border">
                <div className="flex items-center justify-between px-4 py-3.5 border-b border-border">
                  <span className="text-[13px] font-semibold text-text">Generated Kundlis</span>
                </div>
                {charts.length === 0 ? (
                  <div className="py-8 px-4 text-center">
                    <p className="text-text-muted text-[12px] mb-3">No kundli charts generated yet.</p>
                    <Link href="/kundli/generate" className="inline-block py-2 px-5 rounded-lg bg-primary text-bg text-[12px] font-bold no-underline">
                      Generate Kundli
                    </Link>
                  </div>
                ) : (
                  charts.map((c) => {
                    const prof = profiles.find(p => p.id === c.profile_id);
                    return (
                      <div key={c.id} className="px-4 py-3 border-b border-border/60">
                        <p className="text-[13px] font-medium text-text">
                          {prof?.name ?? `Chart #${c.id.slice(0, 8)}`}
                        </p>
                        <p className="text-[11px] mt-0.5 text-text-muted">
                          {prof?.dob ? `${prof.dob} · ` : ''}
                          {new Date(c.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </p>
                      </div>
                    );
                  })
                )}
              </div>
            </StaggerItem>

            {/* Order History — Puja Bookings */}
            <StaggerItem>
              <div className="rounded-2xl overflow-hidden bg-surface border border-border">
                <div className="flex items-center justify-between px-4 py-3.5 border-b border-border">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-semibold text-text">Order History</span>
                    {pujaBookings.length > 0 && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-accent/10 text-accent">
                        {pujaBookings.length}
                      </span>
                    )}
                  </div>
                  {pujaBookings.length > 0 && (
                    <Link href="/pandit-puja/my-bookings" className="text-[11px] font-semibold text-primary no-underline py-1 px-3 rounded-md border border-primary/30 bg-primary/[0.06]">
                      All →
                    </Link>
                  )}
                </div>
                {pujaBookingsQuery.isLoading ? (
                  <div className="py-7 px-4 text-center text-[12px] text-text-muted">Loading…</div>
                ) : pujaBookings.length === 0 ? (
                  <div className="py-7 px-4 text-center text-[12px] text-text-muted">
                    No puja bookings yet.{' '}
                    <Link href="/pandit-puja" className="no-underline text-primary">Browse pujas →</Link>
                  </div>
                ) : (
                  pujaBookings.map((b) => (
                    <Link
                      key={b.id}
                      href={`/pandit-puja/bookings/${b.id}`}
                      className="flex items-center justify-between px-4 py-3 border-b border-border/60 no-underline group"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-medium text-text truncate group-hover:text-primary transition-colors">
                          {slugToTitle(b.puja_slug)}
                        </p>
                        <p className="text-[11px] mt-0.5 text-text-muted">
                          #{b.id.slice(0, 8)} · {b.member_count} member{b.member_count > 1 ? 's' : ''} · {b.total_dhanam} Dhanam · {new Date(b.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </p>
                      </div>
                      <span className={`ml-3 flex-shrink-0 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border ${BOOKING_STATUS_TONE[b.status] ?? 'bg-surface-2 text-text-muted border-border'}`}>
                        {BOOKING_STATUS_LABEL[b.status] ?? b.status}
                      </span>
                    </Link>
                  ))
                )}
              </div>
            </StaggerItem>

            {/* REPORTS_DISABLED: Generated Reports section hidden — re-enable by restoring StaggerItem below */}
            {/* REPORTS_DISABLED_START
            <StaggerItem>
              <div className="rounded-2xl overflow-hidden bg-surface border border-border">
                ... (full reports list UI — see git history to restore)
              </div>
            </StaggerItem>
            REPORTS_DISABLED_END */}

            {/* Palm Readings */}
            <StaggerItem>
              <div className="rounded-2xl overflow-hidden bg-surface border border-border">
                <div className="flex items-center justify-between px-4 py-3.5 border-b border-border">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-semibold text-text">Palm Readings</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/20">
                      Coming Soon
                    </span>
                  </div>
                </div>
                {palmQuery.isLoading ? (
                  <div className="py-7 px-4 text-center text-[12px] text-text-muted">Loading readings…</div>
                ) : palmReadings.length === 0 ? (
                  <div className="py-8 px-4 text-center">
                    <div className="text-2xl mb-2">🖐️</div>
                    <p className="text-[13px] font-semibold text-text mb-1">Palm Reading</p>
                    <p className="text-[11px] text-text-muted">This feature is coming soon. Stay tuned!</p>
                  </div>
                ) : (
                  palmReadings.map((p) => (
                    <div key={p.id} className="flex items-center gap-3 px-4 py-3 border-b border-border/60">
                      <div className="w-14 h-14 rounded-lg overflow-hidden flex-shrink-0 border border-border bg-surface-2">
                        {p.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.imageUrl} alt={`${p.hand} palm`} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-2xl">🖐️</div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-text mb-0.5 truncate">
                          {p.hand === 'left' ? 'Left hand' : 'Right hand'}
                        </p>
                        <p className="text-[10px] text-text-muted truncate">
                          {new Date(p.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </p>
                      </div>
                      <div className="flex gap-1.5 flex-shrink-0">
                        <Link
                          href="/palm"
                          className="py-1.5 px-3 rounded-md no-underline border border-primary/30 bg-primary/[0.06] text-primary text-[11px] font-semibold whitespace-nowrap"
                        >
                          👁 View
                        </Link>
                        <button
                          onClick={() => handleDeletePalmReading(p.id)}
                          disabled={deletingPalmId === p.id}
                          className={`py-1.5 px-3 rounded-md border border-red-500/30 bg-red-500/[0.06] text-red-500 text-[11px] font-semibold whitespace-nowrap ${
                            deletingPalmId === p.id ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
                          }`}
                        >
                          {deletingPalmId === p.id ? '...' : '🗑 Delete'}
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </StaggerItem>

            {/* Danger Zone — Delete Account */}
            <StaggerItem>
              <div className="rounded-2xl overflow-hidden bg-surface border border-red-500/30">
                <div className="px-4 py-3.5 border-b border-red-500/20">
                  <span className="text-[13px] font-semibold text-red-500">Danger Zone</span>
                </div>
                <div className="px-4 py-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[13px] font-medium text-text">Delete my account</p>
                    <p className="text-[11px] mt-0.5 text-text-muted">
                      Permanently remove your account and all associated data. This cannot be undone.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setAccountDeleteError(null);
                      setDeleteReasons([]);
                      setDeleteOtherReason('');
                      setAccountDeleteOpen(true);
                    }}
                    className="py-2 px-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-500 text-[12px] font-semibold cursor-pointer whitespace-nowrap"
                  >
                    Delete account
                  </button>
                </div>
              </div>
            </StaggerItem>

            {/* Video Readings */}
            <StaggerItem>
              <div className="rounded-2xl overflow-hidden bg-surface border border-border">
                <div className="flex items-center justify-between px-4 py-3.5 border-b border-border">
                  <span className="text-[13px] font-semibold text-text">Video Readings</span>
                </div>
                {videos.length === 0 ? (
                  <div className="py-6 px-4 text-center text-text-muted text-[12px]">
                    No video readings yet.{' '}
                    <Link href="/video" className="text-primary no-underline">Generate one →</Link>
                  </div>
                ) : (
                  videos.map((v) => (
                    <div key={v.id} className="flex items-center justify-between px-4 py-3 border-b border-border/60">
                      <div>
                        <p className="text-[13px] font-medium text-text">
                          {v.type} · {v.focus_area} · {v.language}
                        </p>
                        <p className="text-[11px] text-text-muted mt-0.5">
                          {new Date(v.created_at).toLocaleDateString('en-IN')}
                        </p>
                      </div>
                      <div className="flex items-center gap-2.5">
                        <StatusBadge status={v.status} />
                        {v.video_url && (
                          <Link href={`/video?play=${v.id}`} className="text-[11px] text-primary no-underline py-1 px-3 rounded-md border border-primary/30">
                            Watch
                          </Link>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </StaggerItem>
          </StaggerList>
        )}
      </div>

      {/* Toast notification */}
      {toast && (
        <div className="fixed bottom-24 md:bottom-6 left-1/2 -translate-x-1/2 rounded-2xl py-3 px-5 max-w-[380px] z-[9999] shadow-xl flex items-center gap-2.5 bg-surface border border-border">
          <span className="text-lg">✅</span>
          <p className="text-[12px] leading-relaxed m-0 text-text">{toast}</p>
          <button
            onClick={() => setToast(null)}
            className="bg-transparent border-none text-base cursor-pointer flex-shrink-0 text-text-muted"
          >
            ×
          </button>
        </div>
      )}

      {/* Delete Account Confirmation Modal */}
      <Modal
        isOpen={accountDeleteOpen}
        onClose={() => { if (!accountDeleting) setAccountDeleteOpen(false); }}
        title="Delete my account"
        footer={
          <div className="flex justify-end gap-2.5">
            <button
              onClick={() => setAccountDeleteOpen(false)}
              disabled={accountDeleting}
              className="py-2 px-4 rounded-lg border border-border bg-transparent text-text-muted text-[12px] cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleDeleteAccount}
              disabled={accountDeleting}
              className={`py-2 px-4 rounded-lg bg-red-500 border border-red-500 text-white text-[12px] font-semibold cursor-pointer ${
                accountDeleting ? 'opacity-60' : ''
              }`}
            >
              {accountDeleting ? 'Deleting…' : 'Delete forever'}
            </button>
          </div>
        }
      >
        <div className="rounded-lg border border-red-500/30 bg-red-500/[0.06] px-3 py-2.5 mb-3">
          <p className="text-[12px] text-red-500 leading-relaxed m-0">
            <strong>This cannot be undone.</strong> All your data — birth profiles, kundlis, palm readings, reports, videos, chats and credits — will be permanently deleted.
          </p>
        </div>

        <p className="text-[12px] text-text-muted leading-relaxed mb-2">
          Before you go, we&apos;d love to know why. Pick any that apply:
        </p>

        <div className="flex flex-col gap-1.5 mb-3">
          {DELETE_REASONS.map((reason) => {
            const checked = deleteReasons.includes(reason);
            return (
              <label
                key={reason}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer text-[12px] ${
                  checked ? 'border-primary/40 bg-primary/[0.06] text-text' : 'border-border bg-surface-2 text-text-muted'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleDeleteReason(reason)}
                  className="accent-primary w-3.5 h-3.5"
                />
                <span>{reason}</span>
              </label>
            );
          })}
        </div>

        <label className="block text-[11px] font-medium text-text-muted mb-1.5">
          Anything else? (optional)
        </label>
        <textarea
          value={deleteOtherReason}
          onChange={(e) => setDeleteOtherReason(e.target.value)}
          rows={3}
          maxLength={1000}
          placeholder="Tell us more…"
          className="w-full rounded-lg border border-border bg-surface-2 text-text text-[12px] p-2.5 resize-none focus:outline-none focus:border-primary/40"
        />

        {accountDeleteError && (
          <p className="text-[11px] text-red-500 mt-2 m-0">{accountDeleteError}</p>
        )}
      </Modal>
    </MotionPage>
  );
}

const DELETE_REASONS = [
  'Predictions weren’t accurate enough',
  'Too expensive / not worth the Dhanam',
  'Privacy concerns',
  'I found a better app',
  'I don’t use it anymore',
  'App was buggy or slow',
  'I created this account by mistake',
];
