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

  if (opts.fifthLord)
    houses.push({ house: 5, lord: opts.fifthLord, sign: opts.fifthLordSign ?? 'Aries' });
  if (opts.seventhLord)
    houses.push({ house: 7, lord: opts.seventhLord, sign: opts.seventhLordSign ?? 'Aries' });
  if (opts.fourthLord)
    houses.push({ house: 4, lord: opts.fourthLord, sign: opts.fourthLordSign ?? 'Aries' });

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
    const chart = makeChart({
      seventhLord: 'Jupiter',
      seventhLordSign: 'Capricorn',
      venusSign: 'Aries',
    });
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

// =============================================================================
// New shared-block fields: windows, ageBands, archetype, romanceArc, doshaYoga
// =============================================================================

const MS_PER_DAY = 86_400_000;
const UNIX_EPOCH_JD = 2440587.5;
function dateToJd(date: Date): number {
  return date.getTime() / MS_PER_DAY + UNIX_EPOCH_JD;
}

/** Same synthetic mahadasha builder as report-timing.spec.ts/dasha-confidence.spec.ts —
 * gives every planet (including Venus, this report's always-included significator) a real
 * multi-year Mahadasha starting at `now`, so `scoreDomainWindows` has something to find. */
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

/** A more complete chart fixture (julianDay for age-band birth-date derivation, houses 5/7,
 * optional extra planet placements) used only by the tests below — kept separate from the
 * pre-existing `makeChart` above so its romanceScore/partnershipScore/tilt tests stay untouched. */
function makeFullChart(opts: {
  birthDate: Date;
  fifthLord?: string;
  fifthLordSign?: string;
  fifthHouseSign?: string;
  seventhLord?: string;
  seventhLordSign?: string;
  seventhHouseSign?: string;
  extraPlanets?: Array<{ planet: string; sign?: string; house?: number }>;
}): Record<string, unknown> {
  const planets: Record<string, unknown>[] = [];
  const houses: Record<string, unknown>[] = [];

  if (opts.fifthLord) {
    planets.push({ planet: opts.fifthLord, sign: opts.fifthLordSign ?? 'Aries' });
    houses.push({
      house: 5,
      lord: opts.fifthLord,
      sign: opts.fifthHouseSign ?? opts.fifthLordSign ?? 'Aries',
    });
  }
  if (opts.seventhLord) {
    planets.push({ planet: opts.seventhLord, sign: opts.seventhLordSign ?? 'Aries' });
    houses.push({
      house: 7,
      lord: opts.seventhLord,
      sign: opts.seventhHouseSign ?? opts.seventhLordSign ?? 'Aries',
    });
  }
  for (const p of opts.extraPlanets ?? []) {
    planets.push({ planet: p.planet, sign: p.sign ?? 'Aries', house: p.house });
  }

  return { julianDay: dateToJd(opts.birthDate), planets, houses };
}

describe('computeTrueLoveScores — windows (love-domain timing)', () => {
  it('finds timing windows using the union of 5th/7th house lord/occupants plus Venus', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const dashaData = makeDasha(now);
    const chart = makeFullChart({ birthDate: new Date('1995-06-15T00:00:00Z') });

    const scores = computeTrueLoveScores({ chart, partnerChart: null, dashaData }, null, now);

    expect(Array.isArray(scores.windows)).toBe(true);
    expect(scores.windows.length).toBeGreaterThan(0);
  });

  it('returns an empty windows array (never throws) when dashaData is missing', () => {
    const chart = makeFullChart({ birthDate: new Date('1995-06-15T00:00:00Z') });
    expect(() => computeTrueLoveScores({ chart, partnerChart: null }, null)).not.toThrow();
    expect(computeTrueLoveScores({ chart, partnerChart: null }, null).windows).toEqual([]);
  });
});

