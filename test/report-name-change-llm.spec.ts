import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NameChangeScores } from '../src/lib/astro-engine/reports/name-change.js';

const state = vi.hoisted(() => ({
  generate: vi.fn(),
  namesHittingTarget: vi.fn(),
}));

vi.mock('../src/lib/llm/gemini-client.js', () => ({ generate: state.generate }));
vi.mock('../src/lib/astro-engine/names/name-lookup.js', () => ({
  namesHittingTarget: state.namesHittingTarget,
}));

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

const SUGGESTIONS = [
  { name: 'Aarav', chaldean: 3 },
  { name: 'Kavya', chaldean: 6 },
  { name: 'Rohan', chaldean: 9 },
];

const fourSectionResponse = JSON.stringify({
  sections: [
    {
      heading: "Your Name's Numerological Signature",
      paragraphs: ['Your name is partially aligned, targeting 3.'],
    },
    { heading: 'Suggested Names', paragraphs: ['These all reach your target.', 'Aarav — steady.'] },
    { heading: 'Suggested Spelling Adjustments', paragraphs: ['Try adding an "a" at the end.'] },
    {
      heading: 'Practical Guidance',
      paragraphs: [
        'A modest nudge — phase it in gradually, and mind number 7 if you keep your name as-is.',
      ],
    },
  ],
});

const twoSectionResponse = JSON.stringify({
  sections: [
    {
      heading: "Your Name's Numerological Signature",
      paragraphs: ['Your name is partially aligned.'],
    },
    { heading: 'Suggested Spelling Adjustments', paragraphs: ['Try adding an "a" at the end.'] },
  ],
});

function narrativePrompt(): string {
  const call = state.generate.mock.calls[0]?.[0] as { messages: Array<{ content: string }> };
  return call.messages.map((m) => m.content).join('\n');
}

beforeEach(() => {
  state.generate.mockReset();
  state.namesHittingTarget.mockReset();
  state.namesHittingTarget.mockReturnValue(SUGGESTIONS);
});

describe('generateNameChangeNarrative', () => {
  it('returns 4 sections from exactly 1 LLM call — names come from the corpus, not the model', async () => {
    state.generate.mockResolvedValueOnce(fourSectionResponse);
    const sections = await generateNameChangeNarrative(makeScores());
    expect(state.generate).toHaveBeenCalledTimes(1);
    expect(sections).toHaveLength(4);
    expect(sections.map((s) => s.heading)).toEqual([
      "Your Name's Numerological Signature",
      'Suggested Names',
      'Suggested Spelling Adjustments',
      'Practical Guidance',
    ]);
  });

  it('asks the real corpus for candidates using the given target numbers, and embeds exactly what it returns', async () => {
    state.generate.mockResolvedValueOnce(fourSectionResponse);
    await generateNameChangeNarrative(
      makeScores({ alignment: { ...makeScores().alignment, targets: [3, 6, 9] } }),
    );

    expect(state.namesHittingTarget).toHaveBeenCalledWith([3, 6, 9], 25);
    const content = narrativePrompt();
    for (const { name, chaldean } of SUGGESTIONS) {
      expect(content).toContain(`"${name}" -> Chaldean number ${chaldean}`);
    }
    expect(content.toUpperCase()).toContain('GIVEN FACT');
  });

  it('says so plainly rather than inventing names when the corpus has no match', async () => {
    state.namesHittingTarget.mockReturnValue([]);
    state.generate.mockResolvedValueOnce(fourSectionResponse);
    await generateNameChangeNarrative(makeScores());
    expect(narrativePrompt()).toContain('Suggested names: NONE');
  });

  it('instructs the model never to invent, drop, or renumber a given suggested name', async () => {
    state.generate.mockResolvedValueOnce(fourSectionResponse);
    await generateNameChangeNarrative(makeScores());
    const content = narrativePrompt().toLowerCase();
    expect(content).toContain('never invent an extra name');
    expect(content).toContain('never suggest a name that is not on the list');
  });

  it('instructs a one-or-two-line "what this name brings into your life" note per suggested name', async () => {
    state.generate.mockResolvedValueOnce(fourSectionResponse);
    await generateNameChangeNarrative(makeScores());
    const content = narrativePrompt().toLowerCase();
    expect(content).toContain('bringing into the reader');
  });

  it('still parses a legacy-shaped 2-section response (caller is not required to return exactly 4)', async () => {
    state.generate.mockResolvedValueOnce(twoSectionResponse);
    const sections = await generateNameChangeNarrative(makeScores());
    expect(sections).toHaveLength(2);
  });

  it('embeds the given mulank/bhagyank/chaldean/alignment facts as GIVEN FACTS', async () => {
    state.generate.mockResolvedValueOnce(fourSectionResponse);
    await generateNameChangeNarrative(makeScores());
    const content = narrativePrompt();
    expect(content).toContain('Mulank: 6');
    expect(content).toContain('Bhagyank: 3');
    expect(content).toContain('Chaldean number: 27');
    expect(content).toContain('partially_aligned');
  });

  it('embeds the given target numbers and instructs section 1 to explicitly state them (covers "what number should my name ideally add up to")', async () => {
    state.generate.mockResolvedValueOnce(fourSectionResponse);
    await generateNameChangeNarrative(
      makeScores({ alignment: { ...makeScores().alignment, targets: [3, 6, 9] } }),
    );
    const content = narrativePrompt();
    expect(content).toContain('Target numbers (best first): 3, 6, 9');
    expect(content.toLowerCase()).toContain('what number should my name ideally add up to');
  });

  it('embeds the given spelling variants, never inventing one when the list is empty', async () => {
    state.generate.mockResolvedValueOnce(fourSectionResponse);
    await generateNameChangeNarrative(makeScores({ variants: [] }));
    expect(narrativePrompt()).toContain('NONE — the deterministic method found no small edit');
  });

  it('instructs a Practical Guidance section covering realistic-impact expectations, phasing in gradually, and what to stay mindful of if keeping the current name (covers 3 previously-unanswered bullets, using only already-given facts)', async () => {
    state.generate.mockResolvedValueOnce(fourSectionResponse);
    await generateNameChangeNarrative(makeScores());
    const content = narrativePrompt();
    expect(content.toLowerCase()).toContain('realistic difference');
    expect(content.toLowerCase()).toContain('phase');
    expect(content.toLowerCase()).toContain('stay mindful');
    expect(content).toContain('Enemy numbers');
  });

  it('throws on an unparseable narrative response', async () => {
    state.generate.mockResolvedValueOnce('not json');
    await expect(generateNameChangeNarrative(makeScores())).rejects.toThrow();
  });
});

describe('translateNameChangeNarrative', () => {
  const sections = [
    { heading: "Your Name's Numerological Signature", paragraphs: ['Partially aligned.'] },
    { heading: 'Suggested Names', paragraphs: ['Aarav — steady.'] },
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
    expect(translated).toHaveLength(4);
    expect(translated[3]?.heading).toBe('HI Practical Guidance');
  });

  it('throws on an unparseable translated response', async () => {
    state.generate.mockResolvedValueOnce('garbage');
    await expect(translateNameChangeNarrative(sections, 'hi')).rejects.toThrow();
  });
});
