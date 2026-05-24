"use strict";
// =============================================================================
// Shadbala (Six-fold Strength) Calculations
// All values are in Virupas (1 Rupa = 60 Virupas)
// =============================================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateShadbala = calculateShadbala;
const shared_1 = require("@jyotish-ai/shared");
// =============================================================================
// Constants
// =============================================================================
/** The 7 planets that participate in Shadbala (no Rahu/Ketu). */
const SHADBALA_PLANETS = [
    'Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn',
];
/** Required minimum Virupas for each planet to be considered strong. */
const REQUIRED_VIRUPAS = {
    Sun: 390,
    Moon: 360,
    Mars: 300,
    Mercury: 420,
    Jupiter: 390,
    Venus: 330,
    Saturn: 300,
};
/** Naisargika (natural) strength - fixed values in Virupas. */
const NAISARGIKA_BALA = {
    Sun: 60,
    Moon: 51.43,
    Mars: 17.14,
    Mercury: 25.71,
    Jupiter: 34.29,
    Venus: 42.86,
    Saturn: 8.57,
};
/** Dig Bala strong houses: planet is strongest when in this house. */
const DIG_BALA_STRONG_HOUSE = {
    Jupiter: 1, // East (Ascendant)
    Mercury: 1, // East (Ascendant)
    Sun: 10, // South (MC)
    Mars: 10, // South (MC)
    Saturn: 7, // West (Descendant)
    Moon: 4, // North (IC)
    Venus: 4, // North (IC)
};
/** Saptavargaja dignity points for each relationship level. */
const SAPTAVARGAJA_POINTS = {
    moolatrikona: 45,
    own: 30,
    greatFriend: 22.5,
    friend: 15,
    neutral: 7.5,
    enemy: 3.75,
    greatEnemy: 1.875,
};
/** Moolatrikona signs and degree ranges. */
const MOOLATRIKONA = {
    Sun: { sign: 'Leo', startDeg: 0, endDeg: 20 },
    Moon: { sign: 'Taurus', startDeg: 3, endDeg: 30 },
    Mars: { sign: 'Aries', startDeg: 0, endDeg: 12 },
    Mercury: { sign: 'Virgo', startDeg: 15, endDeg: 20 },
    Jupiter: { sign: 'Sagittarius', startDeg: 0, endDeg: 10 },
    Venus: { sign: 'Libra', startDeg: 0, endDeg: 15 },
    Saturn: { sign: 'Aquarius', startDeg: 0, endDeg: 20 },
};
/** Tribhaga Bala rulers for day and night thirds. */
const TRIBHAGA_DAY = ['Mercury', 'Sun', 'Saturn'];
const TRIBHAGA_NIGHT = ['Moon', 'Venus', 'Mars'];
/** Weekday lords: 0=Sunday, 1=Monday, ... */
const WEEKDAY_LORDS = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'];
/** Hora lords sequence (planetary hours starting from sunrise). */
const HORA_SEQUENCE = ['Sun', 'Venus', 'Mercury', 'Moon', 'Saturn', 'Jupiter', 'Mars'];
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
/**
 * Get the planet position from chart data. Returns undefined for Rahu/Ketu.
 */
function getPlanetPos(chartData, planet) {
    return chartData.planets.find((p) => p.planet === planet);
}
/**
 * Determine the relationship between two planets:
 * 'friend', 'enemy', 'neutral', 'greatFriend', 'greatEnemy'
 */
function getPlanetRelation(planet, signLord) {
    if (planet === signLord)
        return 'friend'; // own sign treated as friend for relationship
    const friends = shared_1.PLANET_FRIENDS[planet] || [];
    const enemies = shared_1.PLANET_ENEMIES[planet] || [];
    if (friends.includes(signLord))
        return 'friend';
    if (enemies.includes(signLord))
        return 'enemy';
    return 'neutral';
}
/**
 * Calculate temporary (Tatkalika) friendship based on mutual positions.
 * Planets in 2, 3, 4, 10, 11, 12 from each other are temporary friends.
 */
function getTemporaryRelation(planet1House, planet2House) {
    let diff = ((planet2House - planet1House) % 12 + 12) % 12;
    // Houses 2,3,4,10,11,12 from planet1 => diff = 1,2,3,9,10,11
    if ([1, 2, 3, 9, 10, 11].includes(diff)) {
        return 'friend';
    }
    return 'enemy';
}
/**
 * Compound (Panchada) relationship combining natural + temporary.
 */
