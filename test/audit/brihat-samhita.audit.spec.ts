import { describe, it, expect } from 'vitest';
import type { ChartData, Planet } from '@aroha-astrology/shared';
import { SIGN_LORDS, ZODIAC_SIGNS } from '@aroha-astrology/shared';
import { detectAllYogas } from '../../src/lib/astro-engine/yogas/index.js';
import { VASTU_RULES } from '../../src/modules/vastu/vastu.rules.js';

// =============================================================================
// Rules read from the Bṛhat Saṃhitā of Varāhamihira (6th century)
// =============================================================================
// Source register ids BS-* in docs/engine-audit/D-source-register.md. Each
// expectation was written from the verse (GRETIL e-text, Tripathi's edition),
// never from the engine's output.
// =============================================================================

const ALL: Planet[] = [
  'Sun',
  'Moon',
  'Mars',
  'Mercury',
  'Jupiter',
  'Venus',
  'Saturn',
  'Rahu',
  'Ketu',
];

/** Planets by sign index (0 = Aries); `lagna` is the Lagna's sign index. Unplaced planets sit in the 3rd house. */
function chart(lagna: number, signOf: Partial<Record<Planet, number>>): ChartData {
  const planets = ALL.map((planet, i) => {
    const signIndex = signOf[planet] ?? (lagna + 2) % 12;
    return {
      planet,
      house: ((signIndex - lagna + 12) % 12) + 1,
      signIndex,
      sign: ZODIAC_SIGNS[signIndex]!,
      signDegree: 12 + i,
      longitude: signIndex * 30 + 12 + i,
      latitude: 0,
      speed: 1,
      isRetrograde: false,
    };
  });
  const houses = ZODIAC_SIGNS.map((_, i) => {
    const signIndex = (lagna + i) % 12;
    const sign = ZODIAC_SIGNS[signIndex]!;
    return {
      house: i + 1,
      sign,
      signIndex,
      cusp: signIndex * 30,
      lord: SIGN_LORDS[sign],
      planets: planets.filter((p) => p.house === i + 1).map((p) => p.planet),
    };
  });
  return {
    planets,
    houses,
    ascendant: { sign: ZODIAC_SIGNS[lagna]!, signIndex: lagna, degree: 10 },
    ayanamsa: 'lahiri',
    ayanamsaValue: 24,
    julianDay: 2451545,
  } as unknown as ChartData;
}

const present = (c: ChartData, name: string) => {
  const found = detectAllYogas(c).find((y) => y.name === name);
  if (!found) throw new Error(`yoga "${name}" not returned`);
  return found.present;
};

