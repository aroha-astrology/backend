import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RemedyItem } from '../src/modules/astro/astro.service.js';

const state = vi.hoisted(() => ({
  generate: vi.fn(),
}));

vi.mock('../src/lib/llm/gemini-client.js', () => ({
  generate: state.generate,
}));

const { generateRemediesReport, translateRemediesContent } =
  await import('../src/lib/llm/remedies-report.js');

const REMEDIES: RemedyItem[] = [
  {
    planet: 'Saturn',
    title: 'Pacify Saturn',
    icon: 'shield',
    remedy: 'Donate black sesame seeds on Saturdays.',
  },
  {
    planet: 'General',
    title: 'Career Growth',
    icon: 'briefcase',
    remedy: 'Chant Om Brihaspataye Namah 108 times every Thursday morning.',
  },
];

beforeEach(() => {
  state.generate.mockReset();
});

describe('generateRemediesReport', () => {
  it('returns the parsed narrative + model', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({
        intro: 'Your chart calls for a little extra support around discipline and structure.',
        remedyNotes: [
          {
            title: 'Pacify Saturn',
            note: 'Your Saturn placement suggests extra grounding will help.',
          },
          {
            title: 'Career Growth',
            note: 'Jupiter support strengthens the steady growth already underway.',
          },
        ],
      }),
    );

    const result = await generateRemediesReport({ remedies: REMEDIES });

    expect(result.intro).toContain('discipline');
    expect(result.notes['Pacify Saturn']).toContain('grounding');
    expect(result.notes['Career Growth']).toContain('Jupiter');
    expect(result.model).toBeTruthy();
  });

  it('feeds the remedy titles/planets/rituals into the grounding context sent to Gemini', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({ intro: 'x', remedyNotes: [{ title: 'Pacify Saturn', note: 'y' }] }),
    );

    await generateRemediesReport({ remedies: REMEDIES });

    const call = state.generate.mock.calls[0]![0];
    const groundingMessage = call.messages.find((m: { content: string }) =>
      m.content.includes('astro_context'),
    );
    expect(groundingMessage.content).toContain('Pacify Saturn');
    expect(groundingMessage.content).toContain('black sesame');
  });

  it('throws (never caches filler) when Gemini returns unparseable JSON', async () => {
    state.generate.mockResolvedValueOnce('not json at all');

    await expect(generateRemediesReport({ remedies: REMEDIES })).rejects.toThrow(
      'remedies LLM returned unparseable JSON',
    );
  });

  it('throws when zero returned remedy notes match a known remedy title', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({ intro: 'x', remedyNotes: [{ title: 'Not A Real Remedy', note: 'y' }] }),
    );

    await expect(generateRemediesReport({ remedies: REMEDIES })).rejects.toThrow(
      'remedies LLM returned unparseable JSON',
    );
  });
});

describe('translateRemediesContent', () => {
  const original = {
    intro: 'Your chart calls for a little extra support around discipline and structure.',
    notes: { 'Pacify Saturn': 'Your Saturn placement suggests extra grounding will help.' },
  };

  it('returns the translated narrative on a valid response', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({ intro: 'नमस्ते', notes: { 'Pacify Saturn': 'शनि की सलाह' } }),
    );

    const result = await translateRemediesContent(original, 'hi');
    expect(result.intro).toBe('नमस्ते');
    expect(result.notes['Pacify Saturn']).toBe('शनि की सलाह');
  });

  it('throws on an unparseable translation response', async () => {
    state.generate.mockResolvedValueOnce('garbage');

    await expect(translateRemediesContent(original, 'hi')).rejects.toThrow(
      'remedies translation returned unparseable JSON (target=hi)',
    );
  });
});
