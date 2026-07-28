import { describe, expect, it } from 'vitest';
import { computeWealthScores } from '../src/lib/astro-engine/reports/wealth.js';

const MS_PER_DAY = 86_400_000;
const UNIX_EPOCH_JD = 2440587.5;
function dateToJd(date: Date): number {
  return date.getTime() / MS_PER_DAY + UNIX_EPOCH_JD;
}

interface ChartOpts {
  secondLord?: string;
  secondLordSign?: string;
  eleventhLord?: string;
  eleventhLordSign?: string;
  jupiterSign?: string;
  jupiterHouse?: number;
  secondHouseOccupant?: string;
  eleventhHouseOccupant?: string;
  moonSign?: string;
  moonLongitude?: number;
  julianDay?: number;
  ascendantSignIndex?: number;
}

function makeChart(opts: ChartOpts = {}): Record<string, unknown> {
  const planets: Record<string, unknown>[] = [];
  const houses: Record<string, unknown>[] = [];
  const seen = new Set<string>();

  function addPlanet(
    name: string | undefined,
    sign: string | undefined,
    house?: number,
    longitude?: number,
  ) {
    if (!name || seen.has(name)) return;
    seen.add(name);
    planets.push({ planet: name, sign: sign ?? 'Aries', house, longitude });
  }

  addPlanet('Jupiter', opts.jupiterSign ?? 'Aries', opts.jupiterHouse);
  addPlanet(opts.secondLord, opts.secondLordSign);
  addPlanet(opts.eleventhLord, opts.eleventhLordSign);
  addPlanet(opts.secondHouseOccupant, 'Aries', 2);
  addPlanet(opts.eleventhHouseOccupant, 'Aries', 11);
  if (opts.moonSign || opts.moonLongitude != null) {
    addPlanet('Moon', opts.moonSign ?? 'Aries', undefined, opts.moonLongitude);
  }

  if (opts.secondLord)
    houses.push({ house: 2, lord: opts.secondLord, sign: opts.secondLordSign ?? 'Aries' });
  if (opts.eleventhLord)
    houses.push({ house: 11, lord: opts.eleventhLord, sign: opts.eleventhLordSign ?? 'Aries' });

  const chart: Record<string, unknown> = { planets, houses };
  if (opts.julianDay != null) chart.julianDay = opts.julianDay;
  if (opts.ascendantSignIndex != null) chart.ascendant = { signIndex: opts.ascendantSignIndex };
  return chart;
}

/** Same synthetic mahadasha builder as report-timing.spec.ts/dasha-confidence.spec.ts. */
function makeDasha(now: Date) {
  const planets = ['Sun', 'Moon', 'Mars', 'Rahu', 'Jupiter', 'Saturn', 'Mercury', 'Ketu', 'Venus'];
  const years: Record<string, number> = {
    Sun: 6,
    Moon: 10,
    Mars: 7,
    Rahu: 18,
    Jupiter: 16,
    Saturn: 19,
    Mercury: 17,
    Ketu: 7,
    Venus: 20,
  };
  let cursor = new Date(now.getTime());
  const mahadashas = planets.map((planet) => {
    const startDate = new Date(cursor.getTime());
    const endDate = new Date(cursor.getTime() + years[planet]! * 365.25 * 86_400_000);
    cursor = endDate;
    return {
      planet,
      startDate,
      endDate,
      isActive: false,
      level: 'mahadasha' as const,
      subPeriods: [],
    };
  });
  mahadashas[0]!.isActive = true;
  return { vimshottari: { mahadashas } };
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
    expect(computeWealthScores({ chart, partnerChart: null }, null).wealthPattern).toBe(
      'volatile_gains',
    );
  });

  it('is late_blooming when the 2nd and 11th lords are equally strong (no clear early pattern)', () => {
    const chart = makeChart({
      secondLord: 'Saturn',
      secondLordSign: 'Gemini', // neutral => average (60)
      eleventhLord: 'Mars',
      eleventhLordSign: 'Libra', // neutral => average (60)
      jupiterSign: 'Aries',
    });
    expect(computeWealthScores({ chart, partnerChart: null }, null).wealthPattern).toBe(
      'late_blooming',
    );
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

  it('does not throw and degrades every new field to empty/neutral when chart/dashaData/doshaData/yogaData are all null or absent', () => {
    const scores = computeWealthScores({ chart: null, partnerChart: null }, null);
    expect(scores.windows).toEqual([]);
    expect(scores.ageBands).toEqual([]);
    expect(scores.doshaYoga).toEqual({ positives: [], cautions: [] });
    expect(scores.wealthArc).toHaveLength(3);
    for (const band of scores.wealthArc as { score: number; tone: string }[]) {
      expect(band.score).toBe(50);
      expect(band.tone).toBe('mixed');
    }
    expect(scores.moneyArchetype).toBeDefined();
    expect((scores.moneyArchetype as { traits: unknown[] }).traits).toHaveLength(5);
    expect(scores.spendingVsSavingTilt).toBe(5); // both lords default to average(60) => neutral tilt
  });

  it('does not throw when ctx has no dashaData/doshaData/yogaData keys at all (e.g. match-risks.ts call shape)', () => {
    const chart = makeChart({ secondLord: 'Mercury', secondLordSign: 'Virgo' });
    expect(() => computeWealthScores({ chart }, null)).not.toThrow();
  });
});

