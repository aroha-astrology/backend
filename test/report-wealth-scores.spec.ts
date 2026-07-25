import { describe, expect, it } from 'vitest';
import { computeWealthScores } from '../src/lib/astro-engine/reports/wealth.js';

interface ChartOpts {
  secondLord?: string;
  secondLordSign?: string;
  eleventhLord?: string;
  eleventhLordSign?: string;
  jupiterSign?: string;
  jupiterHouse?: number;
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

  addPlanet('Jupiter', opts.jupiterSign ?? 'Aries', opts.jupiterHouse);
  addPlanet(opts.secondLord, opts.secondLordSign);
  addPlanet(opts.eleventhLord, opts.eleventhLordSign);

  if (opts.secondLord) houses.push({ house: 2, lord: opts.secondLord, sign: opts.secondLordSign ?? 'Aries' });
  if (opts.eleventhLord) houses.push({ house: 11, lord: opts.eleventhLord, sign: opts.eleventhLordSign ?? 'Aries' });

  return { planets, houses };
}

describe('computeWealthScores — wealthScore', () => {
  it('averages 2nd-lord, 11th-lord, and Jupiter strength scores', () => {
    // 2nd lord Mercury own sign Virgo => strong (90). 11th lord Sun own sign Leo => strong (90).
    // Jupiter debilitated Capricorn => weak (30). Average = (90+90+30)/3 = 70.
    const chart = makeChart({
      secondLord: 'Mercury',
      secondLordSign: 'Virgo',
      eleventhLord: 'Sun',
      eleventhLordSign: 'Leo',
      jupiterSign: 'Capricorn',
    });
    expect(computeWealthScores({ chart, partnerChart: null }, null).wealthScore).toBe(70);
  });

  it('defaults a missing lord to average (60)', () => {
    const chart = makeChart({ eleventhLord: 'Sun', eleventhLordSign: 'Leo', jupiterSign: 'Aries' });
    // secondLord missing => 60, eleventhLord strong => 90, Jupiter average => 60. (60+90+60)/3=70
    expect(computeWealthScores({ chart, partnerChart: null }, null).wealthScore).toBe(70);
  });
});

describe('computeWealthScores — wealthPattern', () => {
  it('is steady_accumulation when the 2nd lord is notably stronger than the 11th lord', () => {
    const chart = makeChart({
      secondLord: 'Mercury',
      secondLordSign: 'Virgo', // strong (90)
      eleventhLord: 'Sun',
      eleventhLordSign: 'Libra', // Sun debilitated in Libra => weak (30)
      jupiterSign: 'Aries', // average, irrelevant to the pattern rule
    });
    expect(computeWealthScores({ chart, partnerChart: null }, null).wealthPattern).toBe(
      'steady_accumulation',
    );
  });

  it('is volatile_gains when the 11th lord is notably stronger than the 2nd lord', () => {
    const chart = makeChart({
      secondLord: 'Sun',
      secondLordSign: 'Libra', // debilitated => weak (30)
      eleventhLord: 'Mercury',
      eleventhLordSign: 'Virgo', // own sign => strong (90)
      jupiterSign: 'Aries',
    });
    expect(computeWealthScores({ chart, partnerChart: null }, null).wealthPattern).toBe('volatile_gains');
  });

  it('is late_blooming when the 2nd and 11th lords are equally strong (no clear early pattern)', () => {
    const chart = makeChart({
      secondLord: 'Saturn',
      secondLordSign: 'Gemini', // neutral => average (60)
      eleventhLord: 'Mars',
      eleventhLordSign: 'Libra', // neutral => average (60)
      jupiterSign: 'Aries',
    });
    expect(computeWealthScores({ chart, partnerChart: null }, null).wealthPattern).toBe('late_blooming');
  });
});

describe('computeWealthScores — jupiter facts', () => {
  it('exposes Jupiter house and strength', () => {
    const chart = makeChart({ jupiterSign: 'Cancer', jupiterHouse: 9 }); // exalted => strong
    const scores = computeWealthScores({ chart, partnerChart: null }, null);
    expect(scores.jupiterStrength).toBe('strong');
    expect(scores.jupiterHouse).toBe(9);
  });
});

describe('computeWealthScores — defensive handling', () => {
  it('does not throw on a null chart', () => {
    expect(() => computeWealthScores({ chart: null, partnerChart: null }, null)).not.toThrow();
  });
});
