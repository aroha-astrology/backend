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
  const messages = buildChatMessages(state, 'hello', [], false, 'direct', 'en', userFacts);
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

  it('scopes the name exception to the opening line only, without loosening PERSONAL_TOUCH for the rest of the call', () => {
    const content = buildVoiceSystemInstruction({ groundingFacts: [], displayName: 'Priya' });
    expect(content).toContain('Never address the user by name');
    expect(content).toContain('the one and only exception');
  });
});
