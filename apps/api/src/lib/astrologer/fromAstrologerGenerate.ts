import type { SupabaseClient } from '@supabase/supabase-js';
import { createAIMessage } from '@/lib/ai/aiProvider';
import { buildLifeContext } from '@/lib/ai/buildLifeContext';
import { todayIST } from '@/lib/horoscope/generate';
import { dateToJulianDay, calculatePlanetPositions } from '@aroha-astrology/astro-engine';

/**
 * "From Astrologer" daily card.
 *
 * Combines Apollo-derived life context (via buildLifeContext) with the user's
 * birth chart, current dasha state, and tomorrow's transits to produce a tight
 * card with 2 good points, 2 cautions, and one remedy. If the remedy is a
 * physical product, the model emits a Google Shopping search query so the UI
 * can render a buy card.
 *
 * Same persistence pattern as personalDaily: feature_insights via the
 * upsert_feature_insight RPC, keyed by tomorrow's IST date.
 */

export type FromAstrologerRemedy = {
  kind: 'product' | 'mantra' | 'fast' | 'donation' | 'puja';
  title: string;
  description: string;
  product?: {
    name: string;
    google_shopping_query: string;
  };
};

export type FromAstrologerReading = {
  greeting: string;
  good: [string, string];
  bad: [string, string];
  remedy: FromAstrologerRemedy;
};

function tomorrowISO(): string {
  // Tomorrow's date in IST as YYYY-MM-DD.
  const ist = new Date(Date.now() + 5.5 * 3600000);
  ist.setUTCDate(ist.getUTCDate() + 1);
  return ist.toISOString().slice(0, 10);
}

function dayAfterTomorrowISTMidnightUTC(): Date {
  // Cache expiry — after tomorrow rolls over.
  const ist = new Date(Date.now() + 5.5 * 3600000);
  ist.setUTCHours(0, 0, 0, 0);
  ist.setUTCDate(ist.getUTCDate() + 2);
  return new Date(ist.getTime() - 5.5 * 3600000);
}

export async function generateFromAstrologerDaily(
  supabase: SupabaseClient,
  params: {
    userId: string;
    chartId: string;
    language?: string;
  },
): Promise<FromAstrologerReading | null> {
  const { userId, chartId, language = 'en' } = params;
  const tomorrow = tomorrowISO();

  const [{ data: chart }, transitSummary, lifeContext] = await Promise.all([
    supabase
      .from('kundli_charts')
      .select('chart_data, dasha_data')
      .eq('id', chartId)
      .eq('user_id', userId)
      .single(),
    computeTomorrowTransits(),
    buildLifeContext(supabase, userId),
  ]);

  if (!chart) return null;

  const cd = chart.chart_data as Record<string, unknown>;
  const asc = cd?.ascendant as Record<string, unknown> | undefined;

  const dashaData = chart.dasha_data as Record<string, unknown> | undefined;
  const vim = dashaData?.vimshottari as Record<string, unknown> | undefined;
  const md = vim?.currentMahadasha as Record<string, unknown> | undefined;
  const ad = vim?.currentAntardasha as Record<string, unknown> | undefined;

  const langLabel = language === 'hi' ? 'Hindi' : 'English';

  const systemPrompt = `You are the user's personal astrologer giving them a short, useful preview of TOMORROW. Write in ${langLabel}.

Voice: warm, concise, grounded. No mystical jargon. Speak directly to this person, not generically.

Return ONLY valid JSON — no markdown fences:
{
  "greeting": "<one warm sentence opening>",
  "good": ["<positive #1 — what to lean into tomorrow>", "<positive #2>"],
  "bad":  ["<caution #1 — what to handle carefully tomorrow>", "<caution #2>"],
  "remedy": {
    "kind": "product" | "mantra" | "fast" | "donation" | "puja",
    "title": "<short remedy name>",
    "description": "<one sentence describing the remedy>",
    "product": {                                            // include ONLY when kind === "product"
      "name": "<generic searchable product name, e.g. '7 Mukhi Rudraksha', 'Yellow Sapphire Ring', 'Sri Yantra Plate'>",
      "google_shopping_query": "<the same product name optimized for Google Shopping search>"
    }
  }
}

HARD RULES (non-negotiable):
- Never name companies, schools, projects, clients, colleagues, or cities.
- Refer to work as "your field" or by the SECTOR — never quote the title verbatim.
- Refer to education only as the field of study.
- Never quote a salary number.
- Each of good[] and bad[] must be EXACTLY 2 items, each 1 short sentence.
- Keep all references to planets, houses, dashas, and yogas to AT MOST one passing mention in the whole response. Lead with what the user will feel and experience, not with the planetary cause.
- "product" key MUST be omitted unless kind === "product".`;

  const userMessage = `${lifeContext.promptBlock}

BIRTH CHART SIGNAL:
- Ascendant: ${asc?.sign ?? 'unknown'}
- Current Dasha: ${md?.planet ?? '?'} MD / ${ad?.planet ?? '?'} AD

TOMORROW'S TRANSITS (${tomorrow}):
${transitSummary}

Write the From-Astrologer card for tomorrow.`;

  const aiResponse = await createAIMessage({
    max_tokens: 500,
    temperature: 0.75,
    skipPersona: true,
    maxRetries: 2,
    jsonMode: true,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });

  const rawText = aiResponse.content.find(c => c.type === 'text')?.text ?? '{}';
  let reading: FromAstrologerReading | null = null;
  try {
    const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
    reading = sanitize(JSON.parse(cleaned));
  } catch {
    reading = null;
  }

  if (!reading) return null;

  const expiresAt = dayAfterTomorrowISTMidnightUTC();
  const { error: rpcError } = await supabase.rpc('upsert_feature_insight', {
    p_user_id: userId,
    p_chart_id: chartId,
    p_feature_key: 'from_astrologer_daily',
    p_params_hash: tomorrow,
    p_language: language,
    p_source: 'lite_ai',
    p_source_version: 1,
    p_content: reading as unknown as Record<string, unknown>,
    p_report_id: null,
    p_expires_at: expiresAt.toISOString(),
  });
  if (rpcError) console.error('[fromAstrologer] upsert_feature_insight failed:', rpcError.message);

  return reading;
}

