import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAIMessage } from '@/lib/ai/aiProvider';
import { deductCredits, refundCredits } from '@/lib/credits/deductCredits';
import type { ApiResponse } from '@aroha-astrology/shared';
import { NAKSHATRAS, NAKSHATRA_SPAN } from '@aroha-astrology/shared';

// ============================================================
// Nakshatra → Starting Syllables Mapping
// ============================================================

export const maxDuration = 300; // 10 minutes

const NAKSHATRA_SYLLABLES: Record<string, string[]> = {
  Ashwini: ['Chu', 'Che', 'Cho', 'La'],
  Bharani: ['Li', 'Lu', 'Le', 'Lo'],
  Krittika: ['A', 'I', 'U', 'E'],
  Rohini: ['O', 'Va', 'Vi', 'Vu'],
  Mrigashira: ['Ve', 'Vo', 'Ka', 'Ki'],
  Ardra: ['Ku', 'Gha', 'Ng', 'Na'],
  Punarvasu: ['Ke', 'Ko', 'Ha', 'Hi'],
  Pushya: ['Hu', 'He', 'Ho', 'Da'],
  Ashlesha: ['Di', 'Du', 'De', 'Do'],
  Magha: ['Ma', 'Mi', 'Mu', 'Me'],
  PurvaPhalguni: ['Mo', 'Ta', 'Ti', 'Tu'],
  UttaraPhalguni: ['Te', 'To', 'Pa', 'Pi'],
  Hasta: ['Pu', 'Sha', 'Na', 'Tha'],
  Chitra: ['Pe', 'Po', 'Ra', 'Ri'],
  Swati: ['Ru', 'Re', 'Ro', 'Ta'],
  Vishakha: ['Ti', 'Tu', 'Te', 'To'],
  Anuradha: ['Na', 'Ni', 'Nu', 'Ne'],
  Jyeshtha: ['No', 'Ya', 'Yi', 'Yu'],
  Moola: ['Ye', 'Yo', 'Bha', 'Bhi'],
  PurvaAshadha: ['Bhu', 'Dha', 'Pha', 'Da'],
  UttaraAshadha: ['Bhe', 'Bho', 'Ja', 'Ji'],
  Shravana: ['Ju', 'Khi', 'Je', 'Khu', 'Jo', 'Khe', 'Gha', 'Kho'],
  Dhanishta: ['Ga', 'Gi', 'Gu', 'Ge'],
  Shatabhisha: ['Go', 'Sa', 'Si', 'Su'],
  PurvaBhadrapada: ['Se', 'So', 'Da', 'Di'],
  UttaraBhadrapada: ['Du', 'Tha', 'Jha', 'Da'],
  Revati: ['De', 'Do', 'Cha', 'Chi'],
};

// Display-friendly nakshatra names
const NAKSHATRA_DISPLAY: Record<string, string> = {
  Ashwini: 'Ashwini',
  Bharani: 'Bharani',
  Krittika: 'Krittika',
  Rohini: 'Rohini',
  Mrigashira: 'Mrigashira',
  Ardra: 'Ardra',
  Punarvasu: 'Punarvasu',
  Pushya: 'Pushya',
  Ashlesha: 'Ashlesha',
  Magha: 'Magha',
  PurvaPhalguni: 'Purva Phalguni',
  UttaraPhalguni: 'Uttara Phalguni',
  Hasta: 'Hasta',
  Chitra: 'Chitra',
  Swati: 'Swati',
  Vishakha: 'Vishakha',
  Anuradha: 'Anuradha',
  Jyeshtha: 'Jyeshtha',
  Moola: 'Mula',
  PurvaAshadha: 'Purva Ashadha',
  UttaraAshadha: 'Uttara Ashadha',
  Shravana: 'Shravana',
  Dhanishta: 'Dhanishta',
  Shatabhisha: 'Shatabhisha',
  PurvaBhadrapada: 'Purva Bhadrapada',
  UttaraBhadrapada: 'Uttara Bhadrapada',
  Revati: 'Revati',
};

// ============================================================
// Helper: Calculate lucky number from DOB (numerology reduction)
// ============================================================

function calculateLuckyNumber(dob: string): number {
  const digits = dob.replace(/\D/g, '');
  let sum = 0;
  for (const d of digits) {
    sum += parseInt(d, 10);
  }
  // Reduce to single digit
  while (sum > 9) {
    let newSum = 0;
    while (sum > 0) {
      newSum += sum % 10;
      sum = Math.floor(sum / 10);
    }
    sum = newSum;
  }
  return sum;
}

