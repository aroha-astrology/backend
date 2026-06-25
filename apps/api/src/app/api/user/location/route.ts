import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

// Simple in-memory reverse-geocode cache keyed by rounded (lat,lng).
// Rounds to 3 decimal places (~110 m), good enough to avoid redundant Nominatim calls.
const geoCache = new Map<string, { city: string; country: string }>();

async function reverseGeocode(lat: number, lng: number): Promise<{ city: string; country: string } | null> {
  const key = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  if (geoCache.has(key)) return geoCache.get(key)!;

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
      {
        headers: { 'User-Agent': process.env.GEOCODING_USER_AGENT ?? 'jyotish-ai/1.0' },
        next: { revalidate: 86400 }, // cache at Next.js layer for 24h
      },
    );
    if (!res.ok) return null;
    const data = await res.json();
    const city =
      data.address?.city ??
      data.address?.town ??
      data.address?.village ??
      data.address?.county ??
      '';
    const country = data.address?.country ?? '';
    const result = { city, country };
    if (geoCache.size > 500) geoCache.clear(); // prevent unbounded growth
    geoCache.set(key, result);
    return result;
  } catch {
    return null;
  }
}

export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('users')
    .select('current_latitude, current_longitude, current_city, current_country, location_source, location_updated_at')
    .eq('id', user.id)
    .maybeSingle();

  if (error) {
    console.error('[location] read failed:', error);
    return NextResponse.json({ success: false, error: 'Failed to read location' }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    data: data ?? null,
  });
}

export async function POST(req: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const { latitude, longitude, source } = body ?? {};

  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    return NextResponse.json({ success: false, error: 'latitude and longitude are required' }, { status: 400 });
  }
  if (!['device', 'manual', 'ip'].includes(source)) {
    return NextResponse.json({ success: false, error: 'invalid source' }, { status: 400 });
  }

  const geo = await reverseGeocode(latitude, longitude);

  const { error } = await supabase
    .from('users')
    .update({
      current_latitude: latitude,
      current_longitude: longitude,
      current_city: geo?.city ?? null,
      current_country: geo?.country ?? null,
      location_source: source,
      location_updated_at: new Date().toISOString(),
    })
    .eq('id', user.id);

  if (error) {
    console.error('[location] update failed:', error);
    return NextResponse.json({ success: false, error: 'Failed to update location' }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    data: { city: geo?.city ?? null, country: geo?.country ?? null, location_updated_at: new Date().toISOString() },
  });
}
