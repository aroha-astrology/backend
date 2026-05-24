// Unified monthly cosmic snapshot generator.
//
// One snapshot per (year, month, language) — same for every user. Composes:
//   • panchang grid (deterministic, astro-engine)
//   • transits: ingresses + retrogrades (deterministic, astro-engine)
//   • muhurta windows per purpose (deterministic, astro-engine)
//   • per-rashi horoscope (single LLM call, grounded on this month's actual
//     ingresses so "keyDates" reflect real planetary events)
//
// Output goes to `monthly_snapshot` (year, month, language, data jsonb) and a
// 33-day Redis cache key (`monthly:snapshot:<year>:<month>:<lang>`).
import { createAdminSupabase } from '@/lib/supabase/admin';
import { createAIMessage } from '@/lib/ai/aiProvider';
import { cacheSet } from '@/lib/redis';
import { VOICE_RULES } from '@/lib/ai/voiceRules';
import { dateToJulianDay, calculatePlanetPositions, calculateChart, calculateFullPanchang } from '@aroha-astrology/astro-engine';
import { computeMonthlyTransits, type MonthlyTransits } from './computeTransits';
import { computeMonthlyMuhurtas, type MonthlyMuhurtas } from './computeMuhurtas';

export const RASHIS = [
  'Mesha', 'Vrishabha', 'Mithuna', 'Karka', 'Simha', 'Kanya',
  'Tula', 'Vrischika', 'Dhanu', 'Makara', 'Kumbha', 'Meena',
] as const;
export type Rashi = typeof RASHIS[number];

const RASHI_INDEX: Record<Rashi, number> = {
  Mesha: 0, Vrishabha: 1, Mithuna: 2, Karka: 3, Simha: 4, Kanya: 5,
  Tula: 6, Vrischika: 7, Dhanu: 8, Makara: 9, Kumbha: 10, Meena: 11,
};

export const MONTHLY_SNAPSHOT_TTL = 86400 * 33; // 33 days

const INDIA_LAT = 20.5937;
const INDIA_LNG = 78.9629;

const VARA_NAMES = [
  'Ravivaar (Sunday)',
  'Somvaar (Monday)',
  'Mangalvaar (Tuesday)',
  'Budhvaar (Wednesday)',
  'Guruvaar (Thursday)',
  'Shukravaar (Friday)',
  'Shanivaar (Saturday)',
];

export interface PanchangDay {
  date: string;
  day: number;
  weekday: number;
  tithi: string;
  tithiName: string;
  tithiNumber: number;
  paksha: 'Shukla' | 'Krishna' | null;
  nakshatra: string;
  nakshatraName: string;
  vara: string;
  isFullMoon: boolean;
  isNewMoon: boolean;
  isEkadashi: boolean;
}

export interface RashiHoroscope {
  summary: [string, string, string];
  theme: string;
  weeks: { weekNumber: number; dateRange: string; prediction: string; keyDates: { date: string; event: string }[] }[];
  ratings: { area: string; rating: number }[];
  remedy: string;
  remedy_mantra?: string;
  luckyColor: string;
  luckyNumber: number;
  luckyDirection: string;
}

export interface MonthlySnapshotData {
  year: number;
  month: number;
  monthName: string;
  language: string;
  generated_at: string;
  panchang: PanchangDay[];
  transits: MonthlyTransits;
  muhurtas: MonthlyMuhurtas;
  horoscopes: Record<string, RashiHoroscope>; // keyed by lowercase rashi
}

// ---------------------------------------------------------------------------
// Panchang grid (lightweight version of /api/panchang/month, India centre)
// ---------------------------------------------------------------------------

function parseTithi(s: string): { paksha: 'Shukla' | 'Krishna' | null; name: string; number: number } {
  const m = s.match(/^(Shukla|Krishna)\s+(.+?)\s+\((\d+)\)$/);
  if (!m) return { paksha: null, name: s, number: 0 };
  return { paksha: m[1] as 'Shukla' | 'Krishna', name: m[2], number: parseInt(m[3], 10) };
}