describe('computeWealthScores — windows (wealth timing)', () => {
  it('finds at least one favorable window via the Jupiter static-karaka significator when dashaData is present', () => {
    const now = new Date();
    const dasha = makeDasha(now);
    const chart = makeChart({
      secondLord: 'Mercury',
      secondLordSign: 'Virgo',
      eleventhLord: 'Sun',
      eleventhLordSign: 'Leo',
    });
    const scores = computeWealthScores({ chart, partnerChart: null, dashaData: dasha }, null);
    expect(Array.isArray(scores.windows)).toBe(true);
    for (const w of scores.windows as { level: string }[]) {
      expect(['HIGH', 'MEDIUM', 'LOW']).toContain(w.level);
    }
  });

  it('returns an empty windows array (never throws) when dashaData is missing', () => {
    const chart = makeChart({ secondLord: 'Mercury', secondLordSign: 'Virgo' });
    expect(() => computeWealthScores({ chart, partnerChart: null }, null)).not.toThrow();
    expect(computeWealthScores({ chart, partnerChart: null }, null).windows).toEqual([]);
  });
});

describe('computeWealthScores — ageBands', () => {
  it('produces 4 age bands when julianDay is present on the chart', () => {
    const chart = makeChart({ julianDay: dateToJd(new Date('1990-01-01T00:00:00Z')) });
    const scores = computeWealthScores({ chart, partnerChart: null }, null);
    expect(scores.ageBands).toHaveLength(4);
  });

  it('degrades to an empty array when julianDay is missing (never throws)', () => {
    const chart = makeChart({});
    expect(() => computeWealthScores({ chart, partnerChart: null }, null)).not.toThrow();
    expect(computeWealthScores({ chart, partnerChart: null }, null).ageBands).toEqual([]);
  });
});

describe('computeWealthScores — moneyArchetype', () => {
  it('names the archetype per wealthPattern and threads the 2nd-house sign temperament into the description', () => {
    const chart = makeChart({
      secondLord: 'Mercury',
      secondLordSign: 'Virgo',
      eleventhLord: 'Sun',
      eleventhLordSign: 'Libra',
      jupiterSign: 'Aries',
    });
    const scores = computeWealthScores({ chart, partnerChart: null }, null);
    expect(scores.wealthPattern).toBe('steady_accumulation');
    expect((scores.moneyArchetype as { label: string }).label).toBe('The Steady Accumulator');
    expect((scores.moneyArchetype as { description: string }).description).toContain('Virgo');
  });

  it('uses Saturn/Mars/Jupiter/Mercury/Rahu as the 5 order-matched trait significators, in order', () => {
    const chart = makeChart({});
    const scores = computeWealthScores({ chart, partnerChart: null }, null);
    const traits = (scores.moneyArchetype as { traits: { label: string }[] }).traits;
    expect(traits.map((t) => t.label)).toEqual([
      'Caution',
      'Ambition',
      'Generosity',
      'Discipline',
      'Risk-tolerance',
    ]);
  });

  it('labels volatile_gains as "The Opportunistic Gainer" and late_blooming as "The Late Bloomer"', () => {
    const volatileChart = makeChart({
      secondLord: 'Sun',
      secondLordSign: 'Libra',
      eleventhLord: 'Mercury',
      eleventhLordSign: 'Virgo',
    });
    expect(
      (
        computeWealthScores({ chart: volatileChart, partnerChart: null }, null).moneyArchetype as {
          label: string;
        }
      ).label,
    ).toBe('The Opportunistic Gainer');

    const lateBloomingChart = makeChart({
      secondLord: 'Saturn',
      secondLordSign: 'Gemini',
      eleventhLord: 'Mars',
      eleventhLordSign: 'Libra',
    });
    expect(
      (
        computeWealthScores({ chart: lateBloomingChart, partnerChart: null }, null)
          .moneyArchetype as {
          label: string;
        }
      ).label,
    ).toBe('The Late Bloomer');
  });
});

describe('computeWealthScores — wealthArc', () => {
  it('produces 3 decade bands, each a valid 0-100 score, keyed to the 2nd/11th houses', () => {
    const chart = makeChart({
      secondLord: 'Moon',
      secondLordSign: 'Taurus',
      moonSign: 'Taurus',
      moonLongitude: 13.34,
      julianDay: dateToJd(new Date('2000-01-01T00:00:00Z')),
    });
    const scores = computeWealthScores({ chart, partnerChart: null }, null);
    expect(scores.wealthArc).toHaveLength(3);
    for (const band of scores.wealthArc as { score: number }[]) {
      expect(band.score).toBeGreaterThanOrEqual(0);
      expect(band.score).toBeLessThanOrEqual(100);
    }
  });

  it('falls back to the neutral no-data score (50, mixed) when the chart has no derivable dasha tree', () => {
    const chart = makeChart({});
    const scores = computeWealthScores({ chart, partnerChart: null }, null);
    for (const band of scores.wealthArc as { score: number; tone: string }[]) {
      expect(band.score).toBe(50);
      expect(band.tone).toBe('mixed');
    }
  });
});

