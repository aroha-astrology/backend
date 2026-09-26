import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildKpNatal,
  distanceToSubBoundary,
  houseOf,
  kpPoint,
  rulingPlanets,
  significationOf,
} from '../src/lib/astro-engine/kp/kp-core.js';
import { antarasBetween } from '../src/lib/astro-engine/kp/kp-dasha.js';
import {
  kpQuestionsFromAnswers,
  questionTopic,
  screenKpQuestions,
} from '../src/lib/astro-engine/kp/kp-questions.js';
import { computeKpRawData } from '../src/lib/astro-engine/kp/kp-chart.js';
import {
  computeKpAnnualScores,
  reportMonths,
  type KpAnnualScores,
} from '../src/lib/astro-engine/reports/kp-annual.js';
import { dateToJulianDay } from '../src/lib/astro-engine/calculations/planetPositions.js';

const state = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock('../src/lib/llm/gemini-client.js', () => ({ generate: state.generate }));

const { generateKpAnnualNarrative, scrubPolicy, parseKpSections } =
  await import('../src/lib/llm/reports/kp-annual.js');
const { assertKpQuestionsAllowed, checkKpQuestions } =
  await import('../src/modules/reports/reports.service.js');

// A fixed, ordinary chart: 15 May 1990, 10:30 IST, New Delhi.
const DELHI = { lat: 28.6139, lon: 77.209 };
async function delhiRaw(start = '2026-09-25') {
  const birthJd = await dateToJulianDay(1990, 5, 15, 10, 30, 5.5);
  return computeKpRawData({ birthJd, latitude: DELHI.lat, longitude: DELHI.lon, start });
}

describe('KP core', () => {
  it('builds the sign/star/sub chain from the proportional rule', () => {
    // 0.5° Aries: Ashwini, Ketu star, Ketu sub (first sub is the star lord itself).
    const p = kpPoint(0.5);
    expect(p).toMatchObject({ sign: 'Aries', signLord: 'Mars', nakshatra: 'Ashwini' });
    expect(p.starLord).toBe('Ketu');
    expect(p.subLord).toBe('Ketu');
    // Ketu's sub is 0°46'40" wide — 0.8° is already Venus.
    expect(kpPoint(0.8).subLord).toBe('Venus');
  });

  it('measures the distance to the nearest sub boundary', () => {
    expect(distanceToSubBoundary(46 / 60 + 40 / 3600)).toBeLessThan(1e-9);
    expect(distanceToSubBoundary(0.4)).toBeCloseTo(0.3778, 3);
  });

  it('places a longitude in its Placidus house, across the 0° wrap', () => {
    const cusps = [350, 20, 50, 80, 110, 140, 170, 200, 230, 260, 290, 320];
    expect(houseOf(355, cusps)).toBe(1);
    expect(houseOf(5, cusps)).toBe(1);
    expect(houseOf(25, cusps)).toBe(2);
    expect(houseOf(330, cusps)).toBe(12);
  });

  it('grades significations through the star lord, and gives nodes their dispositor', () => {
    const cusps = Array.from({ length: 12 }, (_, i) => i * 30); // Aries rising, equal
    const chart = buildKpNatal(
      [
        { planet: 'Sun', longitude: 5 }, // house 1, Ashwini (Ketu star)
        { planet: 'Moon', longitude: 95 }, // house 4
        { planet: 'Mars', longitude: 275 }, // house 10
        { planet: 'Mercury', longitude: 35 },
        { planet: 'Jupiter', longitude: 185 },
        { planet: 'Venus', longitude: 65 },
        { planet: 'Saturn', longitude: 305 },
        { planet: 'Rahu', longitude: 215 }, // Scorpio — dispositor Mars
        { planet: 'Ketu', longitude: 35 },
      ],
      cusps,
    );
    const sun = significationOf('Sun', chart);
    // Sun sits in Ketu's star; Ketu occupies house 2 and owns nothing. Sun's own house 1.
    expect(sun.starLord).toBe('Ketu');
    expect(sun.strong).toEqual([1, 2]);
    // Sun owns Leo = house 5, a weaker L4 link.
    expect(sun.all).toContain(5);
    const rahu = significationOf('Rahu', chart);
    expect(rahu.nodeAgent).toBe('Mars');
    expect(rahu.all).toEqual(expect.arrayContaining([1, 8, 10]));
  });

  it('keeps all five Ruling Planet roles even when a planet repeats', () => {
    // Sunday; Moon and Ascendant both in Leo/Magha.
    const rp = rulingPlanets(0, 121, 122);
    expect(rp.map((r) => r.role)).toEqual([
      'DAY_LORD',
      'MOON_STAR_LORD',
      'MOON_SIGN_LORD',
      'ASC_SIGN_LORD',
      'ASC_STAR_LORD',
    ]);
    expect(rp.filter((r) => r.planet === 'Sun')).toHaveLength(3);
    expect(rp.filter((r) => r.planet === 'Ketu')).toHaveLength(2);
  });
});

