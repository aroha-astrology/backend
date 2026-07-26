import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WealthScores } from '../src/lib/astro-engine/reports/wealth.js';

const state = vi.hoisted(() => ({ generate: vi.fn() }));

vi.mock('../src/lib/llm/gemini-client.js', () => ({ generate: state.generate }));

const { generateWealthNarrative, translateWealthNarrative } =
  await import('../src/lib/llm/reports/wealth.js');

function makeScores(overrides: Partial<WealthScores> = {}): WealthScores {
  return {
    wealthScore: 65,
    secondLordStrength: 'average',
    eleventhLordStrength: 'strong',
    jupiterStrength: 'average',
    jupiterHouse: 10,
    wealthPattern: 'volatile_gains',
    windows: [
      {
        startDate: '2027-01-01T00:00:00.000Z',
        endDate: '2027-06-01T00:00:00.000Z',
        score: 2,
        level: 'MEDIUM',
        dashaLevel: 'antardasha',
        reasoning: ['Vimshottari anchor: Jupiter antardasha (within Saturn major period).'],
      },
    ],
    ageBands: [
      { label: 'Now – 33', startAge: 30, endAge: 33, confidence: 'MEDIUM' },
      { label: '34 – 37', startAge: 34, endAge: 37, confidence: 'NONE' },
      { label: '38 – 45', startAge: 38, endAge: 45, confidence: 'NONE' },
      { label: '46+', startAge: 46, endAge: null, confidence: 'NONE' },
    ],
    moneyArchetype: {
      label: 'The Opportunistic Gainer',
      description:
        "Classically, this placement's sign (Virgo) suggests someone thoughtful, practical, and devoted through acts of service.",
      traits: [
        { label: 'Caution', score: 6 },
        { label: 'Ambition', score: 9 },
        { label: 'Generosity', score: 9 },
        { label: 'Discipline', score: 6 },
        { label: 'Risk-tolerance', score: 3 },
      ],
    },
    wealthArc: [
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
        score: 75,
        tone: 'favorable',
      },
      {
        label: 'Years 21-30',
        startDate: '2046-01-01T00:00:00.000Z',
        endDate: '2056-01-01T00:00:00.000Z',
        score: 50,
        tone: 'mixed',
      },
    ],
    doshaYoga: {
      positives: [{ label: 'Dhana Yoga', detail: 'Wealth-giving combination.' }],
      cautions: [{ label: 'Kemdruma Dosha', detail: 'moderate severity' }],
    },
    spendingVsSavingTilt: 7,
    ...overrides,
  };
}

const patternResponse = JSON.stringify({
  sections: [
    { heading: 'Wealth Pattern', paragraphs: ['Gains arrive in bursts.'] },
    { heading: 'Practical Guidance', paragraphs: ['Consider steady saving habits.'] },
  ],
});

const enrichedResponse = JSON.stringify({
  sections: [
    { heading: 'Wealth Timing', paragraphs: ['A medium-confidence window opens next year.'] },
    { heading: 'Your Money Archetype', paragraphs: ['You lean into ambition and generosity.'] },
    {
      heading: 'Dosha & Yoga Check',
      paragraphs: ['A Dhana Yoga supports gains; watch the Kemdruma caution.'],
    },
    {
      heading: 'Spending vs. Saving Tilt',
      paragraphs: ['Your tilt runs toward spending on gains.'],
    },
  ],
});

beforeEach(() => {
  state.generate.mockReset();
});

