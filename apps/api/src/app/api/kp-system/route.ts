import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAIMessage } from '@/lib/ai/aiProvider';
import { deductCredits, refundCredits } from '@/lib/credits/deductCredits';
import type { ApiResponse } from '@aroha-astrology/shared';
import {
  ZODIAC_SIGNS,
  SIGN_LORDS,
  NAKSHATRA_LORDS,
  NAKSHATRAS,
  NAKSHATRA_SPAN,
  VIMSHOTTARI_ORDER,
  VIMSHOTTARI_YEARS,
  VIMSHOTTARI_TOTAL_YEARS,
} from '@aroha-astrology/shared';
import type { Planet, ZodiacSign } from '@aroha-astrology/shared';

// ============================================================
// KP Sub-Lord Calculation Helpers
// ============================================================

export const maxDuration = 300; // 10 minutes

/**
 * Get the zodiac sign for a given longitude (0-360).
 */
function getSign(longitude: number): ZodiacSign {
  const normalized = ((longitude % 360) + 360) % 360;
  const signIndex = Math.floor(normalized / 30);
  return ZODIAC_SIGNS[signIndex];
}

/**
 * Get the sign lord for a given longitude.
 */
function getSignLord(longitude: number): Planet {
  return SIGN_LORDS[getSign(longitude)];
}

/**
 * Get the nakshatra index (0-26) for a given longitude.
 */
function getNakshatraIndex(longitude: number): number {
  const normalized = ((longitude % 360) + 360) % 360;
  return Math.floor(normalized / NAKSHATRA_SPAN);
}

/**
 * Get the star lord (nakshatra lord) for a given longitude.
 */
function getStarLord(longitude: number): Planet {
  return NAKSHATRA_LORDS[getNakshatraIndex(longitude)];
}

/**
 * Get the nakshatra name for a given longitude.
 */
function getNakshatraName(longitude: number): string {
  return NAKSHATRAS[getNakshatraIndex(longitude)];
}

/**
 * Calculate the KP sub-lord for a given longitude.
 *
 * Each nakshatra (13deg 20min) is divided into 9 sub-divisions
 * proportional to the Vimshottari dasha years of each planet.
 * The sub-division cycle starts from the nakshatra lord and
 * follows the Vimshottari order.
 */
function getSubLord(longitude: number): Planet {
  const normalized = ((longitude % 360) + 360) % 360;

  // Position within the current nakshatra (0 to NAKSHATRA_SPAN)
  const posInNakshatra = normalized % NAKSHATRA_SPAN;

  // The sub-lord cycle starts from the nakshatra lord
  const nakshatraLord = getStarLord(longitude);
  const startIdx = VIMSHOTTARI_ORDER.indexOf(nakshatraLord);

  // Walk through the 9 sub-divisions proportional to dasha years
  let accumulated = 0;
  for (let i = 0; i < 9; i++) {
    const planet = VIMSHOTTARI_ORDER[(startIdx + i) % 9];
    const subSpan = (VIMSHOTTARI_YEARS[planet] / VIMSHOTTARI_TOTAL_YEARS) * NAKSHATRA_SPAN;
    accumulated += subSpan;
    if (posInNakshatra < accumulated) {
      return planet;
    }
  }

  // Fallback (should not reach here)
  return nakshatraLord;
}

interface CuspEntry {
  house: number;
  degree: string;
  longitude: number;
  sign: ZodiacSign;
  signLord: Planet;
  nakshatra: string;
  starLord: Planet;
  subLord: Planet;
}

interface PlanetSignificator {
  planet: Planet;
  sign: ZodiacSign;
  longitude: number;
  nakshatra: string;
  starLord: Planet;
  subLord: Planet;
  housesOwned: number[];
  housesOccupied: number;
  starLordHouses: number[];
}

