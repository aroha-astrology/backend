// @ts-nocheck
// =============================================================================
// Vedic Numerology Module
// =============================================================================
// Implements Indian numerology: Mulank, Bhagyank, Kua Number, Lo Shu Grid,
// Challenge Numbers, Personal Year/Month forecasting, Zodiac mapping,
// and Name Plane analysis.

// =============================================================================
// Types
// =============================================================================

export interface LoShuGrid {
  /** How many times each digit (1–9) appears in the DOB */
  frequencies: Record<number, number>;
  /** Digits (1–9) that are absent from the DOB */
  missing: number[];
  /** The 3×3 grid template with digit counts for rendering */
  cells: number[][];
}

export interface ChallengeNumbers {
  first: number;
  second: number;
  main: number;
  fourth: number;
  phases: [
    { phase: 1; ageRange: '0-29'; challenge: number },
    { phase: 2; ageRange: '30-38'; challenge: number },
    { phase: 3; ageRange: '39-47'; challenge: number },
    { phase: 4; ageRange: '48+'; challenge: number },
  ];
}

export interface ZodiacInfo {
  sign: string;
  rulingPlanet: string;
  element: string;
  quality: string;
}

export interface NamePlanes {
  knowledge: number;   // B, H, J, P, Y
  strength: number;    // D, M, T
  emotional: number;   // A, C, F, I, L, O, S
  spiritual: number;   // E, G, K, N, Q, R, U, V, W, X, Z
  letters: {
    knowledge: string[];
    strength: string[];
    emotional: string[];
    spiritual: string[];
  };
}

