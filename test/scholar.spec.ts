import { describe, expect, it } from 'vitest';
import { buildChatMessages } from '../src/lib/swarm/agents/scholar.js';
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

  it('has a mandatory doctor disclaimer and never-diagnose rule', () => {
    const content = systemContent().toLowerCase();
    expect(content).toContain('consult a doctor');
    expect(content).toMatch(/never (name a disease|diagnose)/);
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
