// Name Correction lite handler.
// Loads the user's profile name + dob + birth chart, runs deterministic
// numerology, asks the AI for chart-aware suggestions (5 variants × 3 pros +
// 2 cons), then merges + validates against fallback content and stores in
// feature_insights.

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  computeNameAlignment,
  variantHitsTarget,
  generateDeterministicVariants,
  analyzeNameNumerology,
  reduceToSingleDigit,
  type NameAlignmentResult,
} from '@aroha-astrology/astro-engine';
import { createAIMessage } from '@/lib/ai/aiProvider';
import { buildYogiBabaSystem, buildLangDirective } from '@/lib/ai/reportPrompts';
import { getAgeDemographic, buildToneOnly } from '@/lib/ai/toneRouting';
import { upsertFeatureInsight } from '../cache';
import {
  buildNameCorrectionFallback,
  type NameCorrectionContent,
  type NameSuggestion,
} from './nameCorrectionFallbacks';

const TIMEOUT_MS = 45_000;
const FEATURE_KEY = 'name_correction';

interface RunArgs {
  chart_id: string;
  language: string;
  params_hash: string;
  user_id: string;
}

interface ChartHighlights {
  ascendant: { sign: string; lord: string };
  moon: { sign: string; nakshatra: string; pada: number; house: number };
  sun: { sign: string; house: number };
  atmakaraka: string;
  third_house_lord: string;
  fifth_house_lord: string;
  current_mahadasha_lord: string;
}

interface PlanetRow {
  planet?: string;
  name?: string;
  sign?: string;
  signDegree?: number;
  degree?: number;
  nakshatra?: string;
  nakshatraPada?: number;
  pada?: number;
  house?: number;
}

interface HouseRow {
  house?: number;
  sign?: string;
  lord?: string;
}

function findPlanet(planets: PlanetRow[], name: string): PlanetRow | undefined {
  return planets.find((p) => (p.planet ?? p.name) === name);
}

function lordOfHouse(houses: HouseRow[], n: number): string {
  return String(houses.find((h) => Number(h.house) === n)?.lord ?? '');
}

const ATMAKARAKA_PLANETS = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'];

function pickAtmakaraka(planets: PlanetRow[]): string {
  let best = '';
  let bestDeg = -1;
  for (const p of planets) {
    const name = String(p.planet ?? p.name ?? '');
    if (!ATMAKARAKA_PLANETS.includes(name)) continue;
    const deg = Number(p.signDegree ?? p.degree ?? 0);
    if (deg > bestDeg) { bestDeg = deg; best = name; }
  }
  return best || 'Sun';
}

function currentMahadashaLord(dashaData: Record<string, unknown>): string {
  const vimshottari = dashaData?.vimshottari as Record<string, unknown> | undefined;
  const mahadashas = (vimshottari?.mahadashas ?? []) as Array<Record<string, unknown>>;
  const now = Date.now();
  for (const md of mahadashas) {
    const start = new Date(md.startDate as string).getTime();
    const end = new Date(md.endDate as string).getTime();
    if (start <= now && now <= end) return String(md.planet ?? '');
  }
  return '';
}

export function extractNameRelevantPlacements(
  chartData: Record<string, unknown>,
  dashaData: Record<string, unknown>,
): ChartHighlights {
  const planets = (chartData?.planets ?? []) as PlanetRow[];
  const houses = (chartData?.houses ?? []) as HouseRow[];
  const asc = (chartData?.ascendant ?? {}) as { sign?: string; lord?: string };

  const moon = findPlanet(planets, 'Moon');
  const sun = findPlanet(planets, 'Sun');

  return {
    ascendant: { sign: String(asc.sign ?? ''), lord: String(asc.lord ?? '') },
    moon: {
      sign: String(moon?.sign ?? ''),
      nakshatra: String(moon?.nakshatra ?? ''),
      pada: Number(moon?.nakshatraPada ?? moon?.pada ?? 0),
      house: Number(moon?.house ?? 0),
    },
    sun: { sign: String(sun?.sign ?? ''), house: Number(sun?.house ?? 0) },
    atmakaraka: pickAtmakaraka(planets),
    third_house_lord: lordOfHouse(houses, 3),
    fifth_house_lord: lordOfHouse(houses, 5),
    current_mahadasha_lord: currentMahadashaLord(dashaData),
  };
}

