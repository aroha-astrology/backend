"use strict";
// =============================================================================
// Nakshatra Calculation from Moon Longitude
// =============================================================================
// Nakshatra index = floor(Moon longitude / 13°20')
// Each nakshatra spans 13°20' (13.3333... degrees).
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateNakshatra = calculateNakshatra;
const shared_1 = require("@jyotish-ai/shared");
const NAKSHATRA_DEITIES = [
    'Ashwini Kumaras', 'Yama', 'Agni', 'Brahma', 'Soma',
    'Rudra', 'Aditi', 'Brihaspati', 'Sarpa', 'Pitru',
    'Bhaga', 'Aryaman', 'Savitar', 'Tvashtar', 'Vayu',
    'Indra-Agni', 'Mitra', 'Indra', 'Nirriti', 'Apah',
    'Vishvadeva', 'Vishnu', 'Vasu', 'Varuna', 'Aja Ekapada',
    'Ahir Budhnya', 'Pushan',
];
/**
 * Calculate the nakshatra from the Moon's sidereal longitude.
 *
 * @param moonLong - Sidereal longitude of the Moon (0-360)
 * @returns NakshatraData with index, name, lord, pada, and deity
 */
function calculateNakshatra(moonLong) {
    // Normalize to 0-360
    let normalizedLong = moonLong % 360;
    if (normalizedLong < 0)
        normalizedLong += 360;
    // Each nakshatra = 13°20' = 13.33333... degrees
    const nakshatraIndex = Math.floor(normalizedLong / shared_1.NAKSHATRA_SPAN);
    const clampedIndex = Math.min(nakshatraIndex, 26);
    // Calculate pada (quarter) within the nakshatra
    const posInNakshatra = normalizedLong - clampedIndex * shared_1.NAKSHATRA_SPAN;
    const padaSpan = shared_1.NAKSHATRA_SPAN / 4; // 3°20' = 3.3333... degrees
    const pada = Math.min(Math.floor(posInNakshatra / padaSpan) + 1, 4);
    return {
        index: clampedIndex,
        name: shared_1.NAKSHATRAS[clampedIndex],
        lord: shared_1.NAKSHATRA_LORDS[clampedIndex],
        pada,
        deity: NAKSHATRA_DEITIES[clampedIndex],
    };
}
//# sourceMappingURL=nakshatra.js.map