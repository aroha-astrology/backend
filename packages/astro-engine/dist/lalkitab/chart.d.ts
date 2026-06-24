import type { ChartData, LalKitabChart } from '@jyotish-ai/shared';
/**
 * Create a Lal Kitab chart from standard Vedic chart data.
 *
 * Lal Kitab fixes Aries as the 1st house. A planet's house number equals
 * its sign index + 1 (Aries=1 ... Pisces=12), regardless of the ascendant.
 */
export declare function createLalKitabChart(chartData: ChartData): LalKitabChart;
//# sourceMappingURL=chart.d.ts.map