"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
// ---------------------------------------------------------------------------
// Mock the swisseph-wasm module so tests run without the WASM binary.
// ---------------------------------------------------------------------------
const mockSwe = {
    initSwissEph: vitest_1.vi.fn().mockResolvedValue(undefined),
    set_sid_mode: vitest_1.vi.fn(),
    julday: vitest_1.vi.fn(),
    calc: vitest_1.vi.fn(),
    houses_ex: vitest_1.vi.fn(),
    get_ayanamsa: vitest_1.vi.fn(),
};
vitest_1.vi.mock('swisseph-wasm', () => ({
    default: vitest_1.vi.fn().mockImplementation(() => mockSwe),
}));
const planetPositions_1 = require("../calculations/planetPositions");
// ---------------------------------------------------------------------------
// Constants pulled from the shared package so assertions are readable
// ---------------------------------------------------------------------------
const ZODIAC_SIGNS = [
    'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
    'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
];
const NAKSHATRAS = [
    'Ashwini', 'Bharani', 'Krittika', 'Rohini', 'Mrigashira', 'Ardra',
    'Punarvasu', 'Pushya', 'Ashlesha', 'Magha', 'PurvaPhalguni', 'UttaraPhalguni',
    'Hasta', 'Chitra', 'Swati', 'Vishakha', 'Anuradha', 'Jyeshtha',
    'Moola', 'PurvaAshadha', 'UttaraAshadha', 'Shravana', 'Dhanishta', 'Shatabhisha',
    'PurvaBhadrapada', 'UttaraBhadrapada', 'Revati',
];
// ---------------------------------------------------------------------------
// dateToJulianDay
// ---------------------------------------------------------------------------
(0, vitest_1.describe)('dateToJulianDay', () => {
    (0, vitest_1.it)('should return J2000.0 (2451545.0) for 2000-01-01 12:00 UTC', async () => {
        mockSwe.julday.mockReturnValue(2451545.0);
        const jd = await (0, planetPositions_1.dateToJulianDay)(2000, 1, 1, 12, 0, 0);
        (0, vitest_1.expect)(jd).toBe(2451545.0);
        // utHour = 12 + 0/60 - 0 = 12
        (0, vitest_1.expect)(mockSwe.julday).toHaveBeenCalledWith(2000, 1, 1, 12);
    });
    (0, vitest_1.it)('should subtract timezone offset to convert to UT', async () => {
        // IST (UTC+5.5): local 17:30 -> UT 12:00
        mockSwe.julday.mockReturnValue(2451545.0);
        await (0, planetPositions_1.dateToJulianDay)(2000, 1, 1, 17, 30, 5.5);
        // utHour = 17 + 30/60 - 5.5 = 12.0
        (0, vitest_1.expect)(mockSwe.julday).toHaveBeenCalledWith(2000, 1, 1, 12);
    });
    (0, vitest_1.it)('should handle negative timezone (west of Greenwich)', async () => {
        mockSwe.julday.mockReturnValue(2451545.0);
        await (0, planetPositions_1.dateToJulianDay)(2000, 1, 1, 7, 0, -5);
        // utHour = 7 + 0 - (-5) = 12
        (0, vitest_1.expect)(mockSwe.julday).toHaveBeenCalledWith(2000, 1, 1, 12);
    });
    (0, vitest_1.it)('should return a number', async () => {
        mockSwe.julday.mockReturnValue(2460000.5);
        const jd = await (0, planetPositions_1.dateToJulianDay)(2023, 2, 25, 12, 0, 0);
        (0, vitest_1.expect)(typeof jd).toBe('number');
    });
});
// ---------------------------------------------------------------------------
// calculatePlanetPositions
// ---------------------------------------------------------------------------
(0, vitest_1.describe)('calculatePlanetPositions', () => {
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.clearAllMocks();
        mockSwe.initSwissEph.mockResolvedValue(undefined);
        mockSwe.set_sid_mode.mockImplementation(() => { });
        // Default mock: return incrementing longitudes for 8 planets
        // Order: Sun, Moon, Mars, Mercury, Jupiter, Venus, Saturn, Rahu
        let callCount = 0;
        const longitudes = [10, 45, 100, 150, 200, 250, 300, 180];
        const speeds = [1.0, 13.0, 0.5, 1.2, 0.08, 1.1, 0.03, -0.05];
        mockSwe.calc.mockImplementation(() => {
            const idx = callCount % longitudes.length;
            callCount++;
            return {
                longitude: longitudes[idx],
                latitude: 0,
                longitudeSpeed: speeds[idx],
            };
        });
    });
    (0, vitest_1.it)('should return exactly 9 planet positions', async () => {
        const positions = await (0, planetPositions_1.calculatePlanetPositions)(2451545.0);
        (0, vitest_1.expect)(positions).toHaveLength(9);
    });
    (0, vitest_1.it)('should include all 9 Vedic planets', async () => {
        const positions = await (0, planetPositions_1.calculatePlanetPositions)(2451545.0);
        const planetNames = positions.map((p) => p.planet);
        (0, vitest_1.expect)(planetNames).toEqual([
            'Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu',
        ]);
    });
    (0, vitest_1.it)('should have valid longitude (0-360) for each planet', async () => {
        const positions = await (0, planetPositions_1.calculatePlanetPositions)(2451545.0);
        for (const pos of positions) {
            (0, vitest_1.expect)(pos.longitude).toBeGreaterThanOrEqual(0);
            (0, vitest_1.expect)(pos.longitude).toBeLessThan(360);
        }
    });
    (0, vitest_1.it)('should have a valid zodiac sign for each planet', async () => {
        const positions = await (0, planetPositions_1.calculatePlanetPositions)(2451545.0);
        for (const pos of positions) {
            (0, vitest_1.expect)(ZODIAC_SIGNS).toContain(pos.sign);
        }
    });
    (0, vitest_1.it)('should have a valid nakshatra for each planet', async () => {
        const positions = await (0, planetPositions_1.calculatePlanetPositions)(2451545.0);
        for (const pos of positions) {
            (0, vitest_1.expect)(NAKSHATRAS).toContain(pos.nakshatra);
        }
    });
    (0, vitest_1.it)('should have signIndex between 0 and 11', async () => {
        const positions = await (0, planetPositions_1.calculatePlanetPositions)(2451545.0);
        for (const pos of positions) {
            (0, vitest_1.expect)(pos.signIndex).toBeGreaterThanOrEqual(0);
            (0, vitest_1.expect)(pos.signIndex).toBeLessThanOrEqual(11);
        }
    });
    (0, vitest_1.it)('should have signDegree between 0 and 30', async () => {
        const positions = await (0, planetPositions_1.calculatePlanetPositions)(2451545.0);
        for (const pos of positions) {
            (0, vitest_1.expect)(pos.signDegree).toBeGreaterThanOrEqual(0);
            (0, vitest_1.expect)(pos.signDegree).toBeLessThan(30);
        }
    });
    (0, vitest_1.it)('should have nakshatraPada between 1 and 4', async () => {
        const positions = await (0, planetPositions_1.calculatePlanetPositions)(2451545.0);
        for (const pos of positions) {
            (0, vitest_1.expect)(pos.nakshatraPada).toBeGreaterThanOrEqual(1);
            (0, vitest_1.expect)(pos.nakshatraPada).toBeLessThanOrEqual(4);
        }
    });
    (0, vitest_1.it)('Rahu should always be retrograde (mean node speed is negative)', async () => {
        const positions = await (0, planetPositions_1.calculatePlanetPositions)(2451545.0);
        const rahu = positions.find((p) => p.planet === 'Rahu');
        // Mean node speed is negative in our mock (-0.05), so isRetrograde = true
        (0, vitest_1.expect)(rahu.isRetrograde).toBe(true);
    });
    (0, vitest_1.it)('Ketu should always be retrograde', async () => {
        const positions = await (0, planetPositions_1.calculatePlanetPositions)(2451545.0);
        const ketu = positions.find((p) => p.planet === 'Ketu');
        (0, vitest_1.expect)(ketu.isRetrograde).toBe(true);
    });
    (0, vitest_1.it)('Ketu longitude should be Rahu longitude + 180 (mod 360)', async () => {
        const positions = await (0, planetPositions_1.calculatePlanetPositions)(2451545.0);
        const rahu = positions.find((p) => p.planet === 'Rahu');
        const ketu = positions.find((p) => p.planet === 'Ketu');
        const expected = (rahu.longitude + 180) % 360;
        (0, vitest_1.expect)(ketu.longitude).toBeCloseTo(expected, 5);
    });
    (0, vitest_1.it)('should correctly map longitude to sign (e.g., 45 degrees = Taurus)', async () => {
        const positions = await (0, planetPositions_1.calculatePlanetPositions)(2451545.0);
        // Moon mock longitude = 45 -> sign index = floor(45/30) = 1 -> Taurus
        const moon = positions.find((p) => p.planet === 'Moon');
        (0, vitest_1.expect)(moon.sign).toBe('Taurus');
        (0, vitest_1.expect)(moon.signIndex).toBe(1);
        (0, vitest_1.expect)(moon.signDegree).toBeCloseTo(15, 5);
    });
    (0, vitest_1.it)('should correctly map longitude to nakshatra (0 degrees = Ashwini)', async () => {
        // Sun at 10 degrees -> floor(10 / 13.333) = 0 -> Ashwini
        const positions = await (0, planetPositions_1.calculatePlanetPositions)(2451545.0);
        const sun = positions.find((p) => p.planet === 'Sun');
        (0, vitest_1.expect)(sun.nakshatra).toBe('Ashwini');
    });
    (0, vitest_1.it)('should set sidereal mode before calculation', async () => {
        await (0, planetPositions_1.calculatePlanetPositions)(2451545.0, 'lahiri');
        (0, vitest_1.expect)(mockSwe.set_sid_mode).toHaveBeenCalledWith(1, 0, 0); // SE_SIDM_LAHIRI = 1
    });
    (0, vitest_1.it)('should support different ayanamsa systems', async () => {
        await (0, planetPositions_1.calculatePlanetPositions)(2451545.0, 'krishnamurti');
        (0, vitest_1.expect)(mockSwe.set_sid_mode).toHaveBeenCalledWith(5, 0, 0); // SE_SIDM_KRISHNAMURTI = 5
    });
});
//# sourceMappingURL=planetPositions.test.js.map