import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAIMessage } from '@/lib/ai/aiProvider';
import type { ApiResponse } from '@aroha-astrology/shared';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json<ApiResponse>({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { question, roomLabel, roomContent } = body as {
      question: string;
      roomLabel: string;
      roomContent: string;
    };

    if (!question?.trim()) {
      return NextResponse.json<ApiResponse>({ success: false, error: 'Question is required' }, { status: 400 });
    }

    const systemPrompt = `You are a Vastu Shastra consultant answering a follow-up question about a specific room in the seeker's home. You ALWAYS respond with valid JSON — no prose before or after.

ROOM BEING DISCUSSED: ${roomLabel}

VASTU ANALYSIS FOR THIS ROOM:
"""
${(roomContent ?? '').slice(0, 1200)}
"""

RULES:
- Answer ONLY based on the room analysis above and standard Vastu Shastra principles.
- Keep "answer" to 2–4 short sentences or 2–3 bullet points. Do not write an essay.
- Use plain language. Lead with what this means for daily life — sleep, health, relationships, finances — before the Vastu principle.
- If you use a Sanskrit term, add its plain meaning in brackets.
- Do not mention you are an AI. Respond as a warm, direct Vastu expert.
- Format "answer": if multiple points, use bullet lines starting with •. Otherwise one short paragraph.

JSON SCHEMA (return EXACTLY this shape):
{
  "answer": "string — the answer to the question",
  "items": ["array of purchasable item names mentioned in the answer — e.g. specific plant species, gemstones, yantras, colored cloth, salt lamps. Empty array if no items mentioned."]
}`;

    const response = await createAIMessage({
      system: systemPrompt,
      messages: [{ role: 'user', content: question.trim() }],
      max_tokens: 500,
      temperature: 0.5,
      jsonMode: true,
      skipPersona: true,
    });

    const raw = response.content?.[0]?.text?.trim() ?? '{}';
    let answer = 'Unable to generate an answer. Please try again.';
    let items: string[] = [];
    try {
      const cleaned = raw.replace(/```json\n?/gi, '').replace(/```\n?/g, '').trim();
      const parsed = JSON.parse(cleaned);
      if (typeof parsed.answer === 'string' && parsed.answer.trim()) answer = parsed.answer.trim();
      if (Array.isArray(parsed.items)) items = parsed.items.filter((s: unknown): s is string => typeof s === 'string' && s.trim().length > 0);
    } catch {
      try {
        const start = raw.indexOf('{');
        const end = raw.lastIndexOf('}');
        if (start >= 0 && end > start) {
          const parsed = JSON.parse(raw.slice(start, end + 1));
          if (typeof parsed.answer === 'string' && parsed.answer.trim()) answer = parsed.answer.trim();
          if (Array.isArray(parsed.items)) items = parsed.items.filter((s: unknown): s is string => typeof s === 'string' && s.trim().length > 0);
        } else if (raw) {
          answer = raw;
        }
      } catch {
        if (raw) answer = raw;
      }
    }

    return NextResponse.json<ApiResponse>({ success: true, data: { answer, items } });
  } catch (error) {
    console.error('Vastu ask error:', error);
    return NextResponse.json<ApiResponse>(
      { success: false, error: error instanceof Error ? error.message : 'Failed to get answer' },
      { status: 500 },
    );
  }
}
