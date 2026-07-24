import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DrawnTarotCard } from '../src/lib/tarot/deck.js';

const state = vi.hoisted(() => ({
  generate: vi.fn(),
}));

vi.mock('../src/lib/llm/gemini-client.js', () => ({
  generate: state.generate,
}));

const { generateTarotReport, translateTarotContent } =
  await import('../src/lib/llm/tarot-report.js');

const DRAWN: DrawnTarotCard[] = [
  {
    position: 'past',
    reversed: false,
    card: {
      name: 'The Fool',
      arcana: 'major',
      uprightMeaning: 'new beginnings, spontaneity',
      reversedMeaning: 'recklessness, hesitation',
    },
  },
  {
    position: 'present',
    reversed: true,
    card: {
      name: 'The Tower',
      arcana: 'major',
      uprightMeaning: 'sudden upheaval, revelation',
      reversedMeaning: 'avoiding disaster, delayed change',
    },
  },
  {
    position: 'future',
    reversed: false,
    card: {
      name: 'The Sun',
      arcana: 'major',
      uprightMeaning: 'joy, success, vitality',
      reversedMeaning: 'temporary sadness',
    },
  },
];

const VALID_JSON = JSON.stringify({
  intro:
    'This spread traces a journey from a bold first step through a shake-up toward genuine light ahead.',
  pastReading:
    'The Fool in your past marks a leap you took without knowing exactly where it would lead.',
  presentReading:
    'The Tower reversed suggests you have been bracing for change rather than being caught off guard by it.',
  futureReading: 'The Sun points to a season of real clarity and warmth ahead of you.',
  guidance:
    'Trust the shake-up you are navigating now — it is clearing space for what The Sun promises.',
});

beforeEach(() => {
  state.generate.mockReset();
});

describe('generateTarotReport', () => {
  it('returns the parsed narrative + model', async () => {
    state.generate.mockResolvedValueOnce(VALID_JSON);

    const result = await generateTarotReport({ drawn: DRAWN });

    expect(result.intro).toContain('journey');
    expect(result.pastReading).toContain('Fool');
    expect(result.presentReading).toBeTruthy();
    expect(result.futureReading).toBeTruthy();
    expect(result.guidance).toBeTruthy();
    expect(result.model).toBeTruthy();
  });

  it('feeds each drawn card (name, orientation, position, meaning) into the grounding context', async () => {
    state.generate.mockResolvedValueOnce(VALID_JSON);

    await generateTarotReport({ drawn: DRAWN });

    const call = state.generate.mock.calls[0]![0];
    const groundingMessage = call.messages.find((m: { content: string }) =>
      m.content.includes('astro_context'),
    );
    expect(groundingMessage.content).toContain('The Fool');
    expect(groundingMessage.content).toContain('The Tower');
    expect(groundingMessage.content).toContain('reversed');
    expect(groundingMessage.content).toContain('The Sun');
  });

  it('throws (never caches filler) when Gemini returns unparseable JSON', async () => {
    state.generate.mockResolvedValueOnce('not json at all');

    await expect(generateTarotReport({ drawn: DRAWN })).rejects.toThrow(
      'tarot LLM returned unparseable JSON',
    );
  });

  it('throws when a required narrative field is missing', async () => {
    state.generate.mockResolvedValueOnce(JSON.stringify({ intro: 'only an intro' }));

    await expect(generateTarotReport({ drawn: DRAWN })).rejects.toThrow(
      'tarot LLM returned unparseable JSON',
    );
  });
});

describe('translateTarotContent', () => {
  const original = {
    intro:
      'This spread traces a journey from a bold first step through a shake-up toward genuine light ahead.',
    pastReading:
      'The Fool in your past marks a leap you took without knowing exactly where it would lead.',
    presentReading: 'The Tower reversed suggests you have been bracing for change.',
    futureReading: 'The Sun points to a season of real clarity and warmth ahead of you.',
    guidance: 'Trust the shake-up you are navigating now.',
  };

  it('returns the translated narrative on a valid response', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({
        intro: 'नमस्ते',
        pastReading: 'अतीत',
        presentReading: 'वर्तमान',
        futureReading: 'भविष्य',
        guidance: 'मार्गदर्शन',
      }),
    );

    const result = await translateTarotContent(original, 'hi');
    expect(result.intro).toBe('नमस्ते');
    expect(result.guidance).toBe('मार्गदर्शन');
  });

  it('throws on an unparseable translation response', async () => {
    state.generate.mockResolvedValueOnce('garbage');

    await expect(translateTarotContent(original, 'hi')).rejects.toThrow(
      'tarot translation returned unparseable JSON (target=hi)',
    );
  });
});
