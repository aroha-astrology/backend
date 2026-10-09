import { describe, it, expect } from 'vitest';
import { calculateVimshottariDasha } from '../../src/lib/astro-engine/dashas/vimshottari.js';
import { dashaPeriodsInRange } from '../../src/lib/astro-engine/dashas/dasha-range.js';
import { calculateYoginiDasha } from '../../src/lib/astro-engine/dashas/yogini.js';
import { antarasBetween } from '../../src/lib/astro-engine/kp/kp-dasha.js';

// =============================================================================
// Audit items VM1, VM2 (docs/engine-audit/C-critical-corrections.md)
// =============================================================================
// Worked example. Moon at 6°40' Aries = exactly half way through Ashwini, so
// the birth Mahadasha is Ketu (7 years) with half elapsed: 3.5 years gone,
// 3.5 years left. Ketu's antardashas, in years from the START of the full
// Ketu period (each = 7 x lord's years / 120):
//   Ketu 0.40833 -> 0.40833      Venus 1.16667 -> 1.57500
//   Sun  0.35000 -> 1.92500      Moon  0.58333 -> 2.50833
//   Mars 0.40833 -> 2.91667      Rahu  1.05000 -> 3.96667
//   Jupiter 0.93333 -> 4.90000   Saturn 1.10833 -> 6.00833
//   Mercury 0.99167 -> 7.00000
// Birth falls at 3.5, inside Ketu-Rahu. So after birth:
//   Rahu until birth + 0.46667 y, then Jupiter until + 1.40000 y,
//   Saturn until + 2.50833 y, Mercury until + 3.5 y.
// =============================================================================

const MS_PER_YEAR = 365.25 * 86_400_000;
const MOON = 6 + 40 / 60;
const BIRTH = new Date(Date.UTC(2000, 0, 1, 0, 0, 0));
const after = (years: number) => new Date(BIRTH.getTime() + years * MS_PER_YEAR);

describe('[VM1] the birth Mahadasha keeps its full-length sub-periods', () => {
  it('the antardasha running at birth is Rahu, and it ends 0.46667 years later', () => {
    const tree = calculateVimshottariDasha(MOON, BIRTH, after(0.1));
    expect(tree.currentMahadasha.planet).toBe('Ketu');
    expect(tree.currentAntardasha.planet).toBe('Rahu');
    const endYears = (tree.currentAntardasha.endDate.getTime() - BIRTH.getTime()) / MS_PER_YEAR;
    expect(endYears).toBeCloseTo(0.46667, 4);
  });

  it('one year after birth the antardasha is Jupiter; three years after, Mercury', () => {
    expect(calculateVimshottariDasha(MOON, BIRTH, after(1)).currentAntardasha.planet).toBe(
      'Jupiter',
    );
    expect(calculateVimshottariDasha(MOON, BIRTH, after(3)).currentAntardasha.planet).toBe(
      'Mercury',
    );
  });

  it('the stored first Mahadasha still starts at birth and lasts 3.5 years', () => {
    const first = calculateVimshottariDasha(MOON, BIRTH, after(1)).mahadashas[0]!;
    expect(first.startDate.getTime()).toBe(BIRTH.getTime());
    expect((first.endDate.getTime() - BIRTH.getTime()) / MS_PER_YEAR).toBeCloseTo(3.5, 6);
    // No sub-period that ended before birth is listed.
    expect(first.subPeriods.map((p) => p.planet)).toEqual(['Rahu', 'Jupiter', 'Saturn', 'Mercury']);
  });

  it('a range lookup over the stored tree gives the same lords', () => {
    const { mahadashas } = calculateVimshottariDasha(MOON, BIRTH, after(50));
    const at = (years: number) =>
      dashaPeriodsInRange(mahadashas, after(years), new Date(after(years).getTime() + 1), 1)[0]
        ?.planet;
    expect(at(0.2)).toBe('Rahu');
    expect(at(1)).toBe('Jupiter');
    expect(at(2)).toBe('Saturn');
    expect(at(3)).toBe('Mercury');
  });

  it('agrees with the KP dasha engine, which was already anchored correctly', () => {
    const spans = antarasBetween(MOON, BIRTH.getTime(), BIRTH.getTime(), after(3.4).getTime());
    const kpAntarAt = (years: number) => {
      const iso = after(years).toISOString().slice(0, 10);
      return spans.find((s) => s.start <= iso && iso < s.end)?.ad;
    };
    const { mahadashas } = calculateVimshottariDasha(MOON, BIRTH, after(50));
    for (const years of [0.2, 0.9, 1.6, 2.4, 3.1]) {
      const ours = dashaPeriodsInRange(
        mahadashas,
        after(years),
        new Date(after(years).getTime() + 1),
        1,
      )[0]?.planet;
      expect(ours).toBe(kpAntarAt(years));
    }
  });
});

describe('[VM1] Yogini: the birth period keeps its full-length sub-periods too', () => {
  // Ashwini is star 1: (1 + 3) mod 8 = 4 -> Bhramari (Mars), 4 years, half gone.
  // Bhramari's sub-periods from the start of the full 4 years (4 x n / 36):
  //   Bhramari 0.44444 -> 0.44444   Bhadrika 0.55556 -> 1.00000
  //   Ulka 0.66667 -> 1.66667       Siddha 0.77778 -> 2.44444
  //   Sankata 0.88889 -> 3.33333    Mangala 0.11111 -> 3.44444 ...
  // Birth falls at 2.0, inside Siddha (Venus), which ends 0.44444 years after birth.
  it('the sub-period running at birth is Siddha (Venus)', () => {
    const tree = calculateYoginiDasha(MOON, BIRTH, after(0.1));
    expect(tree.currentYogini.planet).toBe('Mars');
    const running = tree.currentYogini.subPeriods.find((p) => p.isActive)!;
    expect(running.planet).toBe('Venus');
    expect((running.endDate.getTime() - BIRTH.getTime()) / MS_PER_YEAR).toBeCloseTo(0.44444, 4);
  });
});