describe('generateWealthNarrative', () => {
  it('returns 6 sections (2 + 4) from 2 LLM calls', async () => {
    state.generate.mockResolvedValueOnce(patternResponse).mockResolvedValueOnce(enrichedResponse);
    const sections = await generateWealthNarrative(makeScores());
    expect(state.generate).toHaveBeenCalledTimes(2);
    expect(sections).toHaveLength(6);
    expect(sections.map((s) => s.heading)).toEqual([
      'Wealth Pattern',
      'Practical Guidance',
      'Wealth Timing',
      'Your Money Archetype',
      'Dosha & Yoga Check',
      'Spending vs. Saving Tilt',
    ]);
  });

  it('instructs the model NOT to give financial advice in both calls (disclaimer requirement)', async () => {
    state.generate.mockResolvedValueOnce(patternResponse).mockResolvedValueOnce(enrichedResponse);
    await generateWealthNarrative(makeScores());
    for (const call of state.generate.mock.calls) {
      const content = call[0].messages.map((m: { content: string }) => m.content).join('\n');
      expect(content.toLowerCase()).toContain('not financial advice');
    }
  });

  it('embeds the given wealthScore/wealthPattern facts in the first call', async () => {
    state.generate.mockResolvedValueOnce(patternResponse).mockResolvedValueOnce(enrichedResponse);
    await generateWealthNarrative(
      makeScores({ wealthScore: 82, wealthPattern: 'steady_accumulation' }),
    );
    const firstCallContent = state.generate.mock.calls[0]?.[0].messages
      .map((m: { content: string }) => m.content)
      .join('\n');
    expect(firstCallContent).toContain('82');
    expect(firstCallContent).toContain('steady_accumulation');
  });

  it('embeds the windows/ageBands/archetype/doshaYoga/tilt facts in the second call, never inventing a window when empty', async () => {
    state.generate.mockResolvedValueOnce(patternResponse).mockResolvedValueOnce(enrichedResponse);
    await generateWealthNarrative(makeScores({ windows: [], spendingVsSavingTilt: 3 }));
    const secondCallContent = state.generate.mock.calls[1]?.[0].messages
      .map((m: { content: string }) => m.content)
      .join('\n');
    expect(secondCallContent).toContain('No favorable wealth timing window was found');
    expect(secondCallContent).toContain('The Opportunistic Gainer');
    expect(secondCallContent).toContain('Dhana Yoga');
    expect(secondCallContent).toContain('Kemdruma Dosha');
    expect(secondCallContent).toContain('3 out of 10');
    expect(secondCallContent.toLowerCase()).toContain('given fact');
  });

  it('throws when either call returns unparseable JSON', async () => {
    state.generate.mockResolvedValueOnce('not json').mockResolvedValueOnce(enrichedResponse);
    await expect(generateWealthNarrative(makeScores())).rejects.toThrow();
  });

  it('throws when the second call returns unparseable JSON', async () => {
    state.generate.mockResolvedValueOnce(patternResponse).mockResolvedValueOnce('garbage');
    await expect(generateWealthNarrative(makeScores())).rejects.toThrow();
  });
});

describe('translateWealthNarrative', () => {
  const sections = [
    { heading: 'Wealth Pattern', paragraphs: ['Gains arrive in bursts.'] },
    { heading: 'Practical Guidance', paragraphs: ['Consider steady saving habits.'] },
    { heading: 'Wealth Timing', paragraphs: ['A window opens next year.'] },
    { heading: 'Your Money Archetype', paragraphs: ['You lean into ambition.'] },
    { heading: 'Dosha & Yoga Check', paragraphs: ['A Dhana Yoga supports gains.'] },
    { heading: 'Spending vs. Saving Tilt', paragraphs: ['Your tilt runs toward spending.'] },
  ];

  it('translates both groups (first 2, then remaining 4) and preserves the 6-section order', async () => {
    const translatedPattern = JSON.stringify({
      sections: sections
        .slice(0, 2)
        .map((s) => ({ heading: `HI ${s.heading}`, paragraphs: ['हिंदी।'] })),
    });
    const translatedEnriched = JSON.stringify({
      sections: sections
        .slice(2)
        .map((s) => ({ heading: `HI ${s.heading}`, paragraphs: ['हिंदी।'] })),
    });
    state.generate
      .mockResolvedValueOnce(translatedPattern)
      .mockResolvedValueOnce(translatedEnriched);

    const translated = await translateWealthNarrative(sections, 'hi');
    expect(translated).toHaveLength(6);
    expect(translated[0]?.heading).toBe('HI Wealth Pattern');
    expect(translated[5]?.heading).toBe('HI Spending vs. Saving Tilt');
    expect(state.generate).toHaveBeenCalledTimes(2);
  });

  it('parses a valid translated response for a legacy-shaped (fewer than 2 sections) input with only 1 call', async () => {
    const legacySections = [{ heading: 'Wealth Pattern', paragraphs: ['Gains arrive in bursts.'] }];
    state.generate.mockResolvedValueOnce(
      JSON.stringify({ sections: [{ heading: 'हिंदी', paragraphs: ['अनुवाद'] }] }),
    );
    const translated = await translateWealthNarrative(legacySections, 'hi');
    expect(translated[0]?.heading).toBe('हिंदी');
    expect(state.generate).toHaveBeenCalledTimes(1);
  });

  it('throws on an unparseable translated response', async () => {
    state.generate
      .mockResolvedValueOnce('garbage')
      .mockResolvedValueOnce(
        JSON.stringify({
          sections: sections
            .slice(2)
            .map((s) => ({ heading: s.heading, paragraphs: s.paragraphs })),
        }),
      );
    await expect(translateWealthNarrative(sections, 'hi')).rejects.toThrow();
  });
});
