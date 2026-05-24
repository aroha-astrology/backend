"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectGrahanDosha = detectGrahanDosha;
/**
 * Grahan Dosha Detection
 *
 * - Surya Grahan (Solar Eclipse Dosha): Sun conjunct Rahu in the same house
 * - Chandra Grahan (Lunar Eclipse Dosha): Moon conjunct Rahu or Ketu in the same house
 *
 * Conjunction is defined as occupying the same house.
 */
function getPlanetPosition(chartData, planet) {
    return chartData.planets.find((p) => p.planet === planet);
}
function detectGrahanDosha(chartData) {
    const sun = getPlanetPosition(chartData, 'Sun');
    const moon = getPlanetPosition(chartData, 'Moon');
    const rahu = getPlanetPosition(chartData, 'Rahu');
    const ketu = getPlanetPosition(chartData, 'Ketu');
    let hasSuryaGrahan = false;
    let hasChandraGrahan = false;
    // Surya Grahan: Sun + Rahu in same house
    if (sun && rahu && sun.house === rahu.house) {
        hasSuryaGrahan = true;
    }
    // Chandra Grahan: Moon + Rahu in same house OR Moon + Ketu in same house
    if (moon && rahu && moon.house === rahu.house) {
        hasChandraGrahan = true;
    }
    if (moon && ketu && moon.house === ketu.house) {
        hasChandraGrahan = true;
    }
    const present = hasSuryaGrahan || hasChandraGrahan;
    let type = 'none';
    if (hasSuryaGrahan && hasChandraGrahan) {
        type = 'both';
    }
    else if (hasSuryaGrahan) {
        type = 'surya_grahan';
    }
    else if (hasChandraGrahan) {
        type = 'chandra_grahan';
    }
    let severity = 'none';
    if (type === 'both') {
        severity = 'severe';
    }
    else if (type === 'surya_grahan' || type === 'chandra_grahan') {
        severity = 'moderate';
    }
    return {
        present,
        type,
        severity,
    };
}
//# sourceMappingURL=grahanDosha.js.map