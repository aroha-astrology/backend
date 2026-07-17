// @ts-nocheck
// =============================================================================
// @aroha-astrology/astro-engine - Vedic Astrology Calculation Engine
// =============================================================================

// Planet Position Calculations
export {
  dateToJulianDay,
  calculatePlanetPositions,
  calculateHouses,
  calculateAscendant,
  calculateChart,
} from './calculations/planetPositions';

// Shadbala (Six-fold Strength)
export { calculateShadbala } from './calculations/shadbala';

// Ashtakavarga System
export {
  calculateBhinnaAshtakavarga,
  calculateSarvaAshtakavarga,
  calculateAshtakavarga,
  getBindusForPlanetInSign,
  evaluateSignStrength,
} from './calculations/ashtakavarga';

// Dasha Systems
export * from './dashas/index';
export * from './dasha-confidence.js';
export * from './lucky-elements.js';

// Dosha Analysis
export * from './doshas/index';

// Divisional Charts
export * from './charts/divisionalCharts';

// Yoga Detection
export { detectAllYogas } from './yogas/index';

// Matching Systems
export { calculateAshtakoota } from './matching/ashtakoota';
export { calculateDashakoota } from './matching/dashakoota';

// Panchang
export * from './panchang/index';

// Muhurta
export { findBestMuhurta } from './muhurta/index';

// Numerology
export {
  calculateLifePath,
  calculateExpression,
  calculateSoulUrge,
  calculatePersonality,
  calculateLuckyNumbers,
  analyzeNameNumerology,
  calculateFullNumerology,
} from './numerology/index';

// Vedic Numerology
export {
  reduceToSingleDigit,
  calculateMulank,
  calculateBhagyank,
  calculateKuaNumber,
  calculateLoShuGrid,
  calculateChallengeNumbers,
  calculatePersonalYear,
  calculatePersonalMonth,
  generateMonthlyForecast,
  getZodiacSign,
  getNamePlanes,
  getKuaData,
} from './numerology/vedic';
export type {
  LoShuGrid,
  ChallengeNumbers,
  ZodiacInfo,
  NamePlanes,
  KuaData,
} from './numerology/vedic';

// Name Correction
export {
  computeNameAlignment,
  variantHitsTarget,
  generateDeterministicVariants,
} from './numerology/nameCorrection';
export type { NameAlignment, NameAlignmentResult } from './numerology/nameCorrection';

// Mobile Number Numerology
export { analyzeMobileNumber } from './numerology/mobileNumber';
export type { MobileVerdict, MobileNumberAnalysis } from './numerology/mobileNumber';

// Lal Kitab
export * from './lalkitab/chart';
export * from './lalkitab/pakkaghar';
export * from './lalkitab/blindPlanets';
export * from './lalkitab/debts';
export { getLalKitabRemedies } from './lalkitab/remedies';
