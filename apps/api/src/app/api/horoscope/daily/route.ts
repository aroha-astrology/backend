import { NextResponse, after } from 'next/server';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { cacheGet, cacheSet } from '@/lib/redis';
import { generateAndStore, RASHIS, todayIST, HOROSCOPE_TTL } from '@/lib/horoscope/generate';

// Self-heal path can call the AI — allow up to 90s.
export const maxDuration = 90;

const CACHE_HEADERS = { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=3600' };
// Pending responses must not be CDN-cached, or every visitor would be stuck waiting on the same empty payload.
const PENDING_HEADERS = { 'Cache-Control': 'no-store' };

type Supabase = ReturnType<typeof createAdminSupabase>;

// Process-level lock so concurrent pending requests don't all kick off the same generation.
// Cleared once the generation promise settles. Lives for the function-instance lifetime.
const inflightGen = new Map<string, Promise<unknown>>();
function scheduleGen(date: string, language: string, supabase: Supabase) {
  const key = `${date}|${language}`;
  if (inflightGen.has(key)) return;
  const p = safeGenerate(date, language, supabase).finally(() => inflightGen.delete(key));
  inflightGen.set(key, p);
}

function logError(scope: string, err: unknown) {
  const e = err instanceof Error ? err : new Error(String(err));
  console.error(`[horoscope/daily] ${scope} ${e.name}: ${e.message}`);
  if (e.stack) console.error(e.stack);
}

async function safeGenerate(
  date: string,
  language: string,
  supabase: Supabase,
): Promise<{ success: boolean; error?: string }> {
  try {
    const n = await generateAndStore(date, language, supabase);
    return { success: n > 0 };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logError(`generateAndStore failed for ${date} (${language})`, err);
    return { success: false, error: msg };
  }
}

async function fetchAllRashis(
  supabase: Supabase,
  date: string,
  language: string,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase
    .from('daily_horoscopes')
    .select('rashi, content')
    .eq('date', date)
    .eq('language', language)
    .in('rashi', RASHIS as unknown as string[]);
  if (error) {
    logError(`fetchAllRashis ${date} (${language})`, error);
    return null;
  }
  if (!data || data.length === 0) return null;
  return data.reduce(
    (acc, h) => ({ ...acc, [String(h.rashi).toLowerCase()]: h.content }),
    {} as Record<string, unknown>,
  );
}

async function fetchOneRashi(
  supabase: Supabase,
  rashiTitle: string,
  date: string,
  language: string,
): Promise<unknown | null> {
  const { data, error } = await supabase
    .from('daily_horoscopes')
    .select('content')
    .eq('rashi', rashiTitle)
    .eq('date', date)
    .eq('language', language)
    .maybeSingle();
  if (error) {
    logError(`fetchOneRashi ${rashiTitle} ${date} (${language})`, error);
    return null;
  }
  return data?.content ?? null;
}

export async function GET(request: Request) {
  try {
    const supabase = createAdminSupabase();
    const { searchParams } = new URL(request.url);
    const rashi = searchParams.get('rashi');
    const language = searchParams.get('language') || 'en';
    const dateParam = searchParams.get('date');
    const today = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
      ? dateParam
      : todayIST();

    if (rashi) {
      const rashiLower = rashi.toLowerCase();
      const rashiTitle = rashiLower.charAt(0).toUpperCase() + rashiLower.slice(1);
      const redisKey = `horoscope:daily:${rashiLower}:${today}:${language}`;

      const redisHit = await cacheGet<Record<string, unknown>>(redisKey);
      if (redisHit) {
        return NextResponse.json({ success: true, data: redisHit }, { headers: CACHE_HEADERS });
      }

      const existing = await fetchOneRashi(supabase, rashiTitle, today, language);
      if (existing) {
        await cacheSet(redisKey, existing, HOROSCOPE_TTL);
        return NextResponse.json({ success: true, data: existing }, { headers: CACHE_HEADERS });
      }

      // Today's rows are missing — kick off background generation and tell the client it's pending.
      // Client keeps the skeleton up and polls; better UX than showing yesterday's stale content
      // (which makes users think the app didn't update and stops them returning).
      console.warn(`[horoscope/daily] pending — bg-generating ${today} (${language})`);
      after(() => scheduleGen(today, language, supabase));
      return NextResponse.json(
        { success: true, data: null, pending: true, target: today },
        { status: 202, headers: PENDING_HEADERS },
      );
    }

    // All rashis — Redis → Supabase → bg-regenerate + pending response
    const allKey = `horoscope:daily:all:${today}:${language}`;
    const allRedisHit = await cacheGet<Record<string, unknown>>(allKey);
    if (allRedisHit) {
      return NextResponse.json({ success: true, data: allRedisHit }, { headers: CACHE_HEADERS });
    }

    const existing = await fetchAllRashis(supabase, today, language);
    if (existing) {
      if (Object.keys(existing).length === 12) {
        await cacheSet(allKey, existing, HOROSCOPE_TTL);
      }
      return NextResponse.json({ success: true, data: existing }, { headers: CACHE_HEADERS });
    }

    // Today's rows are missing — kick off background generation and let the client poll.
    console.warn(`[horoscope/daily] pending all-rashis — bg-generating ${today} (${language})`);
    after(() => scheduleGen(today, language, supabase));
    return NextResponse.json(
      { success: true, data: null, pending: true, target: today },
      { status: 202, headers: PENDING_HEADERS },
    );
  } catch (error) {
    logError('top-level handler', error);
    const msg = error instanceof Error ? `${error.name}: ${error.message}` : 'Unknown error';
    return NextResponse.json({ success: false, error: 'Failed to get horoscope', detail: msg }, { status: 500 });
  }
}
