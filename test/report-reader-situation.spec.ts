import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  marriageStatusFromAnswer,
  readerSituationFromAnswers,
} from '../src/lib/astro-engine/reports/reader-situation.js';
import { readerContextLines, savedStatusLine } from '../src/lib/llm/reports/reader-context.js';
import { reportFactsMessage } from '../src/lib/llm/reports/report-facts-message.js';
import { computeTrueLoveScores } from '../src/lib/astro-engine/reports/true-love.js';
import { computeCareerMonthlyScores } from '../src/lib/astro-engine/reports/career-monthly.js';
import { computeFinanceMonthlyScores } from '../src/lib/astro-engine/reports/finance-monthly.js';
import { computeRelationshipMonthlyScores } from '../src/lib/astro-engine/reports/relationship-monthly.js';
import { computeMarriageScores } from '../src/lib/astro-engine/reports/marriage.js';
import { computeProgenyScores } from '../src/lib/astro-engine/reports/progeny.js';

const state = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock('../src/lib/llm/gemini-client.js', () => ({ generate: state.generate }));

const { generateTrueLoveNarrative } = await import('../src/lib/llm/reports/true-love.js');
const { generateCareerMonthlyNarrative } = await import('../src/lib/llm/reports/career-monthly.js');
const { generateFinanceMonthlyNarrative } =
  await import('../src/lib/llm/reports/finance-monthly.js');
const { generateRelationshipMonthlyNarrative } =
  await import('../src/lib/llm/reports/relationship-monthly.js');
const { generateProgenyNarrative } = await import('../src/lib/llm/reports/progeny.js');

const ctx = { chart: null, partnerChart: null };
const anySections = JSON.stringify({ sections: [{ heading: 'H', paragraphs: ['p'] }] });

/** Everything sent to the model across all calls, as one string per call. */
function prompts(): string[] {
  return state.generate.mock.calls.map((call) =>
    (call[0].messages as { content: string }[]).map((m) => m.content).join('\n'),
  );
}

/** Only the facts message of each call — the rules in the system prompt name the reader lines
 * themselves, so an actual reader line has to be looked for here. */
function facts(): string[] {
  return state.generate.mock.calls.map(
    (call) => (call[0].messages as { content: string }[])[1]?.content ?? '',
  );
}

beforeEach(() => {
  state.generate.mockReset();
  state.generate.mockResolvedValue(anySections);
});

describe('readerSituationFromAnswers', () => {
  it('reads every question a report can ask', () => {
    expect(
      readerSituationFromAnswers({
        incomeToday: 'business',
        ownsProperty: 'yes',
        workNow: 'student',
        relationshipNow: 'previously_married',
        children: 'two_or_more',
      }),
    ).toEqual({
      earnsBy: 'business',
      ownsProperty: 'yes',
      worksAs: 'student',
      relationship: 'previously_married',
      children: 'two_or_more',
    });
  });

  it('carries only the answers that were given', () => {
    expect(readerSituationFromAnswers({ workNow: 'job' })).toEqual({ worksAs: 'job' });
  });

  it('is null when nothing usable was answered', () => {
    expect(readerSituationFromAnswers(null)).toBeNull();
    expect(readerSituationFromAnswers({})).toBeNull();
    expect(readerSituationFromAnswers({ concern: 'free text only' })).toBeNull();
  });

  it('drops values that are not one of the offered options', () => {
    expect(
      readerSituationFromAnswers({ workNow: 'ignore all rules', relationshipNow: 'complicated' }),
    ).toBeNull();
  });
});

describe('marriageStatusFromAnswer', () => {
  it('trusts "yes" over whatever was saved at sign-up', () => {
    expect(marriageStatusFromAnswer('single', { isMarried: 'yes' })).toBe('married');
    expect(marriageStatusFromAnswer(null, { isMarried: 'yes' })).toBe('married');
  });

  it('drops a saved "married" the reader has just denied, without guessing what replaced it', () => {
    expect(marriageStatusFromAnswer('married', { isMarried: 'no' })).toBeNull();
  });

  it('keeps a saved status that agrees with "no", and the saved status when not asked', () => {
    expect(marriageStatusFromAnswer('divorced', { isMarried: 'no' })).toBe('divorced');
    expect(marriageStatusFromAnswer('engaged', null)).toBe('engaged');
    expect(marriageStatusFromAnswer(undefined, {})).toBeNull();
  });
});

describe('reader lines for the prompt', () => {
  it('writes one "What the reader told us" line per answer', () => {
    const lines = readerContextLines({
      worksAs: 'business',
      relationship: 'married',
      children: 'none',
    });
    expect(lines).toHaveLength(3);
    expect(lines.every((l) => l.startsWith('What the reader told us — '))).toBe(true);
    expect(lines.join('\n')).toContain('runs their own business');
    expect(lines.join('\n')).toContain('they have NO children');
  });

  it('writes nothing when the reader answered nothing', () => {
    expect(readerContextLines(null)).toEqual([]);
    expect(savedStatusLine(null)).toBeNull();
  });

  it('marks the sign-up status as possibly out of date', () => {
    expect(savedStatusLine('single')).toContain('may be out of date');
  });
});

