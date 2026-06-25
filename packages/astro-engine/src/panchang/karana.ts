// =============================================================================
// Karana Calculation
// =============================================================================
// A karana is half a tithi (6 degrees of Moon-Sun elongation).
// There are 60 karanas in a lunar month (30 tithis x 2).
// 11 karana names: 4 fixed + 7 rotating.
// Fixed: Kimstughna (1st half of Shukla Pratipada), Shakuni, Chatushpada,
//        Nagava (2nd half of Krishna Chaturdashi and both halves of Amavasya).
// The 7 rotating karanas cycle 8 times to fill the remaining 56 slots.

import type { Karana } from '@aroha-astrology/shared';

const ROTATING_KARANAS: string[] = [
  'Bava', 'Balava', 'Kaulava', 'Taitila', 'Gara', 'Vanija', 'Vishti',
];

const FIXED_KARANAS: string[] = [
  'Kimstughna', 'Shakuni', 'Chatushpada', 'Nagava',
];

/**
 * Calculate the karana from Moon and Sun longitudes.
 *
 * @param moonLong - Sidereal longitude of the Moon (0-360)
 * @param sunLong - Sidereal longitude of the Sun (0-360)
 * @returns Karana with index, name, and whether it is fixed
 */
export function calculateKarana(moonLong: number, sunLong: number): Karana {
  // Elongation of Moon from Sun
  let diff = moonLong - sunLong;
  if (diff < 0) diff += 360;

  // Each karana spans 6 degrees (half a tithi of 12 degrees)
  const karanaIndex = Math.floor(diff / 6); // 0-59

  let name: string;
  let isFixed: boolean;

  if (karanaIndex === 0) {
    // 1st karana: Kimstughna (fixed)
    name = 'Kimstughna';
    isFixed = true;
  } else if (karanaIndex >= 57) {
    // Last 3 karanas: Shakuni (57), Chatushpada (58), Nagava (59)
    const fixedIdx = karanaIndex - 57 + 1; // 1, 2, 3
    name = FIXED_KARANAS[fixedIdx];
    isFixed = true;
  } else {
    // Rotating karanas: indices 1-56 map to 7 rotating karanas cycling
    const rotatingIdx = (karanaIndex - 1) % 7;
    name = ROTATING_KARANAS[rotatingIdx];
    isFixed = false;
  }

  return {
    index: karanaIndex,
    name,
    isFixed,
  };
}
