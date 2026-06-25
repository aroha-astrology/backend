// Pre-generate next week's weekly horoscope for all 12 rashis × 2 languages.
// Fires every Saturday at 23:30 IST (cron schedule: 0 18 * * 6), so by the
// time Monday rolls around the on-demand POST route just returns the cached
// row instead of generating per-user on first hit.
//
// Sequential per (rashi, language) — 24 NIM calls — to stay friendly with
// rate limits. The same authorization pattern + maxDuration as the other
// cron routes.
import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabase } from '@/lib/supabase/admin';
import {
  WEEKLY_RASHIS,
  generateWeeklyAndStore,
  weekBoundsIST,
} from '@/lib/horoscope/weeklyGenerate';

export const maxDuration = 300;

const LANGUAGES = ['en', 'hi'];

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const force = url.searchParams.get('force') === '1';

  // Saturday 23:30 IST → +1 week of bounds = next Monday's week (Mon-Sun).
  const bounds = weekBoundsIST(new Date(), 1);

  const supabase = createAdminSupabase();
  const results: Record<string, 'ok' | 'fail'> = {};
  let okCount = 0;
  let failCount = 0;

  console.log(
    `[cron/horoscope-weekly] generating ${WEEKLY_RASHIS.length} rashis × ${LANGUAGES.length} languages for week of ${bounds.weekStart} → ${bounds.weekEnd}`,
  );

  for (const rashi of WEEKLY_RASHIS) {
    for (const lang of LANGUAGES) {
      try {
        await generateWeeklyAndStore(rashi, lang, bounds, supabase, { force });
        results[`${rashi}_${lang}`] = 'ok';
        okCount++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[cron/horoscope-weekly] failed ${rashi} (${lang}): ${msg}`);
        results[`${rashi}_${lang}`] = 'fail';
        failCount++;
      }
    }
  }

  console.log(`[cron/horoscope-weekly] done — ok=${okCount} fail=${failCount}`);

  return NextResponse.json({
    success: true,
    weekStart: bounds.weekStart,
    weekEnd: bounds.weekEnd,
    rashis: WEEKLY_RASHIS.length,
    languages: LANGUAGES,
    ok: okCount,
    failed: failCount,
    results,
  });
}
