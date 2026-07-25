import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MarriageScores } from '../src/lib/astro-engine/reports/marriage.js';

const state = vi.hoisted(() => ({ generate: vi.fn() }));

vi.mock('../src/lib/llm/gemini-client.js', () => ({ generate: state.generate }));

const { generateMarriageNarrative, translateMarriageNarrative } = await import(
  '../src/lib/llm/reports/marriage.js'
);

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
    strongestWindow: { startDate: '2027-01-01T00:00:00.000Z', endDate: '2028-01-01T00:00:00.000Z' },
    upcomingWindows: [],
    ...overrides,
  };
}

beforeEach(() => {
  state.generate.mockReset();
});

describe('generateMarriageNarrative', () => {
  it('makes 2 LLM calls and concatenates their sections', async () => {
    state.generate
      .mockResolvedValueOnce(
        JSON.stringify({
          sections: [
            { heading: 'At A Glance', paragraphs: ['You scored 70, a steady band.'] },
            { heading: 'Marriage Timing', paragraphs: ['The window opens in 2027.'] },
          ],
        }),
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          sections: [
            { heading: 'Who You Will Marry', paragraphs: ['Your 7th house is Virgo-flavored.'] },
            { heading: 'Family & In-Laws', paragraphs: ['In-law relations look balanced.'] },
          ],
        }),
      );

    const sections = await generateMarriageNarrative(makeScores());
    expect(state.generate).toHaveBeenCalledTimes(2);
    expect(sections).toHaveLength(4);
    expect(sections.map((s) => s.heading)).toEqual([
      'At A Glance',
      'Marriage Timing',
      'Who You Will Marry',
      'Family & In-Laws',
    ]);
  });

  it('embeds the given score/band/manglik facts as GIVEN FACTS in the first call', async () => {
    state.generate
      .mockResolvedValueOnce(JSON.stringify({ sections: [{ heading: 'H', paragraphs: ['p'] }] }))
      .mockResolvedValueOnce(JSON.stringify({ sections: [{ heading: 'H2', paragraphs: ['p2'] }] }));

    await generateMarriageNarrative(makeScores({ marriageScore: 82, band: 'accelerated' }));

    const firstCall = state.generate.mock.calls[0]?.[0];
    const content = firstCall.messages.map((m: { content: string }) => m.content).join('\n');
    expect(content).toContain('82');
    expect(content).toContain('accelerated');
    expect(content.toUpperCase()).toContain('GIVEN FACT');
  });

  it('embeds the 7th house sign/temperament and 4th-lord strength in the second call', async () => {
    state.generate
      .mockResolvedValueOnce(JSON.stringify({ sections: [{ heading: 'H', paragraphs: ['p'] }] }))
      .mockResolvedValueOnce(JSON.stringify({ sections: [{ heading: 'H2', paragraphs: ['p2'] }] }));

    await generateMarriageNarrative(makeScores({ seventhHouseSign: 'Scorpio' }));

    const secondCall = state.generate.mock.calls[1]?.[0];
    const content = secondCall.messages.map((m: { content: string }) => m.content).join('\n');
    expect(content).toContain('Scorpio');
  });

  it('throws when the first call returns unparseable JSON', async () => {
    state.generate.mockResolvedValueOnce('not json');
    await expect(generateMarriageNarrative(makeScores())).rejects.toThrow();
  });

  it('throws when the second call returns unparseable JSON', async () => {
    state.generate
      .mockResolvedValueOnce(JSON.stringify({ sections: [{ heading: 'H', paragraphs: ['p'] }] }))
      .mockResolvedValueOnce('garbage');
    await expect(generateMarriageNarrative(makeScores())).rejects.toThrow();
  });
});

describe('translateMarriageNarrative', () => {
  const sections = [{ heading: 'At A Glance', paragraphs: ['You scored 70.'] }];

  it('parses a valid translated response', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({ sections: [{ heading: 'हिंदी शीर्षक', paragraphs: ['आपको 70 अंक मिले।'] }] }),
    );
    const translated = await translateMarriageNarrative(sections, 'hi');
    expect(translated[0]?.heading).toBe('हिंदी शीर्षक');
  });

  it('throws on an unparseable translated response', async () => {
    state.generate.mockResolvedValueOnce('garbage');
    await expect(translateMarriageNarrative(sections, 'hi')).rejects.toThrow();
  });
});
