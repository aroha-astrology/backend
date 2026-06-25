import { createAIMessage } from './aiProvider';
import { getAgeDemographic, buildToneOnly, type AgeDemographic } from './toneRouting';

export interface JourneyEvent {
  short: string;
  story: string;
}

export interface GenerationContext {
  name: string;
  planet: string;
  planetTheme: string;
  startAge: number;
  endAge: number;
  startYear: number;
  endYear: number;
  tense: 'past' | 'present' | 'future';
  ascendantSign?: string;
  planetSummary?: string;
}

const SYSTEM_BASE = `You are a sharp Vedic astrologer who speaks like a wise older sibling — direct, specific, zero fluff. You write bullet points, not stories. Each bullet is punchy, relatable, and grounded in lived emotional reality. You avoid generic horoscope phrases and never write in paragraph form.

HARD RULES — every bullet must follow these without exception:
1. NEVER name specific places — no cities, countries, regions, or nationalities (no "Mumbai", "US", "American", "Indian", "foreign country"). Use neutral terms like "a far-off place", "somewhere unfamiliar", or just drop the geography entirely.
2. NEVER name specific family roles — no "aunt", "uncle", "cousin", "grandfather", "neighbour". The person could have anyone in that role. Use "someone close", "a relative", "an elder", "a person around you".
3. NEVER assume financial status — no "imported", "luxury", "expensive", "cheap", "hand-me-down", "second-hand", "designer", "branded". You don't know if they were rich or poor. Stay class-neutral.
4. NEVER name specific gadgets, brands, or products — no "VHS", "pager", "iPhone", "computer", "laptop", "TV", "PlayStation", "magic box". Use abstract terms like "a new piece of technology", "a device that fascinated you", "something the world was just discovering".
5. FRAME AS POSSIBILITY, NOT ASSERTION — write each bullet as something the person themselves might quietly think or wonder about their own life, not as the astrologer claiming what happened. Use soft framings: "Maybe...", "Might have...", "A part of you...", "Something in you...", "Could have caught yourself...", "Perhaps felt...", "There's a chance you...". Avoid declarative "You did X" or commanding past-tense verbs that sound like accusations.

Specificity must come from emotional truth and situational texture, never from naming real-world objects, places, people, or class markers.`;

function contextBlock(ctx: GenerationContext): string {
  return `Person: ${ctx.name}
Ascendant: ${ctx.ascendantSign ?? 'unknown'}
Planets: ${ctx.planetSummary ?? 'unknown'}
Phase: ${ctx.planet} Mahadasha (age ${ctx.startAge}-${ctx.endAge}, years ${ctx.startYear}-${ctx.endYear})
Theme: ${ctx.planetTheme}`;
}

function parseArray(text: string): JourneyEvent[] {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]) as unknown[];
    return parsed
      .filter((e): e is { short: string; story: string | string[] } =>
        typeof e === 'object' && e !== null
        && typeof (e as { short?: unknown }).short === 'string'
        && (
          typeof (e as { story?: unknown }).story === 'string' ||
          Array.isArray((e as { story?: unknown }).story)
        )
      )
      .map(e => ({
        short: e.short.trim(),
        story: Array.isArray(e.story)
          ? JSON.stringify((e.story as string[]).map(s => String(s).trim()))
          : e.story.trim(),
      }));
  } catch {
    return [];
  }
}

function parseObject(text: string): JourneyEvent | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as { short?: unknown; story?: unknown };
    if (typeof parsed.short === 'string' && (typeof parsed.story === 'string' || Array.isArray(parsed.story))) {
      return {
        short: parsed.short.trim(),
        story: Array.isArray(parsed.story)
          ? JSON.stringify((parsed.story as unknown[]).map(s => String(s).trim()))
          : (parsed.story as string).trim(),
      };
    }
  } catch {
    /* ignore */
  }
  return null;
}

