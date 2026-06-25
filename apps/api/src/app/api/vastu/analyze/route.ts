import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAIMessage } from '@/lib/ai/aiProvider';
import { deductCredits, refundCredits } from '@/lib/credits/deductCredits';
import type { ApiResponse, VastuRequest } from '@aroha-astrology/shared';

// ============================================================
// Vastu Rules Engine
// ============================================================

interface VastuRule {
  room: string;
  idealDirections: string[];
  acceptableDirections: string[];
  avoidDirections: string[];
  weight: number;
  reason: string;
}

// Room keys here MUST match the UI's ROOM_TYPES ids in apps/web/src/app/(app)/vastu/page.tsx
const VASTU_RULES: VastuRule[] = [
  {
    room: 'kitchen',
    idealDirections: ['SE'],
    acceptableDirections: ['NW', 'E'],
    avoidDirections: ['NE', 'SW', 'N'],
    weight: 9,
    reason: 'Agni (fire) element resides in SE. Kitchen here promotes health and prosperity.',
  },
  {
    room: 'master_bed',
    idealDirections: ['SW'],
    acceptableDirections: ['S', 'W'],
    avoidDirections: ['NE', 'SE', 'N'],
    weight: 9,
    reason: 'SW provides stability, grounding, and authority to the head of household.',
  },
  {
    room: 'bed_2',
    idealDirections: ['NW', 'W'],
    acceptableDirections: ['S', 'N'],
    avoidDirections: ['NE', 'SE'],
    weight: 6,
    reason: 'Secondary bedrooms in NW/W support restful sleep without competing with the master bedroom energy in SW.',
  },
  {
    room: 'puja_room',
    idealDirections: ['NE'],
    acceptableDirections: ['E', 'N'],
    avoidDirections: ['S', 'SW', 'SE'],
    weight: 10,
    reason: 'NE (Ishaan) is the direction of divine energy and spiritual upliftment.',
  },
  {
    room: 'living',
    idealDirections: ['N', 'NE'],
    acceptableDirections: ['E', 'NW'],
    avoidDirections: ['SW', 'SE'],
    weight: 7,
    reason: 'North and NE attract positive energy, wealth, and social harmony.',
  },
  {
    room: 'entrance',
    idealDirections: ['N', 'NE', 'E'],
    acceptableDirections: ['NW'],
    avoidDirections: ['S', 'SW', 'SE', 'W'],
    weight: 10,
    reason: 'Entrance in N/NE/E allows maximum positive prana to enter the house.',
  },
  {
    room: 'bathroom',
    idealDirections: ['NW'],
    acceptableDirections: ['W', 'N'],
    avoidDirections: ['NE', 'E', 'SE', 'SW'],
    weight: 7,
    reason: 'NW (Vayu) helps drain negative energy. Bathroom in NE destroys positive energy.',
  },
  {
    room: 'store',
    idealDirections: ['SW'],
    acceptableDirections: ['S', 'W', 'NW'],
    avoidDirections: ['NE', 'E'],
    weight: 5,
    reason: 'SW is ideal for storage as it represents earth element and stability.',
  },
  {
    room: 'kids_room',
    idealDirections: ['W', 'NW'],
    acceptableDirections: ['N', 'E'],
    avoidDirections: ['SW', 'SE'],
    weight: 7,
    reason: 'West and NW promote creativity and growth for children.',
  },
  {
    room: 'dining',
    idealDirections: ['W', 'E'],
    acceptableDirections: ['N', 'NW'],
    avoidDirections: ['S', 'SE'],
    weight: 6,
    reason: 'West and East promote healthy digestion and family bonding during meals.',
  },
  {
    room: 'parking',
    idealDirections: ['NW', 'SE'],
    acceptableDirections: ['W', 'S'],
    avoidDirections: ['NE', 'E'],
    weight: 4,
    reason: 'NW (Vayu/movement) is ideal for vehicles. NE parking blocks the most sacred energy zone.',
  },
  {
    room: 'stairs',
    idealDirections: ['S', 'SW', 'W'],
    acceptableDirections: ['SE'],
    avoidDirections: ['NE', 'N', 'E'],
    weight: 6,
    reason: 'Stairs in SW/S keep grounding stable. NE stairs cut through the most sacred zone and drain household energy.',
  },
  {
    room: 'balcony',
    idealDirections: ['N', 'NE', 'E'],
    acceptableDirections: ['NW'],
    avoidDirections: ['SW', 'S'],
    weight: 4,
    reason: 'Open spaces in N/NE/E let morning light and prana flow through the home.',
  },
  {
    room: 'water_tank',
    idealDirections: ['NE', 'N'],
    acceptableDirections: ['E', 'NW'],
    avoidDirections: ['SE', 'S', 'SW'],
    weight: 6,
    reason: 'Water in NE supports prosperity and health. Water in SE clashes with the fire element and causes friction.',
  },
];

