// =============================================================================
// Tara Bala (Star Strength) & Chandrabala (Moon Strength)
// =============================================================================
// Tara Bala: based on the count from natal nakshatra to transit nakshatra,
// reduced mod 9, yielding one of nine tara categories.
// Chandrabala: based on the house of transit Moon from natal Moon sign.
// Together these form the daily lunar assessment for muhurta & transit work.
// =============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TaraBalaResult {
  /** 1-based tara number (1-9) */
  taraNumber: number;
  /** Name of this tara */
  taraName: string;
  /** Which cycle (paryaya) the tara falls in: 1, 2, or 3 */
  paryaya: number;
  /** Name of the paryaya */
  paryayaName: string;
  /** Whether this tara is auspicious */
  isAuspicious: boolean;
  /** Whether this tara falls in the absolute discard list */
  isAbsoluteDiscard: boolean;
  /** Brief description */
  description: string;
}

export interface ChandrabalaResult {
  /** House of transit Moon from natal Moon (1-12) */
  house: number;
  /** Whether this house is favorable */
  isFavorable: boolean;
  /** Quality label */
  quality: 'good' | 'neutral' | 'bad';
  /** Brief description */
  description: string;
}

export interface DailyLunarAssessment {
  taraBala: TaraBalaResult;
  chandrabala: ChandrabalaResult;
  /** Combined verdict */
  overallFavorable: boolean;
  /** Combined quality */
  overallQuality: 'excellent' | 'good' | 'average' | 'poor';
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * The nine tara names in order (1-based index maps to taraNumber).
 */
export const TARA_NAMES: string[] = [
  'Janma',         // 1 - Birth star
  'Sampat',        // 2 - Wealth
  'Vipat',         // 3 - Danger
  'Kshema',        // 4 - Prosperity
  'Pratyari',      // 5 - Obstacle
  'Sadhaka',       // 6 - Achievement
  'Naidhana',      // 7 - Death/calamity
  'Mitra',         // 8 - Friend
  'Parama Mitra',  // 9 - Great Friend
];

/**
 * Auspiciousness of each tara (1-based index).
 * true = auspicious, false = inauspicious.
 */
export const TARA_AUSPICIOUS: Record<number, boolean> = {
  1: false,  // Janma - inauspicious
  2: true,   // Sampat - auspicious
  3: false,  // Vipat - inauspicious
  4: true,   // Kshema - auspicious
  5: false,  // Pratyari - inauspicious
  6: true,   // Sadhaka - auspicious
  7: false,  // Naidhana - inauspicious
  8: true,   // Mitra - auspicious
  9: true,   // Parama Mitra - auspicious
};

/**
 * The three paryaya (cycle) names.
 */
export const PARYAYA_NAMES: string[] = [
  'Janma Paryaya',     // 1st cycle (nakshatras 1-9)
  'Sampat Paryaya',    // 2nd cycle (nakshatras 10-18)
  'Vipat Paryaya',     // 3rd cycle (nakshatras 19-27)
];

/**
 * Absolute discard taras: these are always inauspicious regardless of paryaya.
 * Traditionally, Vipat (3), Pratyari (5), and Naidhana (7) in the 1st paryaya
 * are the strongest negatives.
 */
export const ABSOLUTE_DISCARDS: Set<number> = new Set([3, 5, 7]);

/**
 * Favorable houses for Chandrabala (transit Moon from natal Moon).
 * Houses 1, 3, 6, 7, 10, 11 are considered favorable.
 */
export const CHANDRABALA_FAVORABLE: Set<number> = new Set([1, 3, 6, 7, 10, 11]);

// ---------------------------------------------------------------------------
// Tara Bala Descriptions
// ---------------------------------------------------------------------------

const TARA_DESCRIPTIONS: Record<number, string> = {
  1: 'Janma Tara: birth star transit, generally unfavorable for new beginnings',
  2: 'Sampat Tara: wealth and prosperity, favorable for financial activities',
  3: 'Vipat Tara: danger and obstacles, avoid important undertakings',
  4: 'Kshema Tara: well-being and comfort, favorable for health matters',
  5: 'Pratyari Tara: enmity and opposition, unfavorable for partnerships',
  6: 'Sadhaka Tara: achievement and success, favorable for accomplishments',
  7: 'Naidhana Tara: calamity and loss, most inauspicious - avoid risks',
  8: 'Mitra Tara: friendship and harmony, favorable for relationships',
  9: 'Parama Mitra Tara: great friendship, highly favorable for all activities',
};

// ---------------------------------------------------------------------------
// Core Functions
// ---------------------------------------------------------------------------

/**
 * Calculate Tara Bala from natal and transit nakshatra indices.
 *
 * @param natalNakshatraIndex - 0-based index of the natal Moon's nakshatra (0-26)
 * @param transitNakshatraIndex - 0-based index of the transit Moon's nakshatra (0-26)
 * @returns TaraBalaResult
 */
export function calculateTaraBala(
  natalNakshatraIndex: number,
  transitNakshatraIndex: number
): TaraBalaResult {
  // Count from natal to transit nakshatra (inclusive of transit, exclusive of natal)
  // Formula: ((transit - natal + 27) % 27) + 1, then reduce mod 9
  const count = ((transitNakshatraIndex - natalNakshatraIndex + 27) % 27) + 1;

  // Tara number: reduce to 1-9
  let taraNumber = count % 9;
  if (taraNumber === 0) taraNumber = 9;

  // Paryaya (cycle): which group of 9 we are in
  const paryaya = Math.ceil(count / 9);

  const taraName = TARA_NAMES[taraNumber - 1] ?? 'Unknown';
  const paryayaName = PARYAYA_NAMES[Math.min(paryaya - 1, 2)] ?? 'Unknown Paryaya';
  const isAuspicious = TARA_AUSPICIOUS[taraNumber] ?? false;
  const isAbsoluteDiscard = ABSOLUTE_DISCARDS.has(taraNumber) && paryaya === 1;
  const description = TARA_DESCRIPTIONS[taraNumber] ?? '';

  return {
    taraNumber,
    taraName,
    paryaya,
    paryayaName,
    isAuspicious,
    isAbsoluteDiscard,
    description,
  };
}

/**
 * Calculate Chandrabala from natal and transit Moon sign indices.
 *
 * @param natalMoonSign - 0-based natal Moon sign index (0-11)
 * @param transitMoonSign - 0-based transit Moon sign index (0-11)
 * @returns ChandrabalaResult
 */
export function calculateChandrabala(
  natalMoonSign: number,
  transitMoonSign: number
): ChandrabalaResult {
  const house = ((transitMoonSign - natalMoonSign + 12) % 12) + 1;
  const isFavorable = CHANDRABALA_FAVORABLE.has(house);

  let quality: 'good' | 'neutral' | 'bad';
  let description: string;

  if (isFavorable) {
    quality = 'good';
    description = `Moon in house ${house} from natal Moon: favorable for activities`;
  } else if (house === 8) {
    quality = 'bad';
    description = `Moon in house ${house} from natal Moon: 8th house transit, unfavorable`;
  } else {
    quality = 'neutral';
    description = `Moon in house ${house} from natal Moon: mixed results`;
  }

  return { house, isFavorable, quality, description };
}

/**
 * Combined daily lunar assessment using both Tara Bala and Chandrabala.
 *
 * @param natalNakshatraIndex - 0-based natal Moon nakshatra index (0-26)
 * @param natalMoonSign - 0-based natal Moon sign index (0-11)
 * @param transitNakshatraIndex - 0-based transit Moon nakshatra index (0-26)
 * @param transitMoonSign - 0-based transit Moon sign index (0-11)
 * @returns DailyLunarAssessment
 */
export function dailyLunarAssessment(
  natalNakshatraIndex: number,
  natalMoonSign: number,
  transitNakshatraIndex: number,
  transitMoonSign: number
): DailyLunarAssessment {
  const taraBala = calculateTaraBala(natalNakshatraIndex, transitNakshatraIndex);
  const chandrabala = calculateChandrabala(natalMoonSign, transitMoonSign);

  // Combined verdict
  const taraGood = taraBala.isAuspicious;
  const chandraGood = chandrabala.isFavorable;

  let overallFavorable: boolean;
  let overallQuality: 'excellent' | 'good' | 'average' | 'poor';

  if (taraGood && chandraGood) {
    overallFavorable = true;
    overallQuality = 'excellent';
  } else if (taraGood || chandraGood) {
    overallFavorable = true;
    overallQuality = 'good';
  } else if (taraBala.isAbsoluteDiscard || chandrabala.quality === 'bad') {
    overallFavorable = false;
    overallQuality = 'poor';
  } else {
    overallFavorable = false;
    overallQuality = 'average';
  }

  return {
    taraBala,
    chandrabala,
    overallFavorable,
    overallQuality,
  };
}
