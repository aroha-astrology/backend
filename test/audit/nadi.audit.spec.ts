import { describe, it, expect } from 'vitest';
import { NAKSHATRAS, NAKSHATRA_NADI } from '@aroha-astrology/shared';
import { calculateAshtakoota } from '../../src/lib/astro-engine/matching/ashtakoota.js';

// =============================================================================
// Audit item CN1 (docs/engine-audit/C-critical-corrections.md), register MC-6.34
// =============================================================================
// Muhurta Chintamani, Vivaha prakarana 6.34 (Sanskrit, with the Hindi commentary
// of the Khemraj edition): "jyeṣṭhā raudra-aryama-ambhaḥpati-bha-yuga-yugaṃ
// dāsraṃ ca eka-nāḍī / ...madhya / vāyu-agni-ahi-viśva-uḍu-yuga-yugam atho
// pauṣṇabhaṃ ca aparā". The commentary lists them:
//   Adi (first) nadi: Jyeshtha, Ardra, Uttara Phalguni, Shatabhisha "and the
//   next star of each" (two each), with Ashwini ("dasra");
//   Madhya nadi: Pushya, Mrigashira, Chitra, Anuradha, Bharani, Dhanishta,
//   Purva Ashadha, Purva Phalguni, Uttara Bhadrapada;
//   Antya (last) nadi: Swati, Krittika, Ashlesha, Uttara Ashadha "and the next
//   star of each", with Revati ("paushna").
// Taking "two each" as the star and the one after it, the three sets are nine
// stars each and together all 27. The engine had six stars in the wrong set.
// =============================================================================

const ADI = [
  'Ashwini',
  'Ardra',
  'Punarvasu',
  'UttaraPhalguni',
  'Hasta',
  'Jyeshtha',
  'Moola',
  'Shatabhisha',
  'PurvaBhadrapada',
];
const MADHYA = [
  'Bharani',
  'Mrigashira',
  'Pushya',
  'PurvaPhalguni',
  'Chitra',
  'Anuradha',
  'PurvaAshadha',
  'Dhanishta',
  'UttaraBhadrapada',
];
const ANTYA = [
  'Krittika',
  'Rohini',
  'Ashlesha',
  'Magha',
  'Swati',
  'Vishakha',
  'UttaraAshadha',
  'Shravana',
  'Revati',
];

const idx = (name: string) => NAKSHATRAS.indexOf(name as (typeof NAKSHATRAS)[number]);

describe('[CN1] the nadi of each star follows Muhurta Chintamani 6.34', () => {
  it('the three sets are nine stars each and cover all 27', () => {
    expect(new Set([...ADI, ...MADHYA, ...ANTYA]).size).toBe(27);
    for (const name of [...ADI, ...MADHYA, ...ANTYA])
      expect(idx(name), name).toBeGreaterThanOrEqual(0);
  });

  it.each(ADI)('%s is Adi', (name) => expect(NAKSHATRA_NADI[idx(name)]).toBe('Aadi'));
  it.each(MADHYA)('%s is Madhya', (name) => expect(NAKSHATRA_NADI[idx(name)]).toBe('Madhya'));
  it.each(ANTYA)('%s is Antya', (name) => expect(NAKSHATRA_NADI[idx(name)]).toBe('Antya'));
});

describe('[CN1] the Nadi koota reads it', () => {
  const nadi = (a: string, b: string) =>
    calculateAshtakoota(idx(a), idx(b), 'Aries', 'Aries').scores.find((s) => s.koota === 'Nadi')!;

  it('Hasta and Uttara Phalguni share Adi nadi: 0 of 8', () => {
    expect(nadi('Hasta', 'UttaraPhalguni').score).toBe(0);
  });

  it('Swati and Vishakha share Antya nadi: 0 of 8', () => {
    expect(nadi('Swati', 'Vishakha').score).toBe(0);
  });

  it('Jyeshtha (Adi) and Anuradha (Madhya) differ: 8 of 8', () => {
    expect(nadi('Jyeshtha', 'Anuradha').score).toBe(8);
  });
});