interface AISuggestion {
  variant?: unknown;
  chaldean?: unknown;
  change?: unknown;
  pros?: unknown;
  cons?: unknown;
  best_for?: unknown;
}

interface AIPayload {
  headline?: string;
  what_your_name_carries?: { money?: string; relationships?: string; energy_and_health?: string; what_it_blocks?: string };
  your_target_number?: { number?: number; why_it_suits_you?: string };
  suggestions?: AISuggestion[];
  implementation_playbook?: { legal?: string; signature_and_branding?: string; social_and_email?: string };
  lucky_in_daily_life?: { dates?: number[]; amounts?: string; addresses_and_vehicles?: string };
}

/**
 * Take whatever the AI gave us and turn it into a valid 5-suggestion list
 * with 3 pros + 2 cons per row, where every chaldean is recomputed from the
 * variant string (catches AI drift) and every variant hits one of the target
 * numbers. Tops up from deterministic variants when AI runs short.
 */
function reconcileSuggestions(
  fromAI: AISuggestion[] | undefined,
  alignment: NameAlignmentResult,
  fallbackBase: NameSuggestion[],
  sourceName: string,
): NameSuggestion[] {
  const accepted: NameSuggestion[] = [];
  const seen = new Set<string>();

  function coerce(raw: AISuggestion): NameSuggestion | null {
    const variant = String(raw.variant ?? '').trim();
    if (!variant || seen.has(variant.toLowerCase())) return null;
    const { chaldean, hits } = variantHitsTarget(variant, alignment.targets);
    if (!hits) return null;
    const pros = Array.isArray(raw.pros) ? (raw.pros as unknown[]).map(String).filter(Boolean) : [];
    const cons = Array.isArray(raw.cons) ? (raw.cons as unknown[]).map(String).filter(Boolean) : [];
    if (pros.length < 1 || cons.length < 1) return null;
    while (pros.length < 3) pros.push(fallbackBase[0]?.pros[pros.length] ?? 'Strong overall fit with your day-to-day rhythm.');
    while (cons.length < 2) cons.push(fallbackBase[0]?.cons[cons.length] ?? 'Light adoption effort in the first few weeks.');
    seen.add(variant.toLowerCase());
    return {
      variant,
      chaldean,
      change: String(raw.change ?? 'small spelling adjustment').trim(),
      pros: pros.slice(0, 3),
      cons: cons.slice(0, 2),
      best_for: String(raw.best_for ?? 'overall lift').trim(),
    };
  }

  for (const raw of fromAI ?? []) {
    if (accepted.length >= 5) break;
    const ok = coerce(raw);
    if (ok) accepted.push(ok);
  }

  // Top up with deterministic variants derived from the source name itself
  if (accepted.length < 5) {
    const detVariants = generateDeterministicVariants(sourceName, alignment.targets, 5 - accepted.length);
    for (const d of detVariants) {
      if (accepted.length >= 5) break;
      if (seen.has(d.variant.toLowerCase())) continue;
      seen.add(d.variant.toLowerCase());
      accepted.push({
        variant: d.variant,
        chaldean: d.chaldean,
        change: d.change,
        pros: fallbackBase[accepted.length]?.pros ?? fallbackBase[0]!.pros,
        cons: fallbackBase[accepted.length]?.cons ?? fallbackBase[0]!.cons,
        best_for: fallbackBase[accepted.length]?.best_for ?? 'overall lift',
      });
    }
  }

  // Last resort — pad with full fallback rows (anonymised) so length === 5
  while (accepted.length < 5) {
    const idx = accepted.length;
    const candidate = fallbackBase[idx] ?? fallbackBase[0]!;
    accepted.push({ ...candidate, variant: `${sourceName} (alt ${idx + 1})` });
  }

  return accepted.slice(0, 5);
}

