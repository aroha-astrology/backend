import { describe, it, expect } from 'vitest';
import { detectMangalDosha } from '../src/lib/astro-engine/doshas/mangalDosha.js';
import { detectKaalSarpDosha } from '../src/lib/astro-engine/doshas/kaalSarp.js';
import { detectSadeSati } from '../src/lib/astro-engine/doshas/sadeSati.js';
import { detectPitraDosha } from '../src/lib/astro-engine/doshas/pitraDosha.js';
import { detectKemDrumaDosha } from '../src/lib/astro-engine/doshas/kemDrumaDosha.js';
import { detectGrahanDosha } from '../src/lib/astro-engine/doshas/grahanDosha.js';
import { detectGuruChandalDosha } from '../src/lib/astro-engine/doshas/guruChandal.js';
import type { ChartData, Planet, PlanetPosition, ZodiacSign } from '@aroha-astrology/shared';
import { ZODIAC_SIGNS } from '@aroha-astrology/shared';

// Every dosha detector must return a `description` that is specific to what was
// actually found in THIS chart (which houses, which planets, which cancellation) —
// not a single canned string shared by every user/severity. That genericness was
// the reported bug: all 4 doshas on a real user's screen showed byte-identical text.

function planet(p: Planet, signIndex: number, house: number): PlanetPosition {
  return {
    planet: p,
    longitude: signIndex * 30 + 15,
    latitude: 0,
    speed: 1,
    sign: ZODIAC_SIGNS[((signIndex % 12) + 12) % 12] as ZodiacSign,
    signIndex: ((signIndex % 12) + 12) % 12,
    signDegree: 15,
    nakshatra: 'Ashwini',
    nakshatraIndex: 0,
    nakshatraPada: 1,
    nakshatraLord: 'Ketu',
    isRetrograde: false,
    house,
  };
}

function chart(planets: PlanetPosition[], lagnaSignIndex = 0): ChartData {
  return {
    planets,
    houses: [],
    ascendant: {
      sign: ZODIAC_SIGNS[lagnaSignIndex] as ZodiacSign,
      signIndex: lagnaSignIndex,
      degree: 0,
      nakshatra: 'Ashwini',
      nakshatraPada: 1,
    },
    ayanamsa: 'lahiri',
    ayanamsaValue: 24,
    julianDay: 2448000,
  };
}

describe('Mangal Dosha description', () => {
  it('is specific to the afflicted house and mentions no cancellation for a full, uncancelled dosha', () => {
    // Mars in signIndex 7 (house 8 from Lagna at signIndex 0), no Moon/Venus to
    // avoid accidental cancellation-triggering conjunctions, no Jupiter present.
    const c = chart([planet('Mars', 7, 8)]);
    const result = detectMangalDosha(c);
    expect(result.present).toBe(true);
    expect(result.type).toBe('partial'); // only Lagna reference point present
    expect(result.description).toContain('8');
    expect(result.description.length).toBeGreaterThan(20);
  });

  it('produces a different description when cancelled than when not', () => {
    const uncancelled = detectMangalDosha(chart([planet('Mars', 7, 8)]));
    // Mars in Scorpio (signIndex 7, its own sign -> cancellation #1), Jupiter
    // at signIndex 1 aspects Scorpio via the standard 7th-house aspect
    // (-> cancellation #2), Venus conjunct Mars in Scorpio (-> cancellation
    // #3). 3+ cancellations is what flips `type` to 'cancelled'.
    const cancelled = detectMangalDosha(
      chart([planet('Mars', 7, 8), planet('Jupiter', 1, 2), planet('Venus', 7, 8)]),
    );
    expect(cancelled.type).toBe('cancelled');
    expect(cancelled.description).not.toEqual(uncancelled.description);
    expect(cancelled.description.toLowerCase()).toContain('cancel');
  });

  it('returns no description when Mangal Dosha is not present', () => {
    // Mars 3 houses from Lagna (signIndex 2) — not one of [1,2,4,7,8,12] -> not present.
    const result = detectMangalDosha(chart([planet('Mars', 2, 3)]));
    expect(result.present).toBe(false);
    expect(result.description).toBe('');
  });
});

