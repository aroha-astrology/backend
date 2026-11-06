// The five checkpointed calls with the model mocked: structure, coverage, the one regenerate, the
// sentence cuts, the flags that survive, Chapter VI (traceable questions, engine dates only) and
// the checkpoint resume.
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { REPORT_SECTION_IDS } from '../src/config/report-sections.js';
import {
  DOSHA_LABEL,
  NINE_PLANETS,
  MONTH_NAMES,
  TAJIKA_LABEL,
} from '../src/lib/astro-engine/reports/varshik-labels.js';
import {
  coverageProblems,
  dayMonth,
  yogaBaseName,
  type VarshikFacts,
} from '../src/lib/astro-engine/reports/varshik-facts.js';
import { DOSHA_KEYS } from '../src/lib/astro-engine/reports/varshik-timing.js';
import type { ReportSection } from '../src/modules/reports/report-generator.types.js';

vi.mock('../src/lib/llm/gemini-client.js', () => ({ generate: vi.fn() }));

import { buildFactIndex } from '../src/lib/llm/reports/verify-claims.js';
import {
  acceptProposals,
  chunkForTranslation,
  fillWindowTokens,
  generateVarshikNarrative,
  proposeQuestions,
  runCheckedCall,
  type CallSpec,
  type RawSection,
} from '../src/lib/llm/reports/varshik-2027.js';

let facts: VarshikFacts;
const clone = (f: VarshikFacts): VarshikFacts => JSON.parse(JSON.stringify(f)) as VarshikFacts;

beforeAll(async () => {
  const { buildVarshikFactsForReader } = await import('../src/modules/reports/generators/varshik-2027.generator.js');
  facts = await buildVarshikFactsForReader({
    name: 'Test',
    birthDate: '1990-01-12',
    birthTime: '06:15',
    place: { lat: 28.61, lon: 77.21, tz: 'Asia/Kolkata' },
    answers: { relationship: 'single', occupation: 'working', children: 'none', mainDecision: 'job_change' },
    facts: ['Is thinking about a job switch', "Father's cancer treatment is ongoing", 'Lives in Pune'],
  });
}, 120_000);

/** Clean, compliant text for every section a call owns. Month text differs by month so no opening repeats. */
function goodAnswer(spec: CallSpec, f: VarshikFacts): RawSection[] {
  const delivering = f.yogas.filter((y) => y.months.length > 0);
  const yogaNames = [...new Set(delivering.map((y) => (y.source === 'natal' ? yogaBaseName(y.name) : (TAJIKA_LABEL[y.kind] ?? y.kind))))];
  const eclipses = f.skyEvents.filter((e) => e.kind.startsWith('eclipse')).map((e) => dayMonth(e.date));
  return spec.ids.map((id, n) => {
    const want = spec.counts[id] ?? 2;
    // Each month opens with its own name, so no opening repeats across the six months of a call.
    const month = /^month_(\d{2})$/.exec(id);
    const lead = month ? MONTH_NAMES[Number(month[1]) - 1] : `Words ${id} number ${n + 1}`;
    let paragraphs = Array.from({ length: want }, (_, i) => `${lead} holds part ${i + 1} and stays plain and calm.`);
    if (id === 'planet_by_planet') paragraphs = NINE_PLANETS.map((p) => `${p} moves quietly through the year.`);
    if (id === 'doshas') paragraphs = DOSHA_KEYS.map((k) => `${DOSHA_LABEL[k]} was checked for you.`);
    if (id === 'yogas') paragraphs = [`These yogas deliver this year: ${yogaNames.join(', ')}.`];
    if (id === 'sky_calendar') paragraphs = [`The eclipses fall on ${eclipses.join(', ')}.`, 'Retrograde spells ask for patience.'];
    if (id.startsWith('question_')) paragraphs = ['Something is on your mind.', 'It eases {window}, and again {next}.', 'Take one small step each day.'];
    return { id, paragraphs };
  });
}

