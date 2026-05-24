"use strict";
// =============================================================================
// Panchang Module - Barrel Export & Full Panchang Calculator
// =============================================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateRegionalMonths = exports.calculateHora = exports.calculateChoghadiya = exports.calculateYamagandaKaal = exports.calculateGulikaKaal = exports.calculateRahuKaal = exports.calculateKarana = exports.calculatePanchangYoga = exports.calculateNakshatra = exports.calculateTithi = void 0;
exports.calculateFullPanchang = calculateFullPanchang;
const tithi_1 = require("./tithi");
const nakshatra_1 = require("./nakshatra");
const yoga_1 = require("./yoga");
const karana_1 = require("./karana");
const rahuKaal_1 = require("./rahuKaal");
const regional_1 = require("./regional");
var tithi_2 = require("./tithi");
Object.defineProperty(exports, "calculateTithi", { enumerable: true, get: function () { return tithi_2.calculateTithi; } });
var nakshatra_2 = require("./nakshatra");
Object.defineProperty(exports, "calculateNakshatra", { enumerable: true, get: function () { return nakshatra_2.calculateNakshatra; } });
var yoga_2 = require("./yoga");
Object.defineProperty(exports, "calculatePanchangYoga", { enumerable: true, get: function () { return yoga_2.calculatePanchangYoga; } });
var karana_2 = require("./karana");
Object.defineProperty(exports, "calculateKarana", { enumerable: true, get: function () { return karana_2.calculateKarana; } });
var rahuKaal_2 = require("./rahuKaal");
Object.defineProperty(exports, "calculateRahuKaal", { enumerable: true, get: function () { return rahuKaal_2.calculateRahuKaal; } });
Object.defineProperty(exports, "calculateGulikaKaal", { enumerable: true, get: function () { return rahuKaal_2.calculateGulikaKaal; } });
Object.defineProperty(exports, "calculateYamagandaKaal", { enumerable: true, get: function () { return rahuKaal_2.calculateYamagandaKaal; } });
var choghadiya_1 = require("./choghadiya");
Object.defineProperty(exports, "calculateChoghadiya", { enumerable: true, get: function () { return choghadiya_1.calculateChoghadiya; } });
var hora_1 = require("./hora");
Object.defineProperty(exports, "calculateHora", { enumerable: true, get: function () { return hora_1.calculateHora; } });
var regional_2 = require("./regional");
Object.defineProperty(exports, "calculateRegionalMonths", { enumerable: true, get: function () { return regional_2.calculateRegionalMonths; } });
// Weekday names
const WEEKDAY_NAMES = [
    'Ravivaar', 'Somvaar', 'Mangalvaar', 'Budhvaar',
    'Guruvaar', 'Shukravaar', 'Shanivaar',
];
/**
 * Estimate sunrise and sunset for a given date and location using a simplified
 * deterministic algorithm (no external API needed).
 *
 * Uses the NOAA solar equations for sunrise/sunset based on latitude, longitude,
 * and day of year. Returns times in the local timezone derived from longitude.
 */
