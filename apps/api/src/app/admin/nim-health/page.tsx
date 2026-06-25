'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MotionPage, FadeIn, StaggerList, StaggerItem } from '@/components/ui/motion-primitives';

interface KeyHealth {
  slot: string;
  preview: string;
  status: 'ok' | 'dead' | 'degraded' | 'rate_limited' | 'unreachable';
  httpStatus?: number;
  latencyMs?: number;
  error?: string;
}

interface HealthResponse {
  summary: {
    primaryModel: string;
    runtimeKeyCount: number;
    ok: number;
    dead: number;
    degraded: number;
    rate_limited: number;
    unreachable: number;
  };
  results: KeyHealth[];
}

type StatusKey = KeyHealth['status'];

const STATUS_META: Record<StatusKey, {
  label: string;
  pill: string;
  dot: string;
  bar: string;
  text: string;
}> = {
  ok: {
    label: 'Healthy',
    pill: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300',
    dot: 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]',
    bar: 'bg-gradient-to-b from-emerald-300 to-emerald-500',
    text: 'text-emerald-300',
  },
  dead: {
    label: 'Dead',
    pill: 'bg-red-500/10 border-red-500/35 text-red-300',
    dot: 'bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.7)]',
    bar: 'bg-gradient-to-b from-red-400 to-red-600',
    text: 'text-red-300',
  },
  degraded: {
    label: 'Degraded',
    pill: 'bg-yellow-500/10 border-yellow-500/35 text-yellow-300',
    dot: 'bg-yellow-400 shadow-[0_0_8px_rgba(250,204,21,0.7)]',
    bar: 'bg-gradient-to-b from-yellow-300 to-yellow-500',
    text: 'text-yellow-300',
  },
  rate_limited: {
    label: 'Throttled',
    pill: 'bg-orange-500/10 border-orange-500/35 text-orange-300',
    dot: 'bg-orange-400 shadow-[0_0_8px_rgba(251,146,60,0.7)]',
    bar: 'bg-gradient-to-b from-orange-300 to-orange-500',
    text: 'text-orange-300',
  },
  unreachable: {
    label: 'Unreachable',
    pill: 'bg-white/5 border-white/15 text-text-muted',
    dot: 'bg-white/30',
    bar: 'bg-white/20',
    text: 'text-text-muted',
  },
};

function StatusPill({ status }: { status: StatusKey }) {
  const m = STATUS_META[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full border uppercase tracking-[0.12em] ${m.pill}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  );
}

function latencyTone(ms: number | undefined): string {
  if (ms == null) return 'text-text-muted';
  if (ms < 600) return 'text-emerald-300';
  if (ms < 1500) return 'text-[var(--accent)]';
  if (ms < 3000) return 'text-orange-300';
  return 'text-red-300';
}

function HealthRing({
  ok,
  total,
}: {
  ok: number;
  total: number;
}) {
  const pct = total > 0 ? Math.round((ok / total) * 100) : 0;
  const C = 2 * Math.PI * 42;
  const offset = C - (pct / 100) * C;

  return (
    <div className="relative w-[120px] h-[120px] shrink-0">
      <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
        <defs>
          <linearGradient id="ringGold" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#F2CA50" />
            <stop offset="100%" stopColor="#D4AF37" />
          </linearGradient>
        </defs>
        <circle
          cx="50"
          cy="50"
          r="42"
          fill="none"
          stroke="rgba(248,249,250,0.10)"
          strokeWidth="8"
        />
        <circle
          cx="50"
          cy="50"
          r="42"
          fill="none"
          stroke="url(#ringGold)"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={offset}
          style={{
            transition: 'stroke-dashoffset 600ms cubic-bezier(.4,0,.2,1)',
            filter: 'drop-shadow(0 0 6px rgba(242,202,80,0.45))',
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-extrabold text-text leading-none">{pct}%</span>
        <span className="text-[10px] uppercase tracking-[0.18em] text-text-muted mt-1">
          {ok}/{total} live
        </span>
      </div>
    </div>
  );
}

function SummaryStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | string;
  accent: 'good' | 'bad' | 'warn' | 'neutral' | 'gold';
}) {
  const tone = {
    good:    { text: 'text-emerald-300', glow: 'shadow-[0_0_18px_rgba(52,211,153,0.10)]' },
    bad:     { text: 'text-red-300',     glow: 'shadow-[0_0_18px_rgba(248,113,113,0.10)]' },
    warn:    { text: 'text-yellow-300',  glow: 'shadow-[0_0_18px_rgba(250,204,21,0.10)]' },
    neutral: { text: 'text-text',        glow: '' },
    gold:    { text: 'text-[var(--accent)]', glow: 'shadow-[0_0_18px_rgba(242,202,80,0.12)]' },
  }[accent];

  return (
    <div
      className={`relative rounded-xl border border-border px-4 py-3 flex-1 min-w-[110px] backdrop-blur-[8px] ${tone.glow}`}
      style={{ background: 'var(--surface)' }}
    >
      <p className="text-[10px] uppercase tracking-[0.14em] text-text-muted font-semibold mb-1.5">
        {label}
      </p>
      <p className={`text-2xl font-extrabold leading-none ${tone.text}`}>{value}</p>
    </div>
  );
}

