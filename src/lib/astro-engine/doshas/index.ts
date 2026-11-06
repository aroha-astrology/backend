// @ts-nocheck
import type { ChartData, DoshaAnalysis, ZodiacSign } from '@aroha-astrology/shared';

export { detectMangalDosha } from './mangalDosha';
export { detectKaalSarpDosha } from './kaalSarp';
export { detectSadeSati, detectCurrentSadeSati, getCurrentSaturnLongitude } from './sadeSati';
export { detectCurrentDhaiya } from './dhaiya';
export { detectPitraDosha } from './pitraDosha';
export { detectKemDrumaDosha } from './kemDrumaDosha';
export { detectGrahanDosha } from './grahanDosha';
export { detectGuruChandalDosha } from './guruChandal';
export { detectGandanta } from './gandanta';

import { detectMangalDosha } from './mangalDosha';
import { detectKaalSarpDosha } from './kaalSarp';
import { detectCurrentSadeSati, detectSadeSati } from './sadeSati';
import { detectCurrentDhaiya } from './dhaiya';
import { detectPitraDosha } from './pitraDosha';
import { detectKemDrumaDosha } from './kemDrumaDosha';
import { detectGrahanDosha } from './grahanDosha';
import { detectGuruChandalDosha } from './guruChandal';

/**
 * The natal Moon sign. A chart without a Moon is broken: it used to be read as
 * an Aries Moon, which gave a Sade Sati and Dhaiya that were never real (audit L4).
 */
function natalMoonSign(chartData: ChartData): ZodiacSign {
  const moon = chartData.planets?.find((p) => p.planet === 'Moon');
  if (!moon?.sign) throw new Error('analyzeAllDoshas: the chart has no Moon');
  return moon.sign;
}

/**
 * Analyze all doshas for a given chart.
 *
 * @param chartData - The natal chart data
 * @param saturnLongitude - Current transit Saturn longitude (sidereal, 0-360)
 *                          needed for Sade Sati calculation
 * @returns Complete dosha analysis
 */
export function analyzeAllDoshas(chartData: ChartData, saturnLongitude: number): DoshaAnalysis {
  const moonSign = natalMoonSign(chartData);

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
 * `analyzeAllDoshas` for a moment in time (now by default). Sade Sati and
 * Shani Dhaiya are TRANSIT conditions: they are read from where Saturn is at
 * `asOf`, never from the birth chart's Saturn, and their dates come from
 * Saturn's real sign changes (`detectCurrentSadeSati`, `detectCurrentDhaiya`),
 * not the 912-days-a-sign estimate.
 */
export async function analyzeAllDoshasAt(
  chartData: ChartData,
  asOf?: Date,
): Promise<DoshaAnalysis> {
  const moonSign = natalMoonSign(chartData);
  // Saturn's place is not needed for the six natal doshas; 0 is a placeholder
  // for the Sade Sati slot, which is replaced on the next line.
  const natal = analyzeAllDoshas(chartData, 0);
  // With the chart, both also carry what softens or sharpens them and the
  // Sade Sati cycle number (saturnStrength.ts).
  const [sadeSati, dhaiya] = await Promise.all([
    detectCurrentSadeSati(moonSign, asOf, { chart: chartData }),
    detectCurrentDhaiya(moonSign, asOf, { chart: chartData }),
  ]);
  return { ...natal, sadeSati, dhaiya };
}
