"use strict";
// =============================================================================
// Numerology Module
// =============================================================================
// Implements Pythagorean and Chaldean numerology systems.
// All calculations are pure deterministic math -- no randomness.
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateLifePath = calculateLifePath;
exports.calculateExpression = calculateExpression;
exports.calculateSoulUrge = calculateSoulUrge;
exports.calculatePersonality = calculatePersonality;
exports.calculateLuckyNumbers = calculateLuckyNumbers;
exports.analyzeNameNumerology = analyzeNameNumerology;
exports.calculateFullNumerology = calculateFullNumerology;
// =============================================================================
// Pythagorean System: A=1, B=2, ... I=9, J=1, K=2, ... R=9, S=1, ... Z=8
// =============================================================================
const PYTHAGOREAN_VALUES = {
    A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, I: 9,
    J: 1, K: 2, L: 3, M: 4, N: 5, O: 6, P: 7, Q: 8, R: 9,
    S: 1, T: 2, U: 3, V: 4, W: 5, X: 6, Y: 7, Z: 8,
};
// =============================================================================
// Chaldean System: Uses 1-8 mapping (no 9 in Chaldean assignments)
// =============================================================================
const CHALDEAN_VALUES = {
    A: 1, B: 2, C: 3, D: 4, E: 5, F: 8, G: 3, H: 5, I: 1,
    J: 1, K: 2, L: 3, M: 4, N: 5, O: 7, P: 8, Q: 1, R: 2,
    S: 3, T: 4, U: 6, V: 6, W: 6, X: 5, Y: 1, Z: 7,
};
const VOWELS = new Set(['A', 'E', 'I', 'O', 'U']);
// =============================================================================
// Helper: Reduce a number to a single digit (1-9) or master number (11, 22, 33)
// =============================================================================
/**
 * Reduce a number to a single digit, preserving master numbers 11, 22, 33.
 */
function reduceToSingle(n) {
    while (n > 9 && n !== 11 && n !== 22 && n !== 33) {
        let sum = 0;
        let temp = n;
        while (temp > 0) {
            sum += temp % 10;
            temp = Math.floor(temp / 10);
        }
        n = sum;
    }
    return n;
}
/**
 * Reduce a number strictly to a single digit (1-9), no master numbers.
 */
function reduceStrict(n) {
    while (n > 9) {
        let sum = 0;
        let temp = n;
        while (temp > 0) {
            sum += temp % 10;
            temp = Math.floor(temp / 10);
        }
        n = sum;
    }
    return n;
}
// =============================================================================
// Core Numerology Functions
// =============================================================================
/**
 * Calculate the Life Path number from a date of birth.
 * Reduces each component (day, month, year) separately, then sums and reduces.
 *
 * @param dob - Date of birth as "YYYY-MM-DD"
 * @returns Life Path number (1-9, 11, 22, or 33)
 */
function calculateLifePath(dob) {
    const parts = dob.split('-').map(Number);
    const year = parts[0];
    const month = parts[1];
    const day = parts[2];
    const reducedYear = reduceToSingle(digitSum(year));
    const reducedMonth = reduceToSingle(month);
    const reducedDay = reduceToSingle(day);
    return reduceToSingle(reducedYear + reducedMonth + reducedDay);
}
/**
 * Calculate the sum of digits in a number.
 */
function digitSum(n) {
    let sum = 0;
    let temp = Math.abs(n);
    while (temp > 0) {
        sum += temp % 10;
        temp = Math.floor(temp / 10);
    }
    return sum;
}
/**
 * Calculate the Expression (Destiny) number from a full name.
 * Uses the Pythagorean system, summing all letter values.
 *
 * @param fullName - Full name (spaces are ignored)
 * @returns Expression number (1-9, 11, 22, or 33)
 */
function calculateExpression(fullName) {
    const upper = fullName.toUpperCase().replace(/[^A-Z]/g, '');
    let total = 0;
    for (const ch of upper) {
        total += PYTHAGOREAN_VALUES[ch] || 0;
    }
    return reduceToSingle(total);
}
/**
 * Calculate the Soul Urge (Heart's Desire) number from vowels only.
 *
 * @param fullName - Full name
 * @returns Soul Urge number (1-9, 11, 22, or 33)
 */
