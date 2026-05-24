export type MobileVerdict = 'powerful' | 'supportive' | 'neutral' | 'draining';
export interface MobileNumberAnalysis {
    digits: string;
    total: number;
    vibration: number;
    mulank: number;
    bhagyank: number;
    lastDigit: number;
    lastFour: string;
    /** 1-10 score, higher is better. */
    harmony: number;
    verdict: MobileVerdict;
    digitFrequency: Record<number, number>;
    friendlyDigits: number[];
    enemyDigits: number[];
}
/**
 * Run the full analysis. The `dob` is used to derive Mulank + Bhagyank — we
 * don't trust the caller to pass them.
 *
 * Throws if the cleaned mobile is fewer than 10 digits.
 */
export declare function analyzeMobileNumber(mobile: string, dob: Date): MobileNumberAnalysis;
//# sourceMappingURL=mobileNumber.d.ts.map