function getCompoundRelation(natural, temporary) {
    if (natural === 'friend' && temporary === 'friend')
        return 'greatFriend';
    if (natural === 'friend' && temporary === 'enemy')
        return 'neutral';
    if (natural === 'enemy' && temporary === 'friend')
        return 'neutral';
    if (natural === 'enemy' && temporary === 'enemy')
        return 'greatEnemy';
    if (natural === 'neutral' && temporary === 'friend')
        return 'friend';
    if (natural === 'neutral' && temporary === 'enemy')
        return 'enemy';
    return 'neutral';
}
/**
 * Get the weekday from Julian Day number.
 * 0=Sunday, 1=Monday, etc.
 */
function julianDayToWeekday(jd) {
    return (Math.floor(jd + 1.5) % 7);
}
/**
 * Approximate whether it's daytime based on Sun's house position.
 * Sun above horizon (houses 7-12 in natural order) = day.
 * Simplified: Sun in houses 7,8,9,10,11,12 = day.
 */
function isDaytime(chartData) {
    const sunPos = getPlanetPos(chartData, 'Sun');
    if (!sunPos)
        return true;
    return sunPos.house >= 7 && sunPos.house <= 12;
}
// =============================================================================
// 1. Sthana Bala (Positional Strength)
// =============================================================================
/**
 * Uchcha Bala: Strength based on exaltation/debilitation.
 * Maximum 60 Virupas at exact exaltation, 0 at exact debilitation.
 */
function calculateUchchaBala(planet, longitude) {
    const exaltData = shared_1.PLANET_EXALTATION[planet];
    if (!exaltData)
        return 30; // default neutral for planets without exaltation data
    // Exaltation point as absolute longitude
    const exaltSign = shared_1.ZODIAC_SIGNS.indexOf(exaltData.sign);
    const exaltDeg = exaltSign * 30 + exaltData.degree;
    // Debilitation is exactly 180° from exaltation
    const debilDeg = normalizeDegree(exaltDeg + 180);
    // Angular distance from debilitation point
    let dist = normalizeDegree(normalizeDegree(longitude) - debilDeg);
    if (dist > 180)
        dist = 360 - dist;
    // Uchcha Bala = (distance from debilitation / 180) * 60
    return (dist / 180) * 60;
}
/**
 * Saptavargaja Bala: Strength based on dignity in 7 divisional charts.
 * Simplified: uses D1 (Rasi) placement dignity.
 * Full implementation would check D1, D2, D3, D7, D9, D12, D30.
 * Here we compute the D1 contribution and scale it.
 */
function calculateSaptavargajaBala(planet, longitude, chartData) {
    const signIndex = getSignIndex(longitude);
    const signName = shared_1.ZODIAC_SIGNS[signIndex];
    const signDeg = normalizeDegree(longitude) % 30;
    const signLord = shared_1.SIGN_LORDS[signName];
    // Check Moolatrikona
    const mt = MOOLATRIKONA[planet];
    if (mt && signName === mt.sign && signDeg >= mt.startDeg && signDeg <= mt.endDeg) {
        return SAPTAVARGAJA_POINTS.moolatrikona;
    }
    // Check own sign
    const ownSigns = shared_1.PLANET_OWN_SIGNS[planet] || [];
    if (ownSigns.includes(signName)) {
        return SAPTAVARGAJA_POINTS.own;
    }
    // Get compound relationship
    const naturalRel = getPlanetRelation(planet, signLord);
    const planetPos = getPlanetPos(chartData, planet);
    const lordPos = getPlanetPos(chartData, signLord);
    let temporaryRel = 'friend';
    if (planetPos && lordPos) {
        temporaryRel = getTemporaryRelation(planetPos.house, lordPos.house);
    }
    const compound = getCompoundRelation(naturalRel, temporaryRel);
    return SAPTAVARGAJA_POINTS[compound] || SAPTAVARGAJA_POINTS.neutral;
}
/**
 * Ojhayugma Bala: Odd/Even sign and navamsa strength.
 * Male planets (Sun, Mars, Jupiter) get 15 Virupas in odd signs.
 * Female planets (Moon, Venus) get 15 Virupas in even signs.
 * Mercury (neutral) gets 15 Virupas in both.
 * Saturn gets 15 in odd signs.
 * Additional 15 for navamsa (same rule applied to D9 sign).
 */
