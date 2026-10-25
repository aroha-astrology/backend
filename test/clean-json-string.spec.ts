import { describe, expect, it } from 'vitest';
import { cleanJsonString } from '../src/lib/llm/horoscope.js';
import { CHAT_SUMMARY_PROFILE } from '../src/config/llm.js';

// cleanJsonString is shared by every report, insight and translation parser, so a
// fix here covers all of them at once.
describe('cleanJsonString', () => {
  const parse = (raw: string) => JSON.parse(cleanJsonString(raw)) as unknown;

  it('drops text the model adds after the JSON', () => {
    // Production: "Unexpected non-whitespace character after JSON" on forecast translations.
    expect(parse('{"a": 1}\n\nI kept every key unchanged.')).toEqual({ a: 1 });
    expect(parse('{"a": 1}\n{"a": 1}')).toEqual({ a: 1 });
    expect(parse('[1, 2]\nDone.')).toEqual([1, 2]);
  });

  it('drops text after a fenced block', () => {
    expect(parse('```json\n{"a": 1}\n```\nHope this helps!')).toEqual({ a: 1 });
  });

  it('is not fooled by braces and quotes inside strings', () => {
    expect(parse('{"a": "x } y \\" {"}\nnote')).toEqual({ a: 'x } y " {' });
  });

  it('leaves clean JSON, prose and cut-off JSON exactly as they were', () => {
    expect(cleanJsonString('{"a": [1, {"b": 2}]}')).toBe('{"a": [1, {"b": 2}]}');
    expect(cleanJsonString('just words')).toBe('just words');
    // Cut off mid-string: nothing balanced to cut at, so later repair steps still see all of it.
    expect(cleanJsonString('{"text": "With intense Scorpio')).toBe('{"text": "With intense Scorpio');
  });
});

describe('CHAT_SUMMARY_PROFILE', () => {
  it('has room for the 150-word summary it asks for, in Hindi as well', () => {
    // 220 tokens cut summaries off mid-sentence in production (2026-10-25).
    expect(CHAT_SUMMARY_PROFILE.maxTokens).toBeGreaterThanOrEqual(600);
  });
});
