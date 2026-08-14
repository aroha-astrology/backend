import { describe, expect, it } from 'vitest';
import {
  isNudgeSunday,
  isFactBlocked,
  pickNudgeFact,
  validateFactNudgeCopy,
  getFactNudgeFallback,
  classifyFactHouses,
  matchTransitForPick,
  MAX_BODY_CHARS,
  MAX_TITLE_CHARS,
  WINDOW_HORIZON_DAYS,
  type FactCandidate,
  type NudgePick,
} from '../src/lib/llm/fact-nudge.js';

// All fixed instants below are UTC times that land at 11:30 IST on the
// intended IST calendar date (IST = UTC+5:30, so 11:30 IST = 06:00 UTC).
const ist = (isoDateUtc: string) => new Date(`${isoDateUtc}T06:00:00Z`);

describe('isNudgeSunday', () => {
  // August 2026 (IST) has 5 Sundays: 2, 9, 16, 23, 30.
  it('sends on the 1st Sunday of a 5-Sunday month', () => {
    expect(isNudgeSunday(ist('2026-08-02'))).toBe(true);
  });
  it('sends on the 3rd Sunday of a 5-Sunday month', () => {
    expect(isNudgeSunday(ist('2026-08-16'))).toBe(true);
  });
  it('skips the 2nd, 4th, and 5th Sundays', () => {
    expect(isNudgeSunday(ist('2026-08-09'))).toBe(false);
    expect(isNudgeSunday(ist('2026-08-23'))).toBe(false);
    expect(isNudgeSunday(ist('2026-08-30'))).toBe(false);
  });
  it('skips non-Sundays entirely', () => {
    expect(isNudgeSunday(ist('2026-08-03'))).toBe(false);
  });

  // February 2026 (IST): the 1st is a Sunday. Sundays fall on 1, 8, 15, 22.
  it('handles a month whose 1st day is itself the 1st Sunday', () => {
    expect(isNudgeSunday(ist('2026-02-01'))).toBe(true);
    expect(isNudgeSunday(ist('2026-02-15'))).toBe(true);
    expect(isNudgeSunday(ist('2026-02-08'))).toBe(false);
    expect(isNudgeSunday(ist('2026-02-22'))).toBe(false);
  });
});

describe('isFactBlocked', () => {
  it('blocks conception/gender-preference facts', () => {
    expect(isFactBlocked('Subhangi has two daughters and desires a son.')).toBe(true);
    expect(isFactBlocked('their conception window is 19 November 2026')).toBe(true);
  });

  it('blocks in-law and marital-discord facts', () => {
    expect(
      isFactBlocked(
        'Lalasa Sharma experiences strained relationships and a lack of affection from her in-laws.',
      ),
    ).toBe(true);
  });

  it('blocks job-loss facts', () => {
    expect(
      isFactBlocked('The user’s son is currently unemployed after losing his previous job'),
    ).toBe(true);
  });

  it('blocks any named third party even in a benign sentence', () => {
    expect(isFactBlocked('The user’s eldest son is a software engineer')).toBe(true);
    expect(isFactBlocked("Lalasa Sharma's husband has taken voluntary retirement")).toBe(true);
  });

  it('does not false-positive on words that merely contain a blocked substring', () => {
    // "person", "season", "reason" all contain "son" as a substring.
    expect(
      isFactBlocked('The user prefers a marriage with good reason and personal alignment.'),
    ).toBe(false);
  });

  it('allows a plain self-facing fact', () => {
    expect(isFactBlocked('Ayesha is actively planning to switch her job by September.')).toBe(
      false,
    );
    expect(
      isFactBlocked('PREVIOUSLY TOLD THEM: their marriage window is early 2027 to early 2028'),
    ).toBe(false);
  });
});