function KeyRow({ row }: { row: KeyHealth }) {
  const isUnset = row.error === 'env var not set';
  const meta = STATUS_META[row.status];
  const slotNumber = (row.slot.match(/_(\d+)$/)?.[1] ?? row.slot.replace(/^NVIDIA_NIM_API_KEY_?/, '')) || '·';

  return (
    <div
      className={`relative grid grid-cols-12 gap-3 px-4 py-3 items-center text-sm border-b border-border last:border-b-0 transition-colors ${
        isUnset ? 'opacity-45' : 'hover:bg-white/[0.025]'
      }`}
    >
      {/* Left status bar */}
      <div className={`absolute left-0 top-0 bottom-0 w-[3px] ${isUnset ? 'bg-transparent' : meta.bar}`} />

      {/* Slot avatar + name */}
      <div className="col-span-4 flex items-center gap-2.5 min-w-0">
        <span
          className="flex items-center justify-center w-8 h-8 rounded-lg text-[11px] font-bold shrink-0 border"
          style={{
            background: 'var(--surface-3)',
            borderColor: 'var(--border)',
            color: 'var(--text-muted)',
          }}
        >
          {slotNumber}
        </span>
        <div className="min-w-0">
          <p className="font-mono text-[11px] text-text truncate">{row.slot}</p>
          <p className="font-mono text-[10px] text-text-muted truncate">{row.preview}</p>
        </div>
      </div>

      {/* Status */}
      <div className="col-span-3">
        <StatusPill status={row.status} />
      </div>

      {/* HTTP */}
      <div className="col-span-1 text-right">
        <span className="font-mono text-[11px] text-text-muted">
          {row.httpStatus ?? '—'}
        </span>
      </div>

      {/* Latency */}
      <div className="col-span-2 text-right">
        <span className={`font-mono text-[11px] font-semibold ${latencyTone(row.latencyMs)}`}>
          {row.latencyMs != null ? `${row.latencyMs} ms` : '—'}
        </span>
      </div>

      {/* Error view */}
      <div className="col-span-2 flex justify-end">
        {row.error && !isUnset && (
          <button
            type="button"
            onClick={() => alert(`${row.slot}\n\n${row.error}`)}
            className="text-[10px] uppercase tracking-[0.10em] font-bold text-text-muted hover:text-[var(--accent)] underline-offset-4 hover:underline transition-colors"
            title="Show error detail"
          >
            View error
          </button>
        )}
      </div>
    </div>
  );
}

