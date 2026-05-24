// Monthly cosmic snapshot cron — generates NEXT month for en + hi at month
// start. Stores into monthly_snapshot via the unified generator (one row per
// {year, month, language}). Also bypassable from the admin retry tool with
// ?force=1 and ?year=&month= to regenerate a specific month.
import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { generateMonthlySnapshot } from '@/lib/monthly/generate';

export const maxDuration = 300;

const LANGUAGES = ['en', 'hi'];

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const force = url.searchParams.get('force') === '1';
  const yearParam = Number(url.searchParams.get('year'));
  const monthParam = Number(url.searchParams.get('month'));

  let year: number;
  let month: number;
  if (yearParam && monthParam) {
    year = yearParam;
    month = monthParam;
  } else {
    // Default: next month (IST)
    const now = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
    const nextMonthRaw = now.getUTCMonth() + 2; // 0-indexed +2 = next month, 1-indexed
    year = nextMonthRaw > 12 ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
    month = nextMonthRaw > 12 ? 1 : nextMonthRaw;
  }

  const supabase = createAdminSupabase();
  const results: Record<string, { ok: boolean; error?: string }> = {};

  // Sequential per language — both languages share the same astro-engine
  // singleton and a large LLM call; parallel doesn't actually help and risks
  // doubling memory.
  for (const lang of LANGUAGES) {
    try {
      await generateMonthlySnapshot(year, month, lang, supabase, { force });
      results[`${year}-${month}_${lang}`] = { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[cron/monthly-horoscope] failed ${year}-${month} (${lang}):`, msg);
      results[`${year}-${month}_${lang}`] = { ok: false, error: msg };
    }
  }

  return NextResponse.json({ success: true, year, month, results });
}
