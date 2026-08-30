import { describe, expect, it } from 'vitest';
import { computeMarriageScores } from '../src/lib/astro-engine/reports/marriage.js';

const MS_PER_DAY = 86_400_000;
const DAYS_PER_YEAR = 365.25;
const MS_PER_YEAR = DAYS_PER_YEAR * MS_PER_DAY;
const UNIX_EPOCH_JD = 2440587.5;

/** Exact inverse of chart-facts.ts's julianDayToDate (verified there against this same formula). */
function dateToJd(date: Date): number {
  return date.getTime() / MS_PER_DAY + UNIX_EPOCH_JD;
}

interface PlanetOpts {
  sign: string;
  signIndex?: number;
  house?: number;
  isRetrograde?: boolean;
}

interface ChartOpts {
  ascendantSignIndex?: number;
  moon?: PlanetOpts & { longitude?: number };
  mars?: PlanetOpts;
  venus?: PlanetOpts;
  jupiter?: PlanetOpts;
  mercury?: PlanetOpts;
  rahu?: PlanetOpts;
  houses?: Array<{ house: number; lord: string; sign: string }>;
  julianDay?: number;
}

function makeChart(opts: ChartOpts = {}): Record<string, unknown> {
  const planets: Record<string, unknown>[] = [];
  if (opts.moon) planets.push({ planet: 'Moon', ...opts.moon });
  if (opts.mars) planets.push({ planet: 'Mars', ...opts.mars });
  if (opts.venus) planets.push({ planet: 'Venus', ...opts.venus });
  if (opts.jupiter) planets.push({ planet: 'Jupiter', ...opts.jupiter });
  if (opts.mercury) planets.push({ planet: 'Mercury', ...opts.mercury });
  if (opts.rahu) planets.push({ planet: 'Rahu', ...opts.rahu });

  const chart: Record<string, unknown> = {
    ascendant: { signIndex: opts.ascendantSignIndex ?? 0 },
    planets,
    houses: opts.houses ?? [],
  };
  if (opts.julianDay !== undefined) chart.julianDay = opts.julianDay;
  return chart;
}

/** Same synthetic mahadasha builder used by dasha-confidence.spec.ts / dasha-window.spec.ts,
 * generalized to accept a custom planet/duration sequence and start date. */
