import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAIMessage } from '@/lib/ai/aiProvider';
import { deductCredits, refundCredits } from '@/lib/credits/deductCredits';
import { getAgeDemographic, buildToneOnly } from '@/lib/ai/toneRouting';
import type { ApiResponse } from '@aroha-astrology/shared';
// astro-engine loaded dynamically to avoid swisseph-wasm webpack bundling

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET() {
  try {
    const supabase = await createServerSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json<ApiResponse>({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const { data, error } = await supabase
      .from('couple_analyses')
      .select('id, husband_name, wife_name, total_score, max_score, compatibility, result_data, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) throw error;
    return NextResponse.json<ApiResponse>({ success: true, data: data ?? [] });
  } catch (error) {
    return NextResponse.json<ApiResponse>(
      { success: false, error: error instanceof Error ? error.message : 'Failed to fetch history' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json<ApiResponse>({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  let creditCharged = false;
  try {
    const { calculateAshtakoota, detectMangalDosha } = await import('@aroha-astrology/astro-engine');

    const creditResult = await deductCredits(supabase, user.id, 1, 'feature_debit', 'Couple compatibility analysis');
    if (!creditResult.success) {
      return NextResponse.json<ApiResponse>({ success: false, error: 'INSUFFICIENT_TOKENS' }, { status: 402 });
    }
    creditCharged = true;

    const body = await request.json();
    const { chart1Id, chart2Id, husbandChartId } = body as {
      chart1Id: string;
      chart2Id: string;
      husbandChartId?: string;
    };

    if (!chart1Id || !chart2Id) {
      return NextResponse.json<ApiResponse>({ success: false, error: 'Both chart1Id and chart2Id are required' }, { status: 400 });
    }
    if (chart1Id === chart2Id) {
      return NextResponse.json<ApiResponse>({ success: false, error: 'Please select two different charts' }, { status: 400 });
    }

    const [{ data: chart1, error: err1 }, { data: chart2, error: err2 }] = await Promise.all([
      supabase.from('kundli_charts').select('*, birth_profiles(*)').eq('id', chart1Id).eq('user_id', user.id).single(),
      supabase.from('kundli_charts').select('*, birth_profiles(*)').eq('id', chart2Id).eq('user_id', user.id).single(),
    ]);

    if (err1 || err2 || !chart1 || !chart2) {
      return NextResponse.json<ApiResponse>({ success: false, error: 'Failed to fetch one or both charts' }, { status: 404 });
    }

    type PlanetRow = {
      planet: string; sign: string; signDegree: number; nakshatra: string;
      nakshatraIndex: number; nakshatraPada: number; isRetrograde: boolean; house: number; longitude: number;
    };
    type ChartData = {
      planets: PlanetRow[];
      ascendant: { sign: string; signIndex: number; degree: number };
      houses: Array<{ house: number; sign: string; lord: string; planets: string[] }>;
    };

    const chartData1 = chart1.chart_data as ChartData;
    const chartData2 = chart2.chart_data as ChartData;
    const profile1 = chart1.birth_profiles as { name: string; gender: string; dob: string } | null;
    const profile2 = chart2.birth_profiles as { name: string; gender: string; dob: string } | null;

    const moon1 = chartData1.planets.find((p) => p.planet === 'Moon');
    const moon2 = chartData2.planets.find((p) => p.planet === 'Moon');
    if (!moon1 || !moon2) {
      return NextResponse.json<ApiResponse>({ success: false, error: 'Failed to find Moon positions in chart data' }, { status: 500 });
    }

    const ashtakootaResult = calculateAshtakoota(
      moon1.nakshatraIndex, moon2.nakshatraIndex,
      moon1.sign as Parameters<typeof calculateAshtakoota>[2],
      moon2.sign as Parameters<typeof calculateAshtakoota>[3],
    );

    const mangal1 = detectMangalDosha(chartData1 as Parameters<typeof detectMangalDosha>[0]);
    const mangal2 = detectMangalDosha(chartData2 as Parameters<typeof detectMangalDosha>[0]);
    ashtakootaResult.mangalMatch = {
      boyManglik: mangal1.present,
      girlManglik: mangal2.present,
      compatible: mangal1.present === mangal2.present || (!mangal1.present && !mangal2.present),
    };

    // Resolve husband/wife roles
    const isChart1Husband = !husbandChartId || husbandChartId === chart1Id;
    const husbandProfile = isChart1Husband ? profile1 : profile2;
    const wifeProfile = isChart1Husband ? profile2 : profile1;
    const husbandData = isChart1Husband ? chartData1 : chartData2;
    const wifeData = isChart1Husband ? chartData2 : chartData1;

    const coupleContext = {
      husband: {
        name: husbandProfile?.name ?? 'Husband',
        dob: husbandProfile?.dob ?? '',
        planets: husbandData.planets.slice(0, 9).map(p => `${p.planet}: ${p.sign} H${p.house} (${p.nakshatra})`).join(', '),
        ascendant: husbandData.ascendant.sign,
      },
      wife: {
        name: wifeProfile?.name ?? 'Wife',
        dob: wifeProfile?.dob ?? '',
        planets: wifeData.planets.slice(0, 9).map(p => `${p.planet}: ${p.sign} H${p.house} (${p.nakshatra})`).join(', '),
        ascendant: wifeData.ascendant.sign,
      },
      ashtakoota: {
        totalScore: ashtakootaResult.totalScore,
        maxTotal: ashtakootaResult.maxTotal,
        overallCompatibility: ashtakootaResult.overallCompatibility,
        mangalMatch: ashtakootaResult.mangalMatch,
      },
    };

    // Compute ages and tone for both partners; use husband's demographic as primary
    function calcAge(dob: string): number {
      if (!dob) return 0;
      const birth = new Date(dob);
      if (isNaN(birth.getTime())) return 0;
      const now = new Date();
      const y = now.getFullYear() - birth.getFullYear();
      const hadBirthday = now.getMonth() > birth.getMonth() ||
        (now.getMonth() === birth.getMonth() && now.getDate() >= birth.getDate());
      return hadBirthday ? y : y - 1;
    }
    const husbandAge = calcAge(husbandProfile?.dob ?? '');
    const wifeAge = calcAge(wifeProfile?.dob ?? '');
    const demographic = getAgeDemographic(husbandProfile?.dob) ?? getAgeDemographic(wifeProfile?.dob);
    const toneBlock = buildToneOnly(demographic);

    const message = await createAIMessage({
      max_tokens: 2000,
      skipPersona: true,
      jsonMode: true,
      temperature: 0.2,
      signal: AbortSignal.timeout(270_000),
      system: `You are a master Vedic astrologer with the soul of a storyteller. You write in warm, vivid prose — specific imagery, sensory detail, grounded in everyday life. Never clinical. Never generic horoscope language.

You are analyzing the Kundli of a couple: ${coupleContext.husband.name} (husband, age ${husbandAge}) and ${coupleContext.wife.name} (wife, age ${wifeAge}).

HARD RULES — NON-NEGOTIABLE:
- Lead with the human experience (what they will FEEL and LIVE), not the planetary mechanism.
- Mention planet names at most ONCE per section, only when essential. Never list multiple planets in a row.
- NEVER invent project names, company names, colleague names, or past events. Write in patterns and situations the couple will recognise, not invented specifics.
- No jargon-dumping. No "Saturn squares Mars" chains. One grounded observation per paragraph max.

${toneBlock}

The "summary" field is the H/N/A 3-line structure — an ARRAY OF EXACTLY THREE STRINGS:
  [0] HOOK — 1–2 short sentences naming what is most alive between this couple right now. Human-first.
  [1] NUANCE — 1–2 short sentences with the energetic "why" — one chart pattern at most, no planet lists.
  [2] ACTION — 1–2 short sentences with one concrete thing this couple should do together this month.
Short sentences only.

Return ONLY valid JSON — no markdown, no code fences, no preamble text:
{
  "summary": ["hook", "nuance", "action"],
  "sharedForecast": [
    { "timeframe": "This Week", "icon": "🌙", "narrative": "2-3 sentences about what this week holds for them — grounded in daily life, not planet names" },
    { "timeframe": "This Month", "icon": "🌟", "narrative": "2-3 sentences for the month ahead" },
    { "timeframe": "3-Month Outlook", "icon": "🔮", "narrative": "2-3 sentences for the next season" }
  ],
  "compatibilityZones": {
    "career": { "score": 1-10, "analysis": "one warm sentence about their career synergy" },
    "romance": { "score": 1-10, "analysis": "one warm sentence about their romantic bond" },
    "finances": { "score": 1-10, "analysis": "one warm sentence about money and prosperity together" },
    "family": { "score": 1-10, "analysis": "one warm sentence about home and family life" }
  },
  "conflictAreas": [
    { "area": "string", "description": "one grounded sentence about this tension", "severity": "low|medium|high" }
  ],
  "sharedRemedies": [
    { "remedy": "string", "purpose": "string", "frequency": "string" }
  ],
  "strengthAreas": ["3-5 short strength phrases"],
  "storyOfThem": "3-4 sentence poetic narrative about who they are as a couple — their energy, what draws them together, what their journey looks like. Use their names. Warm, vivid. No planet lists."
}`,
      messages: [{ role: 'user', content: JSON.stringify(coupleContext) }],
    });

    const textBlock = message.content.find((block) => block.type === 'text');
    const rawText = textBlock?.text ?? '{}';

    let aiAnalysis: Record<string, unknown>;
    try {
      // Strip code fences, then extract the outermost JSON object
      const stripped = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const jsonStart = stripped.indexOf('{');
      const jsonEnd = stripped.lastIndexOf('}');
      const jsonStr = jsonStart !== -1 && jsonEnd > jsonStart
        ? stripped.slice(jsonStart, jsonEnd + 1)
        : stripped;
      aiAnalysis = JSON.parse(jsonStr);
    } catch {
      aiAnalysis = { sharedForecast: rawText };
    }

    const resultData = {
      husbandName: husbandProfile?.name ?? 'Husband',
      wifeName: wifeProfile?.name ?? 'Wife',
      partner1: { name: profile1?.name ?? 'Partner 1', planets: chartData1.planets, ascendant: chartData1.ascendant },
      partner2: { name: profile2?.name ?? 'Partner 2', planets: chartData2.planets, ascendant: chartData2.ascendant },
      ashtakoota: {
        scores: ashtakootaResult.scores,
        totalScore: ashtakootaResult.totalScore,
        maxTotal: ashtakootaResult.maxTotal,
        overallCompatibility: ashtakootaResult.overallCompatibility,
        mangalMatch: ashtakootaResult.mangalMatch,
      },
      aiAnalysis,
    };

    // Persist so the user can revisit without re-running AI
    await supabase.from('couple_analyses').insert({
      user_id: user.id,
      chart1_id: chart1Id,
      chart2_id: chart2Id,
      husband_name: resultData.husbandName,
      wife_name: resultData.wifeName,
      total_score: ashtakootaResult.totalScore,
      max_score: ashtakootaResult.maxTotal,
      compatibility: ashtakootaResult.overallCompatibility,
      result_data: resultData,
    });

    return NextResponse.json<ApiResponse>({ success: true, data: resultData });
  } catch (error) {
    if (creditCharged) {
      await refundCredits(supabase, user.id, 1, 'Refund: Couple compatibility analysis (AI error)');
    }
    console.error('Couple analysis error:', error);
    return NextResponse.json<ApiResponse>(
      { success: false, error: error instanceof Error ? error.message : 'Failed to analyze couple' },
      { status: 500 },
    );
  }
}
