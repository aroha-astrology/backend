import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RemediesScores } from '../src/lib/astro-engine/reports/remedies.js';

const state = vi.hoisted(() => ({ generate: vi.fn() }));

vi.mock('../src/lib/llm/gemini-client.js', () => ({ generate: state.generate }));

const { generateRemediesNarrative, translateRemediesNarrative } =
  await import('../src/lib/llm/reports/remedies.js');

function makeScores(overrides: Partial<RemediesScores> = {}): RemediesScores {
  return {
    planetRemedies: [
      { planet: 'Saturn', house: 5, remedies: ['Donate mustard oil on Saturdays'], totke: [] },
      { planet: 'Mars', house: 2, remedies: ['Donate red lentils on Tuesdays'], totke: [] },
    ],
    presentDebts: [
      {
        type: 'Pitra Rin',
        present: true,
        indicators: ['Sun is afflicted in house 9'],
        remedies: ['Offer water to the Sun every morning at sunrise'],
      },
    ],
    pakkaGharPlacements: [
      {
        planet: 'Sun',
        pakkaGhar: 1,
        currentHouse: 1,
        isInPakkaGhar: true,
        effect: 'Sun is in its Pakka Ghar (house 1). It gives its full natural results.',
      },
    ],
    blindPlanets: [
      {
        planet: 'Venus',
        house: 6,
        isBlind: false,
        isHalfBlind: true,
        reason: 'Venus is weakly placed',
      },
    ],
    ...overrides,
  };
}

const fourSectionResponse = JSON.stringify({
  sections: [
    { heading: 'Your Karmic Debts (Rin)', paragraphs: ['You carry Pitra Rin.'] },
    { heading: 'Planet-by-Planet Remedies', paragraphs: ['Saturn in house 5 needs mustard oil.'] },
    { heading: 'Your Strengths and Cautions', paragraphs: ['Sun is in its Pakka Ghar.'] },
    { heading: 'How to Use These Remedies', paragraphs: ['Start with 2-3 remedies.'] },
  ],
});

beforeEach(() => {
  state.generate.mockReset();
});

describe('generateRemediesNarrative', () => {
  it('returns 4 sections from 1 LLM call', async () => {
    state.generate.mockResolvedValueOnce(fourSectionResponse);
    const sections = await generateRemediesNarrative(makeScores());
    expect(state.generate).toHaveBeenCalledTimes(1);
    expect(sections).toHaveLength(4);
    expect(sections.map((s) => s.heading)).toEqual([
      'Your Karmic Debts (Rin)',
      'Planet-by-Planet Remedies',
      'Your Strengths and Cautions',
      'How to Use These Remedies',
    ]);
  });

  it('embeds the given debts/remedies/Pakka Ghar/blind planets as GIVEN FACTS', async () => {
    state.generate.mockResolvedValueOnce(fourSectionResponse);
    await generateRemediesNarrative(makeScores());
    const content = state.generate.mock.calls[0]?.[0].messages
      .map((m: { content: string }) => m.content)
      .join('\n');
    expect(content).toContain('Pitra Rin');
    expect(content).toContain('Saturn in house 5');
    expect(content).toContain('Sun (house 1)');
    expect(content).toContain('Venus');
    expect(content.toUpperCase()).toContain('GIVEN FACT');
  });

  it('states plainly (never invents) when a list is empty', async () => {
    state.generate.mockResolvedValueOnce(fourSectionResponse);
    await generateRemediesNarrative(
      makeScores({ presentDebts: [], pakkaGharPlacements: [], blindPlanets: [] }),
    );
    const content = state.generate.mock.calls[0]?.[0].messages
      .map((m: { content: string }) => m.content)
      .join('\n');
    expect(content).toContain('NONE flagged for this chart');
    expect(content).toContain('NONE — no planet sits in its own permanent house');
  });

  it('instructs Lal Kitab-appropriate remedies (no gemstones/rituals invented)', async () => {
    state.generate.mockResolvedValueOnce(fourSectionResponse);
    await generateRemediesNarrative(makeScores());
    const content = state.generate.mock.calls[0]?.[0].messages
      .map((m: { content: string }) => m.content)
      .join('\n');
    expect(content.toLowerCase()).toContain('gemstone');
  });

  it('throws on an unparseable response', async () => {
    state.generate.mockResolvedValueOnce('not json');
    await expect(generateRemediesNarrative(makeScores())).rejects.toThrow();
  });
});

describe('translateRemediesNarrative', () => {
  const sections = [
    { heading: 'Your Karmic Debts (Rin)', paragraphs: ['You carry Pitra Rin.'] },
    { heading: 'Planet-by-Planet Remedies', paragraphs: ['Saturn needs mustard oil.'] },
    { heading: 'Your Strengths and Cautions', paragraphs: ['Sun is strong.'] },
    { heading: 'How to Use These Remedies', paragraphs: ['Start with a few.'] },
  ];

  it('parses a valid translated response preserving section count', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({
        sections: sections.map((s) => ({ heading: `HI ${s.heading}`, paragraphs: ['हिंदी।'] })),
      }),
    );
    const translated = await translateRemediesNarrative(sections, 'hi');
    expect(translated).toHaveLength(4);
    expect(translated[3]?.heading).toBe('HI How to Use These Remedies');
  });

  it('throws on an unparseable translated response', async () => {
    state.generate.mockResolvedValueOnce('garbage');
    await expect(translateRemediesNarrative(sections, 'hi')).rejects.toThrow();
  });
});
