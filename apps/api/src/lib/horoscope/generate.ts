// Shared horoscope generation logic — used by both the cron and the API self-heal path.
import { createAdminSupabase } from '@/lib/supabase/admin';
import { createAIMessage } from '@/lib/ai/aiProvider';
import { cacheSet } from '@/lib/redis';
import { VOICE_RULES } from '@/lib/ai/voiceRules';
import { dateToJulianDay, calculatePlanetPositions } from '@aroha-astrology/astro-engine';

export const RASHIS = [
  'Mesha', 'Vrishabha', 'Mithuna', 'Karka', 'Simha', 'Kanya',
  'Tula', 'Vrischika', 'Dhanu', 'Makara', 'Kumbha', 'Meena',
] as const;

// Aligns 1:1 with calculatePlanetPositions() output (sidereal sign indices 0=Aries..11=Pisces).
// Index here matches each rashi: Mesha=Aries(0), Vrishabha=Taurus(1), etc.
const RASHI_TO_SIGN_INDEX: Record<typeof RASHIS[number], number> = {
  Mesha: 0, Vrishabha: 1, Mithuna: 2, Karka: 3, Simha: 4, Kanya: 5,
  Tula: 6, Vrischika: 7, Dhanu: 8, Makara: 9, Kumbha: 10, Meena: 11,
};

/**
 * Build a per-rashi transit summary for the target date.
 * For each rashi (treated as the 1st house), lists which house each transiting planet currently occupies.
 * This gives the LLM real ground truth to interpret instead of fabricating planet positions.
 */
async function buildTransitContext(targetDate: string): Promise<string> {
  // Compute at noon IST (12:00 local = 06:30 UTC). Slow planets barely move in a day; Moon's
  // sign is stable across most of the day except near sign changes, which is acceptable error.
  const [yyyy, mm, dd] = targetDate.split('-').map(Number);
  if (!yyyy || !mm || !dd) return '';
  const jd = await dateToJulianDay(yyyy, mm, dd, 12, 0, 5.5);
  const planets = await calculatePlanetPositions(jd, 'lahiri');

  // Universal positions header
  const header = planets
    .map(p => `${p.planet}: ${p.sign} ${p.signDegree.toFixed(1)}°${p.isRetrograde ? ' (R)' : ''}`)
    .join(', ');

  // Per-rashi house assignments — house = ((planet.signIndex - rashiIdx + 12) % 12) + 1
  const perRashiLines = (RASHIS as readonly string[]).map((rashi) => {
    const rashiIdx = RASHI_TO_SIGN_INDEX[rashi as typeof RASHIS[number]];
    const houses = planets
      .map(p => `${p.planet} H${((p.signIndex - rashiIdx + 12) % 12) + 1}${p.isRetrograde ? '(R)' : ''}`)
      .join(', ');
    return `- ${rashi}: ${houses}`;
  });

  return `\nSIDEREAL TRANSIT POSITIONS for ${targetDate} (Lahiri ayanamsa, computed 12:00 IST):
${header}

PER-RASHI HOUSE TRANSITS (each rashi treated as the 1st house — DO NOT invent or change these):
${perRashiLines.join('\n')}\n`;
}

export const HOROSCOPE_TTL = 86400 * 2; // 48h — survives brief Redis restarts

export function todayIST(offsetDays = 0): string {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  ist.setDate(ist.getDate() + offsetDays);
  return ist.toISOString().split('T')[0];
}

function parseAIJson(raw: string): Record<string, unknown> {
  let text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  const start = text.indexOf('{');
  if (start > 0) text = text.slice(start);
  const end = text.lastIndexOf('}');
  if (end !== -1 && end < text.length - 1) text = text.slice(0, end + 1);
  try {
    return JSON.parse(text);
  } catch {
    try { return JSON.parse(text.replace(/,\s*([}\]])/g, '$1')); } catch { return {}; }
  }
}

