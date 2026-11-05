import { describe, it, expect } from 'vitest';
import { detectMangalDosha } from '../../src/lib/astro-engine/doshas/mangalDosha.js';
import { withLiveSaturnTransits } from '../../src/modules/kundli/kundli.service.js';
import type { ChartData, Planet, PlanetPosition, ZodiacSign } from '@aroha-astrology/shared';
import { ZODIAC_SIGNS } from '@aroha-astrology/shared';

// Sprint 7 (audit M12): Mangal Dosha rules from the texts opened on 2026-11-05.
// BPHS 80.47-49 (Lagna; no dosha with a benefic's aspect or conjunction), BPHS 3.11 (who is a
// benefic), B.V. Raman, Muhurtha pp. 98-100 (Lagna/Moon/Venus, house+sign list, Leo/Aquarius).
// Register: docs/engine-audit/D-source-register.md (BPHS-80.47, RAMAN-MUH).

const ARI = 0,
  TAU = 1,
  GEM = 2,
  CAN = 3,
  LEO = 4,
  VIR = 5,
  LIB = 6,
  SCO = 7,
  SAG = 8,
  CAP = 9,
  AQU = 10,
  PIS = 11;

function planet(p: Planet, signIndex: number, degree = 15): PlanetPosition {
  return {
    planet: p,
    longitude: signIndex * 30 + degree,
    latitude: 0,
    speed: 1,
    sign: ZODIAC_SIGNS[signIndex] as ZodiacSign,
    signIndex,
    signDegree: degree,
    nakshatra: 'Ashwini',
    nakshatraIndex: 0,
    nakshatraPada: 1,
    nakshatraLord: 'Ketu',
    isRetrograde: false,
    house: 1,
  };
}

/** A full chart: every planet placed, so no rule fires by accident from a missing one. */
function chart(lagna: number, at: Partial<Record<Planet, number | [number, number]>>): ChartData {
  const planets = Object.entries(at).map(([p, v]) =>
    Array.isArray(v) ? planet(p as Planet, v[0], v[1]) : planet(p as Planet, v),
  );
  return {
    planets,
    houses: [],
    ascendant: {
      sign: ZODIAC_SIGNS[lagna] as ZodiacSign,
      signIndex: lagna,
      degree: 0,
      nakshatra: 'Ashwini',
      nakshatraPada: 1,
    },
    ayanamsa: 'lahiri',
    ayanamsaValue: 24,
    julianDay: 2448000,
  };
}

describe('Mangal Dosha: an exception clears only the point it is true from (audit M12 bug)', () => {
  // Capricorn Lagna, Mars in Cancer: 7th from Lagna in Cancer is Raman's exception for the Lagna.
  // Moon in Aries puts Mars 4th from the Moon in Cancer, which has no exception.
  const c = chart(CAP, {
    Sun: GEM,
    Mercury: GEM,
    Moon: ARI,
    Mars: CAN,
    Venus: TAU,
    Jupiter: GEM,
    Saturn: PIS,
    Rahu: LEO,
    Ketu: AQU,
  });

  it('stays Manglik from the Moon, mild', () => {
    const m = detectMangalDosha(c);
    expect(m.present).toBe(true);
    expect(m.type).toBe('partial');
    expect(m.severity).toBe('mild');
    expect(m.cancellations).toEqual([]);
  });

  it('says which point was cleared and why', () => {
    const m = detectMangalDosha(c) as { clearedPoints?: { point: string; reason: string }[] };
    expect(m.clearedPoints).toEqual([
      { point: 'Lagna', reason: 'Mars in house 7 from Lagna in Cancer' },
    ]);
  });
});

describe('Mangal Dosha: Venus joined with Mars is not "1st from Venus" (self-cancel)', () => {
  it('is not present when Venus with Mars was the only afflicted point', () => {
    // Aries Lagna, Mars and Venus in Gemini: 3rd from Lagna, 3rd from the Moon (Aries).
    const c = chart(ARI, {
      Sun: TAU,
      Mercury: TAU,
      Moon: ARI,
      Mars: GEM,
      Venus: GEM,
      Jupiter: CAP,
      Saturn: SCO,
      Rahu: VIR,
      Ketu: PIS,
    });
    const m = detectMangalDosha(c);
    expect(m.present).toBe(false);
    expect(m.fromVenus).toBe(false);
    expect(m.type).toBe('none');
  });

  it('is still cancelled by the Venus conjunction when Mars afflicts from the Lagna', () => {
    const c = chart(GEM, {
      Sun: TAU,
      Mercury: TAU,
      Moon: LIB,
      Mars: GEM,
      Venus: GEM,
      Jupiter: CAP,
      Saturn: SCO,
      Rahu: VIR,
      Ketu: PIS,
    });
    const m = detectMangalDosha(c);
    expect(m.fromLagna).toBe(true);
    expect(m.fromVenus).toBe(false);
    expect(m.type).toBe('cancelled');
    expect(m.cancellations[0]).toBe('Mars conjunct benefic (Venus) - cancellation applies');
  });
});

