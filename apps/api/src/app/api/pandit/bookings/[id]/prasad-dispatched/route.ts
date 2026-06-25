import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminSupabase } from '@/lib/supabase/admin';

const bodySchema = z.object({ tracking: z.string().trim().max(120).optional() });

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  const tracking = parsed.success ? parsed.data.tracking ?? null : null;

  const { data: booking } = await supabase
    .from('puja_bookings')
    .select('id, pandit_id, user_id, status')
    .eq('id', id)
    .maybeSingle();

  if (!booking || booking.pandit_id !== user.id) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }
  if (booking.status !== 'video_uploaded') {
    return NextResponse.json({ error: 'INVALID_STATE', current: booking.status }, { status: 409 });
  }

  const admin = createAdminSupabase();
  const { error: updErr } = await admin
    .from('puja_bookings')
    .update({ status: 'prasad_dispatched', prasad_tracking: tracking })
    .eq('id', id);
  if (updErr) return NextResponse.json({ error: 'UPDATE_FAILED', detail: updErr.message }, { status: 500 });

  await admin.from('booking_messages').insert({
    booking_id: id, author_role: 'pandit',
    body: tracking ? `Prasad dispatched. Tracking: ${tracking}` : 'Prasad dispatched.',
    status_to: 'prasad_dispatched',
  });

  await admin.from('notifications').insert({
    user_id: booking.user_id,
    type:    'puja_prasad_dispatched',
    title:   'Your prasad is on the way',
    body:    tracking ? `Tracking: ${tracking}` : 'The prasad box has been handed to the courier.',
    link:    `/pandit-puja/bookings/${id}`,
    metadata: { booking_id: id, tracking },
  });

  return NextResponse.json({ success: true });
}
