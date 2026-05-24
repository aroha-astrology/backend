import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { refundCredits } from '@/lib/credits/deductCredits';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  const { data: booking } = await supabase
    .from('puja_bookings')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (!booking || (booking.user_id !== user.id && booking.pandit_id !== user.id)) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }
  return NextResponse.json({ booking });
}

// Cancellation by user — only allowed while still pending pandit acceptance.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  if (body.action !== 'cancel') return NextResponse.json({ error: 'UNKNOWN_ACTION' }, { status: 400 });

  const { data: booking } = await supabase
    .from('puja_bookings')
    .select('id, user_id, status, total_dhanam')
    .eq('id', id)
    .maybeSingle();
  if (!booking || booking.user_id !== user.id) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }
  if (!['pending_pandit', 'reassignment_pending'].includes(booking.status)) {
    return NextResponse.json({ error: 'CANNOT_CANCEL', current: booking.status }, { status: 409 });
  }

  const admin = createAdminSupabase();
  const { error } = await admin.from('puja_bookings').update({ status: 'refunded' }).eq('id', id);
  if (error) return NextResponse.json({ error: 'UPDATE_FAILED' }, { status: 500 });

  await refundCredits(supabase, user.id, booking.total_dhanam, `Refund: cancelled puja booking ${id}`);
  await admin.from('booking_messages').insert({
    booking_id: id, author_role: 'user', body: 'Booking cancelled by user.', status_to: 'refunded',
  });
  return NextResponse.json({ success: true });
}
