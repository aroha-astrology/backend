// =============================================================================
// Gemini's OpenAI-compat layer keeps only the LAST system message and silently
// drops every earlier one. Callers here routinely send two (instructions, then
// grounding facts) — so without merging, the instruction prompt is discarded
// and the model freestyles over the data. That's the Baby Name report losing
// its entire name list. See mergeSystemMessages' doc comment.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { mergeSystemMessages } from '../src/lib/llm/gemini-client.js';

describe('mergeSystemMessages', () => {
  it('collapses two system messages into one, preserving both and their order', () => {
    const merged = mergeSystemMessages([
      { role: 'system', content: 'INSTRUCTIONS: suggest at least 25 names.' },
      { role: 'system', content: 'FACTS: nakshatra Shatabhisha.' },
      { role: 'user', content: 'Write it.' },
    ]);

    expect(merged).toHaveLength(2);
    expect(merged[0].role).toBe('system');
    // The instruction half is what used to vanish — assert it survives.
    expect(merged[0].content).toBe(
      'INSTRUCTIONS: suggest at least 25 names.\n\nFACTS: nakshatra Shatabhisha.',
    );
    expect(merged[1]).toEqual({ role: 'user', content: 'Write it.' });
  });

  it('merges 3+ system messages (horoscope.ts sends three)', () => {
    const merged = mergeSystemMessages([
      { role: 'system', content: 'a' },
      { role: 'system', content: 'b' },
      { role: 'system', content: 'c' },
      { role: 'user', content: 'q' },
    ]);
    expect(merged).toHaveLength(2);
    expect(merged[0].content).toBe('a\n\nb\n\nc');
  });

  it('leaves a single-system-message request untouched', () => {
    const messages = [
      { role: 'system', content: 'only one' },
      { role: 'user', content: 'q' },
    ];
    expect(mergeSystemMessages(messages)).toEqual(messages);
  });

  it('passes through structured (non-string) system content rather than flattening it lossily', () => {
    const messages = [
      { role: 'system', content: [{ type: 'text' as const, text: 'vision preamble' }] },
      { role: 'system', content: 'second' },
      { role: 'user', content: 'q' },
    ];
    expect(mergeSystemMessages(messages)).toEqual(messages);
  });
});
