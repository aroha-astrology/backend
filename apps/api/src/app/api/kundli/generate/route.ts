export const runtime = 'nodejs';

import { NextRequest, NextResponse, after } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminSupabase } from '@/lib/supabase/admin';
import type { ApiResponse, ChartData } from '@aroha-astrology/shared';
import { z } from 'zod';
import { cacheGet, cacheSet, cacheDel } from '@/lib/redis';
import { notifyKundliGenerated, notifyBackendError } from '@/lib/telegram';
import { createNotification } from '@/lib/notifications/create';
import { scheduleAutoGeneration } from '@/lib/insights/autoGenerate';

const ASTRO_CALC_TTL = 30 * 86400; // 30 days — deterministic, changes only with ephemeris updates

// Dynamic import — resolved at runtime, not bundled by webpack
async function getAstroEngine() {
  return await import('@aroha-astrology/astro-engine');
}

// ============================================================
// Dasha pattern analysis for follow-up question generation
// ============================================================

interface FollowUpQuestion {
  id: string;
  question: string;
  options: string[];
  why: string;
  dashaReference: string;
}

function generateFollowUpQuestions(
  chartData: ChartData,
  dashaData: Record<string, unknown>,
): FollowUpQuestion[] {
  const questions: FollowUpQuestion[] = [];
  const now = new Date();
  const tenYearsAgo = new Date(now.getTime() - 10 * 365.25 * 86400000);

  // Cast dasha sub-fields
  const mahadashas = (dashaData.mahadashas ?? []) as Array<{ planet: string; startDate: Date; endDate: Date }>;
  const recentMahadashas = mahadashas.filter(
    (md) => md.endDate >= tenYearsAgo && md.startDate <= now,
  );

  const currentMD = dashaData.currentMahadasha as { planet: string; startDate: Date; endDate: Date } | undefined;
  const currentAD = dashaData.currentAntardasha as { planet: string; startDate: Date; endDate: Date } | undefined;

  // Saturn-related questions (career delays, restructuring)
  if (
    currentMD?.planet === 'Saturn' ||
    currentAD?.planet === 'Saturn' ||
    recentMahadashas.some((md) => md.planet === 'Saturn')
  ) {
    questions.push({
      id: 'saturn_career',
      question:
        'Have you experienced significant career changes, delays, or a period of restructuring in the last few years?',
      options: [
        'Yes, major career setback or change',
        'Some delays but mostly stable',
        'Career has been progressing well',
        'Changed field entirely',
      ],
      why: 'Saturn dasha/antardasha detected in recent period - Saturn governs career discipline and restructuring.',
      dashaReference: `${currentMD?.planet}-${currentAD?.planet} period active`,
    });
  }

  // Rahu-related questions (sudden changes, foreign connections)
  if (
    currentMD?.planet === 'Rahu' ||
    currentAD?.planet === 'Rahu' ||
    recentMahadashas.some((md) => md.planet === 'Rahu')
  ) {
    questions.push({
      id: 'rahu_changes',
      question:
        'Have you experienced sudden, unexpected changes or opportunities involving foreign connections, technology, or unconventional paths?',
      options: [
        'Yes, major unexpected life shift',
        'Some foreign or tech-related opportunities',
        'Feeling confused about direction',
        'Life has been relatively predictable',
      ],
      why: 'Rahu dasha/antardasha detected - Rahu indicates sudden changes, obsessions, and foreign influences.',
      dashaReference: `${currentMD?.planet}-${currentAD?.planet} period active`,
    });
  }

  // Jupiter-related questions (expansion, wisdom, children)
  if (currentMD?.planet === 'Jupiter' || currentAD?.planet === 'Jupiter') {
    questions.push({
      id: 'jupiter_growth',
      question:
        'Have you recently experienced growth in education, spirituality, or family expansion (children, marriage)?',
      options: [
        'Yes, significant spiritual or educational growth',
        'Family expansion (marriage/children)',
        'Financial growth and prosperity',
        'Not particularly',
      ],
      why: 'Jupiter period active - Jupiter governs wisdom, expansion, children, and dharma.',
      dashaReference: `${currentMD?.planet}-${currentAD?.planet} period active`,
    });
  }

  // Venus-related questions (relationships, luxuries)
  if (currentMD?.planet === 'Venus' || currentAD?.planet === 'Venus') {
    questions.push({
      id: 'venus_relationships',
      question:
        'How has your romantic life and relationship with comfort/luxury been recently?',
      options: [
        'New relationship or deepening of existing one',
        'Focused on material comforts and aesthetics',
        'Relationship challenges',
        'Not much change in this area',
      ],
      why: 'Venus period active - Venus governs relationships, beauty, luxury, and creative arts.',
      dashaReference: `${currentMD?.planet}-${currentAD?.planet} period active`,
    });
  }

  // Mars-related questions (energy, conflicts, property)
  if (currentMD?.planet === 'Mars' || currentAD?.planet === 'Mars') {
    questions.push({
      id: 'mars_energy',
      question:
        'Have you been experiencing increased energy, ambition, or conflicts/disputes recently?',
      options: [
        'Very high energy, taking bold actions',
        'Some property or legal matters',
        'Increased conflicts with others',
        'Health issues related to heat or blood',
      ],
      why: 'Mars period active - Mars governs energy, courage, property, and conflicts.',
      dashaReference: `${currentMD?.planet}-${currentAD?.planet} period active`,
    });
  }

  // Moon-related questions (emotions, mother, mind)
  if (currentMD?.planet === 'Moon' || currentAD?.planet === 'Moon') {
    questions.push({
      id: 'moon_emotions',
      question: 'How has your emotional and mental state been lately?',
      options: [
        'Emotionally turbulent, mood swings',
        'Feeling very nurturing, connected to family',
        'Mental clarity and creativity',
        'Anxiety or restlessness',
      ],
      why: "Moon period active - Moon governs mind, emotions, mother, and one's public image.",
      dashaReference: `${currentMD?.planet}-${currentAD?.planet} period active`,
    });
  }

  // Ketu-related questions (spirituality, detachment, losses)
  if (
    currentMD?.planet === 'Ketu' ||
    currentAD?.planet === 'Ketu' ||
    recentMahadashas.some((md) => md.planet === 'Ketu')
  ) {
    questions.push({
      id: 'ketu_detachment',
      question:
        'Have you felt a sense of detachment, spiritual seeking, or experienced unexpected losses recently?',
      options: [
        'Strong spiritual or mystical experiences',
        'Feeling detached from material goals',
        'Sudden losses or endings',
        'Confusion about life purpose',
      ],
      why: 'Ketu period detected - Ketu brings spiritual awakening, detachment, and moksha-oriented experiences.',
      dashaReference: `${currentMD?.planet}-${currentAD?.planet} period active`,
    });
  }

  // Always include a health question based on 6th/8th house analysis
  const sixthHousePlanets = chartData.houses[5]?.planets || [];
  const eighthHousePlanets = chartData.houses[7]?.planets || [];
  if (sixthHousePlanets.length > 0 || eighthHousePlanets.length > 0) {
    questions.push({
      id: 'health_general',
      question: 'Do you have any ongoing health concerns or chronic conditions?',
      options: [
        'Digestive or stomach issues',
        'Joint pain, bones, or chronic conditions',
        'Stress, anxiety, or mental health',
        'No significant health issues',
        'Skin or allergy related',
      ],
      why: `Planets in 6th house (${sixthHousePlanets.join(', ') || 'none'}) and 8th house (${eighthHousePlanets.join(', ') || 'none'}) indicate health areas to watch.`,
      dashaReference: `Houses 6 & 8 analysis`,
    });
  }

  // Always include marital status / relationship question
  questions.push({
    id: 'relationship_status',
    question: 'What is your current relationship/marital status?',
    options: [
      'Single, looking for partner',
      'In a relationship',
      'Married',
      'Separated/Divorced',
      'Not interested in relationships currently',
    ],
    why: '7th house and Venus analysis helps calibrate relationship predictions.',
    dashaReference: 'General chart analysis',
  });

  // Limit to 6 questions max
  return questions.slice(0, 6);
}

