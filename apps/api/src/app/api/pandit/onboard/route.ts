import { after, NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { ensureRole } from '@/lib/roles/ensureRole';
import { notifyPanditSignup, notifyAstrologerSignup } from '@/lib/telegram';

const payloadSchema = z.object({
  display_name:     z.string().trim().min(2).max(120),
  photo_url:        z.string().url().optional().nullable(),
  city:             z.string().trim().min(2),
  city_label:       z.string().trim().min(2),
  temple_name:      z.string().trim().max(200).optional().nullable(),
  address:          z.string().trim().max(500).optional().nullable(),
  pincode:          z.string().trim().regex(/^\d{6}$/).optional().nullable(),
  languages:        z.array(z.string().trim().min(1)).min(1),
  specialisations:  z.array(z.string().trim().min(1)).min(3).max(20),
  years_experience: z.number().int().min(0).max(80),
  // Optional: the pandit also wants to offer 1:1 astrology consultations.
  // Sets astro_status='pending' too — admin still has to approve the astrologer slice.
  also_astrologer:  z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
  }
  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'INVALID_PAYLOAD', details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const p = parsed.data;

  // Admin client for the mutations — bypasses RLS to mutate users.roles[]
  // and insert pandit_profiles without races.
  const admin = createAdminSupabase();

  // 1. Append 'pandit' to roles[] (preserves any existing astrologer / personal entries).
  try {
    await ensureRole(admin, user.id, 'pandit');
  } catch (e) {
    return NextResponse.json({ error: 'USER_UPDATE_FAILED', detail: (e as Error).message }, { status: 500 });
  }

  // 1a. If the user opted in, also start the astrologer approval flow.
  if (p.also_astrologer) {
    try {
      await ensureRole(admin, user.id, 'astrologer');
      await admin
        .from('users')
        .update({ astro_status: 'pending' })
        .eq('id', user.id);
    } catch (e) {
      console.warn('[pandit onboard] also_astrologer side-effect failed', (e as Error).message);
      // Non-fatal — pandit registration already succeeded.
    }
  }

  // 2. Insert or update pandit_profiles
  const { error: upsertErr } = await admin
    .from('pandit_profiles')
    .upsert({
      user_id:          user.id,
      display_name:     p.display_name,
      photo_url:        p.photo_url ?? null,
      city:             p.city,
      city_label:       p.city_label,
      temple_name:      p.temple_name ?? null,
      address:          p.address ?? null,
      pincode:          p.pincode ?? null,
      languages:        p.languages,
      specialisations:  p.specialisations,
      years_experience: p.years_experience,
      verified:         true,
      active:           true,
    });
  if (upsertErr) {
    return NextResponse.json({ error: 'PROFILE_UPSERT_FAILED', detail: upsertErr.message }, { status: 500 });
  }

  const contact = user.email ?? user.phone ?? user.id;
  after(async () => {
    try {
      await notifyPanditSignup(p.display_name, p.city_label, contact);
      if (p.also_astrologer) {
        await notifyAstrologerSignup(p.display_name, contact);
      }
    } catch (err) {
      console.warn('[pandit onboard] telegram notify failed', err);
    }
  });

  return NextResponse.json({ success: true });
}
