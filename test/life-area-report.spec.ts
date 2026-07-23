import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GroundingSource } from '../src/lib/chat-grounding.js';

const state = vi.hoisted(() => ({
  generate: vi.fn(),
  buildGroundingFacts: vi.fn(),
}));

vi.mock('../src/lib/llm/gemini-client.js', () => ({
  generate: state.generate,
}));

vi.mock('../src/lib/chat-grounding.js', () => ({
  buildGroundingFacts: state.buildGroundingFacts,
}));

const { generateLifeAreaReport, translateLifeAreaContent } =
  await import('../src/lib/llm/life-area-report.js');

const EMPTY_GROUNDING: GroundingSource = {
  chart: null,
  dasha: null,
  yogas: null,
  doshas: null,
  ashtakavarga: null,
};

const VALID_JSON = JSON.stringify({
  intro: 'You have spent years building toward this exact kind of stability.',
  currentPhase: 'Your current major period favors steady, incremental progress over big leaps.',
  strengths: 'Your natural discipline shows up clearly in how you approach long-term goals.',
  challenges: 'You may take on more responsibility than you delegate, which can slow momentum.',
  guidance: 'Lean into the steady pace this period supports rather than forcing a shortcut.',
});

beforeEach(() => {
  state.generate.mockReset();
  state.buildGroundingFacts.mockReset().mockResolvedValue(['Rising Sign (Ascendant): Leo']);
});

describe('generateLifeAreaReport', () => {
  it('returns the parsed narrative + model for each area', async () => {
    state.generate.mockResolvedValueOnce(VALID_JSON);

    const result = await generateLifeAreaReport({ area: 'career', grounding: EMPTY_GROUNDING });

    expect(result.intro).toContain('stability');
    expect(result.currentPhase).toContain('steady');
    expect(result.strengths).toBeTruthy();
    expect(result.challenges).toBeTruthy();
    expect(result.guidance).toBeTruthy();
    expect(result.model).toBeTruthy();
  });

  it('builds grounding facts from the chart data and includes them in the prompt', async () => {
    state.generate.mockResolvedValueOnce(VALID_JSON);

    await generateLifeAreaReport({ area: 'finance', grounding: EMPTY_GROUNDING });

    expect(state.buildGroundingFacts).toHaveBeenCalledWith(EMPTY_GROUNDING);
    const call = state.generate.mock.calls[0]![0];
    const groundingMessage = call.messages.find((m: { content: string }) =>
      m.content.includes('astro_context'),
    );
    expect(groundingMessage.content).toContain('Rising Sign (Ascendant): Leo');
  });

  it('uses an area-specific system prompt (e.g. mentions the D9/Navamsa chart for marriage, not career)', async () => {
    state.generate.mockResolvedValueOnce(VALID_JSON);

    await generateLifeAreaReport({ area: 'marriage', grounding: EMPTY_GROUNDING });

    const call = state.generate.mock.calls[0]![0];
    const systemMessage = call.messages[0]!.content as string;
    expect(systemMessage).toContain('Navamsa');
    expect(systemMessage.toLowerCase()).toContain('spouse');
  });

  it('throws (never caches filler) when Gemini returns unparseable JSON', async () => {
    state.generate.mockResolvedValueOnce('not json at all');

    await expect(
      generateLifeAreaReport({ area: 'health', grounding: EMPTY_GROUNDING }),
    ).rejects.toThrow('life-area (health) LLM returned unparseable JSON');
  });

  it('throws when a required narrative field is missing', async () => {
    state.generate.mockResolvedValueOnce(JSON.stringify({ intro: 'only an intro' }));

    await expect(
      generateLifeAreaReport({ area: 'education', grounding: EMPTY_GROUNDING }),
    ).rejects.toThrow('life-area (education) LLM returned unparseable JSON');
  });
});

describe('translateLifeAreaContent', () => {
  const original = {
    intro: 'You have spent years building toward this exact kind of stability.',
    currentPhase: 'Your current major period favors steady, incremental progress over big leaps.',
    strengths: 'Your natural discipline shows up clearly in how you approach long-term goals.',
    challenges: 'You may take on more responsibility than you delegate, which can slow momentum.',
    guidance: 'Lean into the steady pace this period supports rather than forcing a shortcut.',
  };

  it('returns the translated narrative on a valid response', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({
        intro: 'नमस्ते',
        currentPhase: 'चरण',
        strengths: 'ताकत',
        challenges: 'चुनौतियाँ',
        guidance: 'मार्गदर्शन',
      }),
    );

    const result = await translateLifeAreaContent(original, 'hi');
    expect(result.intro).toBe('नमस्ते');
    expect(result.guidance).toBe('मार्गदर्शन');
  });

  it('throws on an unparseable translation response', async () => {
    state.generate.mockResolvedValueOnce('garbage');

    await expect(translateLifeAreaContent(original, 'hi')).rejects.toThrow(
      'life-area translation returned unparseable JSON (target=hi)',
    );
  });
});
