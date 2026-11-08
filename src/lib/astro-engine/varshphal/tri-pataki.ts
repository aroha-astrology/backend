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
// THE VEDHA (which points of the figure pierce which). Source: PyJHora 4.8.7, jhora/ui/chakra.py,
// class Tripataki: `rasi_labels` gives the drawing point of each of the twelve places, `lines` the
// straight lines between points. Decoded (test/varshik-tri-pataki.spec.ts re-derives it from those
// two tables), each place is joined to exactly three others. Checked on Mehta's own reading of the
// Nehru chart (p. 169): counted in HOUSES FROM THE VARSHA LAGNA (the first flag), the Moon (house 9)
// is pierced by Rahu (house 2) and by Ketu and Saturn (house 8), and the Lagna (house 1) by Mercury and
// Venus (house 10); Jupiter (house 12) and the Sun and Mars (house 11) pierce neither, as the book says.
// Not yet confirmed on JHora's own Tripataki screen (its figure draws the annual planets, a different
// placement); ask the owner for one screenshot if that is wanted.
//
// THE VERDICT: Mehta gives no rule that combines the piercings into one score, only that a benefic
// piercing is good and a malefic one is not, and what each planet piercing the Moon stands for. So
// the reading lists the piercings of the Lagna and of the Moon, each marked benefic or malefic, in
// plain words. No combined score is made up.
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

/**
 * House (0 = the Lagna, counted from the Varsha Lagna) -> the three houses joined to it.
 * Derived from PyJHora's Tripataki lines, see the header.
 */
export const TRIPATAKI_JOINS: Readonly<Record<number, readonly number[]>> = {
  0: [3, 6, 9], 1: [2, 5, 8], 2: [1, 7, 10], 3: [0, 6, 9], 4: [5, 8, 11], 5: [1, 4, 10],
  6: [0, 3, 9], 7: [2, 8, 11], 8: [1, 4, 7], 9: [0, 3, 6], 10: [2, 5, 11], 11: [4, 7, 10],
};

const BENEFIC: PatakiBody[] = ['Jupiter', 'Venus', 'Mercury'];

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

export interface Piercing {
  body: PatakiBody;
  nature: 'benefic' | 'malefic';
}

export interface TriPatakiReading {
  placements: Record<PatakiBody, number>;
  /** Bodies whose place in the figure is joined to the Moon's, and to the Lagna's. */
  onMoon: Piercing[];
  onLagna: Piercing[];
  /** Plain sentences, one per flag. There is no combined score (Mehta gives no rule for one). */
  lines: string[];
}

export function readTriPataki(natal: NatalSigns, completedYears: number, varshaLagnaSign: number): TriPatakiReading {
  const placements = triPatakiPlacements(natal, completedYears);
  const houseOf = (b: PatakiBody) => mod(placements[b] - varshaLagnaSign, 12);
  const piercing = (house: number, self?: PatakiBody): Piercing[] =>
    (Object.keys(placements) as PatakiBody[])
      .filter((b) => b !== self && TRIPATAKI_JOINS[house]!.includes(houseOf(b)))
      .map((body) => ({ body, nature: BENEFIC.includes(body) ? 'benefic' : 'malefic' }));
  const onMoon = piercing(houseOf('Moon'), 'Moon');
  const onLagna = piercing(0);

  const names = (l: Piercing[], nature: Piercing['nature']) => l.filter((p) => p.nature === nature).map((p) => p.body);
  const say = (what: string, l: Piercing[]) => {
    if (l.length === 0) return `Nothing pierces your ${what} in this chart.`;
    const g = names(l, 'benefic'), m = names(l, 'malefic');
    const parts = [];
    if (g.length) parts.push(`${g.join(' and ')} (supportive)`);
    if (m.length) parts.push(`${m.join(' and ')} (testing)`);
    return `Your ${what} is pierced by ${parts.join(', and by ')}.`;
  };
  const lines = [say('Lagna, the first flag', onLagna), say('Moon', onMoon)];
  for (const p of onMoon) lines.push(`On the Moon, ${p.body} stands for ${VEDHA_ON_MOON_THEME[p.body as Exclude<PatakiBody, 'Moon'>]}.`);
  return { placements, onMoon, onLagna, lines };
}