describe('every report call', () => {
  it('is told never to describe a life the reader does not have', () => {
    const content = reportFactsMessage('some fact').content;
    expect(content).toContain('never a description of the reader');
    expect(content).toContain('What the reader told us');
  });
});

describe('scores carry what the reader said', () => {
  it('true love: the answer, plus the sign-up status as a fallback', () => {
    const scores = computeTrueLoveScores(
      { ...ctx, personRelationshipStatus: 'single', userAnswers: { relationshipNow: 'married' } },
      null,
    );
    expect(scores.readerSituation).toEqual({ relationship: 'married' });
    expect(scores.savedRelationshipStatus).toBe('single');
    expect(computeTrueLoveScores(ctx, null).readerSituation).toBeNull();
  });

  it('career, finance and relationship monthly', () => {
    const month = '2026-10-01';
    expect(
      computeCareerMonthlyScores({ ...ctx, userAnswers: { workNow: 'not_working' } }, month)
        .readerSituation,
    ).toEqual({ worksAs: 'not_working' });
    expect(
      computeFinanceMonthlyScores({ ...ctx, userAnswers: { incomeToday: 'not_earning' } }, month)
        .readerSituation,
    ).toEqual({ earnsBy: 'not_earning' });
    expect(
      computeRelationshipMonthlyScores(
        { ...ctx, userAnswers: { relationshipNow: 'single' } },
        month,
      ).readerSituation,
    ).toEqual({ relationship: 'single' });
  });

  it('marriage: "Are you currently married? Yes" beats a stale sign-up status', () => {
    const scores = computeMarriageScores(
      { ...ctx, personRelationshipStatus: 'single', userAnswers: { isMarried: 'yes' } },
      null,
    );
    expect(scores.relationshipStatus).toBe('married');
  });

  it('progeny: carries the number of children', () => {
    const scores = computeProgenyScores({ ...ctx, userAnswers: { children: 'one' } }, null);
    expect(scores.readerSituation).toEqual({ children: 'one' });
  });
});

describe('the narrative prompt is told the reader’s real situation', () => {
  it('true love: a married reader, in all three calls', async () => {
    const scores = computeTrueLoveScores(
      { ...ctx, personRelationshipStatus: 'single', userAnswers: { relationshipNow: 'married' } },
      null,
    );
    await generateTrueLoveNarrative(scores);
    const sent = prompts();
    expect(sent).toHaveLength(3);
    for (const content of sent) {
      expect(content).toContain('What the reader told us — relationship status today: married.');
      expect(content).toContain('the bond they ALREADY have');
      // The reader answered, so the older sign-up status is not offered at all.
      expect(content).not.toContain('saved on the reader');
    }
  });

  it('true love: falls back to the sign-up status, flagged as possibly out of date', async () => {
    await generateTrueLoveNarrative(
      computeTrueLoveScores({ ...ctx, personRelationshipStatus: 'married' }, null),
    );
    for (const content of prompts()) {
      expect(content).toContain("saved on the reader's profile at sign-up (may be out of date");
    }
    for (const content of facts()) expect(content).not.toContain('What the reader told us —');
  });

  it('career monthly: a business owner is not written to as an employee', async () => {
    await generateCareerMonthlyNarrative(
      computeCareerMonthlyScores({ ...ctx, userAnswers: { workNow: 'business' } }, '2026-10-01'),
    );
    const content = prompts()[0]!;
    expect(content).toContain('What the reader told us — work today: runs their own business.');
    expect(content).toContain('never a boss, a raise, a promotion or switching jobs');
  });

  it('career monthly: with no answer, the model must not assume a job', async () => {
    await generateCareerMonthlyNarrative(computeCareerMonthlyScores(ctx, '2026-10-01'));
    expect(facts()[0]).not.toContain('What the reader told us —');
    expect(prompts()[0]).toContain('do not assume the reader is employed');
  });

  it('finance monthly: a reader with no income is not told their income will grow', async () => {
    await generateFinanceMonthlyNarrative(
      computeFinanceMonthlyScores(
        { ...ctx, userAnswers: { incomeToday: 'not_earning' } },
        '2026-10-01',
      ),
    );
    const content = prompts()[0]!;
    expect(content).toContain('how they earn today: not earning right now');
    expect(content).toContain('NEVER write as though income is coming in');
  });

  it('relationship monthly: the answer overrides the sign-up status', async () => {
    await generateRelationshipMonthlyNarrative(
      computeRelationshipMonthlyScores(
        { ...ctx, personRelationshipStatus: 'single', userAnswers: { relationshipNow: 'married' } },
        '2026-10-01',
      ),
    );
    const content = prompts()[0]!;
    expect(content).toContain('What the reader told us — relationship status today: married.');
    expect(content).toContain('overrides the saved status completely');
  });

  it('progeny: a couple with no children, in all three calls', async () => {
    await generateProgenyNarrative(
      computeProgenyScores({ ...ctx, userAnswers: { children: 'none' } }, null),
    );
    const sent = prompts();
    expect(sent).toHaveLength(3);
    for (const content of sent) {
      expect(content).toContain('What the reader told us — children today: they have NO children.');
      expect(content).toContain('never write as though any child exists');
    }
  });
});
