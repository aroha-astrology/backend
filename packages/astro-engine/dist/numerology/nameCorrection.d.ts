export type NameAlignment = 'aligned' | 'partially_aligned' | 'misaligned';
export interface NameAlignmentResult {
    mulank: number;
    bhagyank: number;
    pythagorean: number;
    chaldean: number;
    soulUrge: number;
    personality: number;
    /** Candidate target numbers (1-9) for the suggested spelling — best first. */
    targets: number[];
    alignment: NameAlignment;
    friendly: number[];
    enemy: number[];
}
/**
 * Run the full deterministic name-alignment pass for a person.
 * The returned object is what the AI prompt reads and what the page renders
 * in the "your numerological signature" strip.
 */
export declare function computeNameAlignment(name: string, dob: Date): NameAlignmentResult;
/**
 * Recompute the Chaldean number for a candidate spelling and check whether it
 * lands on any of the target numbers. Used to validate AI-suggested variants.
 */
export declare function variantHitsTarget(variant: string, targets: number[]): {
    chaldean: number;
    hits: boolean;
};
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
export declare function generateDeterministicVariants(name: string, targets: number[], wanted: number): Array<{
    variant: string;
    chaldean: number;
    change: string;
}>;
//# sourceMappingURL=nameCorrection.d.ts.map