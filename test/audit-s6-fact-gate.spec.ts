import { describe, it, expect } from 'vitest';
import { shouldExtractFacts } from '../src/lib/chat-fact-gate.js';

// Audit Sprint 6, O4: the per-turn "remember this about the reader" call runs after every chat turn
// (2,165 calls in 30 days). It does two jobs, so the gate must keep both:
//   1. store durable personal details the reader states;
//   2. record a dated timing the REPLY committed to ("PREVIOUSLY TOLD THEM: ... October 2026").
// An English keyword list cannot judge other languages, so only English-locale exchanges can be skipped.

const GENERIC =
  'Your Moon in Leo gives you warmth and a natural wish to lead. Keep to your routine.';

describe('shouldExtractFacts: skips only what carries nothing to remember', () => {
  it('skips a plain chart question with a plain answer', () => {
    expect(shouldExtractFacts('What does my Moon in Leo mean?', GENERIC, 'en')).toBe(false);
    expect(shouldExtractFacts('How is Saturn affecting me right now?', GENERIC, 'en')).toBe(false);
    expect(shouldExtractFacts('which mantra is good for Mondays', GENERIC, 'en')).toBe(false);
  });

  it('extracts when the reader states something about their life', () => {
    expect(shouldExtractFacts('I got a new job last month, is it good?', GENERIC, 'en')).toBe(true);
    expect(shouldExtractFacts('My wife is expecting in spring', GENERIC, 'en')).toBe(true);
    expect(shouldExtractFacts('we are planning to buy a flat', GENERIC, 'en')).toBe(true);
    expect(shouldExtractFacts('I am divorced and worried', GENERIC, 'en')).toBe(true);
    expect(shouldExtractFacts('my son has his exam next week', GENERIC, 'en')).toBe(true);
  });

  it('extracts when the reply names a dated timing, even if the question was plain', () => {
    expect(
      shouldExtractFacts('When will I get a job?', 'A good window opens from March 2027.', 'en'),
    ).toBe(true);
    expect(shouldExtractFacts('When?', 'Look at 2028 for the turn.', 'en')).toBe(true);
    expect(shouldExtractFacts('Next step?', 'Late September is favourable.', 'en')).toBe(true);
  });

  it('does not mistake small numbers for a date', () => {
    expect(
      shouldExtractFacts('How long should I chant?', 'Chant 108 times for 21 days.', 'en'),
    ).toBe(false);
  });

  it('understands roman Hindi and Bengali first-person words', () => {
    expect(shouldExtractFacts('meri naukri chhut gayi', GENERIC, 'en')).toBe(true);
    expect(shouldExtractFacts('mujhe bahut tension hai', GENERIC, 'en')).toBe(true);
    expect(shouldExtractFacts('amar biye kobe hobe', GENERIC, 'en')).toBe(true);
  });

  it('always extracts for a long message, which usually carries a story', () => {
    expect(shouldExtractFacts('Please explain Jupiter. '.repeat(15), GENERIC, 'en')).toBe(true);
  });

  it('never skips outside English, where an English word list cannot judge', () => {
    expect(shouldExtractFacts('मेरी शादी कब होगी', GENERIC, 'hi')).toBe(true);
    expect(shouldExtractFacts('¿Qué significa mi Luna en Leo?', GENERIC, 'es')).toBe(true);
    expect(shouldExtractFacts('Was bedeutet mein Mond?', GENERIC, 'de')).toBe(true);
    // Even an English-looking message in a non-English locale: the reader chose that language.
    expect(shouldExtractFacts('What does my Moon mean?', GENERIC, 'fr')).toBe(true);
  });

  it('extracts when the text is not in Latin letters even under the English locale', () => {
    expect(shouldExtractFacts('मेरी शादी कब होगी', GENERIC, 'en')).toBe(true);
  });

  it('reads Devanagari digits in a reply as a year', () => {
    expect(shouldExtractFacts('When?', 'सन २०२७ में अवसर है', 'en')).toBe(true);
  });

  it('an empty message carries nothing', () => {
    expect(shouldExtractFacts('   ', GENERIC, 'en')).toBe(false);
  });
});

// The extractor also saves goals and concerns, and people voice those as questions, not statements.
// A question about a life area is worth the call even when the reply names no date.
describe('shouldExtractFacts: a question about a life area can carry a goal or a concern', () => {
  const NO_DATE =
    'Stay patient and keep to a steady routine; the chart supports slow, careful progress.';

  it('extracts for questions about health, work, family, money, marriage and study', () => {
    for (const q of [
      'Will my health improve?',
      'Should I leave my job?',
      'Will I have a baby soon?',
      'Is it a good time to invest in stocks?',
      'Is my marriage going to work out?',
      'How will my exams go?',
      'Is moving abroad a good idea for me?',
    ]) {
      expect(shouldExtractFacts(q, NO_DATE, 'en'), q).toBe(true);
    }
  });

  it('still skips a pure chart or practice question', () => {
    for (const q of [
      'What does my Moon in Leo mean?',
      'How is Saturn affecting me right now?',
      'which mantra is good for Mondays',
      'What is a nakshatra?',
      'Explain Rahu and Ketu simply',
    ]) {
      expect(shouldExtractFacts(q, NO_DATE, 'en'), q).toBe(false);
    }
  });
});