function mergeAIWithFallback(
  ai: AIPayload | null,
  alignment: NameAlignmentResult,
  sourceName: string,
): NameCorrectionContent {
  const fallback = buildNameCorrectionFallback(alignment);

  const safeStr = (v: unknown, dflt: string): string => {
    const s = typeof v === 'string' ? v.trim() : '';
    return s.length > 4 ? s : dflt;
  };

  // Even when the AI call failed, reconcileSuggestions still derives real
  // spelling variants from sourceName — otherwise the page would show literal
  // "Variant 1 / Variant 2 …" placeholders from the fallback templates.
  if (!ai) {
    return {
      ...fallback,
      suggestions: reconcileSuggestions(undefined, alignment, fallback.suggestions, sourceName),
    };
  }

  return {
    headline: safeStr(ai.headline, fallback.headline),
    what_your_name_carries: {
      money: safeStr(ai.what_your_name_carries?.money, fallback.what_your_name_carries.money),
      relationships: safeStr(ai.what_your_name_carries?.relationships, fallback.what_your_name_carries.relationships),
      energy_and_health: safeStr(ai.what_your_name_carries?.energy_and_health, fallback.what_your_name_carries.energy_and_health),
      what_it_blocks: safeStr(ai.what_your_name_carries?.what_it_blocks, fallback.what_your_name_carries.what_it_blocks),
    },
    your_target_number: {
      // Pin canonical — never let AI drift overwrite the target number
      number: alignment.targets[0],
      why_it_suits_you: safeStr(ai.your_target_number?.why_it_suits_you, fallback.your_target_number.why_it_suits_you),
    },
    suggestions: reconcileSuggestions(ai.suggestions, alignment, fallback.suggestions, sourceName),
    implementation_playbook: {
      legal: safeStr(ai.implementation_playbook?.legal, fallback.implementation_playbook.legal),
      signature_and_branding: safeStr(ai.implementation_playbook?.signature_and_branding, fallback.implementation_playbook.signature_and_branding),
      social_and_email: safeStr(ai.implementation_playbook?.social_and_email, fallback.implementation_playbook.social_and_email),
    },
    lucky_in_daily_life: {
      dates: Array.isArray(ai.lucky_in_daily_life?.dates) && ai.lucky_in_daily_life.dates.length > 0
        ? ai.lucky_in_daily_life.dates.filter((n) => Number.isFinite(n) && n >= 1 && n <= 31).slice(0, 6)
        : fallback.lucky_in_daily_life.dates,
      amounts: safeStr(ai.lucky_in_daily_life?.amounts, fallback.lucky_in_daily_life.amounts),
      addresses_and_vehicles: safeStr(ai.lucky_in_daily_life?.addresses_and_vehicles, fallback.lucky_in_daily_life.addresses_and_vehicles),
    },
  };
}

function tryParseJSON(text: string): AIPayload | null {
  let raw = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  const start = raw.indexOf('{');
  if (start > 0) raw = raw.slice(start);
  const end = raw.lastIndexOf('}');
  if (end > 0) raw = raw.slice(0, end + 1);
  try {
    return JSON.parse(raw) as AIPayload;
  } catch {
    return null;
  }
}

