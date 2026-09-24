import { describe, expect, it } from 'vitest';
import { isFreeFollowUp } from '../src/lib/chat-follow-up.js';

const withAssistantTurn = (content: string) => [
  { role: 'user' as const, content: 'first question' },
  { role: 'assistant' as const, content },
];

const ANSWERS = 'What field do you work in?\nAsk next: IT or software | Business | Government job';

describe('isFreeFollowUp', () => {
  it("matches a tapped answer to the astrologer's own question", () => {
    expect(isFreeFollowUp('Business', withAssistantTurn(ANSWERS))).toBe(true);
    expect(isFreeFollowUp('Government job', withAssistantTurn(ANSWERS))).toBe(true);
  });

  it('is case- and whitespace-insensitive, and ignores trailing punctuation', () => {
    expect(isFreeFollowUp('  it OR software.  ', withAssistantTurn(ANSWERS))).toBe(true);
  });

  it('never makes a single suggested follow-up QUESTION free — it yields no user fact', () => {
    const history = withAssistantTurn('Answer.\nAsk next: What about my finances this month?');
    expect(isFreeFollowUp('What about my finances this month?', history)).toBe(false);
  });

  it('rejects a message that only loosely resembles an option', () => {
    expect(isFreeFollowUp('Business owner', withAssistantTurn(ANSWERS))).toBe(false);
    expect(isFreeFollowUp('IT', withAssistantTurn(ANSWERS))).toBe(false);
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
      { role: 'assistant' as const, content: 'a1.\nAsk next: Old one | Old two' },
      { role: 'user' as const, content: 'q2' },
      { role: 'assistant' as const, content: 'a2.\nAsk next: New one | New two' },
    ];
    expect(isFreeFollowUp('Old one', history)).toBe(false);
    expect(isFreeFollowUp('New two', history)).toBe(true);
  });

  it('makes every option on a multi-choice answer line eligible, not just the first', () => {
    const history = withAssistantTurn(
      'Your chart shows steady growth.\nAsk next: Under ₹25,000 a month | ₹25,000 – 75,000 | Prefer not to say',
    );
    expect(isFreeFollowUp('Under ₹25,000 a month', history)).toBe(true);
    expect(isFreeFollowUp('Prefer not to say', history)).toBe(true);
    expect(isFreeFollowUp('What about my career?', history)).toBe(false);
  });
});
