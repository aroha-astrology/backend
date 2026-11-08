// =============================================================================
// Shukra (Venus) and Guru (Jupiter) Asta: drikpanchang's published dates
// =============================================================================
// Owner decision 2026-11-09: wedding and move-in muhurat blocking follows drikpanchang's published Tara
// Asta dates (worked out from visibility), not a fixed orb. The fixed Surya Siddhanta orbs stay for planet
// strength and combustion in the scoring (calculations/planet-state.ts isCombust).
//
// Hand-kept like the festival table. Times are as drikpanchang prints them for New Delhi (IST). A period
// that starts in one year and ends in the next is listed once, under the page that printed it.
//
// 2028 and 2029 are NOT here yet: on 2026-11-09 drikpanchang served the 2027 page for every 2028 and 2029
// URL form tried (it publishes only the current and next year). Add them when the pages go up; until a
// year is covered, `astaCovered(year)` is false and the Varshik preflight refuses to build that year.
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
