import { describe, it, expect } from 'vitest';
import {
  isCheckableClaim,
  splitSentences,
  verifyReportClaims,
} from '../src/lib/llm/reports/verify-claims.js';

describe('splitSentences', () => {
  it('splits on sentence terminators and keeps them', () => {
    expect(splitSentences('One thing. Two things! Three?')).toEqual([
      'One thing.',
      'Two things!',
      'Three?',
    ]);
  });

  it('returns nothing for empty or whitespace-only input', () => {
    expect(splitSentences('')).toEqual([]);
    expect(splitSentences('   ')).toEqual([]);
  });
});

describe('isCheckableClaim', () => {
  it('flags a sentence naming a planet AND a structural placement', () => {
    expect(isCheckableClaim('Saturn in your 7th house brings delays.')).toBe(true);
    expect(isCheckableClaim('Your Moon is in Pisces.')).toBe(true);
    expect(isCheckableClaim('Mercury is combust in this chart.')).toBe(true);
  });

  it('leaves general guidance alone — a fact list cannot adjudicate it', () => {
    expect(isCheckableClaim('This is a period that rewards patience.')).toBe(false);
    expect(isCheckableClaim('Take care of your health this month.')).toBe(false);
  });

  it('does not flag a planet mentioned without any structural claim', () => {
    // Naming a planet alone is not a checkable assertion about the chart.
    expect(isCheckableClaim('Saturn teaches through time.')).toBe(false);
  });
});

describe('verifyReportClaims', () => {
  const sections = [
    {
      heading: 'Career',
      paragraphs: ['Saturn sits in your 10th house. Work steadily and results will come.'],
    },
  ];

  it('returns the narrative untouched when there are no facts to check against', async () => {
    const out = await verifyReportClaims(sections, []);
    expect(out.sections).toBe(sections);
    expect(out.dropped).toBe(0);
  });

  it('returns the narrative untouched when nothing in it is checkable', async () => {
    const vague = [{ heading: 'Outlook', paragraphs: ['Be patient. Good things take time.'] }];
    const out = await verifyReportClaims(vague, ['Saturn is natally in house 10']);
    expect(out.sections).toBe(vague);
    expect(out.dropped).toBe(0);
  });

  it('fails OPEN when the verifier call throws — a paid report is never gutted', async () => {
    // No Gemini key is configured in tests, so generate() rejects. The contract
    // is that the narrative survives that untouched.
    const out = await verifyReportClaims(sections, ['Saturn is natally in house 10']);
    expect(out.sections).toEqual(sections);
    expect(out.dropped).toBe(0);
  }, 30_000);
});
