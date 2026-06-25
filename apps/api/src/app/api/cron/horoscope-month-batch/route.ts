// Pre-generate a full month of daily horoscopes on the last day of each
// month at 23:30 IST (cron schedule: 0 18 28-31 * *).
//
// The Vercel cron fires on days 28-31 because standard cron has no "last
// day of month" token; we gate inside the handler by checking whether
// tomorrow (IST) belongs to a different month than today (IST).
//
// On the last day:
//   - Generate every day of NEXT month (1st through its last day)
//   - Sequential per (date, language) to respect the same NIM rate-limit
//     pattern the nightly daily cron uses.
import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { generateAndStore } from '@/lib/horoscope/generate';

export const maxDuration = 300;

const LANGUAGES = ['en', 'hi'];

function istDate(offsetDays = 0): Date {
  const d = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d;
}

function isLastDayOfMonthIST(): boolean {
  return istDate(0).getUTCMonth() !== istDate(1).getUTCMonth();
}

function fmt(d: Date): string {
  return d.toISOString().split('T')[0];
}

// All YYYY-MM-DD dates that belong to the calendar month containing `anchor`.
function datesInMonth(anchor: Date): string[] {
  const y = anchor.getUTCFullYear();
  const m = anchor.getUTCMonth();
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const out: string[] = [];
  for (let day = 1; day <= lastDay; day++) {
    out.push(fmt(new Date(Date.UTC(y, m, day))));
  }
  return out;
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Manual triggers (e.g., admin retry) can bypass the last-day gate with ?force=1.
  const url = new URL(request.url);
  const force = url.searchParams.get('force') === '1';

  if (!force && !isLastDayOfMonthIST()) {
    return NextResponse.json({
      success: true,
      skipped: 'not the last day of the month (IST)',
      ist_today: fmt(istDate(0)),
    });
  }

  // Anchor on tomorrow (IST) which lives in the next month.
  const nextMonthAnchor = istDate(1);
  const dates = datesInMonth(nextMonthAnchor);

  const supabase = createAdminSupabase();
  const results: Record<string, number> = {};
  let okCount = 0;
  let failCount = 0;

  console.log(
    `[cron/horoscope-month-batch] generating ${dates.length} days for ${nextMonthAnchor.getUTCFullYear()}-${String(nextMonthAnchor.getUTCMonth() + 1).padStart(2, '0')} (×${LANGUAGES.length} languages)`,
  );

  // Sequential per (date, language) — same pattern as the nightly daily cron.
  for (const date of dates) {
    for (const lang of LANGUAGES) {
      try {
        const n = await generateAndStore(date, lang, supabase);
        results[`${date}_${lang}`] = n;
        okCount++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[cron/horoscope-month-batch] failed ${date} (${lang}): ${msg}`);
        results[`${date}_${lang}`] = -1;
        failCount++;
      }
    }
  }

  console.log(
    `[cron/horoscope-month-batch] done — ok=${okCount} fail=${failCount} total=${dates.length * LANGUAGES.length}`,
  );

  return NextResponse.json({
    success: true,
    month: `${nextMonthAnchor.getUTCFullYear()}-${String(nextMonthAnchor.getUTCMonth() + 1).padStart(2, '0')}`,
    days: dates.length,
    languages: LANGUAGES,
    ok: okCount,
    failed: failCount,
    results,
  });
}
