'use client';

import { useEffect, useState, useCallback } from 'react';
import { useStore } from '@/store/useStore';
import { useRouter } from 'next/navigation';
import { MotionPage, FadeIn, StaggerList, StaggerItem } from '@/components/ui/motion-primitives';
import { createClient } from '@/lib/supabase/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface AdminUser {
  id: string;
  name: string | null;
  email: string;
  is_admin: boolean;
  is_premium: boolean;
  credits: number;
  created_at: string;
  pathway_count: number;
  report_count: number;
  last_sign_in_at: string | null;
  last_ping_at: string | null;
  is_online: boolean;
}

interface TimeSpentStats {
  today_seconds: number;
  last_7d_seconds: number;
  last_30d_seconds: number;
  lifetime_seconds: number;
  session_count: number;
  last_sign_in_at: string | null;
  last_ping_at: string | null;
}

interface NeuralPathway {
  id: string;
  subject_name: string;
  subject_dob?: string;
  subject_gender?: string;
  relationship?: string;
  life_goals?: string[];
  current_challenges?: string[];
  career_profession?: string;
  health_notes?: string;
  personality_notes?: string;
  report_ids?: string[];
  reports?: Array<{ report_type: string; created_at: string }>;
  created_at: string;
  updated_at: string;
}

interface AstrologerRow {
  id: string;
  name: string | null;
  email: string;
  astro_status: 'pending' | 'approved' | 'rejected' | null;
  astro_plan: 'basic' | 'premium' | 'premium_plus' | null;
  customer_limit: number;
  customer_count: number;
  created_at: string;
}