function calculateOjhayugmaBala(planet, longitude) {
    const signIndex = getSignIndex(longitude);
    const isOddSign = signIndex % 2 === 0; // Aries=0 (odd), Taurus=1 (even), etc.
    // Navamsa sign: each navamsa = 3°20' = 3.333...°
    const degInSign = normalizeDegree(longitude) % 30;
    const navamsaIndex = Math.floor(degInSign / (30 / 9));
    // Navamsa sign starts from: for fire signs (0,4,8) -> Aries; earth (1,5,9) -> Capricorn;
    // air (2,6,10) -> Libra; water (3,7,11) -> Cancer
    const navamsaStartSign = [0, 9, 6, 3][signIndex % 4]; // element-based start
    const navamsaSignIndex = (navamsaStartSign + navamsaIndex) % 12;
    const isOddNavamsa = navamsaSignIndex % 2 === 0;
    const malePlanets = ['Sun', 'Mars', 'Jupiter', 'Saturn'];
    const femalePlanets = ['Moon', 'Venus'];
    let rasiPoints = 0;
    let navamsaPoints = 0;
    if (planet === 'Mercury') {
        // Mercury gets points in both odd and even
        rasiPoints = 15;
        navamsaPoints = 15;
    }
    else if (malePlanets.includes(planet)) {
        rasiPoints = isOddSign ? 15 : 0;
        navamsaPoints = isOddNavamsa ? 15 : 0;
    }
    else if (femalePlanets.includes(planet)) {
        rasiPoints = isOddSign ? 0 : 15;
        navamsaPoints = isOddNavamsa ? 0 : 15;
    }
    return rasiPoints + navamsaPoints;
}
/**
 * Kendra Bala: Strength from angular position relative to ascendant.
 * Planets in kendras (1,4,7,10) get 60 Virupas.
 * Planets in panaparas (2,5,8,11) get 30 Virupas.
 * Planets in apoklimas (3,6,9,12) get 15 Virupas.
 */
function calculateKendraBala(house) {
    if ([1, 4, 7, 10].includes(house))
        return 60;
    if ([2, 5, 8, 11].includes(house))
        return 30;
    return 15; // apoklima
}
/**
 * Drekkana Bala: Strength based on decanate (drekkana) of the planet.
 * First drekkana (0-10°): male planets get 15 Virupas.
 * Second drekkana (10-20°): neutral planets get 15 Virupas.
 * Third drekkana (20-30°): female planets get 15 Virupas.
 */
function calculateDrekkanaBala(planet, longitude) {
    const degInSign = normalizeDegree(longitude) % 30;
    const drekkana = Math.floor(degInSign / 10); // 0, 1, or 2
    const malePlanets = ['Sun', 'Mars', 'Jupiter'];
    const femalePlanets = ['Moon', 'Venus'];
    // Mercury and Saturn are considered neutral for this purpose
    if (drekkana === 0 && malePlanets.includes(planet))
        return 15;
    if (drekkana === 1 && (planet === 'Mercury' || planet === 'Saturn'))
        return 15;
    if (drekkana === 2 && femalePlanets.includes(planet))
        return 15;
    return 0;
}
/**
 * Total Sthana Bala: Sum of all positional sub-strengths.
 */
function calculateSthanaBala(planet, chartData) {
    const pos = getPlanetPos(chartData, planet);
    if (!pos)
        return 0;
    const uchcha = calculateUchchaBala(planet, pos.longitude);
    const saptavargaja = calculateSaptavargajaBala(planet, pos.longitude, chartData);
    const ojhayugma = calculateOjhayugmaBala(planet, pos.longitude);
    const kendra = calculateKendraBala(pos.house);
    const drekkana = calculateDrekkanaBala(planet, pos.longitude);
    return uchcha + saptavargaja + ojhayugma + kendra + drekkana;
}
// =============================================================================
// 2. Dig Bala (Directional Strength)
// =============================================================================
/**
 * Dig Bala: Strength based on house position relative to the strong house.
 * Maximum 60 Virupas in the strong house, 0 in the opposite house (180°).
 */
function calculateDigBala(planet, house) {
    const strongHouse = DIG_BALA_STRONG_HOUSE[planet];
    if (strongHouse === undefined)
        return 0;
    // Distance in houses (each house = 30°)
    let diff = Math.abs(house - strongHouse);
    if (diff > 6)
        diff = 12 - diff;
    // Convert to angular distance and compute Virupas
    const angularDist = diff * 30; // 0 to 180
    return ((180 - angularDist) / 180) * 60;
}
// =============================================================================
// 3. Kala Bala (Temporal Strength)
// =============================================================================
/**
 * Natonnata Bala: Diurnal/Nocturnal strength.
 * Day-strong planets (Sun, Jupiter, Venus) get up to 60 Virupas during day.
 * Night-strong planets (Moon, Mars, Saturn) get up to 60 Virupas at night.
 * Mercury gets 60 always (strong in both).
 */
