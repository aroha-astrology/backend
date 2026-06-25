/**
 * Deterministic tarot interpretation engine.
 *
 * Primary text source for /api/tarot — the LLM is only invoked for the
 * synthesis paragraph (overall_message + summary trio). Every per-card
 * interpretation is generated here from the deck seed + position context
 * + a light theme classifier.
 *
 * Hand-written copy is policy-safe by construction:
 *   - No death/longevity references (see lib/ai/contentPolicy.ts).
 *   - No banned words (PRICE/DISCOUNT/PROBLEM/HURRY/CONTRACT/BUY NOW/BASIC/STANDARD).
 *   - No employer/project/colleague names.
 *   - Planets and devas appear only as soft flavour, never as headlines.
 */

import type { DrawnCard, Orientation, TarotCard } from './deck';
import type { SpreadDef } from './spreads';

export type QuestionTheme = 'love' | 'career' | 'money' | 'health' | 'spiritual' | 'general';

export interface InterpretedCard extends DrawnCard {
  position: string;
  interpretation: string;
}

// ──────────────────────────────────────────────────────────────────────────────
// Theme detection (keyword-based, fast, language-agnostic-ish for common terms)
// ──────────────────────────────────────────────────────────────────────────────

const THEME_PATTERNS: Array<{ theme: QuestionTheme; words: RegExp }> = [
  { theme: 'love', words: /\b(love|partner|relationship|spouse|husband|wife|boyfriend|girlfriend|crush|dating|marriage|romance|breakup|ex|patni|pati|shaadi|prem|pyar)\b/i },
  { theme: 'career', words: /\b(job|career|work|boss|promotion|business|client|interview|startup|company|role|hiring|offer|laid\s*off|naukri|kaam|vyapar)\b/i },
  { theme: 'money', words: /\b(money|finance|wealth|debt|loan|salary|income|savings|investment|property|land|paisa|dhan|kharcha|kamai)\b/i },
  { theme: 'health', words: /\b(health|body|sleep|tired|illness|recovery|sick|energy|stress|anxiety|depression|seh[at]|swasthya)\b/i },
  { theme: 'spiritual', words: /\b(purpose|dharma|spiritual|meditation|sadhana|karma|moksha|peace|meaning|path|calling|guru)\b/i },
];

export function detectTheme(question: string): QuestionTheme {
  const q = question ?? '';
  for (const { theme, words } of THEME_PATTERNS) {
    if (words.test(q)) return theme;
  }
  return 'general';
}

// ──────────────────────────────────────────────────────────────────────────────
// Position framing — opening sentence pattern for each position label
// ──────────────────────────────────────────────────────────────────────────────

function positionFrame(positionLabel: string): string {
  const map: Record<string, string> = {
    Significator: 'For the heart of your question',
    Past: 'Looking back, the energy at play was',
    Present: 'Right now, what is most active is',
    Future: 'The current trajectory points toward',
    You: 'You arrive in this connection as',
    'The Other': 'The other person is meeting you as',
    'The Connection': 'The thread between you holds',
    Strength: 'What is working for you both is',
    Challenge: 'The friction asking to be tended is',
    Outcome: 'Where this is headed, if held with care, is',
    Hidden: 'Beneath the surface, the quiet driver is',
    Obstacle: 'The wall to walk around (not through) is',
    External: 'What outside forces are adding is',
    Advice: 'The card offers this guidance',
    'Present Situation': 'Where you stand today is',
    Foundation: 'Underneath it all, the root is',
    'Recent Past': 'What you have just walked through is',
    'Best Outcome': 'The highest version of this story carries',
    'Near Future': 'In the coming weeks, expect',
    'Your Attitude': 'Your own stance is showing up as',
    'External Influences': 'The world around the question is bringing',
    'Hopes and Fears': 'What you are both wishing for and bracing against is',
    'Final Outcome': 'Where this all lands, with current choices, is',
  };
  return map[positionLabel] ?? `In the ${positionLabel.toLowerCase()} position`;
}

// ──────────────────────────────────────────────────────────────────────────────
// Theme-tuned closing sentence
// ──────────────────────────────────────────────────────────────────────────────

