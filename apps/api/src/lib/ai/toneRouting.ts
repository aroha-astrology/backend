export type AgeDemographic = 'gen_z' | 'millennial' | 'gen_x_boomer';

export interface ToneRulesOptions {
  harshMode?: boolean;
}

/**
 * Derives an age demographic from a date-of-birth value.
 * Returns null when DOB is missing, unparseable, in the future, or indicates
 * a user under 18 — callers should omit tone routing in that case.
 */
export function getAgeDemographic(
  dob: string | Date | null | undefined,
): AgeDemographic | null {
  if (!dob) return null;

  const birth = dob instanceof Date ? dob : new Date(dob);
  if (isNaN(birth.getTime())) return null;

  const now = new Date();
  if (birth > now) return null;

  const yearDiff = now.getFullYear() - birth.getFullYear();
  const hadBirthdayThisYear =
    now.getMonth() > birth.getMonth() ||
    (now.getMonth() === birth.getMonth() && now.getDate() >= birth.getDate());
  const age = hadBirthdayThisYear ? yearDiff : yearDiff - 1;

  if (age < 18) return null;
  if (age <= 27) return 'gen_z';
  if (age <= 43) return 'millennial';
  return 'gen_x_boomer';
}

const TONE_BLOCKS: Record<AgeDemographic, string> = {
  gen_z: `TONE: Speak as a Gen Z peer. Voice is casual, confident, slightly playful, grounded in "main character energy" — the user is the protagonist of their own story. Use light, tasteful emojis (1–2 per paragraph max, never decorative spam). Reference modern realities (career hustle, burnout, dating apps, social timelines) when astrologically relevant. Skip "beta", "my dear", and elder-guru phrasing.`,

  millennial: `TONE: Speak as a supportive peer or life coach — warm, intelligent, grounded. Peer-to-peer, not guru-to-disciple. Center work-life balance, partnership equity, financial sustainability, and burnout recovery in your framing. No emojis. Avoid both Gen Z slang and elder-formal address. Be the friend who happens to read charts.`,

  gen_x_boomer: `TONE: Speak with the respect due an adult of significant life experience. Voice is respectful, clear, and wise — slang-free, emoji-free. Frame insights around legacy, family responsibility, health stewardship, and considered long-horizon decisions. Honor what they have already built; advise, do not lecture.`,
};

const STRUCTURE_DIRECTIVE = `
STRUCTURE — STRICT, NON-NEGOTIABLE:
Return the "summary" field as an ARRAY OF EXACTLY THREE STRINGS, in this order:
  [0] HOOK   — 1–2 short sentences naming what is most alive in the chart right now.
  [1] NUANCE — 1–2 short sentences with the planetary "why" (dasha/yoga/house/transit), no jargon-dump.
  [2] ACTION — 1–2 short sentences with one concrete thing to do this week.
Short sentences only. No headers, no bullets, no extra paragraphs.
All other JSON fields keep their existing shape — only the "summary" field is constrained by this directive.`;

/**
 * Returns a system-prompt block containing tone rules + H/N/A structural directive.
 * Returns an empty string when demographic is null so callers can safely concatenate.
 */
export function buildToneRules(
  demographic: AgeDemographic | null,
  opts: ToneRulesOptions = {},
): string {
  if (!demographic) return '';

  let block = TONE_BLOCKS[demographic];

  // Harsh mode + elder register can conflict: harsh wins on frankness, demographic wins on register.
  if (opts.harshMode && demographic === 'gen_x_boomer') {
    block += '\nEven when delivering hard truths, keep the register respectful — no scolding, no slang.';
  }

  return `${block}\n${STRUCTURE_DIRECTIVE}`;
}

/**
 * Returns just the tone block (no H/N/A directive). Use for endpoints whose
 * output shape can't host a 3-element summary array — chat replies, multi-card
 * tarot readings, multi-room vastu reports, baby-name lists, etc.
 */
export function buildToneOnly(
  demographic: AgeDemographic | null,
  opts: ToneRulesOptions = {},
): string {
  if (!demographic) return '';

  let block = TONE_BLOCKS[demographic];

  if (opts.harshMode && demographic === 'gen_x_boomer') {
    block += '\nEven when delivering hard truths, keep the register respectful — no scolding, no slang.';
  }

  return block;
}

/**
 * Returns a generic H/N/A directive for endpoints with a "summary" field but
 * different surrounding JSON shapes. Output: tone block + directive that asks
 * for `summary` to be a 3-element array [HOOK, NUANCE, ACTION] of 1–2 short
 * sentences each.
 */
export function buildToneWithGenericStructure(
  demographic: AgeDemographic | null,
  opts: ToneRulesOptions = {},
): string {
  return buildToneRules(demographic, opts);
}