// ============================================================
// POST /api/kp-system
// ============================================================

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json<ApiResponse>({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  let creditCharged = false;
  try {
    const creditResult = await deductCredits(supabase, user.id, 1, 'feature_debit', 'KP system analysis');
    if (!creditResult.success) {
      return NextResponse.json<ApiResponse>({ success: false, error: 'INSUFFICIENT_TOKENS' }, { status: 402 });
    }
    creditCharged = true;

    const body = await request.json();
    const { chartId } = body as { chartId: string };

    if (!chartId) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'chartId is required' },
        { status: 400 },
      );
    }

    // Fetch chart data
    const { data: chart, error: chartError } = await supabase
      .from('kundli_charts')
      .select(`
        *,
        birth_profiles (
          name, dob, tob, tob_source, pob, gender
        )
      `)
      .eq('id', chartId)
      .eq('user_id', user.id)
      .single();

    if (chartError || !chart) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'Chart not found' },
        { status: 404 },
      );
    }

    const chartData = chart.chart_data as {
      houses?: Array<{ house: number; longitude: number }>;
      planets?: Array<{ planet: string; longitude: number; sign: string; house: number }>;
    };

    if (!chartData?.houses || !chartData?.planets) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'Chart data does not contain house/planet information' },
        { status: 400 },
      );
    }

    // Build cusp table
    const cusps: CuspEntry[] = chartData.houses.map((h) => {
      const lon = h.longitude;
      return {
        house: h.house,
        degree: `${Math.floor(lon)}° ${Math.floor((lon % 1) * 60)}'`,
        longitude: lon,
        sign: getSign(lon),
        signLord: getSignLord(lon),
        nakshatra: getNakshatraName(lon),
        starLord: getStarLord(lon),
        subLord: getSubLord(lon),
      };
    });

    // Build planet significators
    const signToHouses: Record<string, number[]> = {};
    for (const cusp of cusps) {
      if (!signToHouses[cusp.sign]) signToHouses[cusp.sign] = [];
      signToHouses[cusp.sign].push(cusp.house);
    }

    const planetSignificators: PlanetSignificator[] = chartData.planets.map((p) => {
      const lon = p.longitude;
      const planet = p.planet as Planet;
      const sign = getSign(lon);
      const starLord = getStarLord(lon);

      // Houses owned by this planet (as sign lord)
      const housesOwned: number[] = [];
      for (const cusp of cusps) {
        if (cusp.signLord === planet) {
          housesOwned.push(cusp.house);
        }
      }

      // Houses where star lord is sign lord
      const starLordHouses: number[] = [];
      for (const cusp of cusps) {
        if (cusp.signLord === starLord) {
          starLordHouses.push(cusp.house);
        }
      }

      return {
        planet,
        sign,
        longitude: lon,
        nakshatra: getNakshatraName(lon),
        starLord,
        subLord: getSubLord(lon),
        housesOwned,
        housesOccupied: p.house,
        starLordHouses,
      };
    });

    // Ruling planets at the moment of analysis
    const now = new Date();
    const nowLongitude = ((now.getTime() / 86400000) * 0.9856) % 360; // approximate
    const rulingPlanets = {
      dayLord: getDayLord(now.getDay()),
      moonSignLord: chartData.planets.find((p) => p.planet === 'Moon')
        ? getSignLord(chartData.planets.find((p) => p.planet === 'Moon')!.longitude)
        : 'Moon' as Planet,
      moonStarLord: chartData.planets.find((p) => p.planet === 'Moon')
        ? getStarLord(chartData.planets.find((p) => p.planet === 'Moon')!.longitude)
        : 'Ketu' as Planet,
      ascendantSignLord: cusps[0]?.signLord ?? ('Mars' as Planet),
      ascendantStarLord: cusps[0]?.starLord ?? ('Ketu' as Planet),
    };

    // Call AI for KP interpretation
    const kpContext = {
      profile: chart.birth_profiles,
      cusps,
      planetSignificators,
      rulingPlanets,
      dashaData: chart.dasha_data,
      currentDate: new Date().toISOString(),
    };

    const profile = Array.isArray(chart.birth_profiles)
      ? chart.birth_profiles[0]
      : (chart.birth_profiles as { dob?: string } | null);
    const { getAgeDemographic, buildToneRules } = await import('@/lib/ai/toneRouting');
    const toneBlock = buildToneRules(getAgeDemographic((profile as { dob?: string } | null)?.dob));

    const systemPrompt = `You are an expert KP (Krishnamurti Paddhati) astrologer. Analyze the chart using KP principles.

${toneBlock}

IMPORTANT KP RULES:
1. The SUB-LORD of a house cusp is the primary determinant for predictions of that house.
2. A planet signifies a house through: (a) its star-lord's house ownership, (b) its own house ownership, (c) the house it occupies.
3. Ruling planets at the moment of judgment confirm or deny events.
4. Focus on sub-lord connections — which houses does the sub-lord signify?

Provide your analysis as valid JSON. The "summary" field MUST be an array of exactly 3 strings — [HOOK, NUANCE, ACTION] per the structure directive above:
{
  "summary": ["HOOK sentence", "NUANCE sentence", "ACTION sentence"],
  "houseAnalysis": [
    {
      "house": 1,
      "area": "Self, personality, health",
      "subLordSignifies": "string — which houses the sub-lord of this cusp connects to",
      "prediction": "string — what this means for the native",
      "favorable": true/false
    }
  ],
  "lifeAreas": {
    "marriage": "KP analysis for 7th house sub-lord and significators",
    "career": "KP analysis for 10th house sub-lord and significators",
    "wealth": "KP analysis for 2nd and 11th house sub-lords",
    "health": "KP analysis for 1st and 6th house sub-lords",
    "education": "KP analysis for 4th and 9th house sub-lords",
    "children": "KP analysis for 5th house sub-lord"
  },
  "rulingPlanetAnalysis": "Analysis of ruling planets and their confirmation",
  "significatorSummary": "Key significator connections found in the chart"
}`;

    const message = await createAIMessage({
      max_tokens: 1500,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: JSON.stringify(kpContext),
        },
      ],
      jsonMode: true,
      temperature: 0.2,
    });

    const textBlock = message.content.find((block) => block.type === 'text');
    const rawContent = textBlock?.text ?? '{}';

    let kpInterpretation: Record<string, unknown>;
    try {
      const cleaned = rawContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      kpInterpretation = JSON.parse(cleaned);
    } catch {
      kpInterpretation = {
        summary: rawContent,
        houseAnalysis: [],
        lifeAreas: {},
        rulingPlanetAnalysis: '',
        significatorSummary: '',
      };
    }

    return NextResponse.json<ApiResponse>({
      success: true,
      data: {
        cusps,
        planetSignificators,
        rulingPlanets,
        interpretation: kpInterpretation,
      },
    });
  } catch (error) {
    if (creditCharged) {
      await refundCredits(supabase, user.id, 1, 'Refund: KP system analysis (AI error)');
    }
    console.error('KP System analysis error:', error);
    return NextResponse.json<ApiResponse>(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to analyze KP system',
      },
      { status: 500 },
    );
  }
}

function getDayLord(dayOfWeek: number): Planet {
  const dayLords: Planet[] = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'];
  return dayLords[dayOfWeek];
}
