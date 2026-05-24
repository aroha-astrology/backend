import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAIMessage } from '@/lib/ai/aiProvider';
import { deductCredits } from '@/lib/credits/deductCredits';
import { getAgeDemographic, buildToneOnly } from '@/lib/ai/toneRouting';
import { buildLifeContext } from '@/lib/ai/buildLifeContext';
import {
  classifyUserMessage,
  classifyAssistantOutput,
  POLICY_SYSTEM_DIRECTIVE,
} from '@/lib/ai/contentPolicy';
import { drawCards } from '@/lib/tarot/deck';
import { SPREADS, isSpreadKey } from '@/lib/tarot/spreads';
import { buildDeterministicReading } from '@/lib/tarot/interpret';
import { buildSynthesisFallback } from '@/lib/tarot/fallbacks';
import type { ApiResponse } from '@aroha-astrology/shared';

const TAROT_COST = 2;

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json<ApiResponse>({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { question, spread, language } = body as {
      question: string;
      spread: string;
      language?: string;
    };

    if (!question || !spread) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'question and spread are required' },
        { status: 400 },
      );
    }

    if (!isSpreadKey(spread)) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: `Unknown spread: ${spread}` },
        { status: 400 },
      );
    }

    const spreadDef = SPREADS[spread];
    const lang = language ?? 'en';

    // ── 1. Content policy on the question (BEFORE deducting credits) ─────────
    const policy = classifyUserMessage(question, lang);
    if (policy.blocked) {
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: 'POLICY_BLOCKED',
          data: { topic: policy.topic, response: policy.cannedResponse },
        },
        { status: 200 },
      );
    }

    // ── 2. Deduct credits ────────────────────────────────────────────────────
    const creditResult = await deductCredits(
      supabase,
      user.id,
      TAROT_COST,
      'feature_debit',
      'Tarot card reading',
    );
    if (!creditResult.success) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'INSUFFICIENT_TOKENS' },
        { status: 402 },
      );
    }

    // ── 3. Draw + deterministic per-card interpretation (instant, safe) ──────
    const drawn = drawCards(spreadDef.cardCount);
    const reading = buildDeterministicReading(drawn, spreadDef, question);

    // ── 4. Pull DOB for tone + life context block ────────────────────────────
    let dob: string | null = null;
    try {
      const { data: anyChart } = await supabase
        .from('kundli_charts')
        .select('birth_profiles(dob)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      const profile = anyChart && Array.isArray(anyChart.birth_profiles)
        ? anyChart.birth_profiles[0]
        : (anyChart?.birth_profiles ?? null);
      dob = (profile as { dob?: string } | null)?.dob ?? null;
    } catch {
      // Reading still works without DOB — tone block just renders empty.
    }

    const demographic = getAgeDemographic(dob);
    const toneBlock = buildToneOnly(demographic);

    let lifeContextBlock = '';
    try {
      const ctx = await buildLifeContext(supabase, user.id);
      lifeContextBlock = ctx.promptBlock;
    } catch {
      // Life context is optional — synthesis works without it.
    }

    // ── 5. LLM call — synthesis only (summary trio + overall_message) ────────
    const systemPrompt = [
      `You are a tarot synthesizer who blends classic tarot symbolism with a light Vedic flavor (karma, dharma, gunas — used sparingly, never as the headline).`,
      POLICY_SYSTEM_DIRECTIVE,
      toneBlock,
      lifeContextBlock,
      `STYLE RULES:`,
      `- Lead every sentence with human impact. Reference planets, dashas, or yogas only when the card itself invites it, and never as a paragraph opener.`,
      `- Banned words: PRICE, DISCOUNT, PROBLEM, HURRY, CONTRACT, BUY NOW, BASIC, STANDARD. Use INVESTMENT, BONUSES, CHALLENGE, LIMITED, AGREEMENT, ESSENTIAL, CUSTOMIZED instead.`,
      `- Never name companies, schools, projects, clients, colleagues, or cities.`,
      `- The "summary" is the H/N/A trio: [HOOK, NUANCE, ACTION], each 1–2 short sentences.`,
      `- "overall_message" is 3–5 sentences synthesizing the whole spread into one coherent arc.`,
      `Respond ONLY with valid JSON: { "summary": [string, string, string], "overall_message": string }`,
    ].filter(Boolean).join('\n\n');

    const userPrompt = [
      `Question: "${question}"`,
      `Spread: ${spreadDef.label}`,
      `Cards drawn:`,
      ...reading.cards.map((c) =>
        `  - ${c.position}: ${c.name} (${c.orientation}) — element ${c.vedic.element}${c.vedic.deity_hint ? `, soft hint of ${c.vedic.deity_hint}` : ''}`,
      ),
      ``,
      `Write the H/N/A summary trio and the overall_message. Do NOT re-interpret each card individually — those are handled separately.`,
    ].join('\n');

    let parsed: { summary?: unknown; overall_message?: unknown } | null = null;
    try {
      const message = await createAIMessage({
        max_tokens: 600,
        jsonMode: true,
        temperature: 0.6,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      });
      const textBlock = message.content.find((b) => b.type === 'text');
      const raw = (textBlock?.text ?? '').replace(/```json\n?|```\n?/g, '').trim();
      if (raw) parsed = JSON.parse(raw);
    } catch (err) {
      console.warn('[tarot] LLM synthesis failed; using deterministic fallback:', err);
    }

    // ── 6. Validate synthesis output against output policy ───────────────────
    const summary = sanitizeSummary(parsed?.summary);
    const overall = typeof parsed?.overall_message === 'string' ? parsed.overall_message : '';
    const combinedForPolicy = `${summary?.join(' ') ?? ''} ${overall}`;
    const outputPolicy = classifyAssistantOutput(combinedForPolicy, lang);

    const useFallback = !summary || !overall || outputPolicy.blocked;
    const synthesis = useFallback ? buildSynthesisFallback(reading) : { summary, overall_message: overall };

    return NextResponse.json<ApiResponse>({
      success: true,
      data: {
        spread: spreadDef.key,
        cards: reading.cards,
        summary: synthesis.summary,
        overall_message: synthesis.overall_message,
        theme: reading.theme,
      },
    });
  } catch (error) {
    console.error('Tarot reading error:', error);
    return NextResponse.json<ApiResponse>(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate tarot reading',
      },
      { status: 500 },
    );
  }
}

function sanitizeSummary(value: unknown): [string, string, string] | null {
  if (!Array.isArray(value) || value.length < 3) return null;
  const [a, b, c] = value;
  if (typeof a !== 'string' || typeof b !== 'string' || typeof c !== 'string') return null;
  return [a, b, c];
}
