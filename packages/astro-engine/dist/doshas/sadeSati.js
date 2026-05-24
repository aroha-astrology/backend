"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectSadeSati = detectSadeSati;
const shared_1 = require("@jyotish-ai/shared");
/**
 * Sade Sati Detection
 *
 * Saturn transiting over the natal Moon sign and the signs immediately
 * before and after it constitutes Sade Sati (7.5-year Saturn transit).
 *
 * - Rising phase: Saturn in sign before Moon sign (~2.5 years)
 * - Peak phase: Saturn in same sign as Moon (~2.5 years)
 * - Setting phase: Saturn in sign after Moon sign (~2.5 years)
 *
 * All calculations are deterministic based on Saturn's current sidereal longitude.
 */
/** Average Saturn transit time per sign in days (~2.5 years). */
const SATURN_DAYS_PER_SIGN = 912; // ~2.5 years * 365.25
function getSignIndex(sign) {
    return shared_1.ZODIAC_SIGNS.indexOf(sign);
}
function getSignFromLongitude(longitude) {
    const index = Math.floor(longitude / 30) % 12;
    return shared_1.ZODIAC_SIGNS[index];
}
function getSignIndexFromLongitude(longitude) {
    return Math.floor(longitude / 30) % 12;
}
function detectSadeSati(moonSign, saturnLongitude) {
    const moonSignIndex = getSignIndex(moonSign);
    const saturnSignIndex = getSignIndexFromLongitude(saturnLongitude);
    const saturnSign = shared_1.ZODIAC_SIGNS[saturnSignIndex];
    // Determine relative position of Saturn to Moon sign
    const risingSignIndex = (moonSignIndex - 1 + 12) % 12; // sign before Moon
    const settingSignIndex = (moonSignIndex + 1) % 12; // sign after Moon
    let phase = 'none';
    let active = false;
    if (saturnSignIndex === risingSignIndex) {
        phase = 'rising';
        active = true;
    }
    else if (saturnSignIndex === moonSignIndex) {
        phase = 'peak';
        active = true;
    }
    else if (saturnSignIndex === settingSignIndex) {
        phase = 'setting';
        active = true;
    }
    let severity = 'none';
    if (phase === 'peak') {
        severity = 'severe';
    }
    else if (phase === 'rising') {
        severity = 'moderate';
    }
    else if (phase === 'setting') {
        severity = 'mild';
    }
    // Estimate start and end dates based on Saturn's degree within the current sign
    let startDate = null;
    let endDate = null;
    if (active) {
        const saturnDegreeInSign = saturnLongitude % 30;
        const fractionThroughSign = saturnDegreeInSign / 30;
        // Days elapsed in current sign
        const daysElapsed = Math.round(fractionThroughSign * SATURN_DAYS_PER_SIGN);
        // Days remaining in current sign
        const daysRemaining = SATURN_DAYS_PER_SIGN - daysElapsed;
        const now = new Date();
        // Estimate when Saturn entered the rising sign (start of Sade Sati)
        if (phase === 'rising') {
            // Saturn is in the rising sign; Sade Sati started daysElapsed ago
            startDate = new Date(now.getTime() - daysElapsed * 86400000);
            // Sade Sati ends when Saturn leaves the setting sign = remaining in this sign + 2 more signs
            endDate = new Date(now.getTime() + (daysRemaining + 2 * SATURN_DAYS_PER_SIGN) * 86400000);
        }
        else if (phase === 'peak') {
            // Saturn is on Moon sign; started 1 sign ago
            startDate = new Date(now.getTime() - (daysElapsed + SATURN_DAYS_PER_SIGN) * 86400000);
            endDate = new Date(now.getTime() + (daysRemaining + SATURN_DAYS_PER_SIGN) * 86400000);
        }
        else if (phase === 'setting') {
            // Saturn is in the setting sign; started 2 signs ago
            startDate = new Date(now.getTime() - (daysElapsed + 2 * SATURN_DAYS_PER_SIGN) * 86400000);
            endDate = new Date(now.getTime() + daysRemaining * 86400000);
        }
    }
    return {
        active,
        phase,
        startDate,
        endDate,
        severity,
        saturnSign,
        moonSign,
    };
}
//# sourceMappingURL=sadeSati.js.map