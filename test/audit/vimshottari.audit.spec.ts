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

// =============================================================================
// BPHS chapter 46 (verses 12-16) and chapter 51 (verse 1): register rows
// BPHS-46.12-16 and BPHS-51.1. The engine already matched the book; these tests
// pin it so a later edit cannot move it.
// =============================================================================

const NAKSHATRA_SPAN = 360 / 27;

describe('[BPHS-46.12-15] the Vimshottari lords and years', () => {
  // The book's own table, in its own order (it starts at Krittika). Each row
  // lists the three stars of one lord, written as 0-based star numbers counted
  // from Ashwini = 0.
  const TABLE: Array<[string, number, number[]]> = [
    ['Sun', 6, [2, 11, 20]], // Krittika, Uttara Phalguni, Uttara Ashadha
    ['Moon', 10, [3, 12, 21]], // Rohini, Hasta, Shravana
    ['Mars', 7, [4, 13, 22]], // Mrigashira, Chitra, Dhanishta
    ['Rahu', 18, [5, 14, 23]], // Ardra, Swati, Shatabhisha
    ['Jupiter', 16, [6, 15, 24]], // Punarvasu, Vishakha, Purva Bhadrapada
    ['Saturn', 19, [7, 16, 25]], // Pushya, Anuradha, Uttara Bhadrapada
    ['Mercury', 17, [8, 17, 26]], // Ashlesha, Jyeshtha, Revati
    ['Ketu', 7, [9, 18, 0]], // Magha, Moola, Ashwini
    ['Venus', 20, [10, 19, 1]], // Purva Phalguni, Purva Ashadha, Bharani
  ];

  it('every one of the 27 stars starts the dasha of the lord the book names', () => {
    for (const [lord, , stars] of TABLE) {
      for (const star of stars) {
        const moon = star * NAKSHATRA_SPAN + NAKSHATRA_SPAN / 2;
        const tree = calculateVimshottariDasha(moon, BIRTH, BIRTH);
        expect(tree.mahadashas[0]!.planet, `star ${star}`).toBe(lord);
      }
    }
  });

  it('the dasha years are 6, 10, 7, 18, 16, 19, 17, 7, 20 and total 120', () => {
    expect(TABLE.reduce((sum, [, years]) => sum + years, 0)).toBe(120);
    // A Moon at the very start of a star (a hair past the boundary) leaves the lord's whole dasha.
    for (const [lord, years, stars] of TABLE) {
      const tree = calculateVimshottariDasha(stars[0]! * NAKSHATRA_SPAN + 1e-9, BIRTH, BIRTH);
      const first = tree.mahadashas[0]!;
      expect(first.planet).toBe(lord);
      expect((first.endDate.getTime() - first.startDate.getTime()) / MS_PER_YEAR).toBeCloseTo(
        years,
        6,
      );
    }
  });

  it('the dashas follow each other in the book order, from the first lord', () => {
    const order = ['Sun', 'Moon', 'Mars', 'Rahu', 'Jupiter', 'Saturn', 'Mercury', 'Ketu', 'Venus'];
    const tree = calculateVimshottariDasha(2 * NAKSHATRA_SPAN, BIRTH, BIRTH); // Krittika
    expect(tree.mahadashas.slice(0, 9).map((p) => p.planet)).toEqual(order);
  });
});

describe('[BPHS-46.16] the balance of the dasha at birth', () => {
  // The book's example: birth in Mrigashira, lord Mars (7 years). The Moon has
  // covered 58 ghatis 15 palas of the star's 59 ghatis 31 palas.
  //   58 x 60 + 15 = 3495 palas elapsed; 59 x 60 + 31 = 3571 palas in all.
  //   Balance = 7 x (3571 - 3495) / 3571 = 7 x 76 / 3571 = 0.148978 years.
  // The book prints 3415 for the elapsed palas and 24435 for 7 x 3415 (7 x 3415
  // is 23,905 and 7 x 3495 is 24,465). Its final balance, 1 month 23 days 37
  // ghatis 55 palas, is what 3495 gives, so the figure is a print slip and the
  // arithmetic above is the one used here.
  const ELAPSED = 58 * 60 + 15;
  const WHOLE = 59 * 60 + 31;
  const moon = 4 * NAKSHATRA_SPAN + NAKSHATRA_SPAN * (ELAPSED / WHOLE);

  it('the lord is Mars and the balance is 7 x 76 / 3571 years', () => {
    const tree = calculateVimshottariDasha(moon, BIRTH, BIRTH);
    const first = tree.mahadashas[0]!;
    expect(first.planet).toBe('Mars');
    const balance = (first.endDate.getTime() - BIRTH.getTime()) / MS_PER_YEAR;
    expect(balance).toBeCloseTo((7 * 76) / 3571, 6);
  });

  it('the balance is about 1 month 23 days on the book 360-day year', () => {
    const tree = calculateVimshottariDasha(moon, BIRTH, BIRTH);
    const days = ((tree.mahadashas[0]!.endDate.getTime() - BIRTH.getTime()) / MS_PER_YEAR) * 360;
    // 1 month 23 days 37 ghatis 55 palas = 53 days + (37 x 60 + 55) / 3600 day.
    expect(days).toBeCloseTo(53 + (37 * 60 + 55) / 3600, 1);
  });
});

