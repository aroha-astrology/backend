import { describe, expect, it } from 'vitest';
import { NAKSHATRAS } from '@aroha-astrology/shared';
import {
  avoidFlags,
  bestTimeOfDay,
  findWindows,
  pickBestDays,
  pickCautionDays,
  scoreDay,
  taraOf,
  type DaySky,
  type ScoredDay,
} from '../src/lib/astro-tools/decision-engine.js';
import { DECISION_SPECS, MUHURTA_SPECS } from '../src/lib/astro-tools/muhurta-rules.js';

const nak = (name: string) => NAKSHATRAS.indexOf(name as (typeof NAKSHATRAS)[number]);

/** A day with the Sun in Virgo, Mercury direct, Jupiter/Venus far from the Sun. */
function day(overrides: Partial<DaySky> = {}): DaySky {
  return {
    date: '2026-10-01',
    weekday: 4, // Thursday
    tithi: 5,
    nakshatraIndex: nak('Pushya'),
    moonSignIndex: 3,
    planets: [
      { planet: 'Sun', longitude: 165, signIndex: 5, sign: 'Virgo', isRetrograde: false },
      { planet: 'Moon', longitude: 100, signIndex: 3, sign: 'Cancer', isRetrograde: false },
      { planet: 'Mercury', longitude: 180, signIndex: 6, sign: 'Libra', isRetrograde: false },
      { planet: 'Jupiter', longitude: 100, signIndex: 3, sign: 'Cancer', isRetrograde: false },
      { planet: 'Venus', longitude: 200, signIndex: 6, sign: 'Libra', isRetrograde: false },
      { planet: 'Saturn', longitude: 335, signIndex: 11, sign: 'Pisces', isRetrograde: true },
    ],
    ...overrides,
  };
}

function scored(date: string, score: number, extra: Partial<ScoredDay> = {}): ScoredDay {
  const tone = score >= 62 ? 'good' : score <= 38 ? 'caution' : 'neutral';
  return { date, score, tone, avoid: [], why: [], ...extra };
}

describe('taraOf', () => {
  it('counts the day star from the birth star in cycles of nine', () => {
    expect(taraOf(0, 0)).toBe(1); // Janma
    expect(taraOf(0, 1)).toBe(2); // Sampat
    expect(taraOf(0, 9)).toBe(1); // next cycle
    expect(taraOf(26, 1)).toBe(3); // wraps past Revati
  });
});

describe('avoidFlags', () => {
  it('flags an eclipse for every category', () => {
    expect(avoidFlags(day({ eclipse: 'lunar' }), MUHURTA_SPECS.puja)).toEqual(['eclipse']);
  });

  it('flags Mercury retrograde only where agreements matter', () => {
    const retro = day({
      planets: day().planets.map((p) =>
        p.planet === 'Mercury' ? { ...p, isRetrograde: true } : p,
      ),
    });
    expect(avoidFlags(retro, MUHURTA_SPECS.agreement)).toEqual(['mercuryRetro']);
    expect(avoidFlags(retro, MUHURTA_SPECS.travel)).toEqual([]);
  });

  it('flags Kharmas (Sun in Sagittarius or Pisces) and a combust Venus for marriage', () => {
    const kharmas = day({
      planets: day().planets.map((p) =>
        p.planet === 'Sun' ? { ...p, signIndex: 8, sign: 'Sagittarius', longitude: 250 } : p,
      ),
    });
    expect(avoidFlags(kharmas, MUHURTA_SPECS.marriage)).toContain('kharmas');
    expect(avoidFlags(kharmas, MUHURTA_SPECS.vehicle)).toEqual([]);

    const combust = day({
      planets: day().planets.map((p) => (p.planet === 'Venus' ? { ...p, longitude: 170 } : p)),
    });
    expect(avoidFlags(combust, DECISION_SPECS.marriage)).toEqual(['combust']);
  });
});

