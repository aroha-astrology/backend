import type { YoginiDasha } from '@jyotish-ai/shared';
/**
 * Calculate the Yogini Dasha system.
 *
 * The Yogini Dasha is a 36-year cycle with 8 yoginis:
 *   Mangala(1/Moon), Pingala(2/Sun), Dhanya(3/Jupiter), Bhramari(4/Mars),
 *   Bhadrika(5/Mercury), Ulka(6/Saturn), Siddha(7/Venus), Sankata(8/Rahu)
 *
 * The starting yogini is determined by (nakshatraIndex + 3) % 8.
 * The balance of the first dasha is based on the remaining fraction of
 * the birth nakshatra, identical in concept to Vimshottari.
 *
 * Two levels are computed: Mahadasha and Antardasha.
 *
 * @param moonLongitude  Sidereal Moon longitude (0-360).
 * @param birthDate      Date/time of birth.
 * @returns              A `YoginiDasha` object.
 */
export declare function calculateYoginiDasha(moonLongitude: number, birthDate: Date): YoginiDasha;
//# sourceMappingURL=yogini.d.ts.map