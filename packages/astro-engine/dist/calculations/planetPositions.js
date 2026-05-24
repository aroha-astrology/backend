"use strict";
// =============================================================================
// Planet Position Calculations using Swiss Ephemeris (swisseph-wasm)
// =============================================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.dateToJulianDay = dateToJulianDay;
exports.calculatePlanetPositions = calculatePlanetPositions;
exports.calculateHouses = calculateHouses;
exports.calculateAscendant = calculateAscendant;
exports.calculateChart = calculateChart;
const shared_1 = require("@jyotish-ai/shared");
// =============================================================================
// SwissEph WASM Singleton
// =============================================================================
// Dynamic import to support both ESM and CommonJS contexts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sweInstance = null;
let initPromise = null;
async function getSwe() {
    if (sweInstance)
        return sweInstance;
    if (initPromise) {
        await initPromise;
        return sweInstance;
    }
    initPromise = (async () => {
        const { default: SwissEph } = await import('swisseph-wasm');
        const swe = new SwissEph();
        await swe.initSwissEph();
        sweInstance = swe;
    })();
    await initPromise;
    return sweInstance;
}
// =============================================================================
// Swiss Ephemeris Constants (matching swisseph-wasm constants)
// =============================================================================
const SE_SUN = 0;
const SE_MOON = 1;
const SE_MERCURY = 2;
const SE_VENUS = 3;
const SE_MARS = 4;
const SE_JUPITER = 5;
const SE_SATURN = 6;
const SE_MEAN_NODE = 10; // Rahu (Mean Node)
const SEFLG_SWIEPH = 2;
const SEFLG_SIDEREAL = 65536;
const SEFLG_SPEED = 256;
const SE_SIDM_LAHIRI = 1;
const SE_SIDM_KRISHNAMURTI = 5;
const SE_SIDM_B_V_RAMAN = 3;
// =============================================================================
// Ayanamsa Mapping
// =============================================================================
const AYANAMSA_MAP = {
    lahiri: SE_SIDM_LAHIRI,
    krishnamurti: SE_SIDM_KRISHNAMURTI,
    raman: SE_SIDM_B_V_RAMAN,
};
// Planet list for calculation (Ketu is derived from Rahu)
const PLANET_SE_IDS = [
    { planet: 'Sun', seId: SE_SUN },
    { planet: 'Moon', seId: SE_MOON },
    { planet: 'Mars', seId: SE_MARS },
    { planet: 'Mercury', seId: SE_MERCURY },
    { planet: 'Jupiter', seId: SE_JUPITER },
    { planet: 'Venus', seId: SE_VENUS },
    { planet: 'Saturn', seId: SE_SATURN },
    { planet: 'Rahu', seId: SE_MEAN_NODE },
];
// =============================================================================
// Helper Functions
// =============================================================================
function normalizeDegree(deg) {
    let d = deg % 360;
    if (d < 0)
        d += 360;
    return d;
}
function getSignIndex(longitude) {
    return Math.floor(normalizeDegree(longitude) / 30);
}
function getSignDegree(longitude) {
    return normalizeDegree(longitude) % 30;
}
function getNakshatraInfo(longitude) {
    const normalizedLong = normalizeDegree(longitude);
    const nakshatraIndex = Math.floor(normalizedLong / shared_1.NAKSHATRA_SPAN);
    const clampedIndex = Math.min(nakshatraIndex, 26);
    const positionInNakshatra = normalizedLong - clampedIndex * shared_1.NAKSHATRA_SPAN;
    const padaSpan = shared_1.NAKSHATRA_SPAN / 4;
    const pada = Math.min(Math.floor(positionInNakshatra / padaSpan) + 1, 4);
    return {
        index: clampedIndex,
        pada,
        lord: shared_1.NAKSHATRA_LORDS[clampedIndex],
        name: shared_1.NAKSHATRAS[clampedIndex],
    };
}
// =============================================================================
// Core Functions
// =============================================================================
/**
 * Convert a date/time with timezone offset to a Julian Day number.
 */
async function dateToJulianDay(year, month, day, hour, min, timezone) {
    const swe = await getSwe();
    const utHour = hour + min / 60 - timezone;
    return swe.julday(year, month, day, utHour);
}
/**
 * Calculate sidereal positions of all 9 Vedic planets.
 */
