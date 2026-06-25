import { NextResponse } from 'next/server';
import { createAIMessage } from '@/lib/ai/aiProvider';
import { createServerSupabase } from '@/lib/supabase/server';
import { deductCredits } from '@/lib/credits/deductCredits';

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const creditResult = await deductCredits(supabase, user.id, 1, 'feature_debit', 'Muhurta auspicious timing');
    if (!creditResult.success) {
      return NextResponse.json({ success: false, error: 'INSUFFICIENT_TOKENS' }, { status: 402 });
    }

    const { type, startDate, endDate, latitude, longitude, timezone, chartId } = await request.json();

    if (!type || !startDate || !endDate) {
      return NextResponse.json(
        { success: false, error: 'Type, start date, and end date are required' },
        { status: 400 },
      );
    }

    // Get user's chart if available
    let chartContext = '';
    if (chartId) {
      const { data: chart } = await supabase
        .from('kundli_charts')
        .select('chart_data')
        .eq('id', chartId)
        .single();

      if (chart) {
        chartContext = `\n\nUser's birth chart Ascendant: ${(chart.chart_data as Record<string, Record<string, unknown>>)?.ascendant?.sign || 'unknown'}`;
      }
    }

    const message = await createAIMessage({
      max_tokens: 3000,
      system: `You are a Vedic Muhurta expert. Find the best auspicious dates and times for the given activity within the date range.

Consider:
- Tithi quality (avoid Rikta tithis for ${type})
- Nakshatra suitability (e.g., Rohini, Uttara Phalguni for marriage)
- Yoga quality (avoid Vyatipata, Vaidhriti)
- Rahu Kaal avoidance
- Day of week suitability
- Lagna strength at the suggested time
${chartContext}

Activity type: ${type}
Date range: ${startDate} to ${endDate}
Location: lat ${latitude || 28.6}, lng ${longitude || 77.2}, tz ${timezone || 'Asia/Kolkata'}

The "summary" field is the H/N/A 3-line structure — an ARRAY OF EXACTLY THREE STRINGS:
  [0] HOOK — 1–2 short sentences naming the best window for ${type}.
  [1] NUANCE — 1–2 short sentences with the Vedic why (tithi/nakshatra/yoga).
  [2] ACTION — 1–2 short sentences with one concrete preparation tip.
Short sentences only.

Respond in JSON:
{
  "summary": ["hook", "nuance", "action"],
  "muhurtas": [
    {
      "date": "YYYY-MM-DD",
      "time": "HH:MM",
      "score": 85,
      "tithi": "...",
      "nakshatra": "...",
      "yoga": "...",
      "lagnaSign": "...",
      "reasoning": ["point 1", "point 2"],
      "warnings": ["warning if any"]
    }
  ],
  "generalAdvice": "..."
}

Provide 3-5 best muhurtas ranked by score.`,
      messages: [
        {
          role: 'user',
          content: `Find best muhurta for ${type} between ${startDate} and ${endDate}`,
        },
      ],
    });

    const textContent = message.content.find((c) => c.type === 'text');
    let result: Record<string, unknown> = {};

    if (textContent && textContent.type === 'text') {
      try {
        const cleaned = textContent.text.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
        result = JSON.parse(cleaned);
      } catch {
        result = { muhurtas: [], raw: textContent.text };
      }
    }

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('Muhurta calculation error:', error);
    return NextResponse.json({ success: false, error: 'Failed to calculate muhurta' }, { status: 500 });
  }
}