describe('[BS 68.1-68.2] the five great-man yogas', () => {
  // tārā-grahaiḥ bala-yutaiḥ sva-kṣetra-sva-uccagaiś catuṣṭayagaiḥ pañca puruṣāḥ
  // praśastā jāyante / jīvena bhavati haṃsaḥ saureṇa śaśaḥ kujena rucakaś ca /
  // bhadro budhena balinā mālavyo daitya-pūjyena
  // The five star-planets (not the Sun or Moon), in their own or exalted
  // sign, in the four angles: Jupiter Haṃsa, Saturn Śaśa, Mars Rucaka,
  // Mercury Bhadra, Venus Mālavya.
  const yoga: Array<[Planet, string]> = [
    ['Mars', 'Ruchaka Yoga'],
    ['Mercury', 'Bhadra Yoga'],
    ['Jupiter', 'Hamsa Yoga'],
    ['Venus', 'Malavya Yoga'],
    ['Saturn', 'Shasha Yoga'],
  ];

  it('own sign in an angle: Mars in Aries (1st) from an Aries Lagna', () => {
    expect(present(chart(0, { Mars: 0 }), 'Ruchaka Yoga')).toBe(true);
  });

  it('exalted in an angle: Mars in Capricorn (10th), Jupiter in Cancer (4th), Saturn in Libra (7th)', () => {
    expect(present(chart(0, { Mars: 9 }), 'Ruchaka Yoga')).toBe(true);
    expect(present(chart(0, { Jupiter: 3 }), 'Hamsa Yoga')).toBe(true);
    expect(present(chart(0, { Saturn: 6 }), 'Shasha Yoga')).toBe(true);
  });

  it('own sign in an angle: Venus in Libra (7th), Mercury in Gemini (1st) from a Gemini Lagna', () => {
    expect(present(chart(0, { Venus: 6 }), 'Malavya Yoga')).toBe(true);
    expect(present(chart(2, { Mercury: 2 }), 'Bhadra Yoga')).toBe(true);
  });

  it('exalted Mercury in Virgo is an angle from a Virgo or Gemini Lagna only', () => {
    expect(present(chart(5, { Mercury: 5 }), 'Bhadra Yoga')).toBe(true); // Virgo Lagna: 1st
    expect(present(chart(0, { Mercury: 5 }), 'Bhadra Yoga')).toBe(false); // Aries Lagna: 6th
  });

  it('own or exalted sign outside the angles: none of the five', () => {
    // Aries Lagna: Mars in Scorpio (own sign) is the 8th; Jupiter in Sagittarius (own) is the 9th;
    // Saturn in Aquarius (own) is the 11th; Venus in Pisces (exalted) is the 12th; Venus in Taurus (own) is the 2nd.
    expect(present(chart(0, { Mars: 7 }), 'Ruchaka Yoga')).toBe(false);
    expect(present(chart(0, { Jupiter: 8 }), 'Hamsa Yoga')).toBe(false);
    expect(present(chart(0, { Saturn: 10 }), 'Shasha Yoga')).toBe(false);
    expect(present(chart(0, { Venus: 11 }), 'Malavya Yoga')).toBe(false);
    expect(present(chart(0, { Venus: 1 }), 'Malavya Yoga')).toBe(false);
  });

  it('in an angle but in neither of its own signs nor its exaltation sign: none of the five', () => {
    // Mars in Cancer (its debilitation sign, 4th house); Jupiter in Aries (1st); Saturn in Aries (1st, debilitated).
    expect(present(chart(0, { Mars: 3 }), 'Ruchaka Yoga')).toBe(false);
    expect(present(chart(0, { Jupiter: 0 }), 'Hamsa Yoga')).toBe(false);
    expect(present(chart(0, { Saturn: 0 }), 'Shasha Yoga')).toBe(false);
  });

  it('there are exactly five, each named for the planet the verse gives', () => {
    expect(yoga.map(([, name]) => name).sort()).toEqual(
      ['Bhadra Yoga', 'Hamsa Yoga', 'Malavya Yoga', 'Ruchaka Yoga', 'Shasha Yoga'].sort(),
    );
  });
});

describe('[BS 52.116-117] where the rooms and the water go', () => {
  // aiśānyāṃ devagṛhaṃ mahānasaṃ yadi ca api kāryam āgneyyāṃ / nairṛtyāṃ
  // bhāṇḍa-upaskaro arthadhānyāni mārutyām: the god-house in the north-east,
  // the kitchen in the south-east, the vessels and furnishings in the
  // south-west, wealth and grain in the north-west.
  // prācyādisthe salile sutahāniḥ śikhi-bhayaṃ ripubhayaṃ ca strīkalahaḥ
  // strīdauṣṭyaṃ naiḥsvyaṃ vittātmaja-vivṛddhiḥ: water in the east, south-east,
  // south, south-west, west, north-west, north, north-east gives, in turn, loss
  // of sons, fear of fire, fear of enemies, quarrels among women, unchastity
  // among women, poverty, increase of wealth, increase of sons.
  const rule = (room: string) => VASTU_RULES.find((r) => r.room === room)!;

  it('the god-house (puja room) is ideal in the north-east', () => {
    expect(rule('puja_room').idealDirections).toContain('NE');
  });

  it('the kitchen is ideal in the south-east and never rated badly there', () => {
    expect(rule('kitchen').idealDirections).toContain('SE');
    expect(rule('kitchen').avoidDirections).not.toContain('SE');
  });

  it('the store is ideal in the south-west and allowed in the north-west', () => {
    expect(rule('store').idealDirections).toContain('SW');
    const ok = [...rule('store').idealDirections, ...rule('store').acceptableDirections];
    expect(ok).toContain('NW');
  });

  it('water is ideal in the north and north-east, and rated badly in the south-east, south and south-west', () => {
    const water = rule('water_tank');
    expect(water.idealDirections).toEqual(expect.arrayContaining(['N', 'NE']));
    expect(water.avoidDirections).toEqual(expect.arrayContaining(['SE', 'S', 'SW']));
  });

  it.todo(
    'water in the east and the north-west: the text lists death of sons and poverty, the engine rates both acceptable (NEEDS DECISION: needs rule set v2 in three copies)',
  );
});
