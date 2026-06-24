import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAIMessage } from '@/lib/ai/aiProvider';
import { deductCredits, refundCredits } from '@/lib/credits/deductCredits';
import type { ApiResponse, MatchRequest } from '@aroha-astrology/shared';
// astro-engine loaded dynamically to avoid swisseph-wasm webpack bundling

export const runtime = 'nodejs';
export const maxDuration = 300; // 10 minutes

// ============================================================
// POST /api/match/calculate
// ============================================================

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json<ApiResponse>({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  let creditCharged = false;
  try {
    const { calculateChart, calculateAshtakoota, calculateDashakoota, detectMangalDosha } = await import('@aroha-astrology/astro-engine');

    const creditResult = await deductCredits(supabase, user.id, 1, 'feature_debit', 'Kundli match compatibility');
    if (!creditResult.success) {
      return NextResponse.json<ApiResponse>({ success: false, error: 'INSUFFICIENT_TOKENS' }, { status: 402 });
    }
    creditCharged = true;

    const body: MatchRequest = await request.json();
    const { profile1, profile2, system, saveProfiles } = body;
    const shouldSaveProfiles = saveProfiles !== false;

    if (!profile1 || !profile2) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'Both profile1 and profile2 are required' },
        { status: 400 },
      );
    }

    // Parse birth details for both profiles
    const [year1, month1, day1] = profile1.dob.split('-').map(Number);
    const [hour1, min1] = profile1.tob.split(':').map(Number);
    const tz1 = getTimezoneOffsetHours(profile1.timezone, profile1.dob, profile1.tob);

    const [year2, month2, day2] = profile2.dob.split('-').map(Number);
    const [hour2, min2] = profile2.tob.split(':').map(Number);
    const tz2 = getTimezoneOffsetHours(profile2.timezone, profile2.dob, profile2.tob);

    // Calculate charts for both profiles
    const [chart1, chart2] = await Promise.all([
      calculateChart(year1, month1, day1, hour1, min1, tz1, profile1.latitude, profile1.longitude, 'lahiri', 'W'),
      calculateChart(year2, month2, day2, hour2, min2, tz2, profile2.latitude, profile2.longitude, 'lahiri', 'W'),
    ]);

    // Get Moon positions for matching
    const moon1 = chart1.planets.find((p) => p.planet === 'Moon');
    const moon2 = chart2.planets.find((p) => p.planet === 'Moon');

    if (!moon1 || !moon2) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'Failed to calculate Moon positions for matching' },
        { status: 500 },
      );
    }

    // Store both birth profiles in parallel — skipped when saveProfiles=false
    // (one-off matches from the "New Matching" tab don't pollute saved kundlis).
    let bp1Id: string | null = null;
    let bp2Id: string | null = null;
    if (shouldSaveProfiles) {
      const [{ data: bp1 }, { data: bp2 }] = await Promise.all([
        supabase.from('birth_profiles').insert({
          user_id: user.id,
          name: profile1.name,
          dob: profile1.dob,
          tob: profile1.tob,
          tob_source: 'family',
          pob: profile1.pob,
          latitude: profile1.latitude,
          longitude: profile1.longitude,
          timezone: profile1.timezone,
          gender: profile1.gender,
          is_primary: false,
        }).select('id').single(),
        supabase.from('birth_profiles').insert({
          user_id: user.id,
          name: profile2.name,
          dob: profile2.dob,
          tob: profile2.tob,
          tob_source: 'family',
          pob: profile2.pob,
          latitude: profile2.latitude,
          longitude: profile2.longitude,
          timezone: profile2.timezone,
          gender: profile2.gender,
          is_primary: false,
        }).select('id').single(),
      ]);
      bp1Id = bp1?.id ?? null;
      bp2Id = bp2?.id ?? null;
    }

    // Calculate matching scores
    let gunScores: Record<string, unknown>;
    let totalScore: number;

    if (system === 'dashakoota') {
      const result = calculateDashakoota(
        moon1.nakshatraIndex,
        moon2.nakshatraIndex,
        moon1.sign,
        moon2.sign,
        { boy: chart1, girl: chart2 },
      );
      gunScores = result as unknown as Record<string, unknown>;
      totalScore = result.totalScore;
    } else {
      const result = calculateAshtakoota(
        moon1.nakshatraIndex,
        moon2.nakshatraIndex,
        moon1.sign,
        moon2.sign,
      );

      // Check Mangal Dosha for both
      const mangal1 = detectMangalDosha(chart1);
      const mangal2 = detectMangalDosha(chart2);

      result.mangalMatch = {
        boyManglik: mangal1.present,
        girlManglik: mangal2.present,
        compatible: mangal1.present === mangal2.present || (!mangal1.present && !mangal2.present),
      };

      gunScores = result as unknown as Record<string, unknown>;
      totalScore = result.totalScore;
    }

    // Ages help the AI tune tone to life stage (per text-gen rules).
    const age1 = computeAgeYears(profile1.dob);
    const age2 = computeAgeYears(profile2.dob);

    // Call AI for detailed narrative interpretation
    const matchContext = {
      profile1: { name: profile1.name, gender: profile1.gender, age: age1, chart: chart1 },
      profile2: { name: profile2.name, gender: profile2.gender, age: age2, chart: chart2 },
      matchingSystem: system,
      scores: gunScores,
      totalScore,
    };

    const husbandName = profile1.gender === 'male' ? profile1.name : profile2.name;
    const wifeName = profile1.gender === 'female' ? profile1.name : profile2.name;
    const husbandAge = profile1.gender === 'male' ? age1 : age2;
    const wifeAge = profile1.gender === 'female' ? age1 : age2;

    const message = await createAIMessage({
      max_tokens: 1700,
      jsonMode: true,
      temperature: 0.2,
      system: `You are a master Vedic astrologer specializing in marriage compatibility (Kundli Milan). You write with warmth and storytelling depth — specific, vivid, grounded.

The couple: ${husbandName} (husband, age ${husbandAge}) and ${wifeName} (wife, age ${wifeAge}). Use their names throughout. Tune tone to their life stage.

Lead every paragraph with how this affects their daily life together — communication, intimacy, shared goals, family rhythm. Keep planet/dasha/koota terminology sparse: name a placement only when it directly explains the human impact. Never invent names of family members, colleagues, or places beyond what the context provides.

The "summary" field is the H/N/A 3-line structure — an ARRAY OF EXACTLY THREE STRINGS:
  [0] HOOK — 1–2 short sentences naming what is most alive between this couple.
  [1] NUANCE — 1–2 short sentences with the Vedic why (which kootas/doshas carry the weight).
  [2] ACTION — 1–2 short sentences with one concrete thing this couple should do.
Short sentences only.

Provide your response as valid JSON (no markdown, no code fences):
{
  "summary": ["hook", "nuance", "action"],
  "overallVerdict": "string (Excellent Match / Good Match / Average Match / Challenging Match / Not Recommended)",
  "summaryNarrative": "string (2-3 paragraph warm narrative story about this couple — who they are together, what their bond feels like, what their life journey promises)",
  "strengthAreas": ["string array of compatibility strengths"],
  "challengeAreas": ["string array of potential challenges"],
  "mangalDoshaAnalysis": "string (detailed Mangal Dosha assessment for both)",
  "nadiDoshaAnalysis": "string (if applicable)",
  "emotionalCompatibility": "string",
  "physicalCompatibility": "string",
  "financialCompatibility": "string",
  "familyCompatibility": "string",
  "childrenProspects": "string",
  "remediesIfNeeded": ["string array of remedies for weak areas"],
  "bestPeriodsForMarriage": ["string array of auspicious periods"],
  "longTermOutlook": "string"
}`,
      messages: [
        { role: 'user', content: JSON.stringify(matchContext) },
      ],
    });

    const textBlock = message.content.find((block) => block.type === 'text');
    const rawNarrative = textBlock?.text ?? '{}';

    let detailedAnalysis: Record<string, unknown>;
    try {
      const cleaned = rawNarrative.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      detailedAnalysis = JSON.parse(cleaned);
    } catch {
      detailedAnalysis = { summaryNarrative: rawNarrative };
    }

    // Store match report. profile1_id/profile2_id are nullable in the schema —
    // when saveProfiles=false we keep the match history but skip the FK link.
    const { data: report, error: reportError } = await supabase
      .from('match_reports')
      .insert({
        user_id: user.id,
        profile1_id: bp1Id,
        profile2_id: bp2Id,
        system: system ?? 'ashtakoota',
        gun_scores: gunScores,
        total_score: totalScore,
        detailed_analysis: detailedAnalysis,
      })
      .select()
      .single();

    if (reportError) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: `Failed to store match report: ${reportError.message}` },
        { status: 500 },
      );
    }

    return NextResponse.json<ApiResponse>({
      success: true,
      data: {
        reportId: report.id,
        system: system ?? 'ashtakoota',
        scores: gunScores,
        totalScore,
        maxScore: system === 'dashakoota' ? 10 : 36,
        detailedAnalysis,
      },
    });
  } catch (error) {
    if (creditCharged) {
      await refundCredits(supabase, user.id, 1, 'Refund: Kundli match compatibility (AI error)');
    }
    console.error('Match calculation error:', error);
    return NextResponse.json<ApiResponse>(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to calculate match',
      },
      { status: 500 },
    );
  }
}

function computeAgeYears(dob: string): number {
  const birth = new Date(`${dob}T00:00:00Z`);
  if (Number.isNaN(birth.getTime())) return 0;
  const now = new Date();
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const m = now.getUTCMonth() - birth.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < birth.getUTCDate())) age--;
  return Math.max(0, age);
}

function getTimezoneOffsetHours(timezone: string, dob: string, tob: string): number {
  try {
    const dt = new Date(`${dob}T${tob}:00`);
    const utcString = dt.toLocaleString('en-US', { timeZone: 'UTC' });
    const tzString = dt.toLocaleString('en-US', { timeZone: timezone });
    const utcDate = new Date(utcString);
    const tzDate = new Date(tzString);
    return (tzDate.getTime() - utcDate.getTime()) / (1000 * 60 * 60);
  } catch {
    return 5.5;
  }
}
