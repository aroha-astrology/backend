// =============================================================================
// Cheap, deterministic checks on generated report text (English, before translation)
// =============================================================================
// No LLM call. Pure functions over strings, so they cost nothing, give the same answer twice,
// and can be reused by every other report (the fix-once rule): today Varshik Rashifal 2027 uses
// them through verify-claims.ts; any report can call `checkProse` the same way.
//
// Three families:
//   AI tells      stock words, dash density, "not X but Y" contrasts, repeated sentence openings.
//                 The humanizer rules in the prompt (lib/llm/human-voice.ts) ask the model not to
//                 do these; this counts what slipped through. A hit cannot be fixed by deleting a
//                 sentence, so the caller regenerates once with the hits listed.
//   fear words    "tabahi", "disaster", "curse" ... never shown to a reader.
//   death / harm  death, accident, serious illness, divorce, pregnancy loss: the chat safety rules
//                 already refuse these and a paid report must not predict them.
//
// The word lists are deliberately narrow. A false hit costs one regenerate; a missed one reaches
// a reader. Nothing here judges meaning: that is the facts check in verify-claims.ts.
// =============================================================================

export type TextRule =
  | 'ai-tell:stock-word'
  | 'ai-tell:dashes'
  | 'ai-tell:not-but'
  | 'ai-tell:openings'
  | 'fear'
  | 'death'
  | 'gentle'
  | 'score-number'
  | 'persona'
  | 'polarity'
  | 'claim';

export interface TextHit {
  rule: TextRule;
  /** The offending words or sentence. */
  text: string;
}

/** A rule whose hit can be fixed by deleting the sentence that holds it. */
export function isSentenceFixable(rule: TextRule): boolean {
  return !rule.startsWith('ai-tell:');
}

