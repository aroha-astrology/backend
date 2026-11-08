// =============================================================================
// Mudda dasha — the Vimshottari order squeezed into one Varsha year
// =============================================================================
// The nine Vimshottari lords, in Vimshottari order, share ONE Varsha year in the same ratio
// as their Vimshottari years (Ketu 7 ... Venus 20, 120 in all). The year here is the exact
// span from one solar return to the next (about 365.256 days), not a constant 360 days.
//
// START LORD (corrected in C2, 2026-11-08): the lord at index
//   (birth-nakshatra number + completed years - 1) mod 9
// of the Vimshottari order Ketu, Venus, Sun, ...; the nakshatra number runs 1 to 27 and the
// completed years are the age the birthday makes. Each later year moves on one lord. It does
// NOT come from the Varsha Moon. The idea behind it (see annual-dashas.ts): the lord of the natal
// Moon star moved on one star per completed year. The 27-star wrap does not show here, because 27 is a
// multiple of 9. Also checked on two more charts at ages 21-22 and 64-65 (test/fixtures/jhora/c1c2.json).
// EVIDENCE: M.S. Mehta, Annual Horoscope (Varshaphala), ch. VI: (nakshatra - 2 + completed
// years) mod 9 gives a number in the list Sun 1, Moon 2, Mars 3, Rahu 4, Jupiter 5, Saturn 6,
// Mercury 7, Ketu 8, Venus 9 or 0; that is index (nakshatra + years - 1) in the Ketu-first
// list used here. Jagannatha Hora's first Mudda lord on all 10 gold charts, 2026 and 2027
// (20 of 20), is the same lord. The earlier "- 2" was one lord out on every one of the 20.
//
// DELIBERATE DIVERGENCE from PyJHora 4.8.7 and JHora: they start each list at
// (birth + age x year - a natal-Moon balance) instead of at the solar return, so one year's
// list does not end where the next begins. We keep the exact solar-return anchoring because
// the plan needs the seam to be an exact equality (owner decision 2026-11-06). Web searches (2026-11-06) gave no classical rule for the start lord or
// the balance. UNVERIFIED until real JHora output is recorded in
// backend/test/fixtures/varshik/jhora.json; this module starts every Varsha year on a whole
// period. No verse is cited because none was opened and checked.
//
// SEAM: the periods are placed with integer milliseconds from the two solar returns that bound
// the year, and the last period ends on exactly the next solar return, so the list for one
// year ends on the very number the next year's list starts on.
// =============================================================================

export type MuddaPlanet =
  | 'Ketu'
  | 'Venus'
  | 'Sun'
  | 'Moon'
  | 'Mars'
  | 'Rahu'
  | 'Jupiter'
  | 'Saturn'
  | 'Mercury';

/** Vimshottari order with each lord's Vimshottari years. */
export const MUDDA_ORDER: ReadonlyArray<{ planet: MuddaPlanet; years: number }> = [
  { planet: 'Ketu', years: 7 },
  { planet: 'Venus', years: 20 },
  { planet: 'Sun', years: 6 },
  { planet: 'Moon', years: 10 },
  { planet: 'Mars', years: 7 },
  { planet: 'Rahu', years: 18 },
  { planet: 'Jupiter', years: 16 },
  { planet: 'Saturn', years: 19 },
  { planet: 'Mercury', years: 17 },
];

const TOTAL_YEARS = 120;

export interface MuddaPeriod {
  lord: MuddaPlanet;
  startMs: number;
  endMs: number;
  /** The nine sub-periods, starting with the lord itself, in the same proportions. */
  antardashas: Array<{ lord: MuddaPlanet; startMs: number; endMs: number }>;
}

/**
 * Index into MUDDA_ORDER of the first lord of a Varsha year.
 * @param nakshatraNumber the Moon's birth nakshatra, 1 (Ashwini) to 27 (Revati)
 * @param completedYears age in whole years at the solar return that opens the year
 */
export function muddaStartIndex(nakshatraNumber: number, completedYears: number): number {
  return (((nakshatraNumber + completedYears - 1) % 9) + 9) % 9;
}

/** `total` split by `weights`, as integer cut points from `startMs` that end exactly on `endMs`. */
function cutPoints(startMs: number, endMs: number, weights: number[]): number[] {
  const span = endMs - startMs;
  const sum = weights.reduce((a, b) => a + b, 0);
  const cuts = [startMs];
  let run = 0;
  for (let i = 0; i < weights.length - 1; i++) {
    run += weights[i]!;
    cuts.push(startMs + Math.round((span * run) / sum));
  }
  cuts.push(endMs);
  return cuts;
}

/**
 * The nine Mudda periods (each with its nine sub-periods) of the Varsha year that begins at
 * `solarReturnMs` and ends at `nextSolarReturnMs`.
 */
export function computeMuddaDasha(args: {
  nakshatraNumber: number;
  completedYears: number;
  solarReturnMs: number;
  nextSolarReturnMs: number;
}): MuddaPeriod[] {
  const { nakshatraNumber, completedYears, solarReturnMs, nextSolarReturnMs } = args;
  if (!(nextSolarReturnMs > solarReturnMs)) {
    throw new Error('Mudda dasha: the next solar return must be after this one');
  }
  if (!Number.isInteger(nakshatraNumber) || nakshatraNumber < 1 || nakshatraNumber > 27) {
    throw new Error('Mudda dasha: nakshatraNumber must be an integer from 1 to 27');
  }

  const start = muddaStartIndex(nakshatraNumber, completedYears);
  const sequence = Array.from({ length: 9 }, (_, i) => MUDDA_ORDER[(start + i) % 9]!);
  const cuts = cutPoints(
    solarReturnMs,
    nextSolarReturnMs,
    sequence.map((s) => s.years),
  );

  return sequence.map((main, i) => {
    const from = cuts[i]!;
    const to = cuts[i + 1]!;
    // Sub-periods start with the lord itself and follow the same order.
    const mainIdx = (start + i) % 9;
    const subs = Array.from({ length: 9 }, (_, k) => MUDDA_ORDER[(mainIdx + k) % 9]!);
    const subCuts = cutPoints(
      from,
      to,
      subs.map((s) => s.years),
    );
    return {
      lord: main.planet,
      startMs: from,
      endMs: to,
      antardashas: subs.map((s, k) => ({
        lord: s.planet,
        startMs: subCuts[k]!,
        endMs: subCuts[k + 1]!,
      })),
    };
  });
}

/** The period (and sub-period) running at `atMs`, or null outside the year. */
export function muddaAt(periods: MuddaPeriod[], atMs: number) {
  const main = periods.find((p) => atMs >= p.startMs && atMs < p.endMs);
  if (!main) return null;
  const sub = main.antardashas.find((a) => atMs >= a.startMs && atMs < a.endMs);
  return { main, sub: sub ?? main.antardashas[main.antardashas.length - 1]! };
}

export { TOTAL_YEARS as MUDDA_TOTAL_YEARS };
