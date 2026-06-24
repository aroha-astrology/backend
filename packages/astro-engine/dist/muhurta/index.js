"use strict";
// =============================================================================
// Muhurta Calculator
// =============================================================================
// Finds the best muhurta (auspicious time) for a given activity type within
// a date range. Scoring is based on tithi quality, nakshatra quality, yoga,
// lagna strength, and rahu kaal avoidance.
Object.defineProperty(exports, "__esModule", { value: true });
exports.findBestMuhurta = findBestMuhurta;
const shared_1 = require("@jyotish-ai/shared");
const tithi_1 = require("../panchang/tithi");
const nakshatra_1 = require("../panchang/nakshatra");
const yoga_1 = require("../panchang/yoga");
const rahuKaal_1 = require("../panchang/rahuKaal");
const MUHURTA_PREFERENCES = {
    marriage: {
        // Good tithis: 2,3,5,7,10,11,12,13 of Shukla Paksha
        preferredTithis: [2, 3, 5, 7, 10, 11, 12, 13],
        avoidTithis: [4, 8, 9, 14, 15, 19, 23, 24, 29, 30],
        // Rohini, Mrigashira, Magha, UttaraPhalguni, Hasta, Swati, Anuradha, Moola, UttaraAshadha, UttaraBhadrapada, Revati
        preferredNakshatras: [3, 4, 9, 11, 12, 14, 16, 18, 20, 25, 26],
        avoidNakshatras: [5, 8, 17, 23], // Ardra, Ashlesha, Jyeshtha, Shatabhisha
        preferredLagnas: [1, 2, 3, 6, 10, 11], // Taurus, Gemini, Cancer, Libra, Aquarius, Pisces
        avoidLagnas: [0, 7], // Aries, Scorpio
        preferredWeekdays: [1, 3, 4, 5], // Mon, Wed, Thu, Fri
        avoidWeekdays: [2, 6], // Tue, Sat
    },
    griha_pravesh: {
        preferredTithis: [2, 3, 5, 7, 10, 11, 12, 13],
        avoidTithis: [4, 8, 9, 14, 30],
        // Rohini, Mrigashira, Pushya, UttaraPhalguni, Hasta, Swati, Anuradha, UttaraAshadha, Shravana, Dhanishta, UttaraBhadrapada, Revati
        preferredNakshatras: [3, 4, 7, 11, 12, 14, 16, 20, 21, 22, 25, 26],
        avoidNakshatras: [5, 8, 17, 18, 23],
        preferredLagnas: [1, 3, 4, 6, 10, 11], // Taurus, Cancer, Leo, Libra, Aquarius, Pisces
        avoidLagnas: [7, 9], // Scorpio, Capricorn
        preferredWeekdays: [1, 3, 4, 5],
        avoidWeekdays: [2, 6],
    },
    business: {
        preferredTithis: [2, 3, 5, 7, 10, 11, 12, 13],
        avoidTithis: [4, 8, 9, 14, 30],
        // Ashwini, Rohini, Mrigashira, Punarvasu, Pushya, Hasta, Chitra, Swati, Anuradha, Shravana, Revati
        preferredNakshatras: [0, 3, 4, 6, 7, 12, 13, 14, 16, 21, 26],
        avoidNakshatras: [5, 8, 17, 18, 23],
        preferredLagnas: [1, 2, 4, 6, 8, 10], // Taurus, Gemini, Leo, Libra, Sagittarius, Aquarius
        avoidLagnas: [7], // Scorpio
        preferredWeekdays: [1, 3, 4, 5],
        avoidWeekdays: [2, 6],
    },
    namkaran: {
        preferredTithis: [2, 3, 5, 7, 10, 11, 12, 13],
        avoidTithis: [4, 8, 9, 14, 30],
        // Ashwini, Rohini, Mrigashira, Punarvasu, Pushya, UttaraPhalguni, Hasta, Swati, Anuradha, Shravana, UttaraBhadrapada, Revati
        preferredNakshatras: [0, 3, 4, 6, 7, 11, 12, 14, 16, 21, 25, 26],
        avoidNakshatras: [5, 8, 17, 18],
        preferredLagnas: [1, 2, 3, 4, 6, 8, 11], // Taurus, Gemini, Cancer, Leo, Libra, Sagittarius, Pisces
        avoidLagnas: [7],
        preferredWeekdays: [1, 3, 4, 5],
        avoidWeekdays: [2, 6],
    },
    vehicle_purchase: {
        preferredTithis: [2, 3, 5, 7, 10, 11, 12, 13],
        avoidTithis: [4, 8, 9, 14, 30],
        // Ashwini, Rohini, Pushya, Hasta, Swati, Anuradha, Shravana, Revati
        preferredNakshatras: [0, 3, 7, 12, 14, 16, 21, 26],
        avoidNakshatras: [5, 8, 17, 18, 23],
        preferredLagnas: [1, 2, 4, 6, 10], // Taurus, Gemini, Leo, Libra, Aquarius
        avoidLagnas: [7, 9],
        preferredWeekdays: [1, 3, 4, 5],
        avoidWeekdays: [2, 6],
    },
    gold_purchase: {
        preferredTithis: [2, 3, 5, 7, 10, 11, 12, 13, 15],
        avoidTithis: [4, 8, 9, 14, 30],
        // Pushya, Rohini, Hasta, Shravana, UttaraPhalguni, Revati, Ashwini, Dhanishta
        preferredNakshatras: [7, 3, 12, 21, 11, 26, 0, 22],
        avoidNakshatras: [5, 8, 17, 18, 23],
        preferredLagnas: [1, 3, 4, 6, 11], // Taurus, Cancer, Leo, Libra, Pisces
        avoidLagnas: [7, 9],
        preferredWeekdays: [1, 3, 4, 5],
        avoidWeekdays: [2, 6],
    },
    travel: {
        preferredTithis: [2, 3, 5, 7, 10, 11, 12, 13],
        avoidTithis: [4, 8, 9, 14, 30],
        // Ashwini, Mrigashira, Punarvasu, Pushya, Hasta, Anuradha, Shravana, Revati
        preferredNakshatras: [0, 4, 6, 7, 12, 16, 21, 26],
        avoidNakshatras: [5, 8, 17, 18, 23],
        preferredLagnas: [2, 4, 6, 8, 10], // Gemini, Leo, Libra, Sagittarius, Aquarius
        avoidLagnas: [3, 7], // Cancer, Scorpio
        preferredWeekdays: [1, 3, 4, 5],
        avoidWeekdays: [2, 6],
    },
    surgery: {
        preferredTithis: [2, 3, 5, 7, 10, 11, 12, 13],
        avoidTithis: [4, 8, 9, 14, 15, 30],
        // Ashwini, Pushya, Hasta, Anuradha, Shravana, Revati
        preferredNakshatras: [0, 7, 12, 16, 21, 26],
        avoidNakshatras: [5, 8, 17, 18, 23],
        preferredLagnas: [0, 4, 6, 8, 10], // Aries, Leo, Libra, Sagittarius, Aquarius
        avoidLagnas: [3, 7], // Cancer, Scorpio
        preferredWeekdays: [1, 3, 4],
        avoidWeekdays: [2, 5, 6], // Tue, Fri, Sat
    },
};
// =============================================================================
// Approximate Sun/Moon longitude estimator (deterministic, no ephemeris)
// =============================================================================
/**
 * Estimate the Sun's sidereal longitude for a given date.
 * Sun moves approximately 0.9856 degrees/day tropically.
 * Approximate Lahiri ayanamsa for 2024 ~ 24.17 degrees.
 */
