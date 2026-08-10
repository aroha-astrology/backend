import { describe, it, expect } from 'vitest';
import {
  calculateChart,
  dateToJulianDay,
  calculatePlanetPositions,
} from '../src/lib/astro-engine/calculations/planetPositions.js';

// =============================================================================
// Golden reference chart + independently verifiable astronomy
// =============================================================================
// The suite could prove the engine RAN, and that Ashtakavarga was internally
// consistent, but nothing pinned the actual numbers. An ayanamsa regression, a
// swapped node constant, or a Swiss Ephemeris flag change would have produced
// a perfectly plausible — and completely wrong — chart with every test green.
//
// Two layers here, deliberately:
//
//   1. EXTERNAL TRUTH — facts checkable against the real world without this
//      codebase: the date of Mesha Sankranti, the known precession rate of the
//      Lahiri ayanamsa, which planets were retrograde on a given date. These
//      catch "the engine is confidently wrong".
//
//   2. FROZEN SNAPSHOT — exact longitudes for one fixed birth. This catches
//      drift. It proves nothing about correctness on its own (it was generated
//      BY this engine), which is why layer 1 exists; but any unintended change
//      to ayanamsa, node choice, or house assignment moves these numbers.
//
// If layer 2 fails but layer 1 passes, something changed on purpose — re-verify
// against an external tool, then update the snapshot in the same commit.
// =============================================================================

const TOLERANCE = 1e-4;

describe('external truth: Lahiri ayanamsa magnitude', () => {
  it('is ~23.72 degrees in 1990, matching the known precession rate', async () => {
    // Lahiri is ~23.85 deg at J2000 and precesses ~50.3 arcsec/year (~0.01397
    // deg/yr), so 1990 must land near 23.85 - 10*0.01397 = 23.71.
    const chart = await calculateChart(1990, 5, 20, 6, 30, 5.5, 19.076, 72.8777, 'lahiri', 'W');
    expect(chart.ayanamsaValue).toBeGreaterThan(23.6);
    expect(chart.ayanamsaValue).toBeLessThan(23.8);
  }, 20_000);
});

describe('external truth: Mesha Sankranti', () => {
  it('places the Sun at sidereal 0 Aries on 14 April 2024, not a day either side', async () => {
    // Mesha Sankranti (Sun entering sidereal Aries) fell on 13 April 2024 in
    // the real world. The Sun must therefore still be in late Pisces at noon UT
    // on the 13th and just past 0 Aries by noon UT on the 14th. Getting the
    // ayanamsa wrong by even a degree moves this crossing by a whole day.
    const at = async (day: number) => {
      const jd = await dateToJulianDay(2024, 4, day, 12, 0, 0);
      const planets = await calculatePlanetPositions(jd, 'lahiri');
      return planets.find((p) => p.planet === 'Sun')!.longitude;
    };

    expect(await at(13)).toBeGreaterThan(359); // still Pisces
    expect(await at(14)).toBeLessThan(2); // crossed into Aries
    expect(await at(15)).toBeGreaterThan(await at(14)); // and moving forward
  }, 30_000);
});

describe('external truth: retrograde motion', () => {
  it('has Saturn retrograde on 1990-05-20 (it was, 14 May - 30 Sep 1990)', async () => {
    const chart = await calculateChart(1990, 5, 20, 6, 30, 5.5, 19.076, 72.8777, 'lahiri', 'W');
    expect(chart.planets.find((p) => p.planet === 'Saturn')!.isRetrograde).toBe(true);
  }, 20_000);

  it('never reports the Sun or Moon as retrograde — they cannot be', async () => {
    const chart = await calculateChart(1990, 5, 20, 6, 30, 5.5, 19.076, 72.8777, 'lahiri', 'W');
    expect(chart.planets.find((p) => p.planet === 'Sun')!.isRetrograde).toBe(false);
    expect(chart.planets.find((p) => p.planet === 'Moon')!.isRetrograde).toBe(false);
  }, 20_000);

  it('always reports both nodes as retrograde — the mean node only moves backwards', async () => {
    const chart = await calculateChart(1990, 5, 20, 6, 30, 5.5, 19.076, 72.8777, 'lahiri', 'W');
    expect(chart.planets.find((p) => p.planet === 'Rahu')!.isRetrograde).toBe(true);
    expect(chart.planets.find((p) => p.planet === 'Ketu')!.isRetrograde).toBe(true);
  }, 20_000);
});

