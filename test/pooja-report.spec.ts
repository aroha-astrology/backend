import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PoojaRecommendation } from '../src/lib/astro-engine/poojaRecommendations.js';

const state = vi.hoisted(() => ({
  generate: vi.fn(),
}));

vi.mock('../src/lib/llm/gemini-client.js', () => ({
  generate: state.generate,
}));

const { generatePoojaReport, translatePoojaContent } =
  await import('../src/lib/llm/pooja-report.js');

const RECOMMENDATIONS: PoojaRecommendation[] = [
  {
    name: 'Mangal Shanti Pooja',
    deity: 'Lord Hanuman / Mangal (Mars)',
    forCondition: 'Mangal Dosha',
    description: 'Traditionally performed to pacify Mars.',
  },
  {
    name: 'Satyanarayan Pooja',
    deity: 'Lord Vishnu',
    forCondition: 'General wellbeing',
    description: 'A traditional pooja for overall prosperity.',
  },
];

beforeEach(() => {
  state.generate.mockReset();
});

describe('generatePoojaReport', () => {
  it('returns the parsed narrative + model', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({
        intro: 'Your chart points to a couple of poojas worth considering right now.',
        poojaNotes: [
          {
            name: 'Mangal Shanti Pooja',
            note: 'Your Mars placement suggests this would offer extra support.',
          },
          {
            name: 'Satyanarayan Pooja',
            note: 'A good general choice alongside your other remedies.',
          },
        ],
      }),
    );

    const result = await generatePoojaReport({ recommendations: RECOMMENDATIONS });

    expect(result.intro).toContain('poojas');
    expect(result.notes['Mangal Shanti Pooja']).toContain('Mars');
    expect(result.notes['Satyanarayan Pooja']).toBeTruthy();
    expect(result.model).toBeTruthy();
  });

  it('feeds the recommended pooja names/deities/descriptions into the grounding context', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({ intro: 'x', poojaNotes: [{ name: 'Mangal Shanti Pooja', note: 'y' }] }),
    );

    await generatePoojaReport({ recommendations: RECOMMENDATIONS });

    const call = state.generate.mock.calls[0]![0];
    const groundingMessage = call.messages.find((m: { content: string }) =>
      m.content.includes('astro_context'),
    );
    expect(groundingMessage.content).toContain('Mangal Shanti Pooja');
    expect(groundingMessage.content).toContain('pacify Mars');
  });

  it('throws (never caches filler) when Gemini returns unparseable JSON', async () => {
    state.generate.mockResolvedValueOnce('not json at all');

    await expect(generatePoojaReport({ recommendations: RECOMMENDATIONS })).rejects.toThrow(
      'pooja LLM returned unparseable JSON',
    );
  });

  it('throws when zero returned pooja notes match a known recommendation name', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({ intro: 'x', poojaNotes: [{ name: 'Not A Real Pooja', note: 'y' }] }),
    );

    await expect(generatePoojaReport({ recommendations: RECOMMENDATIONS })).rejects.toThrow(
      'pooja LLM returned unparseable JSON',
    );
  });
});

describe('translatePoojaContent', () => {
  const original = {
    intro: 'Your chart points to a couple of poojas worth considering right now.',
    notes: {
      'Mangal Shanti Pooja': 'Your Mars placement suggests this would offer extra support.',
    },
  };

  it('returns the translated narrative on a valid response', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({ intro: 'नमस्ते', notes: { 'Mangal Shanti Pooja': 'मंगल शांति पूजा नोट' } }),
    );

    const result = await translatePoojaContent(original, 'hi');
    expect(result.intro).toBe('नमस्ते');
    expect(result.notes['Mangal Shanti Pooja']).toBe('मंगल शांति पूजा नोट');
  });

  it('throws on an unparseable translation response', async () => {
    state.generate.mockResolvedValueOnce('garbage');

    await expect(translatePoojaContent(original, 'hi')).rejects.toThrow(
      'pooja translation returned unparseable JSON (target=hi)',
    );
  });
});
