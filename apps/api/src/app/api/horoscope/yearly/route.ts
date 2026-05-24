import { NextResponse } from 'next/server';
import { createAIMessage } from '@/lib/ai/aiProvider';
import { createServerSupabase } from '@/lib/supabase/server';
import { VOICE_RULES } from '@/lib/ai/voiceRules';

export const maxDuration = 300; // 10 minutes

export async function GET(request: Request) {
  try {
    const supabase = await createServerSupabase();
    const { searchParams } = new URL(request.url);
    const rashi = searchParams.get('rashi');
    const language = searchParams.get('language') || 'en';
    const year = parseInt(searchParams.get('year') ?? String(new Date().getFullYear()));

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    if (!rashi) {
      return NextResponse.json({ success: false, error: 'rashi is required' }, { status: 400 });
    }

    const cacheKey = `yearly_${rashi}_${year}_${language}`;

    // Check cache
    const { data: cached } = await supabase
      .from('daily_horoscopes')
      .select('content')
      .eq('rashi', cacheKey)
      .eq('date', `${year}-01-01`)
      .eq('language', language)
      .maybeSingle();

    if (cached) {
      return NextResponse.json({ success: true, data: cached.content });
    }

    const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];

    const message = await createAIMessage({
      max_tokens: 1500,
      system: `You are a Vedic astrologer writing a yearly horoscope for ${rashi} Moon sign for ${year}. ${language === 'hi' ? 'Write in Hindi.' : 'Write in English.'}

${VOICE_RULES}

The "summary" field is an ARRAY OF EXACTLY THREE STRINGS — [HOOK, NUANCE, ACTION]:
  [0] HOOK — 1–2 short sentences naming the headline of the year for ${rashi}.
  [1] NUANCE — 1–2 short sentences with the planetary why (Jupiter/Saturn/Rahu transits, dasha shifts).
  [2] ACTION — 1–2 short sentences with one concrete priority for the year.
Short sentences only. No headers, no bullets.

Respond as valid JSON:
{
  "summary": ["hook", "nuance", "action"],
  "year": ${year},
  "theme": "Overall theme for the year in one sentence",
  "quarters": [
    {"quarter": "Q1", "months": "January - March", "prediction": "2-3 sentences"},
    {"quarter": "Q2", "months": "April - June", "prediction": "2-3 sentences"},
    {"quarter": "Q3", "months": "July - September", "prediction": "2-3 sentences"},
    {"quarter": "Q4", "months": "October - December", "prediction": "2-3 sentences"}
  ],
  "monthBriefs": [
    {"month": "January", "prediction": "One sentence"},
    {"month": "February", "prediction": "One sentence"},
    {"month": "March", "prediction": "One sentence"},
    {"month": "April", "prediction": "One sentence"},
    {"month": "May", "prediction": "One sentence"},
    {"month": "June", "prediction": "One sentence"},
    {"month": "July", "prediction": "One sentence"},
    {"month": "August", "prediction": "One sentence"},
    {"month": "September", "prediction": "One sentence"},
    {"month": "October", "prediction": "One sentence"},
    {"month": "November", "prediction": "One sentence"},
    {"month": "December", "prediction": "One sentence"}
  ],
  "ratings": [
    {"area": "Career", "rating": 4},
    {"area": "Love", "rating": 3},
    {"area": "Health", "rating": 4},
    {"area": "Finance", "rating": 3},
    {"area": "Family", "rating": 5},
    {"area": "Spirituality", "rating": 4}
  ]
}`,
      messages: [{ role: 'user', content: `Yearly horoscope for ${rashi}, ${year}` }],
    });

    const textContent = message.content.find((c) => c.type === 'text');
    let content: Record<string, unknown> = {};

    if (textContent && textContent.type === 'text') {
      try {
        const cleaned = textContent.text.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
        content = JSON.parse(cleaned);
      } catch {
        content = { year, theme: textContent.text, quarters: [], monthBriefs: [], ratings: [] };
      }
    }

    // Cache
    await supabase.from('daily_horoscopes').upsert({
      rashi: cacheKey,
      date: `${year}-01-01`,
      language,
      content,
    });

    return NextResponse.json({ success: true, data: content });
  } catch (error) {
    console.error('Yearly horoscope error:', error);
    return NextResponse.json({ success: false, error: 'Failed to get yearly horoscope' }, { status: 500 });
  }
}
