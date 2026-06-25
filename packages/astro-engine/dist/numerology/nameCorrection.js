"use strict";
// =============================================================================
// Name Correction Numerology
// =============================================================================
// Deterministic math that drives Name Correction reports. The AI layer reads
// these results and writes the prose; calculation here never depends on AI.
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeNameAlignment = computeNameAlignment;
exports.variantHitsTarget = variantHitsTarget;
exports.generateDeterministicVariants = generateDeterministicVariants;
const index_1 = require("./index");
const vedic_1 = require("./vedic");
const FRIENDLY_MAP = {
    1: [1, 3, 5, 9],
    2: [2, 7, 9],
    3: [1, 3, 5, 9],
    4: [1, 4, 6, 8],
    5: [1, 3, 5, 9],
    6: [3, 6, 9],
    7: [2, 7, 9],
    8: [4, 6, 8],
    9: [1, 3, 5, 6, 9],
};
const ENEMY_MAP = {
    1: [2, 4, 8],
    2: [4, 5, 8],
    3: [4, 6, 8],
    4: [2, 3, 5, 7, 9],
    5: [2, 4, 6, 8],
    6: [1, 2, 5, 7, 8],
    7: [1, 3, 4, 5, 6, 8],
    8: [1, 2, 3, 5, 7, 9],
    9: [2, 4, 7, 8],
};
/**
 * Resolve the best target name-number for a person. Mulank (psychic) drives
 * day-to-day vibration; Bhagyank (destiny) drives long-arc outcomes; a third
 * "harmony" candidate is the friendly number that bridges them.
 */
function pickTargets(mulank, bhagyank) {
    const harmony = (FRIENDLY_MAP[mulank] ?? []).find((n) => n !== mulank && n !== bhagyank);
    const out = [];
    // Prefer Bhagyank (destiny) as the primary name target — it shapes the life arc.
    if (bhagyank >= 1 && bhagyank <= 9)
        out.push(bhagyank);
    if (mulank !== bhagyank && mulank >= 1 && mulank <= 9)
        out.push(mulank);
    if (harmony && !out.includes(harmony))
        out.push(harmony);
    return out;
}
/**
 * Run the full deterministic name-alignment pass for a person.
 * The returned object is what the AI prompt reads and what the page renders
 * in the "your numerological signature" strip.
 */
function computeNameAlignment(name, dob) {
    const mulank = (0, vedic_1.calculateMulank)(dob);
    const bhagyank = (0, vedic_1.calculateBhagyank)(dob);
    const { pythagorean, chaldean } = (0, index_1.analyzeNameNumerology)(name);
    const soulUrge = (0, index_1.calculateSoulUrge)(name);
    const personality = (0, index_1.calculatePersonality)(name);
    const targets = pickTargets(mulank, bhagyank);
    const primary = targets[0];
    const chaldeanReduced = (0, vedic_1.reduceToSingleDigit)(chaldean);
    const alignment = chaldeanReduced === primary ? 'aligned'
        : targets.includes(chaldeanReduced) ? 'partially_aligned'
            : 'misaligned';
    return {
        mulank,
        bhagyank,
        pythagorean,
        chaldean,
        soulUrge,
        personality,
        targets,
        alignment,
        friendly: FRIENDLY_MAP[mulank] ?? [],
        enemy: ENEMY_MAP[mulank] ?? [],
    };
}
/**
 * Recompute the Chaldean number for a candidate spelling and check whether it
 * lands on any of the target numbers. Used to validate AI-suggested variants.
 */
function variantHitsTarget(variant, targets) {
    const chaldean = (0, index_1.analyzeNameNumerology)(variant).chaldean;
    const reduced = (0, vedic_1.reduceToSingleDigit)(chaldean);
    return { chaldean: reduced, hits: targets.includes(reduced) };
}
/**
 * Generate deterministic spelling variants that hit one of the target numbers.
 * Used to top up the AI suggestion list when fewer than 5 variants come back
 * (or all 5 fail the target check).
 *
 * Strategy — apply small Indic-friendly edits to the source name and keep the
 * ones that reduce to a target number:
 *   - append a vowel (a, ee, ah, h)
 *   - double a key consonant
 *   - drop a trailing vowel
 *   - swap i↔ee, a↔aa
 */
function generateDeterministicVariants(name, targets, wanted) {
    const seen = new Set([name.toLowerCase()]);
    const out = [];
    const candidates = [];
    const base = name.trim();
    if (!base)
        return out;
    // Add trailing vowels / honorific h
    for (const suffix of ['a', 'h', 'ah', 'ee', 'i']) {
        candidates.push({ variant: base + suffix, change: `added "${suffix}" at the end` });
    }
    // Double the first consonant (after first letter if it's a vowel)
    const firstIdx = /[aeiouAEIOU]/.test(base[0]) ? 1 : 0;
    if (base[firstIdx]) {
        candidates.push({
            variant: base.slice(0, firstIdx) + base[firstIdx] + base.slice(firstIdx),
            change: `doubled "${base[firstIdx]}"`,
        });
    }
    // Swap i ↔ ee
    if (/i/i.test(base)) {
        candidates.push({ variant: base.replace(/i/i, 'ee'), change: 'replaced "i" with "ee"' });
    }
    if (/ee/i.test(base)) {
        candidates.push({ variant: base.replace(/ee/i, 'i'), change: 'replaced "ee" with "i"' });
    }
    // Swap a ↔ aa
    if (/a/i.test(base)) {
        candidates.push({ variant: base.replace(/a/i, 'aa'), change: 'replaced "a" with "aa"' });
    }
    // Drop trailing vowel
    if (/[aeiou]$/i.test(base) && base.length > 3) {
        candidates.push({ variant: base.slice(0, -1), change: `dropped trailing "${base.slice(-1)}"` });
    }
    for (const c of candidates) {
        const lower = c.variant.toLowerCase();
        if (seen.has(lower))
            continue;
        const { chaldean, hits } = variantHitsTarget(c.variant, targets);
        if (hits) {
            seen.add(lower);
            out.push({ variant: c.variant, chaldean, change: c.change });
            if (out.length >= wanted)
                break;
        }
    }
    return out;
}
//# sourceMappingURL=nameCorrection.js.map