function calculateNatonnataBala(planet, isDay) {
    const dayStrong = ['Sun', 'Jupiter', 'Venus'];
    const nightStrong = ['Moon', 'Mars', 'Saturn'];
    if (planet === 'Mercury')
        return 60;
    if (isDay && dayStrong.includes(planet))
        return 60;
    if (!isDay && nightStrong.includes(planet))
        return 60;
    return 0;
}
/**
 * Paksha Bala: Strength based on lunar phase.
 * Benefics (Jupiter, Venus, Moon, Mercury) are strong in Shukla Paksha.
 * Malefics (Sun, Mars, Saturn) are strong in Krishna Paksha.
 * Based on Moon-Sun angular distance.
 */
function calculatePakshaBala(planet, chartData) {
    const moonPos = getPlanetPos(chartData, 'Moon');
    const sunPos = getPlanetPos(chartData, 'Sun');
    if (!moonPos || !sunPos)
        return 30;
    // Angular distance Moon - Sun
    let moonSunDist = normalizeDegree(moonPos.longitude - sunPos.longitude);
    // Shukla Paksha: Moon ahead of Sun by 0-180° → benefics strong
    // Krishna Paksha: Moon ahead of Sun by 180-360° → malefics strong
    const isShukla = moonSunDist <= 180;
    const benefics = ['Jupiter', 'Venus', 'Moon', 'Mercury'];
    const malefics = ['Sun', 'Mars', 'Saturn'];
    // Strength proportional to phase
    let ratio;
    if (isShukla) {
        ratio = moonSunDist / 180;
    }
    else {
        ratio = (360 - moonSunDist) / 180;
    }
    if (benefics.includes(planet)) {
        return isShukla ? ratio * 60 : (1 - ratio) * 60;
    }
    if (malefics.includes(planet)) {
        return isShukla ? (1 - ratio) * 60 : ratio * 60;
    }
    return 30;
}
/**
 * Tribhaga Bala: Strength from ruling a third of day/night.
 * Day is divided into 3 equal parts: Mercury, Sun, Saturn rule them.
 * Night is divided into 3 equal parts: Moon, Venus, Mars rule them.
 * Jupiter always gets Tribhaga Bala.
 * Ruler of current third gets 60 Virupas.
 */
function calculateTribhagaBala(planet, chartData) {
    // Jupiter always gets tribhaga bala
    if (planet === 'Jupiter')
        return 60;
    const isDay = isDaytime(chartData);
    // Approximate which third we're in based on Sun's house
    // Sun in houses 10,11,12 → first third of day; 1,2,3 → last third
    const sunPos = getPlanetPos(chartData, 'Sun');
    if (!sunPos)
        return 0;
    // Simplified: use sun's position to estimate time of day
    // Houses 12,11,10 = morning; 9,8,7 = afternoon/evening  (reverse, since house 10 is noon)
    let third;
    if (isDay) {
        // Day divided into thirds
        const dayHouses = [12, 11, 10, 9, 8, 7];
        const idx = dayHouses.indexOf(sunPos.house);
        if (idx < 2)
            third = 0;
        else if (idx < 4)
            third = 1;
        else
            third = 2;
        if (TRIBHAGA_DAY[third] === planet)
            return 60;
    }
    else {
        // Night divided into thirds
        const nightHouses = [6, 5, 4, 3, 2, 1];
        const idx = nightHouses.indexOf(sunPos.house);
        if (idx < 2)
            third = 0;
        else if (idx < 4)
            third = 1;
        else
            third = 2;
        if (TRIBHAGA_NIGHT[third] === planet)
            return 60;
    }
    return 0;
}
/**
 * Varsha/Masa/Dina/Hora Bala: Strength from ruling the year, month, day, or hour.
 * Dina lord (weekday lord) gets 45 Virupas.
 * Hora lord gets 60 Virupas.
 * Simplified: we calculate Dina + Hora bala.
 */
