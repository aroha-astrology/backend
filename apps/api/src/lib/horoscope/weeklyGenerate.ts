// Shared weekly horoscope generation — used by both the on-demand POST route
// and the Saturday-night cron batch. One Claude call per (rashi, language),
// upserted into daily_horoscopes with a synthetic `weekly_<rashi>` key keyed
// on the Monday of the target week.
import type { createAdminSupabase } from '@/lib/supabase/admin';
import { createAIMessage } from '@/lib/ai/aiProvider';
import { VOICE_RULES } from '@/lib/ai/voiceRules';

type AdminSupabase = ReturnType<typeof createAdminSupabase>;

export const WEEKLY_RASHIS = [
  'Mesha', 'Vrishabha', 'Mithuna', 'Karka', 'Simha', 'Kanya',
  'Tula', 'Vrischika', 'Dhanu', 'Makara', 'Kumbha', 'Meena',
] as const;

export interface WeekBounds {
  weekStart: string; // YYYY-MM-DD (Monday)
  weekEnd: string;   // YYYY-MM-DD (Sunday)
  monday: Date;
}

/**
 * Returns the Mon–Sun bounds of the week containing `reference` (IST-aware).
 * Pass `offsetWeeks=1` to get the week after, etc. Cron callers pass +1 on
 * Saturday night so the next Monday's run starts pre-filled.
 */
export function weekBoundsIST(reference: Date = new Date(), offsetWeeks = 0): WeekBounds {
  const ist = new Date(reference.getTime() + 5.5 * 60 * 60 * 1000);
  const day = ist.getUTCDay(); // 0 = Sun, 1 = Mon, ... 6 = Sat
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(ist);
  monday.setUTCDate(ist.getUTCDate() + mondayOffset + offsetWeeks * 7);
  monday.setUTCHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const fmt = (d: Date) => d.toISOString().split('T')[0];
  return { weekStart: fmt(monday), weekEnd: fmt(sunday), monday };
}

function parseAIJson(raw: string): Record<string, unknown> {
  let text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  const s = text.indexOf('{'); if (s > 0) text = text.slice(s);
  const e = text.lastIndexOf('}'); if (e !== -1 && e < text.length - 1) text = text.slice(0, e + 1);
  try { return JSON.parse(text); } catch {
    try { return JSON.parse(text.replace(/,\s*([}\]])/g, '$1')); } catch { return {}; }
  }
}

export interface WeeklyContent {
  summary?: [string, string, string];
  overview?: string;
  daily_highlights?: { day: string; highlight: string }[];
  lucky_day?: string;
  challenging_day?: string;
  career?: string;
  relationships?: string;
  health?: string;
  remedy_of_the_week?: string;
}

/**
 * Generate a weekly horoscope for one rashi/language and upsert it.
 * Cache key = (rashi=`weekly_<rashi>`, date=weekStart, language).
 * Returns the generated content (or the cached row if present).
 */
export async function generateWeeklyAndStore(
  rashi: string,
  language: string,
  bounds: WeekBounds,
  supabase: AdminSupabase,
  { force = false }: { force?: boolean } = {},
): Promise<WeeklyContent | null> {
  const lang = language || 'en';
  const cacheKey = `weekly_${rashi}_${bounds.weekStart}_${lang}`;

  if (!force) {
    const { data: cached } = await supabase
      .from('daily_horoscopes')
      .select('content')
      .eq('rashi', cacheKey)
      .eq('date', bounds.weekStart)
      .eq('language', lang)
      .maybeSingle();
    if (cached?.content) return cached.content as WeeklyContent;
  }

  const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const dayDates = dayNames.map((name, i) => {
    const d = new Date(bounds.monday);
    d.setUTCDate(bounds.monday.getUTCDate() + i);
    return `${name} (${d.toISOString().split('T')[0]})`;
  });

  const message = await createAIMessage({
    max_tokens: 3000,
    temperature: 0.7,
    skipPersona: true,
    maxRetries: 2,
    system: `You are a Vedic astrologer writing a weekly horoscope for ${rashi} Moon sign for the week of ${bounds.weekStart} to ${bounds.weekEnd}. ${lang === 'hi' ? 'Write in Hindi.' : 'Write in English.'}

${VOICE_RULES}

Provide a 7-day breakdown with daily tips based on current planetary transits.

The "summary" field is an ARRAY OF EXACTLY THREE STRINGS — [HOOK, NUANCE, ACTION]:
  [0] HOOK — 1–2 short sentences naming what is most alive for ${rashi} this week.
  [1] NUANCE — 1–2 short sentences with the planetary why (transits/dasha).
  [2] ACTION — 1–2 short sentences with one concrete thing to do this week.
Short sentences only. No headers, no bullets.

Respond as valid JSON:
{
  "summary": ["hook sentence", "nuance sentence", "action sentence"],
  "overview": "2-3 sentence weekly overview",
  "daily_highlights": [
    {"day": "${dayDates[0]}", "highlight": "1-2 sentence highlight and tip for this day"},
    {"day": "${dayDates[1]}", "highlight": "..."},
    {"day": "${dayDates[2]}", "highlight": "..."},
    {"day": "${dayDates[3]}", "highlight": "..."},
    {"day": "${dayDates[4]}", "highlight": "..."},
    {"day": "${dayDates[5]}", "highlight": "..."},
    {"day": "${dayDates[6]}", "highlight": "..."}
  ],
  "lucky_day": "Day name",
  "challenging_day": "Day name",
  "career": "2-3 sentences on career this week",
  "relationships": "2-3 sentences on relationships this week",
  "health": "2-3 sentences on health this week",
  "remedy_of_the_week": "One specific remedy to follow this week"
}
Return ONLY valid JSON, no markdown fences or commentary.`,
    messages: [{ role: 'user', content: `Weekly horoscope for ${rashi}, week of ${bounds.weekStart} to ${bounds.weekEnd}` }],
  });

  const textContent = message.content.find((c) => c.type === 'text');
  let content: WeeklyContent = {};
  if (textContent && textContent.type === 'text') {
    const parsed = parseAIJson(textContent.text);
    if (parsed && Object.keys(parsed).length > 0) {
      content = parsed as WeeklyContent;
    } else {
      content = {
        overview: textContent.text,
        daily_highlights: [],
        lucky_day: '',
        challenging_day: '',
        career: '',
        relationships: '',
        health: '',
        remedy_of_the_week: '',
      };
    }
  }

  await supabase.from('daily_horoscopes').upsert(
    { rashi: cacheKey, date: bounds.weekStart, language: lang, content },
    { onConflict: 'rashi,date,language' },
  );

  return content;
}
