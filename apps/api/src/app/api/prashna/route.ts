import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAIMessage } from '@/lib/ai/aiProvider';
import { deductCredits, refundCredits } from '@/lib/credits/deductCredits';
// astro-engine loaded dynamically to avoid swisseph-wasm webpack bundling
import { VOICE_RULES } from '@/lib/ai/voiceRules';
import type { ApiResponse } from '@aroha-astrology/shared';

export const runtime = 'nodejs';
export const maxDuration = 300; // 10 minutes

// Sign lords for Prashna interpretation
const SIGN_LORDS: Record<string, string> = {
  Aries: 'Mars', Taurus: 'Venus', Gemini: 'Mercury', Cancer: 'Moon',
  Leo: 'Sun', Virgo: 'Mercury', Libra: 'Venus', Scorpio: 'Mars',
  Sagittarius: 'Jupiter', Capricorn: 'Saturn', Aquarius: 'Saturn', Pisces: 'Jupiter',
};

function buildPrashnaSystemPrompt(): string {
  return `You are a master Vedic astrologer specializing in Prashna Kundli (Horary Astrology).

${VOICE_RULES}

PRASHNA RULES YOU MUST FOLLOW:
1. The Ascendant (Lagna) lord represents the querent — the person asking the question.
2. The 7th house lord represents the quesited — the matter being asked about.
3. The Moon is the co-significator of the querent and its position, aspects, and last/next applying aspects are CRITICAL.
4. The house ruling the topic of the question is the primary house to examine:
   - 1st house: Self, health, general
   - 2nd house: Wealth, family
   - 3rd house: Siblings, courage, short travel
   - 4th house: Property, mother, vehicles, education
   - 5th house: Children, romance, speculation
   - 6th house: Enemies, disease, debts, service
   - 7th house: Marriage, partnerships, business
   - 8th house: Obstacles, transformation, occult
   - 9th house: Fortune, father, long travel, higher education
   - 10th house: Career, fame, authority
   - 11th house: Gains, income, wishes fulfilled
   - 12th house: Losses, foreign travel, spiritual liberation
5. Check if the Ascendant lord and Moon are strong (in own sign, exalted, friendly sign) — favorable indicator.
6. Malefics (Saturn, Mars, Rahu, Ketu) in the relevant house = obstacles.
7. Benefics (Jupiter, Venus, Mercury, Moon) in the relevant house = support.
8. Retrograde planets indicate delays or re-doing.
9. Combustion (planet too close to Sun) weakens the planet.
10. Rahu/Ketu on the Ascendant axis = karmic involvement, unusual circumstances.

RESPONSE FORMAT (JSON):
The "summary" field MUST be an ARRAY OF EXACTLY THREE STRINGS — [HOOK, NUANCE, ACTION]:
  [0] HOOK — 1–2 short sentences naming the direct answer.
  [1] NUANCE — 1–2 short sentences with the Vedic why (which house/planet carries the verdict).
  [2] ACTION — 1–2 short sentences with one concrete next step.
Short sentences only.

{
  "summary": ["hook", "nuance", "action"],
  "detailedAnalysis": "A comprehensive 3-5 paragraph analysis covering ascendant lord, Moon, relevant house lord, aspects, and planetary strengths. Reference specific positions.",
  "favorability": "favorable" | "unfavorable" | "mixed",
  "timing": "Indication of timing if applicable (soon, delayed, within X months)",
  "advice": "Specific advice based on the chart including any remedies",
  "keyFactors": ["List of 3-5 key astrological factors that influenced the reading"]
}

Respond ONLY with valid JSON. No markdown code fences.`;
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json<ApiResponse>({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  let creditCharged = false;
  try {
    const { dateToJulianDay, calculatePlanetPositions, calculateHouses, calculateAscendant } = await import('@aroha-astrology/astro-engine');

    const creditResult = await deductCredits(supabase, user.id, 1, 'feature_debit', 'Prashna kundli (horary astrology)');
    if (!creditResult.success) {
      return NextResponse.json<ApiResponse>({ success: false, error: 'INSUFFICIENT_TOKENS' }, { status: 402 });
    }
    creditCharged = true;

    const body = await req.json();
    const { question, latitude, longitude } = body as {
      question?: string;
      latitude?: number;
      longitude?: number;
    };

    if (!question || question.trim().length < 5) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'Please provide a meaningful question (at least 5 characters).' },
        { status: 400 },
      );
    }

    // Default to Delhi if no location provided
    const lat = latitude ?? 28.6139;
    const lng = longitude ?? 77.209;
    const tz = 5.5; // IST

    // Cast chart for the current moment
    const now = new Date();
    const jd = await dateToJulianDay(
      now.getFullYear(),
      now.getMonth() + 1,
      now.getDate(),
      now.getHours(),
      now.getMinutes(),
      tz,
    );

    const [planets, houses, ascendant] = await Promise.all([
      calculatePlanetPositions(jd, 'lahiri'),
      calculateHouses(jd, lat, lng, 'W', 'lahiri'),
      calculateAscendant(jd, lat, lng, 'lahiri'),
    ]);

    // Assign planets to houses
    const signToHouse: Record<number, number> = {};
    for (const h of houses) {
      signToHouse[h.signIndex] = h.house;
    }
    for (const p of planets) {
      const houseNum = signToHouse[p.signIndex];
      if (houseNum !== undefined) {
        p.house = houseNum;
        houses[houseNum - 1].planets.push(p.planet);
      }
    }

    // Build chart summary for AI
    const ascLord = SIGN_LORDS[ascendant.sign] || 'Unknown';
    const sign7Index = (ascendant.signIndex + 6) % 12;
    const signs = [
      'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
      'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
    ];
    const sign7 = signs[sign7Index];
    const lord7 = SIGN_LORDS[sign7] || 'Unknown';
    const moon = planets.find((p) => p.planet === 'Moon');

    const chartSummary = `
PRASHNA CHART (cast at ${now.toISOString()})
Location: ${lat.toFixed(4)}N, ${lng.toFixed(4)}E

ASCENDANT: ${ascendant.sign} (${ascendant.degree.toFixed(1)} deg) — Nakshatra: ${ascendant.nakshatra} Pada ${ascendant.nakshatraPada}
Ascendant Lord: ${ascLord}
7th House Sign: ${sign7} — Lord: ${lord7}

MOON: ${moon?.sign || 'N/A'} at ${moon?.signDegree.toFixed(1) || '?'} deg (House ${moon?.house || '?'}) — Nakshatra: ${moon?.nakshatra || 'N/A'}${moon?.isRetrograde ? ' [RETROGRADE]' : ''}

PLANETARY POSITIONS:
${planets.map((p) => `  ${p.planet}: ${p.sign} ${p.signDegree.toFixed(1)} deg (House ${p.house}) Nak: ${p.nakshatra} Pada ${p.nakshatraPada}${p.isRetrograde ? ' [R]' : ''}`).join('\n')}

HOUSE OCCUPANTS:
${houses.map((h) => `  House ${h.house} (${h.sign}): ${h.planets.length > 0 ? h.planets.join(', ') : 'Empty'}`).join('\n')}

QUESTION: "${question}"
`;

    // Call AI for interpretation
    const aiResponse = await createAIMessage({
      system: buildPrashnaSystemPrompt(),
      messages: [{ role: 'user', content: chartSummary }],
      max_tokens: 1500,
      jsonMode: true,
      temperature: 0.2,
    });

    const aiText = aiResponse.content?.[0]?.text || '{}';
    let interpretation;
    try {
      interpretation = JSON.parse(aiText);
    } catch {
      // If AI didn't return valid JSON, wrap the text
      interpretation = {
        summary: [aiText.slice(0, 200), '', ''],
        detailedAnalysis: aiText,
        favorability: 'mixed',
        timing: 'See detailed analysis',
        advice: 'See detailed analysis',
        keyFactors: [],
      };
    }

    return NextResponse.json<ApiResponse>({
      success: true,
      data: {
        question,
        castAt: now.toISOString(),
        location: { latitude: lat, longitude: lng },
        ascendant,
        planets,
        houses,
        interpretation,
      },
    });
  } catch (error) {
    if (creditCharged) {
      await refundCredits(supabase, user.id, 1, 'Refund: Prashna kundli (AI error)');
    }
    console.error('Prashna Kundli error:', error);
    return NextResponse.json<ApiResponse>(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to cast Prashna chart',
      },
      { status: 500 },
    );
  }
}
