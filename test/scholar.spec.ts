import { describe, expect, it } from 'vitest';
import {
  buildChatMessages,
  buildVoiceSystemInstruction,
  type UserFact,
} from '../src/lib/swarm/agents/scholar.js';
import { newState } from '../src/lib/swarm/state.js';

function systemContent(groundingFacts: string[] = [], birthTimeUnknown = false): string {
  const state = newState({ userId: 'u1', intent: 'chat', consent: true });
  const messages = buildChatMessages(state, 'hello', groundingFacts, birthTimeUnknown);
  return messages[0]!.content;
}

function astroContextContent(groundingFacts: string[] = [], birthTimeUnknown = false): string {
  const state = newState({ userId: 'u1', intent: 'chat', consent: true });
  const messages = buildChatMessages(state, 'hello', groundingFacts, birthTimeUnknown);
  return messages[1]!.content;
}

function allContent(userFacts: UserFact[]): string {
  const state = newState({ userId: 'u1', intent: 'chat', consent: true });
  const messages = buildChatMessages(state, 'hello', [], false, 'en', userFacts);
  return messages.map((m) => m.content).join('\n---\n');
}

function allContentWithName(displayName: string | null | undefined): string {
  const state = newState({ userId: 'u1', intent: 'chat', consent: true });
  const messages = buildChatMessages(state, 'hello', [], false, 'en', [], new Date(), displayName);
  return messages.map((m) => m.content).join('\n---\n');
}