export async function runNameCorrection(
  supabase: SupabaseClient,
  args: RunArgs,
): Promise<{ ok: boolean; error?: string }> {
  const { chart_id, language, params_hash, user_id } = args;

  // ── 1. Load chart + profile (parallel) ──────────────────────────────────────
  const [chartResult, userRow] = await Promise.all([
    supabase
      .from('kundli_charts')
      .select('id, chart_data, dasha_data, birth_profiles(name, dob, gender)')
      .eq('id', chart_id)
      .single(),
    supabase
      .from('users')
      .select('profession, marital_status, financial_status, current_city')
      .eq('id', user_id)
      .maybeSingle(),
  ]);

  const { data: chart, error: chartErr } = chartResult;
  if (chartErr || !chart) return { ok: false, error: `Chart not found: ${chartErr?.message ?? 'null'}` };

  const profile = Array.isArray(chart.birth_profiles)
    ? chart.birth_profiles[0] as Record<string, string> | undefined
    : chart.birth_profiles as Record<string, string> | null;
  if (!profile?.name || !profile?.dob) return { ok: false, error: 'No name/dob in birth profile' };

  // ── 2. Deterministic numerology ─────────────────────────────────────────────
  const dob = new Date(profile.dob);
  if (Number.isNaN(dob.getTime())) return { ok: false, error: 'Invalid DOB' };
  const alignment = computeNameAlignment(profile.name, dob);

  // ── 3. Chart highlights for AI evaluation ───────────────────────────────────
  const chartData = (chart.chart_data ?? {}) as Record<string, unknown>;
  const dashaData = (chart.dasha_data ?? {}) as Record<string, unknown>;
  const highlights = extractNameRelevantPlacements(chartData, dashaData);

  // ── 4. Life context (age/tone/sector — sector-only never verbatim) ──────────
  const dobStr = profile.dob;
  const demographic = getAgeDemographic(dobStr);
  const u = userRow.data as { profession?: string | null; marital_status?: string | null; financial_status?: string | null; current_city?: string | null } | null;
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
  if (u?.profession) lifeLines.push(`Works in (sector only, never quote verbatim): ${u.profession}`);
  if (u?.marital_status) lifeLines.push(`Relationship: ${u.marital_status}`);
  if (u?.financial_status && u.financial_status !== 'prefer_not_to_say') lifeLines.push(`Financial: ${u.financial_status}`);

  const lifeCtxBlock = lifeLines.length > 0
    ? `\n\nUSER PRESENT-DAY CONTEXT — for YOUR calibration only:
- NEVER quote profession, employer, or city verbatim. Abstract work to the sector or kind of work.
- NEVER invent project names, colleague names, or specific incidents.
- Weave naturally as patterns; do not read back what the user told us.
${lifeLines.join('\n')}`
    : '';

  const toneBlock = buildToneOnly(demographic);

  // ── 5. System prompt — hard rules for these features ────────────────────────
  const langDirective = buildLangDirective(language);
  const systemPrompt =
    buildYogiBabaSystem(langDirective) +
    `\n\nFEATURE: Name Correction reading. Return ONLY valid JSON with the EXACT keys requested.\n` +
    `RULES:\n` +
    `- NEVER mention planet names (Sun/Moon/Mars/etc.), signs, houses, dashas, or yogas in narrative copy. Lead with human impact.\n` +
    `- NEVER name companies, schools, projects, clients, colleagues, or cities. Refer to work as the SECTOR only.\n` +
    `- Banned words: PRICE, DISCOUNT, PROBLEM, HURRY, BUY NOW, BASIC, STANDARD. Use INVESTMENT, BONUSES, CHALLENGE, LIMITED, ESSENTIAL, CUSTOMIZED instead.\n` +
    `- Each suggestion must be evaluated against the BIRTH CHART placements provided (Ascendant lord, Moon sign+Nakshatra, Sun sign, Atmakaraka, 3rd-house lord, 5th-house lord, current Mahadasha lord). Pros must reflect chart synergy AND numerology. Cons must reflect a real trade-off (sound resonance, cultural fit, signature flow, professional reception). NEVER leave the cons array empty.\n` +
    `- HARD CONSTRAINT: exactly 5 suggestions. Each suggestion's chaldean MUST reduce to one of the target numbers. Each must have EXACTLY 3 pros AND EXACTLY 2 cons.\n` +
    lifeCtxBlock +
    (toneBlock ? `\n\n${toneBlock}` : '');

  // ── 6. Build user prompt ────────────────────────────────────────────────────
  const userPrompt =
`Produce a Name Correction reading for ${profile.name}. Use the chart_highlights to evaluate each suggested spelling against the seeker's actual birth chart — not just numerology.

NUMEROLOGY (canonical — must be respected):
- Mulank (psychic): ${alignment.mulank}
- Bhagyank (destiny): ${alignment.bhagyank}
- Current Chaldean: ${alignment.chaldean}
- Current Pythagorean: ${alignment.pythagorean}
- Soul Urge: ${alignment.soulUrge}
- Personality: ${alignment.personality}
- Target numbers (best first): [${alignment.targets.join(', ')}]
- Alignment status: ${alignment.alignment}
- Friendly numbers: [${alignment.friendly.join(', ')}]
- Enemy numbers: [${alignment.enemy.join(', ')}]

CHART HIGHLIGHTS (for your evaluation — do not echo planet/sign names in narrative):
- Ascendant ${highlights.ascendant.sign}, lord ${highlights.ascendant.lord}
- Moon in ${highlights.moon.sign}, Nakshatra ${highlights.moon.nakshatra} pada ${highlights.moon.pada}, house ${highlights.moon.house}
- Sun in ${highlights.sun.sign}, house ${highlights.sun.house}
- Atmakaraka: ${highlights.atmakaraka}
- 3rd-house lord (speech & expression): ${highlights.third_house_lord}
- 5th-house lord (voice/mantra resonance): ${highlights.fifth_house_lord}
- Current Mahadasha lord (life-stage flavour): ${highlights.current_mahadasha_lord}

Return JSON with these EXACT keys (no extra keys, no markdown):
{
  "headline": "1 sentence — what the current name vibration does to them in plain words",
  "what_your_name_carries": {
    "money": "3-4 sentences",
    "relationships": "3-4 sentences",
    "energy_and_health": "2-3 sentences",
    "what_it_blocks": "2-3 sentences"
  },
  "your_target_number": {
    "number": ${alignment.targets[0]},
    "why_it_suits_you": "3-4 sentences — anchor in chart_highlights AND numerology"
  },
  "suggestions": [
    {
      "variant": "Suggested spelling (English Roman script)",
      "chaldean": <int 1-9 — must equal one of [${alignment.targets.join(', ')}]>,
      "change": "concrete edit (e.g. 'added one A after S', 'replaced i with ee')",
      "pros": [
        "PRO 1: chart synergy in human-impact words — how this variant aligns with ascendant lord / moon nakshatra / atmakaraka (1-2 sentences)",
        "PRO 2: numerology effect on money, career, OR relationships (1-2 sentences)",
        "PRO 3: daily-life feel — calls, emails, meetings, first impressions (1-2 sentences)"
      ],
      "cons": [
        "CON 1: real trade-off — sound resonance, cultural fit, OR signature flow (1-2 sentences)",
        "CON 2: friction point — professional reception, pronunciation in seeker's sector, OR adoption effort (1-2 sentences)"
      ],
      "best_for": "short phrase, e.g. 'money + visibility'"
    }
  ],
  "implementation_playbook": {
    "legal": "2 sentences",
    "signature_and_branding": "2 sentences",
    "social_and_email": "2 sentences"
  },
  "lucky_in_daily_life": {
    "dates": [<int 1-31>, <int 1-31>, <int 1-31>],
    "amounts": "1 sentence",
    "addresses_and_vehicles": "1 sentence"
  }
}

HARD CONSTRAINTS:
- "suggestions" array MUST contain EXACTLY 5 entries, ordered best-to-least.
- Each suggestion's "chaldean" MUST be one of [${alignment.targets.join(', ')}].
- Each "pros" array MUST contain EXACTLY 3 entries; each "cons" array MUST contain EXACTLY 2 entries — never empty.
- Output ONLY the JSON object. No markdown fences, no commentary.`;

  // ── 7. AI call ──────────────────────────────────────────────────────────────
  let aiPayload: AIPayload | null = null;
  try {
    const signal = AbortSignal.timeout(TIMEOUT_MS);
    const result = await createAIMessage({
      max_tokens: 3200,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      jsonMode: true,
      temperature: 0.7,
      signal,
    });
    const textBlock = result.content.find((c) => c.type === 'text');
    if (textBlock?.text) aiPayload = tryParseJSON(textBlock.text);
  } catch (err) {
    console.warn('[runNameCorrection] AI call failed:', err);
  }

  // ── 8. Merge with fallback ──────────────────────────────────────────────────
  const merged = mergeAIWithFallback(aiPayload, alignment, profile.name);

  // Safety: recompute every chaldean from variant to defeat any drift that
  // slipped past the AI prompt + reconcile pass.
  for (const s of merged.suggestions) {
    const c = analyzeNameNumerology(s.variant).chaldean;
    s.chaldean = reduceToSingleDigit(c);
  }

  // ── 9. Persist ──────────────────────────────────────────────────────────────
  const content = {
    ...merged,
    metadata: { ...alignment, chartHighlights: highlights },
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
