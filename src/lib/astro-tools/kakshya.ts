// =============================================================================
// Kakshya (Sub-division) & Ashtakavarga Bindu Transit Analysis
// =============================================================================
// Each sign (30 degrees) is divided into 8 kakshyas of 3.75 degrees each,
// ruled by Saturn, Jupiter, Mars, Sun, Venus, Mercury, Moon, Ascendant
// (in that fixed order). When a planet transits a kakshya whose lord has
// contributed a bindu in Bhinna Ashtakavarga, the transit is favorable.
// =============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface KakshyaInfo {
  /** 0-based kakshya index within the sign (0-7) */
  kakshyaIndex: number;
  /** Lord of this kakshya */
  kakshyaLord: string;
  /** Degree position within the sign (0-30) */
  degreeInSign: number;
  /** 0-based sign index (0-11) */
  signIndex: number;
}

export interface KakshyaBinduResult {
  /** The transiting planet */
  planet: string;
  /** Kakshya information at the transit longitude */
  kakshya: KakshyaInfo;
  /** Number of bindus the planet has in this sign (from Bhinna AV) */
  bindusInSign: number;
  /** Whether the kakshya lord contributed a bindu (favorable sub-transit) */
  kakshyaLordHasBindu: boolean;
  /** Quality label — binary: the compartment lord either gave a bindu or didn't. */
  quality: 'favorable' | 'unfavorable';
}

export interface DailyKakshyaDetail {
  planet: string;
  kakshya: KakshyaInfo;
  binduActive: boolean;
}

export interface DailyKakshyaScore {
  /** Count of planets whose kakshya lord has a bindu */
  activeBindus: number;
  /** Overall quality: 'good' if majority active, 'poor' otherwise */
  quality: 'good' | 'average' | 'poor';
  /** Per-planet details */
  details: DailyKakshyaDetail[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * The 8 kakshya lords in fixed order within every sign.
 * Kakshya 0 (0-3.75 deg) = Saturn, Kakshya 1 (3.75-7.5 deg) = Jupiter, etc.
 */
export const KAKSHYA_LORDS: string[] = [
  'Saturn',
  'Jupiter',
  'Mars',
  'Sun',
  'Venus',
  'Mercury',
  'Moon',
  'Asc',
];

/** Each kakshya spans 3.75 degrees (30 / 8). */
export const KAKSHYA_SPAN = 3.75;

// ---------------------------------------------------------------------------
// Core Functions
// ---------------------------------------------------------------------------

/**
 * Determine which kakshya a given longitude falls in.
 *
 * @param longitude - Sidereal longitude (0-360)
 * @returns KakshyaInfo with sign index, degree in sign, kakshya index, and lord
 */
export function getKakshya(longitude: number): KakshyaInfo {
  // Normalize longitude to 0-360
  let normLong = longitude % 360;
  if (normLong < 0) normLong += 360;

  const signIndex = Math.floor(normLong / 30);
  const degreeInSign = normLong - signIndex * 30;
  const kakshyaIndex = Math.min(Math.floor(degreeInSign / KAKSHYA_SPAN), 7);
  const kakshyaLord = KAKSHYA_LORDS[kakshyaIndex];

  return { kakshyaIndex, kakshyaLord: kakshyaLord ?? 'Asc', degreeInSign, signIndex };
}

/**
 * Per-contributor Bhinnashtakavarga attribution — see
 * astro-engine/calculations/ashtakavarga.ts's calculateBhinnaAshtakavargaDetailed,
 * which produces this shape. contributions[contributorName][signIndex] is 1
 * if that contributor gave a bindu to `planet` in that sign, else 0.
 */
export interface DetailedBhinnaAshtakavarga {
  planet: string;
  contributions: Record<string, number[]>;
}

/**
 * Check whether a planet's CURRENT kakshya (3°45' compartment) lord actually
 * contributed a bindu to that planet in the sign it's transiting — the real
 * classical rule, not a shortcut. A transiting planet doesn't benefit from a
 * sign's whole bindu total the instant it enters the sign; it first crosses
 * Saturn's kakshya, then Jupiter's, and so on, and only gets a favorable
 * sub-window while it sits in a compartment whose lord specifically gave it
 * a bindu there. This is why the result changes as the planet moves through
 * the sign, several times over the sign's 30 degrees — unlike a whole-sign
 * total, which is constant for as long as the planet stays in that sign.
 *
 * @param transitingPlanet - Name of the planet transiting
 * @param transitLongitude - Current sidereal longitude of the planet
 * @param detailedBav - Per-contributor Bhinnashtakavarga detail (see
 *   calculateBhinnaAshtakavargaDetailed), NOT the collapsed per-sign totals.
 * @returns KakshyaBinduResult
 */
export function checkKakshyaBindu(
  transitingPlanet: string,
  transitLongitude: number,
  detailedBav: DetailedBhinnaAshtakavarga[],
): KakshyaBinduResult {
  const kakshya = getKakshya(transitLongitude);

  const planetAv = detailedBav.find((b) => b.planet === transitingPlanet);
  const contributions = planetAv?.contributions;

  // Whole-sign total, kept for context/display — no longer what decides
  // favorability, but still useful to report alongside the compartment verdict.
  let bindusInSign = 0;
  if (contributions) {
    for (const contributorBindus of Object.values(contributions)) {
      bindusInSign += contributorBindus[kakshya.signIndex] ?? 0;
    }
  }

  // The actual rule: does THIS kakshya's specific lord contribute a bindu to
  // this planet in this sign? Independent of the sign's total bindu count.
  const kakshyaLordHasBindu =
    (contributions?.[kakshya.kakshyaLord]?.[kakshya.signIndex] ?? 0) === 1;

  const quality: 'favorable' | 'unfavorable' = kakshyaLordHasBindu ? 'favorable' : 'unfavorable';

  return {
    planet: transitingPlanet,
    kakshya,
    bindusInSign,
    kakshyaLordHasBindu,
    quality,
  };
}

/**
 * Compute an aggregate daily kakshya score across multiple transiting planets.
 *
 * @param transitLongitudes - Record mapping planet names to their sidereal longitudes
 * @param detailedBav - Per-contributor Bhinnashtakavarga detail (see
 *   calculateBhinnaAshtakavargaDetailed), NOT the collapsed per-sign totals.
 * @returns DailyKakshyaScore with per-planet details and overall quality
 */
export function dailyKakshyaScore(
  transitLongitudes: Record<string, number>,
  detailedBav: DetailedBhinnaAshtakavarga[],
): DailyKakshyaScore {
  const details: DailyKakshyaDetail[] = [];
  let activeCount = 0;

  for (const [planet, longitude] of Object.entries(transitLongitudes)) {
    const result = checkKakshyaBindu(planet, longitude, detailedBav);
    const binduActive = result.kakshyaLordHasBindu;
    if (binduActive) activeCount++;

    details.push({
      planet,
      kakshya: result.kakshya,
      binduActive,
    });
  }

  const total = details.length;
  let quality: 'good' | 'average' | 'poor';
  if (total === 0) {
    quality = 'average';
  } else if (activeCount / total >= 0.6) {
    quality = 'good';
  } else if (activeCount / total >= 0.4) {
    quality = 'average';
  } else {
    quality = 'poor';
  }

  return {
    activeBindus: activeCount,
    quality,
    details,
  };
}
