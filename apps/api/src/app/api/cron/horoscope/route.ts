import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { generateAndStore, todayIST, RASHIS } from '@/lib/horoscope/generate';

export const maxDuration = 300;

const LANGUAGES = ['en', 'hi'];

// GET /api/cron/horoscope — Vercel cron fires at 11:55 PM IST (18:25 UTC) daily.
// PRIMARY: generate tomorrow's rows. At 00:00 IST those rows already exist as "today".
// SAFETY: if today's rows are somehow missing (previous cron failed, table wipe, fresh deploy),
// fill them in the same run so the dashboard isn't stuck in skeleton for the first user.
// Sequential (not parallel) to avoid hammering NVIDIA NIM rate limits.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminSupabase();

  // Prune horoscopes older than 2 days. We no longer serve yesterday as a fallback, but
  // weekly/monthly aggregations may still read recent history, so a 2-day buffer is safe.
  const cutoff = todayIST(-2);
  const { error: deleteError } = await supabase
    .from('daily_horoscopes')
    .delete()
    .lt('date', cutoff);
  if (deleteError) console.error('[cron/horoscope] prune error:', deleteError.message);

  const today = todayIST(0);
  const tomorrow = todayIST(1);

  // Only fill today if it's actually missing — otherwise we're re-spending NIM tokens for
  // content we already generated as "tomorrow" the previous night.
  const { data: todayCheck } = await supabase
    .from('daily_horoscopes')
    .select('rashi')
    .eq('date', today)
    .eq('language', 'en');
  const todayMissingRashis = !todayCheck || todayCheck.length < RASHIS.length;

  const dates = todayMissingRashis ? [today, tomorrow] : [tomorrow];

  const results: Record<string, number> = {};

  // Sequential — prevents simultaneous NIM 429s that previously caused partial runs and timeouts.
  for (const date of dates) {
    for (const lang of LANGUAGES) {
      try {
        const n = await generateAndStore(date, lang, supabase);
        results[`${date}_${lang}`] = n;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[cron/horoscope] failed ${date} (${lang}): ${msg}`);
        results[`${date}_${lang}`] = -1;
      }
    }
  }

  return NextResponse.json({ success: true, generated: results, filledTodayBackup: todayMissingRashis });
}
