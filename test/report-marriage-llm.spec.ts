import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MarriageScores } from '../src/lib/astro-engine/reports/marriage.js';

const state = vi.hoisted(() => ({ generate: vi.fn() }));

vi.mock('../src/lib/llm/gemini-client.js', () => ({ generate: state.generate }));

const { generateMarriageNarrative, translateMarriageNarrative } =
  await import('../src/lib/llm/reports/marriage.js');

function makeScores(overrides: Partial<MarriageScores> = {}): MarriageScores {
  return {
    marriageScore: 70,
    band: 'steady',
    manglik: { isManglik: false, cancelled: false },
    seventhLord: 'Mercury',
    seventhLordStrength: 'strong',
    venusStrength: 'strong',
    venusHouse: 12,
    jupiterStrength: 'weak',
    jupiterHouse: 10,
    seventhHouseSign: 'Virgo',
    seventhHouseTemperament: 'thoughtful, practical, and devoted through acts of service',
    fourthLordStrength: 'average',
    windows: [
      {
        startDate: '2027-01-01',
        endDate: '2028-01-01',
        score: 2,
        level: 'MEDIUM',
        dashaLevel: 'antardasha',
        reasoning: ['Vimshottari anchor: Mercury antardasha within Mercury major period.'],
      },
    ],
    jupiterDharmaWindow: null,
    ageBands: [
      { label: 'Now – 32', startAge: 29, endAge: 32, confidence: 'MEDIUM' },
      { label: '33 – 36', startAge: 33, endAge: 36, confidence: 'LOW' },
      { label: '37 – 44', startAge: 37, endAge: 44, confidence: 'NONE' },
      { label: '45+', startAge: 45, endAge: null, confidence: 'NONE' },
    ],
    seventhLordReason: 'Mercury is in its own sign.',
    venusReason: 'Venus is exalted in Pisces.',
    jupiterReason: 'Jupiter is debilitated in Capricorn.',
    doshaYoga: { positives: [], cautions: [] },
    partnerArchetype: {
      label: 'Partnership Archetype',
      description:
        "Classically, this placement's sign (Virgo) suggests someone thoughtful, practical.",
      traits: [
        { label: 'Warmth', score: 6 },
        { label: 'Discipline', score: 9 },
        { label: 'Intellect', score: 6 },
        { label: 'Sensuality', score: 9 },
        { label: 'Ambition', score: 3 },
      ],
    },
    marriageQualityArc: [
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
    inLaws: {
      fourthHouseSign: 'Cancer',
      note: 'The 4th house (home and family) falls in Cancer, and its lord is classically average.',
    },
    moneyAfterMarriage: {
      secondHouseSign: 'Leo',
      eleventhHouseSign: 'Aquarius',
      note: 'The 2nd house is in Leo, and the 11th house is in Aquarius.',
    },
    modernRealities: { lateMarriageLeaning: false, rahuHouse: 9, seventhHousePlanetCount: 1 },
    spouseSynastry: null,
    spouseName: null,
    ...overrides,
  } as unknown as MarriageScores;
}

function makeSpouseSynastry(): NonNullable<MarriageScores['spouseSynastry']> {
  return {
    gunaMilanScore: 24,
    gunaMaxScore: 36,
    gunaBreakdown: [{ name: 'Nadi', score: 8, maxScore: 8, description: 'No Nadi dosha.' }],
    compatibilityBand: 'good',
    dashakootaScore: 60,
    dashakootaMaxScore: 72,
    dashakootaCompatibility: 'good',
    manglikStatus: { self: false, spouse: false, cancelled: false },
    riskFactors: [
      {
        key: 'wealth',
        severity: 'benefit',
        score: 80,
        evidence: ['2nd lords are mutually well placed.'],
      },
      { key: 'health', severity: 'neutral', score: 55, evidence: ['No major flags.'] },
      {
        key: 'children',
        severity: 'benefit',
        score: 80,
        evidence: ['5th house synastry is supportive.'],
      },
      {
        key: 'harmony',
        severity: 'caution',
        score: 40,
        evidence: ['Bhakoot koota is weak.'],
      },
      { key: 'career', severity: 'neutral', score: 55, evidence: ['No major flags.'] },
      {
        key: 'timing',
        severity: 'benefit',
        score: 80,
        evidence: ['Current dashas favor stability.'],
      },
      {
        key: 'intimacy',
        severity: 'benefit',
        score: 80,
        evidence: ['Venus-Mars synastry is supportive.'],
      },
      { key: 'inlaws', severity: 'neutral', score: 55, evidence: ['No major flags.'] },
    ],
    spouseNavamsa: [],
  } as unknown as NonNullable<MarriageScores['spouseSynastry']>;
}

function jsonSections(...headings: string[]): string {
  return JSON.stringify({
    sections: headings.map((heading) => ({ heading, paragraphs: [`Paragraph for ${heading}.`] })),
  });
}

beforeEach(() => {
  state.generate.mockReset();
});

describe('generateMarriageNarrative', () => {
  it('makes 4 LLM calls and concatenates their sections in order', async () => {
    state.generate
      .mockResolvedValueOnce(jsonSections('At A Glance', 'Marriage Timing'))
      .mockResolvedValueOnce(jsonSections('Who You Will Marry', 'Family & In-Laws'))
      .mockResolvedValueOnce(jsonSections('Money After Marriage', "What's Going For You"))
      .mockResolvedValueOnce(jsonSections('Modern Realities'));

    const sections = await generateMarriageNarrative(makeScores());
    expect(state.generate).toHaveBeenCalledTimes(4);
    expect(sections).toHaveLength(7);
    expect(sections.map((s) => s.heading)).toEqual([
      'At A Glance',
      'Marriage Timing',
      'Who You Will Marry',
      'Family & In-Laws',
      'Money After Marriage',
      "What's Going For You",
      'Modern Realities',
    ]);
  });

  it('embeds the given score/band/manglik/timing/age-band facts as GIVEN FACTS in the first call', async () => {
    state.generate
      .mockResolvedValueOnce(jsonSections('H1a', 'H1b'))
      .mockResolvedValueOnce(jsonSections('H2a', 'H2b'))
      .mockResolvedValueOnce(jsonSections('H3a', 'H3b'))
      .mockResolvedValueOnce(jsonSections('H4a', 'H4b'));

    await generateMarriageNarrative(
      makeScores({
        marriageScore: 82,
        band: 'accelerated',
        ageBands: [{ label: 'Now – 32', startAge: 29, endAge: 32, confidence: 'HIGH' }],
      }),
    );

    const firstCall = state.generate.mock.calls[0]?.[0];
    const content = firstCall.messages.map((m: { content: string }) => m.content).join('\n');
    expect(content).toContain('82');
    expect(content).toContain('accelerated');
    expect(content.toUpperCase()).toContain('GIVEN FACT');
    expect(content).toContain('2027-01');
    expect(content).toContain('HIGH');
  });

  it('embeds the given relationshipStatus in the first call and instructs married/divorced/widowed framing', async () => {
    state.generate
      .mockResolvedValueOnce(jsonSections('H1a', 'H1b'))
      .mockResolvedValueOnce(jsonSections('H2a', 'H2b'))
      .mockResolvedValueOnce(jsonSections('H3a', 'H3b'))
      .mockResolvedValueOnce(jsonSections('H4a', 'H4b'));

    await generateMarriageNarrative(makeScores({ relationshipStatus: 'married' }));

    const firstCall = state.generate.mock.calls[0]?.[0];
    const content = firstCall.messages.map((m: { content: string }) => m.content).join('\n');
    expect(content).toContain('married');
    expect(content.toLowerCase()).toContain('do not predict');
  });

  it('falls back to "not provided" when relationshipStatus is absent', async () => {
    state.generate
      .mockResolvedValueOnce(jsonSections('H1a', 'H1b'))
      .mockResolvedValueOnce(jsonSections('H2a', 'H2b'))
      .mockResolvedValueOnce(jsonSections('H3a', 'H3b'))
      .mockResolvedValueOnce(jsonSections('H4a', 'H4b'));

    await generateMarriageNarrative(makeScores());

    const firstCall = state.generate.mock.calls[0]?.[0];
    const content = firstCall.messages.map((m: { content: string }) => m.content).join('\n');
    expect(content).toContain('not provided');
  });

  it('embeds the 7th house sign/temperament/archetype/reasons and in-laws note in the second call', async () => {
    state.generate
      .mockResolvedValueOnce(jsonSections('H1a', 'H1b'))
      .mockResolvedValueOnce(jsonSections('H2a', 'H2b'))
      .mockResolvedValueOnce(jsonSections('H3a', 'H3b'))
      .mockResolvedValueOnce(jsonSections('H4a', 'H4b'));

    await generateMarriageNarrative(makeScores({ seventhHouseSign: 'Scorpio' }));

    const secondCall = state.generate.mock.calls[1]?.[0];
    const content = secondCall.messages.map((m: { content: string }) => m.content).join('\n');
    expect(content).toContain('Scorpio');
    expect(content).toContain('Partnership Archetype');
    expect(content).toContain('Cancer');
  });

  it('embeds the given Venus/Jupiter house placements in the second call (previously computed but never fed) and instructs using them for partner background color', async () => {
    state.generate
      .mockResolvedValueOnce(jsonSections('H1a', 'H1b'))
      .mockResolvedValueOnce(jsonSections('H2a', 'H2b'))
      .mockResolvedValueOnce(jsonSections('H3a', 'H3b'))
      .mockResolvedValueOnce(jsonSections('H4a', 'H4b'));

    await generateMarriageNarrative(makeScores({ venusHouse: 5, jupiterHouse: 8 }));

    const secondCall = state.generate.mock.calls[1]?.[0];
    const content = secondCall.messages.map((m: { content: string }) => m.content).join('\n');
    expect(content).toContain("Venus's own natal house: 5");
    expect(content).toContain("Jupiter's own natal house: 8");
    expect(content.toLowerCase()).toContain('house placement');
  });

  it('embeds the money-after-marriage and dosha/yoga facts in the third call', async () => {
    state.generate
      .mockResolvedValueOnce(jsonSections('H1a', 'H1b'))
      .mockResolvedValueOnce(jsonSections('H2a', 'H2b'))
      .mockResolvedValueOnce(jsonSections('H3a', 'H3b'))
      .mockResolvedValueOnce(jsonSections('H4a', 'H4b'));

    await generateMarriageNarrative(
      makeScores({
        doshaYoga: {
          positives: [{ label: 'Raja Yoga', detail: 'present' }],
          cautions: [{ label: 'Mangal Dosha', detail: 'high severity' }],
        },
      }),
    );

    const thirdCall = state.generate.mock.calls[2]?.[0];
    const content = thirdCall.messages.map((m: { content: string }) => m.content).join('\n');
    expect(content).toContain('Leo');
    expect(content).toContain('Aquarius');
    expect(content).toContain('Raja Yoga');
    expect(content).toContain('Mangal Dosha');
    expect(content.toLowerCase()).toContain('early years after the wedding');
  });

  it('embeds the modern-realities facts in the fourth call', async () => {
    state.generate
      .mockResolvedValueOnce(jsonSections('H1a', 'H1b'))
      .mockResolvedValueOnce(jsonSections('H2a', 'H2b'))
      .mockResolvedValueOnce(jsonSections('H3a', 'H3b'))
      .mockResolvedValueOnce(jsonSections('H4a'));

    await generateMarriageNarrative(
      makeScores({
        modernRealities: { lateMarriageLeaning: true, rahuHouse: 12, seventhHousePlanetCount: 3 },
      }),
    );

    const fourthCall = state.generate.mock.calls[3]?.[0];
    const content = fourthCall.messages.map((m: { content: string }) => m.content).join('\n');
    expect(content).not.toContain('Years 1-10');
    expect(content.toLowerCase()).toContain('yes');
    expect(content).toContain('12');
    expect(content).toContain('3');
  });

  it('throws when the first call returns unparseable JSON', async () => {
    state.generate.mockResolvedValueOnce('not json');
    await expect(generateMarriageNarrative(makeScores())).rejects.toThrow();
  });

  it('throws when the fourth call returns unparseable JSON, after the first three succeed', async () => {
    state.generate
      .mockResolvedValueOnce(jsonSections('H1a', 'H1b'))
      .mockResolvedValueOnce(jsonSections('H2a', 'H2b'))
      .mockResolvedValueOnce(jsonSections('H3a', 'H3b'))
      .mockResolvedValueOnce('garbage');
    await expect(generateMarriageNarrative(makeScores())).rejects.toThrow();
  });
});

describe('generateMarriageNarrative — spouse synastry woven in', () => {
  it('embeds guna milan + spouse manglik in call 1 only when spouseSynastry is given', async () => {
    state.generate
      .mockResolvedValueOnce(jsonSections('H1a', 'H1b'))
      .mockResolvedValueOnce(jsonSections('H2a', 'H2b'))
      .mockResolvedValueOnce(jsonSections('H3a', 'H3b'))
      .mockResolvedValueOnce(jsonSections('H4a', 'H4b'));

    await generateMarriageNarrative(
      makeScores({ spouseSynastry: makeSpouseSynastry(), spouseName: 'Priya' }),
    );

    const content = JSON.stringify(state.generate.mock.calls[0]![0]);
    expect(content).toContain('24');
    expect(content).toContain('Priya');
  });

  it('omits spouse facts entirely when spouseSynastry is null (unchanged existing behavior)', async () => {
    state.generate
      .mockResolvedValueOnce(jsonSections('H1a', 'H1b'))
      .mockResolvedValueOnce(jsonSections('H2a', 'H2b'))
      .mockResolvedValueOnce(jsonSections('H3a', 'H3b'))
      .mockResolvedValueOnce(jsonSections('H4a', 'H4b'));

    await generateMarriageNarrative(makeScores({ spouseSynastry: null, spouseName: null }));

    const content = JSON.stringify(state.generate.mock.calls[0]![0]);
    expect(content).not.toContain('SPOUSE DATA PROVIDED');
  });

  it('embeds spouse navamsa + harmony/inlaws risk factors in call 2', async () => {
    state.generate
      .mockResolvedValueOnce(jsonSections('H1a', 'H1b'))
      .mockResolvedValueOnce(jsonSections('H2a', 'H2b'))
      .mockResolvedValueOnce(jsonSections('H3a', 'H3b'))
      .mockResolvedValueOnce(jsonSections('H4a', 'H4b'));

    await generateMarriageNarrative(makeScores({ spouseSynastry: makeSpouseSynastry() }));

    const content = JSON.stringify(state.generate.mock.calls[1]![0]);
    expect(content).toContain('Bhakoot koota is weak');
  });

  it('embeds wealth/career risk factors in call 3', async () => {
    state.generate
      .mockResolvedValueOnce(jsonSections('H1a', 'H1b'))
      .mockResolvedValueOnce(jsonSections('H2a', 'H2b'))
      .mockResolvedValueOnce(jsonSections('H3a', 'H3b'))
      .mockResolvedValueOnce(jsonSections('H4a', 'H4b'));

    await generateMarriageNarrative(makeScores({ spouseSynastry: makeSpouseSynastry() }));

    const content = JSON.stringify(state.generate.mock.calls[2]![0]);
    expect(content).toContain('2nd lords are mutually well placed');
  });

  it('embeds children/timing/intimacy/health risk factors in call 4', async () => {
    state.generate
      .mockResolvedValueOnce(jsonSections('H1a', 'H1b'))
      .mockResolvedValueOnce(jsonSections('H2a', 'H2b'))
      .mockResolvedValueOnce(jsonSections('H3a', 'H3b'))
      .mockResolvedValueOnce(jsonSections('H4a', 'H4b'));

    await generateMarriageNarrative(makeScores({ spouseSynastry: makeSpouseSynastry() }));

    const content = JSON.stringify(state.generate.mock.calls[3]![0]);
    expect(content).toContain('5th house synastry is supportive');
    expect(content).toContain('Current dashas favor stability');
  });
});

describe('translateMarriageNarrative', () => {
  const sections = [{ heading: 'At A Glance', paragraphs: ['You scored 70.'] }];

  it('parses a valid translated response', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({
        sections: [{ heading: 'हिंदी शीर्षक', paragraphs: ['आपको 70 अंक मिले।'] }],
      }),
    );
    const translated = await translateMarriageNarrative(sections, 'hi');
    expect(translated[0]?.heading).toBe('हिंदी शीर्षक');
  });

  it('is shape-agnostic — round-trips all 7 real sections generateMarriageNarrative now produces', async () => {
    const sevenSections = [
      'At A Glance',
      'Marriage Timing',
      'Who You Will Marry',
      'Family & In-Laws',
      'Money After Marriage',
      "What's Going For You",
      'Modern Realities',
    ].map((heading) => ({ heading, paragraphs: [`Paragraph for ${heading}.`] }));

    state.generate.mockResolvedValueOnce(JSON.stringify({ sections: sevenSections }));
    const translated = await translateMarriageNarrative(sevenSections, 'hi');
    expect(translated).toHaveLength(7);
  });

  it('throws on an unparseable translated response', async () => {
    state.generate.mockResolvedValueOnce('garbage');
    await expect(translateMarriageNarrative(sections, 'hi')).rejects.toThrow();
  });
});