const TENSE_CONFIG = {
  past: {
    experienced: 'experienced',
    shortInstruction: 'past tense, starts with a soft past-tense verb that hints at possibility (e.g. "Navigated", "Wrestled with", "Sat with", "Drifted toward", "Quietly felt"). Avoid commanding/forceful verbs like "Conquered" or "Mastered".',
    bulletInstruction: 'past tense, reflective inner-voice — sounds like the person quietly thinking back about their own life, not an outsider declaring facts. Each bullet uses possibility framings ("Maybe...", "A part of you...", "Might have...", "Something in you...", "Perhaps..."). No periods. No place names, no relatives by role, no brands or gadgets, no class markers.',
    framePhrase: 'may have quietly experienced',
  },
  present: {
    experienced: 'is experiencing',
    shortInstruction: 'present tense, starts with a soft present-tense verb (e.g. "Sitting with", "Wrestling with", "Drawn toward", "Quietly building"). Avoid forceful verbs.',
    bulletInstruction: 'present tense, reflective inner-voice — sounds like the person noticing something true about their own life right now. Use soft framings ("Maybe right now...", "Something in you is...", "A part of you keeps..."). No periods. No place names, no relatives by role, no brands or gadgets, no class markers.',
    framePhrase: 'may be quietly moving through',
  },
  future: {
    experienced: 'will likely experience',
    shortInstruction: 'future tense with hedging — starts with "May", "Might", "Could find yourself", "Set to quietly", "Likely to drift toward". Avoid hard predictions like "Will conquer".',
    bulletInstruction: 'future tense, reflective inner-voice — sounds like the person sensing what could be coming for them. Use soft framings ("Might find yourself...", "Could quietly...", "A part of you may..."). No periods. No place names, no relatives by role, no brands or gadgets, no class markers.',
    framePhrase: 'may quietly move toward',
  },
} as const;

export async function generateEvents(
  ctx: GenerationContext,
  count: number,
  blacklist: string[] = [],
): Promise<JourneyEvent[]> {
  const tCfg = TENSE_CONFIG[ctx.tense ?? 'past'];
  const blacklistBlock = blacklist.length
    ? `\n\nAlready rejected by ${ctx.name} — DO NOT repeat these themes or wording:\n${blacklist.map(b => `- ${b}`).join('\n')}`
    : '';

  const aiResponse = await createAIMessage({
    max_tokens: 1400,
    temperature: 0.85,
    skipPersona: true,
    system: `${SYSTEM_BASE}

Generate exactly ${count} life events ${ctx.name} ${tCfg.framePhrase} during their ${ctx.planet} Mahadasha (age ${ctx.startAge}-${ctx.endAge}, ${ctx.startYear}-${ctx.endYear}).

Each event has TWO parts:
- "short": one punchy headline, 4-7 words, ${tCfg.shortInstruction}. Eye-catching and specific to the dasha theme.
- "story": JSON array of exactly 4 bullet points. Each bullet is 10-16 words, ${tCfg.bulletInstruction} Mix of emotional truth and real-life detail. Each bullet must be a complete, vivid thought — not a fragment.

Each event must reflect a DIFFERENT facet of the ${ctx.planet} dasha theme: ${ctx.planetTheme}. No repetition. No generic phrases like "significant energy".${blacklistBlock}

REMEMBER (non-negotiable): no place names, no specific family roles (aunt/uncle/cousin/etc.), no financial/class markers (imported/luxury/hand-me-down/etc.), no specific brands or gadgets (VHS/pager/computer/iPhone/etc.), and frame each bullet as something the person could quietly think about their own life — not a claim from outside.

Return ONLY a JSON array of ${count} objects with "short" and "story" keys. No prose, no markdown.

Example shape (past): [{"short":"Drifted toward something bigger than the usual path","story":["Maybe felt pulled toward an idea no one around you quite understood","A part of you traded comfort for the chance to chase something unfamiliar","Some close ties bent under the weight of choices that didn't fit the script","Something in you came out of it more honest, even if a little bruised"]}, ...]`,
    messages: [
      {
        role: 'user',
        content: `Generate ${count} likely events.\n\n${contextBlock(ctx)}`,
      },
    ],
  });

  const text = aiResponse.content.map(c => c.text).join('');
  return parseArray(text).slice(0, count);
}