describe('one checked call', () => {
  const spec: CallSpec = {
    ids: ['month_01', 'month_02'],
    counts: { month_01: 5, month_02: 5 },
    instructions: '',
    facts: '',
    user: '',
  };
  const answer = (extra?: (s: RawSection[]) => void) => () => {
    const s = goodAnswer(spec, facts);
    extra?.(s);
    return Promise.resolve(s);
  };

  it('accepts a clean answer on the first try with no flags', async () => {
    const ask = vi.fn(answer());
    const r = await runCheckedCall(spec, facts, ask);
    expect(ask).toHaveBeenCalledTimes(1);
    expect(r.sections.map((s) => s.id)).toEqual(['month_01', 'month_02']);
    expect(r.sections[0]!.heading).toBe('January');
    expect(r.flags).toEqual([]);
  });

  it('asks once more, with the problems listed, when the structure is wrong', async () => {
    const notes: Array<string | null> = [];
    const r = await runCheckedCall(spec, facts, (note) => {
      notes.push(note);
      return Promise.resolve(notes.length === 1 ? goodAnswer(spec, facts).slice(0, 1) : goodAnswer(spec, facts));
    });
    expect(notes).toHaveLength(2);
    expect(notes[0]).toBeNull();
    expect(notes[1]).toMatch(/expected 2 sections/);
    expect(r.sections).toHaveLength(2);
  });

  it('throws, so nothing is checkpointed, when the second answer is still wrong', async () => {
    const ask = vi.fn(() => Promise.resolve(goodAnswer(spec, facts).slice(0, 1)));
    await expect(runCheckedCall(spec, facts, ask)).rejects.toThrow(/structure/);
    expect(ask).toHaveBeenCalledTimes(2);
  });

  it('a fear word is regenerated once, and a repeat is cut sentence by sentence', async () => {
    const withFear = answer((s) => { s[0]!.paragraphs[0] = 'A disaster may come. The month is calm.'; });
    const ask = vi.fn(withFear);
    const r = await runCheckedCall(spec, facts, ask);
    expect(ask).toHaveBeenCalledTimes(2);
    const text = r.sections.flatMap((s) => s.paragraphs).join(' ');
    expect(text).not.toMatch(/disaster/);
    expect(r.sections[0]!.paragraphs).toHaveLength(5);
    expect(r.sections[0]!.paragraphs[0]).toBe('The month is calm.');
  });

  it('a date that is in no fact is cut, never shown', async () => {
    const known = buildFactIndex(facts).dates;
    let bad = '';
    for (let d = 2; d <= 27 && !bad; d++) {
      const dd = String(d).padStart(2, '0');
      if (!['2026', '2027', '2028'].some((y) => known.has(`${y}-03-${dd}`))) bad = `2027-03-${dd}`;
    }
    expect(bad).not.toBe('');
    const r = await runCheckedCall(spec, facts, answer((s) => { s[1]!.paragraphs[1] = `A great day arrives on ${dayMonth(bad)}. Rest well.`; }));
    expect(r.sections.flatMap((s) => s.paragraphs).join(' ')).not.toContain(dayMonth(bad));
  });

  it('an AI tell that survives the regenerate is kept and flagged, not deleted', async () => {
    const withTell = answer((s) => { s[1]!.paragraphs[2] = 'This journey asks for patience.'; });
    const r = await runCheckedCall(spec, facts, withTell);
    expect(r.sections[1]!.paragraphs[2]).toBe('This journey asks for patience.');
    expect(r.flags.some((f) => f.rule === 'ai-tell:stock-word' && f.section === 'month_02')).toBe(true);
  });
});