function estimateSunLong(date) {
    // J2000.0 epoch: Jan 1, 2000, 12:00 UT
    const j2000 = new Date(Date.UTC(2000, 0, 1, 12, 0, 0));
    const daysSinceJ2000 = (date.getTime() - j2000.getTime()) / (1000 * 60 * 60 * 24);
    // Mean tropical longitude of Sun (simplified)
    const meanLongTropical = (280.46646 + 0.9856474 * daysSinceJ2000) % 360;
    // Approximate ayanamsa (Lahiri, increases ~50.3" per year)
    const yearsSinceJ2000 = daysSinceJ2000 / 365.25;
    const ayanamsa = 23.85 + 0.01397 * yearsSinceJ2000;
    let sidereal = (meanLongTropical - ayanamsa) % 360;
    if (sidereal < 0)
        sidereal += 360;
    return sidereal;
}
/**
 * Estimate the Moon's sidereal longitude for a given date.
 * Moon moves approximately 13.176 degrees/day.
 */
function estimateMoonLong(date) {
    const j2000 = new Date(Date.UTC(2000, 0, 1, 12, 0, 0));
    const daysSinceJ2000 = (date.getTime() - j2000.getTime()) / (1000 * 60 * 60 * 24);
    // Mean tropical longitude of Moon (simplified)
    const meanLongTropical = (218.3165 + 13.176396 * daysSinceJ2000) % 360;
    const yearsSinceJ2000 = daysSinceJ2000 / 365.25;
    const ayanamsa = 23.85 + 0.01397 * yearsSinceJ2000;
    let sidereal = (meanLongTropical - ayanamsa) % 360;
    if (sidereal < 0)
        sidereal += 360;
    return sidereal;
}
/**
 * Estimate sunrise/sunset times deterministically.
 */
