// Mobile Numerology lite handler.
// Pulls users.phone, runs deterministic vibration + harmony scoring against
// the user's Mulank + Bhagyank, asks the AI for the narrative, merges with
// fallback content, and stores in feature_insights.
//
// If users.phone is null we DO NOT write a row — the page will show an empty
// state asking the user to add a phone number.

import type { SupabaseClient } from '@supabase/supabase-js';
import { analyzeMobileNumber, type MobileNumberAnalysis } from '@aroha-astrology/astro-engine';
import { createAIMessage } from '@/lib/ai/aiProvider';
import { buildYogiBabaSystem, buildLangDirective } from '@/lib/ai/reportPrompts';
import { getAgeDemographic, buildToneOnly } from '@/lib/ai/toneRouting';
import { upsertFeatureInsight } from '../cache';
import {
  buildMobileNumerologyFallback,
  type MobileNumerologyContent,
} from './mobileNumerologyFallbacks';

const TIMEOUT_MS = 45_000;
const FEATURE_KEY = 'mobile_numerology';

interface RunArgs {
  chart_id: string;
  language: string;
  params_hash: string;
  user_id: string;
}

interface AIPayload {
  headline?: string;
  decoded?: string;
  how_this_number_behaves?: { money?: string; career?: string; relationships?: string };
  harmony_with_you?: string;
  verdict_and_next_step?: string;
  lucky_digits_to_keep_an_eye_on?: number[];
}

function tryParseJSON(text: string): AIPayload | null {
  let raw = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  const start = raw.indexOf('{');
  if (start > 0) raw = raw.slice(start);
  const end = raw.lastIndexOf('}');
  if (end > 0) raw = raw.slice(0, end + 1);
  try { return JSON.parse(raw) as AIPayload; } catch { return null; }
}

function mergeAIWithFallback(ai: AIPayload | null, analysis: MobileNumberAnalysis): MobileNumerologyContent {
  const fallback = buildMobileNumerologyFallback(analysis);
  if (!ai) return fallback;

  const safeStr = (v: unknown, dflt: string): string => {
    const s = typeof v === 'string' ? v.trim() : '';
    return s.length > 4 ? s : dflt;
  };

  return {
    headline: safeStr(ai.headline, fallback.headline),
    decoded: safeStr(ai.decoded, fallback.decoded),
    how_this_number_behaves: {
      money: safeStr(ai.how_this_number_behaves?.money, fallback.how_this_number_behaves.money),
      career: safeStr(ai.how_this_number_behaves?.career, fallback.how_this_number_behaves.career),
      relationships: safeStr(ai.how_this_number_behaves?.relationships, fallback.how_this_number_behaves.relationships),
    },
    harmony_with_you: safeStr(ai.harmony_with_you, fallback.harmony_with_you),
    verdict_and_next_step: safeStr(ai.verdict_and_next_step, fallback.verdict_and_next_step),
    // Pin canonical — never let AI overwrite the friendly digit list
    lucky_digits_to_keep_an_eye_on: analysis.friendlyDigits,
  };
}

export async function runMobileNumerology(
  supabase: SupabaseClient,
  args: RunArgs,
): Promise<{ ok: boolean; error?: string; skipped?: string }> {
  const { chart_id, language, params_hash, user_id } = args;

  // ── 1. Load chart + profile + user.phone (parallel) ─────────────────────────
  const [chartResult, userResult] = await Promise.all([
    supabase
      .from('kundli_charts')
      .select('id, birth_profiles(name, dob, gender)')
      .eq('id', chart_id)
      .single(),
    supabase
      .from('users')
      .select('phone, profession, marital_status, financial_status, current_city')
      .eq('id', user_id)
      .maybeSingle(),
  ]);

  const { data: chart, error: chartErr } = chartResult;
  if (chartErr || !chart) return { ok: false, error: `Chart not found: ${chartErr?.message ?? 'null'}` };

  const profile = Array.isArray(chart.birth_profiles)
    ? chart.birth_profiles[0] as Record<string, string> | undefined
    : chart.birth_profiles as Record<string, string> | null;
  if (!profile?.dob) return { ok: false, error: 'No DOB in birth profile' };

  const u = userResult.data as { phone?: string | null; profession?: string | null; marital_status?: string | null; financial_status?: string | null; current_city?: string | null } | null;
  if (!u?.phone) {
    // No phone on file — page will render an empty state asking the user to add one.
    return { ok: true, skipped: 'no_phone' };
  }

  // ── 2. Deterministic vibration + harmony ────────────────────────────────────
  const dob = new Date(profile.dob);
  if (Number.isNaN(dob.getTime())) return { ok: false, error: 'Invalid DOB' };
  let analysis: MobileNumberAnalysis;
  try {
    analysis = analyzeMobileNumber(u.phone, dob);
  } catch (err) {
    console.warn('[runMobileNumerology] invalid mobile:', err);
    return { ok: true, skipped: 'invalid_mobile' };
  }

  // ── 3. Life context block ───────────────────────────────────────────────────
  const dobStr = profile.dob;
  const demographic = getAgeDemographic(dobStr);
  const lifeLines: string[] = [];
  if (dobStr) {
    const birth = new Date(dobStr);
    if (!isNaN(birth.getTime())) {
      const now = new Date();
      let age = now.getFullYear() - birth.getFullYear();
      const hadBday = now.getMonth() > birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() >= birth.getDate());
      if (!hadBday) age -= 1;
      if (age >= 0 && age < 120) lifeLines.push(`Age: ${age}`);
    }
  }
  if (u.profession) lifeLines.push(`Works in (sector only, never quote verbatim): ${u.profession}`);
  if (u.marital_status) lifeLines.push(`Relationship: ${u.marital_status}`);
  if (u.financial_status && u.financial_status !== 'prefer_not_to_say') lifeLines.push(`Financial: ${u.financial_status}`);

  const lifeCtxBlock = lifeLines.length > 0
    ? `\n\nUSER PRESENT-DAY CONTEXT — for YOUR calibration only:
- NEVER quote profession, employer, or city verbatim. Abstract work to the sector or kind of work.
- NEVER invent project names, colleague names, or specific incidents.
- Weave naturally as patterns.
${lifeLines.join('\n')}`
    : '';

  const toneBlock = buildToneOnly(demographic);

  const langDirective = buildLangDirective(language);
  const systemPrompt =
    buildYogiBabaSystem(langDirective) +
    `\n\nFEATURE: Mobile Numerology reading. Return ONLY valid JSON with the EXACT keys requested.\n` +
    `RULES:\n` +
    `- NEVER mention planet names (Sun/Moon/Mars/etc.), signs, houses, dashas, or yogas in narrative copy. Lead with human impact.\n` +
    `- NEVER name companies, schools, projects, clients, colleagues, or cities. Refer to work as the SECTOR only.\n` +
    `- Banned words: PRICE, DISCOUNT, PROBLEM, HURRY, BUY NOW, BASIC, STANDARD. Use INVESTMENT, BONUSES, CHALLENGE, LIMITED, ESSENTIAL, CUSTOMIZED instead.\n` +
    `- NEVER display the full mobile number back to the user — refer to it as "this number" or by its last 4 digits.\n` +
    lifeCtxBlock +
    (toneBlock ? `\n\n${toneBlock}` : '');

  // ── 4. User prompt ──────────────────────────────────────────────────────────
  const userPrompt =