describe('[BPHS-51.1] the sub-period is dasha years x sub-lord years / 120', () => {
  // Moon at the start of Ashwini: Ketu 7, Venus 20, Sun 6, Moon 10, Mars 7,
  // Rahu 18, Jupiter 16 = 84 years, so Saturn's dasha runs from year 84 to 103.
  const tree = calculateVimshottariDasha(0, BIRTH, after(90));
  const saturn = tree.currentMahadasha;
  const years = (p: { startDate: Date; endDate: Date }) =>
    (p.endDate.getTime() - p.startDate.getTime()) / MS_PER_YEAR;

  it('Saturn is running and starts with Saturn itself: 19 x 19 / 120', () => {
    expect(saturn.planet).toBe('Saturn');
    expect(saturn.subPeriods[0]!.planet).toBe('Saturn');
    expect(years(saturn.subPeriods[0]!)).toBeCloseTo((19 * 19) / 120, 6);
  });

  it('Mercury in Saturn is 17 x 19 / 120 = 323 / 120 years (2 years 8 months 9 days)', () => {
    const mercury = saturn.subPeriods[1]!;
    expect(mercury.planet).toBe('Mercury');
    expect(years(mercury)).toBeCloseTo(323 / 120, 6);
    // The book: 32.3 months = 32 months and 9 days.
    expect(years(mercury) * 12).toBeCloseTo(32.3, 1);
  });

  it('Venus in Venus is 3 years 4 months (20 x 20 / 120)', () => {
    const venus = calculateVimshottariDasha(0, BIRTH, after(10)).currentMahadasha;
    expect(venus.planet).toBe('Venus');
    expect(years(venus.subPeriods[0]!)).toBeCloseTo(400 / 120, 6);
  });

  it('the nine sub-periods fill the dasha exactly', () => {
    const sum = saturn.subPeriods.reduce((s, p) => s + years(p), 0);
    expect(sum).toBeCloseTo(19, 6);
  });
});

describe('[BPHS-46.195-199] the Yogini dasha starts from (star number + 3) mod 8', () => {
  // The book's example: Mrigashira is star 5 (1-based); 5 + 3 = 8; the remainder
  // is 0, meaning the 8th Yogini, Sankata, whose planet is Rahu (8 years).
  // Ardra is star 6; 6 + 3 = 9; remainder 1 = Mangala, whose planet is the Moon.
  // The order of the Yoginis' planets: Moon, Sun, Jupiter, Mars, Mercury, Saturn,
  // Venus, Rahu, with 1 to 8 years.
  it('Mrigashira begins in Sankata (Rahu)', () => {
    const tree = calculateYoginiDasha(4 * NAKSHATRA_SPAN + 0.5, BIRTH, BIRTH);
    expect(tree.currentYogini.planet).toBe('Rahu');
  });

  it('Ardra begins in Mangala (Moon)', () => {
    const tree = calculateYoginiDasha(5 * NAKSHATRA_SPAN + 0.5, BIRTH, BIRTH);
    expect(tree.currentYogini.planet).toBe('Moon');
  });

  it('the eight planets follow in the book order, 1 to 8 years', () => {
    const tree = calculateYoginiDasha(5 * NAKSHATRA_SPAN + 1e-6, BIRTH, BIRTH);
    const firstEight = tree.yoginis.slice(0, 8);
    expect(firstEight.map((p) => p.planet)).toEqual([
      'Moon',
      'Sun',
      'Jupiter',
      'Mars',
      'Mercury',
      'Saturn',
      'Venus',
      'Rahu',
    ]);
  });
});