function themeBridge(theme: QuestionTheme, orientation: Orientation): string {
  const u = orientation === 'Upright';
  switch (theme) {
    case 'love':
      return u
        ? 'In matters of the heart, this asks for warmth that is steady rather than performed.'
        : 'In matters of the heart, the invitation is to look at what is being avoided.';
    case 'career':
      return u
        ? 'In the field you work in, this favors clear next steps over grand reinvention.'
        : 'In your working life, the friction is pointing at a structural shift, not a personal failing.';
    case 'money':
      return u
        ? 'Around resources, this rewards patience over chase — let the slower move win.'
        : 'Around resources, a leak or imbalance is asking to be looked at honestly.';
    case 'health':
      return u
        ? 'For body and energy, this favors gentleness and small consistent habits.'
        : 'For body and energy, the signal is to slow down before the body slows you.';
    case 'spiritual':
      return u
        ? 'On the inner path, this is a doorway worth walking through with quiet attention.'
        : 'On the inner path, an old pattern is asking to be released before the next opening shows.';
    case 'general':
    default:
      return u
        ? 'Met with patience, this energy works for you over the coming weeks.'
        : 'Met with honesty, this can shift quickly — the block is softer than it looks.';
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Per-card interpretation
// ──────────────────────────────────────────────────────────────────────────────

export function interpretCard(
  card: TarotCard,
  orientation: Orientation,
  positionLabel: string,
  theme: QuestionTheme,
): string {
  const seed = orientation === 'Upright' ? card.meaning_upright : card.meaning_reversed;
  const frame = positionFrame(positionLabel);
  const bridge = themeBridge(theme, orientation);
  // "<position frame> <card name> (<orientation>). <seed sentence>. <theme bridge>"
  return `${frame} ${card.name} (${orientation}). ${seed} ${bridge}`;
}

// ──────────────────────────────────────────────────────────────────────────────
// Whole-reading builder (used as both primary output and LLM-failure fallback)
// ──────────────────────────────────────────────────────────────────────────────

export interface DeterministicReading {
  cards: InterpretedCard[];
  summary: [string, string, string];
  overall_message: string;
  theme: QuestionTheme;
}

export function buildDeterministicReading(
  drawn: DrawnCard[],
  spread: SpreadDef,
  question: string,
): DeterministicReading {
  const theme = detectTheme(question);
  const cards: InterpretedCard[] = drawn.map((c, i) => {
    const position = spread.positions[i] ?? `Card ${i + 1}`;
    return {
      ...c,
      position,
      interpretation: interpretCard(c, c.orientation, position, theme),
    };
  });

  const summary = buildSummary(cards, theme);
  const overall_message = buildOverallMessage(cards, spread, theme);

  return { cards, summary, overall_message, theme };
}

function buildSummary(cards: InterpretedCard[], theme: QuestionTheme): [string, string, string] {
  const lead = cards[0];
  const last = cards[cards.length - 1];

  const hook = lead
    ? `${lead.name} (${lead.orientation}) is the loudest voice in this reading — the theme is ${themeLabel(theme)}.`
    : `The cards point toward ${themeLabel(theme)}.`;

  const upright = cards.filter((c) => c.orientation === 'Upright').length;
  const reversed = cards.length - upright;
  const balance = upright === reversed
    ? 'The energy is evenly split between open and held — a balanced moment.'
    : upright > reversed
      ? 'Most of the energy is flowing, which means action is favored over waiting.'
      : 'Most of the energy is asking to be released first, before the next push.';

  const action = last
    ? `Lean into ${actionFor(last.orientation, theme)} in the week ahead.`
    : 'Move slowly and notice what is actually working.';

  return [hook, balance, action];
}

function buildOverallMessage(
  cards: InterpretedCard[],
  spread: SpreadDef,
  theme: QuestionTheme,
): string {
  const titles = cards.map((c) => `${c.name} (${c.orientation}) in ${c.position}`).join(', ');
  return `Your ${spread.label.toLowerCase()} reading drew ${titles}. The thread running through these is ${themeLabel(theme)}: ${themeBridge(theme, dominantOrientation(cards))} Take the cards together as a single arc — the earlier positions describe the ground, the later ones describe the move. Trust the steady step over the dramatic one this cycle.`;
}

function dominantOrientation(cards: InterpretedCard[]): Orientation {
  const u = cards.filter((c) => c.orientation === 'Upright').length;
  return u >= cards.length / 2 ? 'Upright' : 'Reversed';
}

function themeLabel(theme: QuestionTheme): string {
  switch (theme) {
    case 'love': return 'the shape of a relationship';
    case 'career': return 'work and direction';
    case 'money': return 'resources and stewardship';
    case 'health': return 'body, energy, and rest';
    case 'spiritual': return 'meaning and inner path';
    case 'general':
    default: return 'the next clear step';
  }
}

function actionFor(orientation: Orientation, theme: QuestionTheme): string {
  const u = orientation === 'Upright';
  switch (theme) {
    case 'love': return u ? 'one honest conversation that has been waiting' : 'a quiet check-in with what you actually feel';
    case 'career': return u ? 'a single visible next step in your field' : 'a structural pause before the next big move';
    case 'money': return u ? 'one habit that compounds quietly' : 'an honest look at where energy is leaking';
    case 'health': return u ? 'two small body-honoring habits this week' : 'one full day of true rest';
    case 'spiritual': return u ? 'a daily five-minute sit, kept simple' : 'releasing one belief that no longer fits';
    case 'general':
    default: return u ? 'one small, visible action' : 'one honest pause';
  }
}
