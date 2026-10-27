// =============================================================================
// Saturn phase detection + persistence + change-alert push
// =============================================================================
// Detects each user's CURRENT Sade Sati / Dhaiya phase from the real-ingress
// timeline (astro-engine/doshas/saturnPhaseTimeline.ts) and persists it to
// saturn_phases (Phase 2.3 of the 2026-07-30 predictive-engine plan). A phase
// that differs from what was last stored is a transition, which is pushed.
//
// Performance note: the phase timeline only depends on the natal MOON SIGN
// (not the full birth chart), so it is computed ONCE per of the 12 possible
// sign indices and shared across every user with that Moon sign — not once
// per user. A user-by-user ephemeris scan across thousands of users would be
// prohibitively slow for a nightly cron; this turns it into 12 scans total.
//
// Copy is static (English only) rather than a full Gemini-drafted, per-
// language pipeline like the transit-events pre-alert system — Saturn phase
// changes are rare (a handful of times per user's whole life) and the copy
// only needs to be right once per phase, unlike a daily transit calendar.
// =============================================================================

import { logger } from '../../lib/logger.js';
import { sendPushBatch } from '../../lib/notifications/fcm.js';
import { notifications } from '../../db/schema.js';
import { db } from '../../config/db.js';
import { findActiveTokensForUser } from '../device-tokens/device-tokens.repo.js';
import {
  detectRealSadeSati,
  detectRealDhaiya,
  type SaturnPhase,
  type RealSadeSatiResult,
  type RealDhaiyaResult,
} from '../../lib/astro-engine/doshas/saturnPhaseTimeline.js';
import {
  listReadyKundliMoonSigns,
  listSaturnPhasesByKey,
  upsertSaturnPhase,
  type KundliMoonSign,
} from './saturn-phase.repo.js';
import type { SaturnPhaseRow } from '../../db/schema.js';
import { pushAllowedUserIds } from '../../lib/notifications/notification-prefs.js';

export const SATURN_PHASE_NOTIFICATION_TYPE = 'saturn_phase_alert';

export interface ResolvedSaturnPhase {
  phase: SaturnPhase;
  windowStart: Date | null;
  windowEnd: Date | null;
  /** Set on a retrograde break inside a Sade Sati or Dhaiya: when Saturn comes back. */
  resumesOn?: Date | null;
  /** True when Saturn is back for a later stay of the same Sade Sati or Dhaiya. */
  isReturn?: boolean;
}

/** True when `asOf` is in a stay after the window's first (Saturn came back after a break). */
function inLaterStay(stays: { startDate: Date; endDate: Date }[], asOf: Date): boolean {
  const index = stays.findIndex((s) => asOf >= s.startDate && asOf < s.endDate);
  return index > 0;
}

/**
 * Sade Sati takes priority over Dhaiya when (implausibly) both are somehow
 * flagged, since they're derived from mutually exclusive houses-from-Moon and
 * can never both be genuinely active for the same chart at the same instant —
 * this is a defensive ordering, not an expected runtime case.
 */
export function resolveCurrentSaturnPhase(
  sadeSati: RealSadeSatiResult,
  dhaiya: RealDhaiyaResult,
  asOf: Date = new Date(),
): ResolvedSaturnPhase {
  if (sadeSati.active) {
    return {
      phase: sadeSati.phase,
      windowStart: sadeSati.windowStart,
      windowEnd: sadeSati.windowEnd,
      isReturn: inLaterStay(sadeSati.window?.stays ?? [], asOf),
    };
  }
  if (dhaiya.active) {
    return {
      phase: dhaiya.phase,
      windowStart: dhaiya.startDate,
      windowEnd: dhaiya.endDate,
      isReturn: inLaterStay(dhaiya.window?.stays ?? [], asOf),
    };
  }
  // A retrograde break: no phase today, but the window is not over.
  const paused = sadeSati.resumesOn ? sadeSati.window : dhaiya.resumesOn ? dhaiya.window : null;
  if (paused) {
    return {
      phase: 'none',
      windowStart: paused.startDate,
      windowEnd: paused.endDate,
      resumesOn: sadeSati.resumesOn ?? dhaiya.resumesOn,
    };
  }
  return { phase: 'none', windowStart: null, windowEnd: null };
}

/** Computes the resolved phase for all 12 possible natal Moon signs, once, for a given instant. */
export async function computeSaturnPhaseByMoonSign(
  asOf: Date,
): Promise<Record<number, ResolvedSaturnPhase>> {
  const bySign: Record<number, ResolvedSaturnPhase> = {};
  for (let signIndex = 0; signIndex < 12; signIndex++) {
    const [sadeSati, dhaiya] = await Promise.all([
      detectRealSadeSati(signIndex, asOf),
      detectRealDhaiya(signIndex, asOf),
    ]);
    bySign[signIndex] = resolveCurrentSaturnPhase(sadeSati, dhaiya, asOf);
  }
  return bySign;
}

