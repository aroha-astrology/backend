// =============================================================================
// Daily colour and today's number — Chaldean numerology
// =============================================================================
// Replaced the natal-Moon-nakshatra/pada + Mahadasha-lord formula below:
//   luckyNumber = ((moonNakshatra * 4 + moonPada) % 9) + 1
// Both moonNakshatra/moonPada and the active Mahadasha lord are effectively
// constant for months or years, so a user's "daily" lucky number never
// actually changed day to day -- exactly the bug the audit named. Chaldean
// numerology (astro-engine/numerology/chaldean.ts) genuinely varies by date,
// derived from the user's own birth date (Moolank) rather than an arbitrary
// nakshatra/pada hash.
//
// The number is the day of the month added down to one digit. It is the same
// for every reader, so it is called "today's number" and is not presented as a
// personal lucky number (audit NM2).
// =============================================================================

import { moolank, dailyNumerology } from './numerology/chaldean.js';

export interface DailyLuckyElements {
  luckyColor: string;
  /** Today's number: the same for everyone, not personal. */
  todaysNumber: number;
}

/**
 * @param dateOfBirth 'YYYY-MM-DD' — required for a real Moolank; when absent
 *   (birth data not yet captured) this falls back to a fixed neutral Moolank
 *   of 1 (Sun) rather than throwing, matching the app's "degrade gracefully,
 *   never fabricate specificity" convention elsewhere in the horoscope pipeline.
 * @param dateString the day this reading is FOR (the horoscope's forDate),
 *   not necessarily today — matches how the caller already threads dates
 *   through for tomorrow/weekly/monthly/yearly readings.
 */
export function getDailyLuckyElements(
  dateOfBirth: string | null | undefined,
  dateString: string,
): DailyLuckyElements {
  const moolankValue = dateOfBirth ? moolank(dateOfBirth) : 1;
  const { todaysNumber, luckyColor } = dailyNumerology(new Date(dateString), moolankValue);
  return { luckyColor, todaysNumber };
}
