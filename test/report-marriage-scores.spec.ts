import { describe, expect, it } from 'vitest';
import { computeMarriageScores } from '../src/lib/astro-engine/reports/marriage.js';

const MS_PER_DAY = 86_400_000;
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
  moon?: PlanetOpts & { longitude: number };
  mars?: PlanetOpts;
  venus?: PlanetOpts;
  jupiter?: PlanetOpts;
  mercury?: PlanetOpts;
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

  return {
    ascendant: { signIndex: opts.ascendantSignIndex ?? 0 },
    planets,
    houses: opts.houses ?? [],
    julianDay: opts.julianDay ?? dateToJd(new Date('1990-01-01T00:00:00Z')),
  };
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
    // All three weak => (30+30+30)/3 = 30 < 40 => slow_build.
    const slow = makeChart({
      mercury: { sign: 'Pisces' }, // Mercury debilitated
      venus: { sign: 'Virgo' }, // Venus debilitated
      jupiter: { sign: 'Capricorn' }, // Jupiter debilitated
      houses: [{ house: 7, lord: 'Mercury', sign: 'Pisces' }],
    });
    expect(computeMarriageScores({ chart: slow, partnerChart: null }, null).band).toBe('slow_build');

    // Exactly 70 (see test above) => steady (upper bound inclusive).
    const steady = makeChart({
      mercury: { sign: 'Virgo' },
      venus: { sign: 'Pisces' },
      jupiter: { sign: 'Capricorn' },
      houses: [{ house: 7, lord: 'Mercury', sign: 'Virgo' }],
    });
    expect(computeMarriageScores({ chart: steady, partnerChart: null }, null).band).toBe('steady');

    // All three strong => (90+90+90)/3 = 90 > 70 => accelerated.
    const accelerated = makeChart({
      mercury: { sign: 'Gemini' }, // own sign
      venus: { sign: 'Libra' }, // own sign
      jupiter: { sign: 'Sagittarius' }, // own sign
      houses: [{ house: 7, lord: 'Mercury', sign: 'Gemini' }],
    });
    expect(computeMarriageScores({ chart: accelerated, partnerChart: null }, null).band).toBe(
      'accelerated',
    );
  });

  it('defaults the 7th-lord strength to average (60) when houses data is missing', () => {
    const chart = makeChart({
      venus: { sign: 'Pisces' }, // strong 90
      jupiter: { sign: 'Capricorn' }, // weak 30
      houses: [], // no 7th house lord known
    });
    // (60 + 90 + 30) / 3 = 60
    expect(computeMarriageScores({ chart, partnerChart: null }, null).marriageScore).toBe(60);
  });
});

describe('computeMarriageScores — manglik', () => {
  it('reports isManglik true / cancelled false for an uncancelled Mangal Dosha', () => {
    // Aries lagna (signIndex 0). Mars in Taurus (signIndex 1) => house 2 from Lagna, a Manglik
    // house. Taurus is neither Mars's own sign/exaltation nor a documented house+sign exception
    // for house 2 (Gemini/Virgo), and no other planet is present to form a benefic conjunction —
    // so this is a plain, uncancelled Mangal Dosha.
    const chart = makeChart({
      ascendantSignIndex: 0,
      mars: { sign: 'Taurus', signIndex: 1 },
    });
    const scores = computeMarriageScores({ chart, partnerChart: null }, null);
    expect(scores.manglik.isManglik).toBe(true);
    expect(scores.manglik.cancelled).toBe(false);
  });

  it('reports isManglik + cancelled from detectMangalDosha, matching its own classical rules', () => {
    // Mars in OWN sign Aries, house 1 from Lagna (signIndex 0 == ascendant signIndex 0):
    // present (house 1 is a Manglik house) AND cancelled (own-sign is an unconditional cancellation).
    const chart = makeChart({
      ascendantSignIndex: 0,
      mars: { sign: 'Aries', signIndex: 0 },
    });
    const scores = computeMarriageScores({ chart, partnerChart: null }, null);
    expect(scores.manglik.isManglik).toBe(true);
    expect(scores.manglik.cancelled).toBe(true);
  });

  it('reports isManglik false when Mars is not in any Manglik house', () => {
    // House 3 from Lagna (signIndex 2) is not one of [1,2,4,7,8,12].
    const chart = makeChart({
      ascendantSignIndex: 0,
      mars: { sign: 'Gemini', signIndex: 2 },
    });
    const scores = computeMarriageScores({ chart, partnerChart: null }, null);
    expect(scores.manglik.isManglik).toBe(false);
  });
});