describe('Chapter VI questions', () => {
  it('keeps only questions traceable to a real fact and an engine key', () => {
    const keys = Object.keys(facts.scores.answerWindows);
    const key = keys.includes('career') ? 'career' : keys[0]!;
    const out = acceptProposals(
      [
        { factIds: ['F1'], key, topic: 'Thinking about a new job' },
        { factIds: ['F9'], key: 'money', topic: 'An invented worry' },
        { factIds: ['F1'], key: 'not_a_key', topic: 'Unknown key' },
        { factIds: ['F2'], key: 'health', topic: 'Caring for a parent' },
        { factIds: [], key: 'travel', topic: 'No source at all' },
        { factIds: ['F1'], key, topic: 'The same key twice' },
      ],
      facts,
    );
    expect(out).toEqual([{ factIds: ['F1'], key, topic: 'Thinking about a new job' }]);
  });

  it('never picks death or illness, even when a stored fact mentions one', () => {
    const out = acceptProposals(
      [
        { factIds: ['F2'], key: 'family', topic: 'A parent who is unwell' },
        { factIds: ['F1'], key: 'career', topic: 'Will someone die this year' },
      ],
      facts,
    );
    expect(out).toEqual([]);
  });

  it('allows the main-decision answer as a source, and caps at five', () => {
    const f = clone(facts);
    f.reader.facts = Array.from({ length: 8 }, (_, i) => ({ id: `F${i + 1}`, fact: `Plain fact number ${i + 1}` }));
    const keys = Object.keys(f.scores.answerWindows).slice(0, 7);
    const many = keys.map((k, i) => ({ factIds: [`F${i + 1}`], key: k, topic: `Topic ${i + 1}` }));
    expect(acceptProposals(many, f)).toHaveLength(5);
    expect(acceptProposals([{ factIds: ['MAIN'], key: keys[0]!, topic: 'The big decision' }], f)).toHaveLength(1);
    f.reader.answers.mainDecision = 'nothing_specific';
    expect(acceptProposals([{ factIds: ['MAIN'], key: keys[0]!, topic: 'The big decision' }], f)).toEqual([]);
  });

  it('asks for no questions at all when there are no facts and no big decision', async () => {
    const f = clone(facts);
    f.reader.facts = [];
    f.reader.answers.mainDecision = undefined;
    const ask = vi.fn();
    expect(await proposeQuestions(f, ask)).toEqual([]);
    expect(ask).not.toHaveBeenCalled();
  });

  it('writes the window from the engine and nothing else', () => {
    const w = { fromDate: '2027-03-12', toDate: '2027-04-04', peakDate: '2027-03-20' };
    const then = { fromDate: '2027-09-01', toDate: '2027-09-20', peakDate: '2027-09-10' };
    expect(fillWindowTokens(['It eases {window}.'], { best: w, then, weak: false })).toEqual(['It eases between 12 March and 4 April.']);
    expect(fillWindowTokens(['Then {next}.'], { best: w, then, weak: false })).toEqual(['Then between 1 September and 20 September.', 'The best window for this falls between 12 March and 4 April.'].slice(0, 1).concat(['The best window for this falls between 12 March and 4 April.']).slice(0, 2));
    // no {window} in the text: one sentence with the engine's dates is added
    const added = fillWindowTokens(['One.', 'Two.'], { best: w, then: null, weak: false });
    expect(added.join(' ')).toContain('between 12 March and 4 April');
    // no second window: the sentence that asked for it is dropped, no stray braces remain
    const noNext = fillWindowTokens(['A start. It follows {next}. {window} is best.'], { best: w, then: null, weak: true });
    expect(noNext.join(' ')).not.toMatch(/[{}]/);
  });
});

