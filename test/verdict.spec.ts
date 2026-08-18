import { describe, it, expect } from 'vitest';
import { VERDICT_TOPIC, factsForVerdict } from '../src/lib/llm/reports/verdict.js';
import { REPORT_CATALOGUE } from '../src/config/reports.js';

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
