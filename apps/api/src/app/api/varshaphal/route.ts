import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAIMessage } from '@/lib/ai/aiProvider';
import { deductCredits, refundCredits } from '@/lib/credits/deductCredits';
import type { ApiResponse } from '@aroha-astrology/shared';
// astro-engine loaded dynamically to avoid swisseph-wasm webpack bundling
import { ZODIAC_SIGNS, SIGN_LORDS } from '@aroha-astrology/shared';

export const runtime = 'nodejs';
export const maxDuration = 300; // 10 minutes

// ============================================================
// POST /api/varshaphal
// ============================================================

// Day lords in order: Sunday=Sun, Monday=Moon, Tuesday=Mars, Wednesday=Mercury,
// Thursday=Jupiter, Friday=Venus, Saturday=Saturn
const DAY_LORDS = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'] as const;

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json<ApiResponse>({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  let creditCharged = false;
  try {
    const { dateToJulianDay, calculatePlanetPositions, calculateHouses, calculateAscendant } = await import('@aroha-astrology/astro-engine');

    const creditResult = await deductCredits(supabase, user.id, 1, 'feature_debit', 'Varshaphal (annual chart) analysis');
    if (!creditResult.success) {
      return NextResponse.json<ApiResponse>({ success: false, error: 'INSUFFICIENT_TOKENS' }, { status: 402 });
    }
    creditCharged = true;

    const body = await request.json();
    const { chartId, year } = body as { chartId: string; year: number };

    if (!chartId || !year) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'chartId and year are required' },
        { status: 400 },
      );
    }

    // Fetch the natal chart with birth profile
    const { data: chart, error: chartErr } = await supabase
      .from('kundli_charts')
      .select('*, birth_profiles(*)')
      .eq('id', chartId)
      .eq('user_id', user.id)
      .single();

    if (chartErr || !chart) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'Chart not found' },
        { status: 404 },
      );
    }

    const profile = chart.birth_profiles as {
      name: string;
      dob: string;
      tob: string;
      latitude: number;
      longitude: number;
      timezone: string;
    } | null;

    if (!profile) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'Birth profile not found for this chart' },
        { status: 404 },
      );
    }

    const chartData = chart.chart_data as {
      planets: Array<{
        planet: string;
        sign: string;
        signIndex: number;
        signDegree: number;
        longitude: number;
        nakshatra: string;
        nakshatraIndex: number;
        nakshatraPada: number;
        isRetrograde: boolean;
        house: number;
      }>;
      ascendant: { sign: string; signIndex: number; degree: number };
    };

    // Get natal Sun position (sidereal longitude)
    const natalSun = chartData.planets.find((p) => p.planet === 'Sun');
    if (!natalSun) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'Sun position not found in natal chart' },
        { status: 500 },
      );
    }

    const natalSunLongitude = natalSun.longitude;

    // Parse birth date to get approximate birthday in the target year
    const [, birthMonth, birthDay] = profile.dob.split('-').map(Number);

    // Find the solar return date: when the Sun returns to its natal sidereal longitude
    // Start searching around the birthday in the target year
    const tzOffset = getTimezoneOffsetHours(profile.timezone, profile.dob, profile.tob);

    // Initial guess: birthday in target year at noon
    let searchJd = await dateToJulianDay(year, birthMonth, birthDay, 12, 0, tzOffset);

    // Iterative search: refine the date when Sun reaches natal longitude
    // The Sun moves approximately 1 degree per day (sidereal)
    for (let iteration = 0; iteration < 20; iteration++) {
      const positions = await calculatePlanetPositions(searchJd, 'lahiri');
      const currentSun = positions.find((p) => p.planet === 'Sun');
      if (!currentSun) break;

      let diff = natalSunLongitude - currentSun.longitude;

      // Normalize difference to [-180, 180]
      if (diff > 180) diff -= 360;
      if (diff < -180) diff += 360;

      // If within 0.001 degree (about 3.6 arcseconds), we're close enough
      if (Math.abs(diff) < 0.001) break;

      // Sun moves ~0.9856 degrees/day (sidereal, approximate)
      const dayCorrection = diff / 0.9856;
      searchJd += dayCorrection;
    }

    const solarReturnJd = searchJd;

    // Calculate planet positions for the solar return moment
    const solarReturnPlanets = await calculatePlanetPositions(solarReturnJd, 'lahiri');

    // Calculate houses and ascendant for solar return at birth location
    const solarReturnHouses = await calculateHouses(
      solarReturnJd,
      profile.latitude,
      profile.longitude,
      'W',
      'lahiri',
    );
    const solarReturnAscendant = await calculateAscendant(
      solarReturnJd,
      profile.latitude,
      profile.longitude,
      'lahiri',
    );

    // Assign planets to houses
    const signToHouse: Record<number, number> = {};
    for (const h of solarReturnHouses) {
      signToHouse[h.signIndex] = h.house;
    }
    for (const planet of solarReturnPlanets) {
      const houseNum = signToHouse[planet.signIndex];
      if (houseNum !== undefined) {
        planet.house = houseNum;
      }
    }

    // Convert JD back to a readable date
    const solarReturnDate = jdToDate(solarReturnJd, tzOffset);

    // Determine Year Lord (Varshesh): lord of the day of the solar return
    const solarReturnDayOfWeek = getDayOfWeek(solarReturnDate);
    const yearLord = DAY_LORDS[solarReturnDayOfWeek];

    // Calculate Muntha: (birth ascendant sign index + age) mod 12
    const birthYear = parseInt(profile.dob.split('-')[0], 10);
    const age = year - birthYear;
    const birthAscSignIndex = chartData.ascendant.signIndex;
    const munthaSignIndex = (birthAscSignIndex + age) % 12;
    const munthaSign = ZODIAC_SIGNS[munthaSignIndex];
    const munthaLord = SIGN_LORDS[munthaSign as keyof typeof SIGN_LORDS];

    // Build AI context
    const varshaphalContext = {
      nativeName: profile.name,
      birthDate: profile.dob,
      targetYear: year,
      age,
      solarReturnDate: solarReturnDate.toISOString(),
      yearLord,
      munthaSign,
      munthaLord,
      natalAscendant: chartData.ascendant,
      natalPlanets: chartData.planets,
      solarReturnAscendant,
      solarReturnPlanets,
      solarReturnHouses,
    };

    const { getAgeDemographic, buildToneRules } = await import('@/lib/ai/toneRouting');
    const toneBlock = buildToneRules(getAgeDemographic(profile.dob));

    const message = await createAIMessage({
      max_tokens: 1700,
      jsonMode: true,
      temperature: 0.2,
      system: `You are a master Vedic astrologer specializing in Varshaphal (Solar Return / Annual Horoscope).
Analyze the solar return chart in comparison with the natal chart.
The Year Lord is ${yearLord}, Muntha is in ${munthaSign} ruled by ${munthaLord}.

${toneBlock}

Provide your response as valid JSON. The "summary" field MUST follow the H/N/A structure directive above (3-element array):
{
  "summary": ["hook", "nuance", "action"],
  "yearOverview": "string (2-3 paragraph overall interpretation of the year)",
  "yearLordAnalysis": "string (significance of the year lord ${yearLord} and its placement)",
  "munthaAnalysis": "string (significance of Muntha in ${munthaSign} and its lord ${munthaLord})",
  "career": "string (career and professional outlook for the year)",
  "relationships": "string (love, marriage, social relationships)",
  "health": "string (health and well-being forecast)",
  "finances": "string (financial outlook and wealth prospects)",
  "monthlyHighlights": [
    { "month": "string (month name)", "highlight": "string (key theme or event)" }
  ],
  "keyTransits": ["string array of important planetary transits during the year"],
  "remedies": ["string array of recommended remedies for the year"]
}`,
      messages: [
        { role: 'user', content: JSON.stringify(varshaphalContext) },
      ],
    });

    const textBlock = message.content.find((block) => block.type === 'text');
    const rawText = textBlock?.text ?? '{}';

    let aiInterpretation: Record<string, unknown>;
    try {
      const cleaned = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      aiInterpretation = JSON.parse(cleaned);
    } catch {
      aiInterpretation = { yearOverview: rawText };
    }

    return NextResponse.json<ApiResponse>({
      success: true,
      data: {
        nativeName: profile.name,
        year,
        age,
        solarReturnDate: solarReturnDate.toISOString(),
        yearLord,
        munthaSign,
        munthaLord,
        solarReturnAscendant,
        solarReturnPlanets,
        solarReturnHouses,
        aiInterpretation,
      },
    });
  } catch (error) {
    if (creditCharged) {
      await refundCredits(supabase, user.id, 1, 'Refund: Varshaphal analysis (AI error)');
    }
    console.error('Varshaphal calculation error:', error);
    return NextResponse.json<ApiResponse>(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to calculate Varshaphal',
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
    return 5.5; // Default to IST
  }
}

/**
 * Convert Julian Day to a JS Date, accounting for timezone offset.
 */
function jdToDate(jd: number, tzOffsetHours: number): Date {
  // JD 2440587.5 = Jan 1, 1970 00:00:00 UTC
  const msFromEpoch = (jd - 2440587.5) * 86400000;
  const utcDate = new Date(msFromEpoch);
  // Adjust for timezone to get local time
  const localMs = utcDate.getTime() + tzOffsetHours * 3600000;
  return new Date(localMs);
}

/**
 * Get day of week: 0=Sunday, 1=Monday, ..., 6=Saturday
 */
function getDayOfWeek(date: Date): number {
  return date.getUTCDay();
}
