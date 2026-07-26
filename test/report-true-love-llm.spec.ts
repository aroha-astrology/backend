import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TrueLoveScores } from '../src/lib/astro-engine/reports/true-love.js';

const state = vi.hoisted(() => ({ generate: vi.fn() }));

vi.mock('../src/lib/llm/gemini-client.js', () => ({ generate: state.generate }));

const { generateTrueLoveNarrative, translateTrueLoveNarrative } =
  await import('../src/lib/llm/reports/true-love.js');

function makeScores(overrides: Partial<TrueLoveScores> = {}): TrueLoveScores {
  return {
    romanceScore: 75,
    partnershipScore: 60,
    venusInKeyHouse: true,
    loveVsArrangedTilt: 7,
    windows: [],
    ageBands: [
      { label: 'Now – 32', startAge: 30, endAge: 32, confidence: 'NONE' },
      { label: '33 – 36', startAge: 33, endAge: 36, confidence: 'NONE' },
      { label: '37 – 44', startAge: 37, endAge: 44, confidence: 'NONE' },
      { label: '45+', startAge: 45, endAge: null, confidence: 'NONE' },
    ],
    archetype: {
      label: 'The Romantic Explorer',
      description:
        "Classically, this placement's sign (Leo) suggests someone warm, generous, and drawn to a partner who admires them openly.",
      traits: [
        { label: 'Passion', score: 6 },
        { label: 'Openness', score: 6 },
        { label: 'Loyalty', score: 6 },
        { label: 'Spontaneity', score: 6 },
        { label: 'Depth', score: 6 },
      ],
    },
    romanceArc: [
      {
        label: 'Years 1-10',
        startDate: '2026-01-01T00:00:00.000Z',
        endDate: '2036-01-01T00:00:00.000Z',
        score: 60,
        tone: 'mixed',
      },
      {
        label: 'Years 11-20',
        startDate: '2036-01-01T00:00:00.000Z',
        endDate: '2046-01-01T00:00:00.000Z',
        score: 60,
        tone: 'mixed',
      },
      {
        label: 'Years 21-30',
        startDate: '2046-01-01T00:00:00.000Z',
        endDate: '2056-01-01T00:00:00.000Z',
        score: 60,
        tone: 'mixed',
      },
    ],
    doshaYoga: { positives: [], cautions: [] },
    ...overrides,
  };
}

beforeEach(() => {
  state.generate.mockReset();
});

describe('generateTrueLoveNarrative', () => {
  it('makes exactly 2 bounded LLM calls returning 5 sections total', async () => {
    state.generate
      .mockResolvedValueOnce(
        JSON.stringify({
          sections: [
            { heading: 'What This Means For You', paragraphs: ['A hybrid leaning.'] },
            { heading: 'Family Blessing', paragraphs: ['Family looks supportive.'] },
          ],
        }),
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          sections: [
            { heading: 'Your Timing Windows', paragraphs: ['No strong window yet.'] },
            { heading: 'Your Romantic Archetype', paragraphs: ['You lean into connection.'] },
            { heading: 'Blessings & Cautions', paragraphs: ['Nothing notable was flagged.'] },
          ],
        }),
      );

    const sections = await generateTrueLoveNarrative(makeScores());

    expect(state.generate).toHaveBeenCalledTimes(2);
    expect(sections).toHaveLength(5);
    expect(sections[2]?.heading).toBe('Your Timing Windows');
  });

  it('embeds the given tilt/romance/partnership facts as GIVEN FACTS in call 1', async () => {
    state.generate.mockResolvedValue(
      JSON.stringify({ sections: [{ heading: 'H', paragraphs: ['p'] }] }),
    );
    await generateTrueLoveNarrative(makeScores({ loveVsArrangedTilt: 9, romanceScore: 88 }));
    const call = state.generate.mock.calls[0]?.[0];
    const content = call.messages.map((m: { content: string }) => m.content).join('\n');
    expect(content).toContain('9');
    expect(content).toContain('88');
    expect(content.toUpperCase()).toContain('GIVEN FACT');
  });

  it('embeds windows/archetype/doshaYoga facts as GIVEN FACTS in call 2', async () => {
    state.generate.mockResolvedValue(
      JSON.stringify({ sections: [{ heading: 'H', paragraphs: ['p'] }] }),
    );
    await generateTrueLoveNarrative(
      makeScores({
        doshaYoga: {
          positives: [],
          cautions: [{ label: 'Mangal Dosha', detail: 'high severity' }],
        },
      }),
    );
    const call = state.generate.mock.calls[1]?.[0];
    const content = call.messages.map((m: { content: string }) => m.content).join('\n');
    expect(content).toContain('The Romantic Explorer');
    expect(content).toContain('Mangal Dosha');
    expect(content.toUpperCase()).toContain('GIVEN FACT');
  });

  it('states no windows/no cautions plainly when both are empty, rather than inventing one', async () => {
    state.generate.mockResolvedValue(
      JSON.stringify({ sections: [{ heading: 'H', paragraphs: ['p'] }] }),
    );
    await generateTrueLoveNarrative(
      makeScores({ windows: [], doshaYoga: { positives: [], cautions: [] } }),
    );
    const call = state.generate.mock.calls[1]?.[0];
    const content = call.messages.map((m: { content: string }) => m.content).join('\n');
    expect(content).toContain('None identified');
    expect(content).toContain('No specific dosha caution or featured yoga was detected');
  });

  it('throws on an unparseable response from call 1 (never reaches call 2)', async () => {
    state.generate.mockResolvedValueOnce('not json');
    await expect(generateTrueLoveNarrative(makeScores())).rejects.toThrow();
    expect(state.generate).toHaveBeenCalledTimes(1);
  });

  it('throws on an unparseable response from call 2', async () => {
    state.generate
      .mockResolvedValueOnce(JSON.stringify({ sections: [{ heading: 'H', paragraphs: ['p'] }] }))
      .mockResolvedValueOnce('not json');
    await expect(generateTrueLoveNarrative(makeScores())).rejects.toThrow();
  });
});

describe('translateTrueLoveNarrative', () => {
  const sections = [{ heading: 'What This Means For You', paragraphs: ['A hybrid leaning.'] }];

  it('parses a valid translated response', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({ sections: [{ heading: 'हिंदी', paragraphs: ['अनुवाद'] }] }),
    );
    const translated = await translateTrueLoveNarrative(sections, 'hi');
    expect(translated[0]?.heading).toBe('हिंदी');
  });

  it('throws on an unparseable translated response', async () => {
    state.generate.mockResolvedValueOnce('garbage');
    await expect(translateTrueLoveNarrative(sections, 'hi')).rejects.toThrow();
  });
});
