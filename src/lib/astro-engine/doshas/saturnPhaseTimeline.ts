// =============================================================================
// Real-ingress Sade Sati / Dhaiya phase timeline
// =============================================================================
// The existing sadeSati.ts detects the CURRENT phase from Saturn's live
// longitude and estimates boundary dates arithmetically (SATURN_DAYS_PER_SIGN
// = 912). That estimate cannot represent a retrograde re-entry into the
// previous sign, which routinely shifts real phase boundaries by weeks or
// months and is exactly why a real Sade Sati often runs longer than a flat
// 7.5 years. This module finds the REAL ingress moments via the same
// ephemeris-search machinery as the transit pre-alert pipeline
// (astro-tools/transit-events.ts) and builds a full phase timeline from them.
//
// Kept as a separate module from sadeSati.ts: the live/cheap arithmetic path
// (detectCurrentSadeSati) still exists and is still what chat-grounding,
// reports, and the fast dosha read use — this module is for the richer
// phase-timeline view (used by the Saturn-phase persistence/alert cron,
// Phase 2.3, and the "Astro Arun Pandit"-style framing the audit asked for).
// =============================================================================

import { calculatePlanetPositions } from '../calculations/planetPositions.js';
import { jdFromDate, dateFromJd, refine } from '../../astro-tools/transit-events.js';

// ---------------------------------------------------------------------------
// Saturn sign-change scan
// ---------------------------------------------------------------------------

export interface SaturnSignChange {
  signIndex: number;
  exactAt: Date;
}

/**
 * Scan `[from, to)` for every moment Saturn changes sign (including
 * retrograde re-entries into a prior sign), refined to the day via binary
 * search. A 10-day step is safe: Saturn's fastest sidereal motion is well
 * under a degree every 10 days, so it can never cross an entire 30° sign
 * between samples — the only case a coarse step can miss is a full
 * there-and-back retrograde loop completing inside a single step, which
 * would require Saturn to reverse direction twice within 10 days; a real
 * Saturn retrograde station holds for months, not days, so this cannot
 * happen in practice.
 */
export async function findSaturnSignChanges(
  from: Date,
  to: Date,
  stepDays = 10,
): Promise<SaturnSignChange[]> {
  const changes: SaturnSignChange[] = [];

  let jdPrev = jdFromDate(from);
  const prevPositions = await calculatePlanetPositions(jdPrev);
  let prevSignIndex = prevPositions.find((p) => p.planet === 'Saturn')?.signIndex;
  const jdEnd = jdFromDate(to);

  for (let jd = jdPrev + stepDays; jd <= jdEnd; jd += stepDays) {
    const currPositions = await calculatePlanetPositions(jd);
    const currSignIndex = currPositions.find((p) => p.planet === 'Saturn')?.signIndex;

    if (
      prevSignIndex !== undefined &&
      currSignIndex !== undefined &&
      prevSignIndex !== currSignIndex
    ) {
      const fromSignIndex = prevSignIndex;
      const exactJd = await refine(
        jdPrev,
        jd,
        (positions) => positions.find((p) => p.planet === 'Saturn')?.signIndex === fromSignIndex,
      );
      const entered = (await calculatePlanetPositions(exactJd)).find((p) => p.planet === 'Saturn');
      changes.push({
        signIndex: entered?.signIndex ?? currSignIndex,
        exactAt: dateFromJd(exactJd),
      });
    }

    jdPrev = jd;
    prevSignIndex = currSignIndex;
  }

  return changes;
}

// ---------------------------------------------------------------------------
// Phase timeline
// ---------------------------------------------------------------------------

export type SaturnPhase =
  | 'sade-sati-rising'
  | 'sade-sati-peak'
  | 'sade-sati-setting'
  | 'dhaiya-4th'
  | 'dhaiya-8th'
  | 'none';

export interface SaturnPhaseSegment {
  /** 1-12, Saturn's sign counted from the natal Moon sign. */
  houseFromMoon: number;
  phase: SaturnPhase;
  saturnSignIndex: number;
  startDate: Date;
  endDate: Date;
}

/** Maps Saturn's house-from-Moon to the classical phase label. */
export function houseFromMoonPhase(houseFromMoon: number): SaturnPhase {
  if (houseFromMoon === 12) return 'sade-sati-rising';
  if (houseFromMoon === 1) return 'sade-sati-peak';
  if (houseFromMoon === 2) return 'sade-sati-setting';
  if (houseFromMoon === 4) return 'dhaiya-4th';
  if (houseFromMoon === 8) return 'dhaiya-8th';
  return 'none';
}

