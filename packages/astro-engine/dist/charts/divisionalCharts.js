"use strict";
// =============================================================================
// Divisional Chart (Varga) Calculations - Shodashvarga (16 Divisions)
// =============================================================================
//
// Each function takes a planet's sidereal longitude (0-360) and returns
// the sign index (0-11) in the respective divisional chart.
// All math is fully deterministic with no external dependencies.
// =============================================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.DIVISIONAL_CALCULATORS = exports.D60_DEITY_NAMES = void 0;
exports.calculateD1 = calculateD1;
exports.calculateD2 = calculateD2;
exports.calculateD3 = calculateD3;
exports.calculateD4 = calculateD4;
exports.calculateD5 = calculateD5;
exports.calculateD6 = calculateD6;
exports.calculateD7 = calculateD7;
exports.calculateD8 = calculateD8;
exports.calculateD9 = calculateD9;
exports.calculateD10 = calculateD10;
exports.calculateD11 = calculateD11;
exports.calculateD12 = calculateD12;
exports.calculateD14 = calculateD14;
exports.calculateD16 = calculateD16;
exports.calculateD20 = calculateD20;
exports.calculateD21 = calculateD21;
exports.calculateD24 = calculateD24;
exports.calculateD27 = calculateD27;
exports.calculateD30 = calculateD30;
exports.calculateD40 = calculateD40;
exports.calculateD45 = calculateD45;
exports.calculateD60 = calculateD60;
exports.calculateD81 = calculateD81;
exports.calculateD108 = calculateD108;
exports.calculateAllDivisionalCharts = calculateAllDivisionalCharts;
exports.calculateAllDivisionalChartsWithLagna = calculateAllDivisionalChartsWithLagna;
exports.calculateAllDivisionalChartsForStorage = calculateAllDivisionalChartsForStorage;
exports.getVargaWithLagna = getVargaWithLagna;
exports.buildVargaChartData = buildVargaChartData;
exports.getMoonChart = getMoonChart;
const shared_1 = require("@jyotish-ai/shared");
// =============================================================================
// Helpers
// =============================================================================
/** Normalize sign index into 0-11 range. */
function mod12(n) {
    return ((n % 12) + 12) % 12;
}
/** Get 0-based sign index from longitude. */
function signIndex(longitude) {
    return Math.floor(((longitude % 360) + 360) % 360 / 30);
}
/** Get degree within the sign (0-30). */
function signDegree(longitude) {
    let n = longitude % 360;
    if (n < 0)
        n += 360;
    return n % 30;
}
/** Whether a sign index (0-11) is odd (1-indexed: Aries=1 is odd). */
function isOddSign(idx) {
    return idx % 2 === 0; // Aries(0)=odd(1st), Taurus(1)=even(2nd), etc.
}
/** Sign element: 0=Fire, 1=Earth, 2=Air, 3=Water */
function signElement(idx) {
    return idx % 4;
}
/** Sign modality: 0=Movable(Cardinal), 1=Fixed, 2=Dual(Mutable) */
function signModality(idx) {
    return idx % 3;
}
// =============================================================================
// D1 - Rashi
// =============================================================================
function calculateD1(longitude) {
    return signIndex(longitude);
}
// =============================================================================
// D2 - Hora
// =============================================================================
// Each sign is split into two halves of 15 degrees.
// Odd signs: 0-15 = Sun (Leo=4), 15-30 = Moon (Cancer=3)
// Even signs: 0-15 = Moon (Cancer=3), 15-30 = Sun (Leo=4)
function calculateD2(longitude) {
    const si = signIndex(longitude);
    const deg = signDegree(longitude);
    const firstHalf = deg < 15;
    if (isOddSign(si)) {
        // Odd sign: first half Sun(Leo), second half Moon(Cancer)
        return firstHalf ? 4 : 3; // Leo=4, Cancer=3
    }
    else {
        // Even sign: first half Moon(Cancer), second half Sun(Leo)
        return firstHalf ? 3 : 4;
    }
}
// =============================================================================
// D3 - Drekkana
// =============================================================================
// Each sign divided into 3 parts of 10 degrees each.
// Part 1 (0-10): same sign
// Part 2 (10-20): 5th from sign
// Part 3 (20-30): 9th from sign
function calculateD3(longitude) {
    const si = signIndex(longitude);
    const deg = signDegree(longitude);
    const part = Math.floor(deg / 10); // 0, 1, or 2
    const offsets = [0, 4, 8]; // same, 5th, 9th (0-indexed offsets)
    return mod12(si + offsets[part]);
}
// =============================================================================
// D4 - Chaturthamsa
// =============================================================================
// Each sign divided into 4 parts of 7.5 degrees.
// Part 1 (0-7.5): same sign
// Part 2 (7.5-15): 4th from sign
// Part 3 (15-22.5): 7th from sign
// Part 4 (22.5-30): 10th from sign
function calculateD4(longitude) {
    const si = signIndex(longitude);
    const deg = signDegree(longitude);
    const part = Math.floor(deg / 7.5); // 0, 1, 2, or 3
    const offsets = [0, 3, 6, 9]; // same, 4th, 7th, 10th
    return mod12(si + offsets[part]);
}
// =============================================================================
// D5 - Panchamsa (Awards, Fame)
// =============================================================================
// Each sign divided into 5 parts of 6 degrees.
function calculateD5(longitude) {
    const si = signIndex(longitude);
    const deg = signDegree(longitude);
    const part = Math.floor(deg / 6); // 5 parts of 6 degrees
    return mod12(si + part);
}
// =============================================================================
// D6 - Shashtamsa (Health, Litigation)
// =============================================================================
// Each sign divided into 6 parts of 5 degrees.
function calculateD6(longitude) {
    const si = signIndex(longitude);
    const deg = signDegree(longitude);
    const part = Math.floor(deg / 5); // 6 parts of 5 degrees
    return mod12(si + part);
}
// =============================================================================
// D7 - Saptamsha
// =============================================================================
// Each sign divided into 7 equal parts of 4 17/7 degrees (30/7).
// Odd signs: count from same sign forward.
// Even signs: count from 7th sign forward.
function calculateD7(longitude) {
    const si = signIndex(longitude);
    const deg = signDegree(longitude);
    const partSize = 30 / 7; // ~4.285714 degrees
    const part = Math.floor(deg / partSize); // 0-6
    const startSign = isOddSign(si) ? si : mod12(si + 6); // same or 7th
    return mod12(startSign + part);
}
// =============================================================================
// D8 - Ashtamsa (Sudden Events, Troubles)
// =============================================================================
// Each sign divided into 8 parts of 3.75 degrees.
function calculateD8(longitude) {
    const si = signIndex(longitude);
    const deg = signDegree(longitude);
    const part = Math.floor(deg / 3.75); // 8 parts of 3.75 degrees
    return mod12(si + part);
}
// =============================================================================
// D9 - Navamsa
// =============================================================================
// Each sign divided into 9 parts of 3 20' (10/3 degrees).
// Starting sign based on element of natal sign:
// Fire (Aries, Leo, Sag) -> start from Aries (0)
// Earth (Taurus, Virgo, Cap) -> start from Capricorn (9)
// Air (Gemini, Libra, Aqua) -> start from Libra (6)
// Water (Cancer, Scorpio, Pisces) -> start from Cancer (3)
function calculateD9(longitude) {
    const si = signIndex(longitude);
    const deg = signDegree(longitude);
    const partSize = 30 / 9; // 3.333... degrees
    const part = Math.floor(deg / partSize); // 0-8
    // Element: Fire=0, Earth=1, Air=2, Water=3
    const element = signElement(si);
    const startSigns = [0, 9, 6, 3]; // Aries, Cap, Libra, Cancer
    return mod12(startSigns[element] + part);
}
// =============================================================================
// D10 - Dashamsha
// =============================================================================
// Each sign divided into 10 parts of 3 degrees.
// Odd signs: count from same sign.
// Even signs: count from 9th sign (offset 8).
function calculateD10(longitude) {
    const si = signIndex(longitude);
    const deg = signDegree(longitude);
    const part = Math.floor(deg / 3); // 0-9
    const startSign = isOddSign(si) ? si : mod12(si + 8); // same or 9th
    return mod12(startSign + part);
}
// =============================================================================
// D11 - Rudramsa (Death, Destruction, Sudden Changes)
// =============================================================================
// Each sign divided into 11 parts.
function calculateD11(longitude) {
    const si = signIndex(longitude);
    const deg = signDegree(longitude);
    const partSize = 30 / 11;
    const part = Math.floor(deg / partSize);
    return mod12(si + part);
}
// =============================================================================
// D12 - Dwadashamsha
// =============================================================================
// Each sign divided into 12 parts of 2.5 degrees.
// Always start from same sign and count forward.
function calculateD12(longitude) {
    const si = signIndex(longitude);
    const deg = signDegree(longitude);
    const part = Math.floor(deg / 2.5); // 0-11
    return mod12(si + part);
}
// =============================================================================
// D14 - Chaturdamsa (Death of family members, deeper karmic analysis)
// =============================================================================
// Each sign divided into 14 parts.
function calculateD14(longitude) {
    const si = signIndex(longitude);
    const deg = signDegree(longitude);
    const partSize = 30 / 14;
    const part = Math.floor(deg / partSize);
    return mod12(si + part);
}
// =============================================================================
// D16 - Shodashamsha
// =============================================================================
// Each sign divided into 16 parts of 1.875 degrees (1 52'30").
// Movable signs (Cardinal): start from Aries (0)
// Fixed signs: start from Leo (4)
// Dual signs (Mutable): start from Sagittarius (8)
function calculateD16(longitude) {
    const si = signIndex(longitude);
    const deg = signDegree(longitude);
    const partSize = 30 / 16; // 1.875
    const part = Math.floor(deg / partSize); // 0-15
    const modality = signModality(si);
    const startSigns = [0, 4, 8]; // Aries, Leo, Sag
    return mod12(startSigns[modality] + part);
}
// =============================================================================
// D20 - Vimshamsha
// =============================================================================
// Each sign divided into 20 parts of 1.5 degrees.
// Movable signs: start from Aries (0)
// Fixed signs: start from Sagittarius (8)
// Dual signs: start from Leo (4)
function calculateD20(longitude) {
    const si = signIndex(longitude);
    const deg = signDegree(longitude);
    const partSize = 30 / 20; // 1.5
    const part = Math.floor(deg / partSize); // 0-19
    const modality = signModality(si);
    const startSigns = [0, 8, 4]; // Aries, Sag, Leo
    return mod12(startSigns[modality] + part);
}
// =============================================================================
// D21 - Ekavimsamsa (Extended spiritual analysis)
// =============================================================================
// Each sign divided into 21 parts.
function calculateD21(longitude) {
    const si = signIndex(longitude);
    const deg = signDegree(longitude);
    const partSize = 30 / 21;
    const part = Math.floor(deg / partSize);
    return mod12(si + part);
}
// =============================================================================
// D24 - Chaturvimshamsha (Siddhamsa)
// =============================================================================
// Each sign divided into 24 parts of 1.25 degrees.
// Odd signs: start from Leo (4)
// Even signs: start from Cancer (3)
function calculateD24(longitude) {
    const si = signIndex(longitude);
    const deg = signDegree(longitude);
    const partSize = 30 / 24; // 1.25
    const part = Math.floor(deg / partSize); // 0-23
    const startSign = isOddSign(si) ? 4 : 3; // Leo or Cancer
    return mod12(startSign + part);
}
// =============================================================================
// D27 - Saptavimshamsha (Nakshatramsha / Bhamsha)
// =============================================================================
// Each sign divided into 27 parts of 1 6'40" (30/27 degrees).
// Fire signs (Aries, Leo, Sag): start from Aries (0)
// Earth signs (Taurus, Virgo, Cap): start from Cancer (3)
// Air signs (Gemini, Libra, Aqua): start from Libra (6)
// Water signs (Cancer, Scorpio, Pisces): start from Capricorn (9)
function calculateD27(longitude) {
    const si = signIndex(longitude);
    const deg = signDegree(longitude);
    const partSize = 30 / 27; // ~1.1111
    const part = Math.floor(deg / partSize); // 0-26
    const element = signElement(si);
    const startSigns = [0, 3, 6, 9]; // Aries, Cancer, Libra, Capricorn
    return mod12(startSigns[element] + part);
}
// =============================================================================
// D30 - Trimshamsha
// =============================================================================
// Classical 5-part unequal division (NOT equal 30 parts).
// For ODD signs: Mars 0-5, Saturn 5-10, Jupiter 10-18, Mercury 18-25, Venus 25-30
// For EVEN signs: Venus 0-5, Mercury 5-12, Jupiter 12-20, Saturn 20-25, Mars 25-30
//
// The sign assigned corresponds to the sign owned by the ruling planet:
// Mars -> Aries(0), Saturn -> Aquarius(10), Jupiter -> Sagittarius(8),
// Mercury -> Gemini(2), Venus -> Libra(6)
// (Using standard Trimshamsha sign mappings per Parashara)
function calculateD30(longitude) {
    const si = signIndex(longitude);
    const deg = signDegree(longitude);
    // Trimshamsha ruler -> sign mapping (Parashara)
    // Mars=Aries, Saturn=Aquarius, Jupiter=Sagittarius, Mercury=Gemini, Venus=Libra
    const planetToSign = {
        Mars: 0, // Aries
        Saturn: 10, // Aquarius
        Jupiter: 8, // Sagittarius
        Mercury: 2, // Gemini
        Venus: 6, // Libra
    };
    let ruler;
    if (isOddSign(si)) {
        // Odd sign division
        if (deg < 5)
            ruler = 'Mars';
        else if (deg < 10)
            ruler = 'Saturn';
        else if (deg < 18)
            ruler = 'Jupiter';
        else if (deg < 25)
            ruler = 'Mercury';
        else
            ruler = 'Venus';
    }
    else {
        // Even sign division (reversed)
        if (deg < 5)
            ruler = 'Venus';
        else if (deg < 12)
            ruler = 'Mercury';
        else if (deg < 20)
            ruler = 'Jupiter';
        else if (deg < 25)
            ruler = 'Saturn';
        else
            ruler = 'Mars';
    }
    return planetToSign[ruler];
}
// =============================================================================
// D40 - Khavedamsha
// =============================================================================
// Each sign divided into 40 parts of 0.75 degrees (45').
// Odd signs: start from Aries (0)
// Even signs: start from Libra (6)
function calculateD40(longitude) {
    const si = signIndex(longitude);
    const deg = signDegree(longitude);
    const partSize = 30 / 40; // 0.75
    const part = Math.floor(deg / partSize); // 0-39
    const startSign = isOddSign(si) ? 0 : 6; // Aries or Libra
    return mod12(startSign + part);
}
// =============================================================================
// D45 - Akshavedamsha
// =============================================================================
// Each sign divided into 45 parts of 0 40' (30/45 = 2/3 degree).
// Movable signs: start from Aries (0)
// Fixed signs: start from Leo (4)
// Dual signs: start from Sagittarius (8)
function calculateD45(longitude) {
    const si = signIndex(longitude);
    const deg = signDegree(longitude);
    const partSize = 30 / 45; // 0.6667
    const part = Math.floor(deg / partSize); // 0-44
    const modality = signModality(si);
    const startSigns = [0, 4, 8]; // Aries, Leo, Sag
    return mod12(startSigns[modality] + part);
}
// =============================================================================
// D60 - Shashtiamsha
// =============================================================================
// Each sign divided into 60 parts of 0.5 degrees (30').
// Classical 60-part mapping: the 60 deities cycle through the zodiac.
// Each part maps to a sign: part 0 = same sign, counting forward.
// (Standard Parashara: start from same sign, count forward through 60 parts)
function calculateD60(longitude) {
    const si = signIndex(longitude);
    const deg = signDegree(longitude);
    const partSize = 30 / 60; // 0.5 degrees
    const part = Math.floor(deg / partSize); // 0-59
    // Classical D60: start from same sign, each successive part advances
    // one sign. Since 60 parts cycle through 12 signs exactly 5 times,
    // the sign = (sign_of_planet + part) mod 12
    return mod12(si + part);
}
// =============================================================================
// D81 - Navanavamsa (Hidden Fortune)
// =============================================================================
// Each sign divided into 81 parts.
function calculateD81(longitude) {
    const si = signIndex(longitude);
    const deg = signDegree(longitude);
    const partSize = 30 / 81;
    const part = Math.floor(deg / partSize);
    return mod12(si + part);
}
// =============================================================================
// D108 - Ashtottaramsa (Final Fate of Life)
// =============================================================================
// Each sign divided into 108 parts.
function calculateD108(longitude) {
    const si = signIndex(longitude);
    const deg = signDegree(longitude);
    const partSize = 30 / 108;
    const part = Math.floor(deg / partSize);
    return mod12(si + part);
}
// =============================================================================
// D60 Classical Deity Names (for reference / display)
// =============================================================================
exports.D60_DEITY_NAMES = [
    'Ghora', 'Rakshasa', 'Deva', 'Kubera', 'Yaksha', 'Kinnara',
    'Bhrashta', 'Kulaghna', 'Garala', 'Vahni', 'Maya', 'Purishaka',
    'Apampathi', 'Marut', 'Kaala', 'Sarpa', 'Amrita', 'Indu',
    'Mridu', 'Komala', 'Heramba', 'Brahma', 'Vishnu', 'Maheshwara',
    'Deva', 'Ardra', 'Kalinasha', 'Kshitisha', 'Kamalakara', 'Gulika',
    'Mrityu', 'Kaala', 'Davagni', 'Ghora', 'Yama', 'Kantaka',
    'Sudha', 'Amrita', 'PurnaChandra', 'Vishagni', 'Kulanasha', 'Vamshakshaya',
    'Utpata', 'Kaala', 'Saumya', 'Komala', 'Sheetala', 'Karala',
    'Chandramukhi', 'Praveena', 'Kalapavaka', 'Dandayudha', 'Nirmala', 'Saumya',
    'Kroora', 'Atisheetala', 'Kalusha', 'Chandramukhi', 'Praveena', 'Saumya',
];
// =============================================================================
// Lookup: chart type to calculator
// =============================================================================
exports.DIVISIONAL_CALCULATORS = {
    D1: calculateD1, D2: calculateD2, D3: calculateD3, D4: calculateD4,
    D5: calculateD5, D6: calculateD6, D7: calculateD7, D8: calculateD8,
    D9: calculateD9, D10: calculateD10, D11: calculateD11, D12: calculateD12,
    D14: calculateD14, D16: calculateD16, D20: calculateD20, D21: calculateD21,
    D24: calculateD24, D27: calculateD27, D30: calculateD30,
    D40: calculateD40, D45: calculateD45, D60: calculateD60,
    D81: calculateD81, D108: calculateD108,
};
/**
 * Computes all 24 divisional charts (Shodashvarga + advanced) for every planet in the chart.
 *
 * @param chartData - Full natal chart data with planet longitudes
 * @returns A record keyed by DivisionalChart type, each containing an array of
 *          planet positions (sign index + sign name) within that varga.
 */