`Produce a Mobile Numerology reading. Use the canonical analysis below — never override numeric values, only narrate them.

ANALYSIS (canonical):
- Mobile vibration (total → reduced): ${analysis.total} → ${analysis.vibration}
- Last 4 digits dialed most: ${analysis.lastFour}
- Most-touched last digit: ${analysis.lastDigit}
- User Mulank (psychic): ${analysis.mulank}
- User Bhagyank (destiny): ${analysis.bhagyank}
- Harmony score (1-10): ${analysis.harmony}
- Verdict: ${analysis.verdict}
- Friendly digits for this user: [${analysis.friendlyDigits.join(', ')}]
- Enemy digits for this user: [${analysis.enemyDigits.join(', ')}]
- Digit frequency in the number: ${JSON.stringify(analysis.digitFrequency)}

Return JSON with these EXACT keys (no extra keys, no markdown):
{
  "headline": "1 sentence — verdict in plain human words",
  "decoded": "2-3 sentences explaining the digit-reduction in human terms (total ${analysis.total} → vibration ${analysis.vibration}), and what the most-touched last digit (${analysis.lastDigit}) adds on top",
  "how_this_number_behaves": {
    "money": "3-4 sentences anchored to the user's sector and life-stage — how this vibration shows up in inflows, payouts, deals",
    "career": "3-4 sentences — how this vibration behaves in work conversations and outcomes",
    "relationships": "3-4 sentences — how this vibration shapes the calls, messages, and conversations they have on this number"
  },
  "harmony_with_you": "3-4 sentences — describe the chemistry between vibration ${analysis.vibration} and the user's Mulank ${analysis.mulank} / Bhagyank ${analysis.bhagyank}. Frame as a tailwind or headwind, not a verdict.",
  "verdict_and_next_step": "3-4 sentences — if verdict is 'powerful' or 'supportive', give amplifier habits (when to use this number, how to layer it with other numbers in life). If 'neutral' or 'draining', give a concrete checklist for what to look for in a replacement SIM (which digit ranges, last-digit targets, total-reduction target).",
  "lucky_digits_to_keep_an_eye_on": [${analysis.friendlyDigits.join(', ')}]
}

HARD RULES:
- Do NOT print the full 10-digit number anywhere in the output.
- Do NOT change "lucky_digits_to_keep_an_eye_on" — output it exactly as shown.
- Output ONLY the JSON object. No markdown fences, no commentary.`;

  // ── 5. AI call ──────────────────────────────────────────────────────────────
  let aiPayload: AIPayload | null = null;
  try {
    const signal = AbortSignal.timeout(TIMEOUT_MS);
    const result = await createAIMessage({
      max_tokens: 2400,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      jsonMode: true,
      temperature: 0.7,
      signal,
    });
    const textBlock = result.content.find((c) => c.type === 'text');
    if (textBlock?.text) aiPayload = tryParseJSON(textBlock.text);
  } catch (err) {
    console.warn('[runMobileNumerology] AI call failed:', err);
  }

  const merged = mergeAIWithFallback(aiPayload, analysis);

  // ── 6. Persist ──────────────────────────────────────────────────────────────
  const content = {
    ...merged,
    metadata: {
      vibration: analysis.vibration,
      mulank: analysis.mulank,
      bhagyank: analysis.bhagyank,
      lastFour: analysis.lastFour,
      lastDigit: analysis.lastDigit,
      harmony: analysis.harmony,
      verdict: analysis.verdict,
      digitFrequency: analysis.digitFrequency,
      friendlyDigits: analysis.friendlyDigits,
      enemyDigits: analysis.enemyDigits,
    },
  } as Record<string, unknown>;

  await upsertFeatureInsight(supabase, {
    userId: user_id,
    chartId: chart_id,
    featureKey: FEATURE_KEY,
    paramsHash: params_hash,
    language,
    source: aiPayload ? 'lite_ai' : 'deterministic',
    content,
    expiresAt: aiPayload ? null : new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
  });

  return { ok: true };
}
