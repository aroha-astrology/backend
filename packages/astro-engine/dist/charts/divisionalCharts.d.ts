import type { Planet, ZodiacSign, DivisionalChart, ChartData } from '@jyotish-ai/shared';
export declare function calculateD1(longitude: number): number;
export declare function calculateD2(longitude: number): number;
export declare function calculateD3(longitude: number): number;
export declare function calculateD4(longitude: number): number;
export declare function calculateD5(longitude: number): number;
export declare function calculateD6(longitude: number): number;
export declare function calculateD7(longitude: number): number;
export declare function calculateD8(longitude: number): number;
export declare function calculateD9(longitude: number): number;
export declare function calculateD10(longitude: number): number;
export declare function calculateD11(longitude: number): number;
export declare function calculateD12(longitude: number): number;
export declare function calculateD14(longitude: number): number;
export declare function calculateD16(longitude: number): number;
export declare function calculateD20(longitude: number): number;
export declare function calculateD21(longitude: number): number;
export declare function calculateD24(longitude: number): number;
export declare function calculateD27(longitude: number): number;
export declare function calculateD30(longitude: number): number;
export declare function calculateD40(longitude: number): number;
export declare function calculateD45(longitude: number): number;
export declare function calculateD60(longitude: number): number;
export declare function calculateD81(longitude: number): number;
export declare function calculateD108(longitude: number): number;
export declare const D60_DEITY_NAMES: string[];
export declare const DIVISIONAL_CALCULATORS: Record<DivisionalChart, (longitude: number) => number>;
export interface DivisionalChartEntry {
    planet: Planet;
    sign: ZodiacSign;
    signIndex: number;
}
/**
 * A divisional chart with its own Lagna (ascendant). The varga Lagna is the
 * sign that the natal ascendant longitude maps to in the varga's fractional
 * division — this is what's used to assign houses to each planet in that varga.
 */
export interface DivisionalChartWithLagna {
    planets: DivisionalChartEntry[];
    ascendantSignIndex: number;
}
/**
 * Computes all 24 divisional charts (Shodashvarga + advanced) for every planet in the chart.
 *
 * @param chartData - Full natal chart data with planet longitudes
 * @returns A record keyed by DivisionalChart type, each containing an array of
 *          planet positions (sign index + sign name) within that varga.
 */
export declare function calculateAllDivisionalCharts(chartData: ChartData): Record<DivisionalChart, DivisionalChartEntry[]>;
/**
 * Computes all 24 divisional charts WITH each varga's Lagna (ascendant) sign.
 * Use this when you need to render the varga as a full chart with houses —
 * the ascendant longitude is run through the same fractional rule as the planets.
 */
export declare function calculateAllDivisionalChartsWithLagna(chartData: ChartData): Record<DivisionalChart, DivisionalChartWithLagna>;
/**
 * Storage-friendly shape for `kundli_charts.divisional_charts` JSONB.
 *
 * Backward compatible with the original `Record<DivisionalChart, DivisionalChartEntry[]>`
 * format — each chart type is still a plain array of planet entries. We add a
 * single reserved key `_lagna` that maps each chart type to its varga Lagna sign
 * index. Old consumers that read `divisional_charts.D9` see the same array shape
 * they always did; new consumers that need the Lagna read `divisional_charts._lagna.D9`.
 */
export type DivisionalChartsStorage = Record<DivisionalChart, DivisionalChartEntry[]> & {
    _lagna: Record<DivisionalChart, number>;
};
/**
 * Computes the storage-friendly shape: per-chart arrays + a `_lagna` companion.
 * This is what should be written to `kundli_charts.divisional_charts` going
 * forward — old code keeps working, new code can read the lagnas.
 */
export declare function calculateAllDivisionalChartsForStorage(chartData: ChartData): DivisionalChartsStorage;
/**
 * Normalizer for `divisional_charts` JSONB: returns the planets array + Lagna for
 * a given varga type, falling back to the natal ascendant sign index when the
 * stored row predates the `_lagna` companion (best-effort).
 */
export declare function getVargaWithLagna(storage: unknown, type: DivisionalChart, fallbackAscSignIndex: number): DivisionalChartWithLagna | null;
/**
 * Build a synthetic ChartData representing a varga as a full chart with houses.
 * Houses are assigned by counting forward from the varga Lagna (whole-sign houses).
 * Renders correctly through NorthIndianChart / SouthIndianChart.
 */
export declare function buildVargaChartData(source: ChartData, varga: DivisionalChartWithLagna): ChartData;
/**
 * Chandra Lagna (Moon Sign Chart) — re-cast the D1 chart with the Moon's natal
 * sign as House 1. All planet signs stay the same; house numbers shift.
 *
 * Reference: classical Vedic Chandra Lagna; treats Moon's position as the
 * ascendant for emotional/mental life analysis.
 */
export declare function getMoonChart(source: ChartData): ChartData;
//# sourceMappingURL=divisionalCharts.d.ts.map