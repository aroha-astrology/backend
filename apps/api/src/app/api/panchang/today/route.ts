import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import type { ApiResponse } from '@aroha-astrology/shared';
import { cacheGet, cacheSet } from '@/lib/redis';

export const runtime = 'nodejs';

const PANCHANG_TTL = 86400; // 24 hours

const VARA_NAMES = [
  'Ravivaar (Sunday)',
  'Somvaar (Monday)',
  'Mangalvaar (Tuesday)',
  'Budhvaar (Wednesday)',
  'Guruvaar (Thursday)',
  'Shukravaar (Friday)',
  'Shanivaar (Saturday)',
];

function to12Hour(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function buildChoghadiya(sunriseTime: string, sunsetTime: string, dayOfWeek: number) {
  const parseMin = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };
  const sunriseMin = parseMin(sunriseTime);
  const sunsetMin = parseMin(sunsetTime);
  const dayDuration = sunsetMin - sunriseMin;
  const nightDuration = 24 * 60 - dayDuration;
  const slotDay = dayDuration / 8;
  const slotNight = nightDuration / 8;

  const formatMin = (totalMin: number): string => {
    let m = Math.round(totalMin);
    if (m < 0) m += 24 * 60;
    if (m >= 24 * 60) m -= 24 * 60;
    const h = Math.floor(m / 60);
    const min = m % 60;
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
    return `${h12}:${String(min).padStart(2, '0')} ${ampm}`;
  };

  const choghadiyaNames = ['Udveg', 'Char', 'Labh', 'Amrit', 'Kaal', 'Shubh', 'Rog', 'Udveg'];
  const types: ('good' | 'bad' | 'neutral')[] = ['bad', 'neutral', 'good', 'good', 'bad', 'good', 'bad', 'bad'];
  const offset = dayOfWeek * 2;

  const day = Array.from({ length: 8 }, (_, i) => ({
    name: choghadiyaNames[(i + offset) % 8],
    start: formatMin(sunriseMin + i * slotDay),
    end: formatMin(sunriseMin + (i + 1) * slotDay),
    type: types[(i + offset) % 8],
  }));

  const night = Array.from({ length: 8 }, (_, i) => ({
    name: choghadiyaNames[(i + offset + 4) % 8],
    start: formatMin(sunsetMin + i * slotNight),
    end: formatMin(sunsetMin + (i + 1) * slotNight),
    type: types[(i + offset + 4) % 8],
  }));

  return { day, night };
}

function buildHora(dayOfWeek: number) {
  const horaOrder = ['Sun', 'Venus', 'Mercury', 'Moon', 'Saturn', 'Jupiter', 'Mars'];
  const dayStart = [0, 1, 6, 2, 5, 3, 4][dayOfWeek];
  const nowH = new Date().getHours();
  return Array.from({ length: 24 }, (_, i) => ({
    planet: horaOrder[(dayStart + i) % 7],
    start: `${String(i).padStart(2, '0')}:00`,
    end: `${String((i + 1) % 24).padStart(2, '0')}:00`,
    isCurrent: nowH === i,
  }));
}