function makeDashaTree(
  sequence: Array<[string, number]>,
  start: Date,
): { vimshottari: { mahadashas: unknown[] } } {
  let cursor = new Date(start.getTime());
  const mahadashas = sequence.map(([planet, years]) => {
    const startDate = new Date(cursor.getTime());
    const endDate = new Date(cursor.getTime() + years * MS_PER_YEAR);
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
  (mahadashas[0] as { isActive: boolean }).isActive = true;
  return { vimshottari: { mahadashas } };
}

describe('computeMarriageScores — marriageScore + band', () => {
  it('averages 7th-lord/Venus/Jupiter strength scores using the documented 30/60/90 mapping', () => {
    // 7th lord = Mercury, in own sign Virgo => strong (90).
    // Venus exalted in Pisces => strong (90).
    // Jupiter debilitated in Capricorn => weak (30).
    // Average = (90 + 90 + 30) / 3 = 70.
    const chart = makeChart({
      mercury: { sign: 'Virgo', house: 7 },
      venus: { sign: 'Pisces', house: 12 },
      jupiter: { sign: 'Capricorn', house: 10 },
      houses: [
        { house: 7, lord: 'Mercury', sign: 'Virgo' },
        { house: 4, lord: 'Moon', sign: 'Cancer' },
      ],
    });

    const scores = computeMarriageScores({ chart, partnerChart: null }, null);
    expect(scores.marriageScore).toBe(70);
  });

  it('classifies band: <40 slow_build, 40-70 steady (inclusive), >70 accelerated', () => {
    const slow = makeChart({
      mercury: { sign: 'Pisces' },
      venus: { sign: 'Virgo' },
      jupiter: { sign: 'Capricorn' },
      houses: [{ house: 7, lord: 'Mercury', sign: 'Pisces' }],
    });
    expect(computeMarriageScores({ chart: slow, partnerChart: null }, null).band).toBe(
      'slow_build',
    );

    const steady = makeChart({
      mercury: { sign: 'Virgo' },
      venus: { sign: 'Pisces' },
      jupiter: { sign: 'Capricorn' },
      houses: [{ house: 7, lord: 'Mercury', sign: 'Virgo' }],
    });
    expect(computeMarriageScores({ chart: steady, partnerChart: null }, null).band).toBe('steady');

    const accelerated = makeChart({
      mercury: { sign: 'Gemini' },
      venus: { sign: 'Libra' },
      jupiter: { sign: 'Sagittarius' },
      houses: [{ house: 7, lord: 'Mercury', sign: 'Gemini' }],
    });
    expect(computeMarriageScores({ chart: accelerated, partnerChart: null }, null).band).toBe(
      'accelerated',
    );
  });

  it('defaults the 7th-lord strength to average (60) when houses data is missing', () => {
    const chart = makeChart({
      venus: { sign: 'Pisces' },
      jupiter: { sign: 'Capricorn' },
      houses: [],
    });
    expect(computeMarriageScores({ chart, partnerChart: null }, null).marriageScore).toBe(60);
  });
});

describe('computeMarriageScores — manglik', () => {
  it('reports isManglik true / cancelled false for an uncancelled Mangal Dosha', () => {
    const chart = makeChart({
      ascendantSignIndex: 0,
      mars: { sign: 'Taurus', signIndex: 1 },
    });
    const scores = computeMarriageScores({ chart, partnerChart: null }, null);
    expect(scores.manglik.isManglik).toBe(true);
    expect(scores.manglik.cancelled).toBe(false);
  });

  it('reports isManglik + cancelled from detectMangalDosha, matching its own classical rules', () => {
    const chart = makeChart({
      ascendantSignIndex: 0,
      mars: { sign: 'Aries', signIndex: 0 },
    });
    const scores = computeMarriageScores({ chart, partnerChart: null }, null);
    expect(scores.manglik.isManglik).toBe(true);
    expect(scores.manglik.cancelled).toBe(true);
  });

  it('reports isManglik false when Mars is not in any Manglik house', () => {
    const chart = makeChart({
      ascendantSignIndex: 0,
      mars: { sign: 'Gemini', signIndex: 2 },
    });
    const scores = computeMarriageScores({ chart, partnerChart: null }, null);
    expect(scores.manglik.isManglik).toBe(false);
  });
});

describe('computeMarriageScores — 7th house sign + family + enrichment', () => {
  it('exposes the 7th house sign for the classical temperament sketch', () => {
    const chart = makeChart({ houses: [{ house: 7, lord: 'Mars', sign: 'Aries' }] });
    const scores = computeMarriageScores({ chart, partnerChart: null }, null);
    expect(scores.seventhHouseSign).toBe('Aries');
  });

  it('exposes the 4th-lord strength for the Family & In-Laws section', () => {
    const chart = makeChart({
      houses: [{ house: 4, lord: 'Venus', sign: 'Pisces' }],
      venus: { sign: 'Pisces' },
    });
    const scores = computeMarriageScores({ chart, partnerChart: null }, null);
    expect(scores.fourthLordStrength).toBe('strong');
  });

  it('exposes seventhLordReason/venusReason/jupiterReason from analyzePlanetStrengths', () => {
    const chart = makeChart({
      houses: [{ house: 7, lord: 'Mercury', sign: 'Virgo' }],
      mercury: { sign: 'Virgo' },
      venus: { sign: 'Pisces' },
      jupiter: { sign: 'Capricorn' },
    });
    const scores = computeMarriageScores({ chart, partnerChart: null }, null);
    expect(typeof scores.seventhLordReason).toBe('string');
    expect(scores.seventhLordReason.length).toBeGreaterThan(0);
    expect(typeof scores.venusReason).toBe('string');
    expect(typeof scores.jupiterReason).toBe('string');
  });

  it('builds a partnerArchetype with a generic label, a description, and exactly 5 trait tilts', () => {
    const chart = makeChart({ houses: [{ house: 7, lord: 'Mars', sign: 'Aries' }] });
    const scores = computeMarriageScores({ chart, partnerChart: null }, null);
    expect(scores.partnerArchetype.label.length).toBeGreaterThan(0);
    expect(scores.partnerArchetype.description).toContain('Aries');
    expect(scores.partnerArchetype.traits).toHaveLength(5);
    expect(scores.partnerArchetype.traits.map((t) => t.label)).toEqual([
      'Warmth',
      'Discipline',
      'Intellect',
      'Sensuality',
      'Ambition',
    ]);
    for (const trait of scores.partnerArchetype.traits) {
      expect(trait.score).toBeGreaterThanOrEqual(0);
      expect(trait.score).toBeLessThanOrEqual(10);
    }
  });

  it('builds an inLaws note referencing the 4th house sign and fourthLordStrength', () => {
    const chart = makeChart({
      houses: [{ house: 4, lord: 'Venus', sign: 'Pisces' }],
      venus: { sign: 'Pisces' },
    });
    const scores = computeMarriageScores({ chart, partnerChart: null }, null);
    expect(scores.inLaws.fourthHouseSign).toBe('Pisces');
    expect(scores.inLaws.note).toContain('Pisces');
    expect(scores.inLaws.note.length).toBeGreaterThan(0);
  });

  it('builds a moneyAfterMarriage note referencing 2nd/11th house signs', () => {
    const chart = makeChart({
      houses: [
        { house: 2, lord: 'Sun', sign: 'Leo' },
        { house: 11, lord: 'Moon', sign: 'Cancer' },
      ],
    });
    const scores = computeMarriageScores({ chart, partnerChart: null }, null);
    expect(scores.moneyAfterMarriage.secondHouseSign).toBe('Leo');
    expect(scores.moneyAfterMarriage.eleventhHouseSign).toBe('Cancer');
    expect(scores.moneyAfterMarriage.note).toContain('Leo');
    expect(scores.moneyAfterMarriage.note).toContain('Cancer');
  });

  it('computes marriageQualityArc as 3 decade bands by default', () => {
    const chart = makeChart({ houses: [{ house: 7, lord: 'Mars', sign: 'Aries' }] });
    const scores = computeMarriageScores({ chart, partnerChart: null }, null);
    expect(scores.marriageQualityArc).toHaveLength(3);
    for (const band of scores.marriageQualityArc) {
      expect(['challenging', 'mixed', 'favorable']).toContain(band.tone);
    }
  });

  it('exposes modernRealities.rahuHouse and seventhHousePlanetCount from chart data', () => {
    const chart = makeChart({
      rahu: { sign: 'Leo', house: 9 },
      mars: { sign: 'Aries', house: 7 },
      venus: { sign: 'Aries', house: 7 },
      houses: [{ house: 7, lord: 'Mars', sign: 'Aries' }],
    });
    const scores = computeMarriageScores({ chart, partnerChart: null }, null);
    expect(scores.modernRealities.rahuHouse).toBe(9);
    expect(scores.modernRealities.seventhHousePlanetCount).toBe(2);
  });
});

describe('computeMarriageScores — dosha/yoga summary', () => {
  it('surfaces relevant present doshas as cautions and relevant present yogas as positives', () => {
    const chart = makeChart({ houses: [{ house: 7, lord: 'Mars', sign: 'Aries' }] });
    const doshaData = {
      mangal: { present: true, severity: 'high', type: 'from_lagna' },
      kaalSarp: { present: false },
    };
    const yogaData = {
      yogas: [
        {
          type: 'raja',
          name: 'Raja Yoga',
          present: true,
          description: 'A classical Raja Yoga is present.',
        },
        { type: 'dhana', name: 'Dhana Yoga', present: false, description: 'not present' },
      ],
    };
    const scores = computeMarriageScores({ chart, partnerChart: null, doshaData, yogaData }, null);
    expect(scores.doshaYoga.cautions.some((c) => c.label === 'Mangal Dosha')).toBe(true);
    expect(scores.doshaYoga.positives.some((p) => p.label === 'Raja Yoga')).toBe(true);
  });

  it('degrades to empty positives/cautions when doshaData/yogaData are null', () => {
    const chart = makeChart({ houses: [{ house: 7, lord: 'Mars', sign: 'Aries' }] });
    const scores = computeMarriageScores({ chart, partnerChart: null }, null);
    expect(scores.doshaYoga.positives).toEqual([]);
    expect(scores.doshaYoga.cautions).toEqual([]);
  });
});

describe('computeMarriageScores — defensive handling', () => {
  it('does not throw on a null chart', () => {
    expect(() => computeMarriageScores({ chart: null, partnerChart: null }, null)).not.toThrow();
  });

  it('does not throw when doshaData/yogaData/dashaData/ashtakavargaData are all absent', () => {
    expect(() =>
      computeMarriageScores({ chart: { planets: [], houses: [] }, partnerChart: null }, null),
    ).not.toThrow();
  });

  it('returns an empty windows array and null jupiterDharmaWindow when dashaData is absent', () => {
    const scores = computeMarriageScores(
      { chart: { planets: [], houses: [] }, partnerChart: null },
      null,
    );
    expect(scores.windows).toEqual([]);
    expect(scores.jupiterDharmaWindow).toBeNull();
  });

  it('degrades ageBands to [] when the chart has no julianDay to derive a birth date', () => {
    const scores = computeMarriageScores(
      { chart: { planets: [], houses: [] }, partnerChart: null },
      null,
    );
    expect(scores.ageBands).toEqual([]);
    expect(scores.modernRealities.lateMarriageLeaning).toBe(false);
  });

  it('computes a non-empty ageBands table when julianDay IS present', () => {
    const chart = makeChart({
      houses: [{ house: 7, lord: 'Mars', sign: 'Aries' }],
      julianDay: dateToJd(new Date('1995-06-15T00:00:00Z')),
    });
    const scores = computeMarriageScores({ chart, partnerChart: null }, null);
    expect(scores.ageBands.length).toBe(4);
  });
});

describe('computeMarriageScores — timing windows (the actual bug fix)', () => {
  it('finds a near-term Pratyantardasha-level marriage window even when the current Mahadasha has no Antardasha-level match left — the exact defect the old bespoke Antardasha-only search could never see', () => {
    // Mahadasha sequence starting at Venus's own 20-year Mahadasha (standard Vimshottari
    // year-lengths), then wrapping through the fixed Vimshottari order from Venus onward:
    // Venus, Sun, Moon, Mars, Rahu, Jupiter, Saturn, Mercury, Ketu.
    const now = new Date();
    const treeStart = new Date(now.getTime() - 3.5 * MS_PER_YEAR);
    const sequence: Array<[string, number]> = [
      ['Venus', 20],
      ['Sun', 6],
      ['Moon', 10],
      ['Mars', 7],
      ['Rahu', 18],
      ['Jupiter', 16],
      ['Saturn', 19],
      ['Mercury', 17],
      ['Ketu', 7],
    ];
    const dashaData = makeDashaTree(sequence, treeStart);

    // "now" is 3.5 years into Venus's own 20-year Mahadasha. Venus's OWN Antardasha within its
    // own Mahadasha cycle is the FIRST slot (self-first ordering) and lasts proportionally
    // (20/120)*20 = ~3.33 years — already elapsed by "now". Since each of the 9 Antardasha slots
    // within a Mahadasha belongs to a DIFFERENT planet, Venus has NO further Antardasha-level
    // self-match anywhere in its own (current) Mahadasha. Its next two Antardasha-level
    // occurrences (one each within the following Sun and Moon Mahadashas, the 2nd/3rd Mahadashas
    // in the 3-Mahadasha lookahead) are both roughly two-to-three DECADES away. But Venus
    // recurs as a Pratyantardasha lord roughly every ~9 months throughout the remainder of its
    // own current Mahadasha (nested inside whichever Antardasha is active) — including one
    // starting within about a year of "now".
    const chart = makeChart({ houses: [{ house: 7, lord: 'Venus', sign: 'Libra' }] });

    const scores = computeMarriageScores({ chart, partnerChart: null, dashaData }, null);

    expect(scores.windows.length).toBeGreaterThan(0);
    const pratyantardashaWindows = scores.windows.filter((w) => w.dashaLevel === 'pratyantardasha');
    const antardashaWindows = scores.windows.filter((w) => w.dashaLevel === 'antardasha');
    expect(pratyantardashaWindows.length).toBeGreaterThan(0);

    const yearsToFirstPratyantardasha =
      (new Date(pratyantardashaWindows[0]!.startDate).getTime() - now.getTime()) / MS_PER_YEAR;
    // Near-term: comfortably within the next couple of years (proving the fix — the OLD
    // Antardasha-only search would have reported nothing until Venus's own Antardasha recurs,
    // decades out, mirroring the real production bug this task fixes: report said "2031", chat
    // said "this year end or early next year").
    expect(yearsToFirstPratyantardasha).toBeGreaterThanOrEqual(-0.1);
    expect(yearsToFirstPratyantardasha).toBeLessThan(3);

    if (antardashaWindows.length > 0) {
      const yearsToFirstAntardasha =
        (new Date(antardashaWindows[0]!.startDate).getTime() - now.getTime()) / MS_PER_YEAR;
      expect(yearsToFirstAntardasha).toBeGreaterThan(yearsToFirstPratyantardasha);
    }
  });

  it('keeps jupiterDharmaWindow separate from the primary windows search', () => {
    const now = new Date();
    const treeStart = new Date(now.getTime() - 0.5 * MS_PER_YEAR);
    const sequence: Array<[string, number]> = [
      ['Sun', 6],
      ['Moon', 10],
      ['Mars', 7],
    ];
    const dashaData = makeDashaTree(sequence, treeStart);
    // 7th lord Mercury is not Jupiter, so the two searches use disjoint significator sets.
    const chart = makeChart({ houses: [{ house: 7, lord: 'Mercury', sign: 'Virgo' }] });

    const scores = computeMarriageScores({ chart, partnerChart: null, dashaData }, null);
    // jupiterDharmaWindow, if present, must be a plain {startDate, endDate} shape, not a
    // RankedWindow (no score/level/dashaLevel/reasoning leaking through).
    if (scores.jupiterDharmaWindow) {
      expect(Object.keys(scores.jupiterDharmaWindow).sort()).toEqual(['endDate', 'startDate']);
    }
  });
});

describe('computeMarriageScores — loveOrArrange', () => {
  /**
   * The card on the marriage screen renders this band verbatim, so it must be a real
   * three-way decision, not a constant. The tilt itself (Venus + 5th lord vs 7th lord + 4th
   * lord) is true-love.ts's own documented formula — asserted there; what is checked here is
   * that this report bands it at the ends of the 0-10 range and never crashes without a chart.
   */
  it('is one of the three bands, and stays defined on a chartless call', () => {
    const scores = computeMarriageScores({ chart: null, partnerChart: null }, null);
    expect(['love', 'arrange', 'mixed']).toContain(scores.loveOrArrange);
  });

  it('leans love when Venus and the 5th lord outrank the 7th and 4th lords', () => {
    const chart = makeChart({
      venus: { sign: 'Pisces', signIndex: 11, house: 5 }, // exalted
      houses: [
        { house: 4, lord: 'Sun', sign: 'Leo' },
        { house: 5, lord: 'Venus', sign: 'Pisces' },
        { house: 7, lord: 'Saturn', sign: 'Aries' }, // debilitated
      ],
    });
    const scores = computeMarriageScores({ chart, partnerChart: null }, null);
    expect(scores.loveOrArrange).toBe('love');
  });

  it('leans arrange when the 7th and 4th lords outrank Venus and the 5th lord', () => {
    const chart = makeChart({
      venus: { sign: 'Virgo', signIndex: 5, house: 6 }, // debilitated
      houses: [
        { house: 4, lord: 'Jupiter', sign: 'Cancer' }, // exalted
        { house: 5, lord: 'Venus', sign: 'Virgo' },
        { house: 7, lord: 'Mars', sign: 'Capricorn' }, // exalted
      ],
    });
    const scores = computeMarriageScores({ chart, partnerChart: null }, null);
    expect(scores.loveOrArrange).toBe('arrange');
  });
});

describe('computeMarriageScores — spouse synastry', () => {
  it('spouseSynastry is null when ctx.partnerChart is absent (unchanged existing behavior)', () => {
    const chart = makeChart({ moon: { sign: 'Cancer', house: 4 } });
    const scores = computeMarriageScores({ chart, partnerChart: null }, null);
    expect(scores.spouseSynastry).toBeNull();
    expect(scores.spouseName).toBeNull();
  });

  it('spouseSynastry is populated when ctx.partnerChart is present', () => {
    const chart = makeChart({ moon: { sign: 'Cancer', house: 4 } });
    const partnerChart = makeChart({ moon: { sign: 'Taurus', house: 4 } });
    const scores = computeMarriageScores(
      { chart, partnerChart, partnerName: 'Priya' },
      null,
    );
    expect(scores.spouseSynastry).not.toBeNull();
    expect(scores.spouseSynastry!.riskFactors.length).toBe(8);
    expect(scores.spouseName).toBe('Priya');
  });
});
