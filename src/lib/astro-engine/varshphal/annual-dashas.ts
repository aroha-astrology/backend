// =============================================================================
// Patyayini dasha and Mudda Yogini dasha — the other two dashas of a Varsha year
// =============================================================================
// Both fill ONE Varsha year, from one solar return to the next, with integer-millisecond cut
// points that end exactly on the next return. So the list for one year ends on the number the
// next year's list starts on (the same seam rule as Mudda, see mudda-dasha.ts).
//
// PATYAYINI (M.S. Mehta, Annual Horoscope (Varshaphala), ch. VI): the Sun, Moon, Mars, Mercury,
// Jupiter, Venus, Saturn and the Varsha Lagna take part. Their krishamshas (the degrees inside
// the sign, signs thrown away) are put in ascending order, which is the order of the dashas. Each
// planet's patyamsha is its krishamsha minus the one before it (the first keeps its own). The
// largest krishamsha is the whole year, so a dasha lasts patyamsha / largest krishamsha of the
// year. Antardashas: the lord's own dasha first, then the others in the same order, each as long
// as (the dasha's length x the antardasha lord's dasha length) / the year.
// Jagannatha Hora's Patyayini dasha starts at the return and ends on the next one, the same
// shape; the check against its 10 gold charts is test/varshik-annual-dashas.spec.ts.
//
// MUDDA YOGINI (Mehta, ch. VI): the eight Yoginis share the year in the ratio of their days in
// the 360-day Yogini round: Mangala (Moon) 10, Pingala (Sun) 20, Dhanya (Jupiter) 30, Bhramari
// (Mars) 40, Bhadrika (Mercury) 50, Ulka (Saturn) 60, Siddha (Venus) 70, Sankata (Rahu) 80.
// START LORD: (birth nakshatra + completed years - 1) mod 8 into that list. This is the rule
// that fits Jagannatha Hora's first Yogini lord on 14 of the 20 gold chart-years; the book's own
// rule ("add 3, divide by 8") is three places away from JHora on those, and on the other 6
// chart-years (ages 43 to 57) JHora is five places further on; the cause is NOT found (see
// KNOWN_YOGINI_START_MISSES in the spec). As with Mudda, the year starts on a whole period at the
// solar return; JHora and the book start it part-way through a period (a balance).
// =============================================================================

export type YoginiLord = 'Moon' | 'Sun' | 'Jupiter' | 'Mars' | 'Mercury' | 'Saturn' | 'Venus' | 'Rahu';

export const YOGINI_ORDER: ReadonlyArray<{ name: string; lord: YoginiLord; days: number }> = [
  { name: 'Mangala', lord: 'Moon', days: 10 },
  { name: 'Pingala', lord: 'Sun', days: 20 },
  { name: 'Dhanya', lord: 'Jupiter', days: 30 },
  { name: 'Bhramari', lord: 'Mars', days: 40 },
  { name: 'Bhadrika', lord: 'Mercury', days: 50 },
  { name: 'Ulka', lord: 'Saturn', days: 60 },
  { name: 'Siddha', lord: 'Venus', days: 70 },
  { name: 'Sankata', lord: 'Rahu', days: 80 },
];

export interface DashaPeriod<L extends string = string> {
  lord: L;
  startMs: number;
  endMs: number;
  antardashas: Array<{ lord: L; startMs: number; endMs: number }>;
}

/** `weights` as integer cut points from `startMs` that end exactly on `endMs`. */
function cuts(startMs: number, endMs: number, weights: number[]): number[] {
  const span = endMs - startMs;
  const sum = weights.reduce((a, b) => a + b, 0);
  const out = [startMs];
  let run = 0;
  for (let i = 0; i < weights.length - 1; i++) {
    run += weights[i]!;
    out.push(startMs + Math.round((span * run) / sum));
  }
  out.push(endMs);
  return out;
}

/** Nine-style split: the main periods and, inside each, the antardashas in the same ratio. */
function build<L extends string>(
  lords: L[],
  weights: number[],
  startMs: number,
  endMs: number,
): DashaPeriod<L>[] {
  const mainCuts = cuts(startMs, endMs, weights);
  return lords.map((lord, i) => {
    const from = mainCuts[i]!;
    const to = mainCuts[i + 1]!;
    const order = lords.map((_, k) => (i + k) % lords.length);
    const subCuts = cuts(from, to, order.map((j) => weights[j]!));
    return {
      lord,
      startMs: from,
      endMs: to,
      antardashas: order.map((j, k) => ({ lord: lords[j]!, startMs: subCuts[k]!, endMs: subCuts[k + 1]! })),
    };
  });
}

