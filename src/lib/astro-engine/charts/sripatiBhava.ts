// =============================================================================
// Sripati Bhava Chalit — the unequal bhavas
// =============================================================================
// Sripati takes the Porphyry cusps (the Ascendant to the Midheaven, and the
// Midheaven to the descendant, each cut in three) as the MIDDLE of each bhava
// (bhava madhya). A bhava then runs from the midpoint between its madhya and the
// previous madhya to the midpoint between its madhya and the next one.
//
// swisseph system 'S' returns exactly those boundaries (the bhava starts, sidereal
// when asked), so `calculateSripatiCusps` stores them as is and the house a
// longitude falls in is a plain interval search. Checked against the real
// ephemeris: every S cusp is the midpoint of two neighbouring Porphyry cusps.
//
// Above the polar circle the Ascendant-Midheaven arcs collapse (a 69.6N chart gave
// bhavas of 5 and 55 degrees), so `sripatiCuspsUsable` rejects those and the
// callers fall back to the equal bhava.
// =============================================================================

function norm360(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** Narrowest and widest bhava (degrees) still treated as a sane Sripati set. */
const MIN_SPAN = 12;
const MAX_SPAN = 48;

/** 12 finite longitudes whose bhava widths are all plausible. */
export function sripatiCuspsUsable(cusps: readonly number[] | undefined | null): boolean {
  if (!cusps || cusps.length !== 12) return false;
  if (!cusps.every((c) => Number.isFinite(c))) return false;
  let total = 0;
  for (let i = 0; i < 12; i++) {
    const span = norm360(cusps[(i + 1) % 12]! - cusps[i]!);
    if (span < MIN_SPAN || span > MAX_SPAN) return false;
    total += span;
  }
  // Going once round the circle: the 12 spans must add up to 360.
  return Math.abs(total - 360) < 1e-6;
}

/**
 * The bhava (1-12) a longitude falls in. `cusps[i]` is the start of bhava i + 1;
 * a cusp longitude belongs to the bhava that starts on it.
 */
export function sripatiHouseFor(longitude: number, cusps: readonly number[]): number {
  const lon = norm360(longitude);
  for (let i = 0; i < 12; i++) {
    const start = norm360(cusps[i]!);
    const span = norm360(cusps[(i + 1) % 12]! - cusps[i]!);
    if (norm360(lon - start) < span) return i + 1;
  }
  return 1;
}
