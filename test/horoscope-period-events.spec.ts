import { describe, it, expect } from 'vitest';
import { periodEndDate } from '../src/lib/llm/horoscope.js';
import { periodEventFacts } from '../src/lib/chat-grounding.js';
import type { TransitEvent } from '../src/lib/astro-tools/transit-events.js';

describe('periodEndDate', () => {
  it('daily/tomorrow are single-day periods: end === forDate', () => {
    expect(periodEndDate('daily', '2026-08-05')).toBe('2026-08-05');
    expect(periodEndDate('tomorrow', '2026-08-05')).toBe('2026-08-05');
  });

  it('weekly spans exactly 7 days (forDate + 6)', () => {
    expect(periodEndDate('weekly', '2026-08-03')).toBe('2026-08-09');
  });

  it('monthly ends on the actual last day of that month, including leap Feb', () => {
    expect(periodEndDate('monthly', '2026-08-01')).toBe('2026-08-31');
    expect(periodEndDate('monthly', '2026-02-01')).toBe('2026-02-28');
    expect(periodEndDate('monthly', '2028-02-01')).toBe('2028-02-29'); // leap year
    expect(periodEndDate('monthly', '2026-04-01')).toBe('2026-04-30');
  });

  it('yearly ends December 31 of the same year', () => {
    expect(periodEndDate('yearly', '2026-01-01')).toBe('2026-12-31');
  });

  it('weekly correctly rolls over a month boundary', () => {
    expect(periodEndDate('weekly', '2026-08-28')).toBe('2026-09-03');
  });
});

function ingressEvent(overrides: Partial<TransitEvent> = {}): TransitEvent {
  return {
    planet: 'Mercury',
    eventType: 'ingress',
    fromSign: 'Gemini',
    toSign: 'Cancer',
    exactAt: new Date('2026-08-05T00:00:00Z'),
    forDate: '2026-08-05',
    weight: 20,
    ...overrides,
  };
}

describe('periodEventFacts', () => {
  it('returns no facts when there are no events', () => {
    expect(periodEventFacts([], 0)).toEqual([]);
  });

  it('describes an ingress with its house-from-Moon when the Moon sign is known', () => {
    // Cancer signIndex 3, natal Moon in Aries (0) -> house 4.
    const facts = periodEventFacts([ingressEvent()], 0);
    expect(facts).toHaveLength(1);
    expect(facts[0]).toContain('Mercury moves from Gemini into Cancer');
    expect(facts[0]).toContain('4th house');
  });

  it('omits the house note when natal Moon sign is unknown (null)', () => {
    const facts = periodEventFacts([ingressEvent()], null);
    expect(facts[0]).toContain('Mercury moves from Gemini into Cancer');
    expect(facts[0]).not.toContain('house from the Moon');
  });

  it('flags a station event with an "intensifies" callout, distinct from an ingress', () => {
    const facts = periodEventFacts(
      [
        ingressEvent({
          eventType: 'retrograde',
          fromSign: 'Leo',
          toSign: null,
          planet: 'Jupiter',
        }),
      ],
      0,
    );
    expect(facts[0]).toContain('Jupiter turns retrograde in Leo');
    expect(facts[0]).toContain('intensifies');
  });

  it('says "turns direct" for a direct station, not "turns retrograde"', () => {
    const facts = periodEventFacts(
      [ingressEvent({ eventType: 'direct', fromSign: 'Leo', toSign: null })],
      0,
    );
    expect(facts[0]).toContain('turns direct');
    expect(facts[0]).not.toContain('turns retrograde');
  });

  it('combines multiple events into ONE fact block instructing the model to narrate the arc', () => {
    const facts = periodEventFacts(
      [
        ingressEvent({ planet: 'Mercury' }),
        ingressEvent({ planet: 'Venus', forDate: '2026-08-12' }),
      ],
      0,
    );
    expect(facts).toHaveLength(1);
    expect(facts[0]).toContain('KEY EVENTS DURING THIS PERIOD');
    expect(facts[0]).toContain('Mercury');
    expect(facts[0]).toContain('Venus');
    expect(facts[0]).toMatch(/narrate the period's actual arc/i);
  });
});