function calculateAllDivisionalCharts(chartData) {
    const result = {};
    const chartTypes = [
        'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9', 'D10',
        'D11', 'D12', 'D14', 'D16', 'D20', 'D21', 'D24', 'D27', 'D30',
        'D40', 'D45', 'D60', 'D81', 'D108',
    ];
    for (const chart of chartTypes) {
        const calc = exports.DIVISIONAL_CALCULATORS[chart];
        const entries = [];
        for (const planetPos of chartData.planets) {
            const si = calc(planetPos.longitude);
            entries.push({
                planet: planetPos.planet,
                sign: shared_1.ZODIAC_SIGNS[si],
                signIndex: si,
            });
        }
        result[chart] = entries;
    }
    return result;
}
/**
 * Computes all 24 divisional charts WITH each varga's Lagna (ascendant) sign.
 * Use this when you need to render the varga as a full chart with houses —
 * the ascendant longitude is run through the same fractional rule as the planets.
 */
function calculateAllDivisionalChartsWithLagna(chartData) {
    const result = {};
    const ascLongitude = chartData.ascendant.signIndex * 30 + (chartData.ascendant.degree ?? 0);
    const chartTypes = [
        'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9', 'D10',
        'D11', 'D12', 'D14', 'D16', 'D20', 'D21', 'D24', 'D27', 'D30',
        'D40', 'D45', 'D60', 'D81', 'D108',
    ];
    for (const chart of chartTypes) {
        const calc = exports.DIVISIONAL_CALCULATORS[chart];
        const entries = [];
        for (const planetPos of chartData.planets) {
            const si = calc(planetPos.longitude);
            entries.push({
                planet: planetPos.planet,
                sign: shared_1.ZODIAC_SIGNS[si],
                signIndex: si,
            });
        }
        result[chart] = {
            planets: entries,
            ascendantSignIndex: calc(ascLongitude),
        };
    }
    return result;
}
/**
 * Computes the storage-friendly shape: per-chart arrays + a `_lagna` companion.
 * This is what should be written to `kundli_charts.divisional_charts` going
 * forward — old code keeps working, new code can read the lagnas.
 */