export interface SaturnPhaseTransition {
  userId: string;
  birthProfileId: string | null;
  previousPhase: SaturnPhase | null;
  newPhase: SaturnPhase;
  windowStart: Date | null;
  windowEnd: Date | null;
  resumesOn?: Date | null;
  isReturn?: boolean;
  existingRowId?: string;
}

/**
 * Pure decision logic, independent of the DB: given every ready kundli's
 * Moon sign, the previously stored phase rows, and the pre-computed
 * per-sign resolution, decide which (user, profile) pairs have a phase that
 * differs from what's stored. Split out from detectSaturnPhaseTransitions so
 * it's testable without a database.
 */
export function resolveTransitions(
  kundliMoonSigns: KundliMoonSign[],
  existingByKey: Map<string, SaturnPhaseRow>,
  byMoonSign: Record<number, ResolvedSaturnPhase>,
): SaturnPhaseTransition[] {
  const transitions: SaturnPhaseTransition[] = [];
  for (const k of kundliMoonSigns) {
    const resolved = byMoonSign[k.moonSignIndex];
    if (!resolved) continue;
    const key = `${k.userId}:${k.birthProfileId ?? ''}`;
    const existing = existingByKey.get(key);
    if (existing?.phase === resolved.phase) continue;
    transitions.push({
      userId: k.userId,
      birthProfileId: k.birthProfileId,
      previousPhase: existing?.phase ?? null,
      newPhase: resolved.phase,
      windowStart: resolved.windowStart,
      windowEnd: resolved.windowEnd,
      resumesOn: resolved.resumesOn ?? null,
      isReturn: resolved.isReturn ?? false,
      ...(existing ? { existingRowId: existing.id } : {}),
    });
  }
  return transitions;
}

/**
 * Detects every (user, profile) whose Saturn phase has changed since the
 * last run, persists the new phase for EVERY ready kundli (transitioned or
 * not — lastCheckedAt/windowStart/windowEnd should stay current even when
 * the phase itself hasn't changed), and returns just the transitions.
 */
export interface SaturnPhaseDetectionResult {
  /** Ready kundlis whose phase was computed and persisted. */
  checked: number;
  transitions: SaturnPhaseTransition[];
}

export async function detectSaturnPhaseTransitions(
  asOf: Date = new Date(),
): Promise<SaturnPhaseDetectionResult> {
  const [kundliMoonSigns, existingByKey, byMoonSign] = await Promise.all([
    listReadyKundliMoonSigns(),
    listSaturnPhasesByKey(),
    computeSaturnPhaseByMoonSign(asOf),
  ]);

  const transitions = resolveTransitions(kundliMoonSigns, existingByKey, byMoonSign);

  for (const k of kundliMoonSigns) {
    const resolved = byMoonSign[k.moonSignIndex];
    if (!resolved) continue;
    const key = `${k.userId}:${k.birthProfileId ?? ''}`;
    const existing = existingByKey.get(key);
    await upsertSaturnPhase(
      k.userId,
      k.birthProfileId,
      resolved.phase,
      resolved.windowStart,
      resolved.windowEnd,
      existing?.id,
    );
  }

  return { checked: kundliMoonSigns.length, transitions };
}

// ---------------------------------------------------------------------------
// Static English copy — see module header for why this isn't Gemini-drafted.
// ---------------------------------------------------------------------------

const PHASE_BEGIN_COPY: Partial<Record<SaturnPhase, { title: string; body: string }>> = {
  'sade-sati-rising': {
    title: 'Your Sade Sati begins',
    body: 'Saturn has entered the sign before your Moon — the first of three phases. Expect a season of change; steady, patient effort now pays off later.',
  },
  'sade-sati-peak': {
    title: 'Sade Sati: peak phase',
    body: 'Saturn is now transiting your Moon sign directly — the most intense phase. Discipline and patience matter most right now.',
  },
  'sade-sati-setting': {
    title: 'Sade Sati: final phase',
    body: 'Saturn has moved past your Moon sign — the last phase of this cycle. Old pressures start easing as it winds down.',
  },
  'dhaiya-4th': {
    title: 'A Saturn Dhaiya has begun',
    body: 'Saturn is transiting your 4th house from the Moon — about 2.5 years asking for patience around home, family, and inner stability.',
  },
  'dhaiya-8th': {
    title: 'A Saturn Dhaiya has begun',
    body: 'Saturn is transiting your 8th house from the Moon — about 2.5 years of deep transformation. Favor steady discipline over big risks.',
  },
};

const SADE_SATI_PHASES: ReadonlySet<SaturnPhase> = new Set([
  'sade-sati-rising',
  'sade-sati-peak',
  'sade-sati-setting',
]);

/** Order of the three Sade Sati phases, to tell a retrograde step back from moving on. */
const SADE_SATI_ORDER: Partial<Record<SaturnPhase, number>> = {
  'sade-sati-rising': 0,
  'sade-sati-peak': 1,
  'sade-sati-setting': 2,
};

