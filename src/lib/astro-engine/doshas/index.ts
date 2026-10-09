// @ts-nocheck
import type { ChartData, DoshaAnalysis, ZodiacSign } from '@aroha-astrology/shared';

export { detectMangalDosha } from './mangalDosha';
export { detectKaalSarpDosha } from './kaalSarp';
export { detectSadeSati, detectCurrentSadeSati, getCurrentSaturnLongitude } from './sadeSati';
export { detectPitraDosha } from './pitraDosha';
export { detectKemDrumaDosha } from './kemDrumaDosha';
export { detectGrahanDosha } from './grahanDosha';
export { detectGuruChandalDosha } from './guruChandal';

import { detectMangalDosha } from './mangalDosha';
import { detectKaalSarpDosha } from './kaalSarp';
import { detectCurrentSadeSati, detectSadeSati } from './sadeSati';
import { detectPitraDosha } from './pitraDosha';
import { detectKemDrumaDosha } from './kemDrumaDosha';
import { detectGrahanDosha } from './grahanDosha';
import { detectGuruChandalDosha } from './guruChandal';

/**
 * Analyze all doshas for a given chart.
 *
 * @param chartData - The natal chart data
 * @param saturnLongitude - Current transit Saturn longitude (sidereal, 0-360)
 *                          needed for Sade Sati calculation
 * @returns Complete dosha analysis
 */
export function analyzeAllDoshas(chartData: ChartData, saturnLongitude: number): DoshaAnalysis {
  const moon = chartData.planets.find((p) => p.planet === 'Moon');
  const moonSign: ZodiacSign = moon ? moon.sign : 'Aries';

  return {
    mangal: detectMangalDosha(chartData),
    kaalSarp: detectKaalSarpDosha(chartData),
    sadeSati: detectSadeSati(moonSign, saturnLongitude),
    pitra: detectPitraDosha(chartData),
    kemDruma: detectKemDrumaDosha(chartData),
    grahan: detectGrahanDosha(chartData),
    guruChandal: detectGuruChandalDosha(chartData),
  };
}

/**
 * `analyzeAllDoshas` for a moment in time (now by default). Sade Sati is a
 * TRANSIT condition: it is read from where Saturn is at `asOf`, never from
 * the birth chart's Saturn, and its dates come from Saturn's real sign changes
 * (`detectCurrentSadeSati`), not the 912-days-a-sign estimate.
 */
export async function analyzeAllDoshasAt(
  chartData: ChartData,
  asOf?: Date,
): Promise<DoshaAnalysis> {
  const moon = chartData.planets.find((p) => p.planet === 'Moon');
  const moonSign: ZodiacSign = moon ? moon.sign : 'Aries';
  // Saturn's place is not needed for the six natal doshas; 0 is a placeholder
  // for the Sade Sati slot, which is replaced on the next line.
  const natal = analyzeAllDoshas(chartData, 0);
  return { ...natal, sadeSati: await detectCurrentSadeSati(moonSign, asOf) };
}
