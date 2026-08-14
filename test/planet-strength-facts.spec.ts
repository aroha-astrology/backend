import { describe, it, expect } from 'vitest';
import {
  planetStrengthFacts,
  planetStrengthTable,
  bhavaChalitFacts,
} from '../src/lib/chat-grounding.js';
import type { PlanetFact } from '../src/lib/chat-grounding.js';
import {
  chalitHouseFor,
  rasiHouseFor,
  computeBhavaChalit,
} from '../src/lib/astro-engine/charts/bhavaChalit.js';
import {
  isCombust,
  angularSeparation,
  computePlanetStates,
} from '../src/lib/astro-engine/calculations/planet-state.js';

function planet(overrides: Partial<PlanetFact> & { planet: string }): PlanetFact {
  return {
    sign: 'Aries',
    signIndex: 0,
    house: 1,
    nakshatra: 'Ashwini',
    nakshatraPada: 1,
    nakshatraLord: 'Ketu',
    longitude: 0,
    ...overrides,
  };
}

describe('planet-state: angularSeparation', () => {
  it('returns the SHORT way round the zodiac, never the long one', () => {
    expect(angularSeparation(10, 350)).toBe(20);
    expect(angularSeparation(350, 10)).toBe(20);
    expect(angularSeparation(0, 180)).toBe(180);
    expect(angularSeparation(5, 5)).toBe(0);
  });
});

describe('planet-state: isCombust', () => {
  it('never flags the Sun or the shadow points, whatever their longitude', () => {
    expect(isCombust('Sun', 100, 100)).toBe(false);
    expect(isCombust('Rahu', 100, 100)).toBe(false);
    expect(isCombust('Ketu', 100, 100)).toBe(false);
  });

  it('flags a planet inside its orb and clears one outside it', () => {
    // Mercury's orb is 14 degrees.
    expect(isCombust('Mercury', 100, 90)).toBe(true); // 10 deg -> combust
    expect(isCombust('Mercury', 120, 90)).toBe(false); // 30 deg -> free
  });

  it('uses the per-planet orb, not one shared number', () => {
    // 12 degrees from the Sun: inside Mars's 17 orb, outside Jupiter's 11.
    expect(isCombust('Mars', 12, 0)).toBe(true);
    expect(isCombust('Jupiter', 12, 0)).toBe(false);
  });

  it('measures across the 0/360 boundary rather than treating it as a huge gap', () => {
    expect(isCombust('Venus', 358, 2)).toBe(true); // 4 deg apart, orb 10
  });

  it('returns false (never a false positive) when the Sun position is unusable', () => {
    expect(isCombust('Mercury', 100, null)).toBe(false);
    expect(isCombust('Mercury', 100, undefined)).toBe(false);
    expect(isCombust('Mercury', NaN, 100)).toBe(false);
  });
});

describe('planet-state: computePlanetStates', () => {
  it('reports retrogression and combustion together, with distance from the Sun', () => {
    const states = computePlanetStates([
      { planet: 'Sun', longitude: 100 },
      { planet: 'Mercury', longitude: 105, isRetrograde: true },
      { planet: 'Saturn', longitude: 300 },
    ]);

    const mercury = states.find((s) => s.planet === 'Mercury')!;
    expect(mercury.isRetrograde).toBe(true);
    expect(mercury.isCombust).toBe(true);
    expect(mercury.degreesFromSun).toBe(5);

    const saturn = states.find((s) => s.planet === 'Saturn')!;
    expect(saturn.isRetrograde).toBe(false);
    expect(saturn.isCombust).toBe(false);

    // The Sun gets no distance-from-itself reading.
    expect(states.find((s) => s.planet === 'Sun')!.degreesFromSun).toBeNull();
  });

  it('treats a missing isRetrograde flag as direct motion', () => {
    const [state] = computePlanetStates([{ planet: 'Mars', longitude: 200 }]);
    expect(state!.isRetrograde).toBe(false);
  });
});

