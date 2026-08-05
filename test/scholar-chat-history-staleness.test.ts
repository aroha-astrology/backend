import { describe, it, expect } from 'vitest';
import { buildChatMessages } from '../src/lib/swarm/agents/scholar';
import { newState } from '../src/lib/swarm/state';

function state() {
  return newState({ requestId: 'test-req', userId: 'user-1', intent: 'chat', consent: true });
}

describe('buildChatMessages history staleness', () => {
  it('warns the model when resuming a session whose last activity was days ago', () => {
    const s = state();
    const now = new Date('2026-07-29T12:00:00Z');
    s.chatContext = {
      history: [
        { role: 'user', content: 'What does my week look like?' },
        {
          role: 'assistant',
          content: 'Today is Wednesday, May 22, 2024. Your Moon transit for the next seven days...',
        },
      ],
      summary: '',
      lastActivityAt: new Date('2024-05-22T12:00:00Z'),
    };

    const messages = buildChatMessages(s, 'What about now?', [], false, 'en', [], now);

    const note = messages.find((m) => m.role === 'system' && /previous session/i.test(m.content));
    expect(note).toBeDefined();
    expect(note!.content).toMatch(/TEMPORAL_ANCHOR/);

    // Must sit AFTER the replayed history and BEFORE the new user message —
    // proximity to the point of generation is what makes this instruction
    // actually override a stale in-context date claim (same lesson as the
    // locale-directive fix in this same file).
    const historyIdx = messages.findIndex((m) => m.content.includes('May 22, 2024'));
    const noteIdx = messages.indexOf(note!);
    const userIdx = messages.findIndex((m) => m.role === 'user' && m.content === 'What about now?');
    expect(historyIdx).toBeGreaterThanOrEqual(0);
    expect(noteIdx).toBeGreaterThan(historyIdx);
    expect(noteIdx).toBeLessThan(userIdx);
  });

  it('does not add a staleness note when the session was active earlier the same day', () => {
    const s = state();
    const now = new Date('2026-07-29T12:00:00Z');
    s.chatContext = {
      history: [
        { role: 'user', content: 'Hi' },
        { role: 'assistant', content: 'Hello!' },
      ],
      summary: '',
      lastActivityAt: new Date('2026-07-29T09:00:00Z'),
    };

    const messages = buildChatMessages(s, 'Follow-up', [], false, 'en', [], now);
    const note = messages.find((m) => m.role === 'system' && /previous session/i.test(m.content));
    expect(note).toBeUndefined();
  });

  it('does not add a staleness note for a brand-new session with no prior activity', () => {
    const messages = buildChatMessages(state(), 'Hello', []);
    const note = messages.find((m) => m.role === 'system' && /previous session/i.test(m.content));
    expect(note).toBeUndefined();
  });

  it('still carries the explicit current date via TEMPORAL_ANCHOR after removing the redundant pre-user reminder', () => {
    const now = new Date('2026-07-31T12:00:00Z');
    const messages = buildChatMessages(state(), 'Hello', [], false, 'en', [], now);
    const anchor = messages.find((m) => m.role === 'system' && /TEMPORAL_ANCHOR/.test(m.content));
    expect(anchor).toBeDefined();
    expect(anchor!.content).toMatch(/July 31, 2026/);

    // The regression: a bare "[URGENT SYSTEM REMINDER]" pushed as the last
    // system message right before the user turn out-ranked GROUNDING_INSTRUCTION
    // and CONTEXT_DISCIPLINE, causing the model to ask for birth details it
    // already had. Must not come back.
    const lastSystem = [...messages].reverse().find((m) => m.role === 'system');
    expect(lastSystem!.content).not.toMatch(/URGENT SYSTEM REMINDER/);
  });
});
