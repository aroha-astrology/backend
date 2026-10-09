import { describe, it, expect } from 'vitest';
import {
  ashtakavargaFacts,
  bhinnashtakavargaFacts,
  type PlanetFact,
} from '../src/lib/chat-grounding.js';

function rawSarva(bindusPerSign: number[]) {
  return { bindus: bindusPerSign, total: bindusPerSign.reduce((a, b) => a + b, 0) };
}

describe('chat-grounding: ashtakavargaFacts (reduced AV additive line)', () => {
  it('returns just the raw line when no reduced table is present (older kundlis)', () => {
    const bindus = new Array<number>(12).fill(28);
    const facts = ashtakavargaFacts({ sarva: rawSarva(bindus) }, 0);
    expect(facts).toHaveLength(1);
    expect(facts[0]).toContain('raw Sarvashtakavarga');
  });

  it('does not narrate the reduced table: the raw 25/30 bands do not fit counts that total about 85 (audit item A5)', () => {
    const rawBindus = new Array<number>(12).fill(28);
    // A typical reduced table: about 7 a sign. The old bands called every one of these a karmic-struggle zone.
    const reducedBindus = new Array<number>(12).fill(7);
    const facts = ashtakavargaFacts(
      { sarva: rawSarva(rawBindus), reduced: { sarva: rawSarva(reducedBindus) } },
      0,
    );
    expect(facts).toHaveLength(1);
    expect(facts.join(' ')).not.toContain('Reduced Ashtakavarga');
    expect(facts.join(' ')).not.toContain('Karmic-struggle');
    expect(facts.join(' ')).not.toContain('Power centers');
  });
});

const MOON_PLACEMENT: PlanetFact = {
  planet: 'Moon',
  sign: 'Aries',
  signIndex: 0,
  house: 1,
  nakshatra: 'Ashwini',
  nakshatraPada: 1,
  nakshatraLord: 'Ketu',
  longitude: 5,
};

describe('chat-grounding: bhinnashtakavargaFacts', () => {
  it('states the raw bindu count', () => {
    const bindus = new Array<number>(12).fill(3);
    bindus[0] = 6;
    const facts = bhinnashtakavargaFacts({ bhinna: [{ planet: 'Moon', bindus }] }, [
      MOON_PLACEMENT,
    ]);
    expect(facts).toHaveLength(1);
    expect(facts[0]).toContain('6 raw Bhinnashtakavarga bindus');
  });

  it('adds no verdict from the reduced table, which has a different scale from the 4-bindu rule of thumb', () => {
    const reducedBindus = new Array<number>(12).fill(0);
    reducedBindus[0] = 2;
    const facts = bhinnashtakavargaFacts(
      {
        bhinna: [{ planet: 'Moon', bindus: new Array<number>(12).fill(3) }],
        reduced: { bhinna: [{ planet: 'Moon', bindus: reducedBindus }] },
      },
      [MOON_PLACEMENT],
    );
    expect(facts[0]).not.toContain('Shodhana');
    expect(facts[0]).not.toContain('mandate');
  });
});
