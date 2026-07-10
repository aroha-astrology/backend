// =============================================================================
// Deterministic plain-language reading for the user's current Vimshottari
// Mahadasha/Antardasha — a fixed 9-planet enumeration, so a curated template
// is more reliable than an LLM call (no jargon-slip risk, no extra latency/
// cost, always available even if horoscope narration falls back to its own
// template). Computed straight from kundli.dashaData, never persisted, so it
// can never go stale relative to the source of truth.
// =============================================================================

import type { Planet } from '@aroha-astrology/shared';

export interface DashaReading {
  mahadashaPlanet: Planet;
  antardashaPlanet: Planet | null;
  /** One-line lead, plain language, no Sanskrit terms. */
  hook: string;
  /** 1-2 supporting sentences on what this period tends to mean. */
  meaning: string;
  /** ISO date (YYYY-MM-DD) the current Mahadasha ends, if known. */
  activeUntil: string | null;
}

const MAHADASHA_THEME: Record<Planet, { hook: string; meaning: string }> = {
  Sun: {
    hook: "You're in a Sun-led chapter — a stretch built around visibility, authority, and self-belief.",
    meaning:
      'This period tends to put you in front of people more, whether at work, in your family, or in your own confidence. It rewards taking the lead rather than waiting to be asked.',
  },
  Moon: {
    hook: "You're moving through a Moon-led chapter — a stretch tuned to emotions, home, and the people closest to you.",
    meaning:
      'Moods and relationships carry more weight than usual during this period. It favors nesting, caregiving, and paying attention to your own emotional needs rather than pushing through them.',
  },
  Mars: {
    hook: "You're in a Mars-led chapter — a high-energy stretch built for action, but one that can run hot.",
    meaning:
      'This period tends to bring drive, competitiveness, and a push to get things done — useful for pursuing goals, but worth watching for impatience or conflict along the way.',
  },
  Mercury: {
    hook: "You're in a Mercury-led chapter — a stretch favoring communication, learning, and business.",
    meaning:
      'Ideas, conversations, contracts, and short trips tend to move more during this period. It rewards staying sharp, curious, and quick to adapt.',
  },
  Jupiter: {
    hook: "You're in a Jupiter-led chapter — a broadly favorable stretch for growth, luck, and good judgment.",
    meaning:
      'This is generally one of the more supportive periods in the whole cycle — good for expansion, learning, finances, and being recognized for what you know. Opportunities tend to show up more than usual.',
  },
  Venus: {
    hook: "You're in a Venus-led chapter — a stretch tuned to love, comfort, money, and creativity.",
    meaning:
      'Relationships, beauty, pleasure, and material comfort tend to take center stage in this period. It favors investing in what makes life feel good, not just productive.',
  },
  Saturn: {
    hook: "You're in a Saturn-led chapter — a long, demanding stretch that rewards patience and discipline.",
    meaning:
      "This period asks for consistency over quick wins. Progress can feel slower here, but what you build tends to last — it's a marathon period, not a sprint.",
  },
  Rahu: {
    hook: "You're in a Rahu-led chapter — an intense, ambitious stretch that can bring rapid, unconventional change.",
    meaning:
      'This period tends to pull you toward bigger ambitions, new territory, or unconventional paths — exciting, but it rewards staying grounded rather than chasing every shiny opportunity.',
  },
  Ketu: {
    hook: "You're in a Ketu-led chapter — an introspective stretch pulling you away from the material and toward the inward.",
    meaning:
      'External ambitions can feel less compelling during this period, while spiritual or reflective pursuits gain pull. It favors letting go of what no longer fits rather than forcing outcomes.',
  },
};