interface ActivityEvent {
  id: string;
  user_id: string;
  session_id: string | null;
  event_type: string;
  page: string | null;
  action: string | null;
  label: string | null;
  metadata: Record<string, unknown>;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const EVENT_META: Record<string, { icon: string; color: string }> = {
  page_view:         { icon: '👁️',  color: 'text-text-secondary' },
  feature_used:      { icon: '⚡',  color: 'text-[var(--accent)]' },
  report_generated:  { icon: '📄',  color: 'text-primary' },
  credit_spent:      { icon: '💎',  color: 'text-yellow-400' },
  chat_message:      { icon: '💬',  color: 'text-sky-400' },
  settings_changed:  { icon: '⚙️',  color: 'text-text-secondary' },
  error:             { icon: '❌',  color: 'text-red-400' },
};

const EVENT_TYPES = [
  { value: '',                 label: 'All events' },
  { value: 'page_view',        label: '👁️ Page views' },
  { value: 'feature_used',     label: '⚡ Feature used' },
  { value: 'report_generated', label: '📄 Reports generated' },
  { value: 'credit_spent',     label: '💎 Credits spent' },
  { value: 'chat_message',     label: '💬 Chat messages' },
  { value: 'settings_changed', label: '⚙️ Settings changed' },
  { value: 'error',            label: '❌ Errors' },
];

const DAY_OPTIONS = [
  { value: 1,    label: 'Today' },
  { value: 7,    label: 'Last 7 days' },
  { value: 30,   label: 'Last 30 days' },
  { value: 90,   label: 'Last 90 days' },
  { value: 9999, label: 'All time' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function Tag({ children, color = 'primary' }: { children: React.ReactNode; color?: 'primary' | 'accent' | 'red' | 'blue' | 'muted' }) {
  const colorMap = {
    primary: 'bg-primary/10 border-primary/25 text-primary',
    accent:  'bg-[var(--accent)]/10 border-[var(--accent)]/25 text-[var(--accent)]',
    red:     'bg-red-500/10 border-red-500/25 text-red-400',
    blue:    'bg-sky-500/10 border-sky-500/25 text-sky-400',
    muted:   'bg-white/5 border-white/10 text-text-secondary',
  };
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wide ${colorMap[color]}`}>
      {children}
    </span>
  );
}

function Chip({ label }: { label: string }) {
  return (
    <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-white/[0.04] border border-white/[0.08] text-text-secondary">
      {label}
    </span>
  );
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-IN');
}

function dateGroupKey(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDuration(seconds: number): string {
  if (!seconds || seconds < 1) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function shortUA(ua: string | null): string {
  if (!ua) return '';
  if (/iPhone|iPad/.test(ua)) return 'iOS';
  if (/Android/.test(ua)) return 'Android';
  if (/Windows/.test(ua)) return 'Windows';
  if (/Mac/.test(ua)) return 'macOS';
  if (/Linux/.test(ua)) return 'Linux';
  return 'Unknown';
}

// ---------------------------------------------------------------------------
// User selector panel — shared across Pathways and Activity tabs
// ---------------------------------------------------------------------------
function UserSelectorPanel({
  users,
  loading,
  selectedId,
  onSelect,
  search,
  onSearch,
}: {
  users: AdminUser[];
  loading: boolean;
  selectedId: string;
  onSelect: (id: string) => void;
  search: string;
  onSearch: (v: string) => void;
}) {
  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <div className="px-3 py-3 border-b border-border">
        <p className="text-xs font-bold text-text mb-2">Select User</p>
        <input
          type="text"
          placeholder="Search by name or email..."
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          className="w-full px-2.5 py-1.5 rounded-md text-xs bg-white/[0.04] border border-white/10 text-text outline-none"
        />
      </div>

      <div className="max-h-[480px] overflow-y-auto">
        {loading ? (
          <div className="p-5 text-center text-text-secondary text-xs">Loading...</div>
        ) : users.length === 0 ? (
          <div className="p-5 text-center text-text-secondary text-xs">No users found</div>
        ) : (
          users.map((u) => {
            const active = u.id === selectedId;
            return (
              <button
                key={u.id}
                onClick={() => onSelect(u.id)}
                className={`flex flex-col w-full px-3 py-2.5 border-none cursor-pointer border-b border-border text-left transition-all ${
                  active
                    ? 'bg-primary/[0.07] border-l-[3px] border-l-primary'
                    : 'bg-transparent border-l-[3px] border-l-transparent hover:bg-white/[0.02]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      className={`flex-shrink-0 w-2 h-2 rounded-full ${
                        u.is_online
                          ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.7)] animate-pulse'
                          : 'bg-white/15'
                      }`}
                      title={u.is_online ? 'Online now' : 'Offline'}
                    />
                    <p className={`text-xs font-semibold m-0 truncate ${active ? 'text-primary' : 'text-text'}`}>
                      {u.name || 'No name'}
                    </p>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    {u.is_admin && <Tag color="red">Admin</Tag>}
                    {u.is_premium && <Tag color="primary">Pro</Tag>}
                  </div>
                </div>
                <p className="text-[11px] text-text-secondary mt-0.5 mb-1 overflow-hidden text-ellipsis whitespace-nowrap max-w-[200px]">
                  {u.email}
                </p>
                <p className="text-[10px] text-text-secondary/70 mb-1.5">
                  {u.is_online
                    ? <span className="text-emerald-400 font-semibold">● Online now</span>
                    : u.last_sign_in_at
                      ? <>Last login {relativeTime(u.last_sign_in_at)}</>
                      : <span className="text-text-secondary/40">Never signed in</span>}
                </p>
                <div className="flex gap-2.5 text-[11px] text-text-secondary/60">
                  <span>🧠 {u.pathway_count} pathways</span>
                  <span>📄 {u.report_count} reports</span>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function AdminPage() {
  const router = useRouter();
  const setUser = useStore((s) => s.setUser);

  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [astrologers, setAstrologers] = useState<AstrologerRow[]>([]);
  const [astroFilter, setAstroFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
  const [approveModal, setApproveModal] = useState<{ userId: string; name: string } | null>(null);
  const [approvePlan, setApprovePlan] = useState<'basic' | 'premium' | 'premium_plus'>('basic');
  const [approveLoading, setApproveLoading] = useState(false);

  const [addTokensModal, setAddTokensModal] = useState<{ userId: string; name: string; credits: number } | null>(null);
  const [addTokensAmount, setAddTokensAmount] = useState('10');
  const [addTokensLoading, setAddTokensLoading] = useState(false);

  useEffect(() => {
    fetch('/api/user/me')
      .then(r => r.ok ? r.json() : null)
      .then(json => {
        if (!json?.success || !json.data) { router.replace('/login'); return; }
        setUser(json.data);
        if (!json.data.is_admin) { router.replace('/dashboard'); return; }
        setIsAdmin(true);
      })
      .catch(() => router.replace('/login'));
  }, [router, setUser]);

  // Shared state
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [usersLoading, setUsersLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'pathways' | 'users' | 'activity' | 'astrologers'>('pathways');
  const [search, setSearch] = useState('');

  // Pathways tab state
  const [pathways, setPathways] = useState<NeuralPathway[]>([]);
  const [pathwaysLoading, setPathwaysLoading] = useState(false);

  // Activity tab state
  const [activityEvents, setActivityEvents] = useState<ActivityEvent[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityTotal, setActivityTotal] = useState(0);
  const [activityHasMore, setActivityHasMore] = useState(false);
  const [activityOffset, setActivityOffset] = useState(0);
  const [activityTypeFilter, setActivityTypeFilter] = useState('');
  const [activityDays, setActivityDays] = useState(7);
  const [timeStats, setTimeStats] = useState<TimeSpentStats | null>(null);

  // Load astrologers
  useEffect(() => {
    if (!isAdmin) return;
    fetch('/api/admin/astrologer/list')
      .then(r => r.json())
      .then(({ data }) => setAstrologers(data ?? []))
      .catch(() => {});
  }, [isAdmin]);

  async function handleApprove() {
    if (!approveModal) return;
    setApproveLoading(true);
    try {
      await fetch('/api/admin/astrologer/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: approveModal.userId, plan: approvePlan }),
      });
      setAstrologers(prev => prev.map(a =>
        a.id === approveModal.userId
          ? { ...a, astro_status: 'approved', astro_plan: approvePlan }
          : a
      ));
      setApproveModal(null);
    } catch { /* ignore */ }
    finally { setApproveLoading(false); }
  }

  async function handleAddTokens() {
    if (!addTokensModal) return;
    const amount = parseInt(addTokensAmount, 10);
    if (!amount || amount < 1 || amount > 1000) return;
    setAddTokensLoading(true);
    try {
      const res = await fetch('/api/admin/add-credits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: addTokensModal.userId, amount }),
      });
      if (res.ok) {
        const json = await res.json();
        setUsers(prev => prev.map(u => u.id === addTokensModal!.userId ? { ...u, credits: json.credits } : u));
        setAddTokensModal(null);
        setAddTokensAmount('10');
      }
    } catch { /* ignore */ }
    finally { setAddTokensLoading(false); }
  }

  async function handleReject(userId: string) {
    if (!confirm('Reject this astrologer?')) return;
    await fetch('/api/admin/astrologer/reject', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    setAstrologers(prev => prev.map(a =>
      a.id === userId ? { ...a, astro_status: 'rejected' } : a
    ));
  }

  // Load all users
  useEffect(() => {
    if (!isAdmin) return;
    fetch('/api/admin/users')
      .then((r) => r.json())
      .then(({ data }) => {
        setUsers(data ?? []);
        const first = (data ?? []).find((u: AdminUser) => u.pathway_count > 0);
        if (first) setSelectedUserId(first.id);
      })
      .catch(() => {})
      .finally(() => setUsersLoading(false));
  }, [isAdmin]);

  // Load pathways
  const loadPathways = useCallback(async (uid: string) => {
    if (!uid) { setPathways([]); return; }
    setPathwaysLoading(true);
    try {
      const res = await fetch(`/api/admin/neural-pathways?user_id=${uid}`);
      const { data } = await res.json();
      setPathways(data ?? []);
    } catch { setPathways([]); }
    finally { setPathwaysLoading(false); }
  }, []);

  useEffect(() => {
    if (activeTab === 'pathways') loadPathways(selectedUserId);
  }, [activeTab, selectedUserId, loadPathways]);

  // Load activity
  const loadActivity = useCallback(async (
    uid: string,
    typeFilter: string,
    days: number,
    offset: number,
  ) => {
    if (!uid) { setActivityEvents([]); return; }
    setActivityLoading(true);
    try {
      const params = new URLSearchParams({
        user_id: uid,
        limit: '50',
        offset: String(offset),
      });
      if (typeFilter) params.set('event_type', typeFilter);
      if (days < 9999) {
        params.set('from', new Date(Date.now() - days * 86400000).toISOString());
      }
      const res = await fetch(`/api/admin/activity?${params}`);
      const { data, count } = await res.json();
      const events: ActivityEvent[] = data ?? [];
      setActivityEvents(prev => offset === 0 ? events : [...prev, ...events]);
      setActivityTotal(count ?? 0);
      setActivityHasMore(events.length === 50);
      setActivityOffset(offset + events.length);
    } catch {
      if (offset === 0) setActivityEvents([]);
    } finally {
      setActivityLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab !== 'activity' || !selectedUserId) return;
    setActivityOffset(0);
    loadActivity(selectedUserId, activityTypeFilter, activityDays, 0);
  }, [activeTab, selectedUserId, activityTypeFilter, activityDays, loadActivity]);

  // Load time-spent stats when a user is selected on the activity tab.
  // Independent of date-range filter — Today/7d/30d/Lifetime is always the full picture.
  useEffect(() => {
    if (activeTab !== 'activity' || !selectedUserId) {
      setTimeStats(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/admin/user-time-spent?user_id=${selectedUserId}`)
      .then((r) => r.json())
      .then(({ data }) => { if (!cancelled) setTimeStats(data ?? null); })
      .catch(() => { if (!cancelled) setTimeStats(null); });
    return () => { cancelled = true; };
  }, [activeTab, selectedUserId]);

  const filteredUsers = users.filter((u) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (u.name ?? '').toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
  });

  const selectedUser = users.find((u) => u.id === selectedUserId);

  // Group activity events by date
  const groupedActivity = activityEvents.reduce<Record<string, ActivityEvent[]>>((acc, ev) => {
    const key = dateGroupKey(ev.created_at);
    if (!acc[key]) acc[key] = [];
    acc[key].push(ev);
    return acc;
  }, {});

  // Summary stats for selected user's activity
  const uniqueSessions = new Set(activityEvents.map(e => e.session_id).filter(Boolean)).size;
  const topPage = activityEvents
    .filter(e => e.event_type === 'page_view' && e.label)
    .reduce<Record<string, number>>((acc, e) => {
      const k = e.label!;
      acc[k] = (acc[k] ?? 0) + 1;
      return acc;
    }, {});
  const topPageName = Object.entries(topPage).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—';

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-screen bg-bg">
        <p className="text-text-secondary text-sm">Loading...</p>
      </div>
    );
  }

  return (
    <MotionPage className="bg-bg min-h-screen px-3 py-4 pb-20">
      <div className="max-w-[1100px] mx-auto">

        {/* Header */}
        <FadeIn className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-lg font-extrabold text-text font-[family-name:var(--font-serif)]">Admin Panel</h1>
            <p className="text-xs text-text-secondary mt-1">
              {users.length} users · {users.reduce((s, u) => s + u.pathway_count, 0)} neural pathways
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Tag color="red">ADMIN</Tag>
            <button
              type="button"
              disabled={signingOut}
              onClick={async () => {
                if (signingOut) return;
                setSigningOut(true);
                try {
                  const supabase = createClient();
                  await supabase.auth.signOut();
                  try { await fetch('/api/auth/signout', { method: 'POST' }); } catch { /* ignore */ }
                } finally {
                  setUser(null);
                  router.replace('/login');
                }
              }}
              className="text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:border-red-500/50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-1"
              aria-label="Sign out"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              {signingOut ? 'Signing out…' : 'Logout'}
            </button>
          </div>
        </FadeIn>

        {/* Tab bar */}
        <FadeIn delay={0.05} className="mb-4">
          <div className="flex gap-1 bg-surface border border-border rounded-lg p-1 w-fit flex-wrap">
            {(['pathways', 'users', 'activity', 'astrologers'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-1.5 rounded-md border-none cursor-pointer text-xs font-semibold transition-all ${
                  activeTab === tab
                    ? 'bg-primary text-bg'
                    : 'bg-transparent text-text-secondary hover:text-text'
                }`}
              >
                {tab === 'pathways' ? '🧠 Neural Pathways' : tab === 'users' ? '👥 All Users' : tab === 'activity' ? '📊 Activity' : '🔮 Astrologers'}
              </button>
            ))}
          </div>
        </FadeIn>

        {/* ═══════════════════════════════════════════════════════ */}
        {/* NEURAL PATHWAYS TAB                                     */}
        {/* ═══════════════════════════════════════════════════════ */}
        {activeTab === 'pathways' && (
          <div className="grid grid-cols-[minmax(0,280px)_1fr] gap-4 items-start">
            <UserSelectorPanel
              users={filteredUsers}
              loading={usersLoading}
              selectedId={selectedUserId}
              onSelect={setSelectedUserId}
              search={search}
              onSearch={setSearch}
            />

            {/* Right: pathways for selected user */}
            <div>
              {!selectedUserId ? (
                <div className="bg-surface border border-border rounded-xl p-10 text-center">
                  <p className="text-3xl mb-2">🧠</p>
                  <p className="text-text-secondary text-sm">Select a user to view their Neural Pathways</p>
                </div>
              ) : pathwaysLoading ? (
                <div className="bg-surface border border-border rounded-xl p-10 text-center">
                  <p className="text-text-secondary text-sm">Loading pathways...</p>
                </div>
              ) : pathways.length === 0 ? (
                <div className="bg-surface border border-border rounded-xl p-10 text-center">
                  <p className="text-3xl mb-2">🌱</p>
                  <p className="text-text-secondary text-sm">
                    {selectedUser?.name || selectedUser?.email} hasn&apos;t built any Neural Pathways yet.
                  </p>
                  <p className="text-text-secondary/60 text-xs mt-1.5">
                    Pathways are created after a user completes post-generation questions.
                  </p>
                </div>
              ) : (
                <StaggerList className="flex flex-col gap-3">
                  {/* Selected user banner */}
                  <StaggerItem>
                    <div className="bg-primary/10 border border-primary/20 rounded-lg px-3 py-2.5 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-bold text-primary m-0">
                          {selectedUser?.name || 'Unknown'} — {selectedUser?.email}
                        </p>
                        <p className="text-xs text-text-secondary mt-0.5">
                          {pathways.length} neural pathway{pathways.length !== 1 ? 's' : ''} · {selectedUser?.report_count} reports
                        </p>
                      </div>
                      <span className="text-2xl">🧠</span>
                    </div>
                  </StaggerItem>

                  {/* Pathway cards */}
                  {pathways.map((p) => (
                    <StaggerItem key={p.id}>
                      <div className="bg-surface border border-border rounded-xl overflow-hidden">
                        <div className="px-3.5 py-3 border-b border-border flex items-center justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-bold text-text m-0">{p.subject_name}</p>
                              {p.relationship && <Tag color="accent">{p.relationship}</Tag>}
                              {p.subject_gender && <Tag color="blue">{p.subject_gender}</Tag>}
                            </div>
                            <p className="text-xs text-text-secondary mt-0.5">
                              {p.subject_dob
                                ? new Date(p.subject_dob).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                                : 'DOB not provided'}
                              {' · '}Updated {new Date(p.updated_at).toLocaleDateString('en-IN')}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-[11px] text-text-secondary mb-0.5">Reports linked</p>
                            <p className="text-lg font-extrabold text-primary m-0">{(p.report_ids ?? []).length}</p>
                          </div>
                        </div>

                        <div className="px-3.5 py-3 flex flex-col gap-3">
                          {p.life_goals && p.life_goals.length > 0 && (
                            <div>
                              <p className="text-[11px] text-text-secondary font-semibold uppercase tracking-wide mb-1.5">Life Goals</p>
                              <div className="flex flex-wrap gap-1.5">
                                {p.life_goals.map((g) => <Chip key={g} label={g} />)}
                              </div>
                            </div>
                          )}
                          {p.current_challenges && p.current_challenges.length > 0 && (
                            <div>
                              <p className="text-[11px] text-text-secondary font-semibold uppercase tracking-wide mb-1.5">Current Challenges</p>
                              <div className="flex flex-wrap gap-1.5">
                                {p.current_challenges.map((c) => <Chip key={c} label={c.replace(/_/g, ' ')} />)}
                              </div>
                            </div>
                          )}
                          {(p.career_profession || p.health_notes) && (
                            <div className="grid grid-cols-2 gap-2.5">
                              {p.career_profession && (
                                <div className="bg-white/[0.03] rounded-lg px-3 py-2 border border-white/[0.06]">
                                  <p className="text-[10px] text-text-secondary font-bold uppercase tracking-wide mb-1">💼 Career</p>
                                  <p className="text-xs text-text m-0">{p.career_profession}</p>
                                </div>
                              )}
                              {p.health_notes && (
                                <div className="bg-white/[0.03] rounded-lg px-3 py-2 border border-white/[0.06]">
                                  <p className="text-[10px] text-text-secondary font-bold uppercase tracking-wide mb-1">🏥 Health Notes</p>
                                  <p className="text-xs text-text m-0 leading-relaxed">{p.health_notes}</p>
                                </div>
                              )}
                            </div>
                          )}
                          {p.personality_notes && (
                            <div className="bg-white/[0.03] rounded-lg px-3 py-2 border border-white/[0.06]">
                              <p className="text-[10px] text-text-secondary font-bold uppercase tracking-wide mb-1">🧩 Personality Notes</p>
                              <p className="text-xs text-text m-0 leading-relaxed">{p.personality_notes}</p>
                            </div>
                          )}
                          {p.reports && p.reports.length > 0 && (
                            <div>
                              <p className="text-[11px] text-text-secondary font-semibold uppercase tracking-wide mb-1.5">Linked Reports</p>
                              <div className="flex flex-wrap gap-1.5">
                                {p.reports.map((r, i) => (
                                  <span key={i} className="text-[11px] px-2.5 py-0.5 rounded-full bg-primary/10 border border-primary/25 text-primary-soft">
                                    {r.report_type.replace('_', ' ')} · {new Date(r.created_at).toLocaleDateString('en-IN')}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </StaggerItem>
                  ))}
                </StaggerList>
              )}
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════ */}
        {/* ALL USERS TAB                                           */}
        {/* ═══════════════════════════════════════════════════════ */}
        {activeTab === 'users' && (
          <FadeIn>
            <div className="bg-surface border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <p className="text-sm font-bold text-text m-0">All Users</p>
                <input
                  type="text"
                  placeholder="Search..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="px-2.5 py-1.5 rounded-md text-xs bg-white/[0.04] border border-white/10 text-text outline-none w-[200px]"
                />
              </div>

              {usersLoading ? (
                <div className="p-7 text-center text-text-secondary text-xs">Loading...</div>
              ) : (
                <div>
                  <div className="grid grid-cols-[2fr_2fr_110px_80px_80px_80px] px-4 py-2 gap-2.5 text-[11px] font-bold text-text-secondary/60 uppercase tracking-wide border-b border-border">
                    <span>Name</span>
                    <span>Email</span>
                    <span>Credits</span>
                    <span>Reports</span>
                    <span>Pathways</span>
                    <span>Role</span>
                  </div>
                  {filteredUsers.map((u) => (
                    <div
                      key={u.id}
                      className="grid grid-cols-[2fr_2fr_110px_80px_80px_80px] px-4 py-2.5 gap-2.5 border-b border-white/[0.03] items-center hover:bg-white/[0.02] transition-colors"
                    >
                      <div>
                        <p className="text-xs font-semibold text-text m-0">
                          {u.name || <span className="text-text-secondary/60">No name</span>}
                        </p>
                        <p className="text-[11px] text-text-secondary/60 mt-0.5">
                          Joined {new Date(u.created_at).toLocaleDateString('en-IN')}
                        </p>
                      </div>
                      <p className="text-xs text-text-secondary m-0 overflow-hidden text-ellipsis whitespace-nowrap">{u.email}</p>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold text-primary">{u.credits}</span>
                        <button
                          onClick={() => { setAddTokensModal({ userId: u.id, name: u.name || u.email, credits: u.credits }); setAddTokensAmount('10'); }}
                          className="w-5 h-5 flex items-center justify-center rounded bg-[var(--accent)]/10 border border-[var(--accent)]/25 text-[var(--accent)] text-xs font-bold hover:bg-[var(--accent)]/20 transition-all flex-shrink-0 cursor-pointer"
                          title="Add tokens"
                        >+</button>
                      </div>
                      <p className="text-xs text-text m-0">{u.report_count}</p>
                      <p className="text-xs text-text m-0">{u.pathway_count}</p>
                      <div className="flex gap-1 flex-wrap">
                        {u.is_admin && <Tag color="red">Admin</Tag>}
                        {u.is_premium && <Tag color="primary">Pro</Tag>}
                        {!u.is_admin && !u.is_premium && <Tag color="muted">Free</Tag>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Add Tokens modal */}
            {addTokensModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
                <div className="bg-surface border border-border rounded-2xl px-5 py-5 w-full max-w-sm flex flex-col gap-4">
                  <div>
                    <p className="text-sm font-bold text-text m-0">Add Tokens</p>
                    <p className="text-xs text-text-secondary mt-0.5">
                      {addTokensModal.name} · current balance: <span className="text-primary font-semibold">{addTokensModal.credits}</span>
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-text-secondary mb-2">Quick amounts</p>
                    <div className="flex gap-2 mb-3">
                      {[5, 10, 25, 50].map(n => (
                        <button
                          key={n}
                          onClick={() => setAddTokensAmount(String(n))}
                          className={`flex-1 py-2 rounded-lg border cursor-pointer text-xs font-bold transition-all ${
                            addTokensAmount === String(n)
                              ? 'bg-[var(--accent)]/10 border-[var(--accent)]/40 text-[var(--accent)]'
                              : 'bg-white/[0.03] border-white/10 text-text hover:border-white/20'
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                    <input
                      type="number"
                      min={1}
                      max={1000}
                      value={addTokensAmount}
                      onChange={(e) => setAddTokensAmount(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg text-xs bg-white/[0.04] border border-white/10 text-text outline-none focus:border-[var(--accent)]/40"
                      placeholder="Custom amount (1–1000)"
                    />
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => setAddTokensModal(null)}
                      className="flex-1 py-2.5 rounded-lg bg-white/[0.05] border border-border text-text-secondary text-xs font-bold cursor-pointer border-solid"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleAddTokens}
                      disabled={addTokensLoading || !parseInt(addTokensAmount) || parseInt(addTokensAmount) < 1}
                      className="flex-1 py-2.5 rounded-lg bg-[var(--accent)] text-bg text-xs font-bold border-none cursor-pointer disabled:opacity-60"
                    >
                      {addTokensLoading ? 'Adding…' : `Add ${addTokensAmount || 0} Tokens`}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </FadeIn>
        )}

        {/* ═══════════════════════════════════════════════════════ */}
        {/* ACTIVITY TAB                                            */}
        {/* ═══════════════════════════════════════════════════════ */}
        {activeTab === 'activity' && (
          <div className="grid grid-cols-[minmax(0,280px)_1fr] gap-4 items-start">
            <UserSelectorPanel
              users={filteredUsers}
              loading={usersLoading}
              selectedId={selectedUserId}
              onSelect={(id) => { setSelectedUserId(id); setActivityOffset(0); }}
              search={search}
              onSearch={setSearch}
            />

            {/* Right: activity feed */}
            <div className="flex flex-col gap-3">
              {!selectedUserId ? (
                <div className="bg-surface border border-border rounded-xl p-10 text-center">
                  <p className="text-3xl mb-2">📊</p>
                  <p className="text-text-secondary text-sm">Select a user to view their activity</p>
                </div>
              ) : (
                <>
                  {/* User banner */}
                  <div className="bg-primary/10 border border-primary/20 rounded-lg px-3 py-2.5 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-primary m-0">
                        {selectedUser?.name || 'Unknown'} — {selectedUser?.email}
                      </p>
                      <p className="text-xs text-text-secondary mt-0.5">
                        {activityTotal} events · {uniqueSessions} session{uniqueSessions !== 1 ? 's' : ''}
                        {activityEvents.length > 0 && ` · Last active ${relativeTime(activityEvents[0].created_at)}`}
                      </p>
                    </div>
                    <span className="text-2xl">📊</span>
                  </div>

                  {/* Summary stats */}
                  {activityEvents.length > 0 && (
                    <div className="grid grid-cols-4 gap-2">
                      {[
                        { label: 'Total Events', value: activityTotal },
                        { label: 'Sessions', value: uniqueSessions },
                        { label: 'Page Views', value: activityEvents.filter(e => e.event_type === 'page_view').length },
                        { label: 'Top Page', value: topPageName },
                      ].map(({ label, value }) => (
                        <div key={label} className="bg-surface border border-border rounded-lg px-3 py-2.5 text-center">
                          <p className="text-[10px] text-text-secondary/60 uppercase tracking-wide font-bold mb-0.5">{label}</p>
                          <p className="text-sm font-extrabold text-text m-0 truncate">{value}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Time spent (Today / 7d / 30d / Lifetime) */}
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { label: 'Time Today',     value: timeStats?.today_seconds },
                      { label: 'Last 7 Days',    value: timeStats?.last_7d_seconds },
                      { label: 'Last 30 Days',   value: timeStats?.last_30d_seconds },
                      { label: 'Lifetime',       value: timeStats?.lifetime_seconds },
                    ].map(({ label, value }) => (
                      <div key={label} className="bg-[var(--accent)]/5 border border-[var(--accent)]/20 rounded-lg px-3 py-2.5 text-center">
                        <p className="text-[10px] text-[var(--accent)]/80 uppercase tracking-wide font-bold mb-0.5">{label}</p>
                        <p className="text-sm font-extrabold text-text m-0 truncate">
                          {timeStats === null
                            ? '…'
                            : formatDuration(value ?? 0)}
                        </p>
                      </div>
                    ))}
                  </div>

                  {/* Filters */}
                  <div className="flex gap-2 flex-wrap">
                    <select
                      value={activityTypeFilter}
                      onChange={(e) => { setActivityTypeFilter(e.target.value); setActivityOffset(0); }}
                      className="px-2.5 py-1.5 rounded-md text-xs bg-surface border border-border text-text outline-none cursor-pointer"
                    >
                      {EVENT_TYPES.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                    <select
                      value={activityDays}
                      onChange={(e) => { setActivityDays(Number(e.target.value)); setActivityOffset(0); }}
                      className="px-2.5 py-1.5 rounded-md text-xs bg-surface border border-border text-text outline-none cursor-pointer"
                    >
                      {DAY_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* Timeline */}
                  {activityLoading && activityOffset === 0 ? (
                    <div className="bg-surface border border-border rounded-xl p-8 text-center">
                      <p className="text-text-secondary text-xs">Loading activity...</p>
                    </div>
                  ) : activityEvents.length === 0 ? (
                    <div className="bg-surface border border-border rounded-xl p-8 text-center">
                      <p className="text-3xl mb-2">🌙</p>
                      <p className="text-text-secondary text-sm">No activity in this period</p>
                    </div>
                  ) : (
                    <div className="bg-surface border border-border rounded-xl overflow-hidden">
                      {Object.entries(groupedActivity).map(([dateKey, events]) => (
                        <div key={dateKey}>
                          {/* Date separator */}
                          <div className="px-4 py-2 bg-white/[0.02] border-b border-border">
                            <p className="text-[10px] font-bold text-text-secondary/60 uppercase tracking-widest m-0">{dateKey}</p>
                          </div>

                          {/* Events for this date */}
                          {events.map((ev, i) => {
                            const meta = EVENT_META[ev.event_type] ?? { icon: '•', color: 'text-text-secondary' };
                            const isLast = i === events.length - 1;
                            return (
                              <div
                                key={ev.id}
                                className={`flex items-start gap-3 px-4 py-2.5 hover:bg-white/[0.015] transition-colors ${!isLast ? 'border-b border-white/[0.03]' : ''}`}
                              >
                                {/* Icon */}
                                <span className={`text-sm mt-0.5 flex-shrink-0 ${meta.color}`}>{meta.icon}</span>

                                {/* Content */}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <p className="text-xs font-semibold text-text m-0">
                                      {ev.label ?? ev.event_type.replace(/_/g, ' ')}
                                    </p>
                                    {ev.action && (
                                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.04] border border-white/[0.08] text-text-secondary">
                                        {ev.action.replace(/_/g, ' ')}
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                    {ev.page && (
                                      <p className="text-[11px] text-text-secondary/50 m-0 font-mono truncate max-w-[200px]">{ev.page}</p>
                                    )}
                                    {ev.session_id && (
                                      <span className="text-[10px] text-text-secondary/70 font-mono">
                                        {ev.session_id.slice(0, 8)}
                                      </span>
                                    )}
                                    {ev.user_agent && (
                                      <span className="text-[10px] text-text-secondary/70">{shortUA(ev.user_agent)}</span>
                                    )}
                                    {ev.ip && (
                                      <span className="text-[10px] text-text-secondary/70">{ev.ip}</span>
                                    )}
                                  </div>
                                  {/* Extra metadata if meaningful */}
                                  {ev.metadata && Object.keys(ev.metadata).length > 0 &&
                                    !('referrer' in ev.metadata) && (
                                    <div className="mt-1 flex flex-wrap gap-1.5">
                                      {Object.entries(ev.metadata).map(([k, v]) => (
                                        <span key={k} className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.03] text-text-secondary/50">
                                          {k}: {String(v)}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>

                                {/* Time */}
                                <p className="text-[11px] text-text-secondary/50 m-0 flex-shrink-0 mt-0.5">
                                  {relativeTime(ev.created_at)}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      ))}

                      {/* Load more */}
                      {activityHasMore && (
                        <div className="px-4 py-3 border-t border-border text-center">
                          <button
                            onClick={() => loadActivity(selectedUserId, activityTypeFilter, activityDays, activityOffset)}
                            disabled={activityLoading}
                            className="text-xs text-primary font-semibold cursor-pointer bg-transparent border-none hover:text-primary/80 disabled:opacity-50"
                          >
                            {activityLoading ? 'Loading...' : `Load more · ${activityTotal - activityEvents.length} remaining`}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════ */}
        {/* ASTROLOGERS TAB                                         */}
        {/* ═══════════════════════════════════════════════════════ */}
        {activeTab === 'astrologers' && (
          <FadeIn>
            {/* Approve modal */}
            {approveModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
                <div className="bg-surface border border-border rounded-2xl px-5 py-5 w-full max-w-sm flex flex-col gap-4">
                  <p className="text-sm font-bold text-text m-0">Approve {approveModal.name}</p>
                  <div>
                    <p className="text-xs text-text-secondary mb-2">Select plan</p>
                    <div className="flex flex-col gap-2">
                      {([
                        { key: 'basic', label: 'Basic', price: 500, customers: 10 },
                        { key: 'premium', label: 'Premium', price: 1000, customers: 20 },
                        { key: 'premium_plus', label: 'Premium+', price: 2500, customers: 50 },
                      ] as const).map(p => (
                        <button
                          key={p.key}
                          onClick={() => setApprovePlan(p.key)}
                          className={`flex items-center justify-between px-3 py-2.5 rounded-lg border cursor-pointer transition-all ${
                            approvePlan === p.key
                              ? 'bg-primary/10 border-primary/40 text-primary'
                              : 'bg-white/[0.03] border-white/10 text-text hover:border-white/20'
                          }`}
                        >
                          <span className="text-xs font-semibold">{p.label}</span>
                          <span className="text-xs text-text-secondary">{p.customers} clients · ₹{p.price}/mo</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setApproveModal(null)}
                      className="flex-1 py-2.5 rounded-lg bg-white/[0.05] border border-border text-text-secondary text-xs font-bold cursor-pointer border-solid"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleApprove}
                      disabled={approveLoading}
                      className="flex-1 py-2.5 rounded-lg bg-primary text-bg text-xs font-bold border-none cursor-pointer disabled:opacity-60"
                    >
                      {approveLoading ? 'Approving…' : 'Approve'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="bg-surface border border-border rounded-xl overflow-hidden">
              {/* Filter bar */}
              <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3 flex-wrap">
                <p className="text-sm font-bold text-text m-0">
                  Astrologers
                  <span className="ml-2 text-xs font-normal text-text-secondary">
                    ({astrologers.filter(a => a.astro_status === 'pending').length} pending)
                  </span>
                </p>
                <div className="flex gap-1">
                  {(['all', 'pending', 'approved', 'rejected'] as const).map(f => (
                    <button
                      key={f}
                      onClick={() => setAstroFilter(f)}
                      className={`px-3 py-1 rounded-md border-none cursor-pointer text-[11px] font-semibold transition-all capitalize ${
                        astroFilter === f ? 'bg-primary text-bg' : 'bg-white/[0.04] text-text-secondary hover:text-text'
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              {/* Table header */}
              <div className="grid grid-cols-[2fr_2fr_100px_100px_80px_120px] px-4 py-2 gap-2 text-[11px] font-bold text-text-secondary/60 uppercase tracking-wide border-b border-border">
                <span>Name</span>
                <span>Email</span>
                <span>Plan</span>
                <span>Clients</span>
                <span>Status</span>
                <span>Actions</span>
              </div>

              {astrologers.filter(a => astroFilter === 'all' || a.astro_status === astroFilter).length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-3xl mb-2">🔮</p>
                  <p className="text-text-secondary text-sm">No astrologers in this filter</p>
                </div>
              ) : (
                astrologers
                  .filter(a => astroFilter === 'all' || a.astro_status === astroFilter)
                  .map(a => (
                    <div
                      key={a.id}
                      className="grid grid-cols-[2fr_2fr_100px_100px_80px_120px] px-4 py-3 gap-2 border-b border-white/[0.03] items-center hover:bg-white/[0.02] transition-colors"
                    >
                      <div>
                        <p className="text-xs font-semibold text-text m-0">{a.name ?? 'No name'}</p>
                        <p className="text-[11px] text-text-secondary/60 mt-0.5">
                          {new Date(a.created_at).toLocaleDateString('en-IN')}
                        </p>
                      </div>
                      <p className="text-xs text-text-secondary m-0 overflow-hidden text-ellipsis whitespace-nowrap">{a.email}</p>
                      <p className="text-xs text-text m-0 capitalize">
                        {a.astro_plan ? a.astro_plan.replace('_', '+') : '—'}
                      </p>
                      <p className="text-xs text-text m-0">
                        {a.customer_count} / {a.customer_limit}
                      </p>
                      <div>
                        <Tag color={a.astro_status === 'approved' ? 'primary' : a.astro_status === 'rejected' ? 'red' : 'accent'}>
                          {a.astro_status ?? 'pending'}
                        </Tag>
                      </div>
                      <div className="flex gap-1.5">
                        {a.astro_status !== 'approved' && (
                          <button
                            onClick={() => setApproveModal({ userId: a.id, name: a.name ?? a.email })}
                            className="px-2 py-1 rounded-md bg-primary/10 border border-primary/25 text-primary text-[11px] font-bold cursor-pointer hover:bg-primary/20 transition-colors"
                          >
                            Approve
                          </button>
                        )}
                        {a.astro_status !== 'rejected' && (
                          <button
                            onClick={() => handleReject(a.id)}
                            className="px-2 py-1 rounded-md bg-red-500/10 border border-red-500/25 text-red-400 text-[11px] font-bold cursor-pointer hover:bg-red-500/20 transition-colors"
                          >
                            Reject
                          </button>
                        )}
                      </div>
                    </div>
                  ))
              )}
            </div>
          </FadeIn>
        )}

      </div>
    </MotionPage>
  );
}