export async function refineEvent(
  ctx: GenerationContext,
  current: JourneyEvent,
): Promise<JourneyEvent | null> {
  const aiResponse = await createAIMessage({
    max_tokens: 400,
    temperature: 0.8,
    skipPersona: true,
    system: `${SYSTEM_BASE}

Refine this single life event for ${ctx.name} (${ctx.planet} Mahadasha, age ${ctx.startAge}-${ctx.endAge}). Keep the core theme but make it more nuanced and specific. The user said "maybe" — soften any over-confident claims and go deeper on the emotional reality.

Return ONLY a JSON object: {"short":"...","story":["bullet1","bullet2","bullet3","bullet4"]}
Each bullet: 10-16 words, ${TENSE_CONFIG[ctx.tense ?? 'past'].bulletInstruction}`,
    messages: [
      {
        role: 'user',
        content: `Refine this event with sharper, more relatable bullet points.

Current short: ${current.short}
Current story: ${current.story}

${contextBlock(ctx)}`,
      },
    ],
  });

  const text = aiResponse.content.map(c => c.text).join('');
  return parseObject(text);
}

export async function generateReplacement(
  ctx: GenerationContext,
  blacklist: string[],
): Promise<JourneyEvent | null> {
  const events = await generateEvents(ctx, 1, blacklist);
  return events[0] ?? null;
}

export interface InsightContext {
  name: string;
  mahadashaPlanet: string;
  mahadashaPlanetTheme: string;
  antardashaPlanet: string;
  antardashaPlanetTheme: string;
  area: string;
  adStartDate: string;
  adEndDate: string;
  ascendantSign?: string;
  planetSummary?: string;
  dob?: string | null;
}

export interface AreaInsight {
  title: string;
  story: string;
  doItems: string[];
  avoidItems: string[];
}

function extractJSON(text: string): Record<string, unknown> | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]) as Record<string, unknown>; }
  catch { return null; }
}

export async function generateAreaInsight(ctx: InsightContext): Promise<AreaInsight | null> {
  const demographic: AgeDemographic | null = getAgeDemographic(ctx.dob ?? undefined);
  const toneBlock = buildToneOnly(demographic);

  const aiResponse = await createAIMessage({
    model: process.env.NVIDIA_NIM_FAST_MODEL ?? 'meta/llama-3.1-8b-instruct',
    max_tokens: 380,
    temperature: 0.25,
    skipPersona: true,
    system: `${SYSTEM_BASE}

${toneBlock}

Generate a ${ctx.area} reading for ${ctx.name} during ${ctx.mahadashaPlanet} Mahadasha / ${ctx.antardashaPlanet} Antardasha (${ctx.adStartDate} to ${ctx.adEndDate}).

Mahadasha theme: ${ctx.mahadashaPlanetTheme}
Antardasha theme: ${ctx.antardashaPlanetTheme}
Ascendant: ${ctx.ascendantSign ?? 'unknown'}
Planets: ${ctx.planetSummary ?? 'unknown'}

The "story" field is the H/N/A 3-line structure — an ARRAY OF EXACTLY THREE STRINGS:
  [0] HOOK — 1–2 short sentences naming what is most alive in ${ctx.area} right now.
  [1] NUANCE — 1–2 short sentences with the planetary why (this dasha/antardasha pair).
  [2] ACTION — 1–2 short sentences with one concrete thing to do this period.
Short sentences only, no periods at the end of bullets, no fluff.

Return ONLY valid JSON:
{
  "title": "6-10 words, present tense, punchy e.g. Doors opening you didn't even knock on",
  "story": ["hook","nuance","action"],
  "doItems": ["8-12 word actionable advice", "...", "..."],
  "avoidItems": ["8-12 word cautionary advice", "...", "..."]
}
Exactly 3 doItems and 3 avoidItems. No markdown, no prose outside JSON.`,
    messages: [{
      role: 'user',
      content: `Generate ${ctx.area} insight for ${ctx.name} — ${ctx.mahadashaPlanet} Mahadasha / ${ctx.antardashaPlanet} Antardasha.`,
    }],
  });

  const text = aiResponse.content.map(c => c.text).join('');
  const obj = extractJSON(text);
  if (!obj) return null;
  if (
    typeof obj.title === 'string' &&
    (typeof obj.story === 'string' || Array.isArray(obj.story)) &&
    Array.isArray(obj.doItems) && Array.isArray(obj.avoidItems)
  ) {
    return {
      title: (obj.title as string).trim(),
      story: Array.isArray(obj.story)
        ? JSON.stringify((obj.story as unknown[]).map(s => String(s).trim()))
        : (obj.story as string).trim(),
      doItems: (obj.doItems as unknown[]).map(i => String(i).trim()).slice(0, 3),
      avoidItems: (obj.avoidItems as unknown[]).map(i => String(i).trim()).slice(0, 3),
    };
  }
  return null;
}
