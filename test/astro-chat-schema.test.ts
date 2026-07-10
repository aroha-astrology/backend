import { describe, it, expect } from 'vitest';
import { ChatRequestSchema, ChatHistoryTurnSchema } from '../src/modules/astro/astro.schemas';

describe('ChatRequestSchema detailLevel', () => {
  it('defaults detailLevel to "direct" when omitted', () => {
    const parsed = ChatRequestSchema.parse({ message: 'hi' });
    expect(parsed.detailLevel).toBe('direct');
  });

  it('accepts detailLevel "details"', () => {
    const parsed = ChatRequestSchema.parse({ message: 'hi', detailLevel: 'details' });
    expect(parsed.detailLevel).toBe('details');
  });

  it('rejects an invalid detailLevel value', () => {
    expect(() => ChatRequestSchema.parse({ message: 'hi', detailLevel: 'verbose' })).toThrow();
  });
});

describe('ChatHistoryTurnSchema content cap', () => {
  it('accepts a long Details-mode reply up to 8000 chars', () => {
    const content = 'a'.repeat(8000);
    expect(() => ChatHistoryTurnSchema.parse({ role: 'assistant', content })).not.toThrow();
  });

  it('rejects content over 8000 chars', () => {
    const content = 'a'.repeat(8001);
    expect(() => ChatHistoryTurnSchema.parse({ role: 'assistant', content })).toThrow();
  });
});
