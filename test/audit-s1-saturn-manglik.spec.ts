import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeUserRow, makeProfileContext } from './helpers/mocks.js';
import type { KundliRow } from '../src/db/schema.js';
import type { MarriageScores } from '../src/lib/astro-engine/reports/marriage.js';

// Sprint 1 of the 2026-10-28 data-flow audit (plans/aroha-audit-2026-10-28/SPRINTS.md):
// H1 the horoscope read a stale, estimated Sade Sati and never had Dhaiya; H2 a cancelled
// Mangal Dosha reached chat, voice and reports as "present"; L1 "2th house"; L2 a cancelled
// Kemadruma listed as a good combination; L6 dasha dates from a live Date lost their year.

const state = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock('../src/lib/llm/gemini-client.js', () => ({ generate: state.generate }));

const { buildHoroscopeContext } = await import('../src/modules/horoscope/horoscope.service.js');
const { horoscopeSystemPrompt } = await import('../src/lib/llm/horoscope.js');
const { computeSavedDoshas } = await import('../src/modules/kundli/kundli.service.js');
const { doshaFacts, buildGroundingFacts } = await import('../src/lib/chat-grounding.js');
const { computeDoshaYogaSummary } =
  await import('../src/lib/astro-engine/reports/report-dosha-yoga-summary.js');
const { generateMarriageNarrative } = await import('../src/lib/llm/reports/marriage.js');
const { calculateChart, calculateVimshottariDasha, detectAllYogas, calculateAshtakavarga } =
  await import('../src/lib/astro-engine/index.js');
const { analyzeAllDoshasAt } = await import('../src/lib/astro-engine/doshas/index.js');

const ist = (d: unknown) =>
  d ? new Date(new Date(d as string).getTime() + 5.5 * 3_600_000).toISOString().slice(0, 10) : null;

function kundliRow(doshaData: Record<string, unknown>): KundliRow {
  return {
    status: 'ready',
    chartData: {},
    dashaData: {},
    yogaData: {},
    doshaData,
    ashtakavargaData: {},
  } as unknown as KundliRow;
}

describe('H1: the horoscope reads Sade Sati and Dhaiya live, as of the period start', () => {
  it('replaces a stale saved Pisces Sade Sati with the live one and adds Dhaiya', async () => {
    // Saved at build time with the 912-day estimate: wrong phase, wrong dates, no Dhaiya.
    const stale = {
      mangal: { present: false },
      sadeSati: {
        active: true,
        phase: 'rising',
        moonSign: 'Pisces',
        saturnSign: 'Aquarius',
        startDate: '2023-01-21T00:00:00.000Z',
        endDate: '2030-07-19T00:00:00.000Z',
      },
    };
    const ctx = await buildHoroscopeContext(
      makeUserRow(),
      makeProfileContext(),
      kundliRow(stale),
      '2026-11-01',
      'monthly',
    );
    const doshas = ctx.kundli?.doshas as Record<string, Record<string, unknown>>;
    expect(doshas.sadeSati).toMatchObject({ active: true, phase: 'peak', saturnSign: 'Pisces' });
    expect(ist(doshas.sadeSati!.startDate)).toBe('2022-04-29');
    expect(doshas.dhaiya).toBeDefined();
    expect(doshas.mangal).toEqual({ present: false });

    const facts = doshaFacts(doshas, 'Asia/Kolkata');
    expect(facts.find((f) => f.startsWith('Sade Sati:'))).toContain(
      'runs 29 Apr 2022 to 17 Apr 2030',
    );
    expect(facts.some((f) => f.startsWith('Shani Dhaiya:'))).toBe(true);
  });

  it('gives a Leo Moon an active Ashtama Shani', async () => {
    const ctx = await buildHoroscopeContext(
      makeUserRow(),
      makeProfileContext(),
      kundliRow({ sadeSati: { active: false, phase: 'none', moonSign: 'Leo' } }),
      '2026-11-02',
      'weekly',
    );
    expect((ctx.kundli?.doshas as Record<string, unknown>).dhaiya).toMatchObject({
      active: true,
      phase: '8th',
    });
  });

  it('reads Saturn as of the period start, not today (Taurus: 2027 yearly vs July 2027 monthly)', async () => {
    const saved = kundliRow({ sadeSati: { active: false, phase: 'none', moonSign: 'Taurus' } });
    const yearly = await buildHoroscopeContext(
      makeUserRow(),
      makeProfileContext(),
      saved,
      '2027-01-01',
      'yearly',
    );
    const ySade = (yearly.kundli?.doshas as Record<string, Record<string, unknown>>).sadeSati!;
    expect(ySade.active).toBe(false);
    expect(ist((ySade.next as Record<string, unknown>).startDate)).toBe('2027-06-03');

    const july = await buildHoroscopeContext(
      makeUserRow(),
      makeProfileContext(),
      saved,
      '2027-07-01',
      'monthly',
    );
    expect((july.kundli?.doshas as Record<string, Record<string, unknown>>).sadeSati).toMatchObject(
      {
        active: true,
        phase: 'rising',
      },
    );
  });

  it('leaves the context without a kundli when the chart is not ready', async () => {
    const ctx = await buildHoroscopeContext(
      makeUserRow(),
      makeProfileContext(),
      { status: 'generating' } as unknown as KundliRow,
      '2026-11-01',
      'daily',
    );
    expect(ctx.kundli).toBeNull();
  });
});

