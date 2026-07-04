import { describe, expect, it } from 'vitest';
import { buildChatMessages } from '../src/lib/swarm/agents/scholar.js';
import { newState } from '../src/lib/swarm/state.js';
import type { ChatPersona } from '../src/lib/chat-grounding.js';

function systemContent(persona: ChatPersona): string {
  const state = newState({ userId: 'u1', intent: 'chat', consent: true });
  const messages = buildChatMessages(state, 'hello', persona, []);
  return messages[0]!.content;
}

describe('scholar persona system prompts', () => {
  it('gives each persona a distinct system prompt', () => {
    const personas: ChatPersona[] = ['career', 'love', 'health', 'general'];
    const contents = personas.map((p) => systemContent(p));
    expect(new Set(contents).size).toBe(personas.length);
  });

  it('career persona has finance/trading caution', () => {
    const content = systemContent('career').toLowerCase();
    expect(content).toMatch(/stock|ticker/);
    expect(content).toContain('never recommend');
  });

  it('love persona has a marriage-specific directive', () => {
    const content = systemContent('love').toLowerCase();
    expect(content).toContain('marriage');
    expect(content).toContain('manglik');
  });

  it('general persona covers education, legal, parents, and remedies', () => {
    const content = systemContent('general').toLowerCase();
    expect(content).toContain('education');
    expect(content).toContain('legal');
    expect(content).toContain('parents');
    expect(content).toMatch(/remed/);
  });

  it('every persona caps follow-up deflection at one question before a definitive answer', () => {
    const personas: ChatPersona[] = ['career', 'love', 'health', 'general'];
    for (const persona of personas) {
      const content = systemContent(persona).toLowerCase();
      expect(content).toContain('one clarifying');
      expect(content).toContain('definitive answer');
    }
  });
});