function calculateVarshaMasaDinaHoraBala(planet, chartData) {
    let total = 0;
    const jd = chartData.julianDay;
    const weekday = julianDayToWeekday(jd);
    // Dina Bala: lord of the weekday
    const dinaLord = WEEKDAY_LORDS[weekday];
    if (planet === dinaLord) {
        total += 45;
    }
    // Hora Bala: Planetary hour
    // The first hora of a day is ruled by the weekday lord.
    // Each subsequent hora follows the sequence with an interval of 3
    // (Sun, Venus, Mercury, Moon, Saturn, Jupiter, Mars and repeat).
    // Simplified: we compute the hora index from JD fractional part.
    const dayFraction = (jd + 0.5) - Math.floor(jd + 0.5); // fraction since midnight UT
    // Approximate sunrise as 6:00 UT (simplified)
    const hoursSinceSunrise = (dayFraction - 0.25) * 24;
    const horaIndex = Math.floor(((hoursSinceSunrise % 24) + 24) % 24);
    // The weekday lord starts at sunrise; the sequence follows HORA_SEQUENCE
    // Find the weekday lord's index in HORA_SEQUENCE
    const startIndex = HORA_SEQUENCE.indexOf(dinaLord);
    const currentHoraLord = HORA_SEQUENCE[(startIndex + horaIndex) % 7];
    if (planet === currentHoraLord) {
        total += 60;
    }
    // Masa lord: lord of the lunar month (roughly the sign lord of Moon)
    // Simplified approximation
    const moonPos = getPlanetPos(chartData, 'Moon');
    if (moonPos) {
        const masaLord = shared_1.SIGN_LORDS[moonPos.sign];
        if (planet === masaLord) {
            total += 30;
        }
    }
    // Varsha lord: lord of the year
    // The year lord cycles through weekday lords. Simplified: year % 7
    // We derive an approximate year from JD
    const approxYear = Math.floor((jd - 2451545) / 365.25) + 2000;
    const varshaLord = WEEKDAY_LORDS[approxYear % 7];
    if (planet === varshaLord) {
        total += 15;
    }
    return total;
}
/**
 * Total Kala Bala.
 */
function calculateKalaBala(planet, chartData) {
    const isDay = isDaytime(chartData);
    const natonnata = calculateNatonnataBala(planet, isDay);
    const paksha = calculatePakshaBala(planet, chartData);
    const tribhaga = calculateTribhagaBala(planet, chartData);
    const varshEtc = calculateVarshaMasaDinaHoraBala(planet, chartData);
    return natonnata + paksha + tribhaga + varshEtc;
}
// =============================================================================
// 4. Cheshta Bala (Motional Strength)
// =============================================================================
/**
 * Cheshta Bala: Strength from retrograde/direct motion.
 * Retrograde = 60 Virupas (maximum cheshta bala)
 * Stationary = 45 Virupas
 * Direct with normal speed = varies based on speed ratio
 * Sun and Moon have no Cheshta Bala in the traditional sense,
 * but we assign them a baseline.
 */
function calculateCheshtaBala(planet, chartData) {
    // Sun and Moon don't go retrograde; they get a fixed Cheshta Bala
    if (planet === 'Sun' || planet === 'Moon') {
        // Sun's Cheshta Bala is based on Ayana (declination-related), simplified to 30
        return 30;
    }
    const pos = getPlanetPos(chartData, planet);
    if (!pos)
        return 0;
    const speed = pos.speed;
    // Retrograde → maximum strength (60)
    if (speed < 0)
        return 60;
    // Average daily motions (degrees per day) for reference
    const avgSpeeds = {
        Mars: 0.524,
        Mercury: 1.383,
        Jupiter: 0.083,
        Venus: 1.2,
        Saturn: 0.033,
    };
    const avgSpeed = avgSpeeds[planet];
    if (!avgSpeed)
        return 30;
    // If nearly stationary (speed < 10% of average), give 45 Virupas
    if (Math.abs(speed) < avgSpeed * 0.1)
        return 45;
    // Otherwise scale based on deviation from average
    // Faster motion = less cheshta bala, slower = more
    const ratio = speed / avgSpeed;
    if (ratio <= 1) {
        // Slower than average → 30 to 45 Virupas
        return 30 + (1 - ratio) * 15;
    }
    else {
        // Faster than average → 15 to 30 Virupas
        return Math.max(15, 30 - (ratio - 1) * 15);
    }
}
// =============================================================================
// 5. Naisargika Bala (Natural Strength)
// =============================================================================
/**
 * Naisargika Bala is a fixed, invariant strength for each planet.
 */