describe('pickNudgeFact', () => {
  const NOW = ist('2026-08-01');

  it('picks a dated window fact within the horizon (tier: window)', () => {
    const facts: FactCandidate[] = [
      { fact: "The user's name is Seema.", followUpQuestion: null },
      {
        fact: 'PREVIOUSLY TOLD THEM: the auspicious window for placing the matrimonial advertisement is Monday, August 10, 2026, between 9:30 AM and 11:00 AM.',
        followUpQuestion: 'Did you manage to place the advertisement during that time?',
      },
    ];
    const pick = pickNudgeFact(facts, NOW);
    expect(pick?.tier).toBe('window');
  });

  it('rejects a window fact whose date is outside the horizon', () => {
    const facts: FactCandidate[] = [
      {
        fact: `PREVIOUSLY TOLD THEM: their property purchase window is May to July 2027`,
        followUpQuestion: null,
      },
    ];
    expect(pickNudgeFact(facts, NOW)).toBeNull();
  });

  it('falls back to the most recent unanswered follow-up when no window qualifies', () => {
    const facts: FactCandidate[] = [
      { fact: 'Subir Dutta is currently seeking a romantic partner.', followUpQuestion: null },
      {
        fact: 'PREVIOUSLY TOLD THEM: their strongest window for finding a job is through October 22, 2026',
        followUpQuestion: 'Have you secured a new position within this window?',
      },
    ];
    const pick = pickNudgeFact(facts, NOW);
    expect(pick?.tier).toBe('followup');
    expect(pick?.followUpQuestion).toBe('Have you secured a new position within this window?');
  });

  it('skips a blocked window fact and a blocked follow-up, returning null', () => {
    const facts: FactCandidate[] = [
      {
        fact: 'PREVIOUSLY TOLD THEM: their conception window is 19 November 2026',
        followUpQuestion: null,
      },
      {
        fact: "The user's eldest son is a software engineer",
        followUpQuestion: 'What is the specific field or industry your son is targeting?',
      },
    ];
    expect(pickNudgeFact(facts, NOW)).toBeNull();
  });

  it('returns null for a user with nothing worth saying — silence is a valid outcome', () => {
    const facts: FactCandidate[] = [
      { fact: "The user's name is Shalini Praveen.", followUpQuestion: null },
    ];
    expect(pickNudgeFact(facts, NOW)).toBeNull();
  });

  it('prefers the most recent qualifying fact when several match', () => {
    const facts: FactCandidate[] = [
      { fact: 'User is married', followUpQuestion: 'How long have you been married?' },
      {
        fact: 'Ayesha has been married for 1.5 years.',
        followUpQuestion: 'How long have you and your partner been together?',
      },
    ];
    const pick = pickNudgeFact(facts, NOW);
    expect(pick?.fact).toBe('Ayesha has been married for 1.5 years.');
  });
});

describe('classifyFactHouses', () => {
  it('maps career language to the 10th house', () => {
    expect(classifyFactHouses('Subir is targeting the IT sector for his job search.')).toEqual([
      10,
    ]);
  });

  it('maps relationship language to the 7th house', () => {
    expect(classifyFactHouses('How long have you and your partner been together?')).toEqual([7]);
  });

  it('returns every house a topic plausibly touches, not just the first', () => {
    // "career" -> 10th, "certifications" -> 5th.
    expect(classifyFactHouses('Considering a career change via new certifications.')).toEqual([
      10, 5,
    ]);
  });

  it('returns empty for a topic with no mapped house', () => {
    expect(classifyFactHouses("The user's name is Shalini.")).toEqual([]);
  });
});

