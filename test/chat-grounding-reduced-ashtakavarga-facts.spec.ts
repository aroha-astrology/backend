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

  it('adds a second reduced-AV line, using the audit power-center/karmic-struggle bands', () => {
    const rawBindus = new Array<number>(12).fill(28);
    // House 1 (signIndex 0, ascSignIndex 0) reduced to 32 -> power center.
    // House 2 (signIndex 1) reduced to 20 -> karmic struggle.
    const reducedBindus = new Array<number>(12).fill(28);
    reducedBindus[0] = 32;
    reducedBindus[1] = 20;
    const facts = ashtakavargaFacts(
      { sarva: rawSarva(rawBindus), reduced: { sarva: rawSarva(reducedBindus) } },
      0,
    );
    expect(facts).toHaveLength(2);
    expect(facts[1]).toContain('Reduced Ashtakavarga');
    expect(facts[1]).toContain('Power centers');
    expect(facts[1]).toContain('House 1');
    expect(facts[1]).toContain('Karmic-struggle zones');
    expect(facts[1]).toContain('House 2');
  });

  it('omits the power-center/karmic-struggle callouts when nothing qualifies', () => {
    const bindus = new Array<number>(12).fill(28); // all baseline -> "moderate"/"baseline", nothing qualifies
    const facts = ashtakavargaFacts(
      { sarva: rawSarva(bindus), reduced: { sarva: rawSarva(bindus) } },
      0,
    );
    expect(facts[1]).not.toContain('Power centers');
    expect(facts[1]).not.toContain('Karmic-struggle zones');
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

describe('chat-grounding: bhinnashtakavargaFacts (reduced bindu mandate note)', () => {
  it('states only the raw bindu count when no reduced bhinna table is present', () => {
    const bindus = new Array<number>(12).fill(3);
    bindus[0] = 6;
    const facts = bhinnashtakavargaFacts({ bhinna: [{ planet: 'Moon', bindus }] }, [
      MOON_PLACEMENT,
    ]);
    expect(facts).toHaveLength(1);
    expect(facts[0]).toContain('6 raw Bhinnashtakavarga bindus');
    expect(facts[0]).not.toContain('Shodhana');
  });

  it('appends the reduced bindu count and mandate verdict when the reduced table is present', () => {
    const rawBindus = new Array<number>(12).fill(3);
    rawBindus[0] = 6;
    const reducedBindus = new Array<number>(12).fill(0);
    reducedBindus[0] = 5; // >=4 -> has the mandate
    const facts = bhinnashtakavargaFacts(
      {
        bhinna: [{ planet: 'Moon', bindus: rawBindus }],
        reduced: { bhinna: [{ planet: 'Moon', bindus: reducedBindus }] },
      },
      [MOON_PLACEMENT],
    );
    expect(facts[0]).toContain('this is 5 bindus');
    expect(facts[0]).toContain('has the classical mandate');
  });

  it('reports "lacks" the mandate when reduced bindus fall below 4', () => {
    const reducedBindus = new Array<number>(12).fill(0);
    reducedBindus[0] = 2;
    const facts = bhinnashtakavargaFacts(
      {
        bhinna: [{ planet: 'Moon', bindus: new Array<number>(12).fill(3) }],
        reduced: { bhinna: [{ planet: 'Moon', bindus: reducedBindus }] },
      },
      [MOON_PLACEMENT],
    );
    expect(facts[0]).toContain('lacks the classical mandate');
  });
});
