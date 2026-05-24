export const runtime = 'nodejs';
export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { cacheGet, cacheSet } from '@/lib/redis';

// Default: India geographic centre. User-specific coords are computed on-demand at query time.
const DEFAULT_LAT = 20.5937;
const DEFAULT_LNG = 78.9629;
const PANCHANG_TTL = 86400 * 30; // 30-day Redis TTL — Supabase is the source of truth

const VARA_NAMES = [
  'Ravivaar (Sunday)', 'Somvaar (Monday)', 'Mangalvaar (Tuesday)',
  'Budhvaar (Wednesday)', 'Guruvaar (Thursday)', 'Shukravaar (Friday)', 'Shanivaar (Saturday)',
];

function to12Hour(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function buildChoghadiya(sunriseTime: string, sunsetTime: string, dayOfWeek: number) {
  const parseMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const sunriseMin = parseMin(sunriseTime);
  const sunsetMin = parseMin(sunsetTime);
  const slotDay = (sunsetMin - sunriseMin) / 8;
  const slotNight = (24 * 60 - (sunsetMin - sunriseMin)) / 8;
  const formatMin = (totalMin: number): string => {
    let m = Math.round(totalMin);
    if (m < 0) m += 24 * 60;
    if (m >= 24 * 60) m -= 24 * 60;
    const h = Math.floor(m / 60); const min = m % 60;
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
    return `${h12}:${String(min).padStart(2, '0')} ${ampm}`;
  };
  const names = ['Udveg', 'Char', 'Labh', 'Amrit', 'Kaal', 'Shubh', 'Rog', 'Udveg'];
  const types: ('good' | 'bad' | 'neutral')[] = ['bad', 'neutral', 'good', 'good', 'bad', 'good', 'bad', 'bad'];
  const offset = dayOfWeek * 2;
  return {
    day: Array.from({ length: 8 }, (_, i) => ({
      name: names[(i + offset) % 8], start: formatMin(sunriseMin + i * slotDay), end: formatMin(sunriseMin + (i + 1) * slotDay), type: types[(i + offset) % 8],
    })),
    night: Array.from({ length: 8 }, (_, i) => ({
      name: names[(i + offset + 4) % 8], start: formatMin(sunsetMin + i * slotNight), end: formatMin(sunsetMin + (i + 1) * slotNight), type: types[(i + offset + 4) % 8],
    })),
  };
}

function buildHora(dayOfWeek: number) {
  const horaOrder = ['Sun', 'Venus', 'Mercury', 'Moon', 'Saturn', 'Jupiter', 'Mars'];
  const dayStart = [0, 1, 6, 2, 5, 3, 4][dayOfWeek];
  return Array.from({ length: 24 }, (_, i) => ({
    planet: horaOrder[(dayStart + i) % 7],
    start: `${String(i).padStart(2, '0')}:00`,
    end: `${String((i + 1) % 24).padStart(2, '0')}:00`,
    isCurrent: false,
  }));
}

async function computeAndStore(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  date: Date,
  lat: number,
  lng: number,
): Promise<'hit' | 'generated' | 'error'> {
  const dateKey = date.toISOString().split('T')[0];
  const locationKey = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  const redisKey = `panchang:${dateKey}:${locationKey}`;

  // Redis fast-path
  if (await cacheGet(redisKey)) return 'hit';

  // Supabase fast-path
  const { data: cached } = await supabase
    .from('panchang_cache')
    .select('data')
    .eq('date', dateKey)
    .eq('location', locationKey)
    .maybeSingle();

  if (cached) {
    await cacheSet(redisKey, cached.data, PANCHANG_TTL);
    return 'hit';
  }

  try {
    const { calculateChart, calculateFullPanchang } = await import('@aroha-astrology/astro-engine');
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const dayOfWeek = date.getDay();

    const chart = await calculateChart(year, month, day, 6, 0, 5.5, lat, lng, 'lahiri', 'W');
    const sun = chart.planets.find((p: { planet: string }) => p.planet === 'Sun');
    const moon = chart.planets.find((p: { planet: string }) => p.planet === 'Moon');
    if (!sun || !moon) return 'error';

    const panchang = calculateFullPanchang(date, lat, lng, sun.longitude, moon.longitude);
    const result = {
      date: dateKey,
      tithi: `${panchang.tithi.paksha} ${panchang.tithi.name} (${panchang.tithi.number})`,
      nakshatra: `${panchang.nakshatra.name} Pada ${panchang.nakshatra.pada} (${panchang.nakshatra.lord})`,
      yoga: `${panchang.yoga.name}${panchang.yoga.isAuspicious ? ' ✓' : ''}`,
      karana: panchang.karana.name,
      vara: VARA_NAMES[dayOfWeek],
      rahuKaal: { start: to12Hour(panchang.rahuKaal.start), end: to12Hour(panchang.rahuKaal.end) },
      gulikaKaal: { start: to12Hour(panchang.gulikaKaal.start), end: to12Hour(panchang.gulikaKaal.end) },
      yamagandaKaal: { start: to12Hour(panchang.yamagandaKaal.start), end: to12Hour(panchang.yamagandaKaal.end) },
      abhijitMuhurta: { start: to12Hour(panchang.abhijitMuhurta.start), end: to12Hour(panchang.abhijitMuhurta.end) },
      choghadiya: buildChoghadiya(panchang.sunriseTime, panchang.sunsetTime, dayOfWeek),
      hora: buildHora(dayOfWeek),
      sunrise: to12Hour(panchang.sunriseTime),
      sunset: to12Hour(panchang.sunsetTime),
      ayanamsa: 'Lahiri',
      ayanamsaValue: parseFloat(chart.ayanamsaValue?.toFixed(4) ?? '0'),
      regionalMonths: panchang.regionalMonths,
    };

    await supabase.from('panchang_cache').upsert(
      { date: dateKey, location: locationKey, data: result as unknown as Record<string, unknown> },
      { onConflict: 'date,location' },
    );
    await cacheSet(redisKey, result, PANCHANG_TTL);
    return 'generated';
  } catch (err) {
    console.error(`[panchang-warmup] error for ${dateKey}@${locationKey}:`, err);
    return 'error';
  }
}

function isAuthorized(req: NextRequest): boolean {
  const auth = req.headers.get('authorization');
  if (process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`) return true;
  const xKey = req.headers.get('x-internal-key');
  if (process.env.INTERNAL_PROCESS_KEY && xKey === process.env.INTERNAL_PROCESS_KEY) return true;
  return false;
}

async function handle(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);

  // days_back: how many days before today to include (default 0 for cron; set 180 for bulk run)
  // days_ahead: how many days after today to include (default 7 for cron; set 730 for bulk run)
  // batch: max dates to process per call (default 30, max 90)
  // offset: skip first N dates — use to paginate bulk runs
  const daysBack  = Math.min(Number(searchParams.get('days_back')  ?? 0),   180);
  const daysAhead = Math.min(Number(searchParams.get('days_ahead') ?? 7),   730);
  const batch     = Math.min(Number(searchParams.get('batch')      ?? 30),   90);
  const offset    = Math.max(Number(searchParams.get('offset')     ?? 0),    0);

  const lat = parseFloat(searchParams.get('lat') ?? String(DEFAULT_LAT));
  const lng = parseFloat(searchParams.get('lng') ?? String(DEFAULT_LNG));

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Build the full date list for this range, then slice the batch
  const allDates: Date[] = [];
  for (let d = -daysBack; d <= daysAhead; d++) {
    const date = new Date(today);
    date.setDate(today.getDate() + d);
    allDates.push(date);
  }
  const toProcess = allDates.slice(offset, offset + batch);

  const supabase = await createServerSupabase();
  const stats = { hit: 0, generated: 0, error: 0 };

  for (const date of toProcess) {
    const result = await computeAndStore(supabase, date, lat, lng);
    stats[result]++;
  }

  const totalDates = allDates.length;
  const nextOffset = offset + batch;
  const hasMore = nextOffset < totalDates;

  console.log(`[panchang-warmup] batch=${batch} offset=${offset} → hit:${stats.hit} generated:${stats.generated} error:${stats.error} hasMore:${hasMore}`);
  return NextResponse.json({
    success: true,
    ...stats,
    processed: toProcess.length,
    totalDates,
    nextOffset: hasMore ? nextOffset : null,
    hasMore,
  });
}

export const GET  = handle;
export const POST = handle;
