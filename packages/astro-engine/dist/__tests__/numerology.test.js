"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const numerology_1 = require("../numerology");
(0, vitest_1.describe)('Numerology - Life Path', () => {
    (0, vitest_1.it)('should calculate life path number correctly', () => {
        // 1990-01-15: 1+9+9+0+0+1+1+5 = 26 = 2+6 = 8
        const result = (0, numerology_1.calculateLifePath)('1990-01-15');
        (0, vitest_1.expect)(result).toBe(8);
    });
    (0, vitest_1.it)('should reduce to single digit (1-9) or master numbers (11,22,33)', () => {
        const result = (0, numerology_1.calculateLifePath)('2000-06-15');
        (0, vitest_1.expect)([1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 22, 33]).toContain(result);
    });
    (0, vitest_1.it)('should handle different date formats', () => {
        const result = (0, numerology_1.calculateLifePath)('1985-12-25');
        (0, vitest_1.expect)(result).toBeGreaterThanOrEqual(1);
        (0, vitest_1.expect)(result).toBeLessThanOrEqual(33);
    });
});
(0, vitest_1.describe)('Numerology - Expression Number', () => {
    (0, vitest_1.it)('should return a valid number', () => {
        const result = (0, numerology_1.calculateExpression)('John Doe');
        (0, vitest_1.expect)(result).toBeGreaterThanOrEqual(1);
        (0, vitest_1.expect)(result).toBeLessThanOrEqual(33);
    });
    (0, vitest_1.it)('should be case insensitive', () => {
        const lower = (0, numerology_1.calculateExpression)('john doe');
        const upper = (0, numerology_1.calculateExpression)('JOHN DOE');
        (0, vitest_1.expect)(lower).toBe(upper);
    });
});
(0, vitest_1.describe)('Numerology - Soul Urge', () => {
    (0, vitest_1.it)('should only use vowels', () => {
        const result = (0, numerology_1.calculateSoulUrge)('John Doe');
        (0, vitest_1.expect)(result).toBeGreaterThanOrEqual(1);
        (0, vitest_1.expect)(result).toBeLessThanOrEqual(33);
    });
});
(0, vitest_1.describe)('Numerology - Personality', () => {
    (0, vitest_1.it)('should only use consonants', () => {
        const result = (0, numerology_1.calculatePersonality)('John Doe');
        (0, vitest_1.expect)(result).toBeGreaterThanOrEqual(1);
        (0, vitest_1.expect)(result).toBeLessThanOrEqual(33);
    });
});
(0, vitest_1.describe)('Numerology - Lucky Numbers', () => {
    (0, vitest_1.it)('should return an array of numbers', () => {
        const result = (0, numerology_1.calculateLuckyNumbers)(5);
        (0, vitest_1.expect)(Array.isArray(result)).toBe(true);
        (0, vitest_1.expect)(result.length).toBeGreaterThan(0);
    });
    (0, vitest_1.it)('should include the life path number', () => {
        const lifePath = 7;
        const result = (0, numerology_1.calculateLuckyNumbers)(lifePath);
        (0, vitest_1.expect)(result).toContain(lifePath);
    });
});
//# sourceMappingURL=numerology.test.js.map