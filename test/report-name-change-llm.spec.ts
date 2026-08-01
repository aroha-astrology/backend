import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NameChangeScores } from '../src/lib/astro-engine/reports/name-change.js';
import { variantHitsTarget } from '../src/lib/astro-engine/numerology/nameCorrection.js';

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

/** A broad candidate pool — the point of these tests is that the code itself decides which of
 * these survive, using the real deterministic Chaldean check rather than trusting the model. */
const CANDIDATES = [
  'Aarav',
  'Ananya',
  'Bhavesh',
  'Chetana',
  'Devika',
  'Esha',
  'Gaurav',
  'Harini',
  'Ishaan',
  'Jyoti',
  'Kavya',
  'Lakshmi',
  'Meera',
  'Nikhil',
  'Ojas',
  'Pallavi',
  'Rohan',
  'Sanjana',
  'Tanvi',
  'Varun',
];

const namePoolResponse = JSON.stringify({ names: CANDIDATES });

/** What the production code should keep, derived from the same function it uses. */
function expectedSurvivors(targets: number[]): string[] {
  return CANDIDATES.filter((n) => variantHitsTarget(n, targets).hits);
}

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

function promptOf(call: { messages: Array<{ content: string }> }): string {
  return call.messages.map((m) => m.content).join('\n');
}

/** Dispatches by WHICH call is being made rather than by call order — the candidate-pool step may
 * run more than one round (see MAX_PROPOSAL_ROUNDS), so a positional mock queue would desync. */
function mockBothCalls(narrative = fourSectionResponse, pool = namePoolResponse): void {
  state.generate.mockImplementation((opts: { messages: Array<{ content: string }> }) =>
    Promise.resolve(promptOf(opts).includes('<report_facts>') ? narrative : pool),
  );
}

function callsMatching(needle: string): string[] {
  return (state.generate.mock.calls as Array<[{ messages: Array<{ content: string }> }]>)
    .map((c) => promptOf(c[0]))
    .filter((prompt) => prompt.includes(needle));
}

/** The prompt actually sent to the NARRATIVE call (the one carrying the report facts). */
function narrativePrompt(): string {
  return callsMatching('<report_facts>').at(-1) ?? '';
}

/** The prompt sent to the candidate-pool call. */
function poolPrompt(): string {
  return callsMatching('candidate given names')[0] ?? '';
}

beforeEach(() => {
  state.generate.mockReset();
});