describe('computeTrueLoveScores — ageBands', () => {
  it('produces 4 age bands anchored to the birth date derived from chart.julianDay', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const chart = makeFullChart({ birthDate: new Date('1995-06-15T00:00:00Z') });

    const scores = computeTrueLoveScores({ chart, partnerChart: null }, null, now);

    expect(scores.ageBands).toHaveLength(4);
    for (const band of scores.ageBands) {
      expect(['HIGH', 'MEDIUM', 'LOW', 'NONE']).toContain(band.confidence);
    }
  });

  it('never throws when the chart has no julianDay (falls back to `now` as birth date)', () => {
    const chart = { planets: [], houses: [] };
    expect(() => computeTrueLoveScores({ chart, partnerChart: null }, null)).not.toThrow();
    expect(computeTrueLoveScores({ chart, partnerChart: null }, null).ageBands).toHaveLength(4);
  });

  it('never throws on a null chart and degrades every band to NONE confidence', () => {
    expect(() => computeTrueLoveScores({ chart: null, partnerChart: null }, null)).not.toThrow();
    const scores = computeTrueLoveScores({ chart: null, partnerChart: null }, null);
    expect(scores.ageBands).toHaveLength(4);
    expect(scores.ageBands.every((b) => b.confidence === 'NONE')).toBe(true);
  });
});

describe('computeTrueLoveScores — archetype', () => {
  it('themes the archetype on the 5th house sign and returns exactly 5 order-matched trait tilts', () => {
    const chart = makeFullChart({
      birthDate: new Date('1995-06-15T00:00:00Z'),
      fifthLord: 'Sun',
      fifthHouseSign: 'Leo',
    });

    const scores = computeTrueLoveScores({ chart, partnerChart: null }, null);

    expect(scores.archetype.label).toBeTruthy();
    expect(scores.archetype.description).toContain('Leo');
    expect(scores.archetype.traits).toHaveLength(5);
    expect(scores.archetype.traits.map((t) => t.label)).toEqual([
      'Passion',
      'Openness',
      'Loyalty',
      'Spontaneity',
      'Depth',
    ]);
  });

  it("scores each trait from its documented significator's natal strength (0-10 scale)", () => {
    const chart = makeFullChart({
      birthDate: new Date('1995-06-15T00:00:00Z'),
      extraPlanets: [{ planet: 'Mars', sign: 'Capricorn' }], // exalted => strong (90) => tilt 9
    });

    const scores = computeTrueLoveScores({ chart, partnerChart: null }, null);

    const passion = scores.archetype.traits.find((t) => t.label === 'Passion');
    expect(passion?.score).toBe(9);
  });

  it('degrades to a generic description (never throws) when the 5th house sign is unavailable', () => {
    expect(() => computeTrueLoveScores({ chart: null, partnerChart: null }, null)).not.toThrow();
    const scores = computeTrueLoveScores({ chart: null, partnerChart: null }, null);
    expect(scores.archetype.traits).toHaveLength(5);
    expect(scores.archetype.description).toBeTruthy();
  });
});

describe('computeTrueLoveScores — partnerArchetype (who you are naturally drawn to)', () => {
  it('themes the partner archetype on the 7th house sign, distinct from the 5th-house-themed archetype', () => {
    const chart = makeFullChart({
      birthDate: new Date('1995-06-15T00:00:00Z'),
      fifthLord: 'Sun',
      fifthHouseSign: 'Leo',
      seventhLord: 'Saturn',
      seventhHouseSign: 'Capricorn',
    });

    const scores = computeTrueLoveScores({ chart, partnerChart: null }, null);

    expect(scores.partnerArchetype.label).toBeTruthy();
    expect(scores.partnerArchetype.description).toContain('Capricorn');
    expect(scores.archetype.description).toContain('Leo');
    expect(scores.partnerArchetype.traits).toHaveLength(5);
    expect(scores.partnerArchetype.traits.map((t) => t.label)).toEqual([
      'Warmth',
      'Discipline',
      'Intellect',
      'Sensuality',
      'Ambition',
    ]);
  });

  it("scores each partner trait from its documented significator's natal strength (0-10 scale)", () => {
    const chart = makeFullChart({
      birthDate: new Date('1995-06-15T00:00:00Z'),
      extraPlanets: [{ planet: 'Saturn', sign: 'Libra' }], // exalted => strong (90) => tilt 9
    });

    const scores = computeTrueLoveScores({ chart, partnerChart: null }, null);

    const discipline = scores.partnerArchetype.traits.find((t) => t.label === 'Discipline');
    expect(discipline?.score).toBe(9);
  });

  it('degrades to a generic description (never throws) when the 7th house sign is unavailable', () => {
    expect(() => computeTrueLoveScores({ chart: null, partnerChart: null }, null)).not.toThrow();
    const scores = computeTrueLoveScores({ chart: null, partnerChart: null }, null);
    expect(scores.partnerArchetype.traits).toHaveLength(5);
    expect(scores.partnerArchetype.description).toBeTruthy();
  });
});

