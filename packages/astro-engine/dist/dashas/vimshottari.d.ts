import type { VimshottariDasha } from '@jyotish-ai/shared';
/**
 * Calculate the full Vimshottari Dasha tree for a given Moon longitude
 * and birth date.
 *
 * The starting Mahadasha lord is the nakshatra lord of the Moon's birth
 * nakshatra.  The **balance** of the first dasha is the remaining
 * (un-traversed) fraction of that nakshatra multiplied by the lord's
 * total dasha years.
 *
 * Five levels are computed for the currently active branch:
 * Mahadasha -> Antardasha -> Pratyantardasha -> Sookshma -> Prana.
 *
 * @param moonLongitude  Sidereal longitude of the Moon (0-360 degrees).
 * @param birthDate      Date/time of birth.
 * @returns              A `VimshottariDasha` object.
 */
export declare function calculateVimshottariDasha(moonLongitude: number, birthDate: Date): VimshottariDasha;
//# sourceMappingURL=vimshottari.d.ts.map