describe('scoreDay', () => {
  it('rates a textbook vehicle day (Pushya, Panchami, Thursday) as good, with the panchang reasons first', () => {
    const d = scoreDay(day(), MUHURTA_SPECS.vehicle, 'muhurta');
    expect(d.tone).toBe('good');
    expect(d.score).toBe(76); // 50 + 14 + 6 + 6
    expect(d.why.map((f) => f.textKey)).toEqual([
      'decide.why.nakshatraGood',
      'decide.why.tithiGood',
      'decide.why.weekdayGood',
    ]);
    expect(d.why[0]!.params).toEqual({ nakshatra: 'Pushya' });
  });

  it('rates Bharani on a Rikta tithi on a Tuesday as one to avoid', () => {
    const d = scoreDay(
      day({ nakshatraIndex: nak('Bharani'), tithi: 9, weekday: 2 }),
      MUHURTA_SPECS.vehicle,
      'muhurta',
    );
    expect(d.tone).toBe('caution');
    expect(d.score).toBe(18); // 50 - 14 - 12 - 6
  });

  it('caps an eclipse day however good the panchang, and says why first', () => {
    const d = scoreDay(day({ eclipse: 'solar' }), MUHURTA_SPECS.vehicle, 'muhurta');
    expect(d.score).toBe(15);
    expect(d.avoid).toEqual(['eclipse']);
    expect(d.why[0]!.textKey).toBe('decide.why.eclipseSolar');
  });

  it("adds the person's tara and chandra bala, with Chandrashtama the strongest strain", () => {
    const personal = { moonSignIndex: 7, moonNakshatraIndex: nak('Pushya'), ascendantSignIndex: 0 };
    // Moon in Cancer = 9th from a Scorpio Moon (neutral chandra); Pushya from Pushya = Janma tara.
    const janma = scoreDay(day(), MUHURTA_SPECS.vehicle, 'muhurta', personal);
    expect(janma.score).toBe(72);

    // Moon in Gemini = 8th from a Scorpio Moon: Chandrashtama.
    const ashtama = scoreDay(day({ moonSignIndex: 2 }), MUHURTA_SPECS.vehicle, 'muhurta', personal);
    expect(ashtama.score).toBe(60);
    expect(ashtama.why.some((f) => f.textKey === 'decide.why.chandrashtama')).toBe(true);
  });

  it('in decision mode, the running dasha moves the whole range', () => {
    const personal = {
      moonSignIndex: 3,
      moonNakshatraIndex: nak('Punarvasu'),
      ascendantSignIndex: 0,
    };
    const strong = scoreDay(day(), DECISION_SPECS.careerChange, 'decision', personal, {
      score: 100,
      why: [{ kind: 'dasha', planet: 'Saturn', effect: 1, textKey: 'timeline.why.karaka' }],
    });
    const weak = scoreDay(day(), DECISION_SPECS.careerChange, 'decision', personal, {
      score: 0,
      why: [],
    });
    expect(strong.score - weak.score).toBe(40);
    expect(strong.why[0]!.textKey).toBe('timeline.why.karaka');
  });
});

describe('findWindows', () => {
  it('finds runs of three or more good or low days', () => {
    const days = [70, 72, 75, 50, 30, 20, 25, 50, 64, 50].map((s, i) =>
      scored(`2026-10-${String(i + 1).padStart(2, '0')}`, s),
    );
    expect(findWindows(days, 'muhurta')).toEqual([
      { start: '2026-10-01', end: '2026-10-03', tone: 'good', score: 72 },
      { start: '2026-10-05', end: '2026-10-07', tone: 'caution', score: 25 },
    ]);
  });
});

describe('pickBestDays / pickCautionDays', () => {
  const days = [
    scored('2026-10-01', 70),
    scored('2026-10-02', 80),
    scored('2026-10-03', 70),
    scored('2026-10-04', 30),
    scored('2026-10-05', 15, { avoid: ['eclipse'] }),
  ];

  it('best: highest first, earlier date on a tie', () => {
    expect(pickBestDays(days, 3).map((d) => d.date)).toEqual([
      '2026-10-02',
      '2026-10-01',
      '2026-10-03',
    ]);
  });

  it('caution: in calendar order', () => {
    expect(pickCautionDays(days).map((d) => d.date)).toEqual(['2026-10-04', '2026-10-05']);
  });
});

describe('bestTimeOfDay', () => {
  const choghadiyaDay = [
    { name: 'Udveg', type: 'bad', startTime: '06:00', endTime: '07:30' },
    { name: 'Labh', type: 'good', startTime: '07:30', endTime: '09:00' },
    { name: 'Amrit', type: 'good', startTime: '09:00', endTime: '10:30' },
  ];
  const abhijitMuhurta = { start: '11:48', end: '12:36' };

  it('prefers Abhijit Muhurta', () => {
    expect(
      bestTimeOfDay({
        weekday: 4,
        abhijitMuhurta,
        rahuKaal: { start: '13:30', end: '15:00' },
        choghadiyaDay,
      }),
    ).toEqual({ ...abhijitMuhurta, name: 'abhijit' });
  });

  it('skips Abhijit on a Wednesday and anything inside Rahu Kaal', () => {
    expect(
      bestTimeOfDay({
        weekday: 3,
        abhijitMuhurta,
        rahuKaal: { start: '09:00', end: '10:30' },
        choghadiyaDay,
      }),
    ).toEqual({ start: '07:30', end: '09:00', name: 'labh' });
  });
});
