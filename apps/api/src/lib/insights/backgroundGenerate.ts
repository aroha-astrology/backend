/**
 * Background generation — sweeps all users with charts and pre-generates:
 *   1. personal_daily   → feature_insights + Redis
 *   2. life_journey     → life_journey_insights (Career, Love, Money, Health)
 *   3. predictions_daily → feature_insights
 *
 * Called by the daily cron at /api/cron/auto-generate.
 * Processes up to `batchSize` users per invocation; rotate via `offset`.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { createAIMessage } from '@/lib/ai/aiProvider';
import { cacheSet } from '@/lib/redis';
import { todayIST } from '@/lib/horoscope/generate';
import { VOICE_RULES } from '@/lib/ai/voiceRules';
import { generatePersonalDaily } from '@/lib/horoscope/personalDailyGenerate';
import { generateAreaInsight, type InsightContext } from '@/lib/ai/lifeJourneyEvents';
import { getAgeDemographic, buildToneRules } from '@/lib/ai/toneRouting';

const LIFE_JOURNEY_AREAS = ['Career', 'Love', 'Money', 'Health'] as const;

const PLANET_THEME: Record<string, string> = {
  Ketu:    'detachment, spiritual insight, past karma clearing',
  Venus:   'romantic relationships, artistic pursuits, financial gains',
  Sun:     'identity, career recognition, authority',
  Moon:    'emotional sensitivity, home life, domestic changes',
  Mars:    'physical energy, conflicts, ambition',
  Rahu:    'unconventional choices, sudden changes, obsessive pursuits',
  Jupiter: 'higher education, spiritual growth, wealth expansion',
  Saturn:  'hard work, delays, career foundations, karmic debts',
  Mercury: 'intellectual pursuits, business, communication',
};

// ─── Types ───────────────────────────────────────────────────────────────────

interface UserChartRow {
  userId: string;
  chartId: string;
  language: string;
  profession: string | null;
  maritalStatus: string | null;
  financialStatus: string | null;
  currentCity: string | null;
  dob: string | null;
  chartData: Record<string, unknown>;
  dashaData: Record<string, unknown>;
  yogaData: unknown[];
  doshaData: Record<string, unknown>;
  name: string;
}

// ─── Sweep: fetch all users with primary chart ─────────────────────────────

export async function sweepUsersWithCharts(
  supabase: SupabaseClient,
  batchSize = 20,
  offset = 0,
): Promise<UserChartRow[]> {
  const { data: rows } = await supabase
    .from('kundli_charts')
    .select(`
      id,
      user_id,
      chart_data,
      dasha_data,
      yoga_data,
      dosha_data,
      birth_profiles!inner(name, dob),
      users!inner(language, profession, marital_status, financial_status, current_city)
    `)
    .order('created_at', { ascending: false })
    .range(offset, offset + batchSize - 1);

  if (!rows?.length) return [];

  return rows.map(r => {
    const profile = Array.isArray(r.birth_profiles) ? r.birth_profiles[0] : r.birth_profiles;
    const user = Array.isArray(r.users) ? r.users[0] : r.users;
    return {
      userId: r.user_id as string,
      chartId: r.id as string,
      language: (user as Record<string, unknown>)?.language as string ?? 'en',
      profession: (user as Record<string, unknown>)?.profession as string | null ?? null,
      maritalStatus: (user as Record<string, unknown>)?.marital_status as string | null ?? null,
      financialStatus: (user as Record<string, unknown>)?.financial_status as string | null ?? null,
      currentCity: (user as Record<string, unknown>)?.current_city as string | null ?? null,
      dob: (profile as Record<string, unknown>)?.dob as string | null ?? null,
      name: (profile as Record<string, unknown>)?.name as string ?? 'User',
      chartData: r.chart_data as Record<string, unknown>,
      dashaData: r.dasha_data as Record<string, unknown>,
      yogaData: r.yoga_data as unknown[],
      doshaData: r.dosha_data as Record<string, unknown>,
    };
  });
}

// ─── 1. Personal Daily ────────────────────────────────────────────────────

async function generatePersonalDailyForUser(
  supabase: SupabaseClient,
  row: UserChartRow,
): Promise<boolean> {
  try {
    const today = todayIST();
    // Check if already generated today
    const { data: existing } = await supabase
      .from('feature_insights')
      .select('id')
      .eq('user_id', row.userId)
      .eq('chart_id', row.chartId)
      .eq('feature_key', 'personal_daily')
      .eq('params_hash', today)
      .eq('language', row.language)
      .maybeSingle();
    if (existing) return true;

    const reading = await generatePersonalDaily(supabase, {
      userId: row.userId,
      chartId: row.chartId,
      language: row.language,
      profession: row.profession,
      maritalStatus: row.maritalStatus,
      financialStatus: row.financialStatus,
      currentCity: row.currentCity,
    });
    return !!reading;
  } catch (e) {
    console.error(`[bg] personal_daily failed for ${row.chartId}:`, e);
    return false;
  }
}

// ─── 2. Life Journey (4 areas) ───────────────────────────────────────────

async function generateLifeJourneyForUser(
  supabase: SupabaseClient,
  row: UserChartRow,
): Promise<number> {
  const dashaData = row.dashaData;
  const vimshottari = (dashaData?.vimshottari ?? {}) as Record<string, unknown>;
  const currentMD = vimshottari.currentMahadasha as Record<string, unknown> | undefined;
  const currentAD = vimshottari.currentAntardasha as Record<string, unknown> | undefined;

  const mdPlanet = (currentMD?.planet as string) ?? 'Jupiter';
  const adPlanet = (currentAD?.planet as string) ?? mdPlanet;
  const adStart = (currentAD?.startDate as string) ?? '';
  const adEnd = (currentAD?.endDate as string) ?? '';

  const planets = (row.chartData?.planets ?? []) as Array<Record<string, unknown>>;
  const asc = row.chartData?.ascendant as Record<string, unknown> | undefined;
  const planetSummary = planets.slice(0, 7).map(p => `${p.planet}: ${p.sign} H${p.house}`).join(', ');
  const firstName = row.name.split(' ')[0];

  const adStartFmt = adStart ? new Date(adStart).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }) : '—';
  const adEndFmt = adEnd ? new Date(adEnd).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }) : '—';

  let generated = 0;
  for (const area of LIFE_JOURNEY_AREAS) {
    try {
      // Skip if already cached for this MD/AD
      const { data: existing } = await supabase
        .from('life_journey_insights')
        .select('id')
        .eq('chart_id', row.chartId)
        .eq('mahadasha_planet', mdPlanet)
        .eq('antardasha_planet', adPlanet)
        .eq('area', area)
        .maybeSingle();
      if (existing) { generated++; continue; }

      const ctx: InsightContext = {
        name: firstName,
        mahadashaPlanet: mdPlanet,
        mahadashaPlanetTheme: PLANET_THEME[mdPlanet] ?? '',
        antardashaPlanet: adPlanet,
        antardashaPlanetTheme: PLANET_THEME[adPlanet] ?? '',
        area,
        adStartDate: adStartFmt,
        adEndDate: adEndFmt,
        ascendantSign: asc?.sign as string | undefined,
        planetSummary,
        dob: row.dob,
      };

      const insight = await generateAreaInsight(ctx);
      if (!insight) continue;

      await supabase.from('life_journey_insights').upsert({
        user_id: row.userId,
        chart_id: row.chartId,
        mahadasha_planet: mdPlanet,
        antardasha_planet: adPlanet,
        area,
        title: insight.title,
        story: insight.story,
        do_items: insight.doItems,
        avoid_items: insight.avoidItems,
      }, { onConflict: 'chart_id,mahadasha_planet,antardasha_planet,area' });

      generated++;
    } catch (e) {
      console.error(`[bg] life_journey ${area} failed for ${row.chartId}:`, e);
    }
  }
  return generated;
}

// ─── 3. Daily Predictions ────────────────────────────────────────────────

async function generatePredictionsForUser(
  supabase: SupabaseClient,
  row: UserChartRow,
): Promise<boolean> {
  try {
    const today = todayIST();
    const { data: existing } = await supabase
      .from('feature_insights')
      .select('id')
      .eq('user_id', row.userId)
      .eq('chart_id', row.chartId)
      .eq('feature_key', 'predictions_daily')
      .eq('params_hash', today)
      .eq('language', row.language)
      .maybeSingle();
    if (existing) return true;

    const vimshottari = ((row.dashaData?.vimshottari ?? {}) as Record<string, unknown>);
    const currentMD = vimshottari.currentMahadasha as Record<string, unknown> | undefined;
    const currentAD = vimshottari.currentAntardasha as Record<string, unknown> | undefined;
    const demographic = getAgeDemographic(row.dob ?? undefined);
    const toneBlock = buildToneRules(demographic);
    const langLabel = row.language === 'hi' ? 'Hindi' : 'English';

    const context = {
      profile: { name: row.name, dob: row.dob },
      currentDate: today,
      ascendant: row.chartData?.ascendant,
      planets: row.chartData?.planets,
      houses: row.chartData?.houses,
      currentDasha: {
        mahadasha: currentMD ? { planet: currentMD.planet, startDate: currentMD.startDate, endDate: currentMD.endDate } : null,
        antardasha: currentAD ? { planet: currentAD.planet, startDate: currentAD.startDate, endDate: currentAD.endDate } : null,
      },
      yogas: Array.isArray(row.yogaData) ? row.yogaData.filter((y: unknown) => (y as Record<string, unknown>).present).slice(0, 10) : [],
      doshas: row.doshaData,
    };

    const prompt = `You are a master Vedic astrologer providing a daily prediction for ${today}. Write in ${langLabel}.

${VOICE_RULES}

${toneBlock}

CHART CONTEXT:
${JSON.stringify(context, null, 1)}

Respond ONLY with valid JSON (no markdown fences):
{
  "summary": ["<HOOK: 1-2 sentences>", "<NUANCE: planetary why>", "<ACTION: one concrete thing>"],
  "period": "daily",
  "ruling_dasha": "<Planet> Mahadasha / <Planet> Antardasha",
  "prediction": {
    "overall": "<2-3 sentences>",
    "career": "<2-3 sentences>",
    "relationships": "<2-3 sentences>",
    "health": "<2-3 sentences>",
    "finance": "<2-3 sentences>",
    "lucky_color": "<color>",
    "remedy": "<specific Vedic remedy>"
  }
}`;

    const message = await createAIMessage({
      max_tokens: 1200,
      temperature: 0.7,
      skipPersona: true,
      maxRetries: 2,
      jsonMode: true,
      messages: [{ role: 'user', content: prompt }],
    });

    const rawText = message.content.find(c => c.type === 'text')?.text ?? '{}';
    let content: Record<string, unknown>;
    try {
      const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
      content = JSON.parse(cleaned) as Record<string, unknown>;
    } catch { return false; }

    if (!content.prediction) return false;

    // Persist to feature_insights
    const tomorrow = new Date(Date.now() + 5.5 * 3600000);
    tomorrow.setUTCHours(0, 0, 0, 0);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const expiresAt = new Date(tomorrow.getTime() - 5.5 * 3600000);

    await supabase.rpc('upsert_feature_insight', {
      p_user_id: row.userId,
      p_chart_id: row.chartId,
      p_feature_key: 'predictions_daily',
      p_params_hash: today,
      p_language: row.language,
      p_source: 'lite_ai',
      p_source_version: 1,
      p_content: content,
      p_report_id: null,
      p_expires_at: expiresAt.toISOString(),
    });

    await cacheSet(`predictions_daily:${row.chartId}:${today}:${row.language}`, content, 3600);
    return true;
  } catch (e) {
    console.error(`[bg] predictions_daily failed for ${row.chartId}:`, e);
    return false;
  }
}

// ─── Orchestrator ─────────────────────────────────────────────────────────

export async function runBackgroundGeneration(batchSize = 15, offset = 0): Promise<{
  processed: number;
  details: Record<string, number>;
}> {
  const supabase = createAdminSupabase();
  const users = await sweepUsersWithCharts(supabase, batchSize, offset);

  if (!users.length) return { processed: 0, details: {} };

  let personalDaily = 0;
  let lifeJourney = 0;
  let predictions = 0;

  for (const row of users) {
    if (await generatePersonalDailyForUser(supabase, row)) personalDaily++;
    lifeJourney += await generateLifeJourneyForUser(supabase, row);
    if (await generatePredictionsForUser(supabase, row)) predictions++;
  }

  console.log(`[bg] Processed ${users.length} users — personal_daily:${personalDaily} life_journey:${lifeJourney} predictions:${predictions}`);

  return {
    processed: users.length,
    details: { personalDaily, lifeJourney, predictions },
  };
}