describe('external truth: Rahu and Ketu are exactly opposite', () => {
  it('keeps Ketu 180 degrees from Rahu', async () => {
    const chart = await calculateChart(1990, 5, 20, 6, 30, 5.5, 19.076, 72.8777, 'lahiri', 'W');
    const rahu = chart.planets.find((p) => p.planet === 'Rahu')!.longitude;
    const ketu = chart.planets.find((p) => p.planet === 'Ketu')!.longitude;
    expect(Math.abs(((ketu - rahu + 360) % 360) - 180)).toBeLessThan(TOLERANCE);
  }, 20_000);
});

describe('frozen snapshot: 1990-05-20 06:30 IST, Mumbai (Lahiri, whole-sign)', () => {
  // Regenerate with scripts/_ref-chart.mts if these ever change ON PURPOSE.
  const EXPECTED = {
    ayanamsa: 23.722724,
    ascendant: { sign: 'Taurus', degree: 11.2075, nakshatra: 'Rohini', pada: 1 },
    planets: {
      Sun: { lon: 35.045228, sign: 'Taurus', house: 1, nakshatra: 'Krittika', pada: 3 },
      Moon: { lon: 333.01073, sign: 'Pisces', house: 11, nakshatra: 'PurvaBhadrapada', pada: 4 },
      Mars: { lon: 327.97606, sign: 'Aquarius', house: 10, nakshatra: 'PurvaBhadrapada', pada: 3 },
      Mercury: { lon: 14.524486, sign: 'Aries', house: 12, nakshatra: 'Bharani', pada: 1 },
      Jupiter: { lon: 76.687369, sign: 'Gemini', house: 2, nakshatra: 'Ardra', pada: 4 },
      Venus: { lon: 354.288061, sign: 'Pisces', house: 11, nakshatra: 'Revati', pada: 3 },
      Saturn: { lon: 271.430419, sign: 'Capricorn', house: 9, nakshatra: 'UttaraAshadha', pada: 2 },
      Rahu: { lon: 287.372702, sign: 'Capricorn', house: 9, nakshatra: 'Shravana', pada: 3 },
      Ketu: { lon: 107.372702, sign: 'Cancer', house: 3, nakshatra: 'Ashlesha', pada: 1 },
    },
  } as const;

  it('reproduces the ayanamsa and ascendant exactly', async () => {
    const chart = await calculateChart(1990, 5, 20, 6, 30, 5.5, 19.076, 72.8777, 'lahiri', 'W');
    expect(chart.ayanamsaValue).toBeCloseTo(EXPECTED.ayanamsa, 5);
    expect(chart.ascendant.sign).toBe(EXPECTED.ascendant.sign);
    expect(chart.ascendant.degree).toBeCloseTo(EXPECTED.ascendant.degree, 3);
    expect(chart.ascendant.nakshatra).toBe(EXPECTED.ascendant.nakshatra);
    expect(chart.ascendant.nakshatraPada).toBe(EXPECTED.ascendant.pada);
  }, 20_000);

  it('reproduces every planet longitude, sign, house, nakshatra and pada exactly', async () => {
    const chart = await calculateChart(1990, 5, 20, 6, 30, 5.5, 19.076, 72.8777, 'lahiri', 'W');
    for (const [name, want] of Object.entries(EXPECTED.planets)) {
      const got = chart.planets.find((p) => p.planet === name);
      expect(got, `${name} missing from chart`).toBeDefined();
      expect(got!.longitude, `${name} longitude`).toBeCloseTo(want.lon, 4);
      expect(got!.sign, `${name} sign`).toBe(want.sign);
      expect(got!.house, `${name} house`).toBe(want.house);
      expect(got!.nakshatra, `${name} nakshatra`).toBe(want.nakshatra);
      expect(got!.nakshatraPada, `${name} pada`).toBe(want.pada);
    }
  }, 20_000);

  it('changes the chart when the ayanamsa changes — proving the setting is honoured', async () => {
    // A silently ignored ayanamsa parameter is exactly the class of bug the
    // snapshot above cannot catch on its own.
    const lahiri = await calculateChart(1990, 5, 20, 6, 30, 5.5, 19.076, 72.8777, 'lahiri', 'W');
    const raman = await calculateChart(1990, 5, 20, 6, 30, 5.5, 19.076, 72.8777, 'raman', 'W');
    expect(raman.ayanamsaValue).not.toBeCloseTo(lahiri.ayanamsaValue, 3);
    const lahiriSun = lahiri.planets.find((p) => p.planet === 'Sun')!.longitude;
    const ramanSun = raman.planets.find((p) => p.planet === 'Sun')!.longitude;
    expect(Math.abs(lahiriSun - ramanSun)).toBeGreaterThan(0.1);
  }, 30_000);
});

