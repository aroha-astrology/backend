import { describe, it, expect } from 'vitest';
import { buildInterpretPrompt, parseInterpretResponse } from '../src/lib/llm/palm/interpret';
import type { PalmRuleFact } from '../src/lib/astro-engine/palm/palm-rules';

const SAMPLE_FACTS: PalmRuleFact[] = [
  {
    key: 'mount.jupiter.prominent',
    evidence: 'Mount of Jupiter (Guru) is prominent.',
    meaning: 'strong leadership drive and a pull toward dharmic recognition',
    source: 'Hasta Samudrika Shastra',
  },
];

describe('buildInterpretPrompt', () => {
  it('wraps facts in <palm_facts> tags as reference data, never instructions', () => {
    const prompt = buildInterpretPrompt({
      primaryHand: 'right',
      facts: SAMPLE_FACTS,
      chartFacts: 'Ascendant: Leo. Jupiter exalted in 9th house.',
      language: 'en',
    });
    expect(prompt).toContain('<palm_facts>');
    expect(prompt).toContain('</palm_facts>');
    expect(prompt).toContain('reference DATA only');
  });

  it('includes every rule fact and the chart grounding facts', () => {
    const prompt = buildInterpretPrompt({
      primaryHand: 'right',
      facts: SAMPLE_FACTS,
      chartFacts: 'Ascendant: Leo. Jupiter exalted in 9th house.',
      language: 'en',
    });
    expect(prompt).toContain('mount.jupiter.prominent');
    expect(prompt).toContain('strong leadership drive');
    expect(prompt).toContain('Ascendant: Leo');
  });

  it('instructs the model never to invent a feature beyond the given facts', () => {
    const prompt = buildInterpretPrompt({
      primaryHand: 'right',
      facts: SAMPLE_FACTS,
      chartFacts: '',
      language: 'en',
    });
    expect(prompt.toLowerCase()).toContain('never invent');
  });

  it('asks for corroboration language when the chart independently agrees', () => {
    const prompt = buildInterpretPrompt({
      primaryHand: 'right',
      facts: SAMPLE_FACTS,
      chartFacts: 'Jupiter exalted in 9th house.',
      language: 'en',
    });
    expect(prompt.toLowerCase()).toContain('corrobor');
  });

  it('explicitly enumerates every required chapter so coverage is complete, not open-ended', () => {
    const prompt = buildInterpretPrompt({
      primaryHand: 'right',
      facts: SAMPLE_FACTS,
      chartFacts: '',
      language: 'en',
    });
    for (const chapter of [
      'mount',
      'love',
      'marriage',
      'career',
      'wealth',
      'health',
      'spiritual',
      'age',
    ]) {
      expect(prompt.toLowerCase()).toContain(chapter);
    }
  });

  it('requests a numeric 0-10 scores block alongside sections', () => {
    const prompt = buildInterpretPrompt({
      primaryHand: 'right',
      facts: SAMPLE_FACTS,
      chartFacts: '',
      language: 'en',
    });
    expect(prompt).toContain('"scores"');
    expect(prompt).toContain('"career"');
    expect(prompt).toContain('"wealth"');
    expect(prompt).toContain('"marriage"');
    expect(prompt).toContain('"health"');
    expect(prompt).toContain('"fame"');
    expect(prompt).toContain('"spiritualGrowth"');
  });
});

const VALID_RESPONSE = JSON.stringify({
  sections: [{ heading: 'Heart Line', paragraphs: ['p1'] }],
  scores: { career: 7, wealth: 6, marriage: 5, health: 9, fame: 4, spiritualGrowth: 8 },
});

describe('parseInterpretResponse', () => {
  it('parses clean JSON into sections and scores', () => {
    const result = parseInterpretResponse(VALID_RESPONSE);
    expect(result).not.toBeNull();
    expect(result!.sections[0]!.heading).toBe('Heart Line');
    expect(result!.sections[0]!.paragraphs).toEqual(['p1']);
    expect(result!.scores).toEqual({
      career: 7,
      wealth: 6,
      marriage: 5,
      health: 9,
      fame: 4,
      spiritualGrowth: 8,
    });
  });

  it('strips markdown code fences before parsing', () => {
    const result = parseInterpretResponse('```json\n' + VALID_RESPONSE + '\n```');
    expect(result).not.toBeNull();
  });

  it('drops sections with empty paragraphs and returns null if none survive', () => {
    const result = parseInterpretResponse(
      JSON.stringify({ sections: [{ heading: 'H', paragraphs: [] }], scores: { career: 5 } }),
    );
    expect(result).toBeNull();
  });

  it('returns null (never filler) on malformed JSON — caller must throw and refund', () => {
    const result = parseInterpretResponse('not json');
    expect(result).toBeNull();
  });

  it('clamps an out-of-range score into 0-10 and defaults a missing score to 5', () => {
    const result = parseInterpretResponse(
      JSON.stringify({
        sections: [{ heading: 'H', paragraphs: ['p'] }],
        scores: {
          career: 15,
          wealth: -3,
          marriage: 5,
          health: 9,
          fame: 4 /* spiritualGrowth missing */,
        },
      }),
    );
    expect(result!.scores.career).toBe(10);
    expect(result!.scores.wealth).toBe(0);
    expect(result!.scores.spiritualGrowth).toBe(5);
  });
});