const DHAIYA_HOUSE: Partial<Record<SaturnPhase, string>> = {
  'dhaiya-4th': '4th',
  'dhaiya-8th': '8th',
};

/** "20 Oct 2027", India's calendar date, as almanacs list Saturn's sign changes. */
function alertDate(d: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

/**
 * Builds the push copy for a transition, or null when this transition isn't
 * worth a push. A retrograde can take Saturn out of a Sade Sati or Dhaiya and
 * back (Leo's Dhaiya: out on 3 Jun 2027, back on 20 Oct 2027), so a step out
 * with `resumesOn` is a pause, not an end, and the step back in is a return,
 * not a fresh 2.5 years.
 */
export function buildSaturnPhaseAlertCopy(
  previousPhase: SaturnPhase | null,
  newPhase: SaturnPhase,
  detail: { resumesOn?: Date | null; isReturn?: boolean; windowEnd?: Date | null } = {},
): { title: string; body: string } | null {
  const until = detail.windowEnd ? ` until ${alertDate(detail.windowEnd)}` : '';
  if (newPhase === 'none' && previousPhase && previousPhase !== 'none') {
    const sadeSati = SADE_SATI_PHASES.has(previousPhase);
    if (detail.resumesOn) {
      return sadeSati
        ? {
            title: 'Your Sade Sati pauses for a while',
            body: `Saturn has stepped out of the three signs around your Moon on a retrograde. It comes back on ${alertDate(detail.resumesOn)} for the rest of this Sade Sati${until}.`,
          }
        : {
            title: 'Your Saturn Dhaiya pauses for a while',
            body: `Saturn has moved on for now, but it comes back on ${alertDate(detail.resumesOn)} for the last stretch of this Dhaiya${until}.`,
          };
    }
    if (sadeSati) {
      return {
        title: 'Your Sade Sati has ended',
        body: 'Saturn has moved on from the three signs around your Moon — this cycle is complete.',
      };
    }
    return {
      title: 'Your Saturn Dhaiya has ended',
      body: 'Saturn has moved out of the house it was transiting — this ~2.5 year period is complete.',
    };
  }

  const before = previousPhase ? SADE_SATI_ORDER[previousPhase] : undefined;
  const after = SADE_SATI_ORDER[newPhase];
  if (before !== undefined && after !== undefined && after < before) {
    return {
      title: 'Sade Sati: Saturn steps back',
      body: `Saturn is retrograde and has stepped back into the ${
        after === 0 ? 'sign before your Moon' : 'Moon sign'
      } for a while. This is part of the same Sade Sati${until}, not a new one.`,
    };
  }
  if (detail.isReturn && (previousPhase === 'none' || previousPhase === null)) {
    if (after !== undefined) {
      return {
        title: 'Your Sade Sati resumes',
        body: `Saturn is back in the signs around your Moon after a retrograde break — the rest of this Sade Sati runs${until || ' on for a while'}.`,
      };
    }
    const house = DHAIYA_HOUSE[newPhase];
    if (house) {
      return {
        title: 'Your Saturn Dhaiya resumes',
        body: `Saturn is back in your ${house} house from the Moon after a retrograde break — the last stretch of this Dhaiya${until}.`,
      };
    }
  }
  return PHASE_BEGIN_COPY[newPhase] ?? null;
}

/** Sends the push + writes the in-app notification row for every transition that has copy. Returns how many were actually sent. */
export async function sendSaturnPhaseAlerts(transitions: SaturnPhaseTransition[]): Promise<number> {
  // Only the primary/self profile gets a personal push — a phase change on an
  // additional saved profile (e.g. a family member) isn't "your" notification.
  const personal = transitions.filter((t) => t.birthProfileId === null);
  let sent = 0;

  for (const t of personal) {
    const copy = buildSaturnPhaseAlertCopy(t.previousPhase, t.newPhase, {
      resumesOn: t.resumesOn,
      isReturn: t.isReturn,
      windowEnd: t.windowEnd,
    });
    if (!copy) continue;

    try {
      const pushAllowed = (
        await pushAllowedUserIds([t.userId], SATURN_PHASE_NOTIFICATION_TYPE)
      ).has(t.userId);
      const tokenRows = pushAllowed ? await findActiveTokensForUser(t.userId) : [];
      const tokens = tokenRows.map((r) => r.token);
      if (tokens.length > 0) {
        await sendPushBatch(tokens, copy.title, copy.body, {
          type: SATURN_PHASE_NOTIFICATION_TYPE,
          navigate: '/kundli',
        });
      }
      await db.insert(notifications).values({
        userId: t.userId,
        title: copy.title,
        body: copy.body,
        type: SATURN_PHASE_NOTIFICATION_TYPE,
        link: '/kundli',
      });
      sent++;
    } catch (err) {
      logger.warn({ err, userId: t.userId }, 'saturn-phase-alert: failed to send/record for user');
    }
  }

  return sent;
}