describe('computeTrueLoveScores — romanceArc', () => {
  it('produces 3 forward-looking decade bands scored against the 5th/7th houses', () => {
    const chart = makeFullChart({ birthDate: new Date('1995-06-15T00:00:00Z') });

    const scores = computeTrueLoveScores({ chart, partnerChart: null }, null);

    expect(scores.romanceArc).toHaveLength(3);
    for (const band of scores.romanceArc) {
      expect(band.score).toBeGreaterThanOrEqual(0);
      expect(band.score).toBeLessThanOrEqual(100);
      expect(['challenging', 'mixed', 'favorable']).toContain(band.tone);
    }
  });

  it('never throws on a null chart', () => {
    expect(() => computeTrueLoveScores({ chart: null, partnerChart: null }, null)).not.toThrow();
  });
});

describe('computeTrueLoveScores — doshaYoga', () => {
  it('flags Mangal Dosha as a caution when present in doshaData (previously-missing gap-fill)', () => {
    const chart = makeFullChart({ birthDate: new Date('1995-06-15T00:00:00Z') });
    const doshaData = { mangal: { present: true, severity: 'high', type: 'uncancelled' } };

    const scores = computeTrueLoveScores({ chart, partnerChart: null, doshaData }, null);

    expect(scores.doshaYoga.cautions).toHaveLength(1);
    expect(scores.doshaYoga.cautions[0]?.label).toBe('Mangal Dosha');
  });

  it('flags Kaal Sarp Dosha as a caution when present (broadened alongside mangal)', () => {
    const chart = makeFullChart({ birthDate: new Date('1995-06-15T00:00:00Z') });
    const doshaData = { kaalSarp: { present: true, name: 'Kaal Sarp', severity: 'medium' } };

    const scores = computeTrueLoveScores({ chart, partnerChart: null, doshaData }, null);

    expect(scores.doshaYoga.cautions).toHaveLength(1);
    expect(scores.doshaYoga.cautions[0]?.label).toBe('Kaal Sarp Dosha');
  });

  it('surfaces a present benefic/mahapurusha yoga as a positive (dhana replaced — thematically odd for a love report)', () => {
    const chart = makeFullChart({ birthDate: new Date('1995-06-15T00:00:00Z') });
    const yogaData = {
      yogas: [
        {
          type: 'mahapurusha',
          name: 'Ruchaka Yoga',
          present: true,
          strength: 80,
          description: 'A classical Mahapurusha combination.',
        },
      ],
    };

    const scores = computeTrueLoveScores({ chart, partnerChart: null, yogaData }, null);

    expect(scores.doshaYoga.positives).toHaveLength(1);
    expect(scores.doshaYoga.positives[0]?.label).toBe('Ruchaka Yoga');
  });

  it('ignores yoga types outside the [benefic, mahapurusha] scope, including dhana (removed as thematically odd for love)', () => {
    const chart = makeFullChart({ birthDate: new Date('1995-06-15T00:00:00Z') });
    const yogaData = {
      yogas: [
        { type: 'dhana', name: 'Some Dhana Yoga', present: true, strength: 80, description: 'x' },
      ],
    };

    const scores = computeTrueLoveScores({ chart, partnerChart: null, yogaData }, null);

    expect(scores.doshaYoga.positives).toHaveLength(0);
  });

  it('never throws and degrades to empty positives/cautions when doshaData/yogaData are missing', () => {
    const chart = makeFullChart({ birthDate: new Date('1995-06-15T00:00:00Z') });
    expect(() => computeTrueLoveScores({ chart, partnerChart: null }, null)).not.toThrow();
    const scores = computeTrueLoveScores({ chart, partnerChart: null }, null);
    expect(scores.doshaYoga).toEqual({ positives: [], cautions: [] });
  });
});
