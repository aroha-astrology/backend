import type { SupabaseClient } from '@supabase/supabase-js';
import { createAIMessage } from '@/lib/ai/aiProvider';
import { cacheSet } from '@/lib/redis';
import { todayIST } from './generate';
import { dateToJulianDay, calculatePlanetPositions } from '@aroha-astrology/astro-engine';
import { getAgeDemographic, buildToneRules } from '@/lib/ai/toneRouting';
import { VOICE_RULES } from '@/lib/ai/voiceRules';
import { buildLifeContext } from '@/lib/ai/buildLifeContext';

export type PersonalDailyReading = {
  headline?: string;
  summary?: [string, string, string];
  positive_points?: string[];
  issues?: string[];
  general: string;
  career: string;
  love: string;
  health: string;
  luckyColor?: string;
  luckyNumber?: number;
  luckyDirection?: string;
  remedy?: string;
  remedy_mantra?: string;
};

function tomorrowISTMidnight(): Date {
  // Get current IST time, advance to next day midnight, convert back to UTC
  const ist = new Date(Date.now() + 5.5 * 3600000);
  ist.setUTCHours(0, 0, 0, 0);
  ist.setUTCDate(ist.getUTCDate() + 1);
  return new Date(ist.getTime() - 5.5 * 3600000);
}

/**
 * Generate and persist a personalized daily reading for a given user + chart.
 * Uses the birth chart + current dasha + today's transits + report voice.
 * Stores result in feature_insights and Redis.
 * Returns the reading or null on failure.
 */
