"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const tithi_1 = require("../panchang/tithi");
const nakshatra_1 = require("../panchang/nakshatra");
const yoga_1 = require("../panchang/yoga");
const karana_1 = require("../panchang/karana");
const rahuKaal_1 = require("../panchang/rahuKaal");
(0, vitest_1.describe)('Tithi Calculation', () => {
    (0, vitest_1.it)('should return a valid tithi number (1-30)', () => {
        const result = (0, tithi_1.calculateTithi)(100, 20);
        (0, vitest_1.expect)(result.number).toBeGreaterThanOrEqual(1);
        (0, vitest_1.expect)(result.number).toBeLessThanOrEqual(30);
    });
    (0, vitest_1.it)('should identify Shukla/Krishna paksha', () => {
        const result = (0, tithi_1.calculateTithi)(100, 20);
        (0, vitest_1.expect)(['Shukla', 'Krishna']).toContain(result.paksha);
    });
    (0, vitest_1.it)('should return tithi name', () => {
        const result = (0, tithi_1.calculateTithi)(100, 20);
        (0, vitest_1.expect)(result.name).toBeTruthy();
        (0, vitest_1.expect)(typeof result.name).toBe('string');
    });
    (0, vitest_1.it)('should have isAuspicious boolean', () => {
        const result = (0, tithi_1.calculateTithi)(100, 20);
        (0, vitest_1.expect)(typeof result.isAuspicious).toBe('boolean');
    });
    (0, vitest_1.it)('should give Purnima/Amavasya for specific configurations', () => {
        // Moon ~179° ahead of Sun (just before full moon boundary) → Purnima (tithi 15)
        const purnima = (0, tithi_1.calculateTithi)(179, 0);
        (0, vitest_1.expect)(purnima.number).toBe(15);
    });
});
(0, vitest_1.describe)('Nakshatra Calculation', () => {
    (0, vitest_1.it)('should return Ashwini for Moon at 0°', () => {
        const result = (0, nakshatra_1.calculateNakshatra)(0);
        (0, vitest_1.expect)(result.name).toBe('Ashwini');
        (0, vitest_1.expect)(result.index).toBe(0);
    });
    (0, vitest_1.it)('should return valid pada (1-4)', () => {
        const result = (0, nakshatra_1.calculateNakshatra)(50);
        (0, vitest_1.expect)(result.pada).toBeGreaterThanOrEqual(1);
        (0, vitest_1.expect)(result.pada).toBeLessThanOrEqual(4);
    });
    (0, vitest_1.it)('should return valid nakshatra index (0-26)', () => {
        const result = (0, nakshatra_1.calculateNakshatra)(200);
        (0, vitest_1.expect)(result.index).toBeGreaterThanOrEqual(0);
        (0, vitest_1.expect)(result.index).toBeLessThanOrEqual(26);
    });
    (0, vitest_1.it)('should return correct lord for Ashwini (Ketu)', () => {
        const result = (0, nakshatra_1.calculateNakshatra)(5);
        (0, vitest_1.expect)(result.lord).toBe('Ketu');
    });
});
(0, vitest_1.describe)('Panchang Yoga Calculation', () => {
    (0, vitest_1.it)('should return valid yoga index (0-26)', () => {
        const result = (0, yoga_1.calculatePanchangYoga)(100, 200);
        (0, vitest_1.expect)(result.index).toBeGreaterThanOrEqual(0);
        (0, vitest_1.expect)(result.index).toBeLessThanOrEqual(26);
    });
    (0, vitest_1.it)('should return yoga name', () => {
        const result = (0, yoga_1.calculatePanchangYoga)(100, 200);
        (0, vitest_1.expect)(result.name).toBeTruthy();
    });
    (0, vitest_1.it)('should have isAuspicious boolean', () => {
        const result = (0, yoga_1.calculatePanchangYoga)(100, 200);
        (0, vitest_1.expect)(typeof result.isAuspicious).toBe('boolean');
    });
});
(0, vitest_1.describe)('Karana Calculation', () => {
    (0, vitest_1.it)('should return a valid karana', () => {
        const result = (0, karana_1.calculateKarana)(100, 20);
        (0, vitest_1.expect)(result.name).toBeTruthy();
        (0, vitest_1.expect)(result.index).toBeGreaterThanOrEqual(0);
    });
});
(0, vitest_1.describe)('Rahu Kaal Calculation', () => {
    (0, vitest_1.it)('should return start and end times', () => {
        const result = (0, rahuKaal_1.calculateRahuKaal)('06:00', '18:00', 0); // Sunday
        (0, vitest_1.expect)(result.start).toBeTruthy();
        (0, vitest_1.expect)(result.end).toBeTruthy();
    });
    (0, vitest_1.it)('should give different times for different days', () => {
        const sunday = (0, rahuKaal_1.calculateRahuKaal)('06:00', '18:00', 0);
        const monday = (0, rahuKaal_1.calculateRahuKaal)('06:00', '18:00', 1);
        (0, vitest_1.expect)(sunday.start).not.toBe(monday.start);
    });
});
//# sourceMappingURL=panchang.test.js.map