interface RoomScore {
  room: string;
  currentDirection: string;
  idealDirections: string[];
  score: number;
  status: 'ideal' | 'acceptable' | 'poor' | 'harmful';
  suggestion: string;
  reason: string;
}

function evaluateRoomPlacement(
  roomLayout: Record<string, string[]>,
): { roomScores: RoomScore[]; overallScore: number } {
  const roomScores: RoomScore[] = [];
  let totalWeight = 0;
  let totalWeightedScore = 0;

  for (const rule of VASTU_RULES) {
    const directions = roomLayout[rule.room];
    if (!directions || directions.length === 0) continue;

    for (const direction of directions) {
      const upperDir = direction.toUpperCase();
      let score: number;
      let status: RoomScore['status'];
      let suggestion: string;

      if (rule.idealDirections.includes(upperDir)) {
        score = 100;
        status = 'ideal';
        suggestion = `Excellent placement! ${rule.room} in ${upperDir} is perfectly aligned with Vastu principles.`;
      } else if (rule.acceptableDirections.includes(upperDir)) {
        score = 65;
        status = 'acceptable';
        suggestion = `Acceptable placement. Ideally, ${rule.room} should be in ${rule.idealDirections.join(' or ')}.`;
      } else if (rule.avoidDirections.includes(upperDir)) {
        score = 15;
        status = 'harmful';
        suggestion = `Vastu defect! ${rule.room} in ${upperDir} is harmful. Move to ${rule.idealDirections.join(' or ')} if possible. Apply remedies if not.`;
      } else {
        score = 45;
        status = 'poor';
        suggestion = `Not ideal. ${rule.room} should ideally be in ${rule.idealDirections.join(' or ')}.`;
      }

      roomScores.push({
        room: rule.room,
        currentDirection: upperDir,
        idealDirections: rule.idealDirections,
        score,
        status,
        suggestion,
        reason: rule.reason,
      });

      totalWeight += rule.weight;
      totalWeightedScore += score * rule.weight;
    }
  }

  const overallScore = totalWeight > 0 ? Math.round(totalWeightedScore / totalWeight) : 50;

  return { roomScores, overallScore };
}

// ============================================================
// POST /api/vastu/analyze
// ============================================================

