import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, string> = {
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
const STATUS_TONE: Record<string, string> = {
  pending_pandit:       'bg-accent/15 text-accent',
  accepted:             'bg-emerald-500/15 text-emerald-400',
  reassignment_pending: 'bg-orange-500/15 text-orange-400',
  in_progress:          'bg-blue-500/15 text-blue-400',
  video_uploaded:       'bg-purple-500/15 text-purple-400',
  prasad_dispatched:    'bg-teal-500/15 text-teal-400',
  completed:            'bg-text-muted/15 text-text-muted',
};

export default async function MyBookingsPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: bookings } = await supabase
    .from('puja_bookings')
    .select('id, puja_slug, status, total_dhanam, member_count, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  const { data: pujas } = await supabase.from('pujas').select('slug, name_en');
  const nameMap = new Map((pujas ?? []).map(p => [p.slug, p.name_en]));

  return (
    <div className="min-h-screen bg-bg pb-24 px-4 py-6 max-w-3xl mx-auto">
      <Link href="/pandit-puja" className="text-text-muted text-sm no-underline">← All pujas</Link>
      <h1 className="j-display text-2xl text-text font-bold mt-3 mb-4">My Puja Bookings</h1>
      {!bookings || bookings.length === 0 ? (
        <div className="j-card p-8 text-center text-text-muted text-sm">
          You haven&apos;t booked any pujas yet. Browse the catalogue to get started.
        </div>
      ) : (
        <div className="space-y-2">
          {bookings.map(b => (
            <Link key={b.id} href={`/pandit-puja/bookings/${b.id}`} className="j-card p-4 block no-underline hover:border-accent/40">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-text truncate">{nameMap.get(b.puja_slug) ?? b.puja_slug}</div>
                  <div className="text-xs text-text-muted mt-0.5">
                    #{b.id.slice(0, 8)} · {b.member_count} member{b.member_count > 1 ? 's' : ''} · {b.total_dhanam} Dhanam · {new Date(b.created_at).toLocaleDateString('en-IN')}
                  </div>
                </div>
                <span className={`text-[10px] uppercase tracking-wide px-2 py-1 rounded ${STATUS_TONE[b.status] ?? 'bg-card text-text-muted'}`}>
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
