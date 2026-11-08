// =============================================================================
// Tri-Pataki chakra of the Varsha year
// =============================================================================
// Source: M.S. Mehta, Annual Horoscope (Varshaphala), ch. X "Tri-Pataki Chakra" (pp. 166-170).
//
// PLACEMENT (built, checked on his worked example, Nehru 1946-47, 58th year; test/varshik-tri-pataki.spec.ts).
// The year n is the completed years plus one. Each natal body moves on by a count taken from n:
//   Moon                          n mod 9 (0 counts as 9), forward from its natal sign
//   Sun Mercury Jupiter Venus Saturn   n mod 4 (0 as 4), forward
//   Mars                          n mod 6 (0 as 6), forward
//   Rahu and Ketu                 n mod 6 (0 as 6), BACKWARD
// "Count 4 from Cancer" is Libra: the count includes the sign you start from, so the body lands
// (r - 1) signs on. The chart is then drawn with the Varsha Lagna sign at the first flag and the
// signs anticlockwise.
// This is Mehta's method. It is NOT what Jagannatha Hora's Tripataki tab draws: JHora puts the
// planets of the annual chart on the figure (its placements equal the Varsha chart's signs; see
// test/fixtures/jhora/README.md).
//
// THE VEDHA (which signs pierce which) and the VERDICT: NOT BUILT. Mehta says each point of the
// figure "is influenced by lines from three different points" and reads, in the Nehru example, Rahu,
// Ketu and Saturn piercing the Moon and Mercury and Venus piercing the Lagna, but his drawing of
// which points those are cannot be read from the book and no second source was found (2026-11-08).
// Nothing here guesses. `readTriPataki` returns `computed: false` until `TRIPATAKI_VEDHA` is filled
// in from a checked source and tested on the Nehru example. The meaning of each planet's vedha on the
// Moon, in Mehta's words, is kept in VEDHA_ON_MOON_THEME in softened form.
// =============================================================================

export type PatakiBody = 'Sun' | 'Moon' | 'Mars' | 'Mercury' | 'Jupiter' | 'Venus' | 'Saturn' | 'Rahu' | 'Ketu';

/** Signs 0 (Aries) to 11 (Pisces) of the nine natal bodies. */
export type NatalSigns = Record<PatakiBody, number>;

const mod = (n: number, m: number) => ((n % m) + m) % m;
const remainder = (n: number, by: number) => (n % by === 0 ? by : n % by);

export function triPatakiPlacements(natal: NatalSigns, completedYears: number): Record<PatakiBody, number> {
  const n = completedYears + 1;
  const out = {} as Record<PatakiBody, number>;
  for (const body of Object.keys(natal) as PatakiBody[]) {
    const from = natal[body];
    if (body === 'Moon') out[body] = mod(from + remainder(n, 9) - 1, 12);
    else if (body === 'Mars') out[body] = mod(from + remainder(n, 6) - 1, 12);
    else if (body === 'Rahu' || body === 'Ketu') out[body] = mod(from - (remainder(n, 6) - 1), 12);
    else out[body] = mod(from + remainder(n, 4) - 1, 12);
  }
  return out;
}

/** Not filled in: see the header. When it is, it maps a sign to the signs whose planets pierce it. */
export const TRIPATAKI_VEDHA: Readonly<Record<number, readonly number[]>> | null = null;

/** What a planet piercing the Moon stands for, softened from Mehta (no death, no disease words). */
export const VEDHA_ON_MOON_THEME: Record<Exclude<PatakiBody, 'Moon'>, string> = {
  Sun: 'pride and a wish to be seen; the father',
  Mars: 'sharp energy and quarrels to keep in check',
  Mercury: 'a worried, busy mind',
  Jupiter: 'generosity, good company, faith and children',
  Venus: 'comfort, art, ease and gain',
  Saturn: 'a heavier, more solitary and demanding mood',
  Rahu: 'restlessness and a hunger for more',
  Ketu: 'detachment and an unsettled, searching mood',
};

export interface TriPatakiReading {
  computed: boolean;
  placements: Record<PatakiBody, number>;
  /** Present only when computed. */
  onMoon?: PatakiBody[];
  onLagna?: PatakiBody[];
  reason?: string;
}

export function readTriPataki(natal: NatalSigns, completedYears: number, varshaLagnaSign: number): TriPatakiReading {
  const placements = triPatakiPlacements(natal, completedYears);
  if (!TRIPATAKI_VEDHA) {
    return { computed: false, placements, reason: 'the vedha table is not sourced yet' };
  }
  const piercing = (sign: number) =>
    (Object.keys(placements) as PatakiBody[]).filter((b) => (TRIPATAKI_VEDHA![sign] ?? []).includes(placements[b]));
  return {
    computed: true,
    placements,
    onMoon: piercing(placements.Moon).filter((b) => b !== 'Moon'),
    onLagna: piercing(varshaLagnaSign),
  };
}