describe('KP dasha window', () => {
  it('returns contiguous antaras that tile the whole window', () => {
    const birth = Date.UTC(1990, 4, 15, 5, 0);
    const from = Date.UTC(2026, 8, 25);
    const to = Date.UTC(2027, 8, 25);
    const spans = antarasBetween(95, birth, from, to);
    expect(spans.length).toBeGreaterThan(3);
    expect(spans[0]!.start <= '2026-09-25').toBe(true);
    expect(spans.at(-1)!.end >= '2027-09-25').toBe(true);
    for (let i = 1; i < spans.length; i++) {
      // ISO day strings: consecutive spans meet (or share a day at a sub-day boundary).
      expect(spans[i]!.start >= spans[i - 1]!.start).toBe(true);
      expect(spans[i]!.start <= spans[i - 1]!.end).toBe(true);
    }
  });

  it('starts the dasha from the Moon star lord with the unelapsed balance', () => {
    // Moon at the very start of Rohini (Moon star): the first Mahadasha is a full Moon dasha.
    const birth = Date.UTC(2000, 0, 1);
    const spans = antarasBetween(40 + 1e-9, birth, birth, birth + 86_400_000);
    expect(spans[0]).toMatchObject({ md: 'Moon', ad: 'Moon', pd: 'Moon' });
  });
});

describe('reader questions', () => {
  it('blocks death, lifespan and self-harm questions, with the helpline for self-harm', () => {
    const results = screenKpQuestions([
      'When will I get promoted?',
      'When will my father die?',
      'I want to end my life',
      'How long will I live?',
    ]);
    expect(results.map((r) => r.allowed)).toEqual([true, false, false, false]);
    expect(results[1]!.topic).toBe('death');
    expect(results[2]!.topic).toBe('suicide');
    expect(results[2]!.message).toMatch(/9152987821/);
  });

  it('refuses a blocked question at purchase, before any money moves', () => {
    expect(() =>
      assertKpQuestionsAllowed({
        question1: 'Will I get married this year?',
        question2: 'mrityu kab hogi',
      }),
    ).toThrow(/QUESTION_NOT_ALLOWED/);
    expect(() =>
      assertKpQuestionsAllowed({ question1: 'Will I get married this year?' }),
    ).not.toThrow();
    expect(() => assertKpQuestionsAllowed({ concern: 'x' })).toThrow(/Unexpected answer keys/);
    expect(() => assertKpQuestionsAllowed(undefined)).not.toThrow();
  });

  it('pre-checks questions for the purchase sheet', () => {
    const res = checkKpQuestions(['Will my business grow?', 'will i commit suicide'], 'hi');
    expect(res.allowed).toBe(false);
    expect(res.results[0]!.allowed).toBe(true);
    expect(res.results[1]!.topic).toBe('suicide');
  });

  it('routes questions to KP house groups, earliest mention winning', () => {
    expect(questionTopic('Will I get a new job?')).toBe('career');
    expect(questionTopic('Will my job change bring more money?')).toBe('career');
    expect(questionTopic('When will my shaadi happen?')).toBe('love');
    expect(questionTopic('Can I settle abroad?')).toBe('travel');
    expect(questionTopic('Will I clear UPSC?')).toBe('learning');
    expect(questionTopic('Should I buy a flat?')).toBe('home');
    expect(questionTopic('How will this year be for us?')).toBe('general');
  });

  it('reads questions back in order and drops blanks', () => {
    expect(kpQuestionsFromAnswers({ question2: ' b ', question1: 'a', question3: '' })).toEqual([
      'a',
      'b',
    ]);
  });
});