async function calculatePlanetPositions(jd, ayanamsa = 'lahiri') {
    const swe = await getSwe();
    // Set the sidereal mode
    const sidMode = AYANAMSA_MAP[ayanamsa];
    swe.set_sid_mode(sidMode, 0, 0);
    const calcFlags = SEFLG_SWIEPH | SEFLG_SIDEREAL | SEFLG_SPEED;
    const positions = [];
    let rahuLongitude = 0;
    let rahuLatitude = 0;
    let rahuSpeed = 0;
    for (const { planet, seId } of PLANET_SE_IDS) {
        // Use calc() which returns an object with named fields
        const result = swe.calc(jd, seId, calcFlags);
        const longitude = normalizeDegree(result.longitude);
        const latitude = result.latitude;
        const speed = result.longitudeSpeed;
        const isRetrograde = speed < 0;
        const signIndex = getSignIndex(longitude);
        const signDegree = getSignDegree(longitude);
        const nakshatraInfo = getNakshatraInfo(longitude);
        if (planet === 'Rahu') {
            rahuLongitude = longitude;
            rahuLatitude = latitude;
            rahuSpeed = speed;
        }
        positions.push({
            planet,
            longitude,
            latitude,
            speed,
            sign: shared_1.ZODIAC_SIGNS[signIndex],
            signIndex,
            signDegree,
            nakshatra: nakshatraInfo.name,
            nakshatraIndex: nakshatraInfo.index,
            nakshatraPada: nakshatraInfo.pada,
            nakshatraLord: nakshatraInfo.lord,
            isRetrograde,
            house: 0,
        });
    }
    // Calculate Ketu as Rahu + 180°
    const ketuLongitude = normalizeDegree(rahuLongitude + 180);
    const ketuSignIndex = getSignIndex(ketuLongitude);
    const ketuSignDegree = getSignDegree(ketuLongitude);
    const ketuNakshatraInfo = getNakshatraInfo(ketuLongitude);
    positions.push({
        planet: 'Ketu',
        longitude: ketuLongitude,
        latitude: -rahuLatitude,
        speed: rahuSpeed,
        sign: shared_1.ZODIAC_SIGNS[ketuSignIndex],
        signIndex: ketuSignIndex,
        signDegree: ketuSignDegree,
        nakshatra: ketuNakshatraInfo.name,
        nakshatraIndex: ketuNakshatraInfo.index,
        nakshatraPada: ketuNakshatraInfo.pada,
        nakshatraLord: ketuNakshatraInfo.lord,
        isRetrograde: true,
        house: 0,
    });
    return positions;
}
/**
 * Calculate house cusps for a given time and geographic location.
 */
async function calculateHouses(jd, lat, lng, system = 'W', ayanamsa = 'lahiri') {
    const swe = await getSwe();
    // Set sidereal mode before calling houses_ex
    const sidMode = AYANAMSA_MAP[ayanamsa];
    swe.set_sid_mode(sidMode, 0, 0);
    // houses_ex with SEFLG_SIDEREAL returns sidereal cusps directly
    const result = swe.houses_ex(jd, SEFLG_SIDEREAL, lat, lng, system);
    // result = { cusps: Float64Array[0..12], ascmc: Float64Array[0..9] }
    // ascmc[0] = Ascendant (sidereal when SEFLG_SIDEREAL is used)
    const siderealAsc = normalizeDegree(result.ascmc[0]);
    const ascSignIndex = getSignIndex(siderealAsc);
    const houses = [];
    for (let i = 1; i <= 12; i++) {
        let cusp;
        if (system === 'W') {
            // Whole sign: each house is one full sign starting from ascendant sign
            const houseSignIndex = (ascSignIndex + i - 1) % 12;
            cusp = houseSignIndex * 30;
        }
        else {
            // Other systems: use the computed sidereal cusps
            cusp = normalizeDegree(result.cusps[i]);
        }
        const signIndex = getSignIndex(cusp);
        houses.push({
            house: i,
            cusp,
            sign: shared_1.ZODIAC_SIGNS[signIndex],
            signIndex,
            lord: shared_1.SIGN_LORDS[shared_1.ZODIAC_SIGNS[signIndex]],
            planets: [],
        });
    }
    return houses;
}
/**
 * Calculate the ascendant (lagna) position.
 */
async function calculateAscendant(jd, lat, lng, ayanamsa = 'lahiri') {
    const swe = await getSwe();
    const sidMode = AYANAMSA_MAP[ayanamsa];
    swe.set_sid_mode(sidMode, 0, 0);
    const result = swe.houses_ex(jd, SEFLG_SIDEREAL, lat, lng, 'W');
    const siderealAsc = normalizeDegree(result.ascmc[0]);
    const signIndex = getSignIndex(siderealAsc);
    const signDegree = getSignDegree(siderealAsc);
    const nakshatraInfo = getNakshatraInfo(siderealAsc);
    return {
        sign: shared_1.ZODIAC_SIGNS[signIndex],
        signIndex,
        degree: signDegree,
        nakshatra: nakshatraInfo.name,
        nakshatraPada: nakshatraInfo.pada,
    };
}
/**
 * Assign planets to houses based on their sign positions and house cusps.
 */
function assignPlanetsToHouses(planets, houses) {
    const signToHouse = {};
    for (const h of houses) {
        signToHouse[h.signIndex] = h.house;
    }
    for (const planet of planets) {
        const houseNum = signToHouse[planet.signIndex];
        if (houseNum !== undefined) {
            planet.house = houseNum;
            houses[houseNum - 1].planets.push(planet.planet);
        }
    }
}
/**
 * Generate a complete chart with planets, houses, and ascendant.
 */
async function calculateChart(year, month, day, hour, min, timezone, lat, lng, ayanamsa = 'lahiri', houseSystem = 'W') {
    const swe = await getSwe();
    const sidMode = AYANAMSA_MAP[ayanamsa];
    swe.set_sid_mode(sidMode, 0, 0);
    const jd = await dateToJulianDay(year, month, day, hour, min, timezone);
    const [planets, houses, ascendant] = await Promise.all([
        calculatePlanetPositions(jd, ayanamsa),
        calculateHouses(jd, lat, lng, houseSystem, ayanamsa),
        calculateAscendant(jd, lat, lng, ayanamsa),
    ]);
    assignPlanetsToHouses(planets, houses);
    const ayanamsaValue = swe.get_ayanamsa(jd);
    return {
        planets,
        houses,
        ascendant,
        ayanamsa,
        ayanamsaValue,
        julianDay: jd,
    };
}
//# sourceMappingURL=planetPositions.js.map