async function computePanchangDay(date: Date): Promise<PanchangDay> {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  const weekday = date.getUTCDay();

  const chart = await calculateChart(year, month, day, 6, 0, 5.5, INDIA_LAT, INDIA_LNG, 'lahiri', 'W');
  const sun = chart.planets.find((p) => p.planet === 'Sun')!;
  const moon = chart.planets.find((p) => p.planet === 'Moon')!;
  const panchang = calculateFullPanchang(date, INDIA_LAT, INDIA_LNG, sun.longitude, moon.longitude);

  const tithiRaw = `${panchang.tithi.paksha} ${panchang.tithi.name} (${panchang.tithi.number})`;
  const nakshatraRaw = `${panchang.nakshatra.name} Pada ${panchang.nakshatra.pada} (${panchang.nakshatra.lord})`;
  const t = parseTithi(tithiRaw);

  return {
    date: date.toISOString().split('T')[0],
    day,
    weekday,
    tithi: tithiRaw,
    tithiName: t.name,
    tithiNumber: t.number,
    paksha: t.paksha,
    nakshatra: nakshatraRaw,
    nakshatraName: nakshatraRaw.split(' Pada')[0],
    vara: VARA_NAMES[weekday],
    isFullMoon: t.name === 'Purnima',
    isNewMoon: t.name === 'Amavasya',
    isEkadashi: t.name === 'Ekadashi',
  };
}

async function computePanchangGrid(year: number, month: number): Promise<PanchangDay[]> {
  const daysInMonth = new Date(year, month, 0).getDate();
  const jobs: Promise<PanchangDay>[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    jobs.push(computePanchangDay(new Date(Date.UTC(year, month - 1, d))));
  }
  return Promise.all(jobs);
}

// ---------------------------------------------------------------------------
// LLM horoscope prompt
// ---------------------------------------------------------------------------

function parseAIJson(raw: string): Record<string, unknown> {
  let text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  const s = text.indexOf('{'); if (s > 0) text = text.slice(s);
  const e = text.lastIndexOf('}'); if (e !== -1 && e < text.length - 1) text = text.slice(0, e + 1);
  try { return JSON.parse(text); } catch {
    try { return JSON.parse(text.replace(/,\s*([}\]])/g, '$1')); } catch { return {}; }
  }
}

function weekRanges(year: number, month: number): { weekNumber: number; dateRange: string }[] {
  const daysInMonth = new Date(year, month, 0).getDate();
  const monthName = new Date(year, month - 1, 1).toLocaleString('en-US', { month: 'long' });
  return [
    { weekNumber: 1, dateRange: `1–7 ${monthName}` },
    { weekNumber: 2, dateRange: `8–15 ${monthName}` },
    { weekNumber: 3, dateRange: `16–22 ${monthName}` },
    { weekNumber: 4, dateRange: `23–${daysInMonth} ${monthName}` },
  ];
}

// For each rashi, restate this month's ingresses with the house they happen in.
// Gives the LLM real anchors so keyDates aren't fabricated.
function ingressContextForRashi(rashi: Rashi, transits: MonthlyTransits): string[] {
  const rashiIdx = RASHI_INDEX[rashi];
  return transits.ingresses.map((ig) => {
    const toIdx = RASHIS.indexOf(ig.toSign as Rashi);
    if (toIdx < 0) return '';
    const house = ((toIdx - rashiIdx + 12) % 12) + 1;
    return `${ig.date}: ${ig.planet} enters ${ig.toSign} (your H${house})`;
  }).filter(Boolean);
}

