import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminSupabase } from '@/lib/supabase/admin';

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  const { data: booking } = await supabase
    .from('puja_bookings')
    .select('id, pandit_id, user_id, status, puja_slug')
    .eq('id', id)
    .maybeSingle();

  if (!booking || booking.pandit_id !== user.id) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }
  if (booking.status !== 'pending_pandit') {
    return NextResponse.json({ error: 'INVALID_STATE', current: booking.status }, { status: 409 });
  }

  const admin = createAdminSupabase();
  const { error: updErr } = await admin
    .from('puja_bookings')
    .update({ status: 'accepted' })
    .eq('id', id);
  if (updErr) return NextResponse.json({ error: 'UPDATE_FAILED', detail: updErr.message }, { status: 500 });

  await admin.from('booking_messages').insert({
    booking_id: id, author_role: 'pandit', body: 'Booking accepted.', status_to: 'accepted',
  });

  await admin.from('notifications').insert({
    user_id: booking.user_id,
    type:    'puja_accepted',
    title:   'Your puja booking was accepted',
    body:    'The pandit will perform your puja on the scheduled date.',
    link:    `/pandit-puja/bookings/${id}`,
    metadata: { booking_id: id },
  });

  return NextResponse.json({ success: true });
}
