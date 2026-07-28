import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NameChangeScores } from '../src/lib/astro-engine/reports/name-change.js';

const state = vi.hoisted(() => ({ generate: vi.fn() }));

vi.mock('../src/lib/llm/gemini-client.js', () => ({ generate: state.generate }));

const { generateNameChangeNarrative, translateNameChangeNarrative } =
  await import('../src/lib/llm/reports/name-change.js');

function makeScores(overrides: Partial<NameChangeScores> = {}): NameChangeScores {
  return {
    currentName: 'Priya Sharma',
    dob: '1990-05-15',
    alignment: {
      mulank: 6,
      bhagyank: 3,
      pythagorean: 22,
      chaldean: 27,
      soulUrge: 5,
      personality: 8,
      targets: [3, 6, 9],
      alignment: 'partially_aligned',
      friendly: [1, 3, 5, 9],
      enemy: [1, 2, 5, 7, 8],
    },
    variants: [
      { variant: 'Priya Sharmaa', chaldean: 6, change: 'added "a" at the end' },
      { variant: 'Preeya Sharma', chaldean: 9, change: 'replaced "i" with "ee"' },
    ],
    ...overrides,
  };
}

const twoSectionResponse = JSON.stringify({
  sections: [
    {
      heading: "Your Name's Numerological Signature",
      paragraphs: ['Your name is partially aligned.'],
    },
    { heading: 'Suggested Spelling Adjustments', paragraphs: ['Try adding an "a" at the end.'] },
  ],
});

const threeSectionResponse = JSON.stringify({
  sections: [
    {
      heading: "Your Name's Numerological Signature",
      paragraphs: ['Your name is partially aligned, targeting 3.'],
    },
    { heading: 'Suggested Spelling Adjustments', paragraphs: ['Try adding an "a" at the end.'] },
    {
      heading: 'Practical Guidance',
      paragraphs: [
        'A modest nudge — phase it in gradually, and mind number 7 if you keep your name as-is.',
      ],
    },
  ],
});

beforeEach(() => {
  state.generate.mockReset();
});

describe('generateNameChangeNarrative', () => {
  it('returns 3 sections from 1 LLM call', async () => {
    state.generate.mockResolvedValueOnce(threeSectionResponse);
    const sections = await generateNameChangeNarrative(makeScores());
    expect(state.generate).toHaveBeenCalledTimes(1);
    expect(sections).toHaveLength(3);
    expect(sections.map((s) => s.heading)).toEqual([
      "Your Name's Numerological Signature",
      'Suggested Spelling Adjustments',
      'Practical Guidance',
    ]);
  });

  it('still parses a legacy-shaped 2-section response (caller is not required to return exactly 3)', async () => {
    state.generate.mockResolvedValueOnce(twoSectionResponse);
    const sections = await generateNameChangeNarrative(makeScores());
    expect(sections).toHaveLength(2);
  });

  it('embeds the given mulank/bhagyank/chaldean/alignment facts as GIVEN FACTS', async () => {
    state.generate.mockResolvedValueOnce(threeSectionResponse);
    await generateNameChangeNarrative(makeScores());
    const content = state.generate.mock.calls[0]?.[0].messages
      .map((m: { content: string }) => m.content)
      .join('\n');
    expect(content).toContain('Mulank: 6');
    expect(content).toContain('Bhagyank: 3');
    expect(content).toContain('Chaldean number: 27');
    expect(content).toContain('partially_aligned');
    expect(content.toUpperCase()).toContain('GIVEN FACT');
  });

  it('embeds the given target numbers and instructs section 1 to explicitly state them (covers "what number should my name ideally add up to")', async () => {
    state.generate.mockResolvedValueOnce(threeSectionResponse);
    await generateNameChangeNarrative(
      makeScores({
        alignment: { ...makeScores().alignment, targets: [3, 6, 9] },
      }),
    );
    const content = state.generate.mock.calls[0]?.[0].messages
      .map((m: { content: string }) => m.content)
      .join('\n');
    expect(content).toContain('Target numbers (best first): 3, 6, 9');
    expect(content.toLowerCase()).toContain('what number should my name ideally add up to');
  });

  it('embeds the given spelling variants, never inventing one when the list is empty', async () => {
    state.generate.mockResolvedValueOnce(threeSectionResponse);
    await generateNameChangeNarrative(makeScores({ variants: [] }));
    const content = state.generate.mock.calls[0]?.[0].messages
      .map((m: { content: string }) => m.content)
      .join('\n');
    expect(content).toContain('NONE — the deterministic method found no small edit');
  });

  it('instructs a Practical Guidance section covering realistic-impact expectations, phasing in gradually, and what to stay mindful of if keeping the current name (covers 3 previously-unanswered bullets, using only already-given facts)', async () => {
    state.generate.mockResolvedValueOnce(threeSectionResponse);
    await generateNameChangeNarrative(makeScores());
    const content = state.generate.mock.calls[0]?.[0].messages
      .map((m: { content: string }) => m.content)
      .join('\n');
    expect(content.toLowerCase()).toContain('realistic difference');
    expect(content.toLowerCase()).toContain('phase');
    expect(content.toLowerCase()).toContain('stay mindful');
    expect(content).toContain('Enemy numbers');
  });

  it('throws on an unparseable response', async () => {
    state.generate.mockResolvedValueOnce('not json');
    await expect(generateNameChangeNarrative(makeScores())).rejects.toThrow();
  });
});

describe('translateNameChangeNarrative', () => {
  const sections = [
    { heading: "Your Name's Numerological Signature", paragraphs: ['Partially aligned.'] },
    { heading: 'Suggested Spelling Adjustments', paragraphs: ['Add an "a".'] },
    { heading: 'Practical Guidance', paragraphs: ['A modest nudge.'] },
  ];

  it('parses a valid translated response preserving section count', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({
        sections: sections.map((s) => ({ heading: `HI ${s.heading}`, paragraphs: ['हिंदी।'] })),
      }),
    );
    const translated = await translateNameChangeNarrative(sections, 'hi');
    expect(translated).toHaveLength(3);
    expect(translated[2]?.heading).toBe('HI Practical Guidance');
  });

  it('throws on an unparseable translated response', async () => {
    state.generate.mockResolvedValueOnce('garbage');
    await expect(translateNameChangeNarrative(sections, 'hi')).rejects.toThrow();
  });
});