/**
 * Build the full Saturn-sign segment timeline across `[from, to)` relative to
 * a natal Moon sign, from real ingress moments (see findSaturnSignChanges).
 */
export async function buildSaturnPhaseTimeline(
  natalMoonSignIndex: number,
  from: Date,
  to: Date,
  stepDays = 10,
): Promise<SaturnPhaseSegment[]> {
  const initial = (await calculatePlanetPositions(jdFromDate(from))).find(
    (p) => p.planet === 'Saturn',
  );
  const changes = await findSaturnSignChanges(from, to, stepDays);

  const boundaries: { signIndex: number; at: Date }[] = [
    { signIndex: initial?.signIndex ?? 0, at: from },
    ...changes.map((c) => ({ signIndex: c.signIndex, at: c.exactAt })),
  ];

  const segments: SaturnPhaseSegment[] = [];
  for (let i = 0; i < boundaries.length; i++) {
    const { signIndex, at: startDate } = boundaries[i]!;
    const endDate = boundaries[i + 1]?.at ?? to;
    const houseFromMoon = ((signIndex - natalMoonSignIndex + 12) % 12) + 1;
    segments.push({
      houseFromMoon,
      phase: houseFromMoonPhase(houseFromMoon),
      saturnSignIndex: signIndex,
      startDate,
      endDate,
    });
  }
  return segments;
}

// ---------------------------------------------------------------------------
// Sade Sati window merging (bridges brief retrograde excursions)
// ---------------------------------------------------------------------------

const SADE_SATI_PHASES: ReadonlySet<SaturnPhase> = new Set([
  'sade-sati-rising',
  'sade-sati-peak',
  'sade-sati-setting',
]);

/** Whole days a segment spans. */
function segmentDays(segment: SaturnPhaseSegment): number {
  return (segment.endDate.getTime() - segment.startDate.getTime()) / 86_400_000;
}

/**
 * Merges the timeline's sade-sati-* segments into contiguous windows,
 * bridging over any single non-sade-sati segment shorter than `maxGapDays`
 * sandwiched between two sade-sati segments — a retrograde dip out across a
 * cusp (into house 11 or house 3) and back, which lasts weeks, not the ~2.5
 * years a genuine exit from the triad would last. `maxGapDays` defaults to
 * 200: comfortably longer than any real cusp-dip, comfortably shorter than a
 * real inter-phase gap.
 */
export function mergeSadeSatiWindows(
  segments: SaturnPhaseSegment[],
  maxGapDays = 200,
): { startDate: Date; endDate: Date; segments: SaturnPhaseSegment[] }[] {
  const windows: { startDate: Date; endDate: Date; segments: SaturnPhaseSegment[] }[] = [];
  let current: SaturnPhaseSegment[] | null = null;
  let pendingGap: SaturnPhaseSegment | null = null;

  const closeCurrent = () => {
    if (current && current.length > 0) {
      windows.push({
        startDate: current[0]!.startDate,
        endDate: current[current.length - 1]!.endDate,
        segments: current,
      });
    }
    current = null;
    pendingGap = null;
  };

  for (const segment of segments) {
    const isSadeSati = SADE_SATI_PHASES.has(segment.phase);

    if (isSadeSati) {
      if (!current) current = [];
      if (pendingGap) {
        current.push(pendingGap);
        pendingGap = null;
      }
      current.push(segment);
    } else if (current && segmentDays(segment) <= maxGapDays) {
      // Hold this non-sade-sati segment provisionally — only kept if the
      // NEXT segment resumes the sade-sati triad (checked on the next
      // iteration via `pendingGap`); otherwise the window closes without it.
      pendingGap = segment;
    } else {
      closeCurrent();
    }
  }
  closeCurrent();

  return windows;
}

// ---------------------------------------------------------------------------
// Public API: real-boundary Sade Sati / Dhaiya for a given "as of" instant
// ---------------------------------------------------------------------------

export interface RealSadeSatiResult {
  active: boolean;
  phase: SaturnPhase;
  /** The FULL merged Sade Sati window containing `asOf`, if active. */
  windowStart: Date | null;
  windowEnd: Date | null;
}