export async function generateAndStore(
  targetDate: string,
  language: string,
  supabase: ReturnType<typeof createAdminSupabase>,
): Promise<number> {
  const langLabel = language === 'hi' ? 'Hindi' : 'English';

  // Compute real transit positions so the LLM interprets actual data instead of fabricating it.
  // Falls back to no-context if ephemeris fails so generation still succeeds.
  let transitContext = '';
  try {
    transitContext = await buildTransitContext(targetDate);
  } catch (err) {
    console.warn(`[horoscope/generate] transit computation failed for ${targetDate}, falling back to no-context generation:`, err);
  }

  const message = await createAIMessage({
    max_tokens: 4000,
    temperature: 0.7,
    skipPersona: true,
    maxRetries: 2,
    system: `You are a Vedic astrologer. Generate daily horoscopes for all 12 Moon signs (Rashis) for ${targetDate}. Write in ${langLabel}.

${VOICE_RULES}
${transitContext}
GROUNDING (NON-NEGOTIABLE): Use ONLY the transit data above. For each rashi, the planet→house mapping shown is the FACT for today — translate those house transits into life themes (e.g., a planet in H10 = career focus; H4 = home/family emphasis; H7 = relationships; H2 = money/speech; H5 = creativity/children; H6 = health/work; H8 = transformation; H12 = rest/expense). Do NOT invent or change a planet's house. Do NOT name a yoga or aspect that isn't supported by the listed transits.

Focus on translating today's transits into what the person will FEEL and EXPERIENCE — work, relationships, energy, decisions. Quote the relevant planet→house transit briefly (e.g., "with the Moon in your 4th house today...") rather than abstract cosmic mechanics.

Structure for EACH rashi:
- "summary": [HOOK, NUANCE, ACTION] — 3 strings, 1-2 short sentences each. HOOK=the day's dominant feeling. NUANCE=the subtle why (cosmic or intuitive). ACTION=one concrete thing to do.
- "positive_points": 2 short strings — real-life opportunities or strengths active today.
- "issues": 1 short string — one honest caution in plain human terms ([] if fully positive).
- "remedy": 1 practical Vedic action — specific and doable (mantra, colour, food, donation).
- "remedy_mantra": if remedy involves a mantra, include the full Sanskrit mantra text here (else omit or "").
- "general": 2 engaging sentences about the day's energy — story-like, not technical.
- "career","love","health": 1 vivid sentence each — what the person will experience, not planetary mechanics.
- "luckyColor","luckyNumber","luckyDirection","rating": as usual.

Respond as a single valid JSON object with lowercase rashi names as keys:
{"mesha":{"summary":["hook","nuance","action"],"positive_points":["...","..."],"issues":["..."],"remedy":"...","general":"...","career":"...","love":"...","health":"...","luckyColor":"...","luckyNumber":5,"luckyDirection":"North","rating":7},"vrishabha":{...},"mithuna":{...},"karka":{...},"simha":{...},"kanya":{...},"tula":{...},"vrischika":{...},"dhanu":{...},"makara":{...},"kumbha":{...},"meena":{...}}
Return ONLY valid JSON, no markdown fences or commentary.`,
    messages: [{ role: 'user', content: `All 12 daily horoscopes for ${targetDate}` }],
  });

  const textContent = message.content.find((c) => c.type === 'text');
  const parsed = textContent?.type === 'text' ? parseAIJson(textContent.text) : {};

  const all: Record<string, Record<string, unknown>> = {};
  for (const [k, v] of Object.entries(parsed)) {
    if (v && typeof v === 'object') all[k.toLowerCase()] = v as Record<string, unknown>;
  }

  const count = Object.keys(all).length;
  if (count === 0) {
    console.error(`[horoscope/generate] AI returned 0 rashis for ${targetDate} (${language})`);
    return 0;
  }

  for (const rashi of RASHIS) {
    const lower = rashi.toLowerCase();
    const content = all[lower];
    if (!content) continue;
    await supabase.from('daily_horoscopes').upsert(
      { rashi, date: targetDate, language, content },
      { onConflict: 'rashi,date,language' },
    );
    await cacheSet(`horoscope:daily:${lower}:${targetDate}:${language}`, content, HOROSCOPE_TTL);
  }

  await cacheSet(`horoscope:daily:all:${targetDate}:${language}`, all, HOROSCOPE_TTL);
  console.log(`[horoscope/generate] ✓ ${count} rashis stored for ${targetDate} (${language})`);
  return count;
}
