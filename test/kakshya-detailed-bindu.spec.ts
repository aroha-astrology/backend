import { describe, it, expect } from 'vitest';
import {
  getKakshya,
  checkKakshyaBindu,
  dailyKakshyaScore,
  KAKSHYA_LORDS,
  KAKSHYA_SPAN,
  type DetailedBhinnaAshtakavarga,
} from '../src/lib/astro-tools/kakshya.js';
import {
  calculateBhinnaAshtakavarga,
  calculateBhinnaAshtakavargaDetailed,
} from '../src/lib/astro-engine/index.js';
import type { ChartData } from '@aroha-astrology/shared';

const CHART: ChartData = {
  planets: [
    { planet: 'Sun', signIndex: 0, longitude: 5 },
    { planet: 'Moon', signIndex: 1, longitude: 35 },
    { planet: 'Mars', signIndex: 2, longitude: 65 },
    { planet: 'Mercury', signIndex: 3, longitude: 95 },
    { planet: 'Jupiter', signIndex: 4, longitude: 125 },
    { planet: 'Venus', signIndex: 5, longitude: 155 },
    { planet: 'Saturn', signIndex: 6, longitude: 185 },
  ],
  ascendant: { signIndex: 0, degree: 10 },
} as unknown as ChartData;

describe('calculateBhinnaAshtakavargaDetailed', () => {
  it('sums to the same per-sign totals as the raw (collapsed) calculation', () => {
    const raw = calculateBhinnaAshtakavarga(CHART);
    const detailed = calculateBhinnaAshtakavargaDetailed(CHART);
    expect(detailed).toHaveLength(raw.length);

    for (const rawEntry of raw) {
      const detailedEntry = detailed.find((d) => d.planet === rawEntry.planet)!;
      expect(detailedEntry).toBeDefined();
      for (let signIdx = 0; signIdx < 12; signIdx++) {
        const summedFromContributors = Object.values(detailedEntry.contributions).reduce(
          (sum, arr) => sum + (arr[signIdx] ?? 0),
          0,
        );
        expect(summedFromContributors).toBe(rawEntry.bindus[signIdx]);
      }
    }
  });

  it('every contributor bindu value is exactly 0 or 1', () => {
    const detailed = calculateBhinnaAshtakavargaDetailed(CHART);
    for (const entry of detailed) {
      for (const bindus of Object.values(entry.contributions)) {
        for (const v of bindus) {
          expect([0, 1]).toContain(v);
        }
      }
    }
  });
});

describe('checkKakshyaBindu: real compartment-lord lookup (Phase 1.2 fix)', () => {
  it('reports favorable only when the SPECIFIC kakshya-lord contributor gave a bindu, not just any bindu in the sign', () => {
    const detailed: DetailedBhinnaAshtakavarga[] = [
      {
        planet: 'Sun',
        contributions: {
          Saturn: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // Saturn gives NO bindu to Sun in sign 0
          Jupiter: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // Jupiter DOES, in sign 0
          Mars: new Array(12).fill(0),
          Sun: new Array(12).fill(0),
          Mercury: new Array(12).fill(0),
          Venus: new Array(12).fill(0),
          Moon: new Array(12).fill(0),
          Asc: new Array(12).fill(0),
        },
      },
    ];

    // Kakshya 0 (0-3.75 deg into sign 0) is Saturn's compartment -> Saturn gave nothing -> unfavorable,
    // even though the sign's total bindus (from Jupiter) is 1.
    const inSaturnCompartment = checkKakshyaBindu('Sun', 1.0, detailed);
    expect(inSaturnCompartment.kakshya.kakshyaLord).toBe('Saturn');
    expect(inSaturnCompartment.kakshyaLordHasBindu).toBe(false);
    expect(inSaturnCompartment.quality).toBe('unfavorable');
    expect(inSaturnCompartment.bindusInSign).toBe(1); // whole-sign total is still reported

    // Kakshya 1 (3.75-7.5 deg) is Jupiter's compartment -> Jupiter DID give a bindu -> favorable.
    const inJupiterCompartment = checkKakshyaBindu('Sun', 5.0, detailed);
    expect(inJupiterCompartment.kakshya.kakshyaLord).toBe('Jupiter');
    expect(inJupiterCompartment.kakshyaLordHasBindu).toBe(true);
    expect(inJupiterCompartment.quality).toBe('favorable');
  });

  it('flips favorable/unfavorable as the SAME planet crosses a kakshya boundary within the SAME sign — proof the shortcut (>=4 bindus in the whole sign) is gone', () => {
    const detailed: DetailedBhinnaAshtakavarga[] = [
      {
        planet: 'Moon',
        contributions: {
          Saturn: new Array(12).fill(0), // no bindu at all from Saturn anywhere
          Jupiter: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
          Mars: new Array(12).fill(0),
          Sun: new Array(12).fill(0),
          Mercury: new Array(12).fill(0),
          Venus: new Array(12).fill(0),
          Moon: new Array(12).fill(0),
          Asc: new Array(12).fill(0),
        },
      },
    ];
    // Still sign 0 in both cases (0-30 deg), whole-sign total bindus = 1 the
    // whole time — the OLD (>=4-bindu-in-sign) shortcut would call both of
    // these "unfavorable" identically, since 1 < 4. The real per-compartment
    // rule instead differs between them.
    const saturnCompartment = checkKakshyaBindu('Moon', 1.0, detailed); // kakshya 0 = Saturn
    const jupiterCompartment = checkKakshyaBindu('Moon', 5.0, detailed); // kakshya 1 = Jupiter
    expect(saturnCompartment.quality).toBe('unfavorable');
    expect(jupiterCompartment.quality).toBe('favorable');
    expect(saturnCompartment.quality).not.toBe(jupiterCompartment.quality);
  });
});

describe('getKakshya boundary math (unchanged, sanity check)', () => {
  it('assigns kakshya lords in the fixed Saturn..Asc order across the 8 compartments', () => {
    for (let i = 0; i < 8; i++) {
      const info = getKakshya(i * KAKSHYA_SPAN + 1); // 1 degree into sign 0's i-th kakshya
      expect(info.kakshyaIndex).toBe(i);
      expect(info.kakshyaLord).toBe(KAKSHYA_LORDS[i]);
      expect(info.signIndex).toBe(0);
    }
  });
});

describe('dailyKakshyaScore with detailed data', () => {
  it('counts activeBindus only for planets whose current compartment lord actually gave them a bindu', () => {
    const detailed: DetailedBhinnaAshtakavarga[] = [
      {
        planet: 'Sun',
        contributions: { Saturn: [1, ...new Array(11).fill(0)] },
      },
      {
        planet: 'Moon',
        contributions: { Saturn: new Array(12).fill(0) },
      },
    ];
    // Both at longitude 1.0 -> kakshya 0 -> Saturn's compartment.
    const score = dailyKakshyaScore({ Sun: 1.0, Moon: 1.0 }, detailed);
    expect(score.activeBindus).toBe(1);
    expect(score.details.find((d) => d.planet === 'Sun')!.binduActive).toBe(true);
    expect(score.details.find((d) => d.planet === 'Moon')!.binduActive).toBe(false);
  });
});
