import { describe, it, expect } from 'vitest';
import {
  NAKSHATRAS,
  NAKSHATRA_GANA,
  NAKSHATRA_YONI,
  PLANET_FRIENDS,
  PLANET_ENEMIES,
} from '@aroha-astrology/shared';
import type { Planet } from '@aroha-astrology/shared';
import { calculateAshtakoota } from '../../src/lib/astro-engine/matching/ashtakoota.js';

// =============================================================================
// Audit items CN2, MT3 (tables), register MC-6.21-29
// =============================================================================
// Muhurta Chintamani, Vivaha prakarana (Khemraj edition, Sanskrit verses with the
// Hindi commentary). The tables below are the commentary's lists for verses 25-29.
// =============================================================================

const idx = (name: string) => NAKSHATRAS.indexOf(name as (typeof NAKSHATRAS)[number]);

// ---- 6.29 Gana ---------------------------------------------------------------
const GANA = {
  Rakshasa: [
    'Magha',
    'Ashlesha',
    'Dhanishta',
    'Jyeshtha',
    'Moola',
    'Shatabhisha',
    'Krittika',
    'Chitra',
    'Vishakha',
  ],
  Manushya: [
    'PurvaPhalguni',
    'PurvaAshadha',
    'PurvaBhadrapada',
    'UttaraPhalguni',
    'UttaraAshadha',
    'UttaraBhadrapada',
    'Rohini',
    'Bharani',
    'Ardra',
  ],
  Deva: [
    'Anuradha',
    'Punarvasu',
    'Mrigashira',
    'Shravana',
    'Revati',
    'Swati',
    'Ashwini',
    'Pushya',
    'Hasta',
  ],
} as const;

describe('[CN2] the gana of each star (MC-6.29)', () => {
  it('the three sets are nine stars each and cover all 27', () => {
    const all = [...GANA.Rakshasa, ...GANA.Manushya, ...GANA.Deva];
    expect(new Set(all).size).toBe(27);
    for (const n of all) expect(idx(n), n).toBeGreaterThanOrEqual(0);
  });
  for (const [gana, stars] of Object.entries(GANA)) {
    it.each(stars)(`%s is ${gana}`, (name) => expect(NAKSHATRA_GANA[idx(name)]).toBe(gana));
  }
});

// ---- 6.25-26 Yoni ------------------------------------------------------------
const YONI: Record<string, string[]> = {
  Horse: ['Ashwini', 'Shatabhisha'],
  Buffalo: ['Swati', 'Hasta'],
  Lion: ['Dhanishta', 'PurvaBhadrapada'],
  Elephant: ['Bharani', 'Revati'],
  Goat: ['Pushya', 'Krittika'], // meṣa, the ram
  Monkey: ['Shravana', 'PurvaAshadha'],
  Mongoose: ['UttaraAshadha'],
  Serpent: ['Rohini', 'Mrigashira'],
  Deer: ['Jyeshtha', 'Anuradha'],
  Dog: ['Moola', 'Ardra'],
  Cat: ['Punarvasu', 'Ashlesha'],
  Rat: ['Magha', 'PurvaPhalguni'],
  Tiger: ['Vishakha', 'Chitra'],
  Cow: ['UttaraPhalguni', 'UttaraBhadrapada'],
};

describe('[MT3] the yoni animal of each star (MC-6.25-26)', () => {
  for (const [animal, stars] of Object.entries(YONI)) {
    it.each(stars)(`%s is the ${animal}`, (name) =>
      expect(NAKSHATRA_YONI[idx(name)]!.animal).toBe(animal),
    );
  }

  it('the sworn enemies score 0: cow-tiger, elephant-lion, horse-buffalo, dog-deer, mongoose-serpent, monkey-ram, cat-rat', () => {
    const pairs: [string, string][] = [
      ['UttaraPhalguni', 'Chitra'],
      ['Bharani', 'Dhanishta'],
      ['Ashwini', 'Hasta'],
      ['Moola', 'Anuradha'],
      ['UttaraAshadha', 'Rohini'],
      ['Shravana', 'Pushya'],
      ['Punarvasu', 'Magha'],
    ];
    for (const [a, b] of pairs) {
      const s = calculateAshtakoota(idx(a), idx(b), 'Aries', 'Aries').scores.find(
        (k) => k.koota === 'Yoni',
      )!;
      expect(s.score, `${a} ${b}`).toBe(0);
    }
  });

  it('the same animal scores the full 4', () => {
    const s = calculateAshtakoota(idx('Ashwini'), idx('Shatabhisha'), 'Aries', 'Aries').scores.find(
      (k) => k.koota === 'Yoni',
    )!;
    expect(s.score).toBe(4);
  });
});

// ---- 6.27-28 Graha maitri: the natural friendships ---------------------------
const MAITRI: Record<string, { friends: string[]; enemies: string[] }> = {
  Sun: { friends: ['Moon', 'Mars', 'Jupiter'], enemies: ['Venus', 'Saturn'] },
  Moon: { friends: ['Sun', 'Mercury'], enemies: [] },
  Mars: { friends: ['Moon', 'Jupiter', 'Sun'], enemies: ['Mercury'] },
  Mercury: { friends: ['Sun', 'Venus'], enemies: ['Moon'] },
  Jupiter: { friends: ['Sun', 'Moon', 'Mars'], enemies: ['Mercury', 'Venus'] },
  Venus: { friends: ['Mercury', 'Saturn'], enemies: ['Sun', 'Moon'] },
  Saturn: { friends: ['Mercury', 'Venus'], enemies: ['Sun', 'Moon', 'Mars'] },
};

describe('[MT3] the planetary friendships of the Graha Maitri verses (MC-6.27-28)', () => {
  for (const [planet, rel] of Object.entries(MAITRI)) {
    it(`${planet}: friends and enemies`, () => {
      const friends = (PLANET_FRIENDS[planet as Planet] ?? []).filter(
        (p) => p !== 'Rahu' && p !== 'Ketu',
      );
      const enemies = (PLANET_ENEMIES[planet as Planet] ?? []).filter(
        (p) => p !== 'Rahu' && p !== 'Ketu',
      );
      expect([...friends].sort()).toEqual([...rel.friends].sort());
      expect([...enemies].sort()).toEqual([...rel.enemies].sort());
    });
  }
});
