"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const divisionalCharts_1 = require("../charts/divisionalCharts");
(0, vitest_1.describe)('D1 - Rashi Chart', () => {
    (0, vitest_1.it)('should return sign index 0 (Aries) for longitude 0-30', () => {
        (0, vitest_1.expect)((0, divisionalCharts_1.calculateD1)(0)).toBe(0);
        (0, vitest_1.expect)((0, divisionalCharts_1.calculateD1)(15)).toBe(0);
        (0, vitest_1.expect)((0, divisionalCharts_1.calculateD1)(29.9)).toBe(0);
    });
    (0, vitest_1.it)('should return sign index 1 (Taurus) for longitude 30-60', () => {
        (0, vitest_1.expect)((0, divisionalCharts_1.calculateD1)(30)).toBe(1);
        (0, vitest_1.expect)((0, divisionalCharts_1.calculateD1)(45)).toBe(1);
    });
    (0, vitest_1.it)('should return sign index 11 (Pisces) for longitude 330-360', () => {
        (0, vitest_1.expect)((0, divisionalCharts_1.calculateD1)(340)).toBe(11);
    });
});
(0, vitest_1.describe)('D2 - Hora Chart', () => {
    (0, vitest_1.it)('should return a valid sign index (0-11)', () => {
        const result = (0, divisionalCharts_1.calculateD2)(15);
        (0, vitest_1.expect)(result).toBeGreaterThanOrEqual(0);
        (0, vitest_1.expect)(result).toBeLessThanOrEqual(11);
    });
});
(0, vitest_1.describe)('D3 - Drekkana Chart', () => {
    (0, vitest_1.it)('should map 0-10° of Aries to Aries (same sign)', () => {
        (0, vitest_1.expect)((0, divisionalCharts_1.calculateD3)(5)).toBe(0); // Aries
    });
    (0, vitest_1.it)('should map 10-20° of Aries to Leo (5th from Aries)', () => {
        (0, vitest_1.expect)((0, divisionalCharts_1.calculateD3)(15)).toBe(4); // Leo
    });
    (0, vitest_1.it)('should map 20-30° of Aries to Sagittarius (9th from Aries)', () => {
        (0, vitest_1.expect)((0, divisionalCharts_1.calculateD3)(25)).toBe(8); // Sagittarius
    });
});
(0, vitest_1.describe)('D9 - Navamsa Chart', () => {
    (0, vitest_1.it)('should map 0° Aries to Aries (fire sign starts from Aries)', () => {
        (0, vitest_1.expect)((0, divisionalCharts_1.calculateD9)(0)).toBe(0); // Aries
    });
    (0, vitest_1.it)('should map 3°20 Aries to Taurus (2nd navamsa of Aries)', () => {
        const deg = 3 + 20 / 60; // 3°20'
        (0, vitest_1.expect)((0, divisionalCharts_1.calculateD9)(deg)).toBe(1); // Taurus
    });
    (0, vitest_1.it)('should return valid sign index for any longitude', () => {
        for (let i = 0; i < 360; i += 10) {
            const result = (0, divisionalCharts_1.calculateD9)(i);
            (0, vitest_1.expect)(result).toBeGreaterThanOrEqual(0);
            (0, vitest_1.expect)(result).toBeLessThanOrEqual(11);
        }
    });
});
(0, vitest_1.describe)('D10 - Dashamsha Chart', () => {
    (0, vitest_1.it)('should return valid sign index', () => {
        const result = (0, divisionalCharts_1.calculateD10)(100);
        (0, vitest_1.expect)(result).toBeGreaterThanOrEqual(0);
        (0, vitest_1.expect)(result).toBeLessThanOrEqual(11);
    });
});
(0, vitest_1.describe)('D12 - Dwadashamsha Chart', () => {
    (0, vitest_1.it)('should map first 2.5° of Aries to Aries', () => {
        (0, vitest_1.expect)((0, divisionalCharts_1.calculateD12)(1)).toBe(0);
    });
    (0, vitest_1.it)('should map 2.5-5° of Aries to Taurus', () => {
        (0, vitest_1.expect)((0, divisionalCharts_1.calculateD12)(3)).toBe(1);
    });
    (0, vitest_1.it)('should return valid sign index for all longitudes', () => {
        for (let i = 0; i < 360; i += 15) {
            const result = (0, divisionalCharts_1.calculateD12)(i);
            (0, vitest_1.expect)(result).toBeGreaterThanOrEqual(0);
            (0, vitest_1.expect)(result).toBeLessThanOrEqual(11);
        }
    });
});
//# sourceMappingURL=divisionalCharts.test.js.map