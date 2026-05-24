// Legacy monthly horoscope endpoint — preserved for any callers still hitting
// it (dashboard cards, mobile app, older client builds). All data now flows
// from monthly_snapshot via the unified generator. New code should call
// /api/monthly directly.
import { NextResponse, after } from 'next/server';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { cacheGet, cacheSet } from '@/lib/redis';
import {
  generateMonthlySnapshot,
  MONTHLY_SNAPSHOT_TTL,
  type MonthlySnapshotData,
} from '@/lib/monthly/generate';

export const maxDuration = 60;

const RASHIS = ['mesha','vrishabha','mithuna','karka','simha','kanya','tula','vrischika','dhanu','makara','kumbha','meena'];

type AdminSupabase = ReturnType<typeof createAdminSupabase>;

const inflight = new Map<string, Promise<unknown>>();
function scheduleGen(year: number, month: number, language: string, supabase: AdminSupabase) {
  const key = `${year}-${month}-${language}`;
  if (inflight.has(key)) return;
  const p = generateMonthlySnapshot(year, month, language, supabase)
    .catch((err) => console.error(`[horoscope/monthly] bg generate failed ${key}:`, err))
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
}

async function loadSnapshot(
  supabase: AdminSupabase,
  year: number,
  month: number,
  language: string,
): Promise<MonthlySnapshotData | null> {
  const cacheKey = `monthly:snapshot:${year}:${month}:${language}`;
  const hit = await cacheGet<MonthlySnapshotData>(cacheKey);
  if (hit) return hit;
  const { data } = await supabase
    .from('monthly_snapshot')
    .select('data')
    .eq('year', year).eq('month', month).eq('language', language)
    .maybeSingle();
  if (!data?.data) return null;
  const snap = data.data as MonthlySnapshotData;
  await cacheSet(cacheKey, snap, MONTHLY_SNAPSHOT_TTL);
  return snap;
}

export async function GET(request: Request) {
  try {
    const supabase = createAdminSupabase();
    const { searchParams } = new URL(request.url);
    const language = searchParams.get('language') || 'en';
    const now = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
    const year = parseInt(searchParams.get('year') || '') || now.getUTCFullYear();
    const month = parseInt(searchParams.get('month') || '') || (now.getUTCMonth() + 1);
    const rashiParam = searchParams.get('rashi');

    const snapshot = await loadSnapshot(supabase, year, month, language);
    if (!snapshot) {
      // Kick off generation and return a pending stub.
      after(() => scheduleGen(year, month, language, supabase));
      return NextResponse.json(
        { success: true, data: null, pending: true },
        { status: 202, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    if (rashiParam) {
      const lower = rashiParam.toLowerCase();
      const block = snapshot.horoscopes[lower];
      if (!block) return NextResponse.json({ success: false, error: 'Rashi not in snapshot' }, { status: 404 });
      return NextResponse.json({ success: true, data: block });
    }

    // All-rashis response: same shape the old route returned (lowercase rashi keys).
    const all: Record<string, unknown> = {};
    for (const k of RASHIS) {
      if (snapshot.horoscopes[k]) all[k] = snapshot.horoscopes[k];
    }
    return NextResponse.json({ success: true, data: all });
  } catch (error) {
    console.error('[horoscope/monthly] error:', error);
    return NextResponse.json({ success: false, error: 'Failed to get monthly horoscope' }, { status: 500 });
  }
}