export async function generatePersonalDaily(
  supabase: SupabaseClient,
  params: {
    userId: string;
    chartId: string;
    reportId?: string | null;
    language?: string;
    reportAiContent?: Record<string, string> | null;
    profession?: string | null;
    maritalStatus?: string | null;
    financialStatus?: string | null;
    currentCity?: string | null;
  },
): Promise<PersonalDailyReading | null> {
  const { userId, chartId, reportId = null, language = 'en', profession, maritalStatus, financialStatus, currentCity } = params;
  const today = todayIST();

  // Fetch chart and today's transits in parallel
  const now = new Date();
  const [{ data: chart }, transitResult] = await Promise.all([
    supabase
      .from('kundli_charts')
      .select('chart_data, dasha_data, yoga_data, dosha_data, shadbala, birth_profiles(name, dob, pob, gender)')
      .eq('id', chartId)
      .eq('user_id', userId)
      .single(),
    (async () => {
      try {
        const jd = await dateToJulianDay(
          now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate(),
          now.getUTCHours(), now.getUTCMinutes(), 0,
        );
        const transitPlanets = await calculatePlanetPositions(jd, 'lahiri') as Array<{ planet: string; sign: string }>;
        return transitPlanets.map(p => `${p.planet}: ${p.sign}`).join(', ');
      } catch { return 'unavailable'; }
    })(),
  ]);

  if (!chart) return null;

  const transitSummary = transitResult;

  const profile = (Array.isArray(chart.birth_profiles) ? chart.birth_profiles[0] : chart.birth_profiles) as Record<string, unknown> | null;

  const cd = chart.chart_data as Record<string, unknown>;
  const planets = (cd?.planets ?? []) as Array<Record<string, unknown>>;
  const asc = cd?.ascendant as Record<string, unknown> | undefined;

  const planetSummary = planets
    .map(p => `${p.planet ?? p.name}: ${p.sign} H${p.house} ${p.nakshatra ?? ''}${p.isRetrograde ? '(R)' : ''}`)
    .join(', ');

  const dashaData = chart.dasha_data as Record<string, unknown> | undefined;
  const vim = dashaData?.vimshottari as Record<string, unknown> | undefined;
  const currentMD = vim?.currentMahadasha as Record<string, unknown> | undefined;
  const currentAD = vim?.currentAntardasha as Record<string, unknown> | undefined;
  const currentPD = vim?.currentPratyantardasha as Record<string, unknown> | undefined;

  const yogas = ((chart.yoga_data as Array<Record<string, unknown>>) ?? [])
    .filter(y => y.present || y.isPresent)
    .map(y => String(y.name))
    .slice(0, 5)
    .join(', ') || 'None';

  const doshas = Object.entries((chart.dosha_data ?? {}) as Record<string, unknown>)
    .filter(([, v]) => v && typeof v === 'object' && ((v as Record<string, unknown>).present || (v as Record<string, unknown>).isPresent))
    .map(([k]) => k)
    .join(', ') || 'None';

  // Strongest planets from Shadbala
  const shadData = chart.shadbala as Record<string, unknown> | undefined;
  const shadPlanets = (Array.isArray(shadData?.planets) ? shadData!.planets : Array.isArray(shadData?.data) ? shadData!.data : []) as Array<Record<string, unknown>>;
  const topPlanets = [...shadPlanets]
    .sort((a, b) => Number(b.totalVirupas ?? 0) - Number(a.totalVirupas ?? 0))
    .slice(0, 3)
    .map(p => String(p.planet ?? p.name))
    .join(', ') || 'unknown';

  // REPORTS_DISABLED: report voice removed — generation uses birth chart + dasha only
  const langLabel = language === 'hi' ? 'Hindi' : 'English';

  const demographic = getAgeDemographic(profile?.dob as string | undefined);
  const toneBlock = buildToneRules(demographic);

  const systemPrompt = `You are a legendary Vedic astrologer. Generate a PERSONALIZED daily reading for ${today} based on this person's birth chart. Write in ${langLabel}.

${VOICE_RULES}

${toneBlock}

Structure (positives first, then caution, then remedy):
Return ONLY valid JSON (no markdown fences):
{
  "headline": "<10-12 words — vivid, magnetic, personal — what today FEELS like for them>",
  "summary": ["<HOOK: 1-2 sentences about the day's dominant energy for this person>", "<NUANCE: the subtle cosmic reason — said simply, not technically>", "<ACTION: one concrete thing to do today>"],
  "positive_points": ["<real opportunity or strength they have today — specific to their life>", "<second positive — something to lean into>"],
  "issues": ["<one honest caution in plain human language — kind but real>"],
  "general": "<3 engaging story-like sentences about today's experience — what they'll feel, where energy flows>",
  "career": "<1 vivid sentence — what happens in work life today, not which house is active>",
  "love": "<1 vivid sentence — what happens in relationships today>",
  "health": "<1 vivid sentence — body/mind energy today>",
  "luckyColor": "<1 color>",
  "luckyNumber": <1-9>,
  "luckyDirection": "<cardinal direction>",
  "remedy": "<1 specific remedy — if a mantra, include the full mantra text on the next line. If gemstone, specify which finger. If donation, specify what.>",
  "remedy_mantra": "<full Sanskrit mantra text if remedy involves a mantra, else omit>"
}

If life context is provided below, use it for YOUR calibration only — weave it naturally into career/love/health/general. HARD rules:
- NEVER quote the user's profession, employer, or city verbatim. Do not name specific job titles ("Software Engineering", "Product Manager"); abstract to the SECTOR ("technical and analytical work", "people-facing leadership", "creative crafts") and write as though the chart revealed it.
- NEVER invent project, app, company, or colleague names, or specific past incidents.
- Speak in patterns the user will recognize, not as a readback of what they told us.
If absent, give universal but deeply specific advice.`;

  const lifeContextLines: string[] = [];
  if (currentCity) lifeContextLines.push(`Lives in: ${currentCity}`);
  if (profession) lifeContextLines.push(`Works as: ${profession}`);
  if (maritalStatus) {
    const label: Record<string, string> = {
      single: 'Single', dating: 'Dating / in a relationship', engaged: 'Engaged',
      married: 'Married', separated_divorced: 'Separated or divorced', widowed: 'Widowed',
    };
    lifeContextLines.push(`Relationship: ${label[maritalStatus] ?? maritalStatus}`);
  }
  if (financialStatus && financialStatus !== 'prefer_not_to_say') {
    const label: Record<string, string> = {
      tight: 'Financially tight', stable: 'Financially stable', comfortable: 'Financially comfortable',
    };
    lifeContextLines.push(`Financial: ${label[financialStatus] ?? financialStatus}`);
  }

  const lifeContextBlock = lifeContextLines.length > 0
    ? `\nLIFE CONTEXT (use sparingly, naturally):\n${lifeContextLines.join('\n')}`
    : '';

  // Apollo-derived enrichment — sector, seniority, career milestones with ages,
  // salary band. Strips company/college/city by construction. Best-effort.
  let enrichedContextBlock = '';
  try {
    const lc = await buildLifeContext(supabase, userId);
    enrichedContextBlock = `\n\nENRICHED PROFILE:\n${lc.promptBlock}`;
  } catch (err) {
    console.warn('[personalDaily] buildLifeContext failed', err);
  }

  const userMessage = `BIRTH CHART:
Name: ${profile?.name ?? 'User'}
Ascendant: ${asc?.sign ?? 'unknown'}
Planets: ${planetSummary}
Current Dasha: ${currentMD?.planet ?? '?'} MD / ${currentAD?.planet ?? '?'} AD / ${currentPD?.planet ?? '?'} PD
Active Yogas: ${yogas}
Active Doshas: ${doshas}
Strongest Planets: ${topPlanets}

TODAY'S TRANSITS (${today}):
${transitSummary}${lifeContextBlock}${enrichedContextBlock}

Generate today's personalized daily reading.`;

  const aiResponse = await createAIMessage({
    max_tokens: 600,
    temperature: 0.75,
    skipPersona: true,
    maxRetries: 2,
    jsonMode: true,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });

  const rawText = aiResponse.content.find(c => c.type === 'text')?.text ?? '{}';
  let reading: PersonalDailyReading | null = null;
  try {
    const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
    reading = JSON.parse(cleaned) as PersonalDailyReading;
  } catch { reading = null; }

  if (!reading?.general) return null;

  // Persist to feature_insights via upsert RPC (service role bypasses RLS)
  const expiresAt = tomorrowISTMidnight();
  const { error: rpcError } = await supabase.rpc('upsert_feature_insight', {
    p_user_id: userId,
    p_chart_id: chartId,
    p_feature_key: 'personal_daily',
    p_params_hash: today,
    p_language: language,
    p_source: 'lite_ai',
    p_source_version: 1,
    p_content: reading as unknown as Record<string, unknown>,
    p_report_id: reportId ?? null,
    p_expires_at: expiresAt.toISOString(),
  });
  if (rpcError) console.error('[personalDaily] upsert_feature_insight failed:', rpcError.message);

  // Warm Redis cache (1h — shorter than daily TTL, refreshes quietly)
  await cacheSet(`personal_daily:${chartId}:${today}:${language}`, reading, 3600);

  return reading;
}