async function computeTomorrowTransits(): Promise<string> {
  try {
    const t = new Date(Date.now() + 24 * 3600 * 1000);
    const jd = await dateToJulianDay(
      t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate(),
      6, 30, 0, // 12:00 IST noon → 06:30 UTC, gives stable transit positions
    );
    const planets = (await calculatePlanetPositions(jd, 'lahiri')) as Array<{ planet: string; sign: string }>;
    return planets.map(p => `${p.planet}: ${p.sign}`).join(', ');
  } catch {
    return 'unavailable';
  }
}

function sanitize(raw: unknown): FromAstrologerReading | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const good = Array.isArray(r.good) ? r.good.slice(0, 2).map(String) : [];
  const bad = Array.isArray(r.bad) ? r.bad.slice(0, 2).map(String) : [];
  if (good.length !== 2 || bad.length !== 2) return null;

  const greeting = typeof r.greeting === 'string' ? r.greeting : '';
  if (!greeting) return null;

  const remedyRaw = r.remedy;
  if (!remedyRaw || typeof remedyRaw !== 'object') return null;
  const rem = remedyRaw as Record<string, unknown>;
  const kind = String(rem.kind ?? '');
  const allowedKinds = ['product', 'mantra', 'fast', 'donation', 'puja'] as const;
  if (!allowedKinds.includes(kind as (typeof allowedKinds)[number])) return null;

  const remedy: FromAstrologerRemedy = {
    kind: kind as FromAstrologerRemedy['kind'],
    title: String(rem.title ?? ''),
    description: String(rem.description ?? ''),
  };

  if (remedy.kind === 'product' && rem.product && typeof rem.product === 'object') {
    const p = rem.product as Record<string, unknown>;
    const name = typeof p.name === 'string' ? p.name : '';
    const query = typeof p.google_shopping_query === 'string' ? p.google_shopping_query : name;
    if (name) remedy.product = { name, google_shopping_query: query };
  }

  return {
    greeting,
    good: [good[0], good[1]] as [string, string],
    bad: [bad[0], bad[1]] as [string, string],
    remedy,
  };
}

// Re-export todayIST so cron / route handlers can derive consistent keys.
export { todayIST };