describe('scholar single-astrologer system prompt', () => {
  it('has finance/trading caution', () => {
    const content = systemContent().toLowerCase();
    expect(content).toMatch(/stock|ticker/);
    expect(content).toMatch(/never\s+recommend/);
  });

  it('has a marriage-specific directive', () => {
    const content = systemContent().toLowerCase();
    expect(content).toContain('marriage');
    expect(content).toContain('manglik');
  });

  it('has a medical caveat and a no-clinical-diagnosis guardrail for health', () => {
    const content = systemContent().toLowerCase();
    expect(content).toMatch(/not a medical professional|not a doctor/);
    expect(content).toContain('doctor');
    expect(content).toMatch(/clinical diagnosis|prescrib|medication/);
  });

  it('covers accident/physical-safety questions instead of deflecting', () => {
    const content = systemContent().toLowerCase();
    expect(content).toContain('accident');
    expect(content).toMatch(/6th house|8th house|physical safety/);
    expect(content).toMatch(/do not deflect|never deflect|not deflect/);
  });

  it('answers directly and uses an upfront professional caveat rather than refusing', () => {
    const content = systemContent().toLowerCase();
    expect(content).toContain("i'm not a doctor");
    expect(content).toContain("i'm not a lawyer");
  });

  it('bans "astrology cannot/does not predict" as a hedging opener', () => {
    const content = systemContent().toLowerCase();
    expect(content).toMatch(/never open a reply with meta-commentary/);
    expect(content).toContain('does not predict in the literal sense');
  });

  it('points accident timing at real computed window facts instead of inventing one', () => {
    const content = systemContent();
    expect(content).toContain('Health Vigilance Required');
    expect(content).toContain('Active Major Planetary Period');
    expect(content.toLowerCase()).toMatch(/never invent a date range/);
  });

  it('bans plain-text pseudo-headers in Direct mode, not just markdown ones', () => {
    const content = systemContent().toLowerCase();
    expect(content).toMatch(/without asterisks or a hash mark|no markdown at all/);
  });

  it('demands the same warm human tone on every reply regardless of topic', () => {
    const content = systemContent().toLowerCase();
    expect(content).toMatch(/exact same warm, human, conversational voice/);
    expect(content).toMatch(/consistency of tone/);
  });

  it('covers education, legal, parents, and remedies', () => {
    const content = systemContent().toLowerCase();
    expect(content).toContain('education');
    expect(content).toContain('legal');
    expect(content).toContain('parents');
    expect(content).toMatch(/remed/);
  });

  it('caps follow-up deflection at one question before a definitive answer', () => {
    const content = systemContent().toLowerCase();
    expect(content).toContain('one clarifying');
    expect(content).toContain('definitive answer');
  });

  it('is a single, persona-free system prompt regardless of the grounding facts passed in', () => {
    const withFacts = systemContent(['Ascendant: Aries']);
    const withoutFacts = systemContent([]);
    expect(withFacts).toBe(withoutFacts);
  });

  it('makes computed chart data authoritative over a conflicting user claim about their own placements', () => {
    // Part of the 2026-08-11 architecture-hardening pass: GROUNDING_INSTRUCTION already banned
    // the MODEL inventing chart facts, but nothing said what to do when the USER states one that
    // conflicts with the computed data (e.g. "my Mars is in Leo" against a chart showing Cancer).
    const content = systemContent().toLowerCase();
    expect(content).toMatch(/authoritative source for the user'?s own placements/);
    expect(content).toMatch(/do not silently agree|never silently adopt/);
  });

  it('explicitly allows eclipse/grahan, graha, and deity/mythology questions instead of deflecting them as off-topic trivia', () => {
    // Regression pin for the 2026-08-12 bug: "when is next solar eclipse" got the
    // death-policy refusal because nothing in the prompt granted permission to
    // answer sky-event/lore questions, so the model routed them into the "off-topic
    // trivia" deflection. This asserts the carve-out exists and is NOT off-topic.
    const content = systemContent().toLowerCase();
    expect(content).toMatch(/eclipse|grahan/);
    expect(content).toMatch(/deit(y|ies)/);
    expect(content).toMatch(/not off-topic|are not off-topic/);
  });

  it('cites dated sky-event grounding facts (e.g. the next eclipse) the same way it cites chart data', () => {
    const content = systemContent().toLowerCase();
    expect(content).toMatch(/dated sky events?/);
  });
});

describe('scholar chart-data fallback copy', () => {
  it('uses the "still generating" fallback when birthTimeUnknown is false', () => {
    const content = astroContextContent([], false);
    expect(content).toContain("hasn't finished generating");
    expect(content).not.toContain("don't know their exact birth time");
  });

  it('uses the "will never be ready" fallback when birthTimeUnknown is true', () => {
    const content = astroContextContent([], true);
    expect(content).toContain("don't know their exact birth time");
    expect(content).not.toContain("hasn't finished generating");
  });

  it('injects the provided grounding facts instead of a fallback when facts are present', () => {
    const content = astroContextContent(['Ascendant: Aries', 'Active Dasha: Jupiter Mahadasha']);
    expect(content).toContain('CHART DATA:');
    expect(content).toContain('Ascendant: Aries');
    expect(content).toContain('Active Dasha: Jupiter Mahadasha');
  });
});

describe('scholar user facts and open follow-ups', () => {
  it('omits both the <user_facts> and <open_follow_ups> blocks when there are no stored facts', () => {
    const content = allContent([]);
    expect(content).not.toContain('<user_facts>');
    expect(content).not.toContain('<open_follow_ups>');
  });

  it('lists every fact as a bullet inside <user_facts>, labeled as untrusted reference DATA', () => {
    const content = allContent([
      { fact: 'Has an eldest son', followUpQuestion: null },
      { fact: 'Is married', followUpQuestion: 'When did they get married?' },
    ]);
    expect(content).toContain('reference DATA only');
    expect(content).toContain('<user_facts>');
    expect(content).toContain('- Has an eldest son');
    expect(content).toContain('- Is married');
    expect(content).toContain('</user_facts>');
  });

  it('omits <open_follow_ups> entirely when no fact has a followUpQuestion', () => {
    const content = allContent([
      { fact: 'Has an eldest son', followUpQuestion: null },
      { fact: 'Born in Delhi', followUpQuestion: null },
    ]);
    expect(content).not.toContain('<open_follow_ups>');
  });

  it('lists only the non-null followUpQuestions inside <open_follow_ups>, labeled as untrusted reference DATA', () => {
    const content = allContent([
      { fact: 'Has an eldest son', followUpQuestion: null },
      {
        fact: 'Planning to conceive 2-3 months after starting a new job',
        followUpQuestion: 'Did the new job start yet?',
      },
      { fact: 'Is married', followUpQuestion: 'When did they get married?' },
    ]);
    expect(content).toContain('<open_follow_ups>');
    expect(content).toContain('- Did the new job start yet?');
    expect(content).toContain('- When did they get married?');
    expect(content).toContain('</open_follow_ups>');
    // Not tied to a fact that had no follow-up.
    const followUpBlock = content.split('<open_follow_ups>')[1]!.split('</open_follow_ups>')[0]!;
    expect(followUpBlock).not.toContain('Has an eldest son');
  });

  it('tells the model the follow-up shares the existing one-clarifying-question-per-turn budget, not an extra allowance', () => {
    const content = systemContent();
    expect(content.toLowerCase()).toMatch(/open follow-up/);
    expect(content.toLowerCase()).toMatch(/not an additional allowance|same budget|counts toward/);
  });
});

describe('scholar voice call-connected greeting', () => {
  it('instructs the model to greet by name when a displayName is given', () => {
    const content = buildVoiceSystemInstruction({ groundingFacts: [], displayName: 'Priya' });
    expect(content).toContain('[[CALL_CONNECTED]]');
    expect(content).toContain('Radhe Radhe, Priya!');
  });

  it('falls back to a nameless greeting when no displayName is given', () => {
    const content = buildVoiceSystemInstruction({ groundingFacts: [] });
    expect(content).toContain('Radhe Radhe!');
    expect(content).not.toContain('Radhe Radhe,');
  });

  it('tells the model to use the name sparingly for the rest of the call, not repeat it in every reply', () => {
    // PERSONAL_TOUCH now permits the name sparingly throughout (not just this
    // opening line) — this asserts the call-connected instruction still
    // steers AWAY from over-using it after the scripted greeting.
    const content = buildVoiceSystemInstruction({ groundingFacts: [], displayName: 'Priya' });
    expect(content).toContain("don't repeat the name in every reply");
  });
});

describe('scholar text-chat displayName (PERSONAL_TOUCH)', () => {
  it('tells the model the name when displayName is given', () => {
    const content = allContentWithName('Priya');
    expect(content).toContain('The user\'s name is "Priya"');
  });

  it('says nothing about a name when none is given', () => {
    // The rule text itself says "If the user's name is known..." regardless —
    // check for the specific injected fact message, not that phrase.
    expect(allContentWithName(undefined)).not.toContain('The user\'s name is "');
    expect(allContentWithName(null)).not.toContain('The user\'s name is "');
  });

  it('permits sparing use of the name rather than banning it outright', () => {
    const content = systemContent();
    expect(content.toLowerCase()).toContain('sparingly');
    // The old absolute ban must be gone — text chat can now use the name,
    // same as voice already could.
    expect(content).not.toContain('Never address the user by name');
  });

  it('still forbids inventing or claiming a name when none is on file', () => {
    const content = systemContent();
    expect(content.toLowerCase()).toMatch(/never invent one|claim to know it/);
  });
});
