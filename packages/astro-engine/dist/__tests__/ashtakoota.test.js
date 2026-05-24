"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const ashtakoota_1 = require("../matching/ashtakoota");
(0, vitest_1.describe)('Ashtakoota Matching', () => {
    (0, vitest_1.it)('should return total max score of 36', () => {
        const result = (0, ashtakoota_1.calculateAshtakoota)(0, 0, 'Aries', 'Aries');
        const maxTotal = result.scores.reduce((sum, s) => sum + s.maxScore, 0);
        (0, vitest_1.expect)(maxTotal).toBe(36);
    });
    (0, vitest_1.it)('should give 0 Nadi score for same nakshatra (same nadi)', () => {
        // Same nakshatra index = same nadi
        const result = (0, ashtakoota_1.calculateAshtakoota)(0, 0, 'Aries', 'Aries');
        const nadiScore = result.scores.find((s) => s.koota === 'Nadi');
        (0, vitest_1.expect)(nadiScore).toBeDefined();
        (0, vitest_1.expect)(nadiScore.score).toBe(0);
    });
    (0, vitest_1.it)('should give 8 Nadi score for different nadi nakshatras', () => {
        // Ashwini (index 0, Aadi) vs Bharani (index 1, Madhya)
        const result = (0, ashtakoota_1.calculateAshtakoota)(0, 1, 'Aries', 'Aries');
        const nadiScore = result.scores.find((s) => s.koota === 'Nadi');
        (0, vitest_1.expect)(nadiScore).toBeDefined();
        (0, vitest_1.expect)(nadiScore.score).toBe(8);
    });
    (0, vitest_1.it)('should give 6 Gana score for Deva-Deva', () => {
        // Ashwini (index 0) = Deva, Mrigashira (index 4) = Deva
        const result = (0, ashtakoota_1.calculateAshtakoota)(0, 4, 'Aries', 'Gemini');
        const ganaScore = result.scores.find((s) => s.koota === 'Gana');
        (0, vitest_1.expect)(ganaScore).toBeDefined();
        (0, vitest_1.expect)(ganaScore.score).toBe(6);
    });
    (0, vitest_1.it)('should give 0 Gana score for Deva-Rakshasa', () => {
        // Ashwini (index 0) = Deva, Ashlesha (index 8) = Rakshasa
        const result = (0, ashtakoota_1.calculateAshtakoota)(0, 8, 'Aries', 'Cancer');
        const ganaScore = result.scores.find((s) => s.koota === 'Gana');
        (0, vitest_1.expect)(ganaScore).toBeDefined();
        (0, vitest_1.expect)(ganaScore.score).toBe(0);
    });
    (0, vitest_1.it)('should return overall compatibility category', () => {
        const result = (0, ashtakoota_1.calculateAshtakoota)(0, 4, 'Aries', 'Gemini');
        (0, vitest_1.expect)(['excellent', 'good', 'average', 'below_average', 'poor']).toContain(result.overallCompatibility);
    });
    (0, vitest_1.it)('should return 8 individual scores', () => {
        const result = (0, ashtakoota_1.calculateAshtakoota)(0, 4, 'Aries', 'Gemini');
        (0, vitest_1.expect)(result.scores.length).toBe(8);
    });
    (0, vitest_1.it)('should return valid total score between 0 and 36', () => {
        const result = (0, ashtakoota_1.calculateAshtakoota)(5, 15, 'Gemini', 'Scorpio');
        (0, vitest_1.expect)(result.totalScore).toBeGreaterThanOrEqual(0);
        (0, vitest_1.expect)(result.totalScore).toBeLessThanOrEqual(36);
    });
    (0, vitest_1.it)('should include mangal match info', () => {
        const result = (0, ashtakoota_1.calculateAshtakoota)(0, 4, 'Aries', 'Gemini');
        (0, vitest_1.expect)(result.mangalMatch).toBeDefined();
        (0, vitest_1.expect)(typeof result.mangalMatch.compatible).toBe('boolean');
    });
});
//# sourceMappingURL=ashtakoota.test.js.map