// ============================================================
// Helper: Approximate nakshatra from DOB
// Uses a simple approximation based on Moon's average daily motion
// ============================================================

function approximateNakshatraFromDob(dob: string): string {
  const date = new Date(dob);
  // Use a simplified calculation: Moon moves ~13.2 degrees/day
  // Epoch: Jan 1 2000, Moon longitude ~0° (approximate)
  const epoch = new Date('2000-01-01T00:00:00Z');
  const daysDiff = (date.getTime() - epoch.getTime()) / (1000 * 60 * 60 * 24);
  const moonDailyMotion = 13.176; // degrees per day
  const moonLong = ((daysDiff * moonDailyMotion) % 360 + 360) % 360;
  const nakshatraIndex = Math.floor(moonLong / NAKSHATRA_SPAN);
  const clampedIndex = Math.min(nakshatraIndex, 26);
  return NAKSHATRAS[clampedIndex];
}

// ============================================================
// POST /api/baby-names
// ============================================================

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json<ApiResponse>({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  let creditCharged = false;
  try {
    const creditResult = await deductCredits(supabase, user.id, 1, 'feature_debit', 'Baby name suggestions');
    if (!creditResult.success) {
      return NextResponse.json<ApiResponse>({ success: false, error: 'INSUFFICIENT_TOKENS' }, { status: 402 });
    }
    creditCharged = true;

    const body = await request.json();
    const { dob, gender, nakshatra: nakshatraOverride } = body as {
      dob: string;
      gender: 'male' | 'female';
      nakshatra?: string;
    };

    if (!dob || !gender) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'dob and gender are required' },
        { status: 400 },
      );
    }

    // Determine nakshatra
    const nakshatra = nakshatraOverride || approximateNakshatraFromDob(dob);
    const syllables = NAKSHATRA_SYLLABLES[nakshatra] ?? ['A', 'I', 'U', 'E'];
    const displayNakshatra = NAKSHATRA_DISPLAY[nakshatra] ?? nakshatra;
    const luckyNumber = calculateLuckyNumber(dob);

    // Call AI to generate baby names
    const message = await createAIMessage({
      max_tokens: 1500,
      jsonMode: true,
      temperature: 0.2,
      system: `You are an expert in Vedic astrology baby naming (Naam Karan). Generate exactly 20 unique baby names based on the given nakshatra syllables, gender, and numerology lucky number.

For each name:
- The name MUST start with one of the provided syllables
- The name should be appropriate for the given gender
- Include a meaning for each name
- Calculate a numerology score (1-9) based on the name letters
- Specify the cultural origin (e.g., Sanskrit, Hindi, Tamil, Bengali, etc.)

The "summary" field MUST be the H/N/A 3-line structure — an ARRAY OF EXACTLY THREE STRINGS:
  [0] HOOK — 1–2 short sentences naming the energy these names share for this child.
  [1] NUANCE — 1–2 short sentences with the Vedic why (this nakshatra and lucky number).
  [2] ACTION — 1–2 short sentences advising the parents on choosing.
Short sentences only.

Respond ONLY with valid JSON in this exact format:
{
  "summary": ["hook", "nuance", "action"],
  "names": [
    { "name": "string", "meaning": "string", "numerologyScore": number, "origin": "string" }
  ]
}

Generate a good mix of traditional and modern names. Prefer names where the numerology score matches or harmonizes with the lucky number.`,
      messages: [
        {
          role: 'user',
          content: `Generate 20 ${gender} baby names for a child born on ${dob}.
Nakshatra: ${displayNakshatra}
Starting syllables: ${syllables.join(', ')}
Numerology lucky number: ${luckyNumber}
Gender: ${gender}`,
        },
      ],
    });

    const textBlock = message.content.find((block) => block.type === 'text');
    const rawText = textBlock?.text ?? '{}';

    let parsed: { summary?: string[]; names: Array<{ name: string; meaning: string; numerologyScore: number; origin: string }> };
    try {
      const cleaned = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = { names: [] };
    }

    return NextResponse.json<ApiResponse>({
      success: true,
      data: {
        nakshatra: displayNakshatra,
        syllables,
        luckyNumber,
        summary: parsed.summary,
        names: parsed.names ?? [],
      },
    });
  } catch (error) {
    if (creditCharged) {
      await refundCredits(supabase, user.id, 1, 'Refund: Baby name suggestions (AI error)');
    }
    console.error('Baby names error:', error);
    return NextResponse.json<ApiResponse>(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate baby names',
      },
      { status: 500 },
    );
  }
}