// ============================================================
// Request schema
// ============================================================

const KundliSchema = z.object({
  name:      z.string().min(1).max(100),
  dob:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dob must be YYYY-MM-DD'),
  tob:       z.string().regex(/^\d{2}:\d{2}$/, 'tob must be HH:MM'),
  pob:       z.string().min(1).max(200),
  latitude:  z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  timezone:  z.string().regex(/^(?:[A-Za-z_]+(?:\/[A-Za-z_]+)*|UTC)$/, 'invalid timezone identifier'),
  gender:    z.enum(['male', 'female', 'other']).optional(),
  tobSource: z.enum(['hospital', 'certificate', 'family', 'approximate', 'unknown']).optional(),
  isPrimary: z.boolean().optional(),
});

// ============================================================
// POST /api/kundli/generate
// ============================================================

export async function POST(request: NextRequest) {
  try {
    const {
      calculateChart, calculateVimshottariDasha, calculateYoginiDasha, calculateCharaDasha,
      analyzeAllDoshas, detectAllYogas, calculateShadbala, calculateAshtakavarga,
      calculateAllDivisionalChartsForStorage, calculateTithi, calculateNakshatra,
      dateToJulianDay, calculatePlanetPositions,
    } = await getAstroEngine();

    const supabase = await createServerSupabase();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      );
    }

    const parsed = KundliSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'Invalid request', data: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const { name, dob, tob, tobSource, pob, latitude, longitude, timezone, gender, isPrimary } = parsed.data;

    // Dedup: if this user already has a kundli for the same person (matched by
    // name + dob + tob), return the existing chart instead of regenerating.
    const { data: existingProfile } = await supabase
      .from('birth_profiles')
      .select('id')
      .eq('user_id', user.id)
      .eq('name', name)
      .eq('dob', dob)
      .eq('tob', tob)
      .maybeSingle();

    if (existingProfile) {
      const { data: existingChart } = await supabase
        .from('kundli_charts')
        .select('id, profile_id')
        .eq('user_id', user.id)
        .eq('profile_id', existingProfile.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingChart) {
        createNotification({
          userId: user.id,
          type: 'kundli_ready',
          title: `${name}'s Kundli is ready`,
          body: 'Your birth chart and Dasha timeline are now available.',
          link: `/dashboard`,
          metadata: { chartId: existingChart.id, profileId: existingChart.profile_id, name, dob, reused: true },
        }); // fire-and-forget — clears any pending skeleton on the dashboard

        // Idempotent referral payout — no-op if already paid or not referred.
        // Covers the case where a user re-runs onboarding without ever
        // having triggered the payout on their first try.
        if (isPrimary) {
          supabase.rpc('pay_referral_bonus', { p_invitee_id: user.id }).then(({ error }) => {
            if (error) console.warn('[pay_referral_bonus] dedupe-branch error:', error.message);
          });
        }

        return NextResponse.json<ApiResponse>({
          success: true,
          data: {
            chartId: existingChart.id,
            profileId: existingChart.profile_id,
            followUpQuestions: [],
            reused: true,
          },
        });
      }
    }

    // Parse date and time
    const [year, month, day] = dob.split('-').map(Number);
    const [hour, min] = tob.split(':').map(Number);

    // Parse timezone offset from timezone string (e.g., "Asia/Kolkata" -> 5.5)
    const tzOffsetHours = getTimezoneOffsetHours(timezone, dob, tob);

    // 1. Create birth profile
    const { data: profile, error: profileError } = await supabase
      .from('birth_profiles')
      .insert({
        user_id: user.id,
        name,
        dob,
        tob,
        tob_source: tobSource || 'family',
        pob,
        latitude,
        longitude,
        timezone,
        gender: gender || 'male',
        is_primary: isPrimary ?? false,
      })
      .select()
      .single();

    if (profileError) {
      notifyBackendError('/api/kundli/generate (birth_profiles insert)', profileError);
      return NextResponse.json<ApiResponse>(
        { success: false, error: `Failed to create birth profile: ${profileError.message}` },
        { status: 500 },
      );
    }

    // Sync name to users table for phone OTP users who have no name yet
    if (isPrimary && name) {
      await supabase
        .from('users')
        .update({ name })
        .eq('id', user.id)
        .or('name.is.null,name.eq.')
        .then(() => {}); // fire-and-forget, non-blocking
    }

    // Pay referral bonus on first primary-profile creation. Idempotent RPC —
    // safe to call on every onboarding submission, no-op if already paid.
    if (isPrimary) {
      supabase.rpc('pay_referral_bonus', { p_invitee_id: user.id }).then(({ error }) => {
        if (error) console.warn('[pay_referral_bonus] insert-branch error:', error.message);
      });
    }

    // 2. Calculate chart data — check Redis first (birth chart is deterministic)
    type AstroCalcResult = {
      chartData: ChartData;
      dashaData: Record<string, unknown>;
      yogas: unknown;
      doshas: unknown;
      shadbala: unknown;
      ashtakavarga: unknown;
      divisionalCharts: unknown;
      panchangAtBirth: { tithi: unknown; nakshatra: unknown; vara: string };
    };

    const astroKey = `kundli:astro:${dob}:${tob}:${latitude.toFixed(4)}:${longitude.toFixed(4)}:${timezone}`;
    let astroCalc = await cacheGet<AstroCalcResult>(astroKey);

    if (!astroCalc) {
      const chartData = await calculateChart(
        year,
        month,
        day,
        hour,
        min,
        tzOffsetHours,
        latitude,
        longitude,
        'lahiri',
        'W',
      );

      // 3. Calculate all additional chart components
      const moonPosition = chartData.planets.find((p) => p.planet === 'Moon');
      const moonLongitude = moonPosition?.longitude ?? 0;
      const sunLongitude = chartData.planets.find((p) => p.planet === 'Sun')?.longitude ?? 0;
      const birthDate = new Date(year, month - 1, day, hour, min);

      const vimshottariDasha = calculateVimshottariDasha(moonLongitude, birthDate);
      const yoginiDasha = calculateYoginiDasha(moonLongitude, birthDate);
      const charaDasha = calculateCharaDasha(chartData.ascendant.sign, chartData);

      const yogas = detectAllYogas(chartData);

      // Sade Sati requires the *current* transit Saturn longitude, not natal Saturn.
      // Compute Saturn's sidereal longitude at request time and pass it in.
      const transitNow = new Date();
      const transitJd = await dateToJulianDay(
        transitNow.getUTCFullYear(),
        transitNow.getUTCMonth() + 1,
        transitNow.getUTCDate(),
        transitNow.getUTCHours(),
        transitNow.getUTCMinutes(),
        0,
      );
      const transitPlanets = await calculatePlanetPositions(transitJd, 'lahiri');
      const transitSaturnLongitude =
        (transitPlanets as Array<{ planet: string; longitude: number }>)
          .find((p) => p.planet === 'Saturn')?.longitude ?? 0;

      const doshas = analyzeAllDoshas(chartData, transitSaturnLongitude);
      const shadbala = calculateShadbala(chartData);
      const ashtakavarga = calculateAshtakavarga(chartData);
      const divisionalCharts = calculateAllDivisionalChartsForStorage(chartData);

      const tithiAtBirth = calculateTithi(moonLongitude, sunLongitude);
      const nakshatraAtBirth = calculateNakshatra(moonLongitude);

      astroCalc = {
        chartData,
        dashaData: {
          vimshottari: serializeDasha(vimshottariDasha),
          yogini: serializeDasha(yoginiDasha),
          chara: serializeDasha(charaDasha),
        },
        yogas,
        doshas,
        shadbala,
        ashtakavarga,
        divisionalCharts,
        panchangAtBirth: {
          tithi: tithiAtBirth,
          nakshatra: nakshatraAtBirth,
          vara: getDayOfWeek(birthDate),
        },
      };

      await cacheSet(astroKey, astroCalc, ASTRO_CALC_TTL);
    }

    const { chartData, dashaData, yogas, doshas, shadbala, ashtakavarga, divisionalCharts, panchangAtBirth } = astroCalc;

    // 5. Store in kundli_charts table
    const { data: chart, error: chartError } = await supabase
      .from('kundli_charts')
      .insert({
        profile_id: profile.id,
        user_id: user.id,
        ayanamsa: 'lahiri',
        chart_data: chartData as unknown as Record<string, unknown>,
        divisional_charts: divisionalCharts as unknown as Record<string, unknown>,
        dasha_data: dashaData as unknown as Record<string, unknown>,
        yoga_data: yogas as unknown as Record<string, unknown>,
        dosha_data: doshas as unknown as Record<string, unknown>,
        shadbala: shadbala as unknown as Record<string, unknown>,
        ashtakavarga: ashtakavarga as unknown as Record<string, unknown>,
        panchang_at_birth: panchangAtBirth as unknown as Record<string, unknown>,
      })
      .select()
      .single();

    if (chartError) {
      notifyBackendError('/api/kundli/generate (kundli_charts insert)', chartError);
      return NextResponse.json<ApiResponse>(
        { success: false, error: `Failed to store chart data: ${chartError.message}` },
        { status: 500 },
      );
    }

    // Invalidate the chat cache so the next chat turn picks up the fresh chart
    if (chart?.id) await cacheDel(`chart:${chart.id}:${user.id}`);

    // 6. Generate follow-up questions based on chart analysis
    const followUpQuestions = generateFollowUpQuestions(chartData, dashaData.vimshottari as unknown as Record<string, unknown>);

    // Store follow-up questions
    if (followUpQuestions.length > 0) {
      const questionsToInsert = followUpQuestions.map((q) => ({
        chart_id: chart.id,
        question: q.question,
        options: { options: q.options, why: q.why } as unknown as Record<string, unknown>,
        dasha_period: q.dashaReference,
      }));

      await supabase.from('follow_up_questions').insert(questionsToInsert);
    }

    notifyKundliGenerated(name, dob, pob, user.email ?? ''); // fire-and-forget

    createNotification({
      userId: user.id,
      type: 'kundli_ready',
      title: `${name}'s Kundli is ready`,
      body: 'Your birth chart and Dasha timeline are now available.',
      link: `/dashboard`,
      metadata: { chartId: chart.id, profileId: profile.id, name, dob },
    }); // fire-and-forget — drives realtime push to dashboard skeleton swap

    after(async () => {
      const adminSupabase = await createAdminSupabase();
      await scheduleAutoGeneration(adminSupabase, { userId: user.id, chartId: chart.id });
    });

    return NextResponse.json<ApiResponse>({
      success: true,
      data: {
        chartId: chart.id,
        profileId: profile.id,
        followUpQuestions,
      },
    });
  } catch (error) {
    console.error('Kundli generation error:', error);
    notifyBackendError('/api/kundli/generate', error);
    return NextResponse.json<ApiResponse>(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate kundli',
      },
      { status: 500 },
    );
  }
}

// ============================================================
// Helpers
// ============================================================

function getTimezoneOffsetHours(timezone: string, dob: string, tob: string): number {
  try {
    const dt = new Date(`${dob}T${tob}:00`);
    const utcString = dt.toLocaleString('en-US', { timeZone: 'UTC' });
    const tzString = dt.toLocaleString('en-US', { timeZone: timezone });
    const utcDate = new Date(utcString);
    const tzDate = new Date(tzString);
    return (tzDate.getTime() - utcDate.getTime()) / (1000 * 60 * 60);
  } catch {
    // Default to IST if timezone parsing fails
    return 5.5;
  }
}

function getDayOfWeek(date: Date): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[date.getDay()];
}

function serializeDasha(obj: unknown): unknown {
  if (obj instanceof Date) {
    return obj.toISOString();
  }
  if (Array.isArray(obj)) {
    return obj.map(serializeDasha);
  }
  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = serializeDasha(value);
    }
    return result;
  }
  return obj;
}