describe('generateNameChangeNarrative', () => {
  it('returns 4 sections, proposing candidates first and writing the narrative exactly once', async () => {
    mockBothCalls();
    const sections = await generateNameChangeNarrative(makeScores());
    expect(callsMatching('candidate given names').length).toBeGreaterThanOrEqual(1);
    expect(callsMatching('<report_facts>')).toHaveLength(1);
    expect(sections).toHaveLength(4);
    expect(sections.map((s) => s.heading)).toEqual([
      "Your Name's Numerological Signature",
      'Suggested Names',
      'Suggested Spelling Adjustments',
      'Practical Guidance',
    ]);
  });

  it('keeps ONLY candidate names whose Chaldean number the app itself computes onto a target', async () => {
    mockBothCalls();
    await generateNameChangeNarrative(makeScores());
    const content = narrativePrompt();

    const survivors = expectedSurvivors([3, 6, 9]);
    const rejected = CANDIDATES.filter((n) => !survivors.includes(n));
    // Guard the fixture itself: the test is meaningless if everything (or nothing) passes.
    expect(survivors.length).toBeGreaterThan(0);
    expect(rejected.length).toBeGreaterThan(0);

    for (const name of survivors) expect(content).toContain(`"${name}"`);
    for (const name of rejected) expect(content).not.toContain(`"${name}"`);
  });

  it('states each surviving name with the number the app computed, never one the model asserted', async () => {
    mockBothCalls();
    await generateNameChangeNarrative(makeScores());
    const content = narrativePrompt();
    for (const name of expectedSurvivors([3, 6, 9])) {
      const { chaldean } = variantHitsTarget(name, [3, 6, 9]);
      expect(content).toContain(`"${name}" -> Chaldean number ${chaldean}`);
    }
  });

  it('never asks the candidate-pool call for numbers or meanings — names only', async () => {
    mockBothCalls();
    await generateNameChangeNarrative(makeScores());
    const prompt = poolPrompt();
    expect(prompt.toLowerCase()).toContain('no meaning');
    expect(prompt.toLowerCase()).toContain('no numbers');
    expect(prompt).toContain('Priya Sharma'); // style/gender cue
  });

  it('skips the pool call entirely when there are no target numbers to hit', async () => {
    mockBothCalls();
    await generateNameChangeNarrative(
      makeScores({ alignment: { ...makeScores().alignment, targets: [] } }),
    );
    expect(callsMatching('candidate given names')).toHaveLength(0);
    expect(narrativePrompt()).toContain('Suggested names: NONE');
  });

  it('says so plainly rather than inventing names when no candidate reaches a target', async () => {
    mockBothCalls(fourSectionResponse, JSON.stringify({ names: [] }));
    await generateNameChangeNarrative(makeScores());
    expect(narrativePrompt()).toContain('Suggested names: NONE');
  });

  it('survives a malformed candidate pool instead of failing the whole report', async () => {
    mockBothCalls(fourSectionResponse, 'not json');
    const sections = await generateNameChangeNarrative(makeScores());
    expect(sections).toHaveLength(4);
    expect(narrativePrompt()).toContain('Suggested names: NONE');
  });

  it('deduplicates candidates case-insensitively', async () => {
    // Built from a name that actually survives verification, so the assertion tests dedup
    // rather than accidentally re-testing the target filter.
    const survivor = expectedSurvivors([3, 6, 9])[0]!;
    const dupes = JSON.stringify({
      names: [survivor, survivor.toLowerCase(), survivor.toUpperCase(), `${survivor} `],
    });
    mockBothCalls(fourSectionResponse, dupes);
    await generateNameChangeNarrative(makeScores());
    const content = narrativePrompt();
    expect((content.match(new RegExp(`"${survivor}" -> Chaldean number`, 'g')) ?? []).length).toBe(
      1,
    );
    expect(content).not.toContain(`"${survivor.toUpperCase()}"`);
  });

  it('still parses a legacy-shaped 2-section response (caller is not required to return exactly 4)', async () => {
    mockBothCalls(twoSectionResponse);
    const sections = await generateNameChangeNarrative(makeScores());
    expect(sections).toHaveLength(2);
  });

  it('embeds the given mulank/bhagyank/chaldean/alignment facts as GIVEN FACTS', async () => {
    mockBothCalls();
    await generateNameChangeNarrative(makeScores());
    const content = narrativePrompt();
    expect(content).toContain('Mulank: 6');
    expect(content).toContain('Bhagyank: 3');
    expect(content).toContain('Chaldean number: 27');
    expect(content).toContain('partially_aligned');
    expect(content.toUpperCase()).toContain('GIVEN FACT');
  });

  it('embeds the given target numbers and instructs section 1 to explicitly state them (covers "what number should my name ideally add up to")', async () => {
    mockBothCalls();
    await generateNameChangeNarrative(
      makeScores({ alignment: { ...makeScores().alignment, targets: [3, 6, 9] } }),
    );
    const content = narrativePrompt();
    expect(content).toContain('Target numbers (best first): 3, 6, 9');
    expect(content.toLowerCase()).toContain('what number should my name ideally add up to');
  });

  it('instructs a one-or-two-line "what this name brings into your life" note per suggested name', async () => {
    mockBothCalls();
    await generateNameChangeNarrative(makeScores());
    const content = narrativePrompt().toLowerCase();
    expect(content).toContain('bringing into the reader');
    expect(content).toContain('not a dictionary definition');
  });

  it('embeds the given spelling variants, never inventing one when the list is empty', async () => {
    mockBothCalls();
    await generateNameChangeNarrative(makeScores({ variants: [] }));
    expect(narrativePrompt()).toContain('NONE — the deterministic method found no small edit');
  });

  it('instructs a Practical Guidance section covering realistic-impact expectations, phasing in gradually, and what to stay mindful of if keeping the current name (covers 3 previously-unanswered bullets, using only already-given facts)', async () => {
    mockBothCalls();
    await generateNameChangeNarrative(makeScores());
    const content = narrativePrompt();
    expect(content.toLowerCase()).toContain('realistic difference');
    expect(content.toLowerCase()).toContain('phase');
    expect(content.toLowerCase()).toContain('stay mindful');
    expect(content).toContain('Enemy numbers');
  });

  it('throws on an unparseable narrative response', async () => {
    mockBothCalls('not json');
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
