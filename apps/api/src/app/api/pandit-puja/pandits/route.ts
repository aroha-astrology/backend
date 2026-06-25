import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

// Returns pandits — combines the seeded directory (032_pandit_puja.sql) with
// self-onboarded pandits via the `pandits_public` view (046_puja_booking.sql).
//
// Filters:
//   - city (required) — slug match (e.g. 'delhi')
//   - puja_slug (optional) — must appear in pandit.specialisations
//   - exclude (optional, comma-separated) — pandit ids to skip (used by the
//     user-facing reassignment flow to hide pandits who already declined)
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const city = searchParams.get('city')?.toLowerCase().trim();
  const pujaSlug = searchParams.get('puja_slug')?.trim();
  const excludeRaw = searchParams.get('exclude')?.trim();
  const exclude = excludeRaw ? excludeRaw.split(',').map(s => s.trim()).filter(Boolean) : [];

  if (!city) return NextResponse.json({ error: 'city is required' }, { status: 400 });

  const supabase = await createServerSupabase();
  let query = supabase
    .from('pandits_public')
    .select('*')
    .eq('city', city)
    .order('rating', { ascending: false });

  if (pujaSlug) query = query.contains('specialisations', [pujaSlug]);
  if (exclude.length > 0) query = query.not('id', 'in', `(${exclude.join(',')})`);

  const { data, error } = await query.limit(20);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ pandits: data ?? [] });
}