describe('selectable node type and ayanamsa', () => {
  const BIRTH = [1990, 5, 20, 6, 30, 5.5, 19.076, 72.8777] as const;

  it('defaults to the mean node, and true node moves Rahu by roughly a degree', async () => {
    const { setLunarNodeType, getLunarNodeType } =
      await import('../src/lib/astro-engine/calculations/planetPositions.core.js');
    expect(getLunarNodeType()).toBe('mean');

    const mean = await calculateChart(...BIRTH, 'lahiri', 'W');
    try {
      setLunarNodeType('true');
      const tru = await calculateChart(...BIRTH, 'lahiri', 'W');
      const dMean = mean.planets.find((p) => p.planet === 'Rahu')!.longitude;
      const dTrue = tru.planets.find((p) => p.planet === 'Rahu')!.longitude;
      const delta = Math.abs(dMean - dTrue);
      // The true node oscillates +/-1.29 deg around the mean; anything outside
      // that range means the wrong body id is being requested.
      expect(delta).toBeGreaterThan(0.01);
      expect(delta).toBeLessThan(1.4);

      // Ketu must stay exactly opposite Rahu whichever node is selected.
      const ketu = tru.planets.find((p) => p.planet === 'Ketu')!;
      expect(Math.abs(((ketu.longitude - dTrue + 360) % 360) - 180)).toBeLessThan(1e-4);
      // ...and must agree with Rahu about direction, never a hardcoded flag.
      expect(ketu.isRetrograde).toBe(tru.planets.find((p) => p.planet === 'Rahu')!.isRetrograde);
    } finally {
      setLunarNodeType('mean');
    }
  }, 30_000);

  it('supports true_chitra, sitting 30-60 arcsec from official Lahiri', async () => {
    const lahiri = await calculateChart(...BIRTH, 'lahiri', 'W');
    const trueChitra = await calculateChart(...BIRTH, 'true_chitra', 'W');
    const arcsec = Math.abs(lahiri.ayanamsaValue - trueChitra.ayanamsaValue) * 3600;
    expect(arcsec).toBeGreaterThan(20);
    expect(arcsec).toBeLessThan(90);
  }, 30_000);
});

describe('every stored ayanamsa preference actually changes the chart', () => {
  // `preferred_ayanamsa` offered six values while resolveAyanamsa honoured
  // three; the other three silently produced a Lahiri chart. This locks all six
  // to distinct, verified Swiss sidereal modes so that cannot regress.
  const BIRTH = [1990, 5, 20, 6, 30, 5.5, 19.076, 72.8777] as const;

  it('gives each of the six a distinct ayanamsa value', async () => {
    const modes = [
      'lahiri',
      'raman',
      'krishnamurti',
      'true_chitra',
      'fagan_bradley',
      'yukteshwar',
    ] as const;

    const values = new Map<string, number>();
    for (const m of modes) {
      const chart = await calculateChart(...BIRTH, m, 'W');
      values.set(m, chart.ayanamsaValue);
    }

    // Every mode must be distinct — a silent fallback shows up as a duplicate.
    expect(new Set([...values.values()].map((v) => v.toFixed(4))).size).toBe(modes.length);

    // Spot-check the two that used to fall back, against measured 1990 values.
    expect(values.get('fagan_bradley')!).toBeCloseTo(24.6059, 3);
    expect(values.get('yukteshwar')!).toBeCloseTo(22.3444, 3);
    expect(values.get('lahiri')!).toBeCloseTo(23.7227, 3);
  }, 60_000);
});
