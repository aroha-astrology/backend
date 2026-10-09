// =============================================================================
// Transit (Gochar) Analysis Tools
// =============================================================================
// Provides sign constants, planetary dignity evaluation, special aspects,
// and double-transit detection for Vedic transit analysis.
// =============================================================================

import { signDignity } from '../astro-engine/rules/dignity.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DoubleTransitResult {
  /** House number from natal Moon where both Jupiter and Saturn aspect */
  house: number;
  /** Sign name of the house */
  sign: string;
  /** Whether Jupiter aspects this house (by rashi or special aspect) */
  jupiterAspects: boolean;
  /** Whether Saturn aspects this house (by rashi or special aspect) */
  saturnAspects: boolean;
}

export interface TransitDignity {
  /** The planet being evaluated */
  planet: string;
  /** The sign the planet is transiting */
  transitSign: string;
  /** Dignity category */
  dignity: 'exalted' | 'own' | 'friend' | 'neutral' | 'enemy' | 'debilitated';
  /** Quality score: 5 = exalted, 4 = own, 3 = friend, 2 = neutral, 1 = enemy, 0 = debilitated */
  qualityScore: number;
  /** Human-readable description */
  description: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** The 12 zodiac signs in order (index 0 = Aries). */
export const SIGNS: string[] = [
  'Aries',
  'Taurus',
  'Gemini',
  'Cancer',
  'Leo',
  'Virgo',
  'Libra',
  'Scorpio',
  'Sagittarius',
  'Capricorn',
  'Aquarius',
  'Pisces',
];

/**
 * Exaltation signs for each planet (0-based sign index).
 */
export const EXALTATION: Record<string, number> = {
  Sun: 0, // Aries
  Moon: 1, // Taurus
  Mars: 9, // Capricorn
  Mercury: 5, // Virgo
  Jupiter: 3, // Cancer
  Venus: 11, // Pisces
  Saturn: 6, // Libra
  Rahu: 1, // Taurus
  Ketu: 7, // Scorpio
};

/**
 * Debilitation signs for each planet (0-based sign index).
 */
export const DEBILITATION: Record<string, number> = {
  Sun: 6, // Libra
  Moon: 7, // Scorpio
  Mars: 3, // Cancer
  Mercury: 11, // Pisces
  Jupiter: 9, // Capricorn
  Venus: 5, // Virgo
  Saturn: 0, // Aries
  Rahu: 7, // Scorpio
  Ketu: 1, // Taurus
};

/**
 * Own signs for each planet (0-based sign indices).
 */
export const OWN_SIGNS: Record<string, number[]> = {
  Sun: [4], // Leo
  Moon: [3], // Cancer
  Mars: [0, 7], // Aries, Scorpio
  Mercury: [2, 5], // Gemini, Virgo
  Jupiter: [8, 11], // Sagittarius, Pisces
  Venus: [1, 6], // Taurus, Libra
  Saturn: [9, 10], // Capricorn, Aquarius
  Rahu: [10], // Aquarius
  Ketu: [7], // Scorpio
};

/**
 * Friendly and enemy signs for each planet (0-based sign indices), derived
 * from the one by-planet friendship table (rules/dignity.ts). These used to be
 * hand-written sign lists that contradicted that table for the Moon, Mars,
 * Mercury, Venus and Saturn (audit item TR1).
 */
const DIGNITY_PLANETS = [
  'Sun',
  'Moon',
  'Mars',
  'Mercury',
  'Jupiter',
  'Venus',
  'Saturn',
  'Rahu',
  'Ketu',
] as const;

function signsWith(wanted: 'friend' | 'enemy'): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const planet of DIGNITY_PLANETS) {
    out[planet] = Array.from({ length: 12 }, (_, i) => i).filter(
      (i) => signDignity(planet, i) === wanted,
    );
  }
  return out;
}

export const FRIENDS: Record<string, number[]> = signsWith('friend');
export const ENEMIES: Record<string, number[]> = signsWith('enemy');

/**
 * Special aspects (drishti) beyond the universal 7th-house aspect.
 * Jupiter additionally aspects the 5th and 9th houses.
 * Mars additionally aspects the 4th and 8th houses.
 * Saturn additionally aspects the 3rd and 10th houses.
 */