async function generateHoroscopes(
  year: number,
  month: number,
  language: string,
  transits: MonthlyTransits,
): Promise<Record<string, RashiHoroscope>> {
  const monthName = new Date(year, month - 1, 1).toLocaleString('en-US', { month: 'long' });
  const weeks = weekRanges(year, month);
  const langLabel = language === 'hi' ? 'Hindi' : 'English';

  // Per-rashi grounding block — same ingresses, but house each ingress happens in
  // differs per rashi.
  const groundingBlocks = RASHIS.map((rashi) => {
    const lines = ingressContextForRashi(rashi, transits);
    return `- ${rashi}:\n    ${lines.length ? lines.join('\n    ') : '(no major ingresses this month)'}`;
  }).join('\n');

  const message = await createAIMessage({
    max_tokens: 8000,
    temperature: 0.7,
    skipPersona: true,
    maxRetries: 2,
    system: `You are a Vedic astrologer generating the monthly horoscope for all 12 Moon signs (Rashis) for ${monthName} ${year}. Write in ${langLabel}.

${VOICE_RULES}

MONTH-LEVEL PLANETARY EVENTS (use as ground truth, do not invent others):
${transits.notes.length ? transits.notes.map((n) => '• ' + n).join('\n') : '• (no major outer-planet ingresses or retrogrades this month — focus on Moon cycle themes)'}

PER-RASHI INGRESSES WITH HOUSE (treat each rashi as its own 1st house):
${groundingBlocks}

For EACH rashi, return:
- "summary": ARRAY of EXACTLY THREE STRINGS — [HOOK, NUANCE, ACTION], 1-2 short sentences each.
- "theme": one engaging sentence describing the month's dominant texture.
- "weeks": ARRAY of 4 objects [{"weekNumber":1,"dateRange":"${weeks[0].dateRange}","prediction":"2-3 sentences for week 1","keyDates":[{"date":"YYYY-MM-DD","event":"short 5-8 word event"}]}, ... for weeks 2, 3, 4]. The dateRange MUST match exactly: ${weeks.map((w) => `week ${w.weekNumber}="${w.dateRange}"`).join(', ')}. keyDates MUST be drawn from the ingress dates listed above for THIS rashi — do NOT invent dates. If a week has no ingress, return "keyDates": [].
- "ratings": ARRAY of 5 objects [{"area":"career","rating":N}, {"area":"love","rating":N}, {"area":"health","rating":N}, {"area":"finance","rating":N}, {"area":"family","rating":N}], rating is integer 1-5.
- "remedy": one specific practical Vedic action (mantra, colour, donation, food).
- "remedy_mantra": Sanskrit mantra if remedy is mantra-based, else "".
- "luckyColor", "luckyNumber" (int 1-9), "luckyDirection".

Respond as a single JSON object keyed by lowercase rashi name:
{"mesha":{...},"vrishabha":{...},...,"meena":{...}}
Return ONLY valid JSON, no markdown fences or commentary.`,
    messages: [{ role: 'user', content: `Monthly horoscopes for all 12 rashis, ${monthName} ${year}.` }],
  });

  const textContent = message.content.find((c) => c.type === 'text');
  const parsed = textContent?.type === 'text' ? parseAIJson(textContent.text) : {};

  const out: Record<string, RashiHoroscope> = {};
  for (const rashi of RASHIS) {
    const lower = rashi.toLowerCase();
    const block = parsed[lower];
    if (block && typeof block === 'object') {
      out[lower] = normalizeRashi(block as Record<string, unknown>, weeks);
    }
  }
  return out;
}

// Normalize / harden whatever the LLM returned into the schema the page needs.
// Missing fields get safe defaults so the UI never crashes on a stray null.
function normalizeRashi(
  raw: Record<string, unknown>,
  weeks: { weekNumber: number; dateRange: string }[],
): RashiHoroscope {
  const summaryArr = Array.isArray(raw.summary) ? (raw.summary as unknown[]).map(String) : [];
  const summary: [string, string, string] = [
    summaryArr[0] ?? '',
    summaryArr[1] ?? '',
    summaryArr[2] ?? '',
  ];

  const rawWeeks = Array.isArray(raw.weeks) ? (raw.weeks as Record<string, unknown>[]) : [];
  const filledWeeks = weeks.map((w) => {
    const found = rawWeeks.find((rw) => Number(rw.weekNumber) === w.weekNumber) ?? rawWeeks[w.weekNumber - 1];
    const keyDates = Array.isArray(found?.keyDates)
      ? (found!.keyDates as Record<string, unknown>[]).map((kd) => ({
          date: String(kd.date ?? ''),
          event: String(kd.event ?? ''),
        })).filter((kd) => kd.date && kd.event)
      : [];
    return {
      weekNumber: w.weekNumber,
      dateRange: String(found?.dateRange ?? w.dateRange),
      prediction: String(found?.prediction ?? ''),
      keyDates,
    };
  });

  const rawRatings = Array.isArray(raw.ratings) ? (raw.ratings as Record<string, unknown>[]) : [];
  const areas = ['career', 'love', 'health', 'finance', 'family'];
  const ratings = areas.map((area) => {
    const found = rawRatings.find((r) => String(r.area).toLowerCase() === area);
    const n = Number(found?.rating ?? raw[area]);
    return { area, rating: Number.isFinite(n) ? Math.max(1, Math.min(5, Math.round(n))) : 3 };
  });

  return {
    summary,
    theme: String(raw.theme ?? ''),
    weeks: filledWeeks,
    ratings,
    remedy: String(raw.remedy ?? ''),
    remedy_mantra: typeof raw.remedy_mantra === 'string' ? raw.remedy_mantra : '',
    luckyColor: String(raw.luckyColor ?? raw.lucky_color ?? ''),
    luckyNumber: Number(raw.luckyNumber ?? raw.lucky_number ?? 0) || 0,
    luckyDirection: String(raw.luckyDirection ?? raw.lucky_direction ?? ''),
  };
}