describe('computeWealthScores — doshaYoga', () => {
  it('surfaces a present Kemdruma Dosha caution', () => {
    const chart = makeChart({});
    const doshaData = { kemDruma: { present: true, severity: 'high' } };
    const scores = computeWealthScores({ chart, partnerChart: null, doshaData }, null);
    expect(scores.doshaYoga).toEqual({
      positives: [],
      cautions: [{ label: 'Kemdruma Dosha', detail: 'high severity' }],
    });
  });

  it('surfaces a present Dhana yoga positive', () => {
    const chart = makeChart({});
    const yogaData = {
      yogas: [
        {
          type: 'dhana',
          name: 'Dhana Yoga',
          present: true,
          description: 'Wealth-giving combination.',
        },
      ],
    };
    const scores = computeWealthScores({ chart, partnerChart: null, yogaData }, null);
    expect(scores.doshaYoga).toEqual({
      positives: [{ label: 'Dhana Yoga', detail: 'Wealth-giving combination.' }],
      cautions: [],
    });
  });

  it('surfaces a present Raja yoga positive (broadened alongside dhana/mahapurusha/lunar)', () => {
    const chart = makeChart({});
    const yogaData = {
      yogas: [{ type: 'raja', name: 'Raja Yoga', present: true, description: 'x' }],
    };
    const scores = computeWealthScores({ chart, partnerChart: null, yogaData }, null);
    expect(scores.doshaYoga).toEqual({
      positives: [{ label: 'Raja Yoga', detail: 'x' }],
      cautions: [],
    });
  });

  it('surfaces present Guru Chandal, Kaal Sarp, and Pitra dosha cautions (broadened alongside kemDruma)', () => {
    const chart = makeChart({});
    const doshaData = {
      guruChandal: { present: true, house: 5, severity: 'medium' },
      kaalSarp: { present: true, name: 'Kaal Sarp', severity: 'high', isPartial: false },
      pitra: { present: true, severity: 'low' },
    };
    const scores = computeWealthScores({ chart, partnerChart: null, doshaData }, null);
    expect(scores.doshaYoga.cautions.map((c) => c.label).sort()).toEqual(
      ['Guru Chandal Dosha', 'Kaal Sarp Dosha', 'Pitra Dosha'].sort(),
    );
  });

  it('still ignores dosha/yoga types outside the (broadened) allowlist', () => {
    const chart = makeChart({});
    // mangal (Manglik) is not wealth-relevant per this report's allowlist; 'solar'-type yogas
    // aren't either (dhana/raja/mahapurusha/lunar are).
    const doshaData = { mangal: { present: true, severity: 'high' } };
    const yogaData = {
      yogas: [{ type: 'solar', name: 'Some Solar Yoga', present: true, description: 'x' }],
    };
    const scores = computeWealthScores({ chart, partnerChart: null, doshaData, yogaData }, null);
    expect(scores.doshaYoga).toEqual({ positives: [], cautions: [] });
  });

  it('degrades to empty positives/cautions when doshaData/yogaData are missing (never throws)', () => {
    const chart = makeChart({});
    expect(() => computeWealthScores({ chart, partnerChart: null }, null)).not.toThrow();
    expect(computeWealthScores({ chart, partnerChart: null }, null).doshaYoga).toEqual({
      positives: [],
      cautions: [],
    });
  });
});

describe('computeWealthScores — spendingVsSavingTilt', () => {
  it('is 5 (balanced) when the 2nd and 11th lords are equally strong', () => {
    const chart = makeChart({
      secondLord: 'Saturn',
      secondLordSign: 'Gemini', // average (60)
      eleventhLord: 'Mars',
      eleventhLordSign: 'Libra', // average (60)
    });
    expect(computeWealthScores({ chart, partnerChart: null }, null).spendingVsSavingTilt).toBe(5);
  });

  it('leans toward spending/gains (10) when the 11th lord is notably stronger than the 2nd lord', () => {
    const chart = makeChart({
      secondLord: 'Sun',
      secondLordSign: 'Libra', // weak (30)
      eleventhLord: 'Mercury',
      eleventhLordSign: 'Virgo', // strong (90)
    });
    // raw = 5 + (90-30)/12 = 10
    expect(computeWealthScores({ chart, partnerChart: null }, null).spendingVsSavingTilt).toBe(10);
  });

  it('leans toward saving/accumulation (0) when the 2nd lord is notably stronger than the 11th lord', () => {
    const chart = makeChart({
      secondLord: 'Mercury',
      secondLordSign: 'Virgo', // strong (90)
      eleventhLord: 'Sun',
      eleventhLordSign: 'Libra', // weak (30)
    });
    // raw = 5 + (30-90)/12 = 0
    expect(computeWealthScores({ chart, partnerChart: null }, null).spendingVsSavingTilt).toBe(0);
  });
});