function estimateSunTimes(date, latitude, longitude) {
    const start = new Date(date.getFullYear(), 0, 0);
    const diff = date.getTime() - start.getTime();
    const oneDay = 1000 * 60 * 60 * 24;
    const dayOfYear = Math.floor(diff / oneDay);
    const declination = -23.45 * Math.cos((360 / 365) * (dayOfYear + 10) * (Math.PI / 180));
    const decRad = declination * (Math.PI / 180);
    const latRad = latitude * (Math.PI / 180);
    let cosHA = -Math.tan(latRad) * Math.tan(decRad);
    cosHA = Math.max(-1, Math.min(1, cosHA));
    const hourAngle = Math.acos(cosHA) * (180 / Math.PI);
    const B = (360 / 365) * (dayOfYear - 81) * (Math.PI / 180);
    const eot = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);
    const solarNoonUTC = 720 - 4 * longitude - eot;
    const tzOffset = Math.round(longitude / 15) * 60;
    const solarNoonLocal = solarNoonUTC + tzOffset;
    const sunriseMin = solarNoonLocal - (hourAngle / 360) * 24 * 60;
    const sunsetMin = solarNoonLocal + (hourAngle / 360) * 24 * 60;
    const fmt = (mins) => {
        let m = Math.round(mins);
        if (m < 0)
            m += 24 * 60;
        if (m >= 24 * 60)
            m -= 24 * 60;
        const h = Math.floor(m / 60);
        const mn = m % 60;
        return `${String(h).padStart(2, '0')}:${String(mn).padStart(2, '0')}`;
    };
    return { sunrise: fmt(sunriseMin), sunset: fmt(sunsetMin) };
}
/**
 * Estimate the Lagna (ascendant) sign for a given time and location.
 * The Lagna changes approximately every 2 hours through the zodiac.
 */
function estimateLagnaSign(date, latitude, longitude) {
    // Approximate: the sign rising at sunrise is roughly the Sun's sign.
    // Each sign rises for ~2 hours, so 12 signs in 24 hours.
    const sunLong = estimateSunLong(date);
    const sunSignIndex = Math.floor(sunLong / 30);
    // Hours since approximate sunrise (6 AM local)
    const hours = date.getHours() + date.getMinutes() / 60;
    const hoursSinceSunrise = hours - 6;
    const signsAdvanced = Math.floor(hoursSinceSunrise / 2);
    const lagnaIndex = ((sunSignIndex + signsAdvanced) % 12 + 12) % 12;
    return shared_1.ZODIAC_SIGNS[lagnaIndex];
}
function parseTimeToMin(time) {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
}
// =============================================================================
// Main Muhurta Finder
// =============================================================================
/**
 * Find the best muhurta windows for a given activity type within a date range.
 *
 * Evaluates each day at multiple time slots (every 2 hours from sunrise)
 * and scores them based on tithi, nakshatra, yoga, lagna, weekday,
 * and rahu kaal avoidance.
 *
 * @param type - Type of activity (marriage, griha_pravesh, etc.)
 * @param startDate - Start of search range
 * @param endDate - End of search range
 * @param lat - Latitude
 * @param lng - Longitude
 * @param tz - Timezone string (e.g., "Asia/Kolkata") -- used for display only
 * @returns Array of MuhurtaResult sorted by score descending
 */
