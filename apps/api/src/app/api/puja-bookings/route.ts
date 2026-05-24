import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { deductCredits, refundCredits } from '@/lib/credits/deductCredits';
import { computeBookingDhanam } from '@/lib/puja/pricing';

const bodySchema = z.object({
  puja_slug:     z.string().min(1),
  pandit_id:     z.string().uuid(),
  pandit_source: z.enum(['seed', 'self']),
  members:       z.array(z.object({
    name:  z.string().trim().min(1).max(120),
    gotra: z.string().trim().min(1).max(60),
  })).min(1).max(6),
  offering_ids:  z.array(z.string().uuid()).max(20).default([]),
  ship_address:  z.string().trim().max(500).optional(),
  ship_pincode:  z.string().trim().regex(/^\d{6}$/).optional(),
  scheduled_at:  z.string().datetime().optional(),
});

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'INVALID_PAYLOAD', details: parsed.error.flatten() }, { status: 400 });
  }
  const p = parsed.data;

  // 1. Lookup puja base price
  const { data: puja } = await supabase
    .from('pujas')
    .select('slug, suggested_dhanam')
    .eq('slug', p.puja_slug)
    .maybeSingle();
  if (!puja) return NextResponse.json({ error: 'PUJA_NOT_FOUND' }, { status: 404 });

  // 2. Lookup offerings (server-trusted dhanam_cost)
  let offeringRows: { id: string; dhanam_cost: number }[] = [];
  if (p.offering_ids.length > 0) {
    const { data: rows, error: offErr } = await supabase
      .from('puja_offerings')
      .select('id, dhanam_cost')
      .in('id', p.offering_ids)
      .eq('active', true);
    if (offErr) return NextResponse.json({ error: 'OFFERINGS_LOOKUP_FAILED' }, { status: 500 });
    offeringRows = rows ?? [];
  }

  // 3. Verify pandit exists (in either pandits or pandit_profiles via view)
  const { data: pandit } = await supabase
    .from('pandits_public')
    .select('id, city, source, specialisations')
    .eq('id', p.pandit_id)
    .maybeSingle();
  if (!pandit) return NextResponse.json({ error: 'PANDIT_NOT_FOUND' }, { status: 404 });
  if (!(pandit.specialisations ?? []).includes(p.puja_slug)) {
    return NextResponse.json({ error: 'PANDIT_NOT_QUALIFIED' }, { status: 400 });
  }

  // 4. Compute total
  const pricing = computeBookingDhanam(puja.suggested_dhanam ?? 1000, p.members.length, offeringRows);

  // 5. Deduct credits atomically
  const debit = await deductCredits(supabase, user.id, pricing.total, 'feature_debit', `Puja: ${p.puja_slug}`);
  if (!debit.success) {
    return NextResponse.json({ error: debit.error ?? 'DEBIT_FAILED' }, { status: 402 });
  }

  // 6. Insert booking + children using admin client to bypass RLS for the joined inserts.
  //    On any failure, refund the deducted credits.
  const admin = createAdminSupabase();
  try {
    const { data: created, error: bookingErr } = await admin.from('puja_bookings').insert({
      user_id:          user.id,
      puja_slug:        p.puja_slug,
      pandit_id:        p.pandit_id,
      pandit_source:    p.pandit_source,
      scheduled_at:     p.scheduled_at ?? null,
      member_count:     p.members.length,
      base_dhanam:      pricing.base,
      member_dhanam:    pricing.member_dhanam,
      offerings_dhanam: pricing.offerings_dhanam,
      ship_address:     p.ship_address ?? null,
      ship_pincode:     p.ship_pincode ?? null,
    }).select('id').single();
    if (bookingErr || !created) throw new Error(bookingErr?.message ?? 'Booking insert failed');
    const bookingId = created.id;

    const { error: mErr } = await admin.from('booking_members').insert(
      p.members.map((m, i) => ({
        booking_id: bookingId,
        name:       m.name,
        gotra:      m.gotra,
        position:   i + 1,
      })),
    );
    if (mErr) throw new Error('Members insert failed: ' + mErr.message);

    if (offeringRows.length > 0) {
      const { error: oErr } = await admin.from('booking_offerings').insert(
        offeringRows.map(o => ({
          booking_id:  bookingId,
          offering_id: o.id,
          dhanam_cost: o.dhanam_cost,
        })),
      );
      if (oErr) throw new Error('Offerings insert failed: ' + oErr.message);
    }

    await admin.from('booking_messages').insert({
      booking_id: bookingId, author_role: 'system', body: 'Booking created.', status_to: 'pending_pandit',
    });

    await admin.from('notifications').insert({
      user_id: p.pandit_id,
      type:    'puja_booking_received',
      title:   'New puja booking request',
      body:    `${p.members[0].name} (Gotra: ${p.members[0].gotra}) — please accept or decline.`,
      link:    `/pandit/bookings/${bookingId}`,
      metadata: { booking_id: bookingId, puja_slug: p.puja_slug },
    });

    return NextResponse.json({ success: true, booking_id: bookingId });
  } catch (e) {
    // Refund best-effort
    await refundCredits(supabase, user.id, pricing.total, `Refund: failed puja booking ${p.puja_slug}`);
    return NextResponse.json({ error: 'BOOKING_FAILED', detail: (e as Error).message }, { status: 500 });
  }
}

export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  const { data, error } = await supabase
    .from('puja_bookings')
    .select('id, puja_slug, status, total_dhanam, member_count, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ bookings: data ?? [] });
}