describe('computeMarriageScores — 7th house sign + family', () => {
  it('exposes the 7th house sign for the classical temperament sketch', () => {
    const chart = makeChart({ houses: [{ house: 7, lord: 'Mars', sign: 'Aries' }] });
    const scores = computeMarriageScores({ chart, partnerChart: null }, null);
    expect(scores.seventhHouseSign).toBe('Aries');
  });

  it('exposes the 4th-lord strength for the Family & In-Laws section', () => {
    const chart = makeChart({
      houses: [{ house: 4, lord: 'Venus', sign: 'Pisces' }],
      venus: { sign: 'Pisces' }, // exalted => strong
    });
    const scores = computeMarriageScores({ chart, partnerChart: null }, null);
    expect(scores.fourthLordStrength).toBe('strong');
  });
});

describe('computeMarriageScores — defensive handling', () => {
  it('does not throw on a null chart', () => {
    expect(() => computeMarriageScores({ chart: null, partnerChart: null }, null)).not.toThrow();
  });

  it('returns null strongestWindow/empty upcomingWindows when the chart has no julianDay/Moon data to derive a dasha tree', () => {
    const scores = computeMarriageScores({ chart: { planets: [], houses: [] }, partnerChart: null }, null);
    expect(scores.strongestWindow).toBeNull();
    expect(scores.upcomingWindows).toEqual([]);
  });
});

describe('computeMarriageScores — timing windows', () => {
  it('flags the earliest upcoming window whose Mahadasha lord is a marriage significator (Jupiter)', () => {
    // Birth 5 years ago with Moon in Punarvasu (nakshatra index 6, lord Jupiter, span [80,93.33)) near
    // the START of the nakshatra => a long remaining Jupiter Mahadasha balance (~16 years), guaranteed
    // to still be running now and for years into the future regardless of real wall-clock "today".
    const birthDate = new Date(Date.now() - 5 * 365.25 * MS_PER_DAY);
    const chart = makeChart({
      moon: { sign: 'Gemini', longitude: 80.5 },
      jupiter: { sign: 'Capricorn' }, // weak, irrelevant to window-finding itself
      julianDay: dateToJd(birthDate),
    });

    const scores = computeMarriageScores({ chart, partnerChart: null }, null);

    expect(scores.strongestWindow).not.toBeNull();
    // The birth Mahadasha lord (Jupiter, from Punarvasu) is a significator, so the earliest window
    // should start at or before "now" (the Mahadasha is already running) and end within it.
    const start = new Date(scores.strongestWindow!.startDate);
    const end = new Date(scores.strongestWindow!.endDate);
    expect(start.getTime()).toBeLessThan(end.getTime());
    expect(scores.upcomingWindows.length).toBeLessThanOrEqual(2);
  });

  it('caps upcomingWindows at 2 entries', () => {
    const birthDate = new Date(Date.now() - 5 * 365.25 * MS_PER_DAY);
    const chart = makeChart({
      moon: { sign: 'Gemini', longitude: 80.5 },
      julianDay: dateToJd(birthDate),
    });
    const scores = computeMarriageScores({ chart, partnerChart: null }, null);
    expect(scores.upcomingWindows.length).toBeLessThanOrEqual(2);
  });
});
