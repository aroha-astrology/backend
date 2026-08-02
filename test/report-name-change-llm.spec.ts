import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NameChangeScores } from '../src/lib/astro-engine/reports/name-change.js';
import type { ScoredName } from '../src/lib/astro-engine/numerology/name-scoring.js';

const state = vi.hoisted(() => ({
  generate: vi.fn(),
  rankNamesForTargets: vi.fn(),
}));

vi.mock('../src/lib/llm/gemini-client.js', () => ({ generate: state.generate }));
vi.mock('../src/lib/astro-engine/names/name-lookup.js', () => ({
  rankNamesForTargets: state.rankNamesForTargets,
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
    gender: 'female',
    variants: [
      { variant: 'Priya Sharmaa', chaldean: 6, change: 'surname — added "a" at the end' },
      { variant: 'Preeya Sharma', chaldean: 9, change: 'first name — replaced "i" with "ee"' },
    ],
    ...overrides,
  };
}

/** Ranked alternatives always carry the reader's own surname — this report changes the FIRST
 * name only, never the whole name. */
const RANKED: ScoredName[] = [
  {
    name: 'Aarav Sharma',
    chaldean: 3,
    score: 88,
    reasons: ['Lands exactly on your destiny number 3'],
    recommended: true,
  },
  {
    name: 'Kavya Sharma',
    chaldean: 6,
    score: 79,
    reasons: ['Matches your psychic number 6'],
    recommended: true,
  },
  {
    name: 'Rohan Sharma',
    chaldean: 9,
    score: 63,
    reasons: ['Reaches one of your target numbers'],
    recommended: false,
  },
];

const fiveSectionResponse = JSON.stringify({
  sections: [
    {
      heading: "Your Name's Numerological Signature",
      paragraphs: ['Your name is partially aligned, targeting 3.'],
    },
    {
      heading: 'What Changing Your Name Could Bring You',
      paragraphs: ['A shift toward 3 tends to bring the following.'],
      bullets: ['Fewer stop-start months on income', 'Less friction in negotiations'],
    },
    {
      heading: 'Suggested Spelling Adjustments',
      paragraphs: ['These spellings all reach your target and keep the name you already have.'],
      items: [
        { title: 'Priya Sharmaa', bullets: ['Adds a settling final vowel', 'Nudges toward 6'] },
        {
          title: 'Preeya Sharma',
          bullets: ['Softens the opening', 'Leaves your family name alone'],
        },
      ],
    },
    {
      heading: 'Suggested Names',
      paragraphs: ['A bigger optional step — a new first name, your surname kept.'],
      items: [
        { title: 'Aarav Sharma', bullets: ['Steadier finances', 'Clearer communication'] },
        { title: 'Kavya Sharma', bullets: ['Calmer relationships', 'Better follow-through'] },
        { title: 'Rohan Sharma', bullets: ['Fresh start energy', 'Warmer first impressions'] },
      ],
    },
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
  state.rankNamesForTargets.mockReset();
  state.rankNamesForTargets.mockReturnValue(RANKED);
});

describe('generateNameChangeNarrative', () => {
  it('returns 5 sections from exactly 1 LLM call — names come from the ranked corpus, not the model', async () => {
    state.generate.mockResolvedValueOnce(fiveSectionResponse);
    const sections = await generateNameChangeNarrative(makeScores());
    expect(state.generate).toHaveBeenCalledTimes(1);
    expect(sections).toHaveLength(5);
    expect(sections.map((s) => s.heading)).toEqual([
      "Your Name's Numerological Signature",
      'What Changing Your Name Could Bring You',
      'Suggested Spelling Adjustments',
      'Suggested Names',
      'Practical Guidance',
    ]);
  });

  it('asks for a gender-matched ranked shortlist seeded from the current name+alignment, and embeds exactly what it returns', async () => {
    state.generate.mockResolvedValueOnce(fiveSectionResponse);
    await generateNameChangeNarrative(
      makeScores({ alignment: { ...makeScores().alignment, targets: [3, 6, 9] } }),
    );

    expect(state.rankNamesForTargets).toHaveBeenCalledWith(
      expect.objectContaining({ targets: [3, 6, 9] }),
      'Priya Sharma',
      2, // derived from the 2 given variants — see suggestionCount
      'female',
    );
    const content = narrativePrompt();
    for (const { name, chaldean, score } of RANKED) {
      expect(content).toContain(`"${name}" -> Chaldean ${chaldean}, match score ${score}`);
    }
    expect(content.toUpperCase()).toContain('GIVEN FACT');
  });

  it('keeps the report 80% spelling / 20% new names by deriving the shortlist size from the variant count', async () => {
    state.generate.mockResolvedValueOnce(fiveSectionResponse);
    const twelve = Array.from({ length: 12 }, (_, i) => ({
      variant: `Priyaa${i} Sharma`,
      chaldean: 6,
      change: 'first name — doubled the "a"',
    }));
    await generateNameChangeNarrative(makeScores({ variants: twelve }));
    expect(state.rankNamesForTargets).toHaveBeenCalledWith(
      expect.anything(),
      'Priya Sharma',
      3,
      'female',
    );
  });

  it('passes no gender filter when the reader did not give a binary one', async () => {
    state.generate.mockResolvedValueOnce(fiveSectionResponse);
    await generateNameChangeNarrative(makeScores({ gender: null }));
    expect(state.rankNamesForTargets).toHaveBeenCalledWith(
      expect.anything(),
      'Priya Sharma',
      expect.any(Number),
      null,
    );
  });

  it('tells the model this is a spelling change to the existing name, never a full-name replacement', async () => {
    state.generate.mockResolvedValueOnce(fiveSectionResponse);
    await generateNameChangeNarrative(makeScores());
    const content = narrativePrompt().toLowerCase();
    expect(content).toContain('never propose that the reader replace their whole name');
    expect(content).toContain('first-name change only');
  });

  it('renders the given suggested names as ranked/scored items, not paragraphs', async () => {
    state.generate.mockResolvedValueOnce(fiveSectionResponse);
    const sections = await generateNameChangeNarrative(makeScores());
    const suggested = sections.find((s) => s.heading === 'Suggested Names');
    expect(suggested?.items).toHaveLength(3);
    expect(suggested?.items?.[0]).toMatchObject({
      title: 'Aarav Sharma',
      badge: 'Chaldean 3',
      score: 88,
      highlight: true,
    });
    expect(suggested?.items?.[0]?.bullets.length).toBeGreaterThan(0);
    // The score/badge/highlight are the app's given facts, not whatever the model echoed.
    expect(suggested?.items?.every((i) => typeof i.score === 'number')).toBe(true);
  });

  it('drops an item whose title is not one of the given facts rather than inventing one', async () => {
    const withRogueItem = JSON.parse(fiveSectionResponse);
    withRogueItem.sections[3].items.push({ title: 'Made Up Name', bullets: ['Not real'] });
    state.generate.mockResolvedValueOnce(JSON.stringify(withRogueItem));
    const sections = await generateNameChangeNarrative(makeScores());
    const suggested = sections.find((s) => s.heading === 'Suggested Names');
    expect(suggested?.items?.map((i) => i.title)).toEqual([
      'Aarav Sharma',
      'Kavya Sharma',
      'Rohan Sharma',
    ]);
  });

  it('renders spelling variants as items carrying the given note (the exact edit)', async () => {
    state.generate.mockResolvedValueOnce(fiveSectionResponse);
    const sections = await generateNameChangeNarrative(makeScores());
    const adjustments = sections.find((s) => s.heading === 'Suggested Spelling Adjustments');
    expect(adjustments?.items?.[0]).toMatchObject({
      title: 'Priya Sharmaa',
      badge: 'Chaldean 6',
      note: 'surname — added "a" at the end',
    });
  });

  it('renders the benefits section as bullets grounded in the target-number gap', async () => {
    state.generate.mockResolvedValueOnce(fiveSectionResponse);
    const sections = await generateNameChangeNarrative(makeScores());
    const benefits = sections.find((s) => s.heading === 'What Changing Your Name Could Bring You');
    expect(benefits?.bullets?.length).toBeGreaterThan(0);
    const content = narrativePrompt().toLowerCase();
    expect(content).toContain('everyday outcome');
  });

  it('says so plainly rather than inventing names when the corpus has no match', async () => {
    state.rankNamesForTargets.mockReturnValue([]);
    state.generate.mockResolvedValueOnce(fiveSectionResponse);
    await generateNameChangeNarrative(makeScores());
    expect(narrativePrompt()).toContain('Alternative first names: NONE');
  });

  it('instructs the model never to invent, drop, or renumber a given suggested name', async () => {
    state.generate.mockResolvedValueOnce(fiveSectionResponse);
    await generateNameChangeNarrative(makeScores());
    const content = narrativePrompt().toLowerCase();
    expect(content).toContain('never invent an extra name');
    expect(content).toContain('never suggest a name that is not on the list');
  });

  it('still parses a legacy-shaped 2-section response (caller is not required to return exactly 5)', async () => {
    state.generate.mockResolvedValueOnce(twoSectionResponse);
    const sections = await generateNameChangeNarrative(makeScores());
    expect(sections).toHaveLength(2);
  });

  it('embeds the given mulank/bhagyank/chaldean/alignment facts as GIVEN FACTS', async () => {
    state.generate.mockResolvedValueOnce(fiveSectionResponse);
    await generateNameChangeNarrative(makeScores());
    const content = narrativePrompt();
    expect(content).toContain('Mulank: 6');
    expect(content).toContain('Bhagyank: 3');
    expect(content).toContain('Chaldean number: 27');
    expect(content).toContain('partially_aligned');
  });

  it('embeds the given target numbers and instructs section 1 to explicitly state them (covers "what number should my name ideally add up to")', async () => {
    state.generate.mockResolvedValueOnce(fiveSectionResponse);
    await generateNameChangeNarrative(
      makeScores({ alignment: { ...makeScores().alignment, targets: [3, 6, 9] } }),
    );
    const content = narrativePrompt();
    expect(content).toContain('Target numbers (best first): 3, 6, 9');
    expect(content.toLowerCase()).toContain('what number should my name ideally add up to');
  });

  it('embeds the given spelling variants, never inventing one when the list is empty', async () => {
    state.generate.mockResolvedValueOnce(fiveSectionResponse);
    await generateNameChangeNarrative(makeScores({ variants: [] }));
    expect(narrativePrompt()).toContain('NONE — the deterministic method found no small edit');
  });

  it('instructs a Practical Guidance section covering realistic-impact expectations, phasing in gradually, and what to stay mindful of if keeping the current name (covers 3 previously-unanswered bullets, using only already-given facts)', async () => {
    state.generate.mockResolvedValueOnce(fiveSectionResponse);
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
    {
      heading: 'What Changing Your Name Could Bring You',
      paragraphs: ['A shift toward 3.'],
      bullets: ['Fewer stop-start months on income'],
    },
    {
      heading: 'Suggested Spelling Adjustments',
      paragraphs: ['Add an "a".'],
      items: [
        {
          title: 'Priya Sharmaa',
          badge: 'Chaldean 6',
          note: 'surname — added "a" at the end',
          bullets: ['Nudges toward 6.'],
        },
      ],
    },
    {
      heading: 'Suggested Names',
      paragraphs: ['Ranked by match.'],
      items: [
        {
          title: 'Aarav Sharma',
          badge: 'Chaldean 3',
          score: 88,
          highlight: true,
          bullets: ['Steady.'],
        },
      ],
    },
    { heading: 'Practical Guidance', paragraphs: ['A modest nudge.'] },
  ];

  it('parses a valid translated response preserving section count', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({
        sections: sections.map((s) => ({
          heading: `HI ${s.heading}`,
          paragraphs: ['हिंदी।'],
          ...(s.bullets ? { bullets: ['हिंदी बुलेट'] } : {}),
          ...(s.items
            ? { items: s.items.map((i) => ({ title: i.title, bullets: ['हिंदी।'] })) }
            : {}),
        })),
      }),
    );
    const translated = await translateNameChangeNarrative(sections, 'hi');
    expect(translated).toHaveLength(5);
    expect(translated[4]?.heading).toBe('HI Practical Guidance');
  });

  it('re-attaches the original given facts (badge/score/highlight/note) onto translated items, never trusting the model for them', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({
        sections: sections.map((s) => ({
          heading: s.heading,
          paragraphs: s.paragraphs,
          ...(s.bullets ? { bullets: s.bullets } : {}),
          ...(s.items
            ? { items: s.items.map((i) => ({ title: i.title, bullets: ['अनुवादित।'] })) }
            : {}),
        })),
      }),
    );
    const translated = await translateNameChangeNarrative(sections, 'hi');
    const suggested = translated.find((s) => s.heading === 'Suggested Names');
    expect(suggested?.items?.[0]).toMatchObject({
      title: 'Aarav Sharma',
      badge: 'Chaldean 3',
      score: 88,
      highlight: true,
    });
  });

  it('throws on an unparseable translated response', async () => {
    state.generate.mockResolvedValueOnce('garbage');
    await expect(translateNameChangeNarrative(sections, 'hi')).rejects.toThrow();
  });
});
