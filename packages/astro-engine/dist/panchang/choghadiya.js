"use strict";
// =============================================================================
// Choghadiya Calculation
// =============================================================================
// Choghadiya divides day and night into 8 periods each (16 total per day).
// Each period is named after one of 7 types, cycling per the weekday lord.
// Types: Amrit, Shubh, Labh, Char (good/neutral), Rog, Kaal, Udveg (bad)
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateChoghadiya = calculateChoghadiya;
// Choghadiya names and their nature
const CHOGHADIYA_TYPES = {
    Amrit: 'good',
    Shubh: 'good',
    Labh: 'good',
    Char: 'neutral',
    Rog: 'bad',
    Kaal: 'bad',
    Udveg: 'bad',
};
// Day Choghadiya sequence starting planet for each weekday (0=Sunday)
// The sequence of choghadiyas is determined by the weekday lord.
// Order of choghadiya cycling: Udveg, Char, Labh, Amrit, Kaal, Shubh, Rog
const CHOGHADIYA_CYCLE = ['Udveg', 'Char', 'Labh', 'Amrit', 'Kaal', 'Shubh', 'Rog'];
// Starting index in CHOGHADIYA_CYCLE for day choghadiya by weekday
// Sunday=Udveg(0), Monday=Amrit(3), Tuesday=Rog(6), Wednesday=Labh(2),
// Thursday=Shubh(5), Friday=Char(1), Saturday=Kaal(4)
const DAY_START_INDEX = {
    0: 0, // Sunday -> Udveg
    1: 3, // Monday -> Amrit
    2: 6, // Tuesday -> Rog
    3: 2, // Wednesday -> Labh
    4: 5, // Thursday -> Shubh
    5: 1, // Friday -> Char
    6: 4, // Saturday -> Kaal
};
// Night choghadiya starting index by weekday
// Sunday=Shubh(5), Monday=Kaal(4), Tuesday=Labh(2), Wednesday=Udveg(0),
// Thursday=Amrit(3), Friday=Rog(6), Saturday=Char(1)
const NIGHT_START_INDEX = {
    0: 5, // Sunday -> Shubh
    1: 4, // Monday -> Kaal
    2: 2, // Tuesday -> Labh
    3: 0, // Wednesday -> Udveg
    4: 3, // Thursday -> Amrit
    5: 6, // Friday -> Rog
    6: 1, // Saturday -> Char
};
/**
 * Parse a time string "HH:MM" into total minutes from midnight.
 */
function parseTime(time) {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
}
/**
 * Format total minutes from midnight into "HH:MM".
 */
function formatTime(totalMinutes) {
    let mins = totalMinutes;
    if (mins < 0)
        mins += 24 * 60;
    if (mins >= 24 * 60)
        mins -= 24 * 60;
    const h = Math.floor(mins / 60);
    const m = Math.floor(mins % 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
/**
 * Calculate all 16 Choghadiya periods (8 day + 8 night) for a given day.
 *
 * @param sunrise - Sunrise time as "HH:MM"
 * @param sunset - Sunset time as "HH:MM"
 * @param dayOfWeek - Day of week (0=Sunday, ..., 6=Saturday)
 * @returns Array of 16 Choghadiya periods (8 day followed by 8 night)
 */
function calculateChoghadiya(sunrise, sunset, dayOfWeek) {
    const sunriseMin = parseTime(sunrise);
    const sunsetMin = parseTime(sunset);
    const dayDuration = sunsetMin - sunriseMin;
    const nightDuration = 24 * 60 - dayDuration;
    const dayPartDuration = dayDuration / 8;
    const nightPartDuration = nightDuration / 8;
    const results = [];
    // Day Choghadiya (8 periods from sunrise to sunset)
    const dayStartIdx = DAY_START_INDEX[dayOfWeek];
    for (let i = 0; i < 8; i++) {
        const cycleIdx = (dayStartIdx + i) % 7;
        const name = CHOGHADIYA_CYCLE[cycleIdx];
        const startMin = sunriseMin + i * dayPartDuration;
        const endMin = startMin + dayPartDuration;
        results.push({
            name,
            type: CHOGHADIYA_TYPES[name],
            startTime: formatTime(startMin),
            endTime: formatTime(endMin),
        });
    }
    // Night Choghadiya (8 periods from sunset to next sunrise)
    const nightStartIdx = NIGHT_START_INDEX[dayOfWeek];
    for (let i = 0; i < 8; i++) {
        const cycleIdx = (nightStartIdx + i) % 7;
        const name = CHOGHADIYA_CYCLE[cycleIdx];
        const startMin = sunsetMin + i * nightPartDuration;
        const endMin = startMin + nightPartDuration;
        results.push({
            name,
            type: CHOGHADIYA_TYPES[name],
            startTime: formatTime(startMin),
            endTime: formatTime(endMin),
        });
    }
    return results;
}
//# sourceMappingURL=choghadiya.js.map