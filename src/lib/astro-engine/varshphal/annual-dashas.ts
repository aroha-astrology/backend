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
// START LORD: the Yogini lord of the PROGRESSED Moon star. The Moon moves on one nakshatra for each
// completed year of age and, after Revati, comes back to Ashwini; the lord is the usual Yogini one of
// that star, (star number + 3) mod 8 (Mehta: "add 3, divide by 8"), 1 = Mangala. So
//   progressed star = ((birth nakshatra + completed years - 1) mod 27) + 1
// Mehta's text adds the years without the wrap at 27, which is why a plain sum goes wrong once
// nakshatra + years passes 27; 27 is not a multiple of 8, so every wrap moves the lord back by 3 places.
// (The Mudda Vimshottari start lord is the same idea; 27 is a multiple of 9, so there the wrap does
// not show and mudda-dasha.ts needs none.) CHECK: equals Jagannatha Hora's first Yogini lord on all 24
// chart-years recorded, ages 21 to 65 (10 gold charts in 2026 and 2027, and two more charts C1 aged 21
// and 22, C2 aged 64 and 65; test/fixtures/jhora/c1c2.json). Found 2026-11-09: it replaced an earlier
// fit "(years mod 43)" that matched the same data but had no reason behind it.
// As with Mudda, the year starts on a whole period at the solar return; JHora and the book start it
// part-way through a period (a balance).
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
  const progressedStar = ((((nakshatraNumber + completedYears - 1) % 27) + 27) % 27) + 1;
  return (progressedStar + 2) % 8;
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

/**
 * Patyayini dates are shown at WEEK resolution only ("2nd week of March"), never as an exact day:
 * the engine's cut points wander up to 3.9 days from Jagannatha Hora's on the 20 gold chart-years,
 * and no scaling (exact return-to-return span, 365.256364, 365.24219 or 360 days) closes the gap
 * (2026-11-09 test; the three real-year scalings are identical to 0.01 day, 360 is worse), so the
 * cause is in JHora's planet longitudes, not in the arithmetic here. Days 1-7 are the 1st week,
 * 8-14 the 2nd, 15-21 the 3rd, and day 22 to the end of the month the 4th.
 */
export function weekLabel(ms: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, day: 'numeric', month: 'long', year: 'numeric' }).formatToParts(new Date(ms));
  const day = Number(parts.find((p) => p.type === 'day')!.value);
  const month = parts.find((p) => p.type === 'month')!.value;
  const ordinal = ['1st', '2nd', '3rd', '4th'][Math.min(3, Math.floor((day - 1) / 7))]!;
  return `${ordinal} week of ${month}`;
}
