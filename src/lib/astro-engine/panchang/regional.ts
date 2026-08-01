// @ts-nocheck
// =============================================================================
// Regional Lunar/Solar Month Calculation
// =============================================================================
// India's cultural regions disagree about lunar month names and era years
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

import type { RegionId, RegionalMonth, MonthSystem } from '@aroha-astrology/shared';

// 12 month names in each regional convention. Order is the canonical
// Chaitra → Phalguna sequence for lunar (Amanta/Purnimanta), and the
// Boishakh → Choitro sequence for Bengali solar.

const LUNAR_MONTHS_NORTH: string[] = [
  'Chaitra',
  'Vaishakha',
  'Jyeshtha',
  'Ashadha',
  'Shravana',
  'Bhadrapada',
  'Ashwin',
  'Kartika',
  'Margashirsha',
  'Pausha',
  'Magha',
  'Phalguna',
];

const LUNAR_MONTHS_SOUTH = LUNAR_MONTHS_NORTH;

// Marathi spellings (matches Kalnirnay).
const LUNAR_MONTHS_WEST: string[] = [
  'Chaitra',
  'Vaishakh',
  'Jyeshtha',
  'Ashadh',
  'Shravan',
  'Bhadrapad',
  'Ashwin',
  'Kartik',
  'Margashirsh',
  'Paush',
  'Magh',
  'Phalgun',
];

const SOLAR_MONTHS_EAST: string[] = [
  'Boishakh',
  'Joishtho',
  'Ashadh',
  'Srabon',
  'Bhadro',
  'Ashwin',
  'Kartik',
  'Agrahayan',
  'Poush',
  'Magh',
  'Falgun',
  'Choitro',
];

// Gujarati spellings (amanta, like West, but its own new-year point — see
// YEAR_STARTS.gujarat).
const LUNAR_MONTHS_GUJARAT: string[] = [
  'Chaitra',
  'Vaishakh',
  'Jeth',
  'Aashadh',
  'Shravan',
  'Bhadarvo',
  'Aaso',
  'Kartak',
  'Magshar',
  'Posh',
  'Maha',
  'Fagan',
];

const SOLAR_MONTHS_ODISHA: string[] = [
  'Baisakha',
  'Jaistha',
  'Ashadha',
  'Shraban',
  'Bhadraba',
  'Aswina',
  'Kartika',
  'Margasira',
  'Pousa',
  'Magha',
  'Phalguna',
  'Chaitra',
];

const SOLAR_MONTHS_ASSAM: string[] = [
  'Bohag',
  'Jeth',
  'Ahar',
  'Xaon',
  'Bhador',
  'Aahin',
  'Kati',
  'Aghon',
  'Puh',
  'Magh',
  'Fagun',
  'Sot',
];

const SOLAR_MONTHS_TAMIL: string[] = [
  'Chithirai',
  'Vaikasi',
  'Aani',
  'Aadi',
  'Aavani',
  'Purattasi',
  'Aippasi',
  'Karthikai',
  'Margazhi',
  'Thai',
  'Maasi',
  'Panguni',
];

// Starts at Chingam (Simha/Leo rashi), not Mesha — see malayalamIndex below.
const SOLAR_MONTHS_MALAYALAM: string[] = [
  'Chingam',
  'Kanni',
  'Thulam',
  'Vrischikam',
  'Dhanu',
  'Makaram',
  'Kumbham',
  'Meenam',
  'Medam',
  'Edavam',
  'Midhunam',
  'Karkidakam',
];

// Era-year transitions seeded in the DB and mirrored here so the engine works
// without a DB round-trip. Verified against Drik Panchang (Chaitra Shukla
// Pratipada for lunisolar; Mesha Sankranti for Bengali). Spans 2024–2028 so
// any 2-year window inside the date picker resolves accurately.

interface YearStart {
  eraYear: number;
  startDate: string; // YYYY-MM-DD, inclusive
}