describe('matchTransitForPick', () => {
  const careerPick: NudgePick = {
    tier: 'followup',
    fact: 'Subir Dutta is specifically targeting the IT sector for his job search.',
    followUpQuestion: 'What specific roles or technical domains within the IT sector?',
  };

  it('picks the heaviest planet whose house (from the natal Moon) matches the topic', () => {
    // Moon in Aries: Capricorn is the 10th house (career) from Aries.
    const signs = [
      { planet: 'Mercury', sign: 'Capricorn' },
      { planet: 'Saturn', sign: 'Capricorn' },
    ];
    const result = matchTransitForPick(careerPick, 'Aries', signs);
    expect(result?.planet).toBe('Saturn');
    expect(result?.house).toBe(10);
  });

  it('returns null when no currently-transiting planet lands in a matching house', () => {
    // Moon in Aries: Aries itself is the 1st house, not career-relevant.
    const signs = [{ planet: 'Saturn', sign: 'Aries' }];
    expect(matchTransitForPick(careerPick, 'Aries', signs)).toBeNull();
  });

  it('returns null rather than guess when the reader has no chart', () => {
    expect(
      matchTransitForPick(careerPick, null, [{ planet: 'Saturn', sign: 'Capricorn' }]),
    ).toBeNull();
  });

  it('returns null when the fact topic maps to no house at all', () => {
    const namePick: NudgePick = {
      tier: 'followup',
      fact: "The user's name is Shalini.",
      followUpQuestion: 'Anything else?',
    };
    expect(
      matchTransitForPick(namePick, 'Aries', [{ planet: 'Saturn', sign: 'Capricorn' }]),
    ).toBeNull();
  });
});

describe('validateFactNudgeCopy', () => {
  const windowPick: NudgePick = {
    tier: 'window',
    fact: 'PREVIOUSLY TOLD THEM: their marriage window is early 2027 to early 2028',
    followUpQuestion: null,
  };

  const good = (body: string, title = 'Your window opens soon') => ({ title, body });

  it('accepts well-formed English copy', () => {
    expect(
      validateFactNudgeCopy(
        good('Your window opens this month. See what to prepare.'),
        'en',
        windowPick,
      ).ok,
    ).toBe(true);
  });

  it('rejects an over-length title or body', () => {
    expect(
      validateFactNudgeCopy(good('x'.repeat(MAX_BODY_CHARS + 1)), 'en', windowPick).reason,
    ).toContain('body-too-long');
    expect(
      validateFactNudgeCopy(good('fine', 'x'.repeat(MAX_TITLE_CHARS + 1)), 'en', windowPick).reason,
    ).toContain('title-too-long');
  });

  it('rejects Latin script when an Indic language was requested', () => {
    expect(validateFactNudgeCopy(good('Your window is here'), 'hi', windowPick).reason).toBe(
      'wrong-script:hi',
    );
  });

  it('rejects a hallucinated date not present in the source fact', () => {
    const result = validateFactNudgeCopy(
      good('Mark your calendar for 5 December 2026.'),
      'en',
      windowPick,
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('hallucinated-date');
  });

  it('accepts a date copied verbatim from the source fact', () => {
    const datedPick: NudgePick = {
      tier: 'window',
      fact: 'PREVIOUSLY TOLD THEM: their conception window is 19 November 2026',
      followUpQuestion: null,
    };
    // (This particular fact would itself be denylist-blocked before reaching
    // the LLM — this case only exercises the date-provenance check itself.)
    const result = validateFactNudgeCopy(
      good('Your window opens around 19 November 2026.'),
      'en',
      datedPick,
    );
    expect(result.reason).not.toBe('hallucinated-date');
  });

  it('rejects copy that names a family member, even if the model added it unprompted', () => {
    const result = validateFactNudgeCopy(
      good('Tell your husband the window is here.'),
      'en',
      windowPick,
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('blocked-topic');
  });

  it('rejects empty output', () => {
    expect(validateFactNudgeCopy(good(''), 'en', windowPick).reason).toBe('empty-body');
  });
});

describe('getFactNudgeFallback', () => {
  it('returns fallback copy within the length limits for every supported language and tier', () => {
    const langs = ['en', 'hi', 'bn', 'mr', 'te', 'ta', 'gu'] as const;
    for (const lang of langs) {
      for (const tier of ['window', 'followup'] as const) {
        const copy = getFactNudgeFallback(tier, lang);
        expect(copy.title.length).toBeLessThanOrEqual(MAX_TITLE_CHARS);
        expect(copy.body.length).toBeLessThanOrEqual(MAX_BODY_CHARS);
      }
    }
  });
});

// Sanity check on the horizon constant the window-fact tests above assume.
describe('WINDOW_HORIZON_DAYS', () => {
  it('is 45 days', () => {
    expect(WINDOW_HORIZON_DAYS).toBe(45);
  });
});
