// =============================================================================
// Regional Lunar/Solar Month Calculation
// =============================================================================
// India's four cultural regions disagree about lunar month names and era years
// for the same Gregorian date. This module derives the per-region view from
// already-computed sun/moon longitudes + tithi/paksha. Pure function; the
// caller supplies sidereal positions from Swiss Ephemeris.
//
// Conventions (matching Drik Panchang / Kalnirnay everyday display):
//   - Amanta: lunar month is named after the rashi the Sun is in. Mesha
//     (sidereal Aries) → Chaitra; Vrishabha → Vaishakha; ... ; Meena → Phalguna.
//   - Purnimanta: same lunar cycle, but the named month is shifted by half a
//     paksha — during Krishna paksha the Purnimanta month is one ahead of the
//     Amanta month.
//   - Solar (Bengali): month tracks sidereal Sun's rashi directly. Mesha →
//     Boishakh, etc.
//
// Era year is looked up from a seeded transition table when available
// (verified to a single day for 2024–2028); otherwise we fall back to a simple
// gregorianYear + offset estimate that is correct except in the ~3-week window
// straddling each calendar's new year.
//
// Adhik Maas (Purushottam Maas / Mol Maas / Mal Maas / Londa Maas) is the
// intercalary lunar month inserted ~every 32 months. We flag it via a small
// table of verified Gregorian ranges so the UI can mark those days distinctly
// and the regional detail line can prefix the doubled month with "Adhika".
// 12 month names in each regional convention. Order is the canonical
// Chaitra → Phalguna sequence for lunar (Amanta/Purnimanta), and the
// Boishakh → Choitro sequence for Bengali solar.
const LUNAR_MONTHS_NORTH = [
    'Chaitra', 'Vaishakha', 'Jyeshtha', 'Ashadha',
    'Shravana', 'Bhadrapada', 'Ashwin', 'Kartika',
    'Margashirsha', 'Pausha', 'Magha', 'Phalguna',
];
const LUNAR_MONTHS_SOUTH = LUNAR_MONTHS_NORTH;
// Marathi spellings (matches Kalnirnay).
const LUNAR_MONTHS_WEST = [
    'Chaitra', 'Vaishakh', 'Jyeshtha', 'Ashadh',
    'Shravan', 'Bhadrapad', 'Ashwin', 'Kartik',
    'Margashirsh', 'Paush', 'Magh', 'Phalgun',
];
const SOLAR_MONTHS_EAST = [
    'Boishakh', 'Joishtho', 'Ashadh', 'Srabon',
    'Bhadro', 'Ashwin', 'Kartik', 'Agrahayan',
    'Poush', 'Magh', 'Falgun', 'Choitro',
];
const YEAR_STARTS = {
    north: [
        { eraYear: 2081, startDate: '2024-04-09' },
        { eraYear: 2082, startDate: '2025-03-30' },
        { eraYear: 2083, startDate: '2026-03-19' },
        { eraYear: 2084, startDate: '2027-04-07' },
        { eraYear: 2085, startDate: '2028-03-27' },
    ],
    south: [
        { eraYear: 1946, startDate: '2024-04-09' },
        { eraYear: 1947, startDate: '2025-03-30' },
        { eraYear: 1948, startDate: '2026-03-19' },
        { eraYear: 1949, startDate: '2027-04-07' },
        { eraYear: 1950, startDate: '2028-03-27' },
    ],
    west: [
        { eraYear: 1946, startDate: '2024-04-09' },
        { eraYear: 1947, startDate: '2025-03-30' },
        { eraYear: 1948, startDate: '2026-03-19' },
        { eraYear: 1949, startDate: '2027-04-07' },
        { eraYear: 1950, startDate: '2028-03-27' },
    ],
    east: [
        { eraYear: 1431, startDate: '2024-04-14' },
        { eraYear: 1432, startDate: '2025-04-14' },
        { eraYear: 1433, startDate: '2026-04-14' },
        { eraYear: 1434, startDate: '2027-04-15' },
        { eraYear: 1435, startDate: '2028-04-14' },
    ],
};
const ERA_OFFSETS = {
    north: 57, // Vikram Samvat
    south: -78, // Shalivahana Shaka
    west: -78, // Shalivahana Shaka (Marathi convention)
    east: -593, // Bengali San
};
const CALENDAR_NAMES = {
    north: 'Vikram Samvat',
    south: 'Shalivahana Shaka',
    west: 'Shalivahana Shaka',
    east: 'Bengali San',
};
const MONTH_SYSTEMS = {
    north: 'purnimanta',
    south: 'amanta',
    west: 'amanta',
    east: 'solar',
};
const MONTH_NAMES = {
    north: LUNAR_MONTHS_NORTH,
    south: LUNAR_MONTHS_SOUTH,
    west: LUNAR_MONTHS_WEST,
    east: SOLAR_MONTHS_EAST,
};
const ADHIK_MAAS_RANGES = [
    { start: '2023-07-18', end: '2023-08-16', monthName: 'Shravana', label: 'Adhik Shravana 2023' },
    { start: '2026-05-17', end: '2026-06-15', monthName: 'Jyeshtha', label: 'Adhik Jyeshtha 2026' },
];
function findAdhikMaas(isoDate) {
    for (const range of ADHIK_MAAS_RANGES) {
        if (isoDate >= range.start && isoDate <= range.end)
            return range;
    }
    return null;
}
function lookupEraYear(region, isoDate) {
    const list = YEAR_STARTS[region];
    if (!list || list.length === 0)
        return null;
    let chosen = null;
    for (const entry of list) {
        if (isoDate >= entry.startDate)
            chosen = entry;
        else
            break;
    }
    return chosen ? chosen.eraYear : null;
}
function fallbackEraYear(region, gregorianYear, monthIndex) {
    const offset = ERA_OFFSETS[region] ?? 0;
    const adjustment = monthIndex === 11 ? -1 : 0;
    return gregorianYear + offset + adjustment;
}
export function calculateRegionalMonths(args) {
    const { isoDate, gregorianYear, sunSiderealLong, paksha } = args;
    const sunRashi = Math.floor(((sunSiderealLong % 360) + 360) % 360 / 30);
    const pakshaLower = paksha === 'Shukla' || paksha === 'shukla' ? 'shukla' : 'krishna';
    const amantaIndex = sunRashi;
    const purnimantaIndex = (sunRashi + (pakshaLower === 'krishna' ? 1 : 0)) % 12;
    const adhik = findAdhikMaas(isoDate);
    const buildLunar = (region, monthIndex) => {
        const seeded = lookupEraYear(region, isoDate);
        const year = seeded ?? fallbackEraYear(region, gregorianYear, monthIndex);
        return {
            region,
            calendar: CALENDAR_NAMES[region] || '',
            monthSystem: MONTH_SYSTEMS[region] || 'amanta',
            monthIndex,
            monthName: (MONTH_NAMES[region] || [])[monthIndex] || '',
            paksha: pakshaLower,
            year,
            ...(adhik ? { isAdhikMaas: true, adhikMaasLabel: adhik.label } : {}),
        };
    };
    const bengaliMonthIndex = sunRashi;
    const bengaliYearSeeded = lookupEraYear('east', isoDate);
    const bengaliYear = bengaliYearSeeded ?? fallbackEraYear('east', gregorianYear, bengaliMonthIndex);
    const east = {
        region: 'east',
        calendar: CALENDAR_NAMES.east || '',
        monthSystem: 'solar',
        monthIndex: bengaliMonthIndex,
        monthName: SOLAR_MONTHS_EAST[bengaliMonthIndex],
        year: bengaliYear,
        ...(adhik ? { isAdhikMaas: true, adhikMaasLabel: adhik.label } : {}),
    };
    return {
        north: buildLunar('north', purnimantaIndex),
        south: buildLunar('south', amantaIndex),
        west: buildLunar('west', amantaIndex),
        east,
    };
}
//# sourceMappingURL=regional.js.map