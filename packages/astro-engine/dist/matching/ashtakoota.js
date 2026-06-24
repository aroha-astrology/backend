"use strict";
// =============================================================================
// Ashtakoota (8-Koota) Matching System - North Indian Compatibility
// =============================================================================
//
// Computes the 8 Kootas for marriage compatibility matching based on
// the Moon's Nakshatra and Rashi of both partners.
// Maximum total score: 36 points.
// All calculations are deterministic with classical Vedic rules.
// =============================================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateAshtakoota = calculateAshtakoota;
const shared_1 = require("@jyotish-ai/shared");
// =============================================================================
// Helpers
// =============================================================================
function signIndexOf(sign) {
    return shared_1.ZODIAC_SIGNS.indexOf(sign);
}
/** Sign element: 0=Fire, 1=Earth, 2=Air, 3=Water */
function signElement(sign) {
    return signIndexOf(sign) % 4;
}
/** Get the distance (1-12) from sign1 to sign2 counting forward. */
function signDistance(sign1, sign2) {
    const i1 = signIndexOf(sign1);
    const i2 = signIndexOf(sign2);
    return ((i2 - i1 + 12) % 12) + 1;
}
function compatibilityLabel(score, max) {
    const ratio = score / max;
    if (ratio >= 0.75)
        return 'excellent';
    if (ratio >= 0.5)
        return 'good';
    if (ratio >= 0.25)
        return 'average';
    return 'poor';
}
// =============================================================================
// 1. Varna Koota (max 1)
// =============================================================================
// Varna is determined by the element of the Moon sign:
// Water signs (Cancer, Scorpio, Pisces) = Brahmin (highest, rank 3)
// Fire signs (Aries, Leo, Sag) = Kshatriya (rank 2)
// Earth signs (Taurus, Virgo, Cap) = Vaishya (rank 1)
// Air signs (Gemini, Libra, Aqua) = Shudra (rank 0)
//
// Boy's varna >= Girl's varna = 1 point, else 0.
function getVarnaRank(sign) {
    const element = signElement(sign);
    // Fire=0 -> Kshatriya(2), Earth=1 -> Vaishya(1), Air=2 -> Shudra(0), Water=3 -> Brahmin(3)
    const ranks = [2, 1, 0, 3];
    return ranks[element];
}
function calculateVarna(moonSign1, moonSign2) {
    const boyRank = getVarnaRank(moonSign1);
    const girlRank = getVarnaRank(moonSign2);
    const score = boyRank >= girlRank ? 1 : 0;
    return {
        koota: 'Varna',
        maxScore: shared_1.KOOTA_MAX_SCORES.Varna,
        score,
        description: score === 1
            ? 'Varna of boy is equal or higher than girl'
            : 'Varna of boy is lower than girl',
        compatibility: score === 1 ? 'excellent' : 'poor',
    };
}
// =============================================================================
// 2. Vashya Koota (max 2)
// =============================================================================
// Five Vashya groups based on Moon sign:
// Chatushpada (quadruped): Aries, Taurus, second half of Sagittarius, first half of Capricorn
// Manava (human): Gemini, Virgo, Libra, first half of Sagittarius, Aquarius
// Jalachara (water): Cancer, Pisces, second half of Capricorn
// Vanachara (wild): Leo
// Keeta (insect): Scorpio
//
// Simplified classical mapping per sign:
// Same group = 2, one is vashya to other = 1, food relation = 0.5, no relation = 0
const VASHYA_GROUP = {
    Aries: 'Chatushpada',
    Taurus: 'Chatushpada',
    Gemini: 'Manava',
    Cancer: 'Jalachara',
    Leo: 'Vanachara',
    Virgo: 'Manava',
    Libra: 'Manava',
    Scorpio: 'Keeta',
    Sagittarius: 'Manava', // predominantly first half; simplified
    Capricorn: 'Chatushpada', // predominantly first half; simplified
    Aquarius: 'Manava',
    Pisces: 'Jalachara',
};
// Vashya compatibility: which group has vasya over which
// Manava vashya to: Manava
// Vanachara vashya to: Chatushpada
// Chatushpada vashya to: Chatushpada
// Jalachara vashya to: Jalachara
// Keeta vashya to: Keeta
const VASHYA_COMPATIBILITY = {
    Chatushpada: { Chatushpada: 2, Manava: 0.5, Jalachara: 0, Vanachara: 0, Keeta: 0 },
    Manava: { Chatushpada: 1, Manava: 2, Jalachara: 0, Vanachara: 1, Keeta: 0 },
    Jalachara: { Chatushpada: 0, Manava: 0, Jalachara: 2, Vanachara: 0, Keeta: 0 },
    Vanachara: { Chatushpada: 1, Manava: 0.5, Jalachara: 0, Vanachara: 2, Keeta: 0 },
    Keeta: { Chatushpada: 0, Manava: 0, Jalachara: 0, Vanachara: 0, Keeta: 2 },
};
function calculateVashya(moonSign1, moonSign2) {
    const group1 = VASHYA_GROUP[moonSign1];
    const group2 = VASHYA_GROUP[moonSign2];
    // Take the higher of both directions
    const score1 = VASHYA_COMPATIBILITY[group1]?.[group2] ?? 0;
    const score2 = VASHYA_COMPATIBILITY[group2]?.[group1] ?? 0;
    const score = Math.max(score1, score2);
    return {
        koota: 'Vashya',
        maxScore: shared_1.KOOTA_MAX_SCORES.Vashya,
        score,
        description: score >= 2
            ? 'Good mutual attraction and compatibility'
            : score >= 1
                ? 'Moderate vashya compatibility'
                : 'Lack of vashya compatibility',
        compatibility: compatibilityLabel(score, 2),
    };
}
// =============================================================================
// 3. Tara Koota (max 3)
// =============================================================================
// Count from boy's nakshatra to girl's nakshatra (inclusive), divide by 9.
// Remainder: 3, 5, 7 are inauspicious (score 0); 1, 2, 4, 6, 8, 0 are auspicious (score 1.5).
// Check both directions: boy->girl and girl->boy. Total max 3.
function calculateTara(nakshatraIndex1, nakshatraIndex2) {
    // Boy to Girl
    const countBtoG = ((nakshatraIndex2 - nakshatraIndex1 + 27) % 27) + 1;
    const remBtoG = countBtoG % 9;
    const favorableBtoG = [1, 2, 4, 6, 8, 0].includes(remBtoG);
    // Girl to Boy
    const countGtoB = ((nakshatraIndex1 - nakshatraIndex2 + 27) % 27) + 1;
    const remGtoB = countGtoB % 9;
    const favorableGtoB = [1, 2, 4, 6, 8, 0].includes(remGtoB);
    let score = 0;
    if (favorableBtoG)
        score += 1.5;
    if (favorableGtoB)
        score += 1.5;
    return {
        koota: 'Tara',
        maxScore: shared_1.KOOTA_MAX_SCORES.Tara,
        score,
        description: score === 3
            ? 'Tara is favorable in both directions'
            : score >= 1.5
                ? 'Tara is favorable in one direction'
                : 'Tara is unfavorable in both directions',
        compatibility: compatibilityLabel(score, 3),
    };
}
// =============================================================================
// 4. Yoni Koota (max 4)
// =============================================================================
// Based on animal associated with each nakshatra.
// Same animal = 4, Friendly pair = 3, Neutral = 2, Enemy = 1, Sworn enemy = 0
const YONI_ENEMIES = {
    Horse: 'Buffalo',
    Buffalo: 'Horse',
    Elephant: 'Lion',
    Lion: 'Elephant',
    Dog: 'Deer',
    Deer: 'Dog',
    Cat: 'Rat',
    Rat: 'Cat',
    Serpent: 'Mongoose',
    Mongoose: 'Serpent',
    Monkey: 'Goat',
    Goat: 'Monkey',
    Tiger: 'Cow',
    Cow: 'Tiger',
};
function calculateYoni(nakshatraIndex1, nakshatraIndex2) {
    const yoni1 = shared_1.NAKSHATRA_YONI[nakshatraIndex1];
    const yoni2 = shared_1.NAKSHATRA_YONI[nakshatraIndex2];
    if (!yoni1 || !yoni2) {
        return {
            koota: 'Yoni',
            maxScore: shared_1.KOOTA_MAX_SCORES.Yoni,
            score: 0,
            description: 'Invalid nakshatra index',
            compatibility: 'poor',
        };
    }
    let score;
    let description;
    if (yoni1.animal === yoni2.animal) {
        // Same animal
        score = 4;
        description = `Same yoni animal (${yoni1.animal}) - excellent compatibility`;
    }
    else if (YONI_ENEMIES[yoni1.animal] === yoni2.animal) {
        // Sworn enemies
        score = 0;
        description = `Sworn enemy yonis (${yoni1.animal} vs ${yoni2.animal})`;
    }
    else {
        // Check if one is male and other female of friendly animals
        // For simplicity, animals not in enemy list: check gender match
        if (yoni1.type !== yoni2.type) {
            // Opposite genders of different (non-enemy) animals
            score = 2;
            description = `Neutral yoni compatibility (${yoni1.animal} vs ${yoni2.animal})`;
        }
        else {
            // Same gender of different (non-enemy) animals
            score = 1;
            description = `Low yoni compatibility (${yoni1.animal} vs ${yoni2.animal})`;
        }
        // Friendly animals get a bonus - animals in the same general class
        // Classical texts list specific friendly pairs; simplified here:
        // Animals not enemies and opposite gender get 3
        const friendlyPairs = [
            ['Cow', 'Buffalo'],
            ['Horse', 'Deer'],
            ['Cat', 'Lion'],
            ['Serpent', 'Dog'],
            ['Monkey', 'Elephant'],
        ];
        for (const [a, b] of friendlyPairs) {
            if ((yoni1.animal === a && yoni2.animal === b) ||
                (yoni1.animal === b && yoni2.animal === a)) {
                score = 3;
                description = `Friendly yoni pair (${yoni1.animal} & ${yoni2.animal})`;
                break;
            }
        }
    }
    return {
        koota: 'Yoni',
        maxScore: shared_1.KOOTA_MAX_SCORES.Yoni,
        score,
        description,
        compatibility: compatibilityLabel(score, 4),
    };
}
// =============================================================================
// 5. Graha Maitri Koota (max 5)
// =============================================================================
// Based on friendship between lords of Moon signs.
// Both friends = 5, One friend one neutral = 4, Both neutral = 3,
// One friend one enemy = 1, One neutral one enemy = 0.5, Both enemies = 0
function getPlanetRelation(planet1, planet2) {
    if (planet1 === planet2)
        return 'friend';
    if (shared_1.PLANET_FRIENDS[planet1]?.includes(planet2))
        return 'friend';
    if (shared_1.PLANET_ENEMIES[planet1]?.includes(planet2))
        return 'enemy';
    return 'neutral';
}
function calculateGrahaMaitri(moonSign1, moonSign2) {
    const lord1 = shared_1.SIGN_LORDS[moonSign1];
    const lord2 = shared_1.SIGN_LORDS[moonSign2];
    const rel1to2 = getPlanetRelation(lord1, lord2);
    const rel2to1 = getPlanetRelation(lord2, lord1);
    // Combine both directions into a compound relationship
    let score;
    let description;
    if (rel1to2 === 'friend' && rel2to1 === 'friend') {
        score = 5;
        description = `${lord1} and ${lord2} are mutual friends`;
    }
    else if ((rel1to2 === 'friend' && rel2to1 === 'neutral') ||
        (rel1to2 === 'neutral' && rel2to1 === 'friend')) {
        score = 4;
        description = `${lord1} and ${lord2} are friend-neutral`;
    }
    else if (rel1to2 === 'neutral' && rel2to1 === 'neutral') {
        score = 3;
        description = `${lord1} and ${lord2} are mutually neutral`;
    }
    else if ((rel1to2 === 'friend' && rel2to1 === 'enemy') ||
        (rel1to2 === 'enemy' && rel2to1 === 'friend')) {
        score = 1;
        description = `${lord1} and ${lord2} are friend-enemy`;
    }
    else if ((rel1to2 === 'neutral' && rel2to1 === 'enemy') ||
        (rel1to2 === 'enemy' && rel2to1 === 'neutral')) {
        score = 0.5;
        description = `${lord1} and ${lord2} are neutral-enemy`;
    }
    else {
        // Both enemies
        score = 0;
        description = `${lord1} and ${lord2} are mutual enemies`;
    }
    return {
        koota: 'GrahaMaitri',
        maxScore: shared_1.KOOTA_MAX_SCORES.GrahaMaitri,
        score,
        description,
        compatibility: compatibilityLabel(score, 5),
    };
}
// =============================================================================
// 6. Gana Koota (max 6)
// =============================================================================
// Deva-Deva = 6, Manushya-Manushya = 6, Rakshasa-Rakshasa = 6,
// Deva-Manushya = 5, Manushya-Deva = 5 (some texts give 6 here too),
// Deva-Rakshasa = 0, Rakshasa-Deva = 0,
// Manushya-Rakshasa = 0, Rakshasa-Manushya = 0
function calculateGana(nakshatraIndex1, nakshatraIndex2) {
    const gana1 = shared_1.NAKSHATRA_GANA[nakshatraIndex1];
    const gana2 = shared_1.NAKSHATRA_GANA[nakshatraIndex2];
    let score;
    let description;
    if (gana1 === gana2) {
        score = 6;
        description = `Same gana (${gana1}) - excellent temperament match`;
    }
    else if ((gana1 === 'Deva' && gana2 === 'Manushya') ||
        (gana1 === 'Manushya' && gana2 === 'Deva')) {
        score = 5;
        description = `Deva-Manushya combination - good temperament match`;
    }
    else {
        // Deva-Rakshasa or Manushya-Rakshasa
        score = 0;
        description = `${gana1}-${gana2} combination - incompatible temperaments`;
    }
    return {
        koota: 'Gana',
        maxScore: shared_1.KOOTA_MAX_SCORES.Gana,
        score,
        description,
        compatibility: compatibilityLabel(score, 6),
    };
}
// =============================================================================
// 7. Bhakoot Koota (max 7)
// =============================================================================
// Based on distance between Moon signs.
// 2-12 (and 12-2), 6-8 (and 8-6), 5-9 (and 9-5) = 0 points (inauspicious)
// All other combinations = 7 points
function calculateBhakoot(moonSign1, moonSign2) {
    const dist = signDistance(moonSign1, moonSign2);
    const reverseDist = signDistance(moonSign2, moonSign1);
    // Check for inauspicious combinations (using both directions)
    const inauspiciousPairs = [
        [2, 12],
        [6, 8],
        [5, 9],
    ];
    let isBad = false;
    for (const [a, b] of inauspiciousPairs) {
        if ((dist === a && reverseDist === b) ||
            (dist === b && reverseDist === a)) {
            isBad = true;
            break;
        }
    }
    const score = isBad ? 0 : 7;
    return {
        koota: 'Bhakoot',
        maxScore: shared_1.KOOTA_MAX_SCORES.Bhakoot,
        score,
        description: isBad
            ? `Bhakoot dosha: ${dist}-${reverseDist} relationship is inauspicious`
            : 'Bhakoot is favorable',
        compatibility: score === 7 ? 'excellent' : 'poor',
    };
}
// =============================================================================
// 8. Nadi Koota (max 8)
// =============================================================================
// Same nadi = 0 (worst - Nadi dosha), Different nadi = 8
function calculateNadi(nakshatraIndex1, nakshatraIndex2) {
    const nadi1 = shared_1.NAKSHATRA_NADI[nakshatraIndex1];
    const nadi2 = shared_1.NAKSHATRA_NADI[nakshatraIndex2];
    const same = nadi1 === nadi2;
    const score = same ? 0 : 8;
    return {
        koota: 'Nadi',
        maxScore: shared_1.KOOTA_MAX_SCORES.Nadi,
        score,
        description: same
            ? `Same nadi (${nadi1}) - Nadi dosha present`
            : `Different nadis (${nadi1} & ${nadi2}) - no Nadi dosha`,
        compatibility: same ? 'poor' : 'excellent',
    };
}
// =============================================================================
// Overall compatibility classification
// =============================================================================
function overallCompatibility(total) {
    if (total >= 28)
        return 'excellent'; // 28-36
    if (total >= 21)
        return 'good'; // 21-27
    if (total >= 18)
        return 'average'; // 18-20 (minimum acceptable)
    if (total >= 14)
        return 'below_average'; // 14-17
    return 'poor'; // <14
}
// =============================================================================
// Main: calculateAshtakoota
// =============================================================================
/**
 * Computes all 8 Kootas for Ashtakoota marriage compatibility.
 *
 * Indices: nakshatraIndex1/2 are 0-26 (Ashwini=0 to Revati=26).
 * moonSign1/2 are boy's and girl's Moon signs respectively.
 *
 * @param nakshatraIndex1 - Boy's birth nakshatra index (0-26)
 * @param nakshatraIndex2 - Girl's birth nakshatra index (0-26)
 * @param moonSign1 - Boy's Moon sign
 * @param moonSign2 - Girl's Moon sign
 * @returns Full AshtakootaResult with all 8 koota scores and total
 */
function calculateAshtakoota(nakshatraIndex1, nakshatraIndex2, moonSign1, moonSign2) {
    const scores = [
        calculateVarna(moonSign1, moonSign2),
        calculateVashya(moonSign1, moonSign2),
        calculateTara(nakshatraIndex1, nakshatraIndex2),
        calculateYoni(nakshatraIndex1, nakshatraIndex2),
        calculateGrahaMaitri(moonSign1, moonSign2),
        calculateGana(nakshatraIndex1, nakshatraIndex2),
        calculateBhakoot(moonSign1, moonSign2),
        calculateNadi(nakshatraIndex1, nakshatraIndex2),
    ];
    const totalScore = scores.reduce((sum, s) => sum + s.score, 0);
    return {
        scores,
        totalScore,
        maxTotal: 36,
        mangalMatch: {
            boyManglik: false,
            girlManglik: false,
            compatible: true,
        },
        overallCompatibility: overallCompatibility(totalScore),
    };
}
//# sourceMappingURL=ashtakoota.js.map