function calculateNaisargikaBala(planet) {
    return NAISARGIKA_BALA[planet] || 0;
}
// =============================================================================
// 6. Drik Bala (Aspectual Strength)
// =============================================================================
/**
 * Drik Bala: Strength from aspects received by benefic/malefic planets.
 * Benefic aspects add strength, malefic aspects reduce it.
 *
 * Aspects in Vedic astrology:
 * - All planets aspect the 7th house from them (180° = full aspect)
 * - Mars also aspects 4th and 8th (90° and 210°)
 * - Jupiter also aspects 5th and 9th (120° and 240°)
 * - Saturn also aspects 3rd and 10th (60° and 270°)
 *
 * Strength of aspect: full at exact, proportional otherwise.
 */
function calculateDrikBala(planet, chartData) {
    const pos = getPlanetPos(chartData, planet);
    if (!pos)
        return 0;
    const benefics = ['Jupiter', 'Venus', 'Mercury', 'Moon'];
    const malefics = ['Sun', 'Mars', 'Saturn'];
    let totalDrik = 0;
    for (const other of SHADBALA_PLANETS) {
        if (other === planet)
            continue;
        const otherPos = getPlanetPos(chartData, other);
        if (!otherPos)
            continue;
        // House distance from other planet to this planet
        let houseDiff = ((pos.house - otherPos.house) % 12 + 12) % 12;
        // Check if the other planet aspects this planet
        let aspectStrength = 0;
        // All planets have 7th aspect (houseDiff = 6 since we count from 0)
        if (houseDiff === 6) {
            aspectStrength = 60; // full aspect
        }
        // Special aspects
        if (other === 'Mars') {
            if (houseDiff === 3)
                aspectStrength = 45; // 4th aspect (3/4 strength)
            if (houseDiff === 7)
                aspectStrength = 60; // 8th aspect (full)
        }
        if (other === 'Jupiter') {
            if (houseDiff === 4)
                aspectStrength = 60; // 5th aspect (full)
            if (houseDiff === 8)
                aspectStrength = 60; // 9th aspect (full)
        }
        if (other === 'Saturn') {
            if (houseDiff === 2)
                aspectStrength = 45; // 3rd aspect (3/4 strength)
            if (houseDiff === 9)
                aspectStrength = 60; // 10th aspect (full)
        }
        if (aspectStrength > 0) {
            if (benefics.includes(other)) {
                totalDrik += aspectStrength / 4; // Benefic aspect adds strength
            }
            else if (malefics.includes(other)) {
                totalDrik -= aspectStrength / 4; // Malefic aspect reduces strength
            }
        }
    }
    // Normalize: Drik Bala can be negative, but we floor at 0 and cap at 60
    return Math.max(0, Math.min(60, 30 + totalDrik));
}
// =============================================================================
// Main Shadbala Function
// =============================================================================
/**
 * Calculate the complete Shadbala (six-fold strength) for all 7 planets.
 *
 * @param chartData - Complete chart data with planet positions and houses
 * @returns Array of PlanetShadbala for Sun, Moon, Mars, Mercury, Jupiter, Venus, Saturn
 */
function calculateShadbala(chartData) {
    const results = [];
    for (const planet of SHADBALA_PLANETS) {
        const pos = getPlanetPos(chartData, planet);
        if (!pos)
            continue;
        const sthanaBala = calculateSthanaBala(planet, chartData);
        const digBala = calculateDigBala(planet, pos.house);
        const kalaBala = calculateKalaBala(planet, chartData);
        const cheshtaBala = calculateCheshtaBala(planet, chartData);
        const naisargikaBala = calculateNaisargikaBala(planet);
        const drikBala = calculateDrikBala(planet, chartData);
        const totalVirupas = sthanaBala + digBala + kalaBala + cheshtaBala + naisargikaBala + drikBala;
        const requiredVirupas = REQUIRED_VIRUPAS[planet] || 300;
        results.push({
            planet,
            sthanaBala: Math.round(sthanaBala * 100) / 100,
            digBala: Math.round(digBala * 100) / 100,
            kalaBala: Math.round(kalaBala * 100) / 100,
            cheshtaBala: Math.round(cheshtaBala * 100) / 100,
            naisargikaBala: Math.round(naisargikaBala * 100) / 100,
            drikBala: Math.round(drikBala * 100) / 100,
            totalVirupas: Math.round(totalVirupas * 100) / 100,
            requiredVirupas,
            isStrong: totalVirupas >= requiredVirupas,
        });
    }
    return results;
}
//# sourceMappingURL=shadbala.js.map