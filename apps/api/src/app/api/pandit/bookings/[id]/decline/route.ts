import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminSupabase } from '@/lib/supabase/admin';

const bodySchema = z.object({ message: z.string().trim().min(5).max(500) });

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'INVALID_PAYLOAD' }, { status: 400 });

  const { data: booking } = await supabase
    .from('puja_bookings')
    .select('id, pandit_id, user_id, status, declined_by')
    .eq('id', id)
    .maybeSingle();

  if (!booking || booking.pandit_id !== user.id) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }
  if (!['pending_pandit', 'accepted'].includes(booking.status)) {
    return NextResponse.json({ error: 'INVALID_STATE', current: booking.status }, { status: 409 });
  }

  const declined = Array.from(new Set([...(booking.declined_by ?? []), user.id]));
  const admin = createAdminSupabase();
  const { error: updErr } = await admin
    .from('puja_bookings')
    .update({ status: 'reassignment_pending', declined_by: declined })
    .eq('id', id);
  if (updErr) return NextResponse.json({ error: 'UPDATE_FAILED', detail: updErr.message }, { status: 500 });

  await admin.from('booking_messages').insert({
    booking_id: id, author_role: 'pandit', body: parsed.data.message, status_to: 'reassignment_pending',
  });

  await admin.from('notifications').insert({
    user_id: booking.user_id,
    type:    'puja_declined',
    title:   'Pandit declined your booking',
    body:    parsed.data.message,
    link:    `/pandit-puja/bookings/${id}`,
    metadata: { booking_id: id, declined_by: user.id },
  });

  return NextResponse.json({ success: true });
}