/**
 * Real-boundary Sade Sati for a given instant, searching a horizon around
 * it. Unlike detectCurrentSadeSati's arithmetic estimate, this reports the
 * true merged window (see mergeSadeSatiWindows) including retrograde
 * re-entries — at the cost of an ephemeris scan, so this is for the
 * persistence/cron path (Phase 2.3), not a per-request live call.
 */
export async function detectRealSadeSati(
  natalMoonSignIndex: number,
  asOf: Date,
  horizonYearsPast = 2,
  horizonYearsFuture = 10,
): Promise<RealSadeSatiResult> {
  const from = new Date(asOf.getTime() - horizonYearsPast * 365.25 * 86_400_000);
  const to = new Date(asOf.getTime() + horizonYearsFuture * 365.25 * 86_400_000);
  const timeline = await buildSaturnPhaseTimeline(natalMoonSignIndex, from, to);
  const windows = mergeSadeSatiWindows(timeline);

  const activeWindow = windows.find((w) => asOf >= w.startDate && asOf < w.endDate);
  const currentSegment = timeline.find((s) => asOf >= s.startDate && asOf < s.endDate);

  return {
    active: activeWindow !== undefined,
    phase: currentSegment?.phase ?? 'none',
    windowStart: activeWindow?.startDate ?? null,
    windowEnd: activeWindow?.endDate ?? null,
  };
}

export interface RealDhaiyaResult {
  active: boolean;
  phase: 'dhaiya-4th' | 'dhaiya-8th' | 'none';
  startDate: Date | null;
  endDate: Date | null;
}

export interface DhaiyaWindow {
  startDate: Date;
  endDate: Date;
  phase: 'dhaiya-4th' | 'dhaiya-8th';
}

/**
 * Merges the timeline's dhaiya-4th/dhaiya-8th segments into continuous
 * windows, bridging brief retrograde dips the same way mergeSadeSatiWindows
 * does for Sade Sati. No cross-phase merging: the 4th and 8th are isolated
 * houses (not adjacent to each other), so a run can only ever be one phase.
 */
export function mergeDhaiyaWindows(
  segments: SaturnPhaseSegment[],
  maxGapDays = 200,
): DhaiyaWindow[] {
  const dhaiyaPhases: ReadonlySet<SaturnPhase> = new Set(['dhaiya-4th', 'dhaiya-8th']);
  const windows: DhaiyaWindow[] = [];
  let current: DhaiyaWindow | null = null;

  for (const segment of segments) {
    if (dhaiyaPhases.has(segment.phase)) {
      const phase = segment.phase as 'dhaiya-4th' | 'dhaiya-8th';
      if (current && current.phase === phase) {
        // Extend across this segment, bridging any short gap left open below
        // (current is never closed for a brief retrograde dip).
        current.endDate = segment.endDate;
      } else {
        if (current) windows.push(current);
        current = { startDate: segment.startDate, endDate: segment.endDate, phase };
      }
    } else if (current && segmentDays(segment) <= maxGapDays) {
      // Brief dip out of the Dhaiya house — leave `current` open so a
      // resuming Dhaiya segment above extends across it.
    } else {
      if (current) windows.push(current);
      current = null;
    }
  }
  if (current) windows.push(current);

  return windows;
}

/**
 * Real-boundary Dhaiya (Kantaka Shani) — Saturn transiting the 4th or 8th
 * house from natal Moon, ~2.5 years each.
 */
export async function detectRealDhaiya(
  natalMoonSignIndex: number,
  asOf: Date,
  horizonYearsPast = 2,
  horizonYearsFuture = 10,
): Promise<RealDhaiyaResult> {
  const from = new Date(asOf.getTime() - horizonYearsPast * 365.25 * 86_400_000);
  const to = new Date(asOf.getTime() + horizonYearsFuture * 365.25 * 86_400_000);
  const timeline = await buildSaturnPhaseTimeline(natalMoonSignIndex, from, to);
  const windows = mergeDhaiyaWindows(timeline);

  const activeWindow = windows.find((w) => asOf >= w.startDate && asOf < w.endDate);

  return {
    active: activeWindow !== undefined,
    phase: activeWindow?.phase ?? 'none',
    startDate: activeWindow?.startDate ?? null,
    endDate: activeWindow?.endDate ?? null,
  };
}
