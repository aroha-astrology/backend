import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BabyNameScores } from '../src/lib/astro-engine/reports/baby-name.js';

const state = vi.hoisted(() => ({ generate: vi.fn() }));

vi.mock('../src/lib/llm/gemini-client.js', () => ({ generate: state.generate }));

const { generateBabyNameNarrative, translateBabyNameNarrative } =
  await import('../src/lib/llm/reports/baby-name.js');

function makeScores(overrides: Partial<BabyNameScores> = {}): BabyNameScores {
  return {
    moonNakshatra: 'Ashwini',
    moonPada: 1,
    startingSyllables: ['Chu'],
    nakshatraLord: 'Ketu',
    nakshatraDeity: 'Ashwini Kumaras',
    doshaYoga: { positives: [], cautions: [] },
    ...overrides,
  };
}

beforeEach(() => {
  state.generate.mockReset();
});

describe('generateBabyNameNarrative', () => {
  it('makes exactly 1 LLM call and returns a section with a name list', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({
        sections: [
          {
            heading: 'Suggested Names',
            paragraphs: ['Chudamani — one who wears the crest jewel of virtue.'],
          },
        ],
      }),
    );
    const sections = await generateBabyNameNarrative(makeScores());
    expect(state.generate).toHaveBeenCalledTimes(1);
    expect(sections.length).toBeGreaterThan(0);
  });

  it('instructs the model to use ONLY the given starting syllable, no invented syllables', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({ sections: [{ heading: 'H', paragraphs: ['p'] }] }),
    );
    await generateBabyNameNarrative(makeScores({ startingSyllables: ['Ma'] }));
    const call = state.generate.mock.calls[0]?.[0];
    const content = call.messages.map((m: { content: string }) => m.content).join('\n');
    expect(content).toContain('Ma');
    expect(content.toLowerCase()).toContain('real');
  });

  it("instructs the model to state the scope limitation (own chart, not the child's) up front", async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({ sections: [{ heading: 'H', paragraphs: ['p'] }] }),
    );
    await generateBabyNameNarrative(makeScores());
    const call = state.generate.mock.calls[0]?.[0];
    const content = call.messages.map((m: { content: string }) => m.content).join('\n');
    expect(content.toLowerCase()).toContain('regional naming traditions');
  });

  it('throws on an unparseable response', async () => {
    state.generate.mockResolvedValueOnce('not json');
    await expect(generateBabyNameNarrative(makeScores())).rejects.toThrow();
  });

  it('embeds the given nakshatra lord/deity facts', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({ sections: [{ heading: 'H', paragraphs: ['p'] }] }),
    );
    await generateBabyNameNarrative(
      makeScores({ nakshatraLord: 'Mercury', nakshatraDeity: 'Vishnu' }),
    );
    const call = state.generate.mock.calls[0]?.[0];
    const content = call.messages.map((m: { content: string }) => m.content).join('\n');
    expect(content).toContain('Mercury');
    expect(content).toContain('Vishnu');
  });

  it('instructs the model to mention a present dosha gently, not alarmingly', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({ sections: [{ heading: 'H', paragraphs: ['p'] }] }),
    );
    await generateBabyNameNarrative(
      makeScores({
        doshaYoga: {
          positives: [],
          cautions: [{ label: 'Mangal Dosha', detail: 'medium severity' }],
        },
      }),
    );
    const call = state.generate.mock.calls[0]?.[0];
    const content = call.messages.map((m: { content: string }) => m.content).join('\n');
    expect(content).toContain('Mangal Dosha');
    expect(content.toLowerCase()).toContain('gently');
  });
});

describe('translateBabyNameNarrative', () => {
  const sections = [{ heading: 'Suggested Names', paragraphs: ['Chudamani.'] }];

  it('parses a valid translated response', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({ sections: [{ heading: 'हिंदी', paragraphs: ['नाम'] }] }),
    );
    const translated = await translateBabyNameNarrative(sections, 'hi');
    expect(translated[0]?.heading).toBe('हिंदी');
  });

  it('throws on an unparseable translated response', async () => {
    state.generate.mockResolvedValueOnce('garbage');
    await expect(translateBabyNameNarrative(sections, 'hi')).rejects.toThrow();
  });
});
