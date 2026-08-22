import { describe, expect, it } from 'vitest';
import {
  containsLegalRefusalFraming,
  getCannedDeathResponse,
  getNeutralDecline,
} from '../src/lib/content-policy.js';

const LANGS = ['en', 'hi', 'bn', 'ta', 'te', 'mr', 'gu'];

describe('legal-refusal leak detector', () => {
  it('trips on the death canned line in every supported language', () => {
    for (const lang of LANGS) {
      expect(containsLegalRefusalFraming(getCannedDeathResponse(lang))).toBe(true);
    }
  });

  it('trips on the paraphrases seen in production', () => {
    // Real leaks: a name change for luck at online games, and a question about
    // a partner's appearance — neither is a death topic, both got this line.
    expect(
      containsLegalRefusalFraming(
        "I'm so sorry — we know, but we can't share that. It's against the law.",
      ),
    ).toBe(true);
    expect(containsLegalRefusalFraming('That is illegal, so I cannot help.')).toBe(true);
    expect(containsLegalRefusalFraming('Sharing that would be contrary to the law here.')).toBe(
      true,
    );
  });

  it('does not trip on ordinary astrology replies, legal questions included', () => {
    for (const reply of [
      'Your Venus period supports marriage from mid-2027 onward.',
      "I'm not a lawyer, but your chart favours settling the property case after March.",
      'The 6th house shows litigation — legal matters ease once Saturn moves on.',
      'Jupiter transits your 9th house next spring, a strong window for study abroad.',
    ]) {
      expect(containsLegalRefusalFraming(reply)).toBe(false);
    }
  });

  it('offers a fallback decline that makes no legal claim', () => {
    for (const lang of LANGS) {
      const line = getNeutralDecline(lang);
      expect(line.length).toBeGreaterThan(0);
      expect(containsLegalRefusalFraming(line)).toBe(false);
    }
  });
});