describe('Mangal Dosha: a benefic aspecting Mars clears it (BPHS 80.47 with 3.11)', () => {
  it('Venus aspecting Mars (7th) cancels', () => {
    // Aries Lagna, Mars in Pisces (12th from Lagna and Moon, 7th from Venus in Virgo).
    const c = chart(ARI, {
      Sun: LEO,
      Mercury: LEO,
      Moon: ARI,
      Mars: PIS,
      Venus: VIR,
      Jupiter: TAU,
      Saturn: CAP,
      Rahu: GEM,
      Ketu: SAG,
    });
    const m = detectMangalDosha(c);
    expect(m.type).toBe('cancelled');
    expect(m.cancellations).toContain('Mars aspected by Venus - cancellation applies');
  });

  // Aries Lagna, Mars in Libra (7th from Lagna and from the Moon in Aries); the Moon aspects Libra.
  const moonAt = (sun: [number, number]) =>
    chart(ARI, {
      Sun: sun,
      Mercury: sun[0],
      Moon: [ARI, 10],
      Mars: LIB,
      Venus: CAP,
      Jupiter: TAU,
      Saturn: CAN,
      Rahu: GEM,
      Ketu: SAG,
    });

  it('a waxing Moon aspecting Mars cancels', () => {
    const m = detectMangalDosha(moonAt([SAG, 10])); // Moon 120 deg ahead of the Sun
    expect(m.type).toBe('cancelled');
    expect(m.cancellations).toContain('Mars aspected by a waxing Moon - cancellation applies');
  });

  it('a waning Moon aspecting Mars does not', () => {
    const m = detectMangalDosha(moonAt([LEO, 10])); // Moon 240 deg ahead: waning
    expect(m.type).toBe('partial');
    expect(m.severity).toBe('moderate');
  });

  // Aries Lagna, Mars in Libra (7th); Mercury in Aries aspects it.
  const mercury = (sun: number, merc: number) =>
    chart(ARI, {
      Sun: sun,
      Mercury: merc,
      Moon: GEM,
      Mars: LIB,
      Venus: CAP,
      Jupiter: TAU,
      Saturn: CAN,
      Rahu: LEO,
      Ketu: AQU,
    });

  it('Mercury aspecting Mars cancels when Mercury is not with a malefic', () => {
    const m = detectMangalDosha(mercury(PIS, ARI));
    expect(m.type).toBe('cancelled');
    expect(m.cancellations).toContain('Mars aspected by Mercury - cancellation applies');
  });

  it('Mercury aspecting Mars does not count when Mercury sits with the Sun', () => {
    const m = detectMangalDosha(mercury(ARI, ARI));
    expect(m.type).toBe('partial');
    expect(m.severity).toBe('mild');
  });

  it('Mercury joined with Mars does not count (Mercury with a malefic turns malefic)', () => {
    const m = detectMangalDosha(mercury(PIS, LIB));
    expect(m.type).toBe('partial');
  });
});

describe('Mangal Dosha: Mars in Leo or Aquarius (Raman, Muhurtha p.100)', () => {
  it('Mars in Leo forms no dosha', () => {
    // Capricorn Lagna, Mars in Leo (8th); nothing else touches Mars.
    const c = chart(CAP, {
      Sun: ARI,
      Mercury: ARI,
      Moon: TAU,
      Mars: LEO,
      Venus: PIS,
      Jupiter: TAU,
      Saturn: VIR,
      Rahu: GEM,
      Ketu: SAG,
    });
    const m = detectMangalDosha(c);
    expect(m.present).toBe(true);
    expect(m.type).toBe('cancelled');
    expect(m.cancellations[0]).toBe(
      'Mars in Leo, a sign where it forms no Mangal Dosha - cancellation applies',
    );
  });
});

describe('Mangal Dosha: rules that stay as they were', () => {
  it('spec Test 4: Libra Lagna, Mars in Aries in the 7th, Jupiter in Sagittarius = cancelled', () => {
    const c = chart(LIB, {
      Sun: CAP,
      Mercury: CAP,
      Moon: CAN,
      Mars: ARI,
      Venus: AQU,
      Jupiter: SAG,
      Saturn: GEM,
      Rahu: VIR,
      Ketu: PIS,
    });
    const m = detectMangalDosha(c);
    expect(m.type).toBe('cancelled');
    expect(m.cancellations[0]).toBe('Mars in own sign Aries - cancellation applies');
    expect(m.cancellations).toContain('Mars aspected by Jupiter - cancellation applies');
  });

  it('three afflicted points with nothing clearing them is full and severe', () => {
    // Aries Lagna, Moon and Venus in Aries, Mars in Taurus: 2nd from all three points, and a
    // Taurus 2nd has no exception.
    const c = chart(ARI, {
      Sun: PIS,
      Mercury: PIS,
      Moon: [ARI, 5],
      Mars: TAU,
      Venus: ARI,
      Jupiter: LEO,
      Saturn: VIR,
      Rahu: SAG,
      Ketu: GEM,
    });
    const m = detectMangalDosha(c);
    expect(m.type).toBe('full');
    expect(m.severity).toBe('severe');
  });
});

describe('withLiveSaturnTransits recomputes Mangal from the saved chart', () => {
  it('replaces a saved Mangal made by the old rules', async () => {
    const c = chart(CAP, {
      Sun: GEM,
      Mercury: GEM,
      Moon: ARI,
      Mars: CAN,
      Venus: TAU,
      Jupiter: GEM,
      Saturn: PIS,
      Rahu: LEO,
      Ketu: AQU,
    });
    const saved = {
      mangal: {
        present: true,
        type: 'cancelled',
        severity: 'none',
        cancellations: ['Mars in house 7 from Lagna in Cancer - cancellation applies'],
      },
      sadeSati: { active: false, moonSign: 'Aries' },
    };
    const live = await withLiveSaturnTransits(saved, new Date('2026-11-05T00:00:00Z'), {
      chart: c,
    });
    expect(live?.mangal).toMatchObject({ present: true, type: 'partial', severity: 'mild' });
  });
});