describe('Kaal Sarp Dosha description', () => {
  function fullKaalSarpChart(): ChartData {
    // Rahu house 1, Ketu house 7; all 7 planets packed into houses 2-6 (between them).
    return chart([
      planet('Rahu', 0, 1),
      planet('Ketu', 6, 7),
      planet('Sun', 1, 2),
      planet('Moon', 2, 3),
      planet('Mars', 3, 4),
      planet('Mercury', 4, 5),
      planet('Jupiter', 5, 5),
      planet('Venus', 5, 6),
      planet('Saturn', 5, 6),
    ]);
  }

  it('names the specific Kaal Sarp type and houses involved', () => {
    const result = detectKaalSarpDosha(fullKaalSarpChart());
    expect(result.present).toBe(true);
    expect(result.isPartial).toBe(false);
    expect(result.description).toContain(result.name);
    expect(result.description).toContain('1');
    expect(result.description).toContain('7');
  });

  it('differentiates a partial Kaal Sarp description from a full one', () => {
    const full = detectKaalSarpDosha(fullKaalSarpChart());
    const partialPlanets = fullKaalSarpChart();
    // Move Saturn outside the Rahu->Ketu forward arc (house 8) to force partial.
    const saturn = partialPlanets.planets.find((p) => p.planet === 'Saturn')!;
    saturn.house = 8;
    saturn.signIndex = 7;
    const partial = detectKaalSarpDosha(partialPlanets);
    expect(partial.isPartial).toBe(true);
    expect(partial.description).not.toEqual(full.description);
    expect(partial.description.toLowerCase()).toContain('partial');
  });
});

describe('Sade Sati description', () => {
  it('mentions the specific phase and moon sign', () => {
    // Moon in Cancer (index 3); Saturn also in Cancer -> peak phase.
    const result = detectSadeSati('Cancer', 3 * 30 + 10);
    expect(result.active).toBe(true);
    expect(result.phase).toBe('peak');
    expect(result.description).toContain('Cancer');
    expect(result.description.toLowerCase()).toContain('peak');
  });

  it('differs between rising, peak, and setting phases for the same moon sign', () => {
    const rising = detectSadeSati('Cancer', 2 * 30 + 10); // Gemini transit
    const peak = detectSadeSati('Cancer', 3 * 30 + 10); // Cancer transit
    const setting = detectSadeSati('Cancer', 4 * 30 + 10); // Leo transit
    const descriptions = new Set([rising.description, peak.description, setting.description]);
    expect(descriptions.size).toBe(3);
  });
});

describe('Pitra Dosha description', () => {
  it('lists the actual indicators found, not a generic label', () => {
    const c = chart([planet('Sun', 0, 5), planet('Rahu', 0, 5)]);
    const result = detectPitraDosha(c);
    expect(result.present).toBe(true);
    expect(result.indicators.length).toBeGreaterThan(0);
    for (const indicator of result.indicators) {
      expect(result.description).toContain(indicator);
    }
  });
});

describe('Kemdrum Dosha description', () => {
  it('explains the isolation condition when present', () => {
    // Only Moon in the chart -> no adjacent/kendra qualifying planet -> present, uncancelled.
    const c = chart([planet('Moon', 0, 1)], 5); // Lagna elsewhere so Moon isn't in Kendra from Lagna
    const result = detectKemDrumaDosha(c);
    expect(result.present).toBe(true);
    expect(result.description.length).toBeGreaterThan(20);
  });
});

describe('Grahan Dosha description', () => {
  it('distinguishes surya, chandra, and both sub-types in the description', () => {
    const surya = detectGrahanDosha(chart([planet('Sun', 0, 3), planet('Rahu', 0, 3)]));
    const chandra = detectGrahanDosha(chart([planet('Moon', 0, 3), planet('Rahu', 0, 3)]));
    const both = detectGrahanDosha(
      chart([planet('Sun', 0, 3), planet('Moon', 0, 3), planet('Rahu', 0, 3)]),
    );
    expect(surya.type).toBe('surya_grahan');
    expect(chandra.type).toBe('chandra_grahan');
    expect(both.type).toBe('both');
    const descriptions = new Set([surya.description, chandra.description, both.description]);
    expect(descriptions.size).toBe(3);
  });
});

describe('Guru Chandal Dosha description', () => {
  it('names the specific house and which shadow planet is conjunct Jupiter', () => {
    const withRahu = detectGuruChandalDosha(chart([planet('Jupiter', 0, 9), planet('Rahu', 0, 9)]));
    const withKetu = detectGuruChandalDosha(chart([planet('Jupiter', 0, 9), planet('Ketu', 0, 9)]));
    expect(withRahu.present).toBe(true);
    expect(withRahu.description).toContain('9');
    expect(withRahu.description).toContain('Rahu');
    expect(withKetu.description).toContain('Ketu');
    expect(withRahu.description).not.toEqual(withKetu.description);
  });
});
