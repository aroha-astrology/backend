import { describe, it, expect, vi } from 'vitest';
import { VERDICT_TOPIC, factsForVerdict } from '../src/lib/llm/reports/verdict.js';
import { REPORT_CATALOGUE } from '../src/config/reports.js';

const state = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock('../src/lib/llm/gemini-client.js', () => ({ generate: state.generate }));
const { generateReportVerdict } = await import('../src/lib/llm/reports/verdict.js');

function mockVerdictResponse() {
  state.generate.mockResolvedValueOnce(
    JSON.stringify({
      headline: 'Test headline',
      bullets: ['b1', 'b2', 'b3'],
      nextStep: 'Do something.',
    }),
  );
}

describe('VERDICT_TOPIC', () => {
  it('covers every catalogue key with a non-empty topic', () => {
    for (const def of REPORT_CATALOGUE) {
      expect(VERDICT_TOPIC[def.key], `missing VERDICT_TOPIC entry for "${def.key}"`).toBeDefined();
      expect(VERDICT_TOPIC[def.key].trim().length).toBeGreaterThan(0);
    }
  });

  it('has no stray entries beyond the catalogue', () => {
    const catalogueKeys = new Set(REPORT_CATALOGUE.map((d) => d.key));
    for (const key of Object.keys(VERDICT_TOPIC)) {
      expect(
        catalogueKeys.has(key as never),
        `VERDICT_TOPIC has an entry "${key}" not in REPORT_CATALOGUE`,
      ).toBe(true);
    }
  });
});

describe('factsForVerdict', () => {
  it('strips the cross-domain grounding fields that pulled every verdict toward career/wealth', () => {
    const scores = {
      marriageScore: 82,
      band: 'strong',
      lifeContext: { currentMahadasha: 'Venus', domains: [{ domain: 'career', score: 70 }] },
      planetCondition: ['STRENGTH RULE: do not quote these percentages'],
      vargas: [{ chart: 'D9' }],
      ashtakavargaSummary: ['house 7 is strong'],
      userAnswers: { concern: 'when will I marry' },
    };

    const filtered = factsForVerdict(scores);

    expect(filtered).toEqual({ marriageScore: 82, band: 'strong' });
    expect(filtered).not.toHaveProperty('lifeContext');
    expect(filtered).not.toHaveProperty('planetCondition');
  });

  it('leaves a scores object with no grounding fields untouched', () => {
    const scores = { marriageScore: 82, band: 'strong' };
    expect(factsForVerdict(scores)).toEqual(scores);
  });
});

describe('generateReportVerdict — marriage relationship-status framing', () => {
  it('does not describe an already-married reader\'s topic as a "future" spouse, and explicitly forbids it', async () => {
    mockVerdictResponse();
    await generateReportVerdict(
      { marriageScore: 70, band: 'steady', relationshipStatus: 'married' },
      'marriage',
    );
    const prompt = state.generate.mock.calls[0]![0].messages[0].content as string;
    // The default (unmarried) topic phrase must be gone...
    expect(prompt.toLowerCase()).not.toContain('timing, and future spouse/in-laws');
    // ...replaced by an explicit instruction forbidding that exact framing (which necessarily
    // has to name the forbidden phrase to forbid it).
    expect(prompt.toLowerCase()).toContain('never write about a "future spouse"');
    expect(prompt.toLowerCase()).toContain('already married');
  });

  it('keeps the original future-spouse framing for a single/unmarried reader', async () => {
    mockVerdictResponse();
    await generateReportVerdict(
      { marriageScore: 70, band: 'steady', relationshipStatus: 'single' },
      'marriage',
    );
    const prompt = state.generate.mock.calls[0]![0].messages[0].content as string;
    expect(prompt.toLowerCase()).toContain('future spouse');
  });

  it('keeps the original future-spouse framing when relationshipStatus is absent (non-marriage reports, or older data)', async () => {
    mockVerdictResponse();
    await generateReportVerdict({ marriageScore: 70, band: 'steady' }, 'marriage');
    const prompt = state.generate.mock.calls[0]![0].messages[0].content as string;
    expect(prompt.toLowerCase()).toContain('future spouse');
  });
});