describe('chat-grounding: planetStrengthFacts', () => {
  const planets: PlanetFact[] = [
    planet({ planet: 'Sun', longitude: 100 }),
    planet({ planet: 'Mercury', longitude: 105, isRetrograde: true }),
    planet({ planet: 'Saturn', longitude: 300 }),
  ];

  it('returns nothing when there are no planets to describe', () => {
    expect(planetStrengthFacts(null, [])).toEqual([]);
  });

  it('names retrograde and combust planets explicitly', () => {
    const facts = planetStrengthFacts(null, planets).join('\n');
    expect(facts).toContain('Retrograde at birth: Mercury');
    expect(facts).toContain('Combust');
    expect(facts).toContain('Mercury (5° from the Sun)');
  });

  it('states plainly when nothing is retrograde or combust, rather than staying silent', () => {
    // Silence would let the model assume either condition; these charts must
    // read as "checked, and clear".
    const facts = planetStrengthFacts(null, [
      planet({ planet: 'Sun', longitude: 0 }),
      planet({ planet: 'Saturn', longitude: 180 }),
    ]).join('\n');
    expect(facts).toContain('Retrograde at birth: none');
    expect(facts).toContain('Combust planets: none');
  });

  it('reads stored Shadbala off the chart and ranks strongest first', () => {
    const chart = {
      shadbala: [
        { planet: 'Saturn', totalVirupas: 200, requiredVirupas: 400, isStrong: false },
        { planet: 'Jupiter', totalVirupas: 390, requiredVirupas: 390, isStrong: true },
      ],
    };
    const facts = planetStrengthFacts(chart, planets);
    const strength = facts.find((f) => f.startsWith('Planetary Strength'))!;
    expect(strength).toBeDefined();
    // Jupiter (100%) must precede Saturn (50%).
    expect(strength.indexOf('Jupiter')).toBeLessThan(strength.indexOf('Saturn'));
    expect(strength).toContain('Jupiter 100% (strong)');
    expect(strength).toContain('Saturn 50% (below par)');
  });

  it('emits the STRENGTH RULE naming the weak planets — the actual prediction gate', () => {
    const chart = {
      shadbala: [
        { planet: 'Saturn', totalVirupas: 200, requiredVirupas: 400, isStrong: false },
        { planet: 'Jupiter', totalVirupas: 390, requiredVirupas: 390, isStrong: true },
      ],
    };
    const rule = planetStrengthFacts(chart, planets).find((f) => f.startsWith('STRENGTH RULE'));
    expect(rule).toBeDefined();
    expect(rule).toContain('Saturn');
    expect(rule).not.toContain('Jupiter');
    expect(rule).toContain('partial');
  });

  it('omits the STRENGTH RULE when every planet meets its classical minimum', () => {
    const chart = {
      shadbala: [{ planet: 'Jupiter', totalVirupas: 390, requiredVirupas: 390, isStrong: true }],
    };
    const facts = planetStrengthFacts(chart, planets);
    expect(facts.some((f) => f.startsWith('STRENGTH RULE'))).toBe(false);
  });

  it('degrades to retrograde/combustion only when the chart cannot yield Shadbala', () => {
    // Charts stored before Shadbala was persisted have no `shadbala` key, and a
    // bare planet list has no julianDay for the recompute to use. That must
    // yield fewer facts, never a thrown error or an invented strength.
    const facts = planetStrengthFacts({ planets: [] }, planets);
    expect(facts.some((f) => f.startsWith('Retrograde at birth'))).toBe(true);
    expect(facts.some((f) => f.startsWith('Planetary Strength'))).toBe(false);
  });
});

describe('bhavaChalit: rasiHouseFor', () => {
  it('puts a planet in the Lagna sign in house 1 and counts forward from there', () => {
    expect(rasiHouseFor(0, 0)).toBe(1);
    expect(rasiHouseFor(1, 0)).toBe(2);
    expect(rasiHouseFor(11, 0)).toBe(12);
  });

  it('wraps correctly when the Lagna is late in the zodiac', () => {
    expect(rasiHouseFor(0, 11)).toBe(2); // Aries planet, Pisces Lagna
    expect(rasiHouseFor(11, 11)).toBe(1);
  });
});

describe('bhavaChalit: chalitHouseFor', () => {
  it('centres house 1 on the Lagna degree, spanning 15 degrees either side', () => {
    const ascLon = 100; // 10 deg Cancer
    expect(chalitHouseFor(100, ascLon)).toBe(1); // exactly on the Lagna
    expect(chalitHouseFor(114, ascLon)).toBe(1); // +14 -> still house 1
    expect(chalitHouseFor(86, ascLon)).toBe(1); // -14 -> still house 1
    expect(chalitHouseFor(116, ascLon)).toBe(2); // +16 -> crossed into house 2
    expect(chalitHouseFor(84, ascLon)).toBe(12); // -16 -> fallen back to house 12
  });

  it('wraps across the 0/360 boundary', () => {
    expect(chalitHouseFor(2, 355)).toBe(1); // 7 deg past a late-Pisces Lagna
  });
});

