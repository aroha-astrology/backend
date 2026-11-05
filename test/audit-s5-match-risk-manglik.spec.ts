import { describe, expect, it } from 'vitest';
import { computeKundliMilanScores } from '../src/lib/astro-engine/reports/kundli-milan.js';
import { computeSpouseSynastry } from '../src/lib/astro-engine/reports/marriage-spouse-synastry.js';

// Audit Sprint 5, SB1: the "harmony" life area flagged a Manglik mismatch from RAW presence.
// One person actively Manglik plus one whose dosha is cancelled read as "both present", so no
// risk was flagged; and if either chart held a cancelled dosha, every mismatch was hidden.
// Each person's effective status is "present and not cancelled" (as astro.service matchmake()
// and bonds already treat it).

/** Lagna Aries. Mars sits in the sign given; the Moon is in Aries, so Mars is judged from both. */
function chart(marsSignIndex: number, marsSign: string): Record<string, unknown> {
  return {
    ascendant: { signIndex: 0 },
    planets: [
      { planet: 'Moon', nakshatraIndex: 3, sign: 'Aries', signIndex: 0 },
      { planet: 'Mars', signIndex: marsSignIndex, sign: marsSign },
    ],
  };
}

/** Mars in Cancer: 4th from Lagna and Moon, no cancellation rule applies: Manglik in force. */
const ACTIVE = chart(3, 'Cancer');
/** Mars in its own sign Aries (1st from Lagna): Mangal Dosha found, then cancelled. */
const CANCELLED = chart(0, 'Aries');
/** Mars in Gemini: 3rd house, no Mangal Dosha. */
const CLEAN = chart(2, 'Gemini');

function harmonyEvidence(a: Record<string, unknown>, b: Record<string, unknown>): string[] {
  const scores = computeKundliMilanScores({ chart: a, partnerChart: b }, null);
  return scores.riskFactors.find((f) => f.key === 'harmony')?.evidence ?? [];
}

const MISMATCH = /Mangal Dosha status is mismatched/;

describe('match-risks harmony: Manglik mismatch uses each person’s effective status (SB1)', () => {
  it('flags one person actively Manglik and the other with a cancelled dosha', () => {
    expect(harmonyEvidence(ACTIVE, CANCELLED).join(' ')).toMatch(MISMATCH);
    expect(harmonyEvidence(CANCELLED, ACTIVE).join(' ')).toMatch(MISMATCH);
  });

  it('flags one person actively Manglik and the other with no dosha', () => {
    expect(harmonyEvidence(ACTIVE, CLEAN).join(' ')).toMatch(MISMATCH);
  });

  it('does not flag a cancelled dosha against no dosha: neither is Manglik', () => {
    expect(harmonyEvidence(CANCELLED, CLEAN).join(' ')).not.toMatch(MISMATCH);
    expect(harmonyEvidence(CLEAN, CANCELLED).join(' ')).not.toMatch(MISMATCH);
  });

  it('does not flag two people who are both actively Manglik, or both cancelled', () => {
    expect(harmonyEvidence(ACTIVE, ACTIVE).join(' ')).not.toMatch(MISMATCH);
    expect(harmonyEvidence(CANCELLED, CANCELLED).join(' ')).not.toMatch(MISMATCH);
  });

  it('applies the same rule in the spouse synastry of the Marriage Report', () => {
    const syn = computeSpouseSynastry(ACTIVE, CANCELLED, null);
    const harmony = syn?.riskFactors.find((f) => f.key === 'harmony');
    expect(harmony?.evidence.join(' ')).toMatch(MISMATCH);
  });
});