const YEAR_STARTS: Record<RegionId, YearStart[]> = {
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
  // Kannada Ugadi shares the same Shalivahana Shaka era + Chaitra Shukla
  // Pratipada new-year point as Telugu ('south') — same table, split into its
  // own RegionId only so it can get its own dropdown label.
  kannada: [
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
  // Kartik Shukla Pratipada (day after Diwali) — a different new-year point
  // than north's Chaitra-based table, so it needs its own boundary dates.
  // Verified against drikpanchang.com/festivals/gujarati-newyear (per-year
  // pages, Aug 2026).
  gujarat: [
    { eraYear: 2081, startDate: '2024-11-02' },
    { eraYear: 2082, startDate: '2025-10-22' },
    { eraYear: 2083, startDate: '2026-11-10' },
    { eraYear: 2084, startDate: '2027-10-30' },
    { eraYear: 2085, startDate: '2028-10-18' },
  ],
  // Pana Sankranti (Maha Vishuba Sankranti). Verified against
  // drikpanchang.com's Mesha Sankranti transit times + hindupad.com/
  // bhaktibharat.com's published Odia New Year dates (Aug 2026) — Odisha
  // observes whichever Gregorian calendar day contains the sidereal Mesha
  // transit moment, with no sunset cutoff (confirmed self-consistent across
  // all 4 independently-sourced years below; 2028 extrapolated from the same
  // rule applied to drikpanchang's raw transit moment).
  odisha: [
    { eraYear: 1946, startDate: '2024-04-13' },
    { eraYear: 1947, startDate: '2025-04-14' },
    { eraYear: 1948, startDate: '2026-04-14' },
    { eraYear: 1949, startDate: '2027-04-14' },
    { eraYear: 1950, startDate: '2028-04-13' },
  ],
  // Puthandu. Verified 2026/2027 directly; other years derived from
  // drikpanchang's raw Mesha Sankranti transit moment using the
  // sunrise/sunset cutoff rule Tamil Nadu almanacs use (after-sunset transit
  // ⇒ next day) — see comment on Nanakshahi below re: same-source rigor.
  tamil: [
    { eraYear: 1946, startDate: '2024-04-14' },
    { eraYear: 1947, startDate: '2025-04-14' },
    { eraYear: 1948, startDate: '2026-04-14' },
    { eraYear: 1949, startDate: '2027-04-14' },
    { eraYear: 1950, startDate: '2028-04-14' },
  ],
  // Chingam 1. Kollam Era's new-year window (~mid-August) shares no boundary
  // dates with any other table here. Verified against prokerala.com/
  // drikpanchang.com/hindupad.com (all agree: Aug 17 every year 2024-2028 —
  // expected, since sidereal drift is ~1 day per ~70 years).
  malayalam: [
    { eraYear: 1200, startDate: '2024-08-17' },
    { eraYear: 1201, startDate: '2025-08-17' },
    { eraYear: 1202, startDate: '2026-08-17' },
    { eraYear: 1203, startDate: '2027-08-17' },
    { eraYear: 1204, startDate: '2028-08-17' },
  ],
  // Assamese Bohag Bihu conventionally falls on the same civil date as
  // Bengali Poila Boishakh — reusing `east`'s already-verified table rather
  // than re-deriving a separate one (documented assumption, not independently
  // re-verified per year).
  assam: [
    { eraYear: 1431, startDate: '2024-04-14' },
    { eraYear: 1432, startDate: '2025-04-14' },
    { eraYear: 1433, startDate: '2026-04-14' },
    { eraYear: 1434, startDate: '2027-04-15' },
    { eraYear: 1435, startDate: '2028-04-14' },
  ],
  // Punjab (Nanakshahi) is a fixed civil calendar with no sidereal component
  // at all — it doesn't use YEAR_STARTS/fallbackEraYear (see
  // calculateNanakshahi below), so no entry is needed here. lookupEraYear
  // simply returns null for 'punjab' and is never called for it.
  punjab: [],
};

const ERA_OFFSETS: Record<RegionId, number> = {
  north: 57, // Vikram Samvat
  south: -78, // Shalivahana Shaka
  west: -78, // Shalivahana Shaka (Marathi convention)
  east: -593, // Bengali San
  gujarat: 57, // Vikram Samvat (same numbering as north, different new-year point)
  odisha: -78, // Shalivahana Shaka
  assam: -593, // Bengali San (see YEAR_STARTS.assam comment)
  tamil: -78, // Shalivahana Shaka
  malayalam: -824, // Kollam Era (epoch 825 CE)
  punjab: 0, // unused — Nanakshahi era is computed directly in calculateNanakshahi
  kannada: -78, // Shalivahana Shaka (same as south/Telugu)
};

const CALENDAR_NAMES: Record<RegionId, string> = {
  north: 'Vikram Samvat',
  south: 'Shalivahana Shaka',
  west: 'Shalivahana Shaka',
  east: 'Bengali San',
  gujarat: 'Vikram Samvat',
  odisha: 'Shalivahana Shaka',
  assam: 'Bengali San',
  tamil: 'Shalivahana Shaka',
  malayalam: 'Kollam Era',
  punjab: 'Nanakshahi',
  kannada: 'Shalivahana Shaka',
};

const MONTH_SYSTEMS: Record<RegionId, MonthSystem> = {
  north: 'purnimanta',
  south: 'amanta',
  west: 'amanta',
  east: 'solar',
  gujarat: 'amanta',
  odisha: 'solar',
  assam: 'solar',
  tamil: 'solar',
  malayalam: 'solar',
  punjab: 'fixed_solar',
  kannada: 'amanta',
};

const MONTH_NAMES: Record<RegionId, string[]> = {
  north: LUNAR_MONTHS_NORTH,
  south: LUNAR_MONTHS_SOUTH,
  west: LUNAR_MONTHS_WEST,
  east: SOLAR_MONTHS_EAST,
  gujarat: LUNAR_MONTHS_GUJARAT,
  odisha: SOLAR_MONTHS_ODISHA,
  assam: SOLAR_MONTHS_ASSAM,
  tamil: SOLAR_MONTHS_TAMIL,
  malayalam: SOLAR_MONTHS_MALAYALAM,
  punjab: [], // unused — see calculateNanakshahi
  kannada: LUNAR_MONTHS_SOUTH,
};

// Adhik Maas Gregorian ranges. Verified against Drik Panchang / HinduPad.
// Mirrors supabase/migrations/035_panchang_adhik_maas.sql.
interface AdhikRange {
  start: string; // YYYY-MM-DD inclusive
  end: string; // YYYY-MM-DD inclusive
  monthName: string; // doubled lunar month
  label: string;
}

const ADHIK_MAAS_RANGES: AdhikRange[] = [
  { start: '2023-07-18', end: '2023-08-16', monthName: 'Shravana', label: 'Adhik Shravana 2023' },
  { start: '2026-05-17', end: '2026-06-15', monthName: 'Jyeshtha', label: 'Adhik Jyeshtha 2026' },
];

function findAdhikMaas(isoDate: string): AdhikRange | null {
  for (const range of ADHIK_MAAS_RANGES) {
    if (isoDate >= range.start && isoDate <= range.end) return range;
  }
  return null;
}

function lookupEraYear(region: RegionId, isoDate: string): number | null {
  const list = YEAR_STARTS[region];
  if (!list || list.length === 0) return null;
  let chosen: YearStart | null = null;
  for (const entry of list) {
    if (isoDate >= entry.startDate) chosen = entry;
    else break;
  }
  return chosen ? chosen.eraYear : null;
}

function fallbackEraYear(region: RegionId, gregorianYear: number, monthIndex: number): number {
  // Without a seeded boundary, approximate: the era year for any date roughly
  // equals gregorianYear + offset, but each calendar's new year is a few months
  // into the Gregorian year. Before the new year, we're still in the previous
  // era year. Lunisolar new year ≈ Chaitra (monthIndex 0) start; Bengali new
  // year ≈ Boishakh (monthIndex 0) start. Months Phalguna/Choitro (index 11)
  // immediately precede the new year, so they belong to the prior era year.
  const offset = ERA_OFFSETS[region];
  // Treat monthIndex 11 as straddling: if we're in Phalguna/Choitro of
  // Gregorian year Y, era year is gregorianYear + offset (since the new year
  // hasn't ticked yet for this Gregorian cycle).
  // For monthIndex 0..10 we've already passed new year ⇒ +offset is correct.
  // monthIndex 11 ⇒ subtract one (we're still in the pre-new-year tail).
  const adjustment = monthIndex === 11 ? -1 : 0;
  return gregorianYear + offset + adjustment;
}

// ── Punjab (Nanakshahi) — a fixed civil solar calendar, no ephemeris input ──
// Chet 1 = March 14 every Gregorian year (2003/2010 SGPC-adopted rule; the
// 2010 revision reverted some *moveable gurpurb* observance dates back to
// lunar calculation, but left this fixed civil month structure unchanged —
// confirmed via sikhiwiki.org/goldentempleamritsar.org, Aug 2026). First 5
// months are 31 days, next 6 are 30 days; the final month (Phagun) absorbs
// whatever remains until the next Chet 1 (30 or 31), so no separate
// leap-year rule is needed.

const NANAKSHAHI_MONTHS: string[] = [
  'Chet',
  'Vaisakh',
  'Jeth',
  'Harh',
  'Sawan',
  'Bhadon',
  'Assu',
  'Katak',
  'Maghar',
  'Poh',
  'Magh',
  'Phagun',
];

const NANAKSHAHI_MONTH_START_OFFSETS = [0, 31, 62, 93, 124, 155, 185, 215, 245, 275, 305, 335];

// Chet 1 of the year beginning in Gregorian year Y opens Nanakshahi Samvat
// (Y - 1468) — cross-checked against the SGPC calendar's own labelling
// (Samvat 556 for the 2024-2025 edition, Samvat 558 for 2026-2027).
const NANAKSHAHI_EPOCH_OFFSET = 1468;

function chet1(gregorianYear: number): Date {
  return new Date(Date.UTC(gregorianYear, 2, 14)); // March is month index 2
}

function calculateNanakshahi(isoDate: string): RegionalMonth {
  const gregorianYear = Number(isoDate.slice(0, 4));
  const d = new Date(`${isoDate}T00:00:00Z`);
  const boundaryYear = d < chet1(gregorianYear) ? gregorianYear - 1 : gregorianYear;
  const dayOfYear = Math.round((d.getTime() - chet1(boundaryYear).getTime()) / 86_400_000);

  let monthIndex = 0;
  for (let i = NANAKSHAHI_MONTH_START_OFFSETS.length - 1; i >= 0; i--) {
    if (dayOfYear >= NANAKSHAHI_MONTH_START_OFFSETS[i]) {
      monthIndex = i;
      break;
    }
  }

  return {
    region: 'punjab',
    calendar: 'Nanakshahi',
    monthSystem: 'fixed_solar',
    monthIndex,
    monthName: NANAKSHAHI_MONTHS[monthIndex],
    // Exact — fixed month lengths, no approximation needed (unlike the
    // ephemeris-tracking solar regions below).
    dayOfMonth: dayOfYear - NANAKSHAHI_MONTH_START_OFFSETS[monthIndex] + 1,
    year: boundaryYear - NANAKSHAHI_EPOCH_OFFSET,
  };
}

interface RegionalMonthArgs {
  isoDate: string; // YYYY-MM-DD (Gregorian)
  gregorianYear: number;
  sunSiderealLong: number; // 0..360, Lahiri-corrected
  paksha: 'Shukla' | 'Krishna' | 'shukla' | 'krishna';
}

/**
 * Compute the lunar/solar month + era year as understood by each of the
 * regional Panchang traditions.
 *
 * @returns A record keyed by RegionId.
 */
export function calculateRegionalMonths(args: RegionalMonthArgs): Record<RegionId, RegionalMonth> {
  const { isoDate, gregorianYear, sunSiderealLong, paksha } = args;

  // Sun's sidereal rashi index (0 = Mesha/Aries, ..., 11 = Meena/Pisces)
  const sunRashi = Math.floor((((sunSiderealLong % 360) + 360) % 360) / 30);

  const pakshaLower: 'shukla' | 'krishna' =
    paksha === 'Shukla' || paksha === 'shukla' ? 'shukla' : 'krishna';

  // Amanta lunar month index = sun rashi (Mesha → Chaitra = 0)
  const amantaIndex = sunRashi;
  // Purnimanta is half a paksha ahead during Krishna paksha (the "next" month
  // has effectively begun the day after Purnima in the Purnimanta system).
  const purnimantaIndex = (sunRashi + (pakshaLower === 'krishna' ? 1 : 0)) % 12;
  // Malayalam's year starts at Chingam (Simha/Leo rashi, index 4), not Mesha —
  // shift the index so Chingam comes out as month 0.
  const malayalamIndex = (sunRashi + 8) % 12;

  // ponytail: day-of-solar-month, approximated from how far the Sun has
  // moved into its current rashi divided by its average daily motion
  // (360°/365.25 days ≈ 0.9856°/day) — the Sun's true daily motion varies
  // ~0.953-1.019°/day across the year (Earth's elliptical orbit), so this is
  // accurate to within ±1 day, not exact like the Nanakshahi day-of-month
  // above. Exact would need the real sankranti transit moment (an
  // angle-crossing search against Swiss Ephemeris, same technique already
  // used for tithi/nakshatra endsAt elsewhere in this codebase) computed per
  // month per year — upgrade to that if day-level solar precision matters
  // more than it does for a calendar-grid label.
  const AVERAGE_DAILY_SOLAR_MOTION = 360 / 365.25;
  const degreesIntoRashi = ((sunSiderealLong % 30) + 30) % 30;
  const solarDayOfMonth = Math.max(
    1,
    Math.round(degreesIntoRashi / AVERAGE_DAILY_SOLAR_MOTION) + 1,
  );

  const adhik = findAdhikMaas(isoDate);

  const buildLunar = (region: RegionId, monthIndex: number): RegionalMonth => {
    const seeded = lookupEraYear(region, isoDate);
    const year = seeded ?? fallbackEraYear(region, gregorianYear, monthIndex);
    return {
      region,
      calendar: CALENDAR_NAMES[region],
      monthSystem: MONTH_SYSTEMS[region],
      monthIndex,
      monthName: MONTH_NAMES[region][monthIndex],
      paksha: pakshaLower,
      year,
      ...(adhik ? { isAdhikMaas: true, adhikMaasLabel: adhik.label } : {}),
    };
  };

  // Bengali calendar (and the other solar regions below) is purely solar —
  // Adhik Maas does not apply directly, but that culture observes a parallel
  // intercalary concept on the same Gregorian dates as the lunisolar Adhik
  // Maas. We surface the same flag for UI consistency.
  const buildSolar = (region: RegionId, monthIndex: number): RegionalMonth => {
    const seeded = lookupEraYear(region, isoDate);
    const year = seeded ?? fallbackEraYear(region, gregorianYear, monthIndex);
    return {
      region,
      calendar: CALENDAR_NAMES[region],
      monthSystem: 'solar',
      monthIndex,
      monthName: MONTH_NAMES[region][monthIndex],
      dayOfMonth: solarDayOfMonth,
      year,
      ...(adhik ? { isAdhikMaas: true, adhikMaasLabel: adhik.label } : {}),
    };
  };

  return {
    north: buildLunar('north', purnimantaIndex),
    south: buildLunar('south', amantaIndex),
    west: buildLunar('west', amantaIndex),
    east: buildSolar('east', sunRashi),
    gujarat: buildLunar('gujarat', amantaIndex),
    odisha: buildSolar('odisha', sunRashi),
    assam: buildSolar('assam', sunRashi),
    tamil: buildSolar('tamil', sunRashi),
    malayalam: buildSolar('malayalam', malayalamIndex),
    punjab: calculateNanakshahi(isoDate),
    kannada: buildLunar('kannada', amantaIndex),
  };
}
