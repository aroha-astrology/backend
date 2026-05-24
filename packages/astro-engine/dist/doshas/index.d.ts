import type { ChartData, DoshaAnalysis } from '@jyotish-ai/shared';
export { detectMangalDosha } from './mangalDosha';
export { detectKaalSarpDosha } from './kaalSarp';
export { detectSadeSati } from './sadeSati';
export { detectPitraDosha } from './pitraDosha';
export { detectKemDrumaDosha } from './kemDrumaDosha';
export { detectGrahanDosha } from './grahanDosha';
export { detectGuruChandalDosha } from './guruChandal';
/**
 * Analyze all doshas for a given chart.
 *
 * @param chartData - The natal chart data
 * @param saturnLongitude - Current transit Saturn longitude (sidereal, 0-360)
 *                          needed for Sade Sati calculation
 * @returns Complete dosha analysis
 */
export declare function analyzeAllDoshas(chartData: ChartData, saturnLongitude: number): DoshaAnalysis;
//# sourceMappingURL=index.d.ts.map