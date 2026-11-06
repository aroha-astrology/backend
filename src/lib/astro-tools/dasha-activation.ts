/**
 * Dasha activation (audit Sprint 12, G7): is a yoga or dosha "running" now because the
 * Mahadasha or Antardasha lord is one of the planets that make it?
 *
 * This is Aroha's own reading. No verse read says "a yoga gives its result in the period of
 * a planet that forms it" in these words (the engine's old `activationPeriod` text was the same
 * idea, unchecked), so every line carries the label below and nothing here is shown as classical.
 *
 * Pure functions over the saved dasha blob; the period is found by the date, never from the
 * `current*` fields frozen when the chart was built (same rule as chat-grounding's currentDasha).
 */
import { findPeriodAsOf, type RawDashaPeriod } from './dasha-reading.js';

export const ACTIVE_NOW_LABEL = "Active in your current period (Aroha's reading)";

export interface ActiveLords {
  mahadasha?: string | undefined;
  antardasha?: string | undefined;
}

/**
 * The Mahadasha and Antardasha lords covering `asOf`. With `mahadashaOnly` (a birth time that is
 * a stand-in) the Antardasha is left out: it swings with the minute of birth.
 */
export function activeDashaLords(
  dashaData: Record<string, unknown> | null | undefined,
  asOf: Date,
  opts: { mahadashaOnly?: boolean } = {},
): ActiveLords {
  const v = (dashaData?.vimshottari ?? {}) as Record<string, unknown>;
  const mahadashas = v.mahadashas as RawDashaPeriod[] | undefined;
  const md =
    (mahadashas && findPeriodAsOf(mahadashas, asOf)) ??
    (v.currentMahadasha as RawDashaPeriod | undefined);
  const out: ActiveLords = {};
  if (md?.planet) out.mahadasha = String(md.planet);
  if (opts.mahadashaOnly) return out;
  const subs = md?.subPeriods as RawDashaPeriod[] | undefined;
  const ad =
    (subs && findPeriodAsOf(subs, asOf)) ??
    (md === v.currentMahadasha ? (v.currentAntardasha as RawDashaPeriod | undefined) : undefined);
  if (ad?.planet) out.antardasha = String(ad.planet);
  return out;
}

/** Which running lords take part in `planets`, e.g. ["Venus Mahadasha"]. */
export function activeNowOf(
  planets: readonly string[] | null | undefined,
  lords: ActiveLords | null | undefined,
): { activeNow: boolean; by: string[] } {
  const by: string[] = [];
  if (planets && lords) {
    if (lords.mahadasha && planets.includes(lords.mahadasha))
      by.push(`${lords.mahadasha} Mahadasha`);
    if (lords.antardasha && planets.includes(lords.antardasha))
      by.push(`${lords.antardasha} Antardasha`);
  }
  return { activeNow: by.length > 0, by };
}

/** " [Active in your current period (Aroha's reading): Venus Mahadasha]", or "" when nothing is running. */
export function activeNowNote(
  planets: readonly string[] | null | undefined,
  lords: ActiveLords | null | undefined,
): string {
  const { by } = activeNowOf(planets, lords);
  return by.length > 0 ? ` [${ACTIVE_NOW_LABEL}: ${by.join(' and ')}]` : '';
}

/**
 * The planets that make each natal dosha. Sade Sati and Dhaiya are transits (not made by the
 * natal dasha lords), Pitra's indicators vary, so none of the three has an entry.
 */
export function doshaPlanets(key: string, dosha: Record<string, unknown>): string[] {
  switch (key) {
    case 'mangal':
      return ['Mars'];
    case 'guruChandal':
      return ['Jupiter', 'Rahu'];
    case 'kaalSarp':
      return ['Rahu', 'Ketu'];
    case 'kemDruma':
      return ['Moon'];
    case 'grahan':
      return dosha.type === 'chandra_grahan'
        ? ['Moon', 'Rahu', 'Ketu']
        : dosha.type === 'both'
          ? ['Sun', 'Moon', 'Rahu', 'Ketu']
          : ['Sun', 'Rahu', 'Ketu'];
    default:
      return [];
  }
}

/**
 * The running lords for a report's dosha/yoga panel, from the report context: today's Mahadasha
 * and Antardasha, or the Mahadasha alone when the reader's birth time is a stand-in. One helper
 * so every report that shows the panel does it the same way.
 */
export function reportActiveLords(
  ctx: { dashaData?: Record<string, unknown> | null; personBirthTimeAccuracy?: string | null },
  asOf: Date = new Date(),
): ActiveLords {
  return activeDashaLords(ctx.dashaData ?? null, asOf, {
    mahadashaOnly: ctx.personBirthTimeAccuracy === 'unknown',
  });
}

/** Short form of the label for the chat prompt (the character budget is tight; the model paraphrases it). */
export const ACTIVE_NOW_CHAT_LABEL = "Running now (Aroha's reading)";

/** Chat names at most this many items; they come strongest first. */
const MAX_ACTIVE_NOW_ITEMS = 3;

/**
 * One line for chat: the present yogas and doshas a running lord takes part in, for example
 * "Running now (Aroha's reading): Ruchaka Yoga (Mars Mahadasha); Mangal Dosha (Mars Mahadasha)."
 * Chat has a tight character budget, so it gets this one line (at most three items) instead of a
 * note after each item. Empty when nothing is running.
 */
export function activeNowLine(
  items: ReadonlyArray<{ name: string; planets: readonly string[] | null | undefined }>,
  lords: ActiveLords | null | undefined,
): string {
  // Each item once, with the running lords that take part (for example "Venus Mahadasha and
  // Venus Antardasha").
  const parts: string[] = [];
  for (const it of items) {
    if (parts.length >= MAX_ACTIVE_NOW_ITEMS) break;
    const { by } = activeNowOf(it.planets, lords);
    if (by.length === 0) continue;
    parts.push(`${it.name} (${by.join(' and ')})`);
  }
  return parts.length > 0 ? `${ACTIVE_NOW_CHAT_LABEL}: ${parts.join('; ')}.` : '';
}
