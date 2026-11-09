// =============================================================================
// Shukra (Venus) and Guru (Jupiter) Asta: drikpanchang's published dates
// =============================================================================
// Owner decision 2026-11-09: wedding and move-in muhurat blocking follows drikpanchang's published Tara
// Asta dates (worked out from visibility), not a fixed orb. The fixed Surya Siddhanta orbs stay for planet
// strength and combustion in the scoring (calculations/planet-state.ts isCombust).
//
// Hand-kept like the festival table. Times are as drikpanchang prints them for New Delhi (IST); drikpanchang
// works Tara Asta out for the observer's place (a California visitor sees Venus 2027 as 19 Jul to 13 Sep), and
// this table is the New Delhi reading, the same place the festival table uses. A period that starts in one
// year and ends in the next is listed once, under the page that printed it.
//
// Read by the Varshik decision table (reports/varshik-muhurta.ts) and by the live Decide screen
// (decisions.service daySkies -> decision-engine avoidFlags), so the report and the app agree on Asta days.
//
// 2028 and 2029 are NOT here yet: on 2026-11-09 (12 URL forms in two tries, plus a web search for indexed
// copies) drikpanchang served only the 2027 page for 2028 and 2029; it publishes the current and
// next year. Add them when the pages go up (expect 2028 from about January 2027). Until a year is covered,
// `astaCovered(year)` is false: the Varshik preflight refuses to build that year, and Decide falls back to the
// Surya Siddhanta orb for that year's wedding dates.
// =============================================================================

export interface AstaPeriod {
  planet: 'Venus' | 'Jupiter';
  /** Start and end instants, ISO with the IST offset, as drikpanchang prints them. */
  startsAt: string;
  endsAt: string;
  /** The drikpanchang page the row was copied from. */
  source: string;
}

const SHUKRA = (year: number) =>
  `https://www.drikpanchang.com/planet/asta/shukra-asta-date-time.html?year=${year}&geoname-id=1261481`;
const GURU = (year: number) =>
  `https://www.drikpanchang.com/planet/asta/guru-asta-date-time.html?year=${year}&geoname-id=1261481`;

export const ASTA_PERIODS: readonly AstaPeriod[] = [
  // 2026 pages (read 2026-11-09)
  { planet: 'Venus', startsAt: '2025-12-11T06:35:00+05:30', endsAt: '2026-02-01T18:27:00+05:30', source: SHUKRA(2026) },
  { planet: 'Venus', startsAt: '2026-10-12T18:19:00+05:30', endsAt: '2026-10-29T06:00:00+05:30', source: SHUKRA(2026) },
  { planet: 'Jupiter', startsAt: '2026-07-15T19:59:00+05:30', endsAt: '2026-08-12T05:03:00+05:30', source: GURU(2026) },
  // 2027 pages (read 2026-11-09)
  { planet: 'Venus', startsAt: '2027-07-21T05:08:00+05:30', endsAt: '2027-09-09T19:00:00+05:30', source: SHUKRA(2027) },
  { planet: 'Jupiter', startsAt: '2027-08-17T19:32:00+05:30', endsAt: '2027-09-13T05:22:00+05:30', source: GURU(2027) },
];

/** Years whose Venus and Jupiter pages have both been copied in. */
export const ASTA_YEARS: readonly number[] = [2026, 2027];

export const astaCovered = (year: number): boolean => ASTA_YEARS.includes(year);

/**
 * The fallback for a year the table does not cover (owner, 2026-11-09): it must never open a day drikpanchang
 * blocks, so its window has to CONTAIN drikpanchang's. Drikpanchang works Tara Asta out from visibility, and
 * its window edges sit at these distances from the Sun (2026-2027, measured with the engine):
 *   Venus direct      6.1 to 7.8 deg   -> 10 deg (the Surya Siddhanta orb) contains it
 *   Venus retrograde  17.6 deg at the start of Oct 2026 (inferior conjunction), 7.8 deg at the end
 *                     -> 20 deg; the classical 8 deg (or even 10) would open 12 to 17 Oct 2026, which drik blocks
 *   Jupiter           9.5 to 10.3 deg  -> 11 deg (Surya Siddhanta) contains it
 * The retrograde figure rests on ONE observed window (Oct 2026); re-check it when 2028 is copied in.
 * test/asta-fallback.spec.ts proves the containment for every period in the table.
 */
export const FALLBACK_ORB = { Venus: 10, VenusRetrograde: 20, Jupiter: 11 } as const;

function separation(a: number, b: number): number {
  const d = Math.abs((((a - b) % 360) + 360) % 360);
  return d > 180 ? 360 - d : d;
}

/** Venus or Jupiter Asta by the fallback orb, for muhurat in a year the table does not cover. */
export function fallbackAsta(planet: string, lon: number, sunLon: number, retrograde: boolean): boolean {
  if (planet === 'Venus') return separation(lon, sunLon) < (retrograde ? FALLBACK_ORB.VenusRetrograde : FALLBACK_ORB.Venus);
  if (planet === 'Jupiter') return separation(lon, sunLon) < FALLBACK_ORB.Jupiter;
  return false;
}

const warned = new Set<number>();
/** True the first time a year falls back, so the caller logs it once per process and year. */
export function firstFallbackFor(year: number): boolean {
  if (warned.has(year)) return false;
  warned.add(year);
  return true;
}
