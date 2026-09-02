import { describe, expect, it } from 'vitest';
import { isFreeFollowUp } from '../src/lib/chat-follow-up.js';

const withAssistantTurn = (content: string) => [
  { role: 'user' as const, content: 'first question' },
  { role: 'assistant' as const, content },
];

describe('isFreeFollowUp', () => {
  it('matches the exact suggested follow-up', () => {
    const history = withAssistantTurn('Answer.\nAsk next: What about my finances this month?');
    expect(isFreeFollowUp('What about my finances this month?', history)).toBe(true);
  });

  it('is case- and whitespace-insensitive, and ignores trailing punctuation', () => {
    const history = withAssistantTurn('Answer.\nAsk next: What about my finances this month?');
    expect(isFreeFollowUp('  WHAT about my finances this month  ', history)).toBe(true);
  });

  it('rejects a message that only loosely resembles the suggestion', () => {
    const history = withAssistantTurn('Answer.\nAsk next: What about my finances this month?');
    expect(isFreeFollowUp('What about my finances', history)).toBe(false);
    expect(isFreeFollowUp('Tell me about my finances this month', history)).toBe(false);
  });

  it('returns false when the last reply had no "Ask next:" line', () => {
    const history = withAssistantTurn('Just a plain answer with no suggestion.');
    expect(isFreeFollowUp('Just a plain answer with no suggestion.', history)).toBe(false);
  });

  it('returns false for an empty or user-only history', () => {
    expect(isFreeFollowUp('anything', [])).toBe(false);
    expect(isFreeFollowUp('anything', [{ role: 'user', content: 'hi' }])).toBe(false);
  });

  it('matches only against the LAST assistant turn, not an earlier one', () => {
    const history = [
      { role: 'user' as const, content: 'q1' },
      { role: 'assistant' as const, content: 'a1.\nAsk next: An old suggestion?' },
      { role: 'user' as const, content: 'q2' },
      { role: 'assistant' as const, content: 'a2.\nAsk next: The current suggestion?' },
    ];
    expect(isFreeFollowUp('An old suggestion?', history)).toBe(false);
    expect(isFreeFollowUp('The current suggestion?', history)).toBe(true);
  });

  it('makes every option on a multi-choice suggestion line free, not just the first', () => {
    // One "Ask next:" line can offer several tappable answers separated by " | "
    // (income ranges, timeframes). The user still taps exactly one, so charging
    // for all but the first would recreate the very problem the free tap fixed.
    const history = withAssistantTurn(
      'Your chart shows steady growth.\nAsk next: Under ₹25,000 a month | ₹25,000 – 75,000 | Prefer not to say',
    );
    expect(isFreeFollowUp('Under ₹25,000 a month', history)).toBe(true);
    expect(isFreeFollowUp('Prefer not to say', history)).toBe(true);
    expect(isFreeFollowUp('What about my career?', history)).toBe(false);
  });

  it('does not treat an arbitrary question as free just because it is a question', () => {
    // Guards against the mechanism being read as "any follow-up question is
    // free" — it must be THE suggested one, not merely question-shaped.
    const history = withAssistantTurn('Answer.\nAsk next: What about my finances this month?');
    expect(isFreeFollowUp('What is my lucky color?', history)).toBe(false);
  });
});