// ---------------------------------------------------------------------------
// Moon phases — derived from the panchang grid (Purnima/Amavasya).
// ---------------------------------------------------------------------------

function moonPhasesFromPanchang(panchang: PanchangDay[]): MonthlyTransits['moonPhases'] {
  const phases: MonthlyTransits['moonPhases'] = [];
  for (const d of panchang) {
    if (d.isFullMoon) phases.push({ date: d.date, type: 'full_moon' });
    if (d.isNewMoon) phases.push({ date: d.date, type: 'new_moon' });
  }
  return phases;
}

// ---------------------------------------------------------------------------
// Public entrypoint
// ---------------------------------------------------------------------------

type AdminSupabase = ReturnType<typeof createAdminSupabase>;

/**
 * Build and persist the monthly snapshot. Returns the data that was written.
 * If `force` is false and a snapshot already exists in DB, returns it as-is.
 */
export async function generateMonthlySnapshot(
  year: number,
  month: number,
  language: string,
  supabase: AdminSupabase,
  { force = false }: { force?: boolean } = {},
): Promise<MonthlySnapshotData> {
  if (!force) {
    const { data } = await supabase
      .from('monthly_snapshot')
      .select('data')
      .eq('year', year).eq('month', month).eq('language', language)
      .maybeSingle();
    if (data?.data) {
      const cached = data.data as MonthlySnapshotData;
      await cacheSet(`monthly:snapshot:${year}:${month}:${language}`, cached, MONTHLY_SNAPSHOT_TTL);
      return cached;
    }
  }

  console.log(`[monthly/generate] building ${year}-${String(month).padStart(2, '0')} (${language})`);

  // Deterministic pieces in parallel — they only need (year, month).
  const [panchang, transits, muhurtas] = await Promise.all([
    computePanchangGrid(year, month),
    computeMonthlyTransits(year, month),
    Promise.resolve(computeMonthlyMuhurtas(year, month)),
  ]);
  transits.moonPhases = moonPhasesFromPanchang(panchang);

  // Add moon-phase highlights into the LLM notes so the horoscope can reference them.
  for (const ph of transits.moonPhases) {
    transits.notes.push(`${ph.type === 'full_moon' ? 'Full Moon' : 'New Moon'} on ${ph.date}.`);
  }

  const horoscopes = await generateHoroscopes(year, month, language, transits);

  const monthName = new Date(year, month - 1, 1).toLocaleString('en-US', { month: 'long' });
  const data: MonthlySnapshotData = {
    year, month, monthName, language,
    generated_at: new Date().toISOString(),
    panchang,
    transits,
    muhurtas,
    horoscopes,
  };

  await supabase.from('monthly_snapshot').upsert(
    { year, month, language, data, updated_at: new Date().toISOString() },
    { onConflict: 'year,month,language' },
  );
  await cacheSet(`monthly:snapshot:${year}:${month}:${language}`, data, MONTHLY_SNAPSHOT_TTL);

  const horoscopeCount = Object.keys(horoscopes).length;
  console.log(`[monthly/generate] ✓ ${year}-${String(month).padStart(2, '0')} (${language}) — ${panchang.length} panchang days, ${transits.ingresses.length} ingresses, ${horoscopeCount} rashis`);
  return data;
}
