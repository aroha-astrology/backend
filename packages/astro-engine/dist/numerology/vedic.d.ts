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
        {
            phase: 1;
            ageRange: '0-29';
            challenge: number;
        },
        {
            phase: 2;
            ageRange: '30-38';
            challenge: number;
        },
        {
            phase: 3;
            ageRange: '39-47';
            challenge: number;
        },
        {
            phase: 4;
            ageRange: '48+';
            challenge: number;
        }
    ];
}
export interface ZodiacInfo {
    sign: string;
    rulingPlanet: string;
    element: string;
    quality: string;
}
export interface NamePlanes {
    knowledge: number;
    strength: number;
    emotional: number;
    spiritual: number;
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
/**
 * Reduce a number to a single digit (1–9), no master number preservation.
 */
export declare function reduceToSingleDigit(n: number): number;
/**
 * Mulank (Psychic Number): derived from the day of birth, reduced to 1–9.
 * E.g., born on the 29th → 2+9=11 → 1+1=2
 */
export declare function calculateMulank(dob: Date): number;
/**
 * Bhagyank (Destiny Number): sum ALL digits of the full DOB (DD+MM+YYYY),
 * reduced to 1–9.
 * E.g., 15/08/1987 → 1+5+0+8+1+9+8+7=39 → 3+9=12 → 1+2=3
 */
export declare function calculateBhagyank(dob: Date): number;
/**
 * Kua Number (Feng Shui / Ba Gua):
 * Male:   reduce(sum of birth year digits) → 11 - result; if 5 → use 2
 * Female: reduce(sum of birth year digits) → result + 4; if 5 → use 8; if >9 → reduce again
 */
export declare function calculateKuaNumber(birthYear: number, gender: 'male' | 'female'): number;
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
export declare function calculateLoShuGrid(dob: Date): LoShuGrid;
/**
 * Calculate the four Challenge Numbers based on DOB.
 * Age brackets: 0–29, 30–38, 39–47, 48+
 */
export declare function calculateChallengeNumbers(dob: Date): ChallengeNumbers;
/**
 * Personal Year Number for a given calendar year.
 * Formula: reduce(birth_day + birth_month + sum_digits(target_year))
 */
export declare function calculatePersonalYear(dob: Date, year: number): number;
/**
 * Personal Month Number.
 * Formula: reduce(personal_year + calendar_month)
 */
export declare function calculatePersonalMonth(personalYear: number, month: number): number;
/**
 * Generate a 12-month rolling forecast starting from a given month/year.
 */
export declare function generateMonthlyForecast(dob: Date, startYear: number, startMonth: number): Array<{
    month: string;
    year: number;
    calendarMonth: number;
    personalMonth: number;
    personalYear: number;
}>;
/**
 * Get zodiac sign and attributes from a date of birth.
 */
export declare function getZodiacSign(dob: Date): ZodiacInfo;
/**
 * Classify each letter in the name into the four numerological planes.
 */
export declare function getNamePlanes(fullName: string): NamePlanes;
export declare function getKuaData(birthYear: number, gender: 'male' | 'female'): KuaData;
//# sourceMappingURL=vedic.d.ts.map