/** Splits a paragraph into sentences, keeping terminators (same rule as verify-claims.ts). */
export function sentencesOf(paragraph: string): string[] {
  return paragraph
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

const wordCount = (s: string): number => (s.match(/\S+/g) ?? []).length;

// -----------------------------------------------------------------------------
// AI tells
// -----------------------------------------------------------------------------

/** Words the humanizer rules ban. One hit anywhere in a section is a hit. */
export const AI_STOCK_WORDS: readonly string[] = [
  'delve',
  'delves',
  'delving',
  'tapestry',
  'journey',
  'journeys',
  'navigate',
  'navigates',
  'navigating',
  'embrace',
  'embraces',
  'embracing',
  'unlock',
  'unlocks',
  'unlocking',
  'testament',
  'landscape',
  'landscapes',
  'vibrant',
  'profound',
  'profoundly',
  'pivotal',
  'crucial',
  'intricate',
  'underscore',
  'underscores',
  'showcase',
  'showcases',
  'realm',
  'realms',
  'beacon',
  'myriad',
  'seamless',
  'seamlessly',
  'plethora',
  'nestled',
  'boasts',
  'multifaceted',
  'holistic',
  'game-changer',
  'ever-evolving',
];

const STOCK_PHRASES: readonly RegExp[] = [
  /\bserves as\b/i,
  /\bstands as\b/i,
  /\bdeep dive\b/i,
  /\bdive into\b/i,
  /\bit'?s worth noting\b/i,
  /\bin conclusion\b/i,
  /\bhere'?s the thing\b/i,
  /\blet'?s (?:dive|explore|unpack)\b/i,
  /\bthe future (?:looks|is) bright\b/i,
];

const STOCK_WORD_RE = new RegExp(`\\b(?:${AI_STOCK_WORDS.map((w) => w.replace('-', '\\-')).join('|')})\\b`, 'gi');

/** Contrast patterns: "not X but Y", "it's not X, it's Y", "less about X, more about Y". */
const NOT_BUT: readonly RegExp[] = [
  /\bnot (?:just |only |merely |simply )?(?:a |an |the )?[^.!?;]{1,50}?,? but (?:also |rather )?/gi,
  /\b(?:isn'?t|aren'?t|wasn'?t|it is not|it'?s not|this is not|that'?s not)\b[^.!?]{1,60}[,;]\s*(?:it'?s|it is|this is|that'?s)\b/gi,
  /\bmore about\b[^.!?]{1,40}\bless about\b|\bless about\b[^.!?]{1,40}\bmore about\b/gi,
  /\brather than\b/gi,
];

function dashCount(text: string): number {
  return (text.match(/—|–|--| - /g) ?? []).length;
}

function openingsOf(sentences: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const s of sentences) {
    const key = s
      .toLowerCase()
      .replace(/[^a-z\s'-]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .join(' ');
    if (key.split(' ').length < 2) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

export interface AiTellLimits {
  /** Stock words and phrases allowed in a section. */
  stockWords: number;
  /** Contrast patterns allowed in a section. */
  notBut: number;
  /** Dashes allowed per 150 words (at least 1). */
  dashesPer150Words: number;
  /** A two-word sentence opening may repeat this many times (or this share, if larger). */
  openingRepeat: number;
  openingShare: number;
}

export const DEFAULT_AI_TELL_LIMITS: AiTellLimits = {
  stockWords: 0,
  notBut: 1,
  dashesPer150Words: 1,
  openingRepeat: 4,
  openingShare: 0.3,
};

/** Counts the AI tells in one section's paragraphs. */
export function aiTellHits(
  paragraphs: string[],
  limits: AiTellLimits = DEFAULT_AI_TELL_LIMITS,
): TextHit[] {
  const text = paragraphs.join('\n');
  const hits: TextHit[] = [];

  const stock = [
    ...(text.match(STOCK_WORD_RE) ?? []),
    ...STOCK_PHRASES.flatMap((re) => text.match(new RegExp(re.source, 'gi')) ?? []),
  ];
  if (stock.length > limits.stockWords) {
    hits.push({ rule: 'ai-tell:stock-word', text: [...new Set(stock.map((s) => s.toLowerCase()))].join(', ') });
  }

  const contrasts = NOT_BUT.flatMap((re) => text.match(new RegExp(re.source, re.flags)) ?? []);
  if (contrasts.length > limits.notBut) {
    hits.push({ rule: 'ai-tell:not-but', text: contrasts.slice(0, 3).join(' | ') });
  }

  const dashes = dashCount(text);
  const allowedDashes = Math.max(1, Math.floor((wordCount(text) / 150) * limits.dashesPer150Words));
  if (dashes > allowedDashes) {
    hits.push({ rule: 'ai-tell:dashes', text: `${dashes} dashes in ${wordCount(text)} words` });
  }

  const sentences = paragraphs.flatMap(sentencesOf);
  if (sentences.length >= 6) {
    const limit = Math.max(limits.openingRepeat, Math.ceil(sentences.length * limits.openingShare));
    for (const [opening, n] of openingsOf(sentences)) {
      // "You will", "You can" ... are what second person reads like; only a repeat of the same
      // two words counts.
      if (n >= limit) {
        hits.push({ rule: 'ai-tell:openings', text: `"${opening}" opens ${n} sentences` });
      }
    }
  }
  return hits;
}

// -----------------------------------------------------------------------------
// Fear, death and harm words
// -----------------------------------------------------------------------------

const FEAR_RE =
  /\b(?:tabahi|anhoni|disaster(?:s|ous)?|curse[ds]?|cursing|doom(?:ed)?|catastroph\w*|calamit\w*|dread(?:ful|ed)?|terrif\w*|horrif\w*|evil|wrath|ominous|black magic|jinx(?:ed)?|dangerous|danger)\b/gi;

const DEATH_RE =
  /\b(?:death|deaths|die|dies|died|dying|dead|deadly|mortal(?:ity)?|fatal(?:ity)?|longevity|lifespan|maraka|funeral|kill(?:s|ed|ing)?|suicid\w*|widow(?:ed|hood)?|accident(?:s|al)?|crash(?:es|ed)?|divorce[ds]?|miscarriage|stillbirth|abortion|tumou?rs?|heart attack|stroke|diabetes|surgery|surgeries|terminal|serious illness|hospitali[sz]ed?|life-threatening)\b/gi;

/** Words that say a flat "no" to the reader. Only the Chapter VI pages are held to this. */
const GENTLE_RE =
  /\b(?:unfortunately|impossible|hopeless|no chance|worst|bad (?:time|luck|period|year|month)|you will not|you won'?t|you cannot|you can'?t|nothing (?:will|can) (?:change|help)|never)\b/gi;

function sentenceHits(
  rule: TextRule,
  re: RegExp,
  paragraphs: string[],
): TextHit[] {
  const hits: TextHit[] = [];
  for (const p of paragraphs) {
    for (const s of sentencesOf(p)) {
      if (new RegExp(re.source, re.flags.replace('g', '')).test(s)) hits.push({ rule, text: s });
    }
  }
  return hits;
}

export const fearHits = (paragraphs: string[]): TextHit[] => sentenceHits('fear', FEAR_RE, paragraphs);
/**
 * The illness, lower case only: "Cancer" with a capital is the zodiac sign and fills an astrology
 * report (the Moon enters Cancer). A sentence that starts with the illness in capitals is the one
 * miss this accepts.
 */
const CANCER_ILLNESS_RE = /\bcancer\b/;

export const deathHits = (paragraphs: string[]): TextHit[] => [
  ...sentenceHits('death', DEATH_RE, paragraphs),
  ...sentenceHits('death', CANCER_ILLNESS_RE, paragraphs),
];
export const gentleHits = (paragraphs: string[]): TextHit[] => sentenceHits('gentle', GENTLE_RE, paragraphs);

/** A score, percentage or points figure: the shared report message forbids stating any. */
const SCORE_NUMBER_RE =
  /\b\d{1,3}\s*\/\s*100\b|\b\d{1,3}\s*%|\b(?:score|scored|scores|rating|rated)\s+(?:of\s+)?\d{1,3}\b|\b\d{1,3}\s+out of\s+100\b|\b\d{1,3}\s+points?\b/gi;

export const scoreNumberHits = (paragraphs: string[]): TextHit[] =>
  sentenceHits('score-number', SCORE_NUMBER_RE, paragraphs);

/** All three generic families plus score numbers, for one section. */
export function checkProse(paragraphs: string[], opts: { gentle?: boolean } = {}): TextHit[] {
  return [
    ...fearHits(paragraphs),
    ...deathHits(paragraphs),
    ...scoreNumberHits(paragraphs),
    ...(opts.gentle ? gentleHits(paragraphs) : []),
    ...aiTellHits(paragraphs),
  ];
}
