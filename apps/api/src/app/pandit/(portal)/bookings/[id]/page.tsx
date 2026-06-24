import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase/server';
import { samagriFor } from '@/lib/puja/samagri';
import { BookingActionsClient } from '@/components/pandit/BookingActionsClient';

export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, string> = {
  pending_pandit:       'Pending your decision',
  accepted:             'Scheduled',
  reassignment_pending: 'Reassigned to another pandit',
  in_progress:          'In progress',
  video_uploaded:       'Video sent, prasad pending',
  prasad_dispatched:    'Prasad shipped',
  completed:            'Completed',
  cancelled:            'Cancelled',
};

interface Props { params: Promise<{ id: string }> }

export default async function PanditBookingDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: booking } = await supabase
    .from('puja_bookings')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (!booking) notFound();
  if (booking.pandit_id !== user.id) notFound();

  const [pujaRes, membersRes, offeringsRes, messagesRes] = await Promise.all([
    supabase.from('pujas').select('*').eq('slug', booking.puja_slug).maybeSingle(),
    supabase.from('booking_members').select('*').eq('booking_id', id).order('position'),
    supabase.from('booking_offerings').select('offering_id, dhanam_cost, puja_offerings(slug, title)').eq('booking_id', id),
    supabase.from('booking_messages').select('*').eq('booking_id', id).order('created_at'),
  ]);

  const puja = pujaRes.data;
  const members = membersRes.data ?? [];
  const offerings = offeringsRes.data ?? [];
  const messages = messagesRes.data ?? [];
  const samagri = samagriFor(booking.puja_slug);

  const isPending = booking.status === 'pending_pandit';
  const isAccepted = booking.status === 'accepted' || booking.status === 'in_progress';
  const needsVideoUpload = booking.status === 'accepted' || booking.status === 'in_progress';
  const needsPrasadDispatch = booking.status === 'video_uploaded';

  return (
    <div className="px-4 py-6 max-w-3xl mx-auto space-y-5">
      <Link href="/pandit/bookings" className="text-text-muted text-sm no-underline">← All bookings</Link>

      <header>
        <h1 className="j-display text-2xl text-text font-bold">
          {puja?.name_en ?? booking.puja_slug}
        </h1>
        <p className="text-sm text-text-muted">
          {puja?.name_sanskrit ?? ''} · For {booking.member_count} member{booking.member_count > 1 ? 's' : ''} · {booking.total_dhanam} Dhanam
        </p>
        <span className="inline-block mt-2 text-[11px] uppercase tracking-wide px-2 py-1 rounded bg-accent/15 text-accent">
          {STATUS_LABEL[booking.status] ?? booking.status}
        </span>
      </header>

      {/* HIGHLIGHTED SANKALP CARD */}
      <section className="rounded-xl p-5 border-2 border-accent/50 bg-accent/5">
        <div className="text-xs uppercase tracking-wider text-accent mb-2 font-bold">★ User Sankalp Details</div>
        <div className="space-y-2">
          {members.map(m => (
            <div key={m.id} className="flex items-baseline justify-between gap-3">
              <div className="text-sm">
                <span className="text-text font-semibold">{m.name}</span>
                <span className="text-text-muted text-xs ml-2">Position {m.position}</span>
              </div>
              <div className="text-sm">
                <span className="text-text-muted text-xs">Gotra:</span>{' '}
                <span className="text-text font-medium">{m.gotra}</span>
              </div>
            </div>
          ))}
        </div>
        {booking.scheduled_at && (
          <div className="mt-3 pt-3 border-t border-accent/20 text-sm">
            <span className="text-text-muted">Scheduled:</span>{' '}
            <span className="text-text font-medium">
              {new Date(booking.scheduled_at).toLocaleString('en-IN', { dateStyle: 'long', timeStyle: 'short' })}
            </span>
          </div>
        )}
      </section>

      {/* Samagri checklist */}
      <section className="j-card p-5">
        <h2 className="text-sm font-bold text-text mb-3">Samagri Checklist</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {samagri.map((item, i) => (
            <label key={i} className="flex items-center gap-2 text-sm text-text-2">
              <input type="checkbox" className="rounded border-border" />
              <span>{item}</span>
            </label>
          ))}
        </div>
      </section>

      {/* Offerings selected */}
      {offerings.length > 0 && (
        <section className="j-card p-5">
          <h2 className="text-sm font-bold text-text mb-2">Offerings Selected</h2>
          <ul className="text-sm text-text-2 space-y-1">
            {offerings.map((o: { offering_id: string; dhanam_cost: number; puja_offerings: { title: string }[] | { title: string } | null }) => {
              const linked = Array.isArray(o.puja_offerings) ? o.puja_offerings[0] : o.puja_offerings;
              return (
                <li key={o.offering_id} className="flex justify-between">
                  <span>· {linked?.title ?? 'Offering'}</span>
                  <span className="text-text-muted">{o.dhanam_cost} Dhanam</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Actions */}
      <BookingActionsClient
        bookingId={booking.id}
        isPending={isPending}
        isAccepted={isAccepted}
        needsVideoUpload={needsVideoUpload}
        needsPrasadDispatch={needsPrasadDispatch}
        existingVideoUrl={booking.video_url}
      />

      {/* Conversation log */}
      {messages.length > 0 && (
        <section>
          <h2 className="text-sm font-bold text-text mb-2">Conversation</h2>
          <div className="space-y-2">
            {messages.map(m => (
              <div key={m.id} className="j-card p-3 text-sm">
                <div className="text-[11px] uppercase tracking-wide text-text-muted mb-1">
                  {m.author_role} · {new Date(m.created_at).toLocaleString('en-IN')}
                </div>
                <div className="text-text-2">{m.body}</div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
