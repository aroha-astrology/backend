// =============================================================================
// Panchang Yoga Calculation
// =============================================================================
// Yoga = (Sun longitude + Moon longitude) / 13°20', mod 27
// There are 27 yogas, each spanning 13°20'.

import type { PanchangYoga } from '@aroha-astrology/shared';

const YOGA_NAMES: string[] = [
  'Vishkambha', 'Priti', 'Ayushman', 'Saubhagya', 'Shobhana',
  'Atiganda', 'Sukarma', 'Dhriti', 'Shula', 'Ganda',
  'Vriddhi', 'Dhruva', 'Vyaghata', 'Harshana', 'Vajra',
  'Siddhi', 'Vyatipata', 'Variyan', 'Parigha', 'Shiva',
  'Siddha', 'Sadhya', 'Shubha', 'Shukla', 'Brahma',
  'Indra', 'Vaidhriti',
];

// Auspicious yogas (traditionally considered good)
const AUSPICIOUS_YOGA_INDICES = new Set([
  1,   // Priti
  2,   // Ayushman
  3,   // Saubhagya
  4,   // Shobhana
  6,   // Sukarma
  7,   // Dhriti
  10,  // Vriddhi
  11,  // Dhruva
  13,  // Harshana
  15,  // Siddhi
  17,  // Variyan
  19,  // Shiva
  20,  // Siddha
  21,  // Sadhya
  22,  // Shubha
  23,  // Shukla
  24,  // Brahma
  25,  // Indra
]);

/**
 * Calculate the Panchang Yoga from Sun and Moon longitudes.
 *
 * @param sunLong - Sidereal longitude of the Sun (0-360)
 * @param moonLong - Sidereal longitude of the Moon (0-360)
 * @returns PanchangYoga with index, name, and auspiciousness
 */
export function calculatePanchangYoga(sunLong: number, moonLong: number): PanchangYoga {
  // Sum of Sun and Moon longitudes
  let sum = sunLong + moonLong;
  // Normalize to 0-360
  sum = sum % 360;
  if (sum < 0) sum += 360;

  // Each yoga spans 13°20' = 13.3333... degrees
  const yogaSpan = 13 + 1 / 3; // 13.3333...
  const yogaIndex = Math.floor(sum / yogaSpan) % 27;

  return {
    index: yogaIndex,
    name: YOGA_NAMES[yogaIndex],
    isAuspicious: AUSPICIOUS_YOGA_INDICES.has(yogaIndex),
  };
}
