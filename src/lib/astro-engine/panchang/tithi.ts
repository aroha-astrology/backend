// @ts-nocheck
// =============================================================================
// Tithi Calculation
// =============================================================================
// Tithi = (Moon longitude - Sun longitude) / 12 degrees
// Result mod 30 gives the tithi number (1-30).
// Tithis 1-15 are Shukla Paksha, 16-30 are Krishna Paksha.

import type { Tithi } from '@aroha-astrology/shared';

const TITHI_NAMES: string[] = [
  'Pratipada', 'Dwitiya', 'Tritiya', 'Chaturthi', 'Panchami',
  'Shashthi', 'Saptami', 'Ashtami', 'Navami', 'Dashami',
  'Ekadashi', 'Dwadashi', 'Trayodashi', 'Chaturdashi', 'Purnima',
  'Pratipada', 'Dwitiya', 'Tritiya', 'Chaturthi', 'Panchami',
  'Shashthi', 'Saptami', 'Ashtami', 'Navami', 'Dashami',
  'Ekadashi', 'Dwadashi', 'Trayodashi', 'Chaturdashi', 'Amavasya',
];

const TITHI_DEITIES: string[] = [
  'Agni', 'Brahma', 'Gauri', 'Ganesh', 'Naga',
  'Kartikeya', 'Surya', 'Shiva', 'Durga', 'Dharma',
  'Vishnu', 'Vishnu', 'Kamadeva', 'Shiva', 'Soma',
  'Agni', 'Brahma', 'Gauri', 'Ganesh', 'Naga',
  'Kartikeya', 'Surya', 'Shiva', 'Durga', 'Dharma',
  'Vishnu', 'Vishnu', 'Kamadeva', 'Shiva', 'Pitru',
];

// Auspicious tithis: 2,3,5,7,10,11,12,13 of both pakshas, Purnima
const AUSPICIOUS_TITHI_INDICES = new Set([1, 2, 4, 6, 9, 10, 11, 12, 14, 16, 17, 19, 21, 24, 25, 26, 27]);

/**
 * Calculate the tithi from Moon and Sun longitudes.
 *
 * @param moonLong - Sidereal longitude of the Moon (0-360)
 * @param sunLong - Sidereal longitude of the Sun (0-360)
 * @returns Tithi object with number, name, paksha, deity, and auspiciousness
 */
export function calculateTithi(moonLong: number, sunLong: number): Tithi {
  // Elongation of Moon from Sun
  let diff = moonLong - sunLong;
  if (diff < 0) diff += 360;

  // Each tithi spans 12 degrees
  const tithiIndex = Math.floor(diff / 12); // 0-29
  const tithiNumber = tithiIndex + 1; // 1-30

  const paksha: 'Shukla' | 'Krishna' = tithiNumber <= 15 ? 'Shukla' : 'Krishna';

  return {
    number: tithiNumber,
    name: TITHI_NAMES[tithiIndex],
    paksha,
    deity: TITHI_DEITIES[tithiIndex],
    isAuspicious: AUSPICIOUS_TITHI_INDICES.has(tithiIndex),
  };
}

