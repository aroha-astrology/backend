import type { NumerologyResult } from '@jyotish-ai/shared';
/**
 * Calculate the Life Path number from a date of birth.
 * Reduces each component (day, month, year) separately, then sums and reduces.
 *
 * @param dob - Date of birth as "YYYY-MM-DD"
 * @returns Life Path number (1-9, 11, 22, or 33)
 */
export declare function calculateLifePath(dob: string): number;
/**
 * Calculate the Expression (Destiny) number from a full name.
 * Uses the Pythagorean system, summing all letter values.
 *
 * @param fullName - Full name (spaces are ignored)
 * @returns Expression number (1-9, 11, 22, or 33)
 */
export declare function calculateExpression(fullName: string): number;
/**
 * Calculate the Soul Urge (Heart's Desire) number from vowels only.
 *
 * @param fullName - Full name
 * @returns Soul Urge number (1-9, 11, 22, or 33)
 */
export declare function calculateSoulUrge(fullName: string): number;
/**
 * Calculate the Personality number from consonants only.
 *
 * @param fullName - Full name
 * @returns Personality number (1-9, 11, 22, or 33)
 */
export declare function calculatePersonality(fullName: string): number;
/**
 * Calculate lucky numbers based on the Life Path number.
 * Returns the Life Path number itself, its multiples within 1-100,
 * and complementary numbers.
 *
 * @param lifePath - Life Path number (1-9, 11, 22, 33)
 * @returns Array of lucky numbers
 */
export declare function calculateLuckyNumbers(lifePath: number): number[];
/**
 * Analyze a name using both Pythagorean and Chaldean numerology systems.
 *
 * @param name - Name to analyze
 * @returns Object with pythagorean and chaldean name numbers
 */
export declare function analyzeNameNumerology(name: string): {
    pythagorean: number;
    chaldean: number;
};
/**
 * Generate a complete numerology analysis from date of birth and name.
 *
 * @param dob - Date of birth as "YYYY-MM-DD"
 * @param fullName - Full name
 * @returns Complete NumerologyResult
 */
export declare function calculateFullNumerology(dob: string, fullName: string): NumerologyResult;
//# sourceMappingURL=index.d.ts.map