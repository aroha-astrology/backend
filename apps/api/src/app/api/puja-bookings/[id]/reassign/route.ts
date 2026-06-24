import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminSupabase } from '@/lib/supabase/admin';

const bodySchema = z.object({
  pandit_id:     z.string().uuid(),
  pandit_source: z.enum(['seed', 'self']),
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'INVALID_PAYLOAD' }, { status: 400 });

  const { data: booking } = await supabase
    .from('puja_bookings')
    .select('id, user_id, status, declined_by, puja_slug')
    .eq('id', id)
    .maybeSingle();
  if (!booking || booking.user_id !== user.id) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }
  if (booking.status !== 'reassignment_pending') {
    return NextResponse.json({ error: 'INVALID_STATE', current: booking.status }, { status: 409 });
  }
  if ((booking.declined_by ?? []).includes(parsed.data.pandit_id)) {
    return NextResponse.json({ error: 'PANDIT_ALREADY_DECLINED' }, { status: 400 });
  }

  const { data: pandit } = await supabase
    .from('pandits_public')
    .select('id, specialisations')
    .eq('id', parsed.data.pandit_id)
    .maybeSingle();
  if (!pandit) return NextResponse.json({ error: 'PANDIT_NOT_FOUND' }, { status: 404 });
  if (!(pandit.specialisations ?? []).includes(booking.puja_slug)) {
    return NextResponse.json({ error: 'PANDIT_NOT_QUALIFIED' }, { status: 400 });
  }

  const admin = createAdminSupabase();
  const { error: updErr } = await admin
    .from('puja_bookings')
    .update({
      status:        'pending_pandit',
      pandit_id:     parsed.data.pandit_id,
      pandit_source: parsed.data.pandit_source,
    })
    .eq('id', id);
  if (updErr) return NextResponse.json({ error: 'UPDATE_FAILED' }, { status: 500 });

  await admin.from('booking_messages').insert({
    booking_id: id, author_role: 'user', body: 'User selected a replacement pandit.', status_to: 'pending_pandit',
  });

  await admin.from('notifications').insert({
    user_id: parsed.data.pandit_id,
    type:    'puja_booking_received',
    title:   'New puja booking request',
    body:    'You\'ve been selected as a replacement pandit. Please accept or decline.',
    link:    `/pandit/bookings/${id}`,
    metadata: { booking_id: id, puja_slug: booking.puja_slug, reassigned: true },
  });

  return NextResponse.json({ success: true });
}
