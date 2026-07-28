import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { KundliMilanScores } from '../src/lib/astro-engine/reports/kundli-milan.js';

const state = vi.hoisted(() => ({ generate: vi.fn() }));

vi.mock('../src/lib/llm/gemini-client.js', () => ({ generate: state.generate }));

const { generateKundliMilanNarrative, translateKundliMilanNarrative } =
  await import('../src/lib/llm/reports/kundli-milan.js');

function makeScores(overrides: Partial<KundliMilanScores> = {}): KundliMilanScores {
  return {
    gunaMilanScore: 28,
    gunaMaxScore: 36,
    gunaBreakdown: [{ name: 'Nadi', score: 8, maxScore: 8, description: 'Different nadis' }],
    dashakootaScore: 8,
    dashakootaMaxScore: 10,
    dashakootaBreakdown: [{ name: 'Dina', score: 1, maxScore: 1, description: 'Favorable' }],
    dashakootaCompatibility: 'good',
    manglikStatus: { person1: false, person2: false, cancelled: false },
    compatibilityBand: 'good',
    primaryDoshaYoga: { positives: [], cautions: [] },
    ...overrides,
  };
}

beforeEach(() => {
  state.generate.mockReset();
});

describe('generateKundliMilanNarrative', () => {
  it('parses a valid sectioned response and returns it', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({
        sections: [
          { heading: 'What Your Guna Milan Score Means', paragraphs: ['You scored 28 out of 36.'] },
          { heading: 'Dashakoota Deep Dive', paragraphs: ['Your Dashakoota verdict is good.'] },
          { heading: 'Manglik Compatibility', paragraphs: ['Neither of you shows Manglik Dosha.'] },
          {
            heading: "Your Chart's Additional Facts",
            paragraphs: ['No cautions were flagged for you.'],
          },
          { heading: 'Overall Recommendation', paragraphs: ['This is a promising match.'] },
        ],
      }),
    );

    const sections = await generateKundliMilanNarrative(makeScores());
    expect(sections).toHaveLength(5);
    expect(sections.map((s) => s.heading)).toEqual([
      'What Your Guna Milan Score Means',
      'Dashakoota Deep Dive',
      'Manglik Compatibility',
      "Your Chart's Additional Facts",
      'Overall Recommendation',
    ]);
  });

  it('embeds the Dashakoota per-porutham breakdown and overall verdict as facts (previously computed but never fed)', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({ sections: [{ heading: 'H', paragraphs: ['p'] }] }),
    );
    await generateKundliMilanNarrative(
      makeScores({
        dashakootaCompatibility: 'excellent',
        dashakootaBreakdown: [
          {
            name: 'Dina',
            score: 1,
            maxScore: 1,
            description: 'Favorable — good health for couple',
          },
          {
            name: 'Mahendra',
            score: 1,
            maxScore: 1,
            description: 'Present — prosperity and progeny indicated',
          },
        ],
      }),
    );

    const call = state.generate.mock.calls[0]?.[0];
    const allContent = call.messages.map((m: { content: string }) => m.content).join('\n');
    expect(allContent).toContain('Dashakoota overall verdict: excellent');
    expect(allContent).toContain('Mahendra: 1/1 — Present — prosperity and progeny indicated');
    expect(allContent.toLowerCase()).toContain('dashakoot verdict');
  });

  it('calls generate() with the score numbers embedded as facts', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({ sections: [{ heading: 'H', paragraphs: ['p'] }] }),
    );
    await generateKundliMilanNarrative(makeScores({ gunaMilanScore: 31 }));

    const call = state.generate.mock.calls[0]?.[0];
    const allContent = call.messages.map((m: { content: string }) => m.content).join('\n');
    expect(allContent).toContain('31');
    expect(allContent).toContain('GIVEN FACTS');
  });

  it('embeds primaryDoshaYoga cautions as facts, explicitly labeled person1-only', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({ sections: [{ heading: 'H', paragraphs: ['p'] }] }),
    );
    await generateKundliMilanNarrative(
      makeScores({
        primaryDoshaYoga: {
          positives: [],
          cautions: [{ label: 'Kaal Sarp Dosha', detail: 'full, high severity' }],
        },
      }),
    );

    const call = state.generate.mock.calls[0]?.[0];
    const allContent = call.messages.map((m: { content: string }) => m.content).join('\n');
    expect(allContent).toContain('Kaal Sarp Dosha');
    expect(allContent).toContain('PERSON1 ONLY');
  });

  it('states "None flagged" when primaryDoshaYoga has no cautions or positives', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({ sections: [{ heading: 'H', paragraphs: ['p'] }] }),
    );
    await generateKundliMilanNarrative(
      makeScores({ primaryDoshaYoga: { positives: [], cautions: [] } }),
    );

    const call = state.generate.mock.calls[0]?.[0];
    const allContent = call.messages.map((m: { content: string }) => m.content).join('\n');
    expect(allContent).toContain('None flagged');
  });

  it('throws on an unparseable response rather than returning filler', async () => {
    state.generate.mockResolvedValueOnce('not json at all');
    await expect(generateKundliMilanNarrative(makeScores())).rejects.toThrow();
  });

  it('throws when the response has no usable sections', async () => {
    state.generate.mockResolvedValueOnce(JSON.stringify({ sections: [] }));
    await expect(generateKundliMilanNarrative(makeScores())).rejects.toThrow();
  });
});

describe('translateKundliMilanNarrative', () => {
  const sections = [
    { heading: 'What Your Guna Milan Score Means', paragraphs: ['You scored 28.'] },
  ];

  it('parses a valid translated response', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({
        sections: [{ heading: 'हिंदी शीर्षक', paragraphs: ['आपको 28 अंक मिले।'] }],
      }),
    );
    const translated = await translateKundliMilanNarrative(sections, 'hi');
    expect(translated[0]?.heading).toBe('हिंदी शीर्षक');
  });

  it('throws on an unparseable translated response', async () => {
    state.generate.mockResolvedValueOnce('garbage');
    await expect(translateKundliMilanNarrative(sections, 'hi')).rejects.toThrow();
  });
});