export interface KuaData {
  kuaNumber: number;
  element: string;
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Reduce a number to a single digit (1–9), no master number preservation.
 */
export function reduceToSingleDigit(n: number): number {
  n = Math.abs(n);
  while (n > 9) {
    let sum = 0;
    let temp = n;
    while (temp > 0) {
      sum += temp % 10;
      temp = Math.floor(temp / 10);
    }
    n = sum;
  }
  return n === 0 ? 0 : n;
}

function sumDigits(n: number): number {
  let sum = 0;
  n = Math.abs(n);
  while (n > 0) {
    sum += n % 10;
    n = Math.floor(n / 10);
  }
  return sum;
}

// =============================================================================
// Core Number Calculations
// =============================================================================

/**
 * Mulank (Psychic Number): derived from the day of birth, reduced to 1–9.
 * E.g., born on the 29th → 2+9=11 → 1+1=2
 */
export function calculateMulank(dob: Date): number {
  const day = dob.getUTCDate();
  return reduceToSingleDigit(day);
}

/**
 * Bhagyank (Destiny Number): sum ALL digits of the full DOB (DD+MM+YYYY),
 * reduced to 1–9.
 * E.g., 15/08/1987 → 1+5+0+8+1+9+8+7=39 → 3+9=12 → 1+2=3
 */
export function calculateBhagyank(dob: Date): number {
  const day = dob.getUTCDate();
  const month = dob.getUTCMonth() + 1;
  const year = dob.getUTCFullYear();

  const total =
    sumDigits(day) +
    sumDigits(month) +
    sumDigits(year);

  return reduceToSingleDigit(total);
}

/**
 * Kua Number (Feng Shui / Ba Gua):
 * Male:   reduce(sum of birth year digits) → 11 - result; if 5 → use 2
 * Female: reduce(sum of birth year digits) → result + 4; if 5 → use 8; if >9 → reduce again
 */
export function calculateKuaNumber(birthYear: number, gender: 'male' | 'female'): number {
  const yearReduced = reduceToSingleDigit(sumDigits(birthYear));

  if (gender === 'male') {
    let kua = 11 - yearReduced;
    if (kua > 9) kua = reduceToSingleDigit(kua);
    if (kua === 5) kua = 2;
    return kua;
  } else {
    let kua = yearReduced + 4;
    if (kua > 9) kua = reduceToSingleDigit(kua);
    if (kua === 5) kua = 8;
    return kua;
  }
}

// =============================================================================
// Lo Shu Grid
// =============================================================================

/**
 * Lo Shu Grid magic square layout (3×3). The position of each number:
 *   4 | 9 | 2
 *   ---------
 *   3 | 5 | 7
 *   ---------
 *   8 | 1 | 6
 *
 * Returns grid cells as a 3x3 matrix where each cell holds the count of
 * occurrences of that cell's number in the DOB.
 */
export function calculateLoShuGrid(dob: Date): LoShuGrid {
  const GRID_TEMPLATE = [
    [4, 9, 2],
    [3, 5, 7],
    [8, 1, 6],
  ];

  const day = dob.getUTCDate();
  const month = dob.getUTCMonth() + 1;
  const year = dob.getUTCFullYear();

  // Extract all digits from DD, MM, YYYY
  const dateStr =
    String(day).padStart(2, '0') +
    String(month).padStart(2, '0') +
    String(year);

  const frequencies: Record<number, number> = {
    1: 0, 2: 0, 3: 0, 4: 0, 5: 0,
    6: 0, 7: 0, 8: 0, 9: 0,
  };

  for (const ch of dateStr) {
    const digit = parseInt(ch, 10);
    if (digit >= 1 && digit <= 9) {
      frequencies[digit]++;
    }
  }

  const missing = (Object.keys(frequencies) as unknown as number[])
    .map(Number)
    .filter((d) => frequencies[d] === 0);

  // Build cells matrix with counts
  const cells = GRID_TEMPLATE.map((row) =>
    row.map((num) => frequencies[num]),
  );

  return { frequencies, missing, cells };
}

// =============================================================================
// Challenge Numbers (Life Cycles)
// =============================================================================

/**
 * Calculate the four Challenge Numbers based on DOB.
 * Age brackets: 0–29, 30–38, 39–47, 48+
 */
export function calculateChallengeNumbers(dob: Date): ChallengeNumbers {
  const day = dob.getUTCDate();
  const month = dob.getUTCMonth() + 1;
  const year = dob.getUTCFullYear();

  const d = reduceToSingleDigit(day);
  const m = reduceToSingleDigit(month);
  const y = reduceToSingleDigit(sumDigits(year));

  const first = Math.abs(m - d);
  const second = Math.abs(d - y);
  const main = Math.abs(first - second);
  const fourth = reduceToSingleDigit(m + y);

  return {
    first,
    second,
    main,
    fourth,
    phases: [
      { phase: 1, ageRange: '0-29', challenge: first },
      { phase: 2, ageRange: '30-38', challenge: second },
      { phase: 3, ageRange: '39-47', challenge: main },
      { phase: 4, ageRange: '48+', challenge: fourth },
    ],
  };
}

// =============================================================================
// Personal Year / Month (Forecasting)
// =============================================================================

/**
 * Personal Year Number for a given calendar year.
 * Formula: reduce(birth_day + birth_month + sum_digits(target_year))
 */
export function calculatePersonalYear(dob: Date, year: number): number {
  const day = dob.getUTCDate();
  const month = dob.getUTCMonth() + 1;
  return reduceToSingleDigit(sumDigits(day) + sumDigits(month) + sumDigits(year));
}

/**
 * Personal Month Number.
 * Formula: reduce(personal_year + calendar_month)
 */
export function calculatePersonalMonth(personalYear: number, month: number): number {
  return reduceToSingleDigit(personalYear + month);
}

/**
 * Generate a 12-month rolling forecast starting from a given month/year.
 */
export function generateMonthlyForecast(
  dob: Date,
  startYear: number,
  startMonth: number,
): Array<{ month: string; year: number; calendarMonth: number; personalMonth: number; personalYear: number }> {
  const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  const result = [];
  let year = startYear;
  let month = startMonth;

  for (let i = 0; i < 12; i++) {
    const personalYear = calculatePersonalYear(dob, year);
    const personalMonth = calculatePersonalMonth(personalYear, month);

    result.push({
      month: MONTH_NAMES[month - 1],
      year,
      calendarMonth: month,
      personalMonth,
      personalYear,
    });

    month++;
    if (month > 12) {
      month = 1;
      year++;
    }
  }

  return result;
}

// =============================================================================
// Zodiac Sign Mapper
// =============================================================================

const ZODIAC_DATA: Array<{
  sign: string;
  rulingPlanet: string;
  element: string;
  quality: string;
  startMonth: number;
  startDay: number;
  endMonth: number;
  endDay: number;
}> = [
  { sign: 'Aries', rulingPlanet: 'Mars', element: 'Fire', quality: 'Cardinal', startMonth: 3, startDay: 21, endMonth: 4, endDay: 19 },
  { sign: 'Taurus', rulingPlanet: 'Venus', element: 'Earth', quality: 'Fixed', startMonth: 4, startDay: 20, endMonth: 5, endDay: 20 },
  { sign: 'Gemini', rulingPlanet: 'Mercury', element: 'Air', quality: 'Mutable', startMonth: 5, startDay: 21, endMonth: 6, endDay: 20 },
  { sign: 'Cancer', rulingPlanet: 'Moon', element: 'Water', quality: 'Cardinal', startMonth: 6, startDay: 21, endMonth: 7, endDay: 22 },
  { sign: 'Leo', rulingPlanet: 'Sun', element: 'Fire', quality: 'Fixed', startMonth: 7, startDay: 23, endMonth: 8, endDay: 22 },
  { sign: 'Virgo', rulingPlanet: 'Mercury', element: 'Earth', quality: 'Mutable', startMonth: 8, startDay: 23, endMonth: 9, endDay: 22 },
  { sign: 'Libra', rulingPlanet: 'Venus', element: 'Air', quality: 'Cardinal', startMonth: 9, startDay: 23, endMonth: 10, endDay: 22 },
  { sign: 'Scorpio', rulingPlanet: 'Mars/Pluto', element: 'Water', quality: 'Fixed', startMonth: 10, startDay: 23, endMonth: 11, endDay: 21 },
  { sign: 'Sagittarius', rulingPlanet: 'Jupiter', element: 'Fire', quality: 'Mutable', startMonth: 11, startDay: 22, endMonth: 12, endDay: 21 },
  { sign: 'Capricorn', rulingPlanet: 'Saturn', element: 'Earth', quality: 'Cardinal', startMonth: 12, startDay: 22, endMonth: 1, endDay: 19 },
  { sign: 'Aquarius', rulingPlanet: 'Saturn/Uranus', element: 'Air', quality: 'Fixed', startMonth: 1, startDay: 20, endMonth: 2, endDay: 18 },
  { sign: 'Pisces', rulingPlanet: 'Jupiter/Neptune', element: 'Water', quality: 'Mutable', startMonth: 2, startDay: 19, endMonth: 3, endDay: 20 },
];

/**
 * Get zodiac sign and attributes from a date of birth.
 */
export function getZodiacSign(dob: Date): ZodiacInfo {
  const month = dob.getUTCMonth() + 1;
  const day = dob.getUTCDate();

  for (const z of ZODIAC_DATA) {
    if (z.startMonth === z.endMonth) continue; // no same-month signs
    if (
      (month === z.startMonth && day >= z.startDay) ||
      (month === z.endMonth && day <= z.endDay)
    ) {
      return { sign: z.sign, rulingPlanet: z.rulingPlanet, element: z.element, quality: z.quality };
    }
  }

  // Capricorn spans Dec→Jan; handle wrap-around
  if ((month === 12 && day >= 22) || (month === 1 && day <= 19)) {
    return { sign: 'Capricorn', rulingPlanet: 'Saturn', element: 'Earth', quality: 'Cardinal' };
  }

  // Fallback (shouldn't happen with valid DOB)
  return { sign: 'Aries', rulingPlanet: 'Mars', element: 'Fire', quality: 'Cardinal' };
}

// =============================================================================
// Name Planes
// =============================================================================

const PLANE_LETTERS: Record<keyof NamePlanes['letters'], Set<string>> = {
  knowledge: new Set(['B', 'H', 'J', 'P', 'Y']),
  strength: new Set(['D', 'M', 'T']),
  emotional: new Set(['A', 'C', 'F', 'I', 'L', 'O', 'S']),
  spiritual: new Set(['E', 'G', 'K', 'N', 'Q', 'R', 'U', 'V', 'W', 'X', 'Z']),
};

/**
 * Classify each letter in the name into the four numerological planes.
 */
export function getNamePlanes(fullName: string): NamePlanes {
  const upper = fullName.toUpperCase().replace(/[^A-Z]/g, '');

  const letters: NamePlanes['letters'] = {
    knowledge: [],
    strength: [],
    emotional: [],
    spiritual: [],
  };

  for (const ch of upper) {
    for (const plane of Object.keys(PLANE_LETTERS) as (keyof typeof PLANE_LETTERS)[]) {
      if (PLANE_LETTERS[plane].has(ch)) {
        letters[plane].push(ch);
        break;
      }
    }
  }

  return {
    knowledge: letters.knowledge.length,
    strength: letters.strength.length,
    emotional: letters.emotional.length,
    spiritual: letters.spiritual.length,
    letters,
  };
}

// =============================================================================
// Kua Element Lookup
// =============================================================================

const KUA_ELEMENTS: Record<number, string> = {
  1: 'Water',
  2: 'Earth',
  3: 'Wood',
  4: 'Wood',
  6: 'Metal',
  7: 'Metal',
  8: 'Earth',
  9: 'Fire',
};

export function getKuaData(birthYear: number, gender: 'male' | 'female'): KuaData {
  const kuaNumber = calculateKuaNumber(birthYear, gender);
  return {
    kuaNumber,
    element: KUA_ELEMENTS[kuaNumber] ?? 'Earth',
  };
}