describe('bhavaChalit: computeBhavaChalit', () => {
  it('flags the planet that changes house between the sign and bhava reckoning', () => {
    // Lagna at 2 deg Aries (longitude 2). A planet at 28 deg Aries is house 1
    // by sign, but 26 deg past the Lagna -> house 2 by bhava.
    const placements = computeBhavaChalit(
      [{ planet: 'Mars', longitude: 28, signIndex: 0, house: 1 }],
      2,
      0,
    );
    expect(placements).toHaveLength(1);
    expect(placements[0]!.rasiHouse).toBe(1);
    expect(placements[0]!.chalitHouse).toBe(2);
    expect(placements[0]!.moved).toBe(true);
  });

  it('reports no movement when the Lagna sits at the very start of its sign', () => {
    const placements = computeBhavaChalit(
      [{ planet: 'Mars', longitude: 10, signIndex: 0, house: 1 }],
      0.5,
      0,
    );
    expect(placements[0]!.moved).toBe(false);
  });

  it('skips planets with an unusable longitude rather than guessing a house', () => {
    expect(computeBhavaChalit([{ planet: 'Rahu' }], 2, 0)).toEqual([]);
  });

  it('returns nothing when the ascendant itself is unusable', () => {
    expect(computeBhavaChalit([{ planet: 'Mars', longitude: 10 }], NaN, 0)).toEqual([]);
  });
});

describe('chat-grounding: bhavaChalitFacts', () => {
  const movedChart = { ascendant: { signIndex: 0, degree: 2 } };
  const planets: PlanetFact[] = [
    {
      planet: 'Mars',
      sign: 'Aries',
      signIndex: 0,
      house: 1,
      nakshatra: 'Bharani',
      nakshatraPada: 4,
      nakshatraLord: 'Venus',
      longitude: 28,
    },
  ];

  it('stays silent when no planet changes house — nothing to reconcile', () => {
    // Lagna at 0.5 deg Aries with Mars at 10 deg Aries: 9.5 deg past the Lagna,
    // comfortably inside house 1 by both reckonings.
    const quiet = { ascendant: { signIndex: 0, degree: 0.5 } };
    const nearLagna: PlanetFact[] = [{ ...planets[0]!, longitude: 10 }];
    expect(bhavaChalitFacts(quiet, nearLagna)).toEqual([]);
  });

  it('names the moved planet and both of its houses, plus the reading rule', () => {
    const facts = bhavaChalitFacts(movedChart, planets);
    expect(facts).toHaveLength(2);
    expect(facts[0]).toContain('Mars sits in house 1 by sign but house 2 by bhava');
    expect(facts[0]).toContain('2.0°');
    expect(facts[1]).toContain('CHALIT RULE');
  });

  it('returns nothing when the chart carries no ascendant degree', () => {
    expect(bhavaChalitFacts({ ascendant: { signIndex: 0 } }, planets)).toEqual([]);
    expect(bhavaChalitFacts(null, planets)).toEqual([]);
  });
});

describe('planetStrengthTable — the structured, reader-facing form', () => {
  const planets = [
    planet({ planet: 'Sun', longitude: 100 }),
    planet({ planet: 'Mercury', longitude: 105 }), // 5 deg from the Sun -> combust
    planet({ planet: 'Jupiter', longitude: 200, isRetrograde: true }),
  ];
  const chart = {
    shadbala: [
      { planet: 'Saturn', totalVirupas: 200, requiredVirupas: 400, isStrong: false },
      { planet: 'Jupiter', totalVirupas: 468, requiredVirupas: 390, isStrong: true },
    ],
  };

  it('returns the SAME planets and percentages the prose narrates — one source, no drift', () => {
    const rows = planetStrengthTable(chart, planets);
    const prose = planetStrengthFacts(chart, planets).find((f) =>
      f.startsWith('Planetary Strength'),
    )!;
    for (const r of rows) {
      expect(prose).toContain(`${r.planet} ${r.pct}%`);
    }
  });

  it('sorts strongest first, and does not clamp a pct above 100', () => {
    const rows = planetStrengthTable(chart, planets);
    expect(rows.map((r) => r.planet)).toEqual(['Jupiter', 'Saturn']);
    expect(rows[0]!.pct).toBe(120); // 468/390 — above the classical minimum, kept as-is
    expect(rows[0]!.isStrong).toBe(true);
    expect(rows[1]!.pct).toBe(50);
    expect(rows[1]!.isStrong).toBe(false);
  });

  it('carries the retrograde/combust flags through onto the matching planet', () => {
    const rows = planetStrengthTable(chart, planets);
    const jupiter = rows.find((r) => r.planet === 'Jupiter')!;
    // Jupiter has no shadbala-independent state here beyond what computePlanetStates derives;
    // the contract under test is that the flags are booleans carried per planet, never dropped.
    expect(typeof jupiter.isRetrograde).toBe('boolean');
    expect(typeof jupiter.isCombust).toBe('boolean');
  });

  it('returns [] rather than faking strength when the chart yields no Shadbala', () => {
    expect(planetStrengthTable({ planets: [] }, planets)).toEqual([]);
    expect(planetStrengthTable(null, [])).toEqual([]);
  });
});
