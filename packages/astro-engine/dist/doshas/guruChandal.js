"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectGuruChandalDosha = detectGuruChandalDosha;
/**
 * Guru Chandal Dosha Detection
 *
 * Jupiter conjunct Rahu OR Jupiter conjunct Ketu in the same house.
 * This affliction taints Jupiter's benefic nature.
 */
function getPlanetPosition(chartData, planet) {
    return chartData.planets.find((p) => p.planet === planet);
}
function detectGuruChandalDosha(chartData) {
    const jupiter = getPlanetPosition(chartData, 'Jupiter');
    const rahu = getPlanetPosition(chartData, 'Rahu');
    const ketu = getPlanetPosition(chartData, 'Ketu');
    if (!jupiter) {
        return {
            present: false,
            house: 0,
            severity: 'none',
        };
    }
    const jupiterHouse = jupiter.house;
    const conjunctRahu = rahu ? jupiter.house === rahu.house : false;
    const conjunctKetu = ketu ? jupiter.house === ketu.house : false;
    const present = conjunctRahu || conjunctKetu;
    let severity = 'none';
    if (present) {
        // Conjunction with Rahu is traditionally considered more severe
        severity = conjunctRahu ? 'severe' : 'moderate';
    }
    return {
        present,
        house: present ? jupiterHouse : 0,
        severity,
    };
}
//# sourceMappingURL=guruChandal.js.map