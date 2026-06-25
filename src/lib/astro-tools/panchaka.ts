// =============================================================================
// Panchaka (Five-fold Danger) Calculation
// =============================================================================
// Panchaka is computed from the sum of tithi, vara (weekday), nakshatra, and
// lagna indices, reduced modulo 9. Certain remainders indicate specific
// dangers traditionally used for muhurta (election) screening.
// =============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PanchakaResult {
  /** The raw sum of the four indices */
  rawSum: number;
  /** The remainder after mod 9 */
  remainder: number;
  /** Whether this panchaka is dangerous */
  isDangerous: boolean;
  /** Name of the panchaka, if applicable */
  name: string | null;
  /** What kind of danger it represents */
  danger: string | null;
  /** What activities are safe */
  safe: string | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Panchaka results keyed by remainder (mod 9).
 * Only certain remainders are considered dangerous; the rest are safe.
 *
 * The five dangerous panchakas correspond to remainders 1, 2, 4, 6, 8:
 * 1 = Mrityu Panchaka (death)
 * 2 = Agni Panchaka (fire)
 * 4 = Raja Panchaka (royal/governmental trouble)
 * 6 = Chora Panchaka (theft)
 * 8 = Roga Panchaka (disease)
 */
export const PANCHAKA_RESULTS: Record<number, { name: string; danger: string; safe: string }> = {
  1: {
    name: 'Mrityu Panchaka',
    danger: 'Risk of death or severe harm; avoid travel and risky ventures',
    safe: 'Spiritual practices, meditation, and charitable activities',
  },
  2: {
    name: 'Agni Panchaka',
    danger: 'Risk of fire-related accidents; avoid fire ceremonies and cooking rituals',
    safe: 'Water-related activities, cooling practices',
  },
  4: {
    name: 'Raja Panchaka',
    danger: 'Risk of governmental or authority-related trouble; avoid legal matters',
    safe: 'Domestic activities, personal matters away from authority',
  },
  6: {
    name: 'Chora Panchaka',
    danger: 'Risk of theft or loss of property; avoid financial transactions',
    safe: 'Guarding possessions, security measures, staying home',
  },
  8: {
    name: 'Roga Panchaka',
    danger: 'Risk of disease or health issues; avoid starting medical treatments',
    safe: 'Preventive health measures, rest, and recuperation',
  },
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute the Panchaka for a given combination of tithi, vara, nakshatra, and lagna.
 *
 * All indices are 1-based in the traditional system:
 * - tithiIndex: 1-30 (1 = Shukla Pratipada, 30 = Amavasya)
 * - varaIndex: 1-7 (1 = Sunday, 7 = Saturday)
 * - nakshatraIndex: 1-27 (1 = Ashwini, 27 = Revati)
 * - lagnaIndex: 1-12 (1 = Aries, 12 = Pisces)
 *
 * Panchaka sum = tithi + vara + nakshatra + lagna
 * Remainder = sum % 9
 *
 * @param tithiIndex - 1-based tithi number (1-30)
 * @param varaIndex - 1-based weekday number (1-7, Sunday=1)
 * @param nakshatraIndex - 1-based nakshatra number (1-27)
 * @param lagnaIndex - 1-based lagna/sign number (1-12)
 * @returns PanchakaResult
 */
export function computePanchaka(
  tithiIndex: number,
  varaIndex: number,
  nakshatraIndex: number,
  lagnaIndex: number
): PanchakaResult {
  const rawSum = tithiIndex + varaIndex + nakshatraIndex + lagnaIndex;
  const remainder = rawSum % 9;

  const dangerInfo = PANCHAKA_RESULTS[remainder];
  const isDangerous = dangerInfo !== undefined;

  return {
    rawSum,
    remainder,
    isDangerous,
    name: dangerInfo?.name ?? null,
    danger: dangerInfo?.danger ?? null,
    safe: dangerInfo?.safe ?? null,
  };
}
