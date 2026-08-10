// =============================================================================
// Bhava Chalit — the house (bhava) chart, as distinct from the sign (rasi) chart
// =============================================================================
// The Rasi chart equates one house to one whole 30° sign, so a planet's house
// is decided purely by its sign. That is exact only when the Lagna falls at 0°
// of a sign; the further the Lagna sits into its sign, the more the real house
// boundaries slide away from the sign boundaries. Standard practice reads
// dignity and aspect from the Rasi chart but house-level EVENTS (career,
// marriage, children) from the Chalit chart.
//
// This engine had no chalit anywhere: whole-sign was the default house system,
// and `calculateHouses` deliberately overwrites the computed cusps with
// `signIndex * 30` in that mode, so even the cusp data was discarded. A planet
// at 28° Aries under a 2° Aries Lagna was therefore always reported in house 1,
// when by bhava it has effectively already moved to house 12.
//
// Derived from the Ascendant DEGREE alone (bhava madhya = the Lagna degree,
// each house spanning 15° either side of its midpoint). That is the equal-bhava
// definition most Indian software shows as "Chalit", and it needs no cusp
// plumbing, no house-system change and no migration — the ascendant degree is
// already on every stored chart.
//
// ponytail: equal 30° bhavas centred on the Lagna degree. Sripati/Placidus
// bhavas are unequal and need the real cusps preserved through
// `calculateHouses`; add that only if the equal version is ever shown to
// misplace planets that matter.
// =============================================================================

/** Normalize any angle into [0, 360). */
function norm360(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

export interface ChalitPlacement {
  planet: string;
  /** House by whole-sign / Rasi reckoning (1-12). */
  rasiHouse: number;
  /** House by bhava (Chalit) reckoning (1-12). */
  chalitHouse: number;
  /** True when the two disagree — the only case worth narrating. */
  moved: boolean;
}

/**
 * The bhava a longitude falls in, given the Ascendant's exact longitude.
 * House 1 is centred on the Lagna degree and spans Lagna ±15°.
 */
export function chalitHouseFor(longitude: number, ascendantLongitude: number): number {
  const offset = norm360(longitude - ascendantLongitude + 15);
  return Math.floor(offset / 30) + 1;
}

/** Whole-sign house for a planet — the Rasi reckoning, for comparison. */
export function rasiHouseFor(planetSignIndex: number, ascendantSignIndex: number): number {
  return ((((planetSignIndex - ascendantSignIndex) % 12) + 12) % 12) + 1;
}

/**
 * Compare every planet's Rasi house against its Chalit house.
 *
 * `ascendantLongitude` is the Ascendant's absolute sidereal longitude
 * (signIndex * 30 + degree-within-sign). Returns an empty array when the chart
 * is too degraded to place anything, never a guessed placement.
 */
export function computeBhavaChalit(
  planets: Array<{ planet: string; longitude?: number; signIndex?: number; house?: number }>,
  ascendantLongitude: number,
  ascendantSignIndex: number,
): ChalitPlacement[] {
  if (!Number.isFinite(ascendantLongitude) || !Number.isFinite(ascendantSignIndex)) return [];

  const placements: ChalitPlacement[] = [];

  for (const p of planets) {
    const longitude = Number(p.longitude ?? NaN);
    if (!Number.isFinite(longitude)) continue;

    // Prefer the house already stored on the chart (it reflects whatever house
    // system the user actually generated with); fall back to whole-sign.
    const signIndex = Number(p.signIndex ?? Math.floor(norm360(longitude) / 30));
    const rasiHouse = Number.isFinite(Number(p.house))
      ? Number(p.house)
      : rasiHouseFor(signIndex, ascendantSignIndex);

    const chalitHouse = chalitHouseFor(longitude, ascendantLongitude);

    placements.push({
      planet: p.planet,
      rasiHouse,
      chalitHouse,
      moved: rasiHouse !== chalitHouse,
    });
  }

  return placements;
}