describe('computeKpAnnualScores (real ephemeris)', () => {
  let scores: KpAnnualScores;
  beforeEach(async () => {
    if (scores) return;
    const kpRaw = await delhiRaw();
    scores = computeKpAnnualScores(
      {
        chart: null,
        kpRaw,
        personName: 'Asha',
        personDob: '1990-05-15',
        userAnswers: {
          question1: 'Will I get a promotion this year?',
          question2: 'When will my mother die?',
          question3: 'Will I travel abroad?',
        },
      },
      '2026-09-25',
    ) as KpAnnualScores;
  }, 60_000);

  it('covers exactly one year from the generation date in 12 months', () => {
    expect(scores.window).toEqual({ start: '2026-09-25', end: '2027-09-25' });
    expect(scores.months).toHaveLength(12);
    expect(scores.months[0]!.start).toBe('2026-09-25');
    expect(scores.months[11]!.end).toBe('2027-09-25');
    expect(reportMonths('2027-01-31')[1]!.start).toBe('2027-02-28');
  });

  it('uses KP ayanamsa Placidus cusps with the full chain on every cusp', () => {
    expect(scores.engine).toMatchObject({ ayanamsa: 'krishnamurti', houseSystem: 'placidus' });
    expect(scores.cusps).toHaveLength(12);
    for (const c of scores.cusps) {
      expect(c.subLord).toBeTruthy();
      expect(c.subSubLord).toBeTruthy();
    }
    // Placidus is unequal — at Delhi's latitude no two consecutive houses are all 30°.
    const widths = scores.cusps.map(
      (c, i) => (scores.cusps[(i + 1) % 12]!.longitude - c.longitude + 360) % 360,
    );
    expect(new Set(widths.map((w) => w.toFixed(1))).size).toBeGreaterThan(1);
    expect(scores.planets).toHaveLength(9);
  });

  it('judges all eight life areas with a promise and a tone per month', () => {
    expect(scores.areas.map((a) => a.key)).toEqual([
      'career',
      'money',
      'love',
      'health',
      'home',
      'travel',
      'learning',
      'family',
    ]);
    for (const a of scores.areas) expect(['strong', 'steady', 'slow']).toContain(a.promise);
    for (const m of scores.months) {
      expect(m.dasha.md).toBeTruthy();
      expect(m.transits.map((t) => t.planet).sort()).toEqual(['Jupiter', 'Ketu', 'Rahu', 'Saturn']);
      for (const t of Object.values(m.tones)) expect(['peak', 'active', 'quiet']).toContain(t);
    }
    expect(scores.rulingPlanets).toHaveLength(5);
    expect(scores.header).toMatchObject({ name: 'Asha', lagnaSign: scores.ascendant.sign });
  });

  it('answers only the allowed questions — the death question never reaches the facts', () => {
    expect(scores.questions.map((q) => q.question)).toEqual([
      'Will I get a promotion this year?',
      'Will I travel abroad?',
    ]);
    expect(scores.questions[0]).toMatchObject({ topic: 'career', principalCusp: 10 });
    expect(scores.questions[1]).toMatchObject({ topic: 'travel', principalCusp: 12 });
  });

  it('never produces a numeric score', () => {
    const json = JSON.stringify(scores);
    expect(json).not.toMatch(/"(score|[a-zA-Z]*Score)"\s*:/);
  });

  it('is deterministic across reads', async () => {
    const again = computeKpAnnualScores(
      { chart: null, kpRaw: await delhiRaw(), personName: 'Asha', personDob: '1990-05-15' },
      '2026-09-25',
    ) as KpAnnualScores;
    expect(again.areas).toEqual(scores.areas.map((a) => ({ ...a })));
    expect(again.months.map((m) => m.tones)).toEqual(scores.months.map((m) => m.tones));
  }, 60_000);

  it('returns empty facts rather than inventing a chart when KP data is missing', () => {
    expect(computeKpAnnualScores({ chart: null, kpRaw: null }, '2026-09-25')).toEqual({});
  });

  it('switches to equal houses and says so above the polar circle', async () => {
    const birthJd = await dateToJulianDay(1990, 5, 15, 10, 30, 2);
    const raw = await computeKpRawData({
      birthJd,
      latitude: 69.65,
      longitude: 18.96,
      start: '2026-09-25',
    });
    expect(raw).toMatchObject({ houseSystem: 'equal', highLatitude: true });
  }, 60_000);

  describe('narrative', () => {
    const section = (heading: string, paragraphs: string[]) => ({
      heading,
      hook: 'A hook.',
      paragraphs,
    });
    const json = (sections: unknown[]) => JSON.stringify({ sections });

    beforeEach(() => {
      state.generate.mockReset();
      state.generate.mockImplementation(
        ({ messages }: { messages: Array<{ content: string }> }) => {
          const sys = messages[0]!.content;
          if (sys.includes('Answers To Your Questions')) {
            return json([
              section('Answers To Your Questions', ['Yes — Nov to Jan.', 'Slowly — Mar.']),
            ]);
          }
          if (sys.includes('Month By Month')) {
            return json([
              section(
                'Month By Month',
                Array.from({ length: 12 }, (_, i) => `M${i + 1}: do one thing.`),
              ),
              section('Simple Remedies & Rituals', ['Light a lamp on Saturdays.']),
              section('A Note For Your Year', ['You shape this year.']),
            ]);
          }
          if (sys.includes('Career & Money')) {
            return json([
              section('Career & Money', ['Push in November.']),
              section('Love, Marriage & Family', ['Warm spring.']),
              // The output filter must strip this sentence, keeping the rest.
              section('Health & Energy', ['Rest in May. You will die young. Walk daily.']),
              section('Home, Travel & Learning', ['Trip in June.']),
            ]);
          }
          return json([
            section('Your Year At A Glance', ['A building year.']),
            section('Your KP Blueprint', ['Sub lords decide.']),
            section('The Planetary Period You Are In', ['Saturn sets the tone.']),
            section('Big Transits This Year', ['Jupiter lifts house 10.']),
          ]);
        },
      );
    });

    it('writes 12 sections (question answers last), policy-scrubbed, grounded in KP facts', async () => {
      const saved: unknown[] = [];
      const sections = await generateKpAnnualNarrative(scores, {
        existingGroups: [],
        onGroupComplete: (g) => {
          saved.push(g);
          return Promise.resolve();
        },
      });
      expect(sections).toHaveLength(12);
      expect(sections.at(-1)!.paragraphs).toHaveLength(2);
      expect(sections[6]!.paragraphs[0]).toBe('Rest in May. Walk daily.');
      expect(saved).toHaveLength(4);
      const facts = state.generate.mock.calls[0]![0].messages[1].content as string;
      expect(facts).toContain('LIFE AREAS:');
      expect(facts).toContain('cusp sub lord');
      expect(facts).not.toMatch(/mother die/);
      const qFacts = state.generate.mock.calls.find((c) =>
        (c[0].messages[0].content as string).includes('Answers To Your Questions'),
      )![0].messages[1].content as string;
      expect(qFacts).toContain('Will I get a promotion this year?');
    });

    it('resumes from checkpoints without re-running finished calls', async () => {
      const first = [
        section('Your Year At A Glance', ['x']),
        section('Your KP Blueprint', ['x']),
        section('The Planetary Period You Are In', ['x']),
        section('Big Transits This Year', ['x']),
      ];
      const sections = await generateKpAnnualNarrative(scores, {
        existingGroups: [first],
        onGroupComplete: () => Promise.resolve(),
      });
      expect(sections).toHaveLength(12);
      expect(state.generate).toHaveBeenCalledTimes(3);
    });

    it('rejects a month-by-month section that is not exactly 12 paragraphs', async () => {
      state.generate.mockImplementation(() =>
        json([section('Month By Month', ['only one']), section('R', ['r']), section('N', ['n'])]),
      );
      await expect(generateKpAnnualNarrative({ ...scores, questions: [] })).rejects.toThrow();
    });

    it('refuses to narrate without KP facts', async () => {
      await expect(generateKpAnnualNarrative({} as KpAnnualScores)).rejects.toThrow(/KP chart/);
    });
  });
});

describe('policy scrub helpers', () => {
  it('keeps clean text untouched and drops only the offending sentence', () => {
    expect(scrubPolicy('A calm month.')).toBe('A calm month.');
    expect(scrubPolicy('Good news. Your death will come early. Stay kind.')).toBe(
      'Good news. Stay kind.',
    );
  });

  it('rejects malformed JSON sections', () => {
    expect(parseKpSections('not json')).toBeNull();
    expect(
      parseKpSections(JSON.stringify({ sections: [{ heading: 'x', paragraphs: [] }] })),
    ).toBeNull();
  });
});