export const SPECIAL_ASPECTS: Record<string, number[]> = {
  Jupiter: [5, 7, 9],
  Mars: [4, 7, 8],
  Saturn: [3, 7, 10],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Get all houses a planet aspects from a given sign.
 * Every planet has 7th house aspect; Jupiter, Mars, Saturn have additional aspects.
 * Returns an array of sign indices (0-11) that the planet aspects.
 */
export function getAspectedSigns(planetName: string, signIndex: number): number[] {
  const aspectHouses = SPECIAL_ASPECTS[planetName] ?? [7];
  // Ensure 7th aspect is always included
  const houses = new Set(aspectHouses);
  houses.add(7);

  return Array.from(houses).map((house) => (signIndex + house - 1) % 12);
}

/**
 * Get the house number (1-12) from natal Moon sign.
 */
function houseFromMoon(signIndex: number, moonSignIndex: number): number {
  return ((signIndex - moonSignIndex + 12) % 12) + 1;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Detect the "double transit" of Jupiter and Saturn.
 * In Vedic astrology, events fructify when both Jupiter and Saturn
 * simultaneously aspect a house (by placement or special aspect).
 *
 * @param jupiterSign - 0-based sign index where Jupiter is transiting
 * @param saturnSign - 0-based sign index where Saturn is transiting
 * @param natalMoonSign - 0-based natal Moon sign index
 * @returns Array of DoubleTransitResult for houses aspected by both
 */
export function detectDoubleTransit(
  jupiterSign: number,
  saturnSign: number,
  natalMoonSign: number,
): DoubleTransitResult[] {
  // Get all signs Jupiter aspects (including its position)
  const jupiterAspectedSigns = new Set<number>([
    jupiterSign,
    ...getAspectedSigns('Jupiter', jupiterSign),
  ]);

  // Get all signs Saturn aspects (including its position)
  const saturnAspectedSigns = new Set<number>([
    saturnSign,
    ...getAspectedSigns('Saturn', saturnSign),
  ]);

  // Find intersection: signs aspected by BOTH Jupiter and Saturn
  const results: DoubleTransitResult[] = [];

  for (const sign of jupiterAspectedSigns) {
    if (saturnAspectedSigns.has(sign)) {
      results.push({
        house: houseFromMoon(sign, natalMoonSign),
        sign: SIGNS[sign] ?? 'Unknown',
        jupiterAspects: true,
        saturnAspects: true,
      });
    }
  }

  // Sort by house number
  results.sort((a, b) => a.house - b.house);

  return results;
}

/**
 * Evaluate the dignity/quality of a planet transiting a particular sign.
 *
 * @param planet - Planet name (e.g. "Jupiter")
 * @param transitSignIndex - 0-based sign index (0-11)
 * @returns TransitDignity with quality score and description
 */
export function dashaLordTransitQuality(planet: string, transitSignIndex: number): TransitDignity {
  const transitSign = SIGNS[transitSignIndex] ?? 'Unknown';

  // Check dignity in order of specificity
  if (EXALTATION[planet] === transitSignIndex) {
    return {
      planet,
      transitSign,
      dignity: 'exalted',
      qualityScore: 5,
      description: `${planet} is exalted in ${transitSign} - maximum strength and benefic results`,
    };
  }

  if (DEBILITATION[planet] === transitSignIndex) {
    return {
      planet,
      transitSign,
      dignity: 'debilitated',
      qualityScore: 0,
      description: `${planet} is debilitated in ${transitSign} - weakened, may give adverse results`,
    };
  }

  if (OWN_SIGNS[planet]?.includes(transitSignIndex)) {
    return {
      planet,
      transitSign,
      dignity: 'own',
      qualityScore: 4,
      description: `${planet} is in own sign ${transitSign} - strong and comfortable`,
    };
  }

  if (FRIENDS[planet]?.includes(transitSignIndex)) {
    return {
      planet,
      transitSign,
      dignity: 'friend',
      qualityScore: 3,
      description: `${planet} is in friendly sign ${transitSign} - good results expected`,
    };
  }

  if (ENEMIES[planet]?.includes(transitSignIndex)) {
    return {
      planet,
      transitSign,
      dignity: 'enemy',
      qualityScore: 1,
      description: `${planet} is in enemy sign ${transitSign} - diminished results`,
    };
  }

  // Default: neutral
  return {
    planet,
    transitSign,
    dignity: 'neutral',
    qualityScore: 2,
    description: `${planet} is in neutral sign ${transitSign} - moderate results`,
  };
}
