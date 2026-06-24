import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import type { ApiResponse } from '@aroha-astrology/shared';
import { cacheGet, cacheSet } from '@/lib/redis';

export const runtime = 'nodejs';

const PANCHANG_TTL = 86400;

const VARA_NAMES = [
  'Ravivaar (Sunday)',
  'Somvaar (Monday)',
  'Mangalvaar (Tuesday)',
  'Budhvaar (Wednesday)',
  'Guruvaar (Thursday)',
  'Shukravaar (Friday)',
  'Shanivaar (Saturday)',
];

interface MonthDay {
  date: string;
  day: number;
  weekday: number;
  tithi: string;
  tithiName: string;
  tithiNumber: number;
  paksha: 'Shukla' | 'Krishna' | null;
  nakshatra: string;
  nakshatraName: string;
  vara: string;
  isFullMoon: boolean;
  isNewMoon: boolean;
  isEkadashi: boolean;
}

function parseTithiString(s: string | null | undefined): {
  paksha: 'Shukla' | 'Krishna' | null;
  name: string;
  number: number;
} {
  if (!s) return { paksha: null, name: '', number: 0 };
  // Format: "Shukla Purnima (15)" or "Krishna Amavasya (30)"
  const match = s.match(/^(Shukla|Krishna)\s+(.+?)\s+\((\d+)\)$/);
  if (!match) return { paksha: null, name: s, number: 0 };
  return {
    paksha: match[1] as 'Shukla' | 'Krishna',
    name: match[2],
    number: parseInt(match[3], 10),
  };
}

function parseNakshatraString(s: string | null | undefined): string {
  if (!s) return '';
  // Format: "Moola Pada 3 (Ketu)" — keep just the nakshatra name
  return s.split(' Pada')[0] ?? s;
}

function summarizeDay(date: Date, raw: { tithi?: string; nakshatra?: string; vara?: string }): MonthDay {
  const dateKey = date.toISOString().split('T')[0];
  const t = parseTithiString(raw.tithi);
  return {
    date: dateKey,
    day: date.getDate(),
    weekday: date.getDay(),
    tithi: raw.tithi ?? '',
    tithiName: t.name,
    tithiNumber: t.number,
    paksha: t.paksha,
    nakshatra: raw.nakshatra ?? '',
    nakshatraName: parseNakshatraString(raw.nakshatra),
    vara: raw.vara ?? VARA_NAMES[date.getDay()],
    isFullMoon: t.name === 'Purnima',
    isNewMoon: t.name === 'Amavasya',
    isEkadashi: t.name === 'Ekadashi',
  };
}

// Compute a single day's panchang summary using Swiss Ephemeris.
// Mirrors the logic in /api/panchang/today but stores only the fields needed
// for the calendar grid (no choghadiya/hora).
async function computeDay(
  date: Date,
  lat: number,
  lng: number,
): Promise<{ tithi: string; nakshatra: string; vara: string }> {
  const { calculateChart, calculateFullPanchang } = await import('@aroha-astrology/astro-engine');
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const dayOfWeek = date.getDay();

  const chart = await calculateChart(year, month, day, 6, 0, 5.5, lat, lng, 'lahiri', 'W');
  const sun = chart.planets.find((p: { planet: string }) => p.planet === 'Sun');
  const moon = chart.planets.find((p: { planet: string }) => p.planet === 'Moon');
  if (!sun || !moon) throw new Error('Sun/Moon positions unavailable');

  const panchang = calculateFullPanchang(date, lat, lng, sun.longitude, moon.longitude);
  return {
    tithi: `${panchang.tithi.paksha} ${panchang.tithi.name} (${panchang.tithi.number})`,
    nakshatra: `${panchang.nakshatra.name} Pada ${panchang.nakshatra.pada} (${panchang.nakshatra.lord})`,
    vara: VARA_NAMES[dayOfWeek],
  };
}

// ============================================================
// GET /api/panchang/month?year=YYYY&month=MM
// ============================================================
// Returns one summary entry per day of the requested month. Each entry uses
// the existing panchang_cache when available and otherwise computes on demand.
// Uncached days are written back to panchang_cache so subsequent users hit
// the cache. Response is intentionally light (no hora/choghadiya).
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json<ApiResponse>({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const now = new Date();
    const year = parseInt(searchParams.get('year') ?? String(now.getFullYear()), 10);
    const month = parseInt(searchParams.get('month') ?? String(now.getMonth() + 1), 10); // 1-12
    const lat = parseFloat(searchParams.get('lat') ?? '20.5937');
    const lng = parseFloat(searchParams.get('lng') ?? '78.9629');

    if (Number.isNaN(year) || Number.isNaN(month) || month < 1 || month > 12) {
      return NextResponse.json<ApiResponse>({ success: false, error: 'Invalid year or month' }, { status: 400 });
    }

    const locationKey = `${lat.toFixed(2)},${lng.toFixed(2)}`;
    const monthRedisKey = `panchang:month:${year}-${String(month).padStart(2, '0')}:${locationKey}`;
    const headers = { 'Cache-Control': 'private, max-age=86400' };

    const monthHit = await cacheGet<MonthDay[]>(monthRedisKey);
    if (monthHit) {
      return NextResponse.json<ApiResponse>({ success: true, data: monthHit }, { headers });
    }

    const daysInMonth = new Date(year, month, 0).getDate();
    const startKey = `${year}-${String(month).padStart(2, '0')}-01`;
    const endKey = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

    // Pull all rows already in panchang_cache for this month/location in one go.
    const { data: cachedRows } = await supabase
      .from('panchang_cache')
      .select('date, data')
      .eq('location', locationKey)
      .gte('date', startKey)
      .lte('date', endKey);

    const cachedByDate = new Map<string, { tithi?: string; nakshatra?: string; vara?: string }>();
    for (const row of cachedRows ?? []) {
      const d = row.data as { tithi?: string; nakshatra?: string; vara?: string } | null;
      if (d) cachedByDate.set(row.date as string, d);
    }

    // Build the day list, computing missing days in parallel.
    const dates: Date[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      // Construct a UTC date so toISOString().split('T')[0] is stable.
      dates.push(new Date(Date.UTC(year, month - 1, d)));
    }

    const missingDates = dates.filter((d) => !cachedByDate.has(d.toISOString().split('T')[0]));

    if (missingDates.length > 0) {
      // Don't write summaries back to panchang_cache — the daily route reads
      // that table and expects the full panchang shape (choghadiya, hora,
      // sunrise, etc). The month response is cached in Redis instead, and any
      // day opened in the daily view will populate panchang_cache properly.
      const computed = await Promise.all(
        missingDates.map(async (d) => ({ d, summary: await computeDay(d, lat, lng) })),
      );
      for (const { d, summary } of computed) {
        cachedByDate.set(d.toISOString().split('T')[0], summary);
      }
    }

    const result: MonthDay[] = dates.map((d) => {
      const key = d.toISOString().split('T')[0];
      return summarizeDay(d, cachedByDate.get(key) ?? {});
    });

    await cacheSet(monthRedisKey, result, PANCHANG_TTL);
    return NextResponse.json<ApiResponse>({ success: true, data: result }, { headers });
  } catch (error) {
    console.error('Panchang month error:', error);
    return NextResponse.json<ApiResponse>(
      { success: false, error: error instanceof Error ? error.message : 'Failed to load month' },
      { status: 500 },
    );
  }
}
