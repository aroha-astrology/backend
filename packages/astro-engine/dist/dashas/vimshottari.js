"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateVimshottariDasha = calculateVimshottariDasha;
const shared_1 = require("@jyotish-ai/shared");
// ============================================================
// Helpers
// ============================================================
const MS_PER_DAY = 86_400_000;
const DAYS_PER_YEAR = 365.25;
const MS_PER_YEAR = DAYS_PER_YEAR * MS_PER_DAY;
/** Add a fractional number of years to a Date, returning a new Date. */
function addYears(date, years) {
    return new Date(date.getTime() + years * MS_PER_YEAR);
}
/** Is `date` within [start, end)? */
function isDateInRange(date, start, end) {
    const t = date.getTime();
    return t >= start.getTime() && t < end.getTime();
}
// ============================================================
// Core: Nakshatra from Moon longitude
// ============================================================
/**
 * Returns the 0-based nakshatra index for a given sidereal Moon longitude (0-360).
 */
function getNakshatraIndex(moonLongitude) {
    const normalized = ((moonLongitude % 360) + 360) % 360;
    return Math.floor(normalized / shared_1.NAKSHATRA_SPAN);
}
/**
 * Returns the fraction of the nakshatra already traversed by the Moon.
 * 0 = Moon is at the very start; 1 = Moon is at the very end.
 */
function getNakshatraTraversedFraction(moonLongitude) {
    const normalized = ((moonLongitude % 360) + 360) % 360;
    const posInNakshatra = normalized % shared_1.NAKSHATRA_SPAN;
    return posInNakshatra / shared_1.NAKSHATRA_SPAN;
}
const LEVEL_SEQUENCE = [
    'mahadasha',
    'antardasha',
    'pratyantardasha',
    'sookshma',
    'prana',
];
/**
 * Build sub-periods for a given parent period.
 *
 * Within every dasha level the 9 planets cycle in Vimshottari order,
 * starting from the planet that owns the parent period.  The duration
 * of each sub-lord's period is proportional to the Vimshottari year
 * allocation of both the parent planet and the sub-lord planet:
 *
 *   subDuration = parentDuration * (subLordYears / VIMSHOTTARI_TOTAL_YEARS)
 *
 * @param startPlanet  Planet that owns the parent period.
 * @param startDate    Start date of the parent period.
 * @param parentYears  Duration of the parent period **in years**.
 * @param depth        0 = mahadasha, 1 = antardasha, ... 4 = prana.
 * @param currentDate  "Now" – used only to set `isActive` flags.
 * @param maxDepth     Deepest level to calculate (default 4 = prana).
 */
function buildSubPeriods(startPlanet, startDate, parentYears, depth, currentDate, maxDepth = 4) {
    if (depth > maxDepth)
        return [];
    const level = LEVEL_SEQUENCE[depth];
    const startIdx = shared_1.VIMSHOTTARI_ORDER.indexOf(startPlanet);
    const periods = [];
    let cursor = new Date(startDate.getTime());
    for (let i = 0; i < 9; i++) {
        const planet = shared_1.VIMSHOTTARI_ORDER[(startIdx + i) % 9];
        const durationYears = parentYears * (shared_1.VIMSHOTTARI_YEARS[planet] / shared_1.VIMSHOTTARI_TOTAL_YEARS);
        const endDate = addYears(cursor, durationYears);
        const isActive = isDateInRange(currentDate, cursor, endDate);
        const period = {
            planet,
            startDate: new Date(cursor.getTime()),
            endDate,
            isActive,
            level,
            subPeriods: isActive
                ? buildSubPeriods(planet, cursor, durationYears, depth + 1, currentDate, maxDepth)
                : [],
        };
        periods.push(period);
        cursor = endDate;
    }
    return periods;
}
// ============================================================
// Main entry point
// ============================================================
/**
 * Calculate the full Vimshottari Dasha tree for a given Moon longitude
 * and birth date.
 *
 * The starting Mahadasha lord is the nakshatra lord of the Moon's birth
 * nakshatra.  The **balance** of the first dasha is the remaining
 * (un-traversed) fraction of that nakshatra multiplied by the lord's
 * total dasha years.
 *
 * Five levels are computed for the currently active branch:
 * Mahadasha -> Antardasha -> Pratyantardasha -> Sookshma -> Prana.
 *
 * @param moonLongitude  Sidereal longitude of the Moon (0-360 degrees).
 * @param birthDate      Date/time of birth.
 * @returns              A `VimshottariDasha` object.
 */
function calculateVimshottariDasha(moonLongitude, birthDate) {
    const now = new Date();
    // 1. Determine starting dasha lord from Moon's nakshatra
    const nakshatraIdx = getNakshatraIndex(moonLongitude);
    const startingLord = shared_1.NAKSHATRA_LORDS[nakshatraIdx];
    // 2. Balance of the first dasha
    //    The fraction of the nakshatra already traversed has been "used up",
    //    so the remaining fraction gives the balance.
    const traversed = getNakshatraTraversedFraction(moonLongitude);
    const balanceFraction = 1 - traversed;
    const firstDashaFullYears = shared_1.VIMSHOTTARI_YEARS[startingLord];
    const firstDashaBalanceYears = firstDashaFullYears * balanceFraction;
    // 3. Build mahadashas covering 120 years from birth.
    //    The first dasha uses the balance; subsequent dashas use full years.
    //    After the first 9 planets the sequence wraps, but the total of
    //    balance + remaining 8 full dashas + wrap-around always equals 120 years.
    const startIdx = shared_1.VIMSHOTTARI_ORDER.indexOf(startingLord);
    const mahadashas = [];
    let cursor = new Date(birthDate.getTime());
    let accumulatedYears = 0;
    let periodCount = 0;
    while (accumulatedYears < shared_1.VIMSHOTTARI_TOTAL_YEARS) {
        const planet = shared_1.VIMSHOTTARI_ORDER[(startIdx + periodCount) % 9];
        let durationYears;
        if (periodCount === 0) {
            // First mahadasha uses the balance
            durationYears = firstDashaBalanceYears;
        }
        else {
            durationYears = shared_1.VIMSHOTTARI_YEARS[planet];
        }
        // Clamp so we don't exceed 120 years total
        if (accumulatedYears + durationYears > shared_1.VIMSHOTTARI_TOTAL_YEARS) {
            durationYears = shared_1.VIMSHOTTARI_TOTAL_YEARS - accumulatedYears;
        }
        const endDate = addYears(cursor, durationYears);
        const isActive = isDateInRange(now, cursor, endDate);
        const period = {
            planet,
            startDate: new Date(cursor.getTime()),
            endDate,
            isActive,
            level: 'mahadasha',
            // Compute deeper levels only for the active branch (performance)
            subPeriods: isActive
                ? buildSubPeriods(planet, cursor, durationYears, 1, now, 4)
                : [],
        };
        mahadashas.push(period);
        accumulatedYears += durationYears;
        cursor = endDate;
        periodCount++;
    }
    // 4. Find currently active periods at each level
    const currentMahadasha = mahadashas.find((p) => p.isActive) ?? mahadashas[0];
    const currentAntardasha = currentMahadasha.subPeriods.find((p) => p.isActive) ??
        currentMahadasha.subPeriods[0];
    const currentPratyantardasha = currentAntardasha?.subPeriods.find((p) => p.isActive) ??
        currentAntardasha?.subPeriods[0];
    return {
        mahadashas,
        currentMahadasha,
        currentAntardasha,
        currentPratyantardasha,
    };
}
//# sourceMappingURL=vimshottari.js.map