function calculateAllDivisionalChartsForStorage(chartData) {
    const withLagna = calculateAllDivisionalChartsWithLagna(chartData);
    const arrays = {};
    const lagnas = {};
    for (const [key, value] of Object.entries(withLagna)) {
        arrays[key] = value.planets;
        lagnas[key] = value.ascendantSignIndex;
    }
    return { ...arrays, _lagna: lagnas };
}
/**
 * Normalizer for `divisional_charts` JSONB: returns the planets array + Lagna for
 * a given varga type, falling back to the natal ascendant sign index when the
 * stored row predates the `_lagna` companion (best-effort).
 */
function getVargaWithLagna(storage, type, fallbackAscSignIndex) {
    if (!storage || typeof storage !== 'object')
        return null;
    const s = storage;
    const planets = s[type];
    if (!Array.isArray(planets))
        return null;
    const lagnaMap = s._lagna;
    const ascendantSignIndex = typeof lagnaMap?.[type] === 'number' ? lagnaMap[type] : fallbackAscSignIndex;
    return { planets, ascendantSignIndex };
}
/**
 * Build a synthetic ChartData representing a varga as a full chart with houses.
 * Houses are assigned by counting forward from the varga Lagna (whole-sign houses).
 * Renders correctly through NorthIndianChart / SouthIndianChart.
 */
