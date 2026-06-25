import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase/server';
import { ReassignClient } from './ReassignClient';

export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, string> = {
  pending_pandit:       'Awaiting pandit acceptance',
  accepted:             'Confirmed by pandit',
  reassignment_pending: 'Pandit declined — pick another',
  in_progress:          'Puja in progress',
  video_uploaded:       'Video ready · prasad packing',
  prasad_dispatched:    'Prasad on the way',
  completed:            'Completed',
  cancelled:            'Cancelled',
  refunded:             'Refunded',
};

interface Props { params: Promise<{ id: string }> }

export default async function UserBookingDetailPage({ params }: Props) {
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
  if (booking.user_id !== user.id) notFound();

  const [pujaRes, membersRes, offeringsRes, messagesRes] = await Promise.all([
    supabase.from('pujas').select('slug, name_en, name_sanskrit, deity, image_path').eq('slug', booking.puja_slug).maybeSingle(),
    supabase.from('booking_members').select('*').eq('booking_id', id).order('position'),
    supabase.from('booking_offerings').select('offering_id, dhanam_cost, puja_offerings(slug, title)').eq('booking_id', id),
    supabase.from('booking_messages').select('*').eq('booking_id', id).order('created_at'),
  ]);

  const puja = pujaRes.data;
  const members = membersRes.data ?? [];
  const offerings = offeringsRes.data ?? [];
  const messages = messagesRes.data ?? [];

  // Pandit name
  const { data: panditRow } = await supabase
    .from('pandits_public')
    .select('id, name, photo_url, rating, languages, years_experience, city')
    .eq('id', booking.pandit_id)
    .maybeSingle();

  return (
    <div className="min-h-screen bg-bg pb-24 px-4 py-6 max-w-3xl mx-auto space-y-5">
      <Link href="/pandit-puja/my-bookings" className="text-text-muted text-sm no-underline">← All bookings</Link>

      <header>
        <div className="text-xs uppercase tracking-wider text-accent mb-1">Booking #{booking.id.slice(0, 8)}</div>
        <h1 className="j-display text-2xl text-text font-bold">{puja?.name_en ?? booking.puja_slug}</h1>
        <p className="text-sm text-text-muted">{puja?.name_sanskrit}</p>
        <span className="inline-block mt-2 text-[11px] uppercase tracking-wide px-2 py-1 rounded bg-accent/15 text-accent">
          {STATUS_LABEL[booking.status] ?? booking.status}
        </span>
      </header>

      {/* Reassignment UI */}
      {booking.status === 'reassignment_pending' && (
        <ReassignClient
          bookingId={booking.id}
          pujaSlug={booking.puja_slug}
          defaultCity={panditRow?.city ?? 'delhi'}
          excludeIds={booking.declined_by ?? []}
          declineMessage={messages.filter(m => m.status_to === 'reassignment_pending').slice(-1)[0]?.body ?? null}
        />
      )}

      {/* Sankalp summary */}
      <section className="j-card p-5">
        <h2 className="text-sm font-bold text-text mb-2">Your Sankalp</h2>
        <div className="space-y-2">
          {members.map(m => (
            <div key={m.id} className="flex justify-between text-sm">
              <span className="text-text">{m.name}</span>
              <span className="text-text-muted">{m.gotra}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Pandit info */}
      {panditRow && booking.status !== 'reassignment_pending' && (
        <section className="j-card p-5">
          <h2 className="text-sm font-bold text-text mb-2">Your Pandit</h2>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-card overflow-hidden flex items-center justify-center">
              {panditRow.photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={panditRow.photo_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-xl">🧘</span>
              )}
            </div>
            <div>
              <div className="text-sm font-semibold text-text">{panditRow.name}</div>
              <div className="text-xs text-text-muted">
                {panditRow.years_experience ? `${panditRow.years_experience} yrs` : ''} · {(panditRow.languages ?? []).slice(0, 2).join(', ')}
                {panditRow.rating ? ` · ★ ${panditRow.rating.toFixed(1)}` : ''}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Video player */}
      {booking.video_url && (
        <section className="j-card p-5">
          <h2 className="text-sm font-bold text-text mb-2">Your Puja Video</h2>
          <video src={booking.video_url} controls className="w-full rounded-lg" />
        </section>
      )}

      {/* Offerings */}
      {offerings.length > 0 && (
        <section className="j-card p-5">
          <h2 className="text-sm font-bold text-text mb-2">Offerings</h2>
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

      {/* Pricing summary */}
      <section className="j-card p-5">
        <h2 className="text-sm font-bold text-text mb-2">Payment</h2>
        <div className="text-sm space-y-1">
          <div className="flex justify-between"><span className="text-text-muted">Base</span><span>{booking.base_dhanam} Dhanam</span></div>
          {booking.member_dhanam > 0 && (
            <div className="flex justify-between"><span className="text-text-muted">Extra members</span><span>+{booking.member_dhanam} Dhanam</span></div>
          )}
          {booking.offerings_dhanam > 0 && (
            <div className="flex justify-between"><span className="text-text-muted">Offerings</span><span>+{booking.offerings_dhanam} Dhanam</span></div>
          )}
          <div className="border-t border-border pt-1 mt-1 flex justify-between font-bold">
            <span>Total paid</span>
            <span className="text-accent">{booking.total_dhanam} Dhanam</span>
          </div>
        </div>
      </section>

      {/* Conversation */}
      {messages.length > 0 && (
        <section>
          <h2 className="text-sm font-bold text-text mb-2 px-1">Updates</h2>
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
