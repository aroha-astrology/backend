import { NextResponse } from 'next/server';
import { createAIMessage } from '@/lib/ai/aiProvider';
import { createServerSupabase } from '@/lib/supabase/server';
import { LIFE_DECISION_CATEGORIES } from '@aroha-astrology/shared';

export async function GET(request: Request, { params }: { params: Promise<{ category: string }> }) {
  try {
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { category } = await params;

    if (!LIFE_DECISION_CATEGORIES.includes(category as never)) {
      return NextResponse.json({ success: false, error: 'Invalid category' }, { status: 400 });
    }

    // Get user's latest chart for personalization
    const { data: chart } = await supabase
      .from('kundli_charts')
      .select('chart_data, dasha_data')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    const chartData = chart?.chart_data as Record<string, unknown> | undefined;
    const dashaData = chart?.dasha_data as Record<string, unknown> | undefined;
    const planets = chartData?.planets as Array<Record<string, unknown>> | undefined;
    const moonSign = planets?.find((p) => p.planet === 'Moon')?.sign ?? 'unknown';
    const vimshottari = dashaData?.vimshottari as Record<string, unknown> | undefined;
    const currentMD = (vimshottari?.currentMahadasha as Record<string, unknown> | undefined)?.planet ?? 'unknown';
    const ascendant = (chartData?.ascendant as Record<string, unknown> | undefined)?.sign ?? 'unknown';

    const chartContext = chart
      ? `User's Moon sign (Rashi): ${moonSign}. Current Mahadasha: ${currentMD}. Ascendant: ${ascendant}.`
      : 'No birth chart available. Provide general Vedic guidance.';

    const message = await createAIMessage({
      max_tokens: 2000,
      system: `You are a Vedic astrologer providing life decision guidance.

Category: ${category}
${chartContext}

Provide personalized guidance based on Vedic astrology principles.

The "summary" field is the H/N/A 3-line structure — an ARRAY OF EXACTLY THREE STRINGS:
  [0] HOOK — 1–2 short sentences naming the cleanest path forward.
  [1] NUANCE — 1–2 short sentences with the planetary why (this dasha/transit).
  [2] ACTION — 1–2 short sentences with one concrete next step.
Short sentences only.

Respond in JSON:
{
  "summary": ["hook", "nuance", "action"],
  "title": "Decision title",
  "guidance": "2-3 paragraphs of personalized astrological guidance",
  "bestMuhurta": {
    "description": "Best time to proceed",
    "day": "best day of week",
    "nakshatra": "favorable nakshatra",
    "tithi": "favorable tithi"
  },
  "proTip": "One powerful actionable tip",
  "options": [
    {
      "name": "Option A",
      "description": "What this option entails",
      "planetaryReasoning": "Why stars favor/disfavor this",
      "expectedTimeline": "When results manifest",
      "outcome": "Expected outcome",
      "isBest": true
    },
    {
      "name": "Option B",
      "description": "...",
      "planetaryReasoning": "...",
      "expectedTimeline": "...",
      "outcome": "...",
      "isBest": false
    },
    {
      "name": "Option C",
      "description": "...",
      "planetaryReasoning": "...",
      "expectedTimeline": "...",
      "outcome": "...",
      "isBest": false
    },
    {
      "name": "Option D",
      "description": "...",
      "planetaryReasoning": "...",
      "expectedTimeline": "...",
      "outcome": "...",
      "isBest": false
    }
  ]
}`,
      messages: [
        {
          role: 'user',
          content: `Provide Vedic guidance for life decision: ${category}`,
        },
      ],
    });

    const textContent = message.content.find((c) => c.type === 'text');
    let raw: Record<string, unknown> = {};

    if (textContent && textContent.type === 'text') {
      try {
        // Strip markdown code fences if present
        const cleaned = textContent.text.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
        raw = JSON.parse(cleaned);
      } catch {
        raw = {};
      }
    }

    // Extract rashi from chart data
    const rashi = chart
      ? (() => {
          const planets = (chart.chart_data as Record<string, unknown>)?.planets;
          if (Array.isArray(planets)) {
            const moon = planets.find((p: Record<string, unknown>) => p.planet === 'Moon');
            return (moon as Record<string, unknown>)?.sign as string || '';
          }
          return '';
        })()
      : '';

    // Transform AI camelCase response to page's expected snake_case shape
    type RawOption = {
      name?: string;
      planetaryReasoning?: string;
      expectedTimeline?: string;
      outcome?: string;
      isBest?: boolean;
    };
    const options = Array.isArray(raw.options)
      ? (raw.options as RawOption[]).map((o) => ({
          name: o.name ?? '',
          planetary_reasoning: o.planetaryReasoning ?? '',
          expected_timeline: o.expectedTimeline ?? '',
          outcome_description: o.outcome ?? '',
          is_best: o.isBest ?? false,
        }))
      : [];

    const bestMuhurta = raw.bestMuhurta as Record<string, string> | undefined;
    const best_muhurta = bestMuhurta
      ? `${bestMuhurta.description ?? ''} (${bestMuhurta.day ?? ''}, ${bestMuhurta.nakshatra ?? ''} nakshatra, ${bestMuhurta.tithi ?? ''} tithi)`.replace(/\(\s*,\s*,\s*\)/g, '').trim()
      : '';

    const result = {
      category,
      rashi,
      guidance: (raw.guidance as string) ?? '',
      best_muhurta,
      pro_tip: (raw.proTip as string) ?? '',
      options,
    };

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('Life decisions error:', error);
    return NextResponse.json({ success: false, error: 'Failed to get guidance', debug: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
