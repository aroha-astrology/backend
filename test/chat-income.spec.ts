import { describe, expect, it } from 'vitest';
import {
  expandIncomeMarkers,
  matchIncomeReply,
  INCOME_LABEL_TABLES,
} from '../src/lib/chat-income.js';

describe('chat income brackets', () => {
  it('round-trips: an expanded option, tapped verbatim, resolves back to its column and code', () => {
    // The whole mechanism rests on this: the options the user sees are generated
    // from the same table that reads the tap back, so a chip tap is an exact
    // match rather than a guess at what the model wrote.
    for (const option of expandIncomeMarkers('{{income}}').split(' | ')) {
      expect(matchIncomeReply(option)?.field).toBe('incomeBracket');
    }
    for (const option of expandIncomeMarkers('{{family_income}}').split(' | ')) {
      expect(matchIncomeReply(option)?.field).toBe('familyIncomeBracket');
    }
  });

  it('stores distinct codes per bracket and marks a declined answer', () => {
    expect(matchIncomeReply('Under ₹25,000 a month')).toEqual({
      field: 'incomeBracket',
      bracket: 'under_25k',
    });
    expect(matchIncomeReply('Prefer not to say')).toEqual({
      field: 'incomeBracket',
      bracket: 'undisclosed',
    });
  });

  it('ignores typed prose that merely mentions money', () => {
    // Only an exact option tap writes the column — nothing the user freely typed
    // gets quietly classified into a demographic bucket.
    expect(matchIncomeReply('I earn about 40k a month')).toBeNull();
    expect(matchIncomeReply('will my income grow?')).toBeNull();
  });

  it('offers the ranges in the chat language, and still resolves a tap from any of them', () => {
    // Chips are UI text the user reads: an English-only table would put English
    // ranges under a Bengali reply. Matching scans every language so a tap
    // resolves even if the app language changed between question and answer.
    const bengali = expandIncomeMarkers('{{income}}', 'bn').split(' | ');
    expect(bengali[0]).not.toBe(expandIncomeMarkers('{{income}}', 'en').split(' | ')[0]);
    expect(matchIncomeReply(bengali[0]!)).toEqual({
      field: 'incomeBracket',
      bracket: 'under_25k',
    });
    // Unknown/absent locale falls back to English rather than leaving the token in.
    expect(expandIncomeMarkers('{{income}}', 'fr')).toBe(expandIncomeMarkers('{{income}}', 'en'));
  });

  it('keeps every language table parallel to its code list', () => {
    // A short array in one language would silently map that language's taps to
    // the wrong bracket — the kind of thing nobody notices until the admin
    // numbers are already wrong.
    const { PERSONAL_LABELS, FAMILY_LABELS, PERSONAL_CODES, FAMILY_CODES } = INCOME_LABEL_TABLES;
    for (const labels of Object.values(PERSONAL_LABELS)) {
      expect(labels).toHaveLength(PERSONAL_CODES.length);
    }
    for (const labels of Object.values(FAMILY_LABELS)) {
      expect(labels).toHaveLength(FAMILY_CODES.length);
    }
    // No label may mean two different things across the personal/household sets.
    const all = [...Object.values(PERSONAL_LABELS).flat(), ...Object.values(FAMILY_LABELS).flat()];
    for (const label of all) {
      expect(matchIncomeReply(label)).not.toBeNull();
    }
  });

  it('leaves a suggestion line without markers untouched', () => {
    expect(expandIncomeMarkers('Ask next: What remedy helps?')).toBe(
      'Ask next: What remedy helps?',
    );
  });
});
