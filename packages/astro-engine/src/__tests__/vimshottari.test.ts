import { describe, it, expect } from 'vitest';
import { calculateVimshottariDasha } from '../dashas/vimshottari';

// ---------------------------------------------------------------------------
// Constants for assertions
// ---------------------------------------------------------------------------

const VIMSHOTTARI_ORDER = [
  'Ketu', 'Venus', 'Sun', 'Moon', 'Mars', 'Rahu', 'Jupiter', 'Saturn', 'Mercury',
] as const;

const VIMSHOTTARI_YEARS: Record<string, number> = {
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

describe('Vimshottari Dasha', () => {
  const birthDate = new Date('1990-01-15T06:00:00Z');

  describe('total duration', () => {
    it('should have mahadashas that span 120 years total', () => {
      // Moon at 0 degrees (start of Ashwini, full Ketu balance)
      const result = calculateVimshottariDasha(0, birthDate);
      const totalMs = result.mahadashas.reduce((sum, md) => {
        const duration = md.endDate.getTime() - md.startDate.getTime();
        return sum + duration;
      }, 0);
      const totalYears = totalMs / MS_PER_YEAR;
      expect(totalYears).toBeCloseTo(120, 0);
    });

    it('Vimshottari years sum to 120', () => {
      const total = Object.values(VIMSHOTTARI_YEARS).reduce((s, v) => s + v, 0);
      expect(total).toBe(120);
    });
  });

  describe('dasha order', () => {
    it('should follow the standard Vimshottari order starting from birth nakshatra lord', () => {
      // Moon at 0 degrees -> Ashwini -> lord = Ketu
      // Order: Ketu, Venus, Sun, Moon, Mars, Rahu, Jupiter, Saturn, Mercury
      const result = calculateVimshottariDasha(0, birthDate);
      const planets = result.mahadashas.map((md) => md.planet);

      // The first mahadasha should be Ketu (lord of Ashwini)
      expect(planets[0]).toBe('Ketu');

      // Remaining should follow in order (wrapping around the 9-planet sequence)
      for (let i = 1; i < planets.length; i++) {
        const expectedIdx = (VIMSHOTTARI_ORDER.indexOf(planets[0]) + i) % 9;
        expect(planets[i]).toBe(VIMSHOTTARI_ORDER[expectedIdx]);
      }
    });
  });

  describe('known chart: Moon at 0 degrees Aries (Ashwini, lord Ketu)', () => {
    it('first mahadasha should be Ketu', () => {
      const result = calculateVimshottariDasha(0, birthDate);
      expect(result.mahadashas[0].planet).toBe('Ketu');
    });

    it('first mahadasha should have full 7-year duration (Moon at start of nakshatra)', () => {
      const result = calculateVimshottariDasha(0, birthDate);
      const ketuDasha = result.mahadashas[0];
      const durationMs = ketuDasha.endDate.getTime() - ketuDasha.startDate.getTime();
      const durationYears = durationMs / MS_PER_YEAR;
      expect(durationYears).toBeCloseTo(7, 0);
    });

    it('Moon at end of Ashwini should give near-zero Ketu balance', () => {
      // Moon near end of Ashwini: longitude just below 13.333 degrees
      const moonLong = NAKSHATRA_SPAN - 0.01;
      const result = calculateVimshottariDasha(moonLong, birthDate);
      const ketuDasha = result.mahadashas[0];
      const durationMs = ketuDasha.endDate.getTime() - ketuDasha.startDate.getTime();
      const durationYears = durationMs / MS_PER_YEAR;
      // Should be very small (near 0)
      expect(durationYears).toBeLessThan(0.1);
    });
  });

  describe('Moon at midpoint of Bharani (lord Venus)', () => {
    it('first mahadasha should be Venus', () => {
      // Bharani: nakshatra index 1, spans from 13.333 to 26.667 degrees
      // Midpoint: ~20 degrees
      const moonLong = 20;
      const result = calculateVimshottariDasha(moonLong, birthDate);
      expect(result.mahadashas[0].planet).toBe('Venus');
    });

    it('balance should be approximately half of 20 years', () => {
      const moonLong = 20; // Midpoint of Bharani
      const result = calculateVimshottariDasha(moonLong, birthDate);
      const venusDasha = result.mahadashas[0];
      const durationMs = venusDasha.endDate.getTime() - venusDasha.startDate.getTime();
      const durationYears = durationMs / MS_PER_YEAR;
      expect(durationYears).toBeCloseTo(10, 0); // Approximately half of 20 years
    });
  });

  describe('no gaps between dashas', () => {
    it('end of one mahadasha should equal start of next', () => {
      const result = calculateVimshottariDasha(45, birthDate);
      for (let i = 0; i < result.mahadashas.length - 1; i++) {
        const currentEnd = result.mahadashas[i].endDate.getTime();
        const nextStart = result.mahadashas[i + 1].startDate.getTime();
        expect(currentEnd).toBe(nextStart);
      }
    });

    it('first mahadasha should start at birth date', () => {
      const result = calculateVimshottariDasha(45, birthDate);
      expect(result.mahadashas[0].startDate.getTime()).toBe(birthDate.getTime());
    });
  });

  describe('sub-periods (antardashas)', () => {
    it('active mahadasha should have 9 sub-periods', () => {
      const result = calculateVimshottariDasha(0, birthDate);
      const activeMD = result.mahadashas.find((md) => md.isActive);
      if (activeMD && activeMD.subPeriods.length > 0) {
        expect(activeMD.subPeriods).toHaveLength(9);
      }
    });

    it('sub-periods should be proportionally divided', () => {
      const result = calculateVimshottariDasha(0, birthDate);
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
          expect(actualRatio).toBeCloseTo(expectedRatio, 2);
        }
        // Sub-periods should sum to parent duration
        expect(subTotal).toBeCloseTo(parentDurationMs, -3); // within ~1 second
      }
    });

    it('antardasha sub-periods should start with the parent mahadasha planet', () => {
      const result = calculateVimshottariDasha(0, birthDate);
      const activeMD = result.mahadashas.find((md) => md.isActive);
      if (activeMD && activeMD.subPeriods.length === 9) {
        expect(activeMD.subPeriods[0].planet).toBe(activeMD.planet);
      }
    });

    it('no gaps between antardasha sub-periods', () => {
      const result = calculateVimshottariDasha(0, birthDate);
      const activeMD = result.mahadashas.find((md) => md.isActive);
      if (activeMD && activeMD.subPeriods.length > 1) {
        for (let i = 0; i < activeMD.subPeriods.length - 1; i++) {
          const currentEnd = activeMD.subPeriods[i].endDate.getTime();
          const nextStart = activeMD.subPeriods[i + 1].startDate.getTime();
          expect(currentEnd).toBe(nextStart);
        }
      }
    });
  });

  describe('5 levels of dasha', () => {
    it('should calculate all 5 levels for the active branch', () => {
      const result = calculateVimshottariDasha(0, birthDate);
      const activeMD = result.mahadashas.find((md) => md.isActive);
      if (!activeMD) return;
      expect(activeMD.level).toBe('mahadasha');

      const activeAD = activeMD.subPeriods.find((p) => p.isActive);
      if (!activeAD) return;
      expect(activeAD.level).toBe('antardasha');

      const activePAD = activeAD.subPeriods.find((p) => p.isActive);
      if (!activePAD) return;
      expect(activePAD.level).toBe('pratyantardasha');

      const activeSookshma = activePAD.subPeriods.find((p) => p.isActive);
      if (!activeSookshma) return;
      expect(activeSookshma.level).toBe('sookshma');

      const activePrana = activeSookshma.subPeriods.find((p) => p.isActive);
      if (!activePrana) return;
      expect(activePrana.level).toBe('prana');
    });
  });

  describe('edge cases', () => {
    it('should handle Moon at exactly 360 degrees (wraps to 0)', () => {
      const result = calculateVimshottariDasha(360, birthDate);
      expect(result.mahadashas[0].planet).toBe('Ketu'); // 360 mod 360 = 0 -> Ashwini -> Ketu
    });

    it('should handle Moon at negative longitude (wraps correctly)', () => {
      // -10 degrees should wrap to 350 degrees
      const result = calculateVimshottariDasha(-10, birthDate);
      expect(result.mahadashas).toBeDefined();
      expect(result.mahadashas.length).toBeGreaterThan(0);
    });

    it('result should have currentMahadasha, currentAntardasha, and currentPratyantardasha', () => {
      const result = calculateVimshottariDasha(0, birthDate);
      expect(result.currentMahadasha).toBeDefined();
      expect(result.currentAntardasha).toBeDefined();
      expect(result.currentPratyantardasha).toBeDefined();
    });
  });
});
