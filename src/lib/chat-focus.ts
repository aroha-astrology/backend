// =============================================================================
// Chat focus: send only the window lines and divisional charts the question needs (audit S6, O2)
// =============================================================================
// Measured 2026-11-05 on three test charts: of ~89,000 characters sent per chat turn, the 15
// timing-domain window lines weigh ~11,700, the 24 divisional charts ~4,500 and the other reference
// lines ~1,700. A question about a job does not need the vehicle, siblings or spirituality windows.
//
// What stays no matter what: every other fact (date, dasha, Moon, Saturn, doshas, house lords,
// profile, purchases, panchang, second chart). Only the window lines and the divisional-chart lines
// are filtered, and only by a cheap keyword read of the reader's own message. When the message names
// no area, names a chart table, or spreads over many areas, nothing is filtered: the full set goes.
// The switch is chat.focusedFacts (ships off).
// =============================================================================

import type { Domain } from './astro-engine/dasha-confidence.js';
import type { LifeArea } from './intelligence/areas.js';
import { classifyQuestionAreas } from './intelligence/question-area.js';

export interface ChatFocus {
  /** The timing-domain window lines to keep. */
  domains: ReadonlySet<Domain>;
  /** The divisional charts to keep, as "D9". Other reference lines are not filtered. */
  vargas: ReadonlySet<string>;
}

/** Window lines each area can lean on. An area missing here (e.g. 'overall') has no focus. */
const AREA_DOMAINS: Partial<Record<LifeArea, Domain[]>> = {
  career: ['career', 'business'],
  business: ['business', 'career', 'wealth'],
  money: ['wealth', 'business'],
  relationships: ['love'],
  health: ['health'],
  education: ['education'],
  relocation: ['foreign', 'property'],
  family: ['parents', 'children', 'siblings', 'property'],
};

/** Divisional charts each area reads, on top of the always-kept D1, D9 and D10. */
const AREA_VARGAS: Partial<Record<LifeArea, string[]>> = {
  career: ['D24'],
  business: ['D2'],
  money: ['D2', 'D11'],
  relationships: ['D7'],
  health: ['D6', 'D8', 'D30'],
  education: ['D24', 'D5'],
  relocation: ['D4'],
  family: ['D3', 'D4', 'D7', 'D12', 'D16'],
};

/** The charts every reading leans on, so they are never left out. */
const ALWAYS_VARGAS = ['D1', 'D9', 'D10'];

/** More areas than this is a broad question: send everything. */
const MAX_FOCUSED_AREAS = 3;

/**
 * A reader who names a divisional chart or a chart table wants it. Latin words only; the same word
 * in another script just falls through to the keyword areas, which keep D1, D9 and D10 anyway.
 */
const NAMES_A_CHART =
  /\b(d\s?-?\d{1,3}|navam[sś]a|dasam[sś]a|dashaam[sś]a|dashamsa|varga\w*|divisional|ashtakavarga|sarvashtak\w*|bhinna\w*|bindu\w*|chandra\s+kundali|surya\s+kundali|arudha|upapada|karakamsha|atmakaraka|jaimini)\b/i;

/**
 * The focus for one message, or null to send the full set. Null when: the message names no area,
 * names a divisional chart or table, touches more than three areas, or is too short to carry a
 * topic (a bare "yes" or "and then?" continues whatever came before).
 */
export function chatFocusFor(message: string): ChatFocus | null {
  const text = message.trim();
  if (text.length < 8) return null;
  if (NAMES_A_CHART.test(text)) return null;

  const areas = classifyQuestionAreas(text).filter((a) => AREA_DOMAINS[a] !== undefined);
  if (areas.length === 0 || areas.length > MAX_FOCUSED_AREAS) return null;

  const domains = new Set<Domain>(areas.flatMap((a) => AREA_DOMAINS[a] ?? []));
  const vargas = new Set<string>([...ALWAYS_VARGAS, ...areas.flatMap((a) => AREA_VARGAS[a] ?? [])]);
  return { domains, vargas };
}

/** True when this divisional-chart line ("D9 (marriage, …") survives the focus. */
export function keepVargaLine(line: string, focus: ChatFocus | null | undefined): boolean {
  if (!focus) return true;
  const key = /^(D\d+) \(/.exec(line)?.[1];
  return key === undefined || focus.vargas.has(key);
}

/**
 * Told to the model whenever a focus is active, so it never fills a gap with a guess: it must say
 * it will look at another area when asked. Kept as one line at the end of the window lines.
 */
export const FOCUS_NOTE =
  'Window lines and divisional charts for other life areas are left out of this reply to keep it ' +
  'on the question. If the reader asks about another area, say you will look at that separately ' +
  'when they ask. Never guess a window or a divisional-chart placement that is not listed here.';