function estimateSunriseSunset(date, latitude, longitude) {
    // Day of year
    const start = new Date(date.getFullYear(), 0, 0);
    const diff = date.getTime() - start.getTime();
    const oneDay = 1000 * 60 * 60 * 24;
    const dayOfYear = Math.floor(diff / oneDay);
    // Solar declination (approximate)
    const declination = -23.45 * Math.cos((360 / 365) * (dayOfYear + 10) * (Math.PI / 180));
    const declinationRad = declination * (Math.PI / 180);
    const latRad = latitude * (Math.PI / 180);
    // Hour angle for sunrise/sunset
    let cosHourAngle = -Math.tan(latRad) * Math.tan(declinationRad);
    // Clamp for extreme latitudes (midnight sun / polar night)
    cosHourAngle = Math.max(-1, Math.min(1, cosHourAngle));
    const hourAngle = Math.acos(cosHourAngle) * (180 / Math.PI);
    // Solar noon in minutes from midnight (UTC)
    // Equation of time approximation
    const B = (360 / 365) * (dayOfYear - 81) * (Math.PI / 180);
    const equationOfTime = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);
    // Solar noon in local time (offset by longitude, 4 min per degree)
    const solarNoonUTC = 720 - 4 * longitude - equationOfTime; // in minutes from midnight UTC
    const timezoneOffset = Math.round(longitude / 15) * 60; // approximate local timezone offset in minutes
    const solarNoonLocal = solarNoonUTC + timezoneOffset;
    // Sunrise and sunset
    const sunriseMin = solarNoonLocal - (hourAngle / 360) * 24 * 60;
    const sunsetMin = solarNoonLocal + (hourAngle / 360) * 24 * 60;
    const formatTime = (mins) => {
        let m = Math.round(mins);
        if (m < 0)
            m += 24 * 60;
        if (m >= 24 * 60)
            m -= 24 * 60;
        const h = Math.floor(m / 60);
        const min = m % 60;
        return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
    };
    return {
        sunrise: formatTime(sunriseMin),
        sunset: formatTime(sunsetMin),
    };
}
/**
 * Calculate the full Panchang for a given date and location.
 *
 * @param date - The date for which to calculate the panchang
 * @param latitude - Geographic latitude
 * @param longitude - Geographic longitude
 * @param sunLong - Sidereal longitude of the Sun (0-360)
 * @param moonLong - Sidereal longitude of the Moon (0-360)
 * @returns Complete PanchangData
 */
function calculateFullPanchang(date, latitude, longitude, sunLong, moonLong) {
    const dayOfWeek = date.getDay(); // 0=Sunday
    // Estimate sunrise and sunset
    const { sunrise, sunset } = estimateSunriseSunset(date, latitude, longitude);
    // Calculate the five limbs (pancha-anga)
    const tithi = (0, tithi_1.calculateTithi)(moonLong, sunLong);
    const nakshatra = (0, nakshatra_1.calculateNakshatra)(moonLong);
    const yoga = (0, yoga_1.calculatePanchangYoga)(sunLong, moonLong);
    const karana = (0, karana_1.calculateKarana)(moonLong, sunLong);
    // Calculate inauspicious periods
    const rahuKaal = (0, rahuKaal_1.calculateRahuKaal)(sunrise, sunset, dayOfWeek);
    const gulikaKaal = (0, rahuKaal_1.calculateGulikaKaal)(sunrise, sunset, dayOfWeek);
    const yamagandaKaal = (0, rahuKaal_1.calculateYamagandaKaal)(sunrise, sunset, dayOfWeek);
    // Abhijit Muhurta: the 8th muhurta of the day (midday, approximately)
    // Divide day into 15 muhurtas. Abhijit = around the 8th muhurta (local noon).
    const sunriseMin = parseTimeToMin(sunrise);
    const sunsetMin = parseTimeToMin(sunset);
    const dayDuration = sunsetMin - sunriseMin;
    const muhurtaDuration = dayDuration / 15;
    const abhijitStart = sunriseMin + 7 * muhurtaDuration;
    const abhijitEnd = abhijitStart + muhurtaDuration;
    const isoDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const regionalMonths = (0, regional_1.calculateRegionalMonths)({
        isoDate,
        gregorianYear: date.getFullYear(),
        sunSiderealLong: sunLong,
        paksha: tithi.paksha,
    });
    return {
        tithi,
        nakshatra,
        yoga,
        karana,
        vara: WEEKDAY_NAMES[dayOfWeek],
        rahuKaal,
        gulikaKaal,
        yamagandaKaal,
        abhijitMuhurta: {
            start: formatMinToTime(abhijitStart),
            end: formatMinToTime(abhijitEnd),
        },
        sunriseTime: sunrise,
        sunsetTime: sunset,
        regionalMonths,
    };
}
function parseTimeToMin(time) {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
}
function formatMinToTime(totalMinutes) {
    let mins = Math.round(totalMinutes);
    if (mins < 0)
        mins += 24 * 60;
    if (mins >= 24 * 60)
        mins -= 24 * 60;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
//# sourceMappingURL=index.js.map