function buildVargaChartData(source, varga) {
    const ascSign = varga.ascendantSignIndex;
    const houses = Array.from({ length: 12 }, (_, i) => {
        const signIdx = mod12(ascSign + i);
        return {
            house: i + 1,
            cusp: signIdx * 30,
            sign: shared_1.ZODIAC_SIGNS[signIdx],
            signIndex: signIdx,
            lord: 'Sun', // placeholder — house lord isn't displayed in the card chart
            planets: varga.planets
                .filter((p) => p.signIndex === signIdx)
                .map((p) => p.planet),
        };
    });
    const planets = source.planets.map((natal) => {
        const v = varga.planets.find((p) => p.planet === natal.planet);
        const sIdx = v?.signIndex ?? natal.signIndex;
        return {
            ...natal,
            sign: shared_1.ZODIAC_SIGNS[sIdx],
            signIndex: sIdx,
            house: mod12(sIdx - ascSign) + 1,
        };
    });
    return {
        ...source,
        planets,
        houses,
        ascendant: {
            ...source.ascendant,
            sign: shared_1.ZODIAC_SIGNS[ascSign],
            signIndex: ascSign,
        },
    };
}
/**
 * Chandra Lagna (Moon Sign Chart) — re-cast the D1 chart with the Moon's natal
 * sign as House 1. All planet signs stay the same; house numbers shift.
 *
 * Reference: classical Vedic Chandra Lagna; treats Moon's position as the
 * ascendant for emotional/mental life analysis.
 */
function getMoonChart(source) {
    const moon = source.planets.find((p) => p.planet === 'Moon');
    if (!moon)
        return source;
    const moonSign = moon.signIndex;
    const houses = Array.from({ length: 12 }, (_, i) => {
        const signIdx = mod12(moonSign + i);
        const existing = source.houses.find((h) => h.signIndex === signIdx);
        return {
            house: i + 1,
            cusp: signIdx * 30,
            sign: shared_1.ZODIAC_SIGNS[signIdx],
            signIndex: signIdx,
            lord: existing?.lord ?? 'Sun',
            planets: source.planets
                .filter((p) => p.signIndex === signIdx)
                .map((p) => p.planet),
        };
    });
    const planets = source.planets.map((p) => ({
        ...p,
        house: mod12(p.signIndex - moonSign) + 1,
    }));
    return {
        ...source,
        planets,
        houses,
        ascendant: {
            ...source.ascendant,
            sign: shared_1.ZODIAC_SIGNS[moonSign],
            signIndex: moonSign,
        },
    };
}
//# sourceMappingURL=divisionalCharts.js.map