export default function NimHealthPage() {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [data, setData] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);
  const [filter, setFilter] = useState<'all' | StatusKey>('all');

  useEffect(() => {
    fetch('/api/user/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (!json?.success || !json.data) {
          router.replace('/login');
          return;
        }
        if (!json.data.is_admin) {
          router.replace('/dashboard');
          return;
        }
        setIsAdmin(true);
      })
      .catch(() => router.replace('/login'));
  }, [router]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/nim-health', { cache: 'no-store' });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const json = (await res.json()) as HealthResponse;
      setData(json);
      setLastFetched(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  const filteredRows = useMemo(() => {
    if (!data) return [];
    if (filter === 'all') return data.results;
    return data.results.filter((r) => r.status === filter);
  }, [data, filter]);

  if (isAdmin !== true) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <p className="text-text-muted text-sm">Verifying admin access…</p>
      </div>
    );
  }

  const okCount = data?.summary.ok ?? 0;
  const totalLive = data?.summary.runtimeKeyCount ?? 0;

  return (
    <MotionPage className="min-h-screen pb-20" style={{ background: 'var(--bg)' }}>
      <div className="px-4 md:px-8 py-8 max-w-6xl mx-auto">
        {/* Header */}
        <FadeIn className="flex items-start justify-between mb-8 gap-4 flex-wrap">
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--accent)] font-semibold mb-2">
              Admin · Infrastructure
            </p>
            <h1
              className="text-3xl font-bold text-text leading-tight"
              style={{ fontFamily: 'var(--font-serif), Cinzel, serif', letterSpacing: '0.04em' }}
            >
              NVIDIA NIM Key Health
            </h1>
            <p className="text-sm text-text-muted mt-2 max-w-xl">
              Live probe of every configured NIM key against the active text model. Each slot is hit
              with a one-token chat completion to confirm it is reachable, authorized, and not rate
              limited.
            </p>
          </div>
          <div className="flex items-center gap-3 mt-1">
            {lastFetched && (
              <span className="text-[11px] uppercase tracking-[0.14em] text-text-muted">
                Updated {lastFetched.toLocaleTimeString('en-IN')}
              </span>
            )}
            <button
              onClick={load}
              disabled={loading}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold border border-[var(--border-gold)] text-[#11131A] disabled:opacity-50 transition-all hover:shadow-[0_0_18px_rgba(212,175,55,0.45)]"
              style={{
                background: 'linear-gradient(135deg, #F2CA50 0%, #D4AF37 100%)',
              }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={loading ? 'animate-spin' : ''}
                aria-hidden
              >
                <polyline points="23 4 23 10 17 10" />
                <polyline points="1 20 1 14 7 14" />
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
              {loading ? 'Probing…' : 'Re-probe keys'}
            </button>
          </div>
        </FadeIn>

        {error && (
          <FadeIn className="bg-red-500/10 border border-red-500/30 text-red-300 rounded-xl px-4 py-3 mb-6 text-sm">
            Failed to load: {error}
          </FadeIn>
        )}

        {data && (
          <>
            {/* Hero: Health ring + stats */}
            <FadeIn delay={0.05}>
              <div
                className="relative rounded-2xl border border-border p-5 mb-4 backdrop-blur-[8px] shadow-[0_0_24px_rgba(212,175,55,0.10)]"
                style={{ background: 'var(--card-bg, var(--surface))' }}
              >
                <div className="flex items-center gap-5 flex-wrap">
                  <HealthRing ok={okCount} total={Math.max(totalLive, 1)} />
                  <div className="flex-1 min-w-[260px]">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-text-muted mb-1">
                      Active model
                    </p>
                    <p className="font-mono text-sm text-text break-all">
                      {data.summary.primaryModel}
                    </p>
                    <p className="text-[11px] text-text-muted mt-3 leading-relaxed">
                      Runtime count excludes keys marked dead in this Vercel instance. Dead keys
                      should be rotated in the project env vars.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-5">
                  <SummaryStat label="Runtime keys" value={data.summary.runtimeKeyCount} accent="gold" />
                  <SummaryStat label="Healthy" value={data.summary.ok} accent="good" />
                  <SummaryStat label="Dead" value={data.summary.dead} accent={data.summary.dead > 0 ? 'bad' : 'neutral'} />
                  <SummaryStat label="Degraded" value={data.summary.degraded} accent={data.summary.degraded > 0 ? 'warn' : 'neutral'} />
                  <SummaryStat label="Throttled" value={data.summary.rate_limited} accent={data.summary.rate_limited > 0 ? 'warn' : 'neutral'} />
                </div>
              </div>
            </FadeIn>

            {/* Filter chips */}
            <FadeIn delay={0.08} className="flex items-center gap-2 flex-wrap mb-3">
              <span className="text-[10px] uppercase tracking-[0.18em] text-text-muted font-semibold mr-1">
                Filter
              </span>
              {(['all', 'ok', 'degraded', 'rate_limited', 'dead', 'unreachable'] as const).map((f) => {
                const isActive = filter === f;
                const count =
                  f === 'all'
                    ? data.results.length
                    : data.results.filter((r) => r.status === f).length;
                const label =
                  f === 'all' ? 'All' : STATUS_META[f].label;
                return (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`text-[11px] font-semibold uppercase tracking-[0.10em] px-3 py-1.5 rounded-full border transition-all ${
                      isActive
                        ? 'bg-[var(--primary-soft)] border-[var(--border-gold)] text-[var(--accent)] shadow-[0_0_12px_rgba(212,175,55,0.20)]'
                        : 'bg-white/[0.03] border-border text-text-muted hover:text-text hover:border-[var(--border-strong)]'
                    }`}
                  >
                    {label}
                    <span className="ml-1.5 opacity-60">{count}</span>
                  </button>
                );
              })}
            </FadeIn>

            {/* Per-slot table */}
            <FadeIn delay={0.1}>
              <div
                className="rounded-2xl border border-border overflow-hidden backdrop-blur-[8px] shadow-[0_0_18px_rgba(212,175,55,0.08)]"
                style={{ background: 'var(--card-bg, var(--surface))' }}
              >
                <div className="grid grid-cols-12 gap-3 px-4 py-3 border-b border-border text-[10px] uppercase tracking-[0.14em] font-bold text-text-muted">
                  <div className="col-span-4">Slot</div>
                  <div className="col-span-3">Status</div>
                  <div className="col-span-1 text-right">HTTP</div>
                  <div className="col-span-2 text-right">Latency</div>
                  <div className="col-span-2 text-right">Detail</div>
                </div>

                {filteredRows.length === 0 ? (
                  <div className="px-4 py-10 text-center text-text-muted text-sm">
                    No keys match this filter.
                  </div>
                ) : (
                  <StaggerList fast>
                    {filteredRows.map((r) => (
                      <StaggerItem key={r.slot}>
                        <KeyRow row={r} />
                      </StaggerItem>
                    ))}
                  </StaggerList>
                )}
              </div>
            </FadeIn>

            {/* Legend */}
            <FadeIn delay={0.14} className="mt-6 rounded-2xl border border-border p-5 backdrop-blur-[8px]" style={{ background: 'var(--surface)' }}>
              <p className="text-[10px] uppercase tracking-[0.18em] text-text-muted font-semibold mb-3">
                Status legend
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[12px] text-text-muted leading-relaxed">
                <p>
                  <strong className="text-emerald-300">Healthy</strong> — key completed a one-token chat call.
                </p>
                <p>
                  <strong className="text-red-300">Dead</strong> — 401/403 auth failure, or 404 “not found for account”. Rotate this key in Vercel env.
                </p>
                <p>
                  <strong className="text-yellow-300">Degraded</strong> — model-side outage (400 / 500 inference-connection). Affects every key; switch model via <code className="text-text bg-white/[0.04] border border-white/10 rounded px-1 py-0.5">NVIDIA_NIM_MODEL_FALLBACKS</code>.
                </p>
                <p>
                  <strong className="text-orange-300">Throttled</strong> — 429 rate limit. Transient; key is fine.
                </p>
              </div>
            </FadeIn>
          </>
        )}

        {!data && !error && loading && (
          <FadeIn className="rounded-2xl border border-border p-12 text-center backdrop-blur-[8px]" style={{ background: 'var(--surface)' }}>
            <div className="inline-flex items-center gap-2 text-text-muted text-sm">
              <span className="w-2 h-2 rounded-full bg-[var(--accent)] animate-pulse shadow-[0_0_8px_rgba(242,202,80,0.7)]" />
              Probing every configured key…
            </div>
          </FadeIn>
        )}
      </div>
    </MotionPage>
  );
}