function calculateSoulUrge(fullName) {
    const upper = fullName.toUpperCase().replace(/[^A-Z]/g, '');
    let total = 0;
    for (const ch of upper) {
        if (VOWELS.has(ch)) {
            total += PYTHAGOREAN_VALUES[ch] || 0;
        }
    }
    return reduceToSingle(total);
}
/**
 * Calculate the Personality number from consonants only.
 *
 * @param fullName - Full name
 * @returns Personality number (1-9, 11, 22, or 33)
 */
function calculatePersonality(fullName) {
    const upper = fullName.toUpperCase().replace(/[^A-Z]/g, '');
    let total = 0;
    for (const ch of upper) {
        if (!VOWELS.has(ch)) {
            total += PYTHAGOREAN_VALUES[ch] || 0;
        }
    }
    return reduceToSingle(total);
}
/**
 * Calculate lucky numbers based on the Life Path number.
 * Returns the Life Path number itself, its multiples within 1-100,
 * and complementary numbers.
 *
 * @param lifePath - Life Path number (1-9, 11, 22, 33)
 * @returns Array of lucky numbers
 */
function calculateLuckyNumbers(lifePath) {
    const base = reduceStrict(lifePath);
    const lucky = new Set();
    // The base number itself
    lucky.add(base);
    // Complementary number (9 - base + 1 for non-zero)
    const complement = base === 9 ? 9 : 9 - base;
    lucky.add(complement);
    // Multiples of base up to 100
    for (let i = 1; i * base <= 100; i++) {
        lucky.add(i * base);
    }
    // Numbers that reduce to the base
    for (let i = 10; i <= 99; i++) {
        if (reduceStrict(i) === base) {
            lucky.add(i);
            if (lucky.size >= 12)
                break;
        }
    }
    // Sort and return
    return Array.from(lucky).sort((a, b) => a - b);
}
/**
 * Analyze a name using both Pythagorean and Chaldean numerology systems.
 *
 * @param name - Name to analyze
 * @returns Object with pythagorean and chaldean name numbers
 */
