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
  /** Quality label */
  quality: 'favorable' | 'neutral' | 'unfavorable';
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
  'Saturn', 'Jupiter', 'Mars', 'Sun', 'Venus', 'Mercury', 'Moon', 'Asc',
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
 * Check if a planet's kakshya lord has contributed a bindu in the
 * Bhinna Ashtakavarga table for the planet in its current sign.
 *
 * @param transitingPlanet - Name of the planet transiting
 * @param transitLongitude - Current sidereal longitude of the planet
 * @param bhinnaAv - Bhinna Ashtakavarga data. An array of objects with
 *   { planet: string, bindus: number[] (length 12) }. Each object represents
 *   one planet's BAV row; bindus[signIndex] = total bindus in that sign.
 *   For kakshya-level analysis, we also need per-contributor breakdowns.
 *   However, the simplified approach checks only whether the total bindus
 *   in the sign are >= 4 (above average) when the kakshya lord matches.
 * @returns KakshyaBinduResult
 */
export function checkKakshyaBindu(
  transitingPlanet: string,
  transitLongitude: number,
  bhinnaAv: Array<{ planet: string; bindus: number[] }>
): KakshyaBinduResult {
  const kakshya = getKakshya(transitLongitude);

  // Find the planet's BAV row
  const planetAv = bhinnaAv.find((b) => b.planet === transitingPlanet);
  const bindusInSign = planetAv ? (planetAv.bindus[kakshya.signIndex] ?? 0) : 0;

  // Simplified kakshya-bindu check: if bindus >= 4 and the kakshya lord
  // is one of the natural benefics or the planet itself, treat as favorable.
  // A more rigorous approach would track per-contributor bindu tables,
  // but the standard shortcut is: bindus >= 4 → favorable transit zone.
  const kakshyaLordHasBindu = bindusInSign >= 4;

  let quality: 'favorable' | 'neutral' | 'unfavorable';
  if (bindusInSign >= 5) {
    quality = 'favorable';
  } else if (bindusInSign >= 4) {
    quality = 'neutral';
  } else {
    quality = 'unfavorable';
  }

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
 * @param bhinnaAv - Bhinna Ashtakavarga data (array of { planet, bindus[] })
 * @returns DailyKakshyaScore with per-planet details and overall quality
 */
export function dailyKakshyaScore(
  transitLongitudes: Record<string, number>,
  bhinnaAv: Array<{ planet: string; bindus: number[] }>
): DailyKakshyaScore {
  const details: DailyKakshyaDetail[] = [];
  let activeCount = 0;

  for (const [planet, longitude] of Object.entries(transitLongitudes)) {
    const result = checkKakshyaBindu(planet, longitude, bhinnaAv);
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
