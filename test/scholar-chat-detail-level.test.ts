import { describe, it, expect } from 'vitest';
import { buildChatMessages } from '../src/lib/swarm/agents/scholar';
import { newState } from '../src/lib/swarm/state';

function state() {
  return newState({ requestId: 'test-req', userId: 'user-1', intent: 'chat', consent: true });
}

describe('buildChatMessages detail level', () => {
  it('defaults to the short direct-mode system prompt when detailLevel is omitted', () => {
    const messages = buildChatMessages(state(), 'Tell me about my career', []);
    expect(messages[0]!.content).toContain('under 90 words');
    expect(messages[0]!.content).not.toContain('500-900 words');
  });

  it('uses the long-form details-mode system prompt when detailLevel is "details"', () => {
    const messages = buildChatMessages(state(), 'Tell me about my career', [], false, 'details');
    expect(messages[0]!.content).toContain('500-900 words');
    expect(messages[0]!.content).not.toContain('under 90 words');
  });

  it('keeps the hedging-language rule shared across both modes', () => {
    const direct = buildChatMessages(state(), 'x', []);
    const details = buildChatMessages(state(), 'x', [], false, 'details');
    expect(direct[0]!.content).toContain('Never state outcomes as guaranteed certainties');
    expect(details[0]!.content).toContain('Never state outcomes as guaranteed certainties');
  });
});
