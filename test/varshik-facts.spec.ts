// The completeness contract: the facts object is validated BEFORE any text is written, a missing
// or NaN field stops generation (the service then refunds), and a finished report must cover
// every page, month, area, dosha, yoga and eclipse.
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { AREAS } from '../src/config/varshik-weights.js';
import { REPORT_SECTION_IDS } from '../src/config/report-sections.js';
import {
  DOSHA_LABEL,
  NINE_PLANETS,
  coverageProblems,
  dayMonth,
  preflightVarshikFacts,
  yogaBaseName,
  type VarshikFacts,
} from '../src/lib/astro-engine/reports/varshik-facts.js';
import { DOSHA_KEYS } from '../src/lib/astro-engine/reports/varshik-timing.js';
import { TAJIKA_LABEL } from '../src/lib/astro-engine/reports/varshik-labels.js';

// A model call during these tests would mean text was written for broken facts.
const generate = vi.fn();
vi.mock('../src/lib/llm/gemini-client.js', () => ({ generate: (...a: unknown[]) => generate(...a) }));

let facts: VarshikFacts;
const clone = (f: VarshikFacts): VarshikFacts => JSON.parse(JSON.stringify(f)) as VarshikFacts;

beforeAll(async () => {
  const { buildVarshikFactsForReader } = await import('../src/modules/reports/generators/varshik-2027.generator.js');
  facts = await buildVarshikFactsForReader({
    name: 'Test',
    birthDate: '1988-06-22',
    birthTime: '04:30',
    place: { lat: 13.08, lon: 80.27, tz: 'Asia/Kolkata' },
    answers: { relationship: 'single', occupation: 'working', children: 'none', mainDecision: 'job_change' },
    facts: ['Is thinking about a job switch'],
  });
}, 120_000);

describe('preflight', () => {
  it('passes on facts built for a real reader, and after a JSON round trip', () => {
    expect(preflightVarshikFacts(facts)).toEqual({ ok: true, failures: [] });
    expect(preflightVarshikFacts(clone(facts)).ok).toBe(true);
  });

  it('holds all eight doshas, twelve months, seven areas of twelve cells and 365 days', () => {
    expect(facts.doshas.map((d) => d.key)).toEqual(DOSHA_KEYS);
    expect(facts.scores.months).toHaveLength(12);
    for (const a of AREAS) expect(facts.scores.timingMap[a]).toHaveLength(12);
    expect(facts.scores.dailyOverall).toHaveLength(365);
    expect(facts.muddaSeamExact).toBe(true);
    expect(facts.reader.facts).toEqual([{ id: 'F1', fact: 'Is thinking about a job switch' }]);
  });

  const broken: Array<[string, (f: VarshikFacts) => void, RegExp]> = [
    ['a planet without its nakshatra', (f) => { (f.birth.planets[3] as { nakshatra?: string }).nakshatra = undefined; }, /birth\.planets\.3\.nakshatra/],
    ['a NaN month score', (f) => { f.scores.months[2]!.score = Number.NaN; }, /scores\.months\.2/],
    ['an out-of-range degree', (f) => { f.birth.planets[0]!.degree = 31; }, /birth\.planets\.0\.degree/],
    ['a dosha missing', (f) => { f.doshas.pop(); }, /doshas/],
    ['a Mudda seam that is not exact', (f) => { f.muddaSeamExact = false; }, /muddaSeamExact/],
    ['364 days', (f) => { f.scores.dailyOverall.pop(); }, /dailyOverall/],
    ['an area without its window', (f) => { delete f.scores.answerWindows.love; }, /answerWindows\.love/],
    ['no sky events', (f) => { f.skyEvents = []; }, /skyEvents/],
    ['eight Mudda periods', (f) => { f.varsha[0]!.mudda.pop(); }, /varsha\.0\.mudda/],
    ['eleven Sarva bindus', (f) => { f.ashtakavarga.sav.pop(); }, /ashtakavarga\.sav/],
    ['a tier that disagrees with its score', (f) => { f.scores.months[0] = { score: 90, tier: 'rust' }; }, /scores\.months\.0/],
  ];
  for (const [name, mutate, path] of broken) {
    it(`fails on ${name}, and names the field`, () => {
      const f = clone(facts);
      mutate(f);
      const r = preflightVarshikFacts(f);
      expect(r.ok).toBe(false);
      expect(r.failures.join('\n')).toMatch(path);
    });
  }
});

