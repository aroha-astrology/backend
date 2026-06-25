"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const vimshottari_1 = require("../dashas/vimshottari");
// ---------------------------------------------------------------------------
// Constants for assertions
// ---------------------------------------------------------------------------
const VIMSHOTTARI_ORDER = [
    'Ketu', 'Venus', 'Sun', 'Moon', 'Mars', 'Rahu', 'Jupiter', 'Saturn', 'Mercury',
];
const VIMSHOTTARI_YEARS = {
    Ketu: 7, Venus: 20, Sun: 6, Moon: 10, Mars: 7,
    Rahu: 18, Jupiter: 16, Saturn: 19, Mercury: 17,
};
const NAKSHATRA_SPAN = 13 + 1 / 3; // 13.3333... degrees
const MS_PER_DAY = 86_400_000;
const DAYS_PER_YEAR = 365.25;
const MS_PER_YEAR = DAYS_PER_YEAR * MS_PER_DAY;
// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
(0, vitest_1.describe)('Vimshottari Dasha', () => {
    const birthDate = new Date('1990-01-15T06:00:00Z');
    (0, vitest_1.describe)('total duration', () => {
        (0, vitest_1.it)('should have mahadashas that span 120 years total', () => {
            // Moon at 0 degrees (start of Ashwini, full Ketu balance)
            const result = (0, vimshottari_1.calculateVimshottariDasha)(0, birthDate);
            const totalMs = result.mahadashas.reduce((sum, md) => {
                const duration = md.endDate.getTime() - md.startDate.getTime();
                return sum + duration;
            }, 0);
            const totalYears = totalMs / MS_PER_YEAR;
            (0, vitest_1.expect)(totalYears).toBeCloseTo(120, 0);
        });
        (0, vitest_1.it)('Vimshottari years sum to 120', () => {
            const total = Object.values(VIMSHOTTARI_YEARS).reduce((s, v) => s + v, 0);
            (0, vitest_1.expect)(total).toBe(120);
        });
    });
    (0, vitest_1.describe)('dasha order', () => {
        (0, vitest_1.it)('should follow the standard Vimshottari order starting from birth nakshatra lord', () => {
            // Moon at 0 degrees -> Ashwini -> lord = Ketu
            // Order: Ketu, Venus, Sun, Moon, Mars, Rahu, Jupiter, Saturn, Mercury
            const result = (0, vimshottari_1.calculateVimshottariDasha)(0, birthDate);
            const planets = result.mahadashas.map((md) => md.planet);
            // The first mahadasha should be Ketu (lord of Ashwini)
            (0, vitest_1.expect)(planets[0]).toBe('Ketu');
            // Remaining should follow in order (wrapping around the 9-planet sequence)
            for (let i = 1; i < planets.length; i++) {
                const expectedIdx = (VIMSHOTTARI_ORDER.indexOf(planets[0]) + i) % 9;
                (0, vitest_1.expect)(planets[i]).toBe(VIMSHOTTARI_ORDER[expectedIdx]);
            }
        });
    });
    (0, vitest_1.describe)('known chart: Moon at 0 degrees Aries (Ashwini, lord Ketu)', () => {
        (0, vitest_1.it)('first mahadasha should be Ketu', () => {
            const result = (0, vimshottari_1.calculateVimshottariDasha)(0, birthDate);
            (0, vitest_1.expect)(result.mahadashas[0].planet).toBe('Ketu');
        });
        (0, vitest_1.it)('first mahadasha should have full 7-year duration (Moon at start of nakshatra)', () => {
            const result = (0, vimshottari_1.calculateVimshottariDasha)(0, birthDate);
            const ketuDasha = result.mahadashas[0];
            const durationMs = ketuDasha.endDate.getTime() - ketuDasha.startDate.getTime();
            const durationYears = durationMs / MS_PER_YEAR;
            (0, vitest_1.expect)(durationYears).toBeCloseTo(7, 0);
        });
        (0, vitest_1.it)('Moon at end of Ashwini should give near-zero Ketu balance', () => {
            // Moon near end of Ashwini: longitude just below 13.333 degrees
            const moonLong = NAKSHATRA_SPAN - 0.01;
            const result = (0, vimshottari_1.calculateVimshottariDasha)(moonLong, birthDate);
            const ketuDasha = result.mahadashas[0];
            const durationMs = ketuDasha.endDate.getTime() - ketuDasha.startDate.getTime();
            const durationYears = durationMs / MS_PER_YEAR;
            // Should be very small (near 0)
            (0, vitest_1.expect)(durationYears).toBeLessThan(0.1);
        });
    });
    (0, vitest_1.describe)('Moon at midpoint of Bharani (lord Venus)', () => {
        (0, vitest_1.it)('first mahadasha should be Venus', () => {
            // Bharani: nakshatra index 1, spans from 13.333 to 26.667 degrees
            // Midpoint: ~20 degrees
            const moonLong = 20;
            const result = (0, vimshottari_1.calculateVimshottariDasha)(moonLong, birthDate);
            (0, vitest_1.expect)(result.mahadashas[0].planet).toBe('Venus');
        });
        (0, vitest_1.it)('balance should be approximately half of 20 years', () => {
            const moonLong = 20; // Midpoint of Bharani
            const result = (0, vimshottari_1.calculateVimshottariDasha)(moonLong, birthDate);
            const venusDasha = result.mahadashas[0];
            const durationMs = venusDasha.endDate.getTime() - venusDasha.startDate.getTime();
            const durationYears = durationMs / MS_PER_YEAR;
            (0, vitest_1.expect)(durationYears).toBeCloseTo(10, 0); // Approximately half of 20 years
        });
    });
    (0, vitest_1.describe)('no gaps between dashas', () => {
        (0, vitest_1.it)('end of one mahadasha should equal start of next', () => {
            const result = (0, vimshottari_1.calculateVimshottariDasha)(45, birthDate);
            for (let i = 0; i < result.mahadashas.length - 1; i++) {
                const currentEnd = result.mahadashas[i].endDate.getTime();
                const nextStart = result.mahadashas[i + 1].startDate.getTime();
                (0, vitest_1.expect)(currentEnd).toBe(nextStart);
            }
        });
        (0, vitest_1.it)('first mahadasha should start at birth date', () => {
            const result = (0, vimshottari_1.calculateVimshottariDasha)(45, birthDate);
            (0, vitest_1.expect)(result.mahadashas[0].startDate.getTime()).toBe(birthDate.getTime());
        });
    });
    (0, vitest_1.describe)('sub-periods (antardashas)', () => {
        (0, vitest_1.it)('active mahadasha should have 9 sub-periods', () => {
            const result = (0, vimshottari_1.calculateVimshottariDasha)(0, birthDate);
            const activeMD = result.mahadashas.find((md) => md.isActive);
            if (activeMD && activeMD.subPeriods.length > 0) {
                (0, vitest_1.expect)(activeMD.subPeriods).toHaveLength(9);
            }
        });
        (0, vitest_1.it)('sub-periods should be proportionally divided', () => {
            const result = (0, vimshottari_1.calculateVimshottariDasha)(0, birthDate);
            const activeMD = result.mahadashas.find((md) => md.isActive);
            if (activeMD && activeMD.subPeriods.length === 9) {
                const parentDurationMs = activeMD.endDate.getTime() - activeMD.startDate.getTime();
                let subTotal = 0;
                for (const sub of activeMD.subPeriods) {
                    const subDurationMs = sub.endDate.getTime() - sub.startDate.getTime();
                    subTotal += subDurationMs;
                    // Check proportionality: sub duration / parent duration ~ subPlanet years / 120
                    const expectedRatio = VIMSHOTTARI_YEARS[sub.planet] / 120;
                    const actualRatio = subDurationMs / parentDurationMs;
                    (0, vitest_1.expect)(actualRatio).toBeCloseTo(expectedRatio, 2);
                }
                // Sub-periods should sum to parent duration
                (0, vitest_1.expect)(subTotal).toBeCloseTo(parentDurationMs, -3); // within ~1 second
            }
        });
        (0, vitest_1.it)('antardasha sub-periods should start with the parent mahadasha planet', () => {
            const result = (0, vimshottari_1.calculateVimshottariDasha)(0, birthDate);
            const activeMD = result.mahadashas.find((md) => md.isActive);
            if (activeMD && activeMD.subPeriods.length === 9) {
                (0, vitest_1.expect)(activeMD.subPeriods[0].planet).toBe(activeMD.planet);
            }
        });
        (0, vitest_1.it)('no gaps between antardasha sub-periods', () => {
            const result = (0, vimshottari_1.calculateVimshottariDasha)(0, birthDate);
            const activeMD = result.mahadashas.find((md) => md.isActive);
            if (activeMD && activeMD.subPeriods.length > 1) {
                for (let i = 0; i < activeMD.subPeriods.length - 1; i++) {
                    const currentEnd = activeMD.subPeriods[i].endDate.getTime();
                    const nextStart = activeMD.subPeriods[i + 1].startDate.getTime();
                    (0, vitest_1.expect)(currentEnd).toBe(nextStart);
                }
            }
        });
    });
    (0, vitest_1.describe)('5 levels of dasha', () => {
        (0, vitest_1.it)('should calculate all 5 levels for the active branch', () => {
            const result = (0, vimshottari_1.calculateVimshottariDasha)(0, birthDate);
            const activeMD = result.mahadashas.find((md) => md.isActive);
            if (!activeMD)
                return;
            (0, vitest_1.expect)(activeMD.level).toBe('mahadasha');
            const activeAD = activeMD.subPeriods.find((p) => p.isActive);
            if (!activeAD)
                return;
            (0, vitest_1.expect)(activeAD.level).toBe('antardasha');
            const activePAD = activeAD.subPeriods.find((p) => p.isActive);
            if (!activePAD)
                return;
            (0, vitest_1.expect)(activePAD.level).toBe('pratyantardasha');
            const activeSookshma = activePAD.subPeriods.find((p) => p.isActive);
            if (!activeSookshma)
                return;
            (0, vitest_1.expect)(activeSookshma.level).toBe('sookshma');
            const activePrana = activeSookshma.subPeriods.find((p) => p.isActive);
            if (!activePrana)
                return;
            (0, vitest_1.expect)(activePrana.level).toBe('prana');
        });
    });
    (0, vitest_1.describe)('edge cases', () => {
        (0, vitest_1.it)('should handle Moon at exactly 360 degrees (wraps to 0)', () => {
            const result = (0, vimshottari_1.calculateVimshottariDasha)(360, birthDate);
            (0, vitest_1.expect)(result.mahadashas[0].planet).toBe('Ketu'); // 360 mod 360 = 0 -> Ashwini -> Ketu
        });
        (0, vitest_1.it)('should handle Moon at negative longitude (wraps correctly)', () => {
            // -10 degrees should wrap to 350 degrees
            const result = (0, vimshottari_1.calculateVimshottariDasha)(-10, birthDate);
            (0, vitest_1.expect)(result.mahadashas).toBeDefined();
            (0, vitest_1.expect)(result.mahadashas.length).toBeGreaterThan(0);
        });
        (0, vitest_1.it)('result should have currentMahadasha, currentAntardasha, and currentPratyantardasha', () => {
            const result = (0, vimshottari_1.calculateVimshottariDasha)(0, birthDate);
            (0, vitest_1.expect)(result.currentMahadasha).toBeDefined();
            (0, vitest_1.expect)(result.currentAntardasha).toBeDefined();
            (0, vitest_1.expect)(result.currentPratyantardasha).toBeDefined();
        });
    });
});
//# sourceMappingURL=vimshottari.test.js.map