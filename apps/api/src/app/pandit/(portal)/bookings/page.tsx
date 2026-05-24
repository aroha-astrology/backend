import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

interface BookingRow {
  id: string;
  puja_slug: string;
  status: string;
  member_count: number;
  total_dhanam: number;
  created_at: string;
}

const STATUS_LABEL: Record<string, string> = {
  pending_pandit:       'New',
  accepted:             'Accepted',
  reassignment_pending: 'Reassigned',
  in_progress:          'In progress',
  video_uploaded:       'Video sent',
  prasad_dispatched:    'Prasad shipped',
  completed:            'Completed',
  cancelled:            'Cancelled',
};

export default async function PanditBookingsPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: bookings } = await supabase
    .from('puja_bookings')
    .select('id, puja_slug, status, member_count, total_dhanam, created_at')
    .eq('pandit_id', user.id)
    .order('created_at', { ascending: false });

  const { data: pujas } = await supabase.from('pujas').select('slug, name_en');
  const nameMap = new Map((pujas ?? []).map(p => [p.slug, p.name_en]));
  const rows = (bookings ?? []) as BookingRow[];

  return (
    <div className="px-4 py-6">
      <h1 className="j-display text-2xl text-text font-bold mb-4">My Bookings</h1>
      {rows.length === 0 ? (
        <div className="j-card p-8 text-center text-text-muted text-sm">
          No bookings yet. Once users book pujas you specialise in, they&apos;ll show up here.
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map(b => (
            <Link key={b.id} href={`/pandit/bookings/${b.id}`} className="j-card p-4 block no-underline hover:border-accent/40">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-text truncate">
                    {nameMap.get(b.puja_slug) ?? b.puja_slug}
                  </div>
                  <div className="text-xs text-text-muted mt-0.5">
                    #{b.id.slice(0, 8)} · {b.member_count} member{b.member_count > 1 ? 's' : ''} · {b.total_dhanam} Dhanam · {new Date(b.created_at).toLocaleDateString('en-IN')}
                  </div>
                </div>
                <span className="text-[10px] uppercase tracking-wide px-2 py-1 rounded bg-card text-text-muted">
                  {STATUS_LABEL[b.status] ?? b.status}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
