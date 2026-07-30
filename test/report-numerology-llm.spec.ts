import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NumerologyScores } from '../src/lib/astro-engine/reports/numerology.js';

const state = vi.hoisted(() => ({ generate: vi.fn() }));

vi.mock('../src/lib/llm/gemini-client.js', () => ({ generate: state.generate }));

const { generateNumerologyNarrative, translateNumerologyNarrative } =
  await import('../src/lib/llm/reports/numerology.js');

function makeScores(overrides: Partial<NumerologyScores> = {}): NumerologyScores {
  return {
    name: 'Asha Sharma',
    dob: '1994-03-15',
    mulank: 6,
    bhagyank: 5,
    lifePath: 2,
    expression: 8,
    soulUrge: 3,
    personality: 5,
    luckyNumbers: [2, 4, 6, 8],
    loShuGrid: {
      frequencies: { 1: 1, 2: 0, 3: 1, 4: 0, 5: 1, 6: 0, 7: 0, 8: 0, 9: 1 },
      missing: [2, 4, 6, 7, 8],
      cells: [
        [0, 1, 0],
        [1, 1, 0],
        [0, 1, 0],
      ],
    },
    challengeNumbers: {
      first: 1,
      second: 2,
      main: 1,
      fourth: 3,
      phases: [
        { phase: 1, ageRange: '0-29', challenge: 1 },
        { phase: 2, ageRange: '30-38', challenge: 2 },
        { phase: 3, ageRange: '39-47', challenge: 1 },
        { phase: 4, ageRange: '48+', challenge: 3 },
      ],
    },
    personalYear: 4,
    personalMonth: 6,
    monthlyForecast: [
      { month: 'July', year: 2026, calendarMonth: 7, personalMonth: 6, personalYear: 4 },
      { month: 'August', year: 2026, calendarMonth: 8, personalMonth: 7, personalYear: 4 },
    ],
    namePlanes: {
      knowledge: 2,
      strength: 3,
      emotional: 4,
      spiritual: 1,
      letters: {
        knowledge: ['H', 'P'],
        strength: ['D', 'M', 'T'],
        emotional: ['A', 'S', 'C', 'A'],
        spiritual: ['R'],
      },
    },
    kua: { kuaNumber: 7, element: 'Metal' },
    nameAlignment: {
      mulank: 6,
      bhagyank: 5,
      pythagorean: 8,
      chaldean: 5,
      soulUrge: 3,
      personality: 5,
      targets: [6, 5],
      alignment: 'partially_aligned',
      friendly: [1, 3, 9],
      enemy: [4, 8],
    },
    luckyDayColor: { day: 'Friday', colors: ['Blue', 'Pink', 'White'] },
    yearlyForecast: [
      { year: 2026, personalYear: 4 },
      { year: 2027, personalYear: 5 },
      { year: 2028, personalYear: 6 },
      { year: 2029, personalYear: 7 },
      { year: 2030, personalYear: 8 },
    ],
    ...overrides,
  };
}

const call1Response = JSON.stringify({
  sections: [
    { heading: 'Your Core Numbers', paragraphs: ['Your Mulank and Bhagyank shape your path.'] },
    {
      heading: 'Expression, Soul Urge & Personality',
      paragraphs: ['Your Expression number highlights your talents.'],
    },
    {
      heading: 'Does Your Name Support Your Numbers',
      paragraphs: ['Your name is partially aligned with your birth numbers.'],
    },
  ],
});
const call2Response = JSON.stringify({
  sections: [
    { heading: 'Your Lo Shu Grid & Name Planes', paragraphs: ['Your grid shows strong emotion.'] },
    { heading: 'Challenge Numbers & Kua Element', paragraphs: ['Your challenges shift by age.'] },
  ],
});
const call3Response = JSON.stringify({
  sections: [
    { heading: 'This Year & This Month', paragraphs: ['This year favors steady building.'] },
    { heading: 'Your 12-Month Forecast', paragraphs: ['The months ahead form a rhythm.'] },
    {
      heading: 'Your Luckiest Days, Colors & Years Ahead',
      paragraphs: ['Friday and blue tones suit you, and 2030 looks strongest.'],
    },
  ],
});

beforeEach(() => {
  state.generate.mockReset();
});