function analyzeNameNumerology(name) {
    const upper = name.toUpperCase().replace(/[^A-Z]/g, '');
    let pythagoreanTotal = 0;
    let chaldeanTotal = 0;
    for (const ch of upper) {
        pythagoreanTotal += PYTHAGOREAN_VALUES[ch] || 0;
        chaldeanTotal += CHALDEAN_VALUES[ch] || 0;
    }
    return {
        pythagorean: reduceToSingle(pythagoreanTotal),
        chaldean: reduceToSingle(chaldeanTotal),
    };
}
// =============================================================================
// Number Meaning Descriptions
// =============================================================================
const LIFE_PATH_MEANINGS = {
    1: 'The Leader: Independent, ambitious, pioneering. You are destined to lead and innovate. Your path involves self-reliance and original thinking.',
    2: 'The Diplomat: Cooperative, sensitive, harmonious. You are destined to create peace and partnerships. Your path involves diplomacy and nurturing relationships.',
    3: 'The Communicator: Creative, expressive, joyful. You are destined to inspire through art and communication. Your path involves self-expression and optimism.',
    4: 'The Builder: Practical, disciplined, hardworking. You are destined to build lasting foundations. Your path involves structure, order, and determination.',
    5: 'The Adventurer: Freedom-loving, versatile, dynamic. You are destined to experience life fully. Your path involves change, travel, and adaptability.',
    6: 'The Nurturer: Responsible, caring, harmonious. You are destined to serve family and community. Your path involves love, healing, and domestic harmony.',
    7: 'The Seeker: Analytical, introspective, spiritual. You are destined to seek truth and wisdom. Your path involves deep study, meditation, and inner knowledge.',
    8: 'The Achiever: Powerful, ambitious, materialistic. You are destined to achieve material success. Your path involves authority, finance, and executive ability.',
    9: 'The Humanitarian: Compassionate, generous, wise. You are destined to serve humanity. Your path involves selflessness, universal love, and spiritual wisdom.',
    11: 'The Illuminator (Master Number): Intuitive, inspirational, visionary. You carry heightened spiritual awareness and are destined to inspire and uplift others.',
    22: 'The Master Builder (Master Number): Visionary, practical, powerful. You can turn the most ambitious dreams into reality. Your path involves large-scale achievement.',
    33: 'The Master Teacher (Master Number): Selfless, nurturing, spiritual. You are the most spiritually evolved and are destined to guide others toward enlightenment.',
};
const EXPRESSION_MEANINGS = {
    1: 'Natural-born leader with executive abilities and strong determination.',
    2: 'Diplomatic peacemaker with talent for cooperation and sensitivity to others.',
    3: 'Creative communicator with artistic talents and an optimistic outlook.',
    4: 'Organized builder who excels at creating structure and stability.',
    5: 'Versatile adventurer with talent for change, communication, and freedom.',
    6: 'Responsible nurturer with talent for healing, teaching, and family harmony.',
    7: 'Deep thinker and seeker of truth with analytical and research abilities.',
    8: 'Ambitious achiever with strong business sense and material mastery.',
    9: 'Compassionate humanitarian with broad vision and artistic sensitivity.',
    11: 'Inspired visionary with extraordinary intuition and spiritual insight.',
    22: 'Master architect capable of manifesting grand visions into material reality.',
    33: 'Master healer and teacher dedicated to the upliftment of all humanity.',
};
const SOUL_URGE_MEANINGS = {
    1: 'Your inner desire is for independence, leadership, and personal achievement.',
    2: 'Your inner desire is for love, harmony, and meaningful partnerships.',
    3: 'Your inner desire is for creative expression, joy, and social interaction.',
    4: 'Your inner desire is for stability, order, and building something lasting.',
    5: 'Your inner desire is for freedom, adventure, and varied experiences.',
    6: 'Your inner desire is for a harmonious home, family love, and responsibility.',
    7: 'Your inner desire is for knowledge, solitude, and spiritual understanding.',
    8: 'Your inner desire is for success, recognition, and material abundance.',
    9: 'Your inner desire is for compassion, service to humanity, and universal love.',
    11: 'Your inner desire is for spiritual illumination and inspiring others.',
    22: 'Your inner desire is for large-scale achievement and leaving a lasting legacy.',
    33: 'Your inner desire is for selfless service and guiding humanity toward light.',
};
const PERSONALITY_MEANINGS = {
    1: 'You project an image of confidence, independence, and strong will.',
    2: 'You project an image of friendliness, cooperation, and approachability.',
    3: 'You project an image of creativity, charm, and sociability.',
    4: 'You project an image of reliability, discipline, and practicality.',
    5: 'You project an image of energy, versatility, and adventurousness.',
    6: 'You project an image of warmth, responsibility, and nurturing care.',
    7: 'You project an image of wisdom, mystery, and intellectual depth.',
    8: 'You project an image of authority, success, and material sophistication.',
    9: 'You project an image of compassion, generosity, and worldly wisdom.',
    11: 'You project an image of spiritual depth and visionary insight.',
    22: 'You project an image of competence, vision, and practical mastery.',
    33: 'You project an image of selfless compassion and spiritual teaching.',
};
/**
 * Generate a complete numerology analysis from date of birth and name.
 *
 * @param dob - Date of birth as "YYYY-MM-DD"
 * @param fullName - Full name
 * @returns Complete NumerologyResult
 */
function calculateFullNumerology(dob, fullName) {
    const lifePath = calculateLifePath(dob);
    const expression = calculateExpression(fullName);
    const soulUrge = calculateSoulUrge(fullName);
    const personality = calculatePersonality(fullName);
    const luckyNumbers = calculateLuckyNumbers(lifePath);
    const nameAnalysis = analyzeNameNumerology(fullName);
    return {
        lifePath,
        expression,
        soulUrge,
        personality,
        luckyNumbers,
        nameNumber: nameAnalysis.pythagorean,
        analysis: {
            lifePath: LIFE_PATH_MEANINGS[lifePath] || LIFE_PATH_MEANINGS[reduceStrict(lifePath)],
            expression: EXPRESSION_MEANINGS[expression] || EXPRESSION_MEANINGS[reduceStrict(expression)],
            soulUrge: SOUL_URGE_MEANINGS[soulUrge] || SOUL_URGE_MEANINGS[reduceStrict(soulUrge)],
            personality: PERSONALITY_MEANINGS[personality] || PERSONALITY_MEANINGS[reduceStrict(personality)],
        },
    };
}
//# sourceMappingURL=index.js.map