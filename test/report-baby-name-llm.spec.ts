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
    candidateNames: ['Chudamani', 'Chuni', 'Chunni'],
    ...overrides,
  } as unknown as BabyNameScores;
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

  it('embeds the given candidate names as a GIVEN FACT and forbids inventing any', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({ sections: [{ heading: 'H', paragraphs: ['p'] }] }),
    );
    await generateBabyNameNarrative(
      makeScores({ candidateNames: ['Chudamani', 'Chuni', 'Chunni'] }),
    );
    const call = state.generate.mock.calls[0]?.[0];
    const content = call.messages.map((m: { content: string }) => m.content).join('\n');
    expect(content).toContain('Chudamani, Chuni, Chunni');
    expect(content.toUpperCase()).toContain('GIVEN FACT');
    expect(content.toLowerCase()).toContain('never invent an extra name');
  });

  it('never asks the model to source/invent names — only to write about the given ones', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({ sections: [{ heading: 'H', paragraphs: ['p'] }] }),
    );
    await generateBabyNameNarrative(makeScores());
    const call = state.generate.mock.calls[0]?.[0];
    const content = call.messages.map((m: { content: string }) => m.content).join('\n');
    expect(content.toLowerCase()).not.toContain('at least 25');
    expect(content.toLowerCase()).toContain('your job is only to write about the given names');
  });

  it('says so plainly rather than inventing names when the corpus has no match for the syllable', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({ sections: [{ heading: 'H', paragraphs: ['p'] }] }),
    );
    await generateBabyNameNarrative(makeScores({ candidateNames: [] }));
    const call = state.generate.mock.calls[0]?.[0];
    const content = call.messages.map((m: { content: string }) => m.content).join('\n');
    expect(content).toContain('Suggested names: NONE');
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

  it('instructs the model to spread names across traditional/modern/deity-inspired flavors', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({ sections: [{ heading: 'H', paragraphs: ['p'] }] }),
    );
    await generateBabyNameNarrative(makeScores());
    const call = state.generate.mock.calls[0]?.[0];
    const content = call.messages.map((m: { content: string }) => m.content).join('\n');
    expect(content.toLowerCase()).toContain('traditional');
    expect(content.toLowerCase()).toContain('modern');
    expect(content.toLowerCase()).toContain('deity-inspired');
  });

  it('instructs the model to state personality traits/qualities the birth star classically suggests, not just naming-theme flavor', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({ sections: [{ heading: 'H', paragraphs: ['p'] }] }),
    );
    await generateBabyNameNarrative(makeScores());
    const call = state.generate.mock.calls[0]?.[0];
    const content = call.messages.map((m: { content: string }) => m.content).join('\n');
    expect(content.toLowerCase()).toContain('personality trait');
  });

  it('instructs the model to explain how the pada further narrows the syllable within the nakshatra', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({ sections: [{ heading: 'H', paragraphs: ['p'] }] }),
    );
    await generateBabyNameNarrative(makeScores());
    const call = state.generate.mock.calls[0]?.[0];
    const content = call.messages.map((m: { content: string }) => m.content).join('\n');
    expect(content.toLowerCase()).toContain('pada');
    expect(content.toLowerCase()).toMatch(/narrow|refine/);
  });

  it('instructs an honest answer to "which sounds to avoid" instead of silently skipping the question', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({ sections: [{ heading: 'H', paragraphs: ['p'] }] }),
    );
    await generateBabyNameNarrative(makeScores());
    const call = state.generate.mock.calls[0]?.[0];
    const systemContent = call.messages
      .filter((m: { role: string }) => m.role === 'system')
      .map((m: { content: string }) => m.content)
      .join('\n');
    expect(systemContent.toLowerCase()).toContain('sounds or letters to avoid');
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