function findBestMuhurta(type, startDate, endDate, lat, lng, _tz) {
    const prefs = MUHURTA_PREFERENCES[type];
    const results = [];
    // Iterate day by day
    const current = new Date(startDate);
    while (current <= endDate) {
        const dayOfWeek = current.getDay();
        const { sunrise, sunset } = estimateSunTimes(current, lat, lng);
        const sunriseMin = parseTimeToMin(sunrise);
        const sunsetMin = parseTimeToMin(sunset);
        // Evaluate at 2-hour intervals from sunrise to sunset
        for (let hour = sunriseMin; hour <= sunsetMin; hour += 120) {
            const slotDate = new Date(current);
            slotDate.setHours(Math.floor(hour / 60), hour % 60, 0, 0);
            // Estimate planetary positions for this time
            const sunLong = estimateSunLong(slotDate);
            // Moon moves ~0.55 deg/hour, so adjust from midnight
            const baseMoonLong = estimateMoonLong(slotDate);
            const hourOfDay = slotDate.getHours() + slotDate.getMinutes() / 60;
            const moonLong = (baseMoonLong + hourOfDay * 0.55) % 360;
            const tithi = (0, tithi_1.calculateTithi)(moonLong, sunLong);
            const nakshatra = (0, nakshatra_1.calculateNakshatra)(moonLong);
            const yoga = (0, yoga_1.calculatePanchangYoga)(sunLong, moonLong);
            const rahuKaal = (0, rahuKaal_1.calculateRahuKaal)(sunrise, sunset, dayOfWeek);
            const lagnaSign = estimateLagnaSign(slotDate, lat, lng);
            const lagnaIndex = shared_1.ZODIAC_SIGNS.indexOf(lagnaSign);
            // Score calculation (0-100)
            let score = 50; // base
            const reasoning = [];
            const warnings = [];
            // Tithi scoring
            if (prefs.preferredTithis.includes(tithi.number)) {
                score += 10;
                reasoning.push(`Tithi ${tithi.name} (${tithi.paksha}) is preferred for ${type}`);
            }
            if (prefs.avoidTithis.includes(tithi.number)) {
                score -= 15;
                warnings.push(`Tithi ${tithi.name} is inauspicious for ${type}`);
            }
            if (tithi.isAuspicious) {
                score += 5;
            }
            // Nakshatra scoring
            if (prefs.preferredNakshatras.includes(nakshatra.index)) {
                score += 10;
                reasoning.push(`Nakshatra ${nakshatra.name} is auspicious for ${type}`);
            }
            if (prefs.avoidNakshatras.includes(nakshatra.index)) {
                score -= 15;
                warnings.push(`Nakshatra ${nakshatra.name} should be avoided for ${type}`);
            }
            // Yoga scoring
            if (yoga.isAuspicious) {
                score += 5;
                reasoning.push(`Yoga ${yoga.name} is auspicious`);
            }
            else {
                score -= 5;
                warnings.push(`Yoga ${yoga.name} is not favorable`);
            }
            // Lagna scoring
            if (prefs.preferredLagnas.includes(lagnaIndex)) {
                score += 10;
                reasoning.push(`Lagna ${lagnaSign} is favorable for ${type}`);
            }
            if (prefs.avoidLagnas.includes(lagnaIndex)) {
                score -= 10;
                warnings.push(`Lagna ${lagnaSign} should be avoided for ${type}`);
            }
            // Weekday scoring
            if (prefs.preferredWeekdays.includes(dayOfWeek)) {
                score += 5;
                reasoning.push(`Weekday is favorable for ${type}`);
            }
            if (prefs.avoidWeekdays.includes(dayOfWeek)) {
                score -= 10;
                warnings.push(`This weekday should be avoided for ${type}`);
            }
            // Rahu Kaal avoidance
            const rahuStartMin = parseTimeToMin(rahuKaal.start);
            const rahuEndMin = parseTimeToMin(rahuKaal.end);
            if (hour >= rahuStartMin && hour < rahuEndMin) {
                score -= 20;
                warnings.push(`Time falls within Rahu Kaal (${rahuKaal.start}-${rahuKaal.end})`);
            }
            else {
                score += 5;
                reasoning.push('Time is outside Rahu Kaal');
            }
            // Clamp score
            score = Math.max(0, Math.min(100, score));
            results.push({
                dateTime: new Date(slotDate),
                score,
                reasoning,
                warnings,
                tithi: `${tithi.name} (${tithi.paksha})`,
                nakshatra: nakshatra.name,
                yoga: yoga.name,
                lagnaSign,
            });
        }
        // Move to next day
        current.setDate(current.getDate() + 1);
    }
    // Sort by score descending
    results.sort((a, b) => b.score - a.score);
    // Return top results (limit to avoid excessive output)
    return results.slice(0, 50);
}
//# sourceMappingURL=index.js.map