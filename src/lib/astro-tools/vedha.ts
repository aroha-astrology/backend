// =============================================================================
// Vedha (Obstruction) Analysis for Gochar (Transit) Predictions
// =============================================================================
// When a planet transits an auspicious house from the natal Moon, another planet
// transiting the corresponding vedha point can obstruct (block) the good result.
// Exception: Sun/Saturn and Moon/Mercury pairs do not obstruct each other.
// =============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VedhaObstruction {
  /** The planet causing the obstruction */
  obstructingPlanet: string;
  /** House number (1-12 from Moon) of the obstructing planet */
  obstructingHouse: number;
  /** Sign index (0-11) of the obstructing planet */
  obstructingSign: number;
}

export interface VedhaResult {
  /** The transiting planet being checked */
  planet: string;
  /** House number (1-12 from Moon) of the transiting planet */
  transitHouse: number;
  /** Whether the transit house is auspicious for this planet */
  isAuspiciousHouse: boolean;
  /** Whether the auspicious result is obstructed by vedha */
  isObstructed: boolean;
  /** Details of obstructions, if any */
  obstructions: VedhaObstruction[];
  /** Net result: auspicious transit that is NOT obstructed */
  netBenefic: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Auspicious houses (from natal Moon) for each planet during transit.
 * These are the houses where the planet gives good results.
 */
export const AUSPICIOUS_HOUSES: Record<string, number[]> = {
  Sun:     [3, 6, 10, 11],
  Moon:    [1, 3, 6, 7, 10, 11],
  Mars:    [3, 6, 11],
  Mercury: [2, 4, 6, 8, 10, 11],
  Jupiter: [2, 5, 7, 9, 11],
  Venus:   [1, 2, 3, 4, 5, 8, 9, 11, 12],
  Saturn:  [3, 6, 11],
  Rahu:    [3, 6, 11],
  Ketu:    [3, 6, 11],
};

/**
 * Vedha pairs for each planet. Key = auspicious house, value = vedha point.
 * A planet at the vedha point obstructs the benefit from the auspicious house.
 */
export const VEDHA_PAIRS: Record<string, Record<number, number>> = {
  Sun:     { 3: 9, 6: 12, 10: 4, 11: 5 },
  Moon:    { 1: 5, 3: 9, 6: 12, 7: 2, 10: 4, 11: 8 },
  Mars:    { 3: 12, 6: 9, 11: 5 },
  Mercury: { 2: 5, 4: 3, 6: 9, 8: 1, 10: 8, 11: 12 },
  Jupiter: { 2: 12, 5: 4, 7: 3, 9: 10, 11: 8 },
  Venus:   { 1: 8, 2: 7, 3: 1, 4: 10, 5: 9, 8: 5, 9: 11, 11: 6, 12: 3 },
  Saturn:  { 3: 12, 6: 9, 11: 5 },
  Rahu:    { 3: 12, 6: 9, 11: 5 },
  Ketu:    { 3: 12, 6: 9, 11: 5 },
};

/**
 * Exception pairs: these planet combinations do NOT obstruct each other.
 * Sun/Saturn and Moon/Mercury are mutually exempt from vedha.
 */
const EXCEPTION_PAIRS: Array<[string, string]> = [
  ['Sun', 'Saturn'],
  ['Moon', 'Mercury'],
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Compute the house number (1-12) of a planet from the natal Moon sign.
 * Both arguments are 0-based sign indices (0 = Aries, 11 = Pisces).
 */
function houseFromMoon(planetSignIndex: number, moonSignIndex: number): number {
  return ((planetSignIndex - moonSignIndex + 12) % 12) + 1;
}

/**
 * Check whether two planets form an exception pair (exempt from vedha).
 */
function isExceptionPair(planet1: string, planet2: string): boolean {
  return EXCEPTION_PAIRS.some(
    ([a, b]) => (a === planet1 && b === planet2) || (a === planet2 && b === planet1)
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check vedha for a single transiting planet.
 *
 * @param transitingPlanet - Name of the planet being checked (e.g. "Jupiter")
 * @param transitSigns - Record mapping planet names to their current transit
 *   sign indices (0-11). Must include all planets for cross-checking.
 * @param natalMoonSign - Natal Moon sign index (0-11)
 * @returns VedhaResult with obstruction details
 */
export function checkVedha(
  transitingPlanet: string,
  transitSigns: Record<string, number>,
  natalMoonSign: number
): VedhaResult {
  const planetSign = transitSigns[transitingPlanet];
  if (planetSign === undefined) {
    return {
      planet: transitingPlanet,
      transitHouse: 0,
      isAuspiciousHouse: false,
      isObstructed: false,
      obstructions: [],
      netBenefic: false,
    };
  }

  const transitHouse = houseFromMoon(planetSign, natalMoonSign);
  const auspicious = AUSPICIOUS_HOUSES[transitingPlanet] ?? [];
  const isAuspiciousHouse = auspicious.includes(transitHouse);

  const obstructions: VedhaObstruction[] = [];

  if (isAuspiciousHouse) {
    const vedhaPairs = VEDHA_PAIRS[transitingPlanet] ?? {};
    const vedhaHouse = vedhaPairs[transitHouse];

    if (vedhaHouse !== undefined) {
      // Check if any OTHER planet sits in the vedha house
      for (const [otherPlanet, otherSign] of Object.entries(transitSigns)) {
        if (otherPlanet === transitingPlanet) continue;

        const otherHouse = houseFromMoon(otherSign, natalMoonSign);
        if (otherHouse === vedhaHouse) {
          // Check exception pairs
          if (!isExceptionPair(transitingPlanet, otherPlanet)) {
            obstructions.push({
              obstructingPlanet: otherPlanet,
              obstructingHouse: otherHouse,
              obstructingSign: otherSign,
            });
          }
        }
      }
    }
  }

  const isObstructed = obstructions.length > 0;

  return {
    planet: transitingPlanet,
    transitHouse,
    isAuspiciousHouse,
    isObstructed,
    obstructions,
    netBenefic: isAuspiciousHouse && !isObstructed,
  };
}

/**
 * Check vedha for all planets at once.
 *
 * @param transitSigns - Record mapping planet names to their current transit
 *   sign indices (0-11)
 * @param natalMoonSign - Natal Moon sign index (0-11)
 * @returns Array of VedhaResult, one per planet in transitSigns
 */
export function checkAllVedha(
  transitSigns: Record<string, number>,
  natalMoonSign: number
): VedhaResult[] {
  return Object.keys(transitSigns).map((planet) =>
    checkVedha(planet, transitSigns, natalMoonSign)
  );
}