describe('a gap stops generation, writes no text, and is refunded', () => {
  it('generateNarrative aborts before any model call, naming the failed field', async () => {
    const { varshikGenerator } = await import('../src/modules/reports/generators/varshik-2027.generator.js');
    const { ReportGenerationAbort } = await import('../src/modules/reports/report-generator.types.js');
    const f = clone(facts);
    f.doshas.pop();
    const err = await varshikGenerator.generateNarrative({ varshik: f }, 'en').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ReportGenerationAbort);
    expect((err as Error).message).toMatch(/preflight failed.*doshas/);
    expect(generate).not.toHaveBeenCalled();
  });

  it('facts that could not be built abort the same way', async () => {
    const { varshikGenerator } = await import('../src/modules/reports/generators/varshik-2027.generator.js');
    const { ReportGenerationAbort } = await import('../src/modules/reports/report-generator.types.js');
    const scores = varshikGenerator.computeScores({ chart: null, varshikFacts: null, varshikBuildError: 'missing: birth place' }, null);
    await expect(varshikGenerator.generateNarrative(scores, 'en')).rejects.toBeInstanceOf(ReportGenerationAbort);
    expect(generate).not.toHaveBeenCalled();
  });
});

/** A complete, clean set of sections: what a perfect run would hold. */
function completeSections(f: VarshikFacts) {
  const paras = (n: number, text: string) => Array.from({ length: n }, (_, i) => `${text} ${i + 1}.`);
  const delivering = f.yogas.filter((y) => y.months.length > 0);
  const yogaNames = [...new Set(delivering.map((y) => (y.source === 'natal' ? yogaBaseName(y.name) : (TAJIKA_LABEL[y.kind] ?? y.kind))))];
  const eclipses = f.skyEvents.filter((e) => e.kind.startsWith('eclipse')).map((e) => dayMonth(e.date));
  return (REPORT_SECTION_IDS.varshik_rashifal_2027 as readonly string[])
    .filter((id) => !id.startsWith('question_'))
    .map((id) => {
      let paragraphs = paras(2, `Text for ${id}`);
      if (id.startsWith('month_')) paragraphs = paras(5, `Month text for ${id}`);
      if (id === 'planet_by_planet') paragraphs = NINE_PLANETS.map((p) => `${p} moves through the year.`);
      if (id === 'doshas') paragraphs = DOSHA_KEYS.map((k) => `${DOSHA_LABEL[k]} was checked.`);
      if (id === 'yogas') paragraphs = [`These yogas deliver: ${yogaNames.join(', ')}.`];
      if (id === 'sky_calendar') paragraphs = [`The eclipses fall on ${eclipses.join(', ')}.`];
      return { id, heading: id, paragraphs };
    });
}

describe('coverage', () => {
  it('finds nothing missing in a complete report', () => {
    expect(coverageProblems(facts, completeSections(facts))).toEqual([]);
  });

  it('finds a missing month, a short dosha list, an unnamed yoga and an unmentioned eclipse', () => {
    const s = completeSections(facts);
    expect(coverageProblems(facts, s.filter((x) => x.id !== 'month_07'))).toContain('section month_07: missing');
    const d = s.find((x) => x.id === 'doshas')!;
    d.paragraphs = d.paragraphs.slice(0, 7);
    expect(coverageProblems(facts, s).join('|')).toMatch(/doshas: expected 8 paragraphs/);
    const y = s.find((x) => x.id === 'yogas')!;
    y.paragraphs = ['Nothing is named here.'];
    expect(coverageProblems(facts, s).join('|')).toMatch(/yogas: does not mention/);
    const k = s.find((x) => x.id === 'sky_calendar')!;
    k.paragraphs = ['No dates at all.'];
    expect(coverageProblems(facts, s).join('|')).toMatch(/sky_calendar: does not mention the eclipse/);
  });

  it('can check one call at a time', () => {
    const s = completeSections(facts);
    const only = new Set(['month_01', 'month_02']);
    expect(coverageProblems(facts, s.filter((x) => only.has(x.id)), only)).toEqual([]);
    expect(coverageProblems(facts, [], only)).toEqual(['section month_01: missing', 'section month_02: missing']);
  });

  it('counts a dosha that is not present, the same as one that is', () => {
    const s = completeSections(facts);
    const notPresent = facts.doshas.filter((d) => d.status === 'not_present');
    expect(notPresent.length).toBeGreaterThan(0);
    expect(coverageProblems(facts, s)).toEqual([]);
  });
});
