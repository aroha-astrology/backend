import { describe, expect, it } from 'vitest';
import { chatPricingFact } from '../src/lib/chat-pricing.js';

describe('chatPricingFact', () => {
  it('states the per-question wallet price, and that it is not per minute', () => {
    const fact = chatPricingFact(800, 'wallet');
    expect(fact).toContain('yes, it is paid');
    expect(fact).toContain('each question the user sends costs ₹8,');
    expect(fact).toContain('per question asked, never per minute');
  });

  it('follows the resolved price rather than a fixed ₹8', () => {
    expect(chatPricingFact(2000, 'wallet')).toContain('costs ₹20,');
    expect(chatPricingFact(850, 'wallet')).toContain('costs ₹8.50,');
  });

  it('reads as the normal price after a free follow-up tap (nothing charged this turn)', () => {
    expect(chatPricingFact(800, null)).toBe(chatPricingFact(800, 'wallet'));
  });

  it('says a Pass or a question pack covers the question, with the price after it runs out', () => {
    expect(chatPricingFact(800, 'pass')).toMatch(/Aroha Pass.*once that is used up.*₹8/);
    expect(chatPricingFact(800, 'credits')).toMatch(/question pack.*once that is used up.*₹8/);
  });

  it('says free only when the user really is not charged', () => {
    expect(chatPricingFact(800, 'free')).toBe('CHAT PRICING: questions are free for this user.');
    expect(chatPricingFact(0, null)).toBe('CHAT PRICING: questions are free for this user.');
  });
});