export const maxDuration = 300; // 10 minutes

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json<ApiResponse>({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  let creditCharged = false;
  try {
    const creditResult = await deductCredits(supabase, user.id, 1, 'feature_debit', 'Vastu analysis');
    if (!creditResult.success) {
      return NextResponse.json<ApiResponse>({ success: false, error: 'INSUFFICIENT_TOKENS' }, { status: 402 });
    }
    creditCharged = true;

    const body: VastuRequest = await request.json();
    const { roomLayout, roomDetails } = body;

    if (!roomLayout || typeof roomLayout !== 'object') {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'roomLayout is required as a map of room -> directions[]' },
        { status: 400 },
      );
    }

    // Run Vastu rules engine
    const { roomScores, overallScore } = evaluateRoomPlacement(roomLayout);

    // Call AI for detailed analysis and remedies
    const analysisContext = {
      roomLayout,
      roomDetails: roomDetails ?? {},
      roomScores,
      overallScore,
      vastuRules: VASTU_RULES.map((r) => ({
        room: r.room,
        idealDirections: r.idealDirections,
        reason: r.reason,
      })),
    };

    const message = await createAIMessage({
      max_tokens: 8000,
      temperature: 0.4,
      jsonMode: true,
      skipPersona: true,
      system: `You are a Vastu Shastra consultant helping homeowners improve their daily wellbeing through space arrangement. You ALWAYS respond with valid JSON matching the schema below — no prose before or after.

TONE (follow strictly):
- Lead with the human effect — sleep quality, stress, health, finances, relationships, mental clarity — before stating the Vastu principle.
- Keep Sanskrit terms (Ishaan, Agni, Vayu, Brahmasthan) minimal: use each at most once, with plain English meaning alongside.
- Be warm and direct. No academic jargon.

REMEDY (follow strictly):
- Every remedy must be specific and doable today: name the exact object, color, placement, or action.
- Bad: "balance the fire element." Good: "Hang a red or orange curtain on the south wall of the kitchen."
- Bad: "energise the space." Good: "Place a bowl of sea salt in the NE corner and replace it weekly."

FURNITURE ANALYSIS — roomDetails keys with pattern "*_interior_<item>" contain furniture placement data.
Interpret these when generating room-level advice:
- Bed headboard direction: South is ideal (deep sleep, long life). North drains energy and disturbs sleep.
- Study desk facing: East or North promotes focus. South or West causes fatigue.
- Television: South or West wall is fine. East wall causes eye strain from morning glare.
- Wardrobe in SW corner of bedroom adds stability and security.
- Mirror: Never directly facing the bed. Best on north or east wall.
- Idol / altar facing: East (devotee faces east while praying) is ideal.

ROOM ANALYSIS RULES (critical):
- Include EVERY room from the vastuScores input in roomAnalysis — do not skip any.
- In "room" field: use the EXACT key string from vastuScores input (e.g. if vastuScores has "bathroom", use "bathroom" not "Bathroom").
- "good" field: ALWAYS include for every room. For ideal/acceptable: what benefit this placement brings. For poor/harmful: the one thing that could still help (e.g. strong remedy options available, or other rooms compensating).
- "impact" field: ALWAYS include for every room. For ideal: the life benefit this placement brings (sleep, health, etc.). For acceptable: one minor concern to watch. For poor/harmful: direct human impact on daily life.
- "remedy" field: ALWAYS include for every room. For ideal: one enhancement tip to make it even stronger. For acceptable: one specific improvement. For poor/harmful: concrete remedy with exact object, color, placement.
- "highlights" field: ALWAYS 3 bullet-point strings — the 3 most important facts about this room for the resident. Human-impact first. Mix of what's working, what to watch, and one action.

The "summary" field MUST be the H/N/A 3-line structure — an ARRAY OF EXACTLY THREE STRINGS:
  [0] HOOK — 1–2 short sentences on the biggest issue in human terms (e.g. "Restless sleep and money stress are likely in this layout.").
  [1] NUANCE — 1–2 short sentences with the Vastu reason, stated plainly.
  [2] ACTION — 1–2 short sentences with one concrete first step.

Respond as valid JSON:
{
  "overallAssessment": "string (Excellent/Good/Average/Poor/Critical)",
  "overallScore": number,
  "summary": ["hook", "nuance", "action"],
  "summaryParagraph": "string (2-3 paragraph overview in plain, warm language)",
  "notesAnswer": "string — if roomDetails contains 'extra_notes', answer it directly and warmly in 2-3 sentences addressing the specific concern. Empty string if no extra_notes provided.",
  "notesAnswerItems": ["array of purchasable item names that appear in notesAnswer — e.g. specific plant names, gemstones, yantras, colored cloth. Empty array if notesAnswer mentions no items."],
  "elementBalance": {
    "earth": { "status": "balanced|excess|deficient", "suggestion": "string" },
    "water": { "status": "balanced|excess|deficient", "suggestion": "string" },
    "fire": { "status": "balanced|excess|deficient", "suggestion": "string" },
    "air": { "status": "balanced|excess|deficient", "suggestion": "string" },
    "space": { "status": "balanced|excess|deficient", "suggestion": "string" }
  },
  "roomAnalysis": [
    {
      "room": "EXACT room key from vastuScores input — no transformation, no capitalisation",
      "currentPlacement": "string (direction, uppercase)",
      "assessment": "ideal|acceptable|poor|harmful",
      "good": "ALWAYS REQUIRED: what is working or what benefit exists for this room",
      "impact": "ALWAYS REQUIRED: human-first effect — sleep, health, finances, relationships, clarity",
      "remedy": "ALWAYS REQUIRED: specific doable remedy with exact item, color, placement or action",
      "highlights": ["EXACTLY 3 strings: most important facts for this room, human-impact first"],
      "buyItems": ["array of purchasable item names from remedy — minimum 2 if remedy mentions items; empty array only if placement is fully ideal with no remediation needed"]
    }
  ],
  "criticalDefects": ["string array — human-impact framing, most urgent first"],
  "remedies": {
    "structural": ["string array — structural changes if possible"],
    "nonStructural": ["string array — specific non-structural remedies: exact objects, colors, plants"],
    "mantras": ["string array — recommended mantras with brief purpose"],
    "yantras": ["string array — recommended yantras and exact placement"],
    "colors": { "room_name": "recommended color scheme with reason" },
    "plants": ["string array — plant name + exact placement corner"]
  },
  "directionGuidance": {
    "sleeping": "string (head direction + why in human terms)",
    "working": "string (facing direction + expected benefit)",
    "cooking": "string (facing direction + effect on health/mood)",
    "studying": "string (facing direction + focus benefit)"
  },
  "positiveAspects": ["string array — what is already working well"],
  "priorityActions": ["string array — top 3–5 actions, ordered by impact, specific and doable"]
}`,
      messages: [
        { role: 'user', content: JSON.stringify(analysisContext) },
      ],
    });

    const textBlock = message.content.find((block) => block.type === 'text');
    const rawAnalysis = textBlock?.text ?? '{}';

    let detailedAnalysis: Record<string, unknown>;
    try {
      const cleaned = rawAnalysis.replace(/```json\n?/gi, '').replace(/```\n?/g, '').trim();
      detailedAnalysis = JSON.parse(cleaned);
    } catch {
      // Fallback: extract first { ... last } block (handles prose-wrapped output)
      try {
        const start = rawAnalysis.indexOf('{');
        const end = rawAnalysis.lastIndexOf('}');
        if (start >= 0 && end > start) {
          detailedAnalysis = JSON.parse(rawAnalysis.slice(start, end + 1));
        } else {
          throw new Error('No JSON object found');
        }
      } catch (err) {
        console.error('[vastu/analyze] JSON parse failed. First 500 chars of AI response:', rawAnalysis.slice(0, 500));
        console.error('[vastu/analyze] Parse error:', err);
        detailedAnalysis = { summary: rawAnalysis, parseError: true };
      }
    }

    // Combine rule-based and AI analysis
    const fullAnalysis: Record<string, unknown> = {
      ...detailedAnalysis,
      vastuScores: roomScores,
      overallVastuScore: overallScore,
    };

    // Store analysis
    const { data: vastuRecord, error: vastuError } = await supabase
      .from('vastu_analyses')
      .insert({
        user_id: user.id,
        room_layout: roomLayout as unknown as Record<string, unknown>,
        room_details: (roomDetails ?? {}) as unknown as Record<string, unknown>,
        analysis: fullAnalysis,
      })
      .select()
      .single();

    if (vastuError) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: `Failed to store Vastu analysis: ${vastuError.message}` },
        { status: 500 },
      );
    }

    return NextResponse.json<ApiResponse>({
      success: true,
      data: {
        analysisId: vastuRecord.id,
        overallScore,
        analysis: fullAnalysis,
      },
    });
  } catch (error) {
    if (creditCharged) {
      await refundCredits(supabase, user.id, 1, 'Refund: Vastu analysis (AI error)');
    }
    console.error('Vastu analysis error:', error);
    return NextResponse.json<ApiResponse>(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to analyze Vastu',
      },
      { status: 500 },
    );
  }
}
