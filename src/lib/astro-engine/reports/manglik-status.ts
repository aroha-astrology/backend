// =============================================================================
// Manglik (Mangal Dosha) status for one person and for a pair
// =============================================================================
// Audit Sprint 5 (SB1, SB2). A person is Manglik only when the dosha is found AND not cancelled
// ("in force"), the same rule matchmake() in astro.service and bondMangal() in bonds already use.
// Kundli Milan, the Match Report, the spouse part of the Marriage Report and the match-risk
// "harmony" factor used to read the RAW presence plus one either-person "cancelled" flag, so a
// cancelled dosha still read "present" and an active-versus-cancelled pair raised no risk.
// One helper here, read by all of them.
// =============================================================================

import { detectMangalDosha } from '../doshas/mangalDosha.js';

type ChartRecord = Record<string, unknown> | null | undefined;

export interface PersonManglik {
  /** Mangal Dosha found and not cancelled: this person is Manglik. */
  inForce: boolean;
  /** Mangal Dosha found, then cancelled by a traditional exception: NOT Manglik. */
  cancelled: boolean;
  /** Why it cancels (the engine's own reasons, without its trailing "cancellation applies"). */
  reasons: string[];
}

const NOT_MANGLIK: PersonManglik = { inForce: false, cancelled: false, reasons: [] };

export function manglikOf(chart: ChartRecord): PersonManglik {
  if (!chart) return NOT_MANGLIK;
  const m = detectMangalDosha(chart as unknown as Parameters<typeof detectMangalDosha>[0]);
  const cancelled = m.present && m.type === 'cancelled';
  return {
    inForce: m.present && !cancelled,
    cancelled,
    reasons: cancelled
      ? (m.cancellations ?? []).map((r: string) => r.replace(/ - cancellation applies$/, ''))
      : [],
  };
}

/** The shape stored on KundliMilanScores.manglikStatus (the per-person extras are optional so
 * older stored fixtures and callers keep compiling). `person1`/`person2` are EFFECTIVE status. */
export interface ManglikPairStatus {
  /** Manglik in force (found and not cancelled), person 1 / person 2. */
  person1: boolean;
  person2: boolean;
  /** True when EITHER person's dosha was found and cancelled (kept for older readers). */
  cancelled: boolean;
  cancelled1?: boolean;
  cancelled2?: boolean;
  reasons1?: string[];
  reasons2?: string[];
}

export function manglikPairStatus(chart1: ChartRecord, chart2: ChartRecord): ManglikPairStatus {
  const a = manglikOf(chart1);
  const b = manglikOf(chart2);
  return {
    person1: a.inForce,
    person2: b.inForce,
    cancelled: a.cancelled || b.cancelled,
    cancelled1: a.cancelled,
    cancelled2: b.cancelled,
    reasons1: a.reasons,
    reasons2: b.reasons,
  };
}

/** One person, in words the narrative prompts can quote without calling a cancelled dosha "present". */
export function describeManglik(p: {
  inForce: boolean;
  cancelled?: boolean;
  reasons?: readonly string[];
}): string {
  if (p.inForce) return 'Manglik (Mangal Dosha in force)';
  if (p.cancelled) {
    const why = p.reasons && p.reasons.length > 0 ? `: ${p.reasons.join('; ')}` : '';
    return `NOT Manglik (the dosha was found but is cancelled${why})`;
  }
  return 'not Manglik (no Mangal Dosha)';
}

/** Person 1 and person 2 as one clause for the Kundli Milan facts. */
export function describeManglikPair(s: ManglikPairStatus): string {
  const one = describeManglik({
    inForce: s.person1,
    cancelled: s.cancelled1 ?? (!s.person1 && s.cancelled),
    reasons: s.reasons1,
  });
  const two = describeManglik({
    inForce: s.person2,
    cancelled: s.cancelled2 ?? (!s.person2 && s.cancelled),
    reasons: s.reasons2,
  });
  return `person1: ${one}; person2: ${two}`;
}
