import { describe, it, expect } from 'vitest';
import { synthesisFacts } from '../src/lib/chat-grounding.js';
import type { DailySynthesisResult } from '../src/lib/astro-tools/daily-synthesis.js';

function baseSynthesis(overrides: Partial<DailySynthesisResult> = {}): DailySynthesisResult {
  return {
    date: '2026-08-01',
    score: 3,
    scoreBand: { floor: 1, ceiling: 5 },
    scoreReasoning: [],
    dashaTransit: {},
    vedha: { blockedCount: 0, details: [] },
    kakshya: undefined,
    lunar: undefined,
    doubleTransit: [],
    panchaka: undefined,
    savTransit: {},
    ...overrides,
  };
}

describe('chat-grounding: synthesisFacts', () => {
  it('returns no facts when synthesis is null/undefined (no jargon leaks, no crash)', () => {
    expect(synthesisFacts(null)).toEqual([]);
    expect(synthesisFacts(undefined)).toEqual([]);
  });

  it('always leads with the deterministic score as the authority the model must respect', () => {
    const facts = synthesisFacts(baseSynthesis({ score: 4 }));
    expect(facts[0]).toContain('DETERMINISTIC DAILY SCORE');
    expect(facts[0]).toContain('4/5');
  });

  it('surfaces the score-band reasoning chain as its own fact, right after the score', () => {
    const facts = synthesisFacts(
      baseSynthesis({
        scoreReasoning: [
          'Mahadasha lord Saturn is debilitated, setting this range to 1.0-3.0.',
          'Transits place the day at 80% through that range, giving a final score of 3/5.',
        ],
      }),
    );
    expect(facts[1]).toContain('SCORE REASONING');
    expect(facts[1]).toContain('debilitated');
    expect(facts[1]).toContain('1.0-3.0');
  });

  it('omits the reasoning fact when the chain is empty', () => {
    const facts = synthesisFacts(baseSynthesis({ scoreReasoning: [] }));
    expect(facts.some((f) => f.startsWith('SCORE REASONING'))).toBe(false);
  });

  it('surfaces the Mahadasha/Antardasha lord dignity in plain-language-adjacent form', () => {
    const facts = synthesisFacts(
      baseSynthesis({
        dashaTransit: {
          mahadasha: {
            planet: 'Saturn',
            transitSign: 'Capricorn',
            dignity: 'own',
            qualityScore: 4,
            description: 'Saturn is in its own sign',
          },
          antardasha: {
            planet: 'Mercury',
            transitSign: 'Gemini',
            dignity: 'own',
            qualityScore: 4,
            description: 'Mercury is in its own sign',
          },
        },
      }),
    );
    expect(facts.some((f) => f.includes('Saturn') && f.includes('major life-period lord'))).toBe(
      true,
    );
    expect(facts.some((f) => f.includes('Mercury') && f.includes('minor life-period lord'))).toBe(
      true,
    );
  });

  it('flags obstructed (Vedha) transits when any are blocked', () => {
    const facts = synthesisFacts(baseSynthesis({ vedha: { blockedCount: 2, details: [] } }));
    expect(facts.some((f) => f.includes('2') && f.includes('obstructed'))).toBe(true);
  });

  it('omits the Vedha fact entirely when nothing is blocked', () => {
    const facts = synthesisFacts(baseSynthesis({ vedha: { blockedCount: 0, details: [] } }));
    expect(facts.some((f) => f.toLowerCase().includes('vedha'))).toBe(false);
  });

  it('surfaces Kakshya quality when present', () => {
    const facts = synthesisFacts(
      baseSynthesis({ kakshya: { quality: 'good', activeBindus: 5, total: 7 } }),
    );
    expect(
      facts.some((f) => f.includes('Kakshya') && f.includes('good') && f.includes('5/7')),
    ).toBe(true);
  });

  it('surfaces double-transit windows with the affected houses', () => {
    const facts = synthesisFacts(
      baseSynthesis({
        doubleTransit: [
          { house: 5, sign: 'Leo', jupiterAspects: true, saturnAspects: true },
          { house: 9, sign: 'Sagittarius', jupiterAspects: true, saturnAspects: true },
        ],
      }),
    );
    expect(facts.some((f) => f.includes('Jupiter and Saturn') && f.includes('5, 9'))).toBe(true);
  });

  it('surfaces a Panchaka caution only when isDangerous is true', () => {
    const danger = synthesisFacts(
      baseSynthesis({
        panchaka: {
          isDangerous: true,
          name: 'Agni Panchaka',
          danger: 'fire risk',
          safe: 'indoor work',
        },
      }),
    );
    expect(danger.some((f) => f.includes('Agni Panchaka') && f.includes('fire risk'))).toBe(true);

    const safe = synthesisFacts(baseSynthesis({ panchaka: { isDangerous: false } }));
    expect(safe.some((f) => f.includes('Panchaka'))).toBe(false);
  });
});