/** Index into YOGINI_ORDER of the first lord of a Varsha year. */
export function yoginiStartIndex(nakshatraNumber: number, completedYears: number): number {
  return (((nakshatraNumber + completedYears - 1) % 8) + 8) % 8;
}

export function computeMuddaYogini(args: {
  nakshatraNumber: number;
  completedYears: number;
  solarReturnMs: number;
  nextSolarReturnMs: number;
}): DashaPeriod<YoginiLord>[] {
  const { nakshatraNumber, completedYears, solarReturnMs, nextSolarReturnMs } = args;
  if (!(nextSolarReturnMs > solarReturnMs)) {
    throw new Error('Mudda Yogini: the next solar return must be after this one');
  }
  if (!Number.isInteger(nakshatraNumber) || nakshatraNumber < 1 || nakshatraNumber > 27) {
    throw new Error('Mudda Yogini: nakshatraNumber must be an integer from 1 to 27');
  }
  const start = yoginiStartIndex(nakshatraNumber, completedYears);
  const seq = Array.from({ length: 8 }, (_, i) => YOGINI_ORDER[(start + i) % 8]!);
  return build(
    seq.map((s) => s.lord),
    seq.map((s) => s.days),
    solarReturnMs,
    nextSolarReturnMs,
  );
}

export type PatyayiniLord =
  | 'Sun' | 'Moon' | 'Mars' | 'Mercury' | 'Jupiter' | 'Venus' | 'Saturn' | 'Lagna';

export interface PatyayiniInput {
  /** Longitude 0-360 of the Varsha Lagna and of each of the seven planets. */
  lagna: number;
  planets: Partial<Record<Exclude<PatyayiniLord, 'Lagna'>, number>>;
}

const PATYAYINI_PLANETS: Exclude<PatyayiniLord, 'Lagna'>[] = [
  'Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn',
];

/** The eight lords with their krishamsha, ascending (ties keep the order Sun to Saturn, then Lagna). */
export function patyayiniOrder(input: PatyayiniInput): Array<{ lord: PatyayiniLord; krishamsha: number }> {
  const items: Array<{ lord: PatyayiniLord; krishamsha: number }> = PATYAYINI_PLANETS.map((p) => ({
    lord: p,
    krishamsha: (((input.planets[p] ?? 0) % 30) + 30) % 30,
  }));
  items.push({ lord: 'Lagna', krishamsha: ((input.lagna % 30) + 30) % 30 });
  return items
    .map((it, i) => ({ it, i }))
    .sort((a, b) => a.it.krishamsha - b.it.krishamsha || a.i - b.i)
    .map((x) => x.it);
}

export function computePatyayini(args: {
  input: PatyayiniInput;
  solarReturnMs: number;
  nextSolarReturnMs: number;
}): DashaPeriod<PatyayiniLord>[] {
  const { input, solarReturnMs, nextSolarReturnMs } = args;
  if (!(nextSolarReturnMs > solarReturnMs)) {
    throw new Error('Patyayini: the next solar return must be after this one');
  }
  const order = patyayiniOrder(input);
  const weights = order.map((o, i) => o.krishamsha - (i === 0 ? 0 : order[i - 1]!.krishamsha));
  if (!(weights.reduce((a, b) => a + b, 0) > 0)) {
    throw new Error('Patyayini: all eight krishamshas are zero');
  }
  return build(
    order.map((o) => o.lord),
    weights,
    solarReturnMs,
    nextSolarReturnMs,
  );
}

/** The period (and sub-period) of any of these dashas running at `atMs`, or null outside the year. */
export function dashaAt<L extends string>(periods: DashaPeriod<L>[], atMs: number) {
  const main = periods.find((p) => atMs >= p.startMs && atMs < p.endMs);
  if (!main) return null;
  const sub = main.antardashas.find((a) => atMs >= a.startMs && atMs < a.endMs);
  return { main, sub: sub ?? main.antardashas[main.antardashas.length - 1]! };
}
