import { describe, it, expect } from 'vitest';
import { buildSynthesizePrompt, parseSynthesizeResponse } from '../src/lib/llm/palm/synthesize';

describe('buildSynthesizePrompt', () => {
  it('frames left as inherited blueprint and right as the lived path', () => {
    const prompt = buildSynthesizePrompt({
      primaryHandLabel: 'right hand — vartamana karma (current path)',
      secondaryHandLabel: 'left hand — purvakarma (inherited blueprint)',
      primaryFactsSummary: 'Jupiter mount prominent; heart line ends under Jupiter.',
      secondaryFactsSummary: 'Jupiter mount flat; heart line ends under Saturn.',
    });
    expect(prompt).toContain('purvakarma');
    expect(prompt).toContain('vartamana karma');
    expect(prompt).toContain('Jupiter mount prominent');
    expect(prompt).toContain('Jupiter mount flat');
  });

  it('asks for an integer alignmentScore between 0 and 100', () => {
    const prompt = buildSynthesizePrompt({
      primaryHandLabel: 'right',
      secondaryHandLabel: 'left',
      primaryFactsSummary: 'a',
      secondaryFactsSummary: 'b',
    });
    expect(prompt).toContain('alignmentScore');
    expect(prompt).toContain('0');
    expect(prompt).toContain('100');
  });
});

describe('parseSynthesizeResponse', () => {
  const VALID = JSON.stringify({
    karmicShift: 'shift',
    freeWillExpression: 'expression',
    growthAreas: ['a', 'b'],
    alignmentScore: 72,
    panditMessage: 'message',
  });

  it('parses a complete valid response', () => {
    const result = parseSynthesizeResponse(VALID);
    expect(result).not.toBeNull();
    expect(result!.alignmentScore).toBe(72);
    expect(result!.growthAreas).toEqual(['a', 'b']);
  });

  it('clamps an out-of-range alignmentScore into 0-100', () => {
    const result = parseSynthesizeResponse(
      JSON.stringify({
        karmicShift: 'shift',
        freeWillExpression: 'expression',
        growthAreas: [],
        alignmentScore: 150,
        panditMessage: 'message',
      }),
    );
    expect(result!.alignmentScore).toBe(100);
  });

  it('returns null when a required narrative field is missing', () => {
    const result = parseSynthesizeResponse(
      JSON.stringify({
        freeWillExpression: 'x',
        growthAreas: [],
        alignmentScore: 50,
        panditMessage: 'm',
      }),
    );
    expect(result).toBeNull();
  });

  it('returns null on malformed JSON', () => {
    expect(parseSynthesizeResponse('not json')).toBeNull();
  });
});