describe('the whole narrative', () => {
  it('writes 35 sections, covers everything, and saves five checkpoints, with no questions when there is nothing to ask', async () => {
    const f = clone(facts);
    f.reader.facts = [];
    f.reader.answers.mainDecision = undefined;
    const saved: ReportSection[][] = [];
    const out = await generateVarshikNarrative(
      f,
      { existingGroups: [], onGroupComplete: (g) => { saved.push(g); return Promise.resolve(); } },
      (spec) => () => Promise.resolve(goodAnswer(spec, f)),
    );
    const ids = (REPORT_SECTION_IDS.varshik_rashifal_2027 as readonly string[]).slice(0, 35);
    expect(out.sections.map((s) => s.id)).toEqual(ids);
    expect(saved).toHaveLength(5);
    expect(coverageProblems(f, out.sections)).toEqual([]);
    expect(out.sections.some((s) => s.id!.startsWith('question_'))).toBe(false);
    expect(out.flags).toEqual([]);
  });

  it('adds a question page tied to its fact, with the window from the engine and the tier for the chip', async () => {
    const f = clone(facts);
    f.reader.facts = [{ id: 'F1', fact: 'Is thinking about a job switch' }];
    const key = Object.keys(f.scores.answerWindows).includes('career') ? 'career' : Object.keys(f.scores.answerWindows)[0]!;
    const proposeAsk = vi.fn(() => Promise.resolve(JSON.stringify({ questions: [{ factIds: ['F1'], key, topic: 'Thinking about a new job' }] })));
    const out = await generateVarshikNarrative(f, undefined, (spec) => () => Promise.resolve(goodAnswer(spec, f)), proposeAsk);
    const q = out.sections.find((s) => s.id === 'question_1')!;
    expect(q.heading).toBe('Thinking about a new job');
    expect(q.paragraphs.join(' ')).not.toMatch(/[{}]/);
    expect(q.paragraphs[1]).toMatch(/between \d+ \w+ and \d+ \w+/);
    const w = f.scores.answerWindows[key]!;
    expect(q.uiData).toMatchObject({ key, factIds: ['F1'], windowFrom: w.best.fromDate, windowTo: w.best.toDate, tier: w.best.tier });
    expect(out.sections).toHaveLength(36);
  });

  it('skips the calls a previous attempt already saved', async () => {
    const f = clone(facts);
    f.reader.facts = [];
    f.reader.answers.mainDecision = undefined;
    const first: ReportSection[][] = [];
    await generateVarshikNarrative(f, { existingGroups: [], onGroupComplete: (g) => { first.push(g); return Promise.resolve(); } }, (spec) => () => Promise.resolve(goodAnswer(spec, f)));
    const asked = new Set<string>();
    const out = await generateVarshikNarrative(
      f,
      { existingGroups: first.slice(0, 3), onGroupComplete: () => Promise.resolve() },
      (spec) => () => { asked.add(spec.ids[0]!); return Promise.resolve(goodAnswer(spec, f)); },
    );
    expect([...asked].sort()).toEqual(['month_07', 'simple_remedies']);
    expect(out.sections).toHaveLength(35);
  });

  it('fails the run, without saving a partial report, when a call can never be completed', async () => {
    const f = clone(facts);
    const saved: ReportSection[][] = [];
    await expect(
      generateVarshikNarrative(
        f,
        { existingGroups: [], onGroupComplete: (g) => { saved.push(g); return Promise.resolve(); } },
        (spec) => () => Promise.resolve(spec.ids[0] === 'month_07' ? null : goodAnswer(spec, f)),
      ),
    ).rejects.toThrow(/month_07/);
    // calls 1 to 3 may be saved (a contiguous prefix); the broken one and everything after it are not
    expect(saved.length).toBeLessThanOrEqual(3);
  });
});

describe('translation', () => {
  it('splits the sections into chunks of at most five, in order', () => {
    const s = Array.from({ length: 12 }, (_, i) => ({ id: `s${i}`, heading: 'h', paragraphs: ['p'] }));
    const chunks = chunkForTranslation(s);
    expect(chunks.map((c) => c.length)).toEqual([5, 5, 2]);
    expect(chunks.flat().map((x) => x.id)).toEqual(s.map((x) => x.id));
  });
});
