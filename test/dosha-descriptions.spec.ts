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
  it('is specific to the afflicted house and mentions no cancellation for a genuinely uncancelled dosha', () => {
    // Mars in Gemini (signIndex 2) with Lagna in Scorpio (signIndex 7) puts
    // Mars in house 8 from Lagna. Gemini is not Mars's own/exalted sign and
    // no other planet is present, so no cancellation rule can fire.
    const c = chart([planet('Mars', 2, 8)], 7);
    const result = detectMangalDosha(c);
    expect(result.present).toBe(true);
    expect(result.cancellations).toEqual([]);
    expect(result.type).toBe('partial'); // only Lagna reference point present
    expect(result.description).toContain('8');
    expect(result.description.length).toBeGreaterThan(20);
  });

  it('cancels the dosha from a single classical rule alone, not requiring multiple stacked reasons', () => {
    // Mars in Scorpio (its own sign) forms Mangal Dosha in house 8 from Lagna
    // (Lagna at signIndex 0), with no Jupiter/Venus/Moon present. Own-sign
    // placement is, by itself, a complete classical cancellation — it should
    // not need to stack with other reasons to fully cancel the dosha.
    const result = detectMangalDosha(chart([planet('Mars', 7, 8)]));
    expect(result.present).toBe(true);
    expect(result.cancellations.length).toBe(1);
    expect(result.type).toBe('cancelled');
    expect(result.severity).toBe('none');
  });

  it('cancels even a dosha afflicted from all three reference points when Mars is in its own sign', () => {
    // Mars (Scorpio, signIndex 7) afflicts house 8 from Lagna (signIndex 0),
    // house 2 from Moon (signIndex 6), and house 4 from Venus (signIndex 4) —
    // full 3/3 affliction — but dignity-based cancellation (own sign) is
    // reference-point-independent and should still fully cancel it.
    const c = chart([planet('Mars', 7, 8), planet('Moon', 6, 2), planet('Venus', 4, 4)]);
    const result = detectMangalDosha(c);
    expect(result.fromLagna).toBe(true);
    expect(result.fromMoon).toBe(true);
    expect(result.fromVenus).toBe(true);
    expect(result.type).toBe('cancelled');
    expect(result.severity).toBe('none');
  });

  it('produces a different description when cancelled than when genuinely uncancelled', () => {
    const uncancelled = detectMangalDosha(chart([planet('Mars', 2, 8)], 7));
    const cancelled = detectMangalDosha(
      chart([planet('Mars', 7, 8), planet('Jupiter', 1, 2), planet('Venus', 7, 8)]),
    );
    expect(cancelled.type).toBe('cancelled');
    expect(uncancelled.type).toBe('partial');
    expect(cancelled.description).not.toEqual(uncancelled.description);
    expect(cancelled.description.toLowerCase()).toContain('cancel');
  });

  it('returns no description when Mangal Dosha is not present', () => {
    // Mars 3 houses from Lagna (signIndex 2) — not one of [1,2,4,7,8,12] -> not present.
    const result = detectMangalDosha(chart([planet('Mars', 2, 3)]));
    expect(result.present).toBe(false);
    expect(result.description).toBe('');
  });

  it('appends a non-authoritative age-28 caveat to the description without changing type/severity', () => {
    // Same cancelled chart as above; only difference is a supplied birth date.
    const cancelledChart = chart([planet('Mars', 7, 8)]);
    const withoutBirthDate = detectMangalDosha(cancelledChart);
    const over28BirthDate = '1990-01-01';
    const withBirthDate = detectMangalDosha(cancelledChart, over28BirthDate);
    expect(withBirthDate.type).toBe(withoutBirthDate.type);
    expect(withBirthDate.severity).toBe(withoutBirthDate.severity);
    expect(withBirthDate.description.length).toBeGreaterThan(withoutBirthDate.description.length);
    expect(withBirthDate.description).toContain('28');
  });

  it('does not append the age-28 caveat for someone under 28', () => {
    const cancelledChart = chart([planet('Mars', 7, 8)]);
    const under28 = new Date();
    under28.setFullYear(under28.getFullYear() - 10);
    const result = detectMangalDosha(cancelledChart, under28.toISOString().slice(0, 10));
    expect(result.description).not.toContain('28');
  });
});

describe('Mangal Dosha — house+sign classical exceptions beyond Lagna-only coverage', () => {
  it('cancels when Mars is in the 7th house (from Lagna) in Cancer', () => {
    // Lagna signIndex 9 (Capricorn), Mars signIndex 3 (Cancer) -> house 7 from Lagna.
    const result = detectMangalDosha(chart([planet('Mars', 3, 7)], 9));
    expect(result.present).toBe(true);
    expect(result.type).toBe('cancelled');
  });

  it('cancels when Mars is in the 8th house (from Lagna) in Sagittarius', () => {
    // Lagna signIndex 1 (Taurus), Mars signIndex 8 (Sagittarius) -> house 8 from Lagna.
    const result = detectMangalDosha(chart([planet('Mars', 8, 8)], 1));
    expect(result.present).toBe(true);
    expect(result.type).toBe('cancelled');
  });

  it('cancels via the 2nd-house Gemini/Virgo exception measured from the Moon, not just Lagna', () => {
    // Lagna signIndex 0 puts Mars (Gemini, signIndex 2) in house 3 from Lagna
    // (not a dosha house at all from Lagna). Moon signIndex 1 puts Mars in
    // house 2 from the Moon -- the only afflicted reference point.
    const c = chart([planet('Mars', 2, 2), planet('Moon', 1, 1)], 0);
    const result = detectMangalDosha(c);
    expect(result.fromLagna).toBe(false);
    expect(result.fromMoon).toBe(true);
    expect(result.type).toBe('cancelled');
  });

  it('cancels via the 12th-house Taurus/Libra exception measured from Venus, not just Lagna', () => {
    // Lagna signIndex 9 puts Mars (Taurus, signIndex 1) in house 5 from Lagna
    // (not a dosha house). Venus signIndex 2 puts Mars in house 12 from Venus.
    const c = chart([planet('Mars', 1, 5), planet('Venus', 2, 12)], 9);
    const result = detectMangalDosha(c);
    expect(result.fromLagna).toBe(false);
    expect(result.fromVenus).toBe(true);
    expect(result.type).toBe('cancelled');
  });
});

describe('Mangal Dosha — unverified rules removed', () => {
  it('does NOT cancel from Mars in Leo alone (no classical source for this rule)', () => {
    // Lagna signIndex 9, Mars signIndex 4 (Leo) -> house 8 from Lagna, no
    // other planets present to trigger any other rule.
    const result = detectMangalDosha(chart([planet('Mars', 4, 8)], 9));
    expect(result.present).toBe(true);
    expect(result.type).not.toBe('cancelled');
  });

  it('does NOT cancel from Mars being in a Kendra from Jupiter alone (no classical source for this rule)', () => {
    // Lagna signIndex 2 puts Mars (Gemini, signIndex 2) in house 1 from Lagna.
    // Jupiter signIndex 11 puts Mars in house 4 (a Kendra) from Jupiter, but
    // does NOT aspect Mars's sign (Jupiter's 5th/7th/9th specials miss it).
    const c = chart([planet('Mars', 2, 1), planet('Jupiter', 11, 4)], 2);
    const result = detectMangalDosha(c);
    expect(result.present).toBe(true);
    expect(result.type).not.toBe('cancelled');
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