const ANTARDASHA_NUANCE: Record<Planet, string> = {
  Sun: 'with a confidence-and-visibility undertone',
  Moon: 'with an emotional, home-focused undertone',
  Mars: 'with a high-energy, assertive undertone',
  Mercury: 'with a communication-and-business undertone',
  Jupiter: 'with a lucky, expansive undertone',
  Venus: 'with a relationship-and-comfort undertone',
  Saturn: 'with a slow-and-steady, disciplined undertone',
  Rahu: 'with a restless, ambitious undertone',
  Ketu: 'with a reflective, detached undertone',
};

interface RawDashaPeriod {
  planet?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  subPeriods?: unknown;
}

function toIsoDate(value: unknown): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function toDate(value: unknown): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

function isPlanet(value: unknown): value is Planet {
  return typeof value === 'string' && value in MAHADASHA_THEME;
}

/** Parse a YYYY-MM-DD date string to a Date at 12:00 UTC (midday avoids day-boundary issues). */
function parseDateMidday(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

/**
 * Find whichever period in `periods` covers `target` — i.e. whose
 * [startDate, endDate) range contains it — rather than trusting the
 * `isActive` flag, which was only ever computed relative to "now" at kundli
 * generation time and goes wrong for any other date (a different period, or
 * simply real time having moved on since generation).
 */
function findPeriodAsOf(periods: RawDashaPeriod[], target: Date): RawDashaPeriod | undefined {
  const t = target.getTime();
  return periods.find((p) => {
    const start = toDate(p.startDate);
    const end = toDate(p.endDate);
    return start && end && t >= start.getTime() && t < end.getTime();
  });
}

/**
 * Build the plain-language current-dasha reading from `kundli.dashaData`
 * (the `{ vimshottari: VimshottariDasha }` blob), as of `forDate` (defaults
 * to now). Returns null when the kundli or dasha data isn't available yet
 * (never fabricates a planet).
 *
 * Looks up the Mahadasha/Antardasha covering `forDate` from the full
 * `mahadashas` timeline instead of always using `currentMahadasha`/
 * `currentAntardasha` — those two fields are frozen at whatever "now" was
 * when the kundli was generated, so without this a horoscope for a
 * different period (or just an older kundli) would show a chapter that's no
 * longer actually current. Antardasha-level `subPeriods` are only ever
 * populated for the Mahadasha that was active at generation time (a
 * performance tradeoff in the astro-engine), so `forDate`s that land in a
 * different Mahadasha still resolve the correct planet, just without an
 * antardasha nuance — a rare edge case since Mahadashas span years.
 */
export function buildDashaReading(
  dashaData: Record<string, unknown> | null,
  forDate?: string,
): DashaReading | null {
  const vimshottari = dashaData?.vimshottari as Record<string, unknown> | undefined;
  const target = forDate ? parseDateMidday(forDate) : new Date();

  const mahadashas = vimshottari?.mahadashas as RawDashaPeriod[] | undefined;
  const maha =
    (mahadashas && findPeriodAsOf(mahadashas, target)) ??
    (vimshottari?.currentMahadasha as RawDashaPeriod | undefined);

  if (!isPlanet(maha?.planet)) return null;

  const subPeriods = maha.subPeriods as RawDashaPeriod[] | undefined;
  const antar =
    (subPeriods && findPeriodAsOf(subPeriods, target)) ??
    (maha === vimshottari?.currentMahadasha
      ? (vimshottari?.currentAntardasha as RawDashaPeriod | undefined)
      : undefined);

  const mahadashaPlanet = maha.planet;
  const antardashaPlanet = isPlanet(antar?.planet) ? antar.planet : null;
  const theme = MAHADASHA_THEME[mahadashaPlanet];

  const hook =
    antardashaPlanet && antardashaPlanet !== mahadashaPlanet
      ? `${theme.hook.replace(/\.$/, '')} — ${ANTARDASHA_NUANCE[antardashaPlanet]}.`
      : theme.hook;

  return {
    mahadashaPlanet,
    antardashaPlanet,
    hook,
    meaning: theme.meaning,
    activeUntil: toIsoDate(maha.endDate),
  };
}