// ============================================================
// GET /api/panchang/today
// ============================================================

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      );
    }

    const { searchParams } = new URL(request.url);
    const dateStr = searchParams.get('date');
    const date = dateStr ? new Date(dateStr) : new Date();
    // Default to geographical centre of India when no location supplied
    const lat = parseFloat(searchParams.get('lat') ?? '20.5937');
    const lng = parseFloat(searchParams.get('lng') ?? '78.9629');

    const dateKey = date.toISOString().split('T')[0];
    const locationKey = `${lat.toFixed(2)},${lng.toFixed(2)}`;
    const redisKey = `panchang:${dateKey}:${locationKey}`;
    const panchangHeaders = { 'Cache-Control': 'private, max-age=86400' };

    const redisHit = await cacheGet<Record<string, unknown>>(redisKey);
    if (redisHit) {
      return NextResponse.json<ApiResponse>({ success: true, data: redisHit }, { headers: panchangHeaders });
    }

    const { data: cached } = await supabase
      .from('panchang_cache')
      .select('data')
      .eq('date', dateKey)
      .eq('location', locationKey)
      .maybeSingle();

    if (cached) {
      await cacheSet(redisKey, cached.data, PANCHANG_TTL);
      return NextResponse.json<ApiResponse>({ success: true, data: cached.data }, { headers: panchangHeaders });
    }

    // Accurate panchang using Swiss Ephemeris (Lahiri sidereal)
    const { calculateChart, calculateFullPanchang } = await import('@aroha-astrology/astro-engine');
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const dayOfWeek = date.getDay();

    // Calculate at 6 AM IST — approximate Indian sunrise for daily panchang
    const chart = await calculateChart(year, month, day, 6, 0, 5.5, lat, lng, 'lahiri', 'W');
    const sun = chart.planets.find((p: { planet: string }) => p.planet === 'Sun');
    const moon = chart.planets.find((p: { planet: string }) => p.planet === 'Moon');
    if (!sun || !moon) throw new Error('Sun/Moon positions unavailable');

    const panchang = calculateFullPanchang(date, lat, lng, sun.longitude, moon.longitude);

    const result = {
      date: dateKey,
      tithi: `${panchang.tithi.paksha} ${panchang.tithi.name} (${panchang.tithi.number})`,
      nakshatra: `${panchang.nakshatra.name} Pada ${panchang.nakshatra.pada} (${panchang.nakshatra.lord})`,
      yoga: `${panchang.yoga.name}${panchang.yoga.isAuspicious ? ' ✓' : ''}`,
      karana: panchang.karana.name,
      vara: VARA_NAMES[dayOfWeek],
      rahuKaal: {
        start: to12Hour(panchang.rahuKaal.start),
        end: to12Hour(panchang.rahuKaal.end),
        display: `${to12Hour(panchang.rahuKaal.start)} - ${to12Hour(panchang.rahuKaal.end)}`,
      },
      gulikaKaal: {
        start: to12Hour(panchang.gulikaKaal.start),
        end: to12Hour(panchang.gulikaKaal.end),
        display: `${to12Hour(panchang.gulikaKaal.start)} - ${to12Hour(panchang.gulikaKaal.end)}`,
      },
      yamagandaKaal: {
        start: to12Hour(panchang.yamagandaKaal.start),
        end: to12Hour(panchang.yamagandaKaal.end),
        display: `${to12Hour(panchang.yamagandaKaal.start)} - ${to12Hour(panchang.yamagandaKaal.end)}`,
      },
      abhijitMuhurta: {
        start: to12Hour(panchang.abhijitMuhurta.start),
        end: to12Hour(panchang.abhijitMuhurta.end),
      },
      choghadiya: buildChoghadiya(panchang.sunriseTime, panchang.sunsetTime, dayOfWeek),
      hora: buildHora(dayOfWeek),
      sunrise: to12Hour(panchang.sunriseTime),
      sunset: to12Hour(panchang.sunsetTime),
      ayanamsa: 'Lahiri',
      ayanamsaValue: parseFloat(chart.ayanamsaValue?.toFixed(4) ?? '0'),
      regionalMonths: panchang.regionalMonths,
    };

    await supabase.from('panchang_cache').upsert(
      {
        date: dateKey,
        location: locationKey,
        data: result as unknown as Record<string, unknown>,
      },
      { onConflict: 'date,location' },
    );
    await cacheSet(redisKey, result, PANCHANG_TTL);

    return NextResponse.json<ApiResponse>({ success: true, data: result }, { headers: panchangHeaders });
  } catch (error) {
    console.error('Panchang error:', error);
    return NextResponse.json<ApiResponse>(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to calculate panchang',
      },
      { status: 500 },
    );
  }
}