describe('generateNumerologyNarrative', () => {
  it('makes exactly 3 bounded LLM calls returning 8 sections total, in order', async () => {
    state.generate
      .mockResolvedValueOnce(call1Response)
      .mockResolvedValueOnce(call2Response)
      .mockResolvedValueOnce(call3Response);

    const sections = await generateNumerologyNarrative(makeScores());

    expect(state.generate).toHaveBeenCalledTimes(3);
    expect(sections).toHaveLength(8);
    expect(sections.map((s) => s.heading)).toEqual([
      'Your Core Numbers',
      'Expression, Soul Urge & Personality',
      'Does Your Name Support Your Numbers',
      'Your Lo Shu Grid & Name Planes',
      'Challenge Numbers & Kua Element',
      'This Year & This Month',
      'Your 12-Month Forecast',
      'Your Luckiest Days, Colors & Years Ahead',
    ]);
  });

  it('embeds the given nameAlignment facts in call 1 — answers "does my current name numerologically support my birth-date numbers"', async () => {
    state.generate
      .mockResolvedValueOnce(call1Response)
      .mockResolvedValueOnce(call2Response)
      .mockResolvedValueOnce(call3Response);
    await generateNumerologyNarrative(makeScores());
    const content = state.generate.mock.calls[0]?.[0].messages
      .map((m: { content: string }) => m.content)
      .join('\n');
    expect(content).toContain('partially_aligned');
    expect(content).toContain('6, 5');
  });

  it('embeds the given luckyDayColor/yearlyForecast facts in call 3 — answers "luckiest days/colors" and "years ahead"', async () => {
    state.generate
      .mockResolvedValueOnce(call1Response)
      .mockResolvedValueOnce(call2Response)
      .mockResolvedValueOnce(call3Response);
    await generateNumerologyNarrative(makeScores());
    const content = state.generate.mock.calls[2]?.[0].messages
      .map((m: { content: string }) => m.content)
      .join('\n');
    expect(content).toContain('Friday');
    expect(content).toContain('Blue, Pink, White');
    expect(content).toContain('2030: Personal Year 8');
  });

  it('instructs the model to answer "numbers or dates to avoid for major decisions" in call 2', async () => {
    state.generate
      .mockResolvedValueOnce(call1Response)
      .mockResolvedValueOnce(call2Response)
      .mockResolvedValueOnce(call3Response);
    await generateNumerologyNarrative(makeScores());
    const content = state.generate.mock.calls[1]?.[0].messages
      .map((m: { content: string }) => m.content)
      .join('\n');
    expect(content.toLowerCase()).toContain('avoid for major decisions');
  });

  it('embeds the given mulank/bhagyank/lifePath/expression facts as GIVEN FACTS in call 1', async () => {
    state.generate
      .mockResolvedValueOnce(call1Response)
      .mockResolvedValueOnce(call2Response)
      .mockResolvedValueOnce(call3Response);
    await generateNumerologyNarrative(makeScores({ mulank: 9, bhagyank: 1, lifePath: 7 }));
    const content = state.generate.mock.calls[0]?.[0].messages
      .map((m: { content: string }) => m.content)
      .join('\n');
    expect(content).toContain('Mulank (psychic/day number): 9');
    expect(content).toContain('Bhagyank (destiny number): 1');
    expect(content).toContain('Life Path number: 7');
    expect(content.toUpperCase()).toContain('GIVEN FACT');
  });

  it('instructs the model to tie the given Bhagyank to ideal career direction (covers-list fact wiring)', async () => {
    state.generate
      .mockResolvedValueOnce(call1Response)
      .mockResolvedValueOnce(call2Response)
      .mockResolvedValueOnce(call3Response);
    await generateNumerologyNarrative(makeScores());
    const content = state.generate.mock.calls[0]?.[0].messages
      .map((m: { content: string }) => m.content)
      .join('\n');
    expect(content.toLowerCase()).toContain('ideal career direction');
  });

  it('embeds the given Lo Shu Grid / Name Planes / Challenge Numbers / Kua facts in call 2', async () => {
    state.generate
      .mockResolvedValueOnce(call1Response)
      .mockResolvedValueOnce(call2Response)
      .mockResolvedValueOnce(call3Response);
    await generateNumerologyNarrative(makeScores());
    const content = state.generate.mock.calls[1]?.[0].messages
      .map((m: { content: string }) => m.content)
      .join('\n');
    expect(content).toContain('Missing digits');
    expect(content).toContain('Kua Number: 7');
    expect(content).toContain('Feng Shui element: Metal');
  });

  it('embeds the given personalYear/personalMonth/monthlyForecast facts in call 3', async () => {
    state.generate
      .mockResolvedValueOnce(call1Response)
      .mockResolvedValueOnce(call2Response)
      .mockResolvedValueOnce(call3Response);
    await generateNumerologyNarrative(makeScores({ personalYear: 8, personalMonth: 3 }));
    const content = state.generate.mock.calls[2]?.[0].messages
      .map((m: { content: string }) => m.content)
      .join('\n');
    expect(content).toContain('Current Personal Year number: 8');
    expect(content).toContain('Current Personal Month number: 3');
    expect(content).toContain('July 2026');
  });

  it('throws on an unparseable response from call 1 (never reaches call 2 or 3)', async () => {
    state.generate.mockResolvedValueOnce('not json');
    await expect(generateNumerologyNarrative(makeScores())).rejects.toThrow();
    expect(state.generate).toHaveBeenCalledTimes(1);
  });

  it('throws on an unparseable response from call 3', async () => {
    state.generate
      .mockResolvedValueOnce(call1Response)
      .mockResolvedValueOnce(call2Response)
      .mockResolvedValueOnce('garbage');
    await expect(generateNumerologyNarrative(makeScores())).rejects.toThrow();
  });
});

describe('translateNumerologyNarrative', () => {
  const sections = [
    { heading: 'Your Core Numbers', paragraphs: ['Your Mulank and Bhagyank shape your path.'] },
  ];

  it('parses a valid translated response', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({ sections: [{ heading: 'हिंदी', paragraphs: ['अनुवाद'] }] }),
    );
    const translated = await translateNumerologyNarrative(sections, 'hi');
    expect(translated[0]?.heading).toBe('हिंदी');
  });

  it('throws on an unparseable translated response', async () => {
    state.generate.mockResolvedValueOnce('garbage');
    await expect(translateNumerologyNarrative(sections, 'hi')).rejects.toThrow();
  });
});
