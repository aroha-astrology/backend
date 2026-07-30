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

export const SATURN_PHASE_NOTIFICATION_TYPE = 'saturn_phase_alert';

export interface ResolvedSaturnPhase {
  phase: SaturnPhase;
  windowStart: Date | null;
  windowEnd: Date | null;
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
): ResolvedSaturnPhase {
  if (sadeSati.active) {
    return {
      phase: sadeSati.phase,
      windowStart: sadeSati.windowStart,
      windowEnd: sadeSati.windowEnd,
    };
  }
  if (dhaiya.active) {
    return { phase: dhaiya.phase, windowStart: dhaiya.startDate, windowEnd: dhaiya.endDate };
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
    bySign[signIndex] = resolveCurrentSaturnPhase(sadeSati, dhaiya);
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

/** Builds the push copy for a transition, or null when this transition isn't worth a push (e.g. 4th->8th Dhaiya has no natural "began" framing). */
export function buildSaturnPhaseAlertCopy(
  previousPhase: SaturnPhase | null,
  newPhase: SaturnPhase,
): { title: string; body: string } | null {
  if (newPhase === 'none' && previousPhase && previousPhase !== 'none') {
    if (SADE_SATI_PHASES.has(previousPhase)) {
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
  return PHASE_BEGIN_COPY[newPhase] ?? null;
}

/** Sends the push + writes the in-app notification row for every transition that has copy. Returns how many were actually sent. */
export async function sendSaturnPhaseAlerts(transitions: SaturnPhaseTransition[]): Promise<number> {
  // Only the primary/self profile gets a personal push — a phase change on an
  // additional saved profile (e.g. a family member) isn't "your" notification.
  const personal = transitions.filter((t) => t.birthProfileId === null);
  let sent = 0;

  for (const t of personal) {
    const copy = buildSaturnPhaseAlertCopy(t.previousPhase, t.newPhase);
    if (!copy) continue;

    try {
      const tokenRows = await findActiveTokensForUser(t.userId);
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