describe('H1: the horoscope prompt asks for Sade Sati and Dhaiya', () => {
  it('weekly, monthly and yearly name a running one once, with its dates', () => {
    for (const period of ['weekly', 'monthly', 'yearly'] as const) {
      const prompt = horoscopeSystemPrompt(period);
      expect(prompt).toContain('Sade Sati');
      expect(prompt).toContain('Shani Dhaiya');
      expect(prompt).toMatch(/once/);
      expect(prompt).toMatch(/dates/);
    }
  });

  it('daily stays quiet unless the transit changes that very day', () => {
    for (const period of ['daily', 'tomorrow'] as const) {
      const prompt = horoscopeSystemPrompt(period);
      expect(prompt).toContain('Sade Sati');
      expect(prompt).toMatch(/only when .* (starts|begins).* that (very )?day/i);
    }
  });
});

describe('H1: a new chart saves the real Saturn dates and Dhaiya', () => {
  it('computeSavedDoshas is the at-date analysis, with Dhaiya', async () => {
    const chart = await calculateChart(1985, 3, 12, 4, 32, 5.5, 19.076, 72.8777);
    const asOf = new Date('2026-10-30T06:00:00Z');
    const saved = await computeSavedDoshas(chart, asOf);
    expect(saved).toEqual(await analyzeAllDoshasAt(chart, asOf));
    expect(saved?.dhaiya).toBeDefined();
  });
});

const CANCELLED_MANGAL = {
  present: true,
  severity: 'none',
  type: 'cancelled',
  fromLagna: true,
  fromMoon: false,
  fromVenus: false,
  cancellations: [
    'Mars in own sign Aries - cancellation applies',
    'Mars aspected by Jupiter - cancellation applies',
  ],
};

describe('H2: a cancelled Mangal Dosha is "not Manglik" everywhere', () => {
  it('chat and voice get "cancelled (not Manglik)" with the reasons, never "present"', () => {
    const line = doshaFacts({ mangal: CANCELLED_MANGAL }, 'Asia/Kolkata')[0]!;
    expect(line).toBe(
      'Mangal Dosha: cancelled (not Manglik): Mars in own sign Aries; Mars aspected by Jupiter',
    );
    expect(line).not.toContain('present');
  });

  it('a real Mangal Dosha still reads as present', () => {
    const line = doshaFacts(
      { mangal: { ...CANCELLED_MANGAL, severity: 'mild', type: 'partial', cancellations: [] } },
      'Asia/Kolkata',
    )[0]!;
    expect(line).toBe('Mangal Dosha: present (mild severity, partial type)');
  });

  it('reports leave a cancelled Mangal out of "what to hold carefully"', () => {
    const { cautions } = computeDoshaYogaSummary(
      { mangal: CANCELLED_MANGAL },
      null,
      ['mangal'],
      [],
    );
    expect(cautions).toEqual([]);
  });

  it('the marriage report tells the model "not Manglik" for a cancelled one', async () => {
    state.generate.mockReset();
    state.generate.mockResolvedValue(
      JSON.stringify({
        sections: [
          { heading: 'A', body: 'x' },
          { heading: 'B', body: 'y' },
        ],
      }),
    );
    const scores = {
      marriageScore: 70,
      band: 'steady',
      manglik: { isManglik: true, cancelled: true },
      windows: [],
      jupiterDharmaWindow: null,
      ageBands: [],
      doshaYoga: { positives: [], cautions: [] },
    } as unknown as MarriageScores;
    await generateMarriageNarrative(scores).catch(() => undefined);
    const content = (state.generate.mock.calls[0]?.[0].messages as Array<{ content: string }>)
      .map((m) => m.content)
      .join('\n');
    expect(content).toContain('Manglik (Mangal Dosha): cancelled (not Manglik)');
    expect(content).not.toMatch(/Manglik \(Mangal Dosha\): present/);
  });
});

describe('L1, L2, L6: chat fact wording', () => {
  let facts: string[] = [];

  beforeEach(async () => {
    if (facts.length) return;
    const chart = await calculateChart(1985, 3, 12, 4, 32, 5.5, 19.076, 72.8777);
    const moon = chart.planets.find((p) => p.planet === 'Moon')!;
    // A live calculation, as the matchmaking agents and tests produce it: Date objects, not ISO text.
    const vimshottari = calculateVimshottariDasha(
      moon.longitude,
      new Date(Date.UTC(1985, 2, 11, 23, 2)),
    );
    const yogas = {
      yogas: [
        ...detectAllYogas(chart),
        {
          name: 'Kemadruma Cancellation',
          type: 'benefic',
          present: true,
          strength: 99,
          description: 'Kemadruma is cancelled: Moon in a kendra from the Lagna.',
        },
      ],
    };
    facts = await buildGroundingFacts(
      {
        chart: chart as unknown as Record<string, unknown>,
        dasha: { vimshottari },
        yogas,
        doshas: (await analyzeAllDoshasAt(chart)) as unknown as Record<string, unknown>,
        ashtakavarga: calculateAshtakavarga(chart) as unknown as Record<string, unknown>,
      },
      undefined,
      new Date('2026-10-30T06:00:00Z'),
      null,
    );
  });

  it('L1: says "2nd house", "3rd", never "2th"', () => {
    expect(facts.some((f) => /\b(1|2|3)th house\b/.test(f))).toBe(false);
    expect(facts.some((f) => f.startsWith('2nd house ('))).toBe(true);
  });

  it('L2: a cancelled Kemadruma is not listed as a good combination', () => {
    expect(facts.some((f) => f.startsWith('Significant Planetary Combination: Kemadruma'))).toBe(
      false,
    );
  });

  it('L6: the Mahadasha dates keep their year', () => {
    const line = facts.find((f) => f.includes('(started '))!;
    expect(line).toMatch(/\(started \d{4}-\d{2}-\d{2}, ends \d{4}-\d{2}-\d{2}\)/);
  });
});
