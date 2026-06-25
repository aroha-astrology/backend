// GET /api/monthly?year=&month=&language=&rashi=
//
// Reads the pre-generated monthly snapshot from `monthly_snapshot` (Redis
// first, DB fallback). When the snapshot is missing it kicks off background
// generation and returns 202 Pending — consistent with /api/horoscope/daily.
// On-demand single-rashi generation is intentionally not done here; the
// monthly snapshot is heavy (1 long LLM call for all 12 rashis + transit
// compute) and the page is fine showing a skeleton while the cron / 202
// pending self-heal fills it.
import { NextResponse, after } from 'next/server';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { cacheGet, cacheSet } from '@/lib/redis';
import {
  generateMonthlySnapshot,
  MONTHLY_SNAPSHOT_TTL,
  type MonthlySnapshotData,
} from '@/lib/monthly/generate';

export const maxDuration = 60;

const CACHE_HEADERS = { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=3600' };
const PENDING_HEADERS = { 'Cache-Control': 'no-store' };

type AdminSupabase = ReturnType<typeof createAdminSupabase>;

// Process-level dedupe so two concurrent visitors don't both kick off the same
// month-language generation.
const inflight = new Map<string, Promise<unknown>>();
function scheduleGen(year: number, month: number, language: string, supabase: AdminSupabase) {
  const key = `${year}-${month}-${language}`;
  if (inflight.has(key)) return;
  const p = generateMonthlySnapshot(year, month, language, supabase)
    .catch((err) => {
      console.error(`[api/monthly] bg generate failed ${key}:`, err);
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
}

function todayIST(): { year: number; month: number } {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  return { year: ist.getUTCFullYear(), month: ist.getUTCMonth() + 1 };
}

export async function GET(request: Request) {
  try {
    const supabase = createAdminSupabase();
    const { searchParams } = new URL(request.url);

    const t = todayIST();
    const year = Number(searchParams.get('year')) || t.year;
    const month = Number(searchParams.get('month')) || t.month;
    const language = searchParams.get('language') || 'en';
    const rashi = searchParams.get('rashi')?.toLowerCase();

    if (month < 1 || month > 12) {
      return NextResponse.json({ success: false, error: 'Invalid month' }, { status: 400 });
    }

    const cacheKey = `monthly:snapshot:${year}:${month}:${language}`;

    // Redis first
    let snapshot = await cacheGet<MonthlySnapshotData>(cacheKey);
    if (!snapshot) {
      const { data } = await supabase
        .from('monthly_snapshot')
        .select('data')
        .eq('year', year).eq('month', month).eq('language', language)
        .maybeSingle();
      if (data?.data) {
        snapshot = data.data as MonthlySnapshotData;
        await cacheSet(cacheKey, snapshot, MONTHLY_SNAPSHOT_TTL);
      }
    }

    if (!snapshot) {
      console.warn(`[api/monthly] pending — bg-generating ${year}-${month} (${language})`);
      after(() => scheduleGen(year, month, language, supabase));
      return NextResponse.json(
        { success: true, data: null, pending: true, target: { year, month, language } },
        { status: 202, headers: PENDING_HEADERS },
      );
    }

    if (rashi) {
      const block = snapshot.horoscopes[rashi];
      if (!block) {
        return NextResponse.json({ success: false, error: 'Rashi not in snapshot' }, { status: 404 });
      }
      // Single-rashi response carries the rashi horoscope plus shared month-level
      // facts the page needs (so callers don't have to fetch twice).
      return NextResponse.json(
        {
          success: true,
          data: {
            ...block,
            month: snapshot.month,
            year: snapshot.year,
            monthName: snapshot.monthName,
            panchang: snapshot.panchang,
            transits: snapshot.transits,
            muhurtas: snapshot.muhurtas,
          },
        },
        { headers: CACHE_HEADERS },
      );
    }

    return NextResponse.json({ success: true, data: snapshot }, { headers: CACHE_HEADERS });
  } catch (error) {
    console.error('[api/monthly] error:', error);
    const msg = error instanceof Error ? `${error.name}: ${error.message}` : 'Unknown error';
    return NextResponse.json({ success: false, error: 'Failed to load monthly snapshot', detail: msg }, { status: 500 });
  }
}
