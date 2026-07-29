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
    riskFactors: [
      { key: 'wealth', severity: 'benefit', score: 75, evidence: ['2nd lords both strong.'] },
      { key: 'health', severity: 'neutral', score: 60, evidence: ['8th lords average.'] },
      { key: 'children', severity: 'neutral', score: 60, evidence: ['5th lords average.'] },
      { key: 'harmony', severity: 'benefit', score: 80, evidence: ['Strong Bhakoot/Nadi.'] },
      { key: 'career', severity: 'caution', score: 40, evidence: ['10th lords clash.'] },
      { key: 'timing', severity: 'neutral', score: 60, evidence: ['No strong dasha signal yet.'] },
      { key: 'intimacy', severity: 'benefit', score: 70, evidence: ['Venus well placed.'] },
      { key: 'inlaws', severity: 'neutral', score: 60, evidence: ['4th lords average.'] },
    ],
    ...overrides,
  };
}

const genericSectionResponse = JSON.stringify({
  sections: [{ heading: 'H', paragraphs: ['p'] }],
});

beforeEach(() => {
  state.generate.mockReset();
  // Blanket fallback so tests that only care about call 1's content don't need to also stub call
  // 2 — mockResolvedValueOnce (used below for call-1-specific assertions) takes priority for the
  // first call; anything after falls back to this.
  state.generate.mockResolvedValue(genericSectionResponse);
});

describe('generateKundliMilanNarrative', () => {
  it('makes exactly 2 bounded calls, returning 5 + 2 = 7 sections total', async () => {
    state.generate
      .mockResolvedValueOnce(
        JSON.stringify({
          sections: [
            {
              heading: 'What Your Guna Milan Score Means',
              paragraphs: ['You scored 28 out of 36.'],
            },
            { heading: 'Dashakoota Deep Dive', paragraphs: ['Your Dashakoota verdict is good.'] },
            {
              heading: 'Manglik Compatibility',
              paragraphs: ['Neither of you shows Manglik Dosha.'],
            },
            {
              heading: "Your Chart's Additional Facts",
              paragraphs: ['No cautions were flagged for you.'],
            },
            { heading: 'Overall Recommendation', paragraphs: ['This is a promising match.'] },
          ],
        }),
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          sections: [
            {
              heading: 'Health, Wealth & Career Compatibility',
              paragraphs: ['Career looks like it needs care.'],
            },
            {
              heading: 'Children, Family Harmony & Right Timing',
              paragraphs: ['Timing looks neutral for now.'],
            },
          ],
        }),
      );

    const sections = await generateKundliMilanNarrative(makeScores());

    expect(state.generate).toHaveBeenCalledTimes(2);
    expect(sections).toHaveLength(7);
    expect(sections.map((s) => s.heading)).toEqual([
      'What Your Guna Milan Score Means',
      'Dashakoota Deep Dive',
      'Manglik Compatibility',
      "Your Chart's Additional Facts",
      'Overall Recommendation',
      'Health, Wealth & Career Compatibility',
      'Children, Family Harmony & Right Timing',
    ]);
  });

  it('embeds the given career/timing/children/harmony risk-factor facts (with evidence) in call 2 — previously unanswerable anywhere in this report', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({ sections: [{ heading: 'H', paragraphs: ['p'] }] }),
    );
    await generateKundliMilanNarrative(makeScores());

    const call2 = state.generate.mock.calls[1]?.[0];
    const content = call2.messages.map((m: { content: string }) => m.content).join('\n');
    expect(content).toContain('career');
    expect(content).toContain('10th lords clash');
    expect(content).toContain('timing');
    expect(content).toContain('children');
    expect(content).toContain('harmony');
    expect(content.toUpperCase()).toContain('GIVEN FACT');
  });

  it('throws when call 2 returns unparseable JSON, even if call 1 succeeded', async () => {
    state.generate.mockResolvedValueOnce(genericSectionResponse).mockResolvedValueOnce('not json');
    await expect(generateKundliMilanNarrative(makeScores())).rejects.toThrow();
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
