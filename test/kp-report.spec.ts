import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { KpSignificator } from '../src/lib/astro-engine/kpSubLord.js';

const state = vi.hoisted(() => ({
  generate: vi.fn(),
}));

vi.mock('../src/lib/llm/gemini-client.js', () => ({
  generate: state.generate,
}));

const { generateKpReport, translateKpContent } = await import('../src/lib/llm/kp-report.js');

const SIGNIFICATORS: KpSignificator[] = [
  { name: 'Ascendant', sign: 'Aries', subLord: 'Mars' },
  { name: 'Sun', sign: 'Aries', subLord: 'Venus' },
  { name: 'Moon', sign: 'Taurus', subLord: 'Rahu' },
];

beforeEach(() => {
  state.generate.mockReset();
});

describe('generateKpReport', () => {
  it('returns the parsed narrative + model', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({
        intro: 'Your KP sub-lords point to a life shaped by bold, independent action.',
        significatorNotes: [
          {
            name: 'Ascendant',
            note: 'Your Ascendant sub-lord Mars suggests a direct, action-first approach to life.',
          },
          {
            name: 'Sun',
            note: 'Your Sun sub-lord Venus softens self-expression toward harmony and relationships.',
          },
        ],
      }),
    );

    const result = await generateKpReport({ significators: SIGNIFICATORS });

    expect(result.intro).toContain('bold');
    expect(result.notes['Ascendant']).toContain('Mars');
    expect(result.notes['Sun']).toContain('Venus');
    expect(result.model).toBeTruthy();
  });

  it('feeds each significator (name, sign, sub-lord) into the grounding context sent to Gemini', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({ intro: 'x', significatorNotes: [{ name: 'Ascendant', note: 'y' }] }),
    );

    await generateKpReport({ significators: SIGNIFICATORS });

    const call = state.generate.mock.calls[0]![0];
    const groundingMessage = call.messages.find((m: { content: string }) =>
      m.content.includes('astro_context'),
    );
    expect(groundingMessage.content).toContain('Ascendant');
    expect(groundingMessage.content).toContain('Mars');
    expect(groundingMessage.content).toContain('Moon');
    expect(groundingMessage.content).toContain('Rahu');
  });

  it('throws (never caches filler) when Gemini returns unparseable JSON', async () => {
    state.generate.mockResolvedValueOnce('not json at all');

    await expect(generateKpReport({ significators: SIGNIFICATORS })).rejects.toThrow(
      'KP LLM returned unparseable JSON',
    );
  });

  it('throws when zero returned significator notes match a known name', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({
        intro: 'x',
        significatorNotes: [{ name: 'Not A Real Significator', note: 'y' }],
      }),
    );

    await expect(generateKpReport({ significators: SIGNIFICATORS })).rejects.toThrow(
      'KP LLM returned unparseable JSON',
    );
  });
});

describe('translateKpContent', () => {
  const original = {
    intro: 'Your KP sub-lords point to a life shaped by bold, independent action.',
    notes: { Ascendant: 'Your Ascendant sub-lord Mars suggests a direct approach to life.' },
  };

  it('returns the translated narrative on a valid response', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({ intro: 'नमस्ते', notes: { Ascendant: 'लग्न उप-स्वामी नोट' } }),
    );

    const result = await translateKpContent(original, 'hi');
    expect(result.intro).toBe('नमस्ते');
    expect(result.notes['Ascendant']).toBe('लग्न उप-स्वामी नोट');
  });

  it('throws on an unparseable translation response', async () => {
    state.generate.mockResolvedValueOnce('garbage');

    await expect(translateKpContent(original, 'hi')).rejects.toThrow(
      'KP translation returned unparseable JSON (target=hi)',
    );
  });
});
