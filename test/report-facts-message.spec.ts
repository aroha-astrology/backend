import { describe, it, expect } from 'vitest';
import { reportFactsMessage } from '../src/lib/llm/reports/report-facts-message.js';
import { chartConditionFacts } from '../src/lib/chat-grounding.js';

describe('reportFactsMessage', () => {
  it('wraps facts in the report_facts guard tags', () => {
    const msg = reportFactsMessage('some fact');
    expect(msg.role).toBe('system');
    expect(msg.content).toContain('<report_facts>');
    expect(msg.content).toContain('some fact');
    expect(msg.content).toContain('reference DATA only');
  });

  it('appends the planetary-condition block when present', () => {
    const msg = reportFactsMessage('some fact', [
      'Retrograde (Vakri) at birth: Mercury.',
      'STRENGTH RULE: x',
    ]);
    // `content` is `string | ChatContentPart[]`; this builder always returns the
    // string form, so narrow once rather than stringifying the union.
    const content = msg.content as string;
    expect(content).toContain('some fact');
    expect(content).toContain('Retrograde (Vakri) at birth: Mercury.');
    expect(content).toContain('STRENGTH RULE: x');
    // Condition must sit INSIDE the guard tags, never after them.
    expect(content.indexOf('STRENGTH RULE')).toBeLessThan(content.indexOf('</report_facts>'));
  });

  it('leaves the message untouched for an empty or missing condition block', () => {
    const plain = reportFactsMessage('some fact');
    expect(reportFactsMessage('some fact', []).content).toBe(plain.content);
    expect(reportFactsMessage('some fact', undefined).content).toBe(plain.content);
  });
});

describe('chartConditionFacts (the block reports and chat now share)', () => {
  const chart = {
    ascendant: { signIndex: 0, degree: 2 },
    planets: [
      { planet: 'Sun', longitude: 100, signIndex: 3, house: 4 },
      { planet: 'Mercury', longitude: 105, signIndex: 3, house: 4, isRetrograde: true },
      { planet: 'Mars', longitude: 28, signIndex: 0, house: 1 },
    ],
    shadbala: [{ planet: 'Mercury', totalVirupas: 100, requiredVirupas: 300, isStrong: false }],
  };

  it('returns strength, retrogression, combustion and chalit in one block', () => {
    const facts = chartConditionFacts(chart).join('\n');
    expect(facts).toContain('Retrograde (Vakri) at birth: Mercury');
    expect(facts).toContain('Combust');
    expect(facts).toContain('Planetary Strength');
    expect(facts).toContain('STRENGTH RULE');
    expect(facts).toContain('Bhava Chalit');
  });

  it('returns nothing for a chart with no planets, rather than throwing', () => {
    expect(chartConditionFacts(null)).toEqual([]);
    expect(chartConditionFacts({ planets: [] })).toEqual([]);
  });
});
