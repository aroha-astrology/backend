import { describe, expect, it } from 'vitest';
import { computeTrueLoveScores } from '../src/lib/astro-engine/reports/true-love.js';

interface ChartOpts {
  fifthLord?: string;
  fifthLordSign?: string;
  seventhLord?: string;
  seventhLordSign?: string;
  fourthLord?: string;
  fourthLordSign?: string;
  venusSign?: string;
  venusHouse?: number;
}

function makeChart(opts: ChartOpts = {}): Record<string, unknown> {
  const planets: Record<string, unknown>[] = [];
  const houses: Record<string, unknown>[] = [];
  const seen = new Set<string>();

  function addPlanet(name: string | undefined, sign: string | undefined, house?: number) {
    if (!name || seen.has(name)) return;
    seen.add(name);
    planets.push({ planet: name, sign: sign ?? 'Aries', house });
  }

  addPlanet('Venus', opts.venusSign ?? 'Aries', opts.venusHouse);
  addPlanet(opts.fifthLord, opts.fifthLordSign);
  addPlanet(opts.seventhLord, opts.seventhLordSign);
  addPlanet(opts.fourthLord, opts.fourthLordSign);

  if (opts.fifthLord) houses.push({ house: 5, lord: opts.fifthLord, sign: opts.fifthLordSign ?? 'Aries' });
  if (opts.seventhLord) houses.push({ house: 7, lord: opts.seventhLord, sign: opts.seventhLordSign ?? 'Aries' });
  if (opts.fourthLord) houses.push({ house: 4, lord: opts.fourthLord, sign: opts.fourthLordSign ?? 'Aries' });

  return { planets, houses };
}

describe('computeTrueLoveScores — romanceScore / partnershipScore', () => {
  it('romanceScore averages 5th-lord strength and Venus strength', () => {
    // 5th lord Sun in own sign Leo => strong (90). Venus in Pisces (exalted) => strong (90).
    const chart = makeChart({ fifthLord: 'Sun', fifthLordSign: 'Leo', venusSign: 'Pisces' });
    const scores = computeTrueLoveScores({ chart, partnerChart: null }, null);
    expect(scores.romanceScore).toBe(90);
  });

  it('partnershipScore averages 7th-lord strength and Venus strength', () => {
    // 7th lord Jupiter debilitated in Capricorn => weak (30). Venus average (no dignity match).
    const chart = makeChart({ seventhLord: 'Jupiter', seventhLordSign: 'Capricorn', venusSign: 'Aries' });
    const scores = computeTrueLoveScores({ chart, partnerChart: null }, null);
    // Jupiter weak=30, Venus average=60 => (30+60)/2 = 45
    expect(scores.partnershipScore).toBe(45);
  });
});

describe('computeTrueLoveScores — venusInKeyHouse', () => {
  it('is true when Venus sits in the 5th house', () => {
    const chart = makeChart({ venusHouse: 5 });
    expect(computeTrueLoveScores({ chart, partnerChart: null }, null).venusInKeyHouse).toBe(true);
  });

  it('is true when Venus sits in the 7th house', () => {
    const chart = makeChart({ venusHouse: 7 });
    expect(computeTrueLoveScores({ chart, partnerChart: null }, null).venusInKeyHouse).toBe(true);
  });

  it('is false when Venus sits elsewhere', () => {
    const chart = makeChart({ venusHouse: 2 });
    expect(computeTrueLoveScores({ chart, partnerChart: null }, null).venusInKeyHouse).toBe(false);
  });
});

describe('computeTrueLoveScores — loveVsArrangedTilt', () => {
  // Documented formula: tilt = round(5 + (selfInitiated - family) / 12), clamped to [0, 10], where
  // selfInitiated = average(venusScore, fifthLordScore) and family = average(seventhLordScore, fourthLordScore).
  it('is 5 (neutral) when self-initiated and family signifiers are equally strong', () => {
    // Every planet placed in a sign with no special dignity (not own/exalted/debilitated/enemy)
    // => average (60) for all four signifiers => selfInitiated = family = 60 => tilt = 5.
    const neutralChart = makeChart({
      venusSign: 'Gemini', // no dignity for Venus
      fifthLord: 'Saturn',
      fifthLordSign: 'Gemini', // no dignity for Saturn
      seventhLord: 'Mercury',
      seventhLordSign: 'Leo', // no dignity for Mercury
      fourthLord: 'Mars',
      fourthLordSign: 'Libra', // no dignity for Mars (not own/exalted/debilitated/enemy)
    });
    const scores = computeTrueLoveScores({ chart: neutralChart, partnerChart: null }, null);
    expect(scores.loveVsArrangedTilt).toBe(5);
  });

  it('tilts toward love-marriage (higher) when self-initiated signifiers are stronger', () => {
    // Venus exalted (Pisces, strong=90), 5th lord Mercury own sign Virgo (strong=90) => selfInitiated=90.
    // 7th lord Jupiter debilitated Capricorn (weak=30), 4th lord Mars debilitated Cancer (weak=30) => family=30.
    // tilt = round(5 + (90-30)/12) = round(5+5) = 10.
    const chart = makeChart({
      venusSign: 'Pisces',
      fifthLord: 'Mercury',
      fifthLordSign: 'Virgo',
      seventhLord: 'Jupiter',
      seventhLordSign: 'Capricorn',
      fourthLord: 'Mars',
      fourthLordSign: 'Cancer',
    });
    const scores = computeTrueLoveScores({ chart, partnerChart: null }, null);
    expect(scores.loveVsArrangedTilt).toBe(10);
  });

  it('tilts toward arranged (lower) when family signifiers are stronger', () => {
    // Venus debilitated Virgo (weak=30), 5th lord Jupiter debilitated Capricorn (weak=30) => selfInitiated=30.
    // 7th lord Mercury own sign Virgo (strong=90), 4th lord Venus exalted Pisces... reuse distinct planets:
    // 7th lord Sun own sign Leo (strong=90), 4th lord Moon own sign Cancer (strong=90) => family=90.
    // tilt = round(5 + (30-90)/12) = round(5-5) = 0.
    const chart = makeChart({
      venusSign: 'Virgo',
      fifthLord: 'Jupiter',
      fifthLordSign: 'Capricorn',
      seventhLord: 'Sun',
      seventhLordSign: 'Leo',
      fourthLord: 'Moon',
      fourthLordSign: 'Cancer',
    });
    const scores = computeTrueLoveScores({ chart, partnerChart: null }, null);
    expect(scores.loveVsArrangedTilt).toBe(0);
  });

  it('stays within the documented [0, 10] bounds', () => {
    const chart = makeChart({ venusSign: 'Pisces', fifthLord: 'Mercury', fifthLordSign: 'Virgo' });
    const scores = computeTrueLoveScores({ chart, partnerChart: null }, null);
    expect(scores.loveVsArrangedTilt).toBeGreaterThanOrEqual(0);
    expect(scores.loveVsArrangedTilt).toBeLessThanOrEqual(10);
  });
});

describe('computeTrueLoveScores — defensive handling', () => {
  it('does not throw on a null chart', () => {
    expect(() => computeTrueLoveScores({ chart: null, partnerChart: null }, null)).not.toThrow();
  });
});
