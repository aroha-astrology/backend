import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HealthMonthlyScores } from '../src/lib/astro-engine/reports/health-monthly.js';

const state = vi.hoisted(() => ({ generate: vi.fn() }));

vi.mock('../src/lib/llm/gemini-client.js', () => ({ generate: state.generate }));

const { generateHealthMonthlyNarrative, translateHealthMonthlyNarrative } = await import(
  '../src/lib/llm/reports/health-monthly.js'
);

function makeScores(overrides: Partial<HealthMonthlyScores> = {}): HealthMonthlyScores {
  return {
    periodMonth: '2027-01',
    activeMahadashaLord: 'Jupiter',
    activeAntardashaLord: 'Saturn',
    monthScore: 60,
    keyHouses: [6, 1],
    tone: 'mixed',
    ...overrides,
  };
}

beforeEach(() => {
  state.generate.mockReset();
});

describe('generateHealthMonthlyNarrative', () => {
  it('returns 2 sections from 1 LLM call', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({
        sections: [
          { heading: "This Month's Outlook", paragraphs: ['A mixed month.'] },
          { heading: 'Practical Guidance', paragraphs: ['Rest well.'] },
        ],
      }),
    );
    const sections = await generateHealthMonthlyNarrative(makeScores());
    expect(state.generate).toHaveBeenCalledTimes(1);
    expect(sections).toHaveLength(2);
  });

  it('instructs the model this is NOT medical advice', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({ sections: [{ heading: 'H', paragraphs: ['p'] }] }),
    );
    await generateHealthMonthlyNarrative(makeScores());
    const call = state.generate.mock.calls[0]?.[0];
    const content = call.messages.map((m: { content: string }) => m.content).join('\n');
    expect(content.toLowerCase()).toContain('not medical advice');
  });

  it('embeds the given dasha lords and tone', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({ sections: [{ heading: 'H', paragraphs: ['p'] }] }),
    );
    await generateHealthMonthlyNarrative(makeScores({ activeMahadashaLord: 'Venus', tone: 'favorable' }));
    const call = state.generate.mock.calls[0]?.[0];
    const content = call.messages.map((m: { content: string }) => m.content).join('\n');
    expect(content).toContain('Venus');
    expect(content).toContain('favorable');
  });

  it('throws on an unparseable response', async () => {
    state.generate.mockResolvedValueOnce('not json');
    await expect(generateHealthMonthlyNarrative(makeScores())).rejects.toThrow();
  });
});

describe('translateHealthMonthlyNarrative', () => {
  const sections = [{ heading: "This Month's Outlook", paragraphs: ['A mixed month.'] }];

  it('parses a valid translated response', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({ sections: [{ heading: 'हिंदी', paragraphs: ['अनुवाद'] }] }),
    );
    const translated = await translateHealthMonthlyNarrative(sections, 'hi');
    expect(translated[0]?.heading).toBe('हिंदी');
  });

  it('throws on an unparseable translated response', async () => {
    state.generate.mockResolvedValueOnce('garbage');
    await expect(translateHealthMonthlyNarrative(sections, 'hi')).rejects.toThrow();
  });
});
