import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

interface BookingRow {
  id: string;
  puja_slug: string;
  status: string;
  scheduled_at: string | null;
  member_count: number;
  total_dhanam: number;
  created_at: string;
  user_id: string;
}

const STATUS_LABEL: Record<string, string> = {
  pending_pandit:         'New request',
  accepted:               'Scheduled',
  reassignment_pending:   'Reassigned',
  in_progress:            'In progress',
  video_uploaded:         'Video sent',
  prasad_dispatched:      'Prasad shipped',
  completed:              'Completed',
  cancelled:              'Cancelled',
  refunded:               'Refunded',
};

const STATUS_TONE: Record<string, string> = {
  pending_pandit:    'bg-accent/15 text-accent',
  accepted:          'bg-emerald-500/15 text-emerald-400',
  in_progress:       'bg-blue-500/15 text-blue-400',
  video_uploaded:    'bg-purple-500/15 text-purple-400',
  prasad_dispatched: 'bg-teal-500/15 text-teal-400',
  completed:         'bg-text-muted/15 text-text-muted',
  cancelled:         'bg-red-500/15 text-red-400',
};

export default async function PanditDashboardPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [profileRes, bookingsRes, pujasRes] = await Promise.all([
    supabase.from('pandit_profiles').select('*').eq('user_id', user.id).maybeSingle(),
    supabase.from('puja_bookings')
      .select('id, puja_slug, status, scheduled_at, member_count, total_dhanam, created_at, user_id')
      .eq('pandit_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20),
    supabase.from('pujas').select('slug, name_en, name_sanskrit'),
  ]);

  const profile = profileRes.data;
  const bookings: BookingRow[] = (bookingsRes.data ?? []) as BookingRow[];
  const pujaMap = new Map((pujasRes.data ?? []).map(p => [p.slug, p as { slug: string; name_en: string; name_sanskrit: string }]));

  const pending = bookings.filter(b => b.status === 'pending_pandit');
  const upcoming = bookings.filter(b => ['accepted', 'in_progress'].includes(b.status));
  const completed = bookings.filter(b => ['completed', 'video_uploaded', 'prasad_dispatched'].includes(b.status));

  const ratingDisplay = profile?.rating ?? '—';
  const ritualsCompleted = profile?.rituals_completed ?? completed.length;
  const pendingPrasad = bookings.filter(b => b.status === 'video_uploaded').length;

  return (
    <div className="px-4 py-6 space-y-6">
      <div>
        <h1 className="j-display text-2xl text-text font-bold">Namaste, {profile?.display_name ?? 'Pandit Ji'}</h1>
        <p className="text-sm text-text-muted">{profile?.city_label}{profile?.temple_name ? ` · ${profile.temple_name}` : ''}</p>
      </div>

      {/* Performance row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Pujas Completed"        value={String(ritualsCompleted)} tone="emerald" />
        <StatCard label="Average Rating"         value={String(ratingDisplay)}     tone="amber"  />
        <StatCard label="Pending Prasad Dispatch" value={String(pendingPrasad)}    tone="teal"   />
        <StatCard label="New Requests"            value={String(pending.length)}    tone="accent" />
      </div>

      {/* Pending requests */}
      {pending.length > 0 && (
        <section>
          <h2 className="text-sm font-bold text-accent mb-2">New Booking Requests</h2>
          <div className="space-y-2">
            {pending.map(b => (
              <BookingRowCard key={b.id} b={b} puja={pujaMap.get(b.puja_slug)} />
            ))}
          </div>
        </section>
      )}

      {/* Upcoming rituals */}
      <section>
        <h2 className="text-sm font-bold text-text mb-2">Upcoming Rituals</h2>
        {upcoming.length === 0 ? (
          <div className="j-card p-5 text-center text-text-muted text-sm">No scheduled rituals.</div>
        ) : (
          <div className="space-y-2">
            {upcoming.map(b => (
              <BookingRowCard key={b.id} b={b} puja={pujaMap.get(b.puja_slug)} />
            ))}
          </div>
        )}
      </section>

      {/* Recent completed */}
      {completed.length > 0 && (
        <section>
          <h2 className="text-sm font-bold text-text mb-2">Completed History</h2>
          <div className="space-y-2">
            {completed.slice(0, 5).map(b => (
              <BookingRowCard key={b.id} b={b} puja={pujaMap.get(b.puja_slug)} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: string; tone: 'emerald'|'amber'|'teal'|'accent' }) {
  const cls = {
    emerald: 'border-emerald-500/30 bg-emerald-500/5',
    amber:   'border-accent/30 bg-accent/5',
    teal:    'border-teal-500/30 bg-teal-500/5',
    accent:  'border-primary/30 bg-primary/5',
  }[tone];
  return (
    <div className={`j-card p-4 border ${cls}`}>
      <div className="text-2xl font-extrabold text-text">{value}</div>
      <div className="text-xs text-text-muted mt-0.5">{label}</div>
    </div>
  );
}

function BookingRowCard({ b, puja }: { b: BookingRow; puja?: { name_en: string; name_sanskrit: string } }) {
  return (
    <Link
      href={`/pandit/bookings/${b.id}`}
      className="j-card p-4 block no-underline hover:border-accent/40 transition-colors"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-text truncate">
            {puja?.name_en ?? b.puja_slug}
          </div>
          <div className="text-xs text-text-muted mt-0.5">
            Booking #{b.id.slice(0, 8)} · {b.member_count} member{b.member_count > 1 ? 's' : ''} · {b.total_dhanam} Dhanam
          </div>
        </div>
        <span className={`text-[10px] uppercase tracking-wide px-2 py-1 rounded ${STATUS_TONE[b.status] ?? 'bg-card text-text-muted'}`}>
          {STATUS_LABEL[b.status] ?? b.status}
        </span>
      </div>
    </Link>
  );
}
