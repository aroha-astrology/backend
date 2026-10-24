// =============================================================================
// Palm reading orchestration
// =============================================================================
// Lifecycle, two gated phases per the approved plan's "free scan, paid full
// report" monetization:
//
//   pending (frames uploading)
//     -> generating (Stage A only, FREE, triggered by analyzePalmReading)
//     -> observed   (teaser viewable: hand element, confidence, annotated
//                     line/mount overlay — no interpretation text yet)
//     -> generating (Stage B/C only, PAID, triggered by unlockPalmReading)
//     -> ready      (full sections/scores/synthesis)
//     | failed at either phase
//
// 'generating' is reused for both phases — see the enum's doc comment in
// db/schema.ts. runPalmGeneration dispatches on whether `observations` is
// already populated to decide which phase to run. Modeled on vastu.service.ts's
// charge-then-poll flow crossed with gemstone/reports' claim-fence +
// translate-on-read (reports' ReportGenerator contract doesn't fit — see the
// schema file's module header).
// =============================================================================

import { logger } from '../../lib/logger.js';
import { Errors } from '../../lib/errors.js';
import { generate } from '../../lib/llm/gemini-client.js';
import { cleanJsonString } from '../../lib/llm/horoscope.js';
import {
  PALM_OBSERVE_PROFILE,
  PALM_INTERPRET_PROFILE,
  PALM_TRANSLATION_PROFILE,
  MODEL,
} from '../../config/llm.js';
import { addWalletBalance } from '../users/users.repo.js';
import { passEntitlement, passPeriodStart, requirePass } from '../../lib/entitlements.js';
import { PALM_READINGS_PER_PERIOD } from '../pass/pass.config.js';
import { resolveFeaturesForUser, modelForUser } from '../features/features.service.js';
import { findKundliByUserId } from '../kundli/kundli.repo.js';
import { analyzePlanetStrengths } from '../../lib/astro-engine/gemstones.js';
import {
  getVimshottariDashaFromChart,
  julianDayToDate,
} from '../../lib/astro-engine/reports/chart-facts.js';
import { notifyUser } from '../../lib/notifications/notify-user.js';
import {
  createPendingPalmReading,
  findPalmReadingById,
  findReadyPalmReadingByFramesHash,
  listPalmReadingsForUser,
  saveUploadedFrame,
  setFramesHash,
  claimPalmGeneration,
  markPalmReadingObserved,
  markPalmReadingReady,
  markPalmReadingFailed,
  markPalmReadingUnlocked,
  countPalmUnlocksSince,
  savePalmTranslation,
  findStaleGeneratingPalmReadings,
  saveMountRelief,
} from './palm.repo.js';
import { writeFrame, downloadFrame, frameRelativePath } from '../../lib/palm/storage.js';
import { buildContactSheet, loadSnapImages } from '../../lib/palm/image-prep.js';
import { gateTraces } from '../../lib/palm/trace-gate.js';
import { askOmnirush, isOmnirushModel, omnirushConfigured } from '../../lib/llm/omnirush-client.js';
import {
  OMNIRUSH_OBSERVE_SYSTEM,
  PALM_OBSERVE_SCHEMA,
  buildOmnirushObservePrompt,
  parseOmnirushObservation,
} from '../../lib/llm/palm/observe-omnirush.js';
import { palmText } from '../../lib/llm/palm/palm-llm.js';
import {
  PALM_EVENT_KINDS,
  palmEventCandidates,
  reconcilePalmEvents,
  computeKundliMatch,
  type KindWindows,
  type KundliMatch,
  type PalmEvent,
  type PalmEventKind,
  type TimingTally,
} from '../../lib/astro-engine/palm/palm-timing.js';
import {
  computeReportTimingWindows,
  type Domain,
} from '../../lib/astro-engine/reports/report-timing.js';
import { buildDomainSignificators } from '../../lib/astro-engine/reports/report-life-context.js';
import { progenyTimingSignificators } from '../../lib/astro-engine/reports/progeny.js';
import type { StoredMahadasha } from '../../lib/astro-engine/dashas/dasha-range.js';
import { buildChartContext } from '../../lib/intelligence/chart-context.js';
import { laneBands, type TimelineArea } from '../insights/timeline.service.js';
import { resolveProfileContext } from '../birth-profiles/profile-context.js';
import {
  computeFramesHash,
  ALL_SLOTS,
  REQUIRED_SLOTS,
  type PalmCaptureSlot,
} from '../../lib/palm/storage-paths.js';
import { matchPalmRules } from '../../lib/astro-engine/palm/palm-rules.js';
import { computePalmBiometrics } from '../../lib/astro-engine/palm/palm-biometrics.js';
import type { PalmMountReliefData, PalmLandmarksData } from '../../db/schema.js';
import {
  chartDomainScores,
  clampToChart,
  crossCheckPalmAgainstChart,
} from '../../lib/astro-engine/palm/palm-chart.js';
import { buildInterpretPrompt, parseInterpretResponse } from '../../lib/llm/palm/interpret.js';
import type { PalmHandObservations } from '../../lib/astro-engine/palm/palm-types.js';
import type { PalmLineNote } from '../../lib/llm/palm/interpret.js';
import type { ReportSection } from '../../modules/reports/report-generator.types.js';
import type { UserRow, PalmReadingRow, KundliRow } from '../../db/schema.js';
import type { PalmReadingDto } from './palm.schemas.js';

export const PALM_FEATURE_KEY = 'paid.palmReading';
/** Admin -> Features model pickers (see config/features.ts's `ai` group). Both resolve to
 * the global MODEL until someone picks a model in the dashboard. */
const PALM_VISION_MODEL_KEY = 'ai.palmVisionModel';
const PALM_INTERPRET_MODEL_KEY = 'ai.palmInterpretModel';

/** Male -> right hand, female -> left hand (classical Indian rule). The tradition has no rule
 * for anyone else, so for 'other' or no gender on file the reader picks the hand themselves;
 * without that choice this throws 400 HAND_REQUIRED instead of quietly reading the right hand. */
export function resolvePrimaryHand(
  gender: UserRow['gender'],
  chosen?: 'left' | 'right',
): 'left' | 'right' {
  if (gender === 'female') return 'left';
  if (gender === 'male') return 'right';
  if (chosen) return chosen;
  throw Errors.badRequest('HAND_REQUIRED');
}

/** Which mount corresponds to which Navagraha planet — used to correlate palm observations
 * against the user's own chart. Kept in sync conceptually with palm-rules.ts's MOUNT_LABELS. */
const MOUNT_PLANETS = ['Jupiter', 'Saturn', 'Sun', 'Mercury', 'Venus', 'Moon', 'Mars'] as const;

/** Lightweight chart summary for palm-mount cross-validation — same posture as
 * vastu.service.ts's buildChartContext (small, inline, not the full chat-grounding module,
 * which is sized for conversational Q&A, not a one-shot background report). */
function buildPalmChartFacts(kundli: KundliRow | undefined): string {
  if (!kundli || kundli.status !== 'ready') return '';
  const chart = kundli.chartData;
  if (!chart) return '';
  const typed = chart as {
    ascendant?: { sign?: string };
    planets?: Array<{ planet: string; sign: string; house?: number }>;
  };

  const lines: string[] = [];
  if (typed.ascendant?.sign) lines.push(`Ascendant: ${typed.ascendant.sign}`);

  // Each planet's CLASSIFIED strength, not just its position. Sign+house alone gave the
  // interpreting model nothing to corroborate a mount against without re-deriving dignity
  // itself; this hands it the same verdict analyzePlanetStrengths gives every paid report.
  const analyses =
    Array.isArray(typed.planets) && typed.planets.length > 0 ? analyzePlanetStrengths(chart) : [];
  for (const planet of typed.planets ?? []) {
    if (!(MOUNT_PLANETS as readonly string[]).includes(planet.planet)) continue;
    const strength = analyses.find((a) => a.planet === planet.planet)?.strength;
    lines.push(
      `${planet.planet} in ${planet.sign}${planet.house ? ` (house ${planet.house})` : ''}${
        strength ? ` — ${strength}` : ''
      }`,
    );
  }

  // The running dasha decides WHEN the chart's promises land, so a palm timeline written
  // without it can name a life stage the chart says is years away.
  const dasha = getVimshottariDashaFromChart(chart);
  if (dasha?.currentMahadasha?.planet) {
    lines.push(
      `Current Vimshottari period: ${dasha.currentMahadasha.planet} mahadasha` +
        (dasha.currentAntardasha?.planet ? ` / ${dasha.currentAntardasha.planet} antardasha` : ''),
    );
  }

  return lines.join('\n');
}

export async function createPalmReading(
  user: UserRow,
  birthProfileId: string | null,
  /** The gender of the PROFILE being read (a family member's palm follows their gender, not the
   * account owner's). */
  gender: UserRow['gender'],
  chosenHand?: 'left' | 'right',
): Promise<{ readingId: string; primaryHand: string }> {
  const primaryHand = resolvePrimaryHand(gender, chosenHand);
  const row = await createPendingPalmReading(user.id, birthProfileId, primaryHand);
  return { readingId: row.id, primaryHand };
}

async function loadOwnedReading(userId: string, readingId: string): Promise<PalmReadingRow> {
  const row = await findPalmReadingById(readingId);
  if (!row || row.userId !== userId) throw Errors.notFound('Palm reading not found');
  return row;
}

/** Writes one captured frame's raw JPEG bytes to local disk and records it on the reading.
 * Replaces the earlier signed-upload-URL two-step (request URL -> PUT -> confirm) now that
 * storage is local disk rather than a cloud bucket — the bytes come straight through this one
 * authenticated call (see palm.routes.ts's raw-body POST route). */
export async function uploadFrame(
  userId: string,
  readingId: string,
  slot: PalmCaptureSlot,
  bytes: Buffer,
): Promise<void> {
  const row = await loadOwnedReading(userId, readingId);
  if (row.status !== 'pending' && row.status !== 'failed') {
    throw Errors.conflict('Cannot upload frames for a reading that is already generating/ready');
  }
  const path = frameRelativePath(userId, readingId, slot);
  await writeFrame(path, bytes);
  await saveUploadedFrame(readingId, slot, {
    path,
    hash: '',
    capturedAt: new Date().toISOString(),
  });
}

const MOUNT_KEYS = [
  'jupiter',
  'saturn',
  'apollo',
  'mercury',
  'venus',
  'luna',
  'marsUpper',
  'marsLower',
  'rahuPlain',
] as const;

/**
 * Records one hand's client-computed CV mount-relief scores (see the frontend's
 * lib/palm/computeMountRelief.ts) — best-effort, additive accuracy data, never required.
 * Validates shape defensively since this is client-supplied data crossing the trust
 * boundary, but a malformed/partial payload just gets dropped rather than failing the
 * request — losing this optional signal is never worth breaking the capture flow over.
 */
export async function saveHandMountRelief(
  userId: string,
  readingId: string,
  hand: 'primary' | 'secondary',
  scores: Record<string, unknown>,
  regions?: Record<string, { cx: number; cy: number; radius: number }>,
  landmarks?: PalmMountReliefData[string],
): Promise<void> {
  await loadOwnedReading(userId, readingId); // ownership check; throws 404 if not the caller's reading
  const clean: Record<string, number> = {};
  for (const key of MOUNT_KEYS) {
    const value = scores[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      clean[key] = Math.max(0, Math.min(1, value));
    }
  }
  const cleanRegions: Record<string, { cx: number; cy: number; radius: number }> = {};
  for (const key of MOUNT_KEYS) {
    const region = regions?.[key];
    if (!region) continue;
    const { cx, cy, radius } = region;
    if (![cx, cy, radius].every((n) => typeof n === 'number' && Number.isFinite(n))) continue;
    cleanRegions[key] = {
      cx: Math.max(0, Math.min(1, cx)),
      cy: Math.max(0, Math.min(1, cy)),
      radius: Math.max(0, Math.min(0.5, radius)),
    };
  }

  let cleanLandmarks: PalmLandmarksData | undefined;
  if (
    landmarks &&
    typeof landmarks === 'object' &&
    'points' in landmarks &&
    Array.isArray((landmarks as PalmLandmarksData).points)
  ) {
    const rawLm = landmarks as PalmLandmarksData;
    if (
      rawLm.points.length === 21 &&
      rawLm.points.every(
        (pt) =>
          typeof pt.x === 'number' &&
          Number.isFinite(pt.x) &&
          typeof pt.y === 'number' &&
          Number.isFinite(pt.y),
      )
    ) {
      cleanLandmarks = {
        points: rawLm.points.map((pt) => ({
          x: Math.max(0, Math.min(1, pt.x)),
          y: Math.max(0, Math.min(1, pt.y)),
          z: typeof pt.z === 'number' && Number.isFinite(pt.z) ? pt.z : 0,
        })),
        ...(rawLm.handedness === 'Left' || rawLm.handedness === 'Right'
          ? { handedness: rawLm.handedness }
          : {}),
        ...(typeof rawLm.handednessScore === 'number' && Number.isFinite(rawLm.handednessScore)
          ? { handednessScore: rawLm.handednessScore }
          : {}),
        ...(typeof rawLm.imageWidth === 'number' && rawLm.imageWidth > 0
          ? { imageWidth: rawLm.imageWidth }
          : {}),
        ...(typeof rawLm.imageHeight === 'number' && rawLm.imageHeight > 0
          ? { imageHeight: rawLm.imageHeight }
          : {}),
      };
    }
  }

  if (Object.keys(clean).length === 0 && Object.keys(cleanRegions).length === 0 && !cleanLandmarks)
    return;
  await saveMountRelief(
    readingId,
    hand,
    clean,
    Object.keys(cleanRegions).length > 0 ? cleanRegions : undefined,
    cleanLandmarks,
  );
}

function missingSlots(frames: Record<string, unknown>): string[] {
  return REQUIRED_SLOTS.filter((slot) => !frames[slot]);
}

/**
 * FREE — triggers Stage A only, once the 3 required frames are uploaded (5 are captured). No wallet charge: this is the
 * "scan is free" half of the plan's monetization design. Produces the teaser (hand element,
 * confidence score, annotated line/mount overlay); the interpretation text stays locked until
 * unlockPalmReading is called.
 */
export async function analyzePalmReading(
  user: UserRow,
  readingId: string,
  question?: string,
): Promise<{ status: string }> {
  const row = await loadOwnedReading(user.id, readingId);
  if (row.status === 'generating') return { status: 'generating' };
  if (row.status === 'observed' || row.status === 'ready') return { status: row.status };

  const missing = missingSlots(row.frames);
  if (missing.length > 0) {
    throw Errors.badRequest(`Missing captured frames: ${missing.join(', ')}`);
  }

  const claimed = await claimPalmGeneration(readingId, ['pending', 'failed']);
  if (!claimed) throw Errors.conflict('Reading is already being generated');

  void runPalmGeneration(user, claimed, question?.trim() || undefined).catch((err) => {
    logger.error(
      { err, readingId },
      'palm observation background failure escaped runPalmGeneration',
    );
  });

  return { status: 'generating' };
}

/**
 * The "unlock the full report" half, an Aroha Pass benefit (owner, 2026-10-23): every tier,
 * PALM_READINGS_PER_PERIOD full readings per Pass period, never charged to the wallet. Requires
 * Stage A to have already completed ('observed'), then runs Stage B using the ALREADY-STORED
 * observations — no re-download, no re-running vision.
 *
 * Throws 403 PASS_REQUIRED without a Pass, 403 PALM_PERIOD_LIMIT once this period's reading is
 * used. Retrying a reading that failed after it was unlocked doesn't count again.
 */
export async function unlockPalmReading(
  user: UserRow,
  readingId: string,
): Promise<{ status: string }> {
  const row = await loadOwnedReading(user.id, readingId);
  if (row.status === 'ready') return { status: 'ready' };
  if (row.status === 'generating' && row.observations) return { status: 'generating' };
  if (row.status !== 'observed' && row.status !== 'failed') {
    throw Errors.conflict('Reading must finish the free scan before it can be unlocked');
  }

  const features = await resolveFeaturesForUser(user.id);
  if (features[PALM_FEATURE_KEY]?.enabled === false) throw Errors.forbidden('FEATURE_DISABLED');
  await requirePass(user.id, 'palm');
  if (!row.unlocked) {
    const used = await countPalmUnlocksSince(user.id, await passPeriodStart(user.id), readingId);
    if (used >= PALM_READINGS_PER_PERIOD) throw Errors.forbidden('PALM_PERIOD_LIMIT');
  }

  const claimed = await claimPalmGeneration(readingId, ['observed', 'failed']);
  if (!claimed) throw Errors.conflict('Reading is already being unlocked');
  // Price 0 even on a retry: a wallet reading from before the Pass that failed was already
  // refunded, and a stored price would refund it again if this run fails too.
  await markPalmReadingUnlocked(readingId, 0);

  void runPalmGeneration(user, claimed).catch((err) => {
    logger.error({ err, readingId }, 'palm unlock background failure escaped runPalmGeneration');
  });

  return { status: 'generating' };
}

/** Whether the reader's Pass covers a full reading now, so the page can say so before a tap. */
async function palmAllowance(
  userId: string,
  readingId: string,
): Promise<{ passMember: boolean; left: number }> {
  const pass = await passEntitlement(userId);
  if (!pass?.features.includes('palm')) return { passMember: false, left: 0 };
  const used = await countPalmUnlocksSince(userId, await passPeriodStart(userId), readingId);
  return { passMember: true, left: Math.max(0, PALM_READINGS_PER_PERIOD - used) };
}

/** What each captured angle is called on a contact sheet (panel A is always the front). */
const SLOT_VIEW: Record<string, string> = {
  primaryPercussion: 'side edge (little-finger side)',
  primaryFingertips: 'four fingertips (pad side, close up)',
  primaryThumb: 'thumb tip (pad side, close up)',
  primaryMounts: 'low-angle view across the palm from the wrist, showing how raised each mount is',
};
const SLOT_LABEL: Record<string, string> = {
  primaryPercussion: 'SIDE',
  primaryFingertips: 'FINGERTIPS',
  primaryThumb: 'THUMB',
  primaryMounts: 'MOUNTS',
};

/** Thrown when the photo isn't a palm at all — fails the scan with a retake message, no fallback. */
class NotAPalmError extends Error {
  constructor() {
    super('NOT_A_PALM: the vision pass saw no palm in the photograph');
  }
}

/**
 * One hand on Gemini. Since 2026-10-23 it reads the SAME labelled contact sheet with the same
 * prompt, strict schema and parser as Omnirush, so a Gemini scan carries per-line confidence,
 * orientation, the palm box, marriage-line positions and timing marks too. The older Gemini
 * prompt (observe.ts) had none of these, so its readings dated no events and its lines skipped
 * the confidence and on-palm checks.
 */
async function observeHandGemini(
  hand: 'left' | 'right',
  slots: readonly string[],
  buffers: Record<string, Buffer>,
  userId: string,
  model: string,
  trace: boolean,
): Promise<PalmHandObservations> {
  const [front, ...others] = slots;
  const sheet = await buildContactSheet(
    { label: 'FRONT', bytes: buffers[front!]! },
    others.map((slot) => ({ label: SLOT_LABEL[slot] ?? slot, bytes: buffers[slot]! })),
  );
  const prompt =
    buildOmnirushObservePrompt({
      hand,
      otherPanels: others.map((slot) => SLOT_VIEW[slot] ?? slot),
      trace,
    }) +
    `\n\nReturn ONLY one JSON object (no markdown, no prose) that matches this JSON schema exactly, with every listed field present:\n` +
    JSON.stringify(PALM_OBSERVE_SCHEMA);
  const raw = await generate({
    profile: PALM_OBSERVE_PROFILE,
    messages: [
      { role: 'system', content: OMNIRUSH_OBSERVE_SYSTEM },
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          {
            type: 'image_url',
            image_url: { url: `data:image/jpeg;base64,${sheet.jpeg.toString('base64')}` },
          },
        ],
      },
    ],
    model,
    userId,
    // A background job (the reaper waits 15 min): a five-photo sheet with hidden line tracing
    // took over 90 s on gemini-3.8-flash on 2026-10-23, which the default 90 s budget failed.
    timeoutMs: PALM_GEMINI_ATTEMPT_MS,
    totalBudgetMs: PALM_GEMINI_BUDGET_MS,
  });
  let answer: unknown;
  try {
    answer = JSON.parse(cleanJsonString(raw));
  } catch {
    throw new Error(`Stage A (observe) returned unparseable output for ${hand} hand`);
  }
  if ((answer as { isPalm?: unknown } | null)?.isPalm === false) throw new NotAPalmError();
  const parsed = parseOmnirushObservation(answer, sheet);
  if (!parsed) throw new Error(`Stage A (observe) returned unusable output for ${hand} hand`);
  return parsed;
}

async function observeHandOmnirush(
  hand: 'left' | 'right',
  slots: readonly string[],
  buffers: Record<string, Buffer>,
  userId: string,
  model: string,
  trace: boolean,
): Promise<PalmHandObservations> {
  const [front, ...others] = slots;
  const sheet = await buildContactSheet(
    { label: 'FRONT', bytes: buffers[front!]! },
    others.map((slot) => ({ label: SLOT_LABEL[slot] ?? slot, bytes: buffers[slot]! })),
  );
  const { answer } = await askOmnirush({
    prompt: buildOmnirushObservePrompt({
      hand,
      otherPanels: others.map((slot) => SLOT_VIEW[slot] ?? slot),
      trace,
    }),
    system: OMNIRUSH_OBSERVE_SYSTEM,
    model,
    schema: PALM_OBSERVE_SCHEMA,
    image: { bytes: sheet.jpeg, mime: 'image/jpeg' },
    agent: PALM_OBSERVE_PROFILE.name,
    userId,
  });
  if ((answer as { isPalm?: unknown } | null)?.isPalm === false) throw new NotAPalmError();
  const parsed = parseOmnirushObservation(answer, sheet);
  if (!parsed) throw new Error(`Omnirush observe returned unusable output for ${hand} hand`);
  return parsed;
}

/** One Gemini scan attempt may run this long, and all attempts together this long. */
const PALM_GEMINI_ATTEMPT_MS = 240_000;
const PALM_GEMINI_BUDGET_MS = 300_000;

/** One hand on the admin-picked vision model, falling back to Gemini if Omnirush can't serve it. */
async function observeHand(
  hand: 'left' | 'right',
  slots: readonly string[],
  buffers: Record<string, Buffer>,
  userId: string,
  model: string,
  trace: boolean,
): Promise<{ obs: PalmHandObservations; model: string }> {
  if (isOmnirushModel(model)) {
    if (omnirushConfigured()) {
      try {
        return {
          obs: await observeHandOmnirush(hand, slots, buffers, userId, model, trace),
          model: `omnirush:${model}`,
        };
      } catch (err) {
        if (err instanceof NotAPalmError) throw err;
        logger.warn({ err, hand, model }, 'palm: Omnirush observe failed, falling back to Gemini');
      }
    }
    return {
      obs: await observeHandGemini(hand, slots, buffers, userId, MODEL, trace),
      model: MODEL,
    };
  }
  return { obs: await observeHandGemini(hand, slots, buffers, userId, model, trace), model };
}

/** Dispatches to the correct phase based on what's already stored on the claimed row — see
 * this module's header for the two-phase lifecycle. */
async function runPalmGeneration(
  user: UserRow,
  claimed: PalmReadingRow,
  question?: string,
): Promise<void> {
  const readingId = claimed.id;
  const claimedAt = claimed.startedAt!;
  try {
    if (!claimed.observations) {
      await runObservationPhase(user, claimed, claimedAt, question);
    } else {
      await runInterpretationPhase(user, claimed, claimedAt);
    }
  } catch (err) {
    logger.error({ err, readingId }, 'palm reading generation failed');
    await markPalmReadingFailed(
      readingId,
      claimedAt,
      err instanceof Error ? err.message : String(err),
    );
    // Only the paid (interpretation) phase ever charges — pricePaidPaise stays null through
    // the free observation phase, so this is a no-op refund there rather than a real one.
    const row = await findPalmReadingById(readingId);
    if (row?.pricePaidPaise) {
      await addWalletBalance(user.id, row.pricePaidPaise, 'refund:palm_unlock');
    }
  }
}

const MS_PER_YEAR = 365.25 * 86_400_000;
const EVENT_DOMAIN: Record<PalmEventKind, Domain> = {
  marriage: 'love',
  child: 'children',
  careerChange: 'career',
  promotion: 'career',
  wealth: 'wealth',
  relocation: 'foreign',
};
const EVENT_AREA: Record<PalmEventKind, TimelineArea> = {
  marriage: 'relationships',
  child: 'family',
  careerChange: 'career',
  promotion: 'career',
  wealth: 'money',
  relocation: 'relocation',
};

/**
 * The chart's own windows for every palm event kind: ahead, the SAME significator recipes and
 * window search the Marriage / Progeny / Wealth reports and chat use; behind, the Life Timeline's
 * bands. Null when the chart isn't ready — the reading then carries no dated events.
 */
async function chartWindowsForPalm(
  user: UserRow,
  birthProfileId: string | null,
  kundli: KundliRow | undefined,
  now: Date,
): Promise<{ windows: Record<PalmEventKind, KindWindows>; currentAge: number } | null> {
  if (!kundli || kundli.status !== 'ready' || !kundli.chartData) return null;
  const chart = kundli.chartData;
  const dashaData = kundli.dashaData ?? null;
  const mahadashas =
    (dashaData as { vimshottari?: { mahadashas?: StoredMahadasha[] } } | null)?.vimshottari
      ?.mahadashas ?? [];
  const profile = await resolveProfileContext(user, birthProfileId);
  const jd = chart.julianDay;
  const birth =
    typeof jd === 'number'
      ? julianDayToDate(jd)
      : profile.dateOfBirth
        ? new Date(`${profile.dateOfBirth}T00:00:00Z`)
        : null;
  if (!birth || Number.isNaN(birth.getTime())) return null;
  const ageAt = (d: string | Date) => (new Date(d).getTime() - birth.getTime()) / MS_PER_YEAR;
  const ctx = await buildChartContext(kundli, profile, now).catch((err: unknown) => {
    logger.warn({ err }, 'palm: chart context failed, past events will not be dated');
    return null;
  });

  const windows = {} as Record<PalmEventKind, KindWindows>;
  for (const kind of PALM_EVENT_KINDS) {
    const domain = EVENT_DOMAIN[kind];
    const significators =
      kind === 'child'
        ? progenyTimingSignificators(chart)
        : buildDomainSignificators(domain, chart);
    const future = computeReportTimingWindows(
      domain,
      significators,
      dashaData,
      chart,
      now,
    ).windows.map((w) => ({
      startAge: ageAt(w.startDate),
      endAge: ageAt(w.endDate),
      startDate: w.startDate,
      endDate: w.endDate,
    }));
    const past =
      ctx && mahadashas.length > 0
        ? laneBands(ctx, mahadashas, EVENT_AREA[kind], birth, now).map((b) => ({
            startAge: ageAt(b.start),
            endAge: ageAt(b.end),
            startDate: b.start,
            endDate: b.end,
          }))
        : [];
    windows[kind] = { future, past };
  }
  return { windows, currentAge: ageAt(now) };
}

/** Dated events for the primary hand, reconciled with the chart (see palm-timing.ts). */
async function datePalmEvents(
  user: UserRow,
  claimed: PalmReadingRow,
  primaryObs: PalmHandObservations,
  kundli: KundliRow | undefined,
): Promise<{ events: PalmEvent[]; tally: TimingTally | null }> {
  const candidates = palmEventCandidates(primaryObs, claimed.primaryHand as 'left' | 'right');
  if (candidates.length === 0) return { events: [], tally: null };
  const chartWindows = await chartWindowsForPalm(user, claimed.birthProfileId, kundli, new Date());
  if (!chartWindows) return { events: [], tally: null };
  const { events, tally } = reconcilePalmEvents(
    candidates,
    chartWindows.windows,
    chartWindows.currentAge,
  );
  return { events, tally };
}

/** FREE phase — Stage A (vision measurement) for both hands, the crease gate on the primary
 * hand's photo, and the life events dated against the chart (their ages stay locked until paid). */
async function runObservationPhase(
  user: UserRow,
  claimed: PalmReadingRow,
  claimedAt: Date,
  question?: string,
): Promise<void> {
  const readingId = claimed.id;
  const frames = claimed.frames as Record<string, { path: string }>;
  const frameBuffers: Record<string, Buffer> = {};
  // Every captured photo, in capture order; a reading started on an older app has only the
  // required three.
  const presentSlots = ALL_SLOTS.filter((slot) => frames[slot]);
  for (const slot of presentSlots) {
    frameBuffers[slot] = await downloadFrame(frames[slot]!.path);
  }
  const framesHash = computeFramesHash(frameBuffers);
  await setFramesHash(readingId, framesHash);

  const dedupe = await findReadyPalmReadingByFramesHash(user.id, framesHash);
  if (dedupe && dedupe.id !== readingId && dedupe.observations) {
    await markPalmReadingObserved(readingId, claimedAt, {
      observations: dedupe.observations,
      confidenceScore: dedupe.confidenceScore ?? 50,
      model: dedupe.model ?? 'dedupe',
    });
    return;
  }

  const primaryHand = claimed.primaryHand as 'left' | 'right';

  // The admin-picked vision model runs the free scan directly on the primary hand.
  const visionModel = await modelForUser(user.id, PALM_VISION_MODEL_KEY, MODEL);
  const primary = await observeHand(
    primaryHand,
    presentSlots,
    frameBuffers,
    user.id,
    visionModel,
    true,
  );
  const primaryObs = primary.obs;

  const features = await resolveFeaturesForUser(user.id);
  const landmarksData = claimed.mountRelief?.primaryLandmarks as PalmLandmarksData | undefined;

  // Biometric override behind feature switch
  // Distances need the photo's real size (x and y are normalised separately), so no size, no
  // override.
  if (
    features['palm.biometricOverride']?.enabled &&
    landmarksData?.points &&
    landmarksData.points.length === 21 &&
    landmarksData.imageWidth &&
    landmarksData.imageHeight
  ) {
    const biometrics = computePalmBiometrics({
      points: landmarksData.points,
      imageWidth: landmarksData.imageWidth,
      imageHeight: landmarksData.imageHeight,
    });
    if (
      biometrics &&
      (landmarksData.handednessScore ?? 1) >= 0.8 &&
      primaryObs.orientation === 'fingersUp' &&
      biometrics.spacing !== 'tight' &&
      (!primaryObs.detectedHand || primaryObs.detectedHand === primaryHand)
    ) {
      const modelSaid = {
        fingers: primaryObs.fingers ? { ...primaryObs.fingers } : null,
        thumbSet: primaryObs.thumb.setAngle,
        palmShape: primaryObs.handType.palmShape,
        element: primaryObs.handType.element,
      };
      if (!primaryObs.fingers) {
        primaryObs.fingers = {
          indexVsRing: biometrics.indexVsRing,
          littleFingerSet: biometrics.littleFingerSet,
          dominantPhalange: biometrics.dominantPhalange,
          spacing: biometrics.spacing,
        };
      } else {
        primaryObs.fingers.indexVsRing = biometrics.indexVsRing;
        primaryObs.fingers.littleFingerSet = biometrics.littleFingerSet;
        primaryObs.fingers.dominantPhalange = biometrics.dominantPhalange;
        primaryObs.fingers.spacing = biometrics.spacing;
      }
      primaryObs.thumb.setAngle = biometrics.thumbSet;
      primaryObs.handType.palmShape = biometrics.computedPalmShape;
      primaryObs.handType.element = biometrics.computedElement;
      logger.info({ readingId, modelSaid, biometrics }, 'palm: biometric override applied');
    }
  }

  // Snap every traced line onto its real crease and withhold the ones that don't sit on one.
  const gate = gateTraces(primaryObs, await loadSnapImages(frameBuffers.primaryFront!), {
    strictGate: features['palm.strictGate']?.enabled === true,
    landmarks: landmarksData?.points,
  });
  logger.info({ readingId, model: primary.model, ...gate }, 'palm: trace gate');

  const kundli = await findKundliByUserId(user.id, claimed.birthProfileId);
  const { events, tally } = await datePalmEvents(user, claimed, primaryObs, kundli).catch(
    (err: unknown) => {
      logger.warn(
        { err, readingId },
        'palm: dating life events failed, reading continues without them',
      );
      return { events: [] as PalmEvent[], tally: null };
    },
  );

  const questionAnswer = question
    ? await answerPalmQuestion(
        user,
        question,
        frameBuffers.primaryFront!,
        primaryObs,
        primaryHand,
        kundli,
        events,
      ).catch((err: unknown) => {
        logger.warn({ err, readingId }, 'palm: question answer failed, scan continues without it');
        return null;
      })
    : null;

  const confidenceScore = Math.round(primaryObs.imageQuality.score * 10);

  await markPalmReadingObserved(readingId, claimedAt, {
    observations: {
      primary: primaryObs,
      events,
      eventTally: tally,
      ...(questionAnswer ? { question: questionAnswer } : {}),
    },
    confidenceScore,
    model: primary.model,
  });
  await notifyUser(user.id, {
    title: '🖐️ Your palm scan is ready',
    body: 'Your line map is ready — tap to see it.',
    type: 'palm_scan_ready',
    link: `/palm/${readingId}`,
  });
}

/** The exact phrase that makes a question raw: the question IS "Subir Raw" (case and spacing aside). */
const RAW_QUESTION = /^\s*subir\s+raw\s*[.!?]?\s*$/i;

/**
 * Answers the question typed before the scan. When the question is "Subir Raw" the reply is raw:
 * the palm photo goes straight to the model with no kundli, report or dated-event grounding, and
 * comes back as the model gave it. Any other question is answered from the measured hand, the
 * chart facts and the chart-checked events, like the rest of the reading.
 */
async function answerPalmQuestion(
  user: UserRow,
  question: string,
  frontBytes: Buffer,
  primaryObs: PalmHandObservations,
  primaryHand: 'left' | 'right',
  kundli: KundliRow | undefined,
  events: PalmEvent[],
): Promise<{ text: string; raw: boolean; answer: string }> {
  const raw = RAW_QUESTION.test(question);
  const text = question.slice(0, 500);
  const model = await modelForUser(user.id, PALM_INTERPRET_MODEL_KEY, MODEL);
  if (raw) {
    const prompt = 'Describe this palm photograph and what it shows, plainly and directly.';
    if (omnirushConfigured()) {
      const front = await buildContactSheet({ label: 'FRONT', bytes: frontBytes }, []);
      const { answer } = await askOmnirush<string>({
        prompt,
        model: isOmnirushModel(model) ? model : 'gpt-6-astra:low',
        image: { bytes: front.jpeg, mime: 'image/jpeg' },
        agent: 'palm-raw',
        userId: user.id,
      });
      return {
        text,
        raw: true,
        answer: typeof answer === 'string' ? answer : JSON.stringify(answer),
      };
    }
    const out = await generate({
      profile: PALM_INTERPRET_PROFILE,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: { url: `data:image/jpeg;base64,${frontBytes.toString('base64')}` },
            },
          ],
        },
      ],
      model: MODEL,
      userId: user.id,
    });
    return { text, raw: true, answer: out };
  }
  const facts = matchPalmRules(primaryObs)
    .map((f) => `- ${f.evidence} => ${f.meaning}`)
    .join('\n');
  const chartFacts = buildPalmChartFacts(kundli);
  const data = [
    facts || '(no notable markings)',
    chartFacts ? `Birth chart:\n${chartFacts}` : '',
    events.length ? `Dated events:\n${events.map(describeEvent).join('\n')}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
  const prompt = [
    `You are a Hasta Samudrika palmist answering ONE question from a person whose ${primaryHand} hand was scanned.`,
    'Use only the measured facts, chart facts and dated events between the <data> tags; never invent a feature. Where the hand and the chart agree, say so; where they differ, say so. Tendency language, no fatalism. Answer in 3-6 sentences.',
    `<data>\n${data}\n</data>`,
    `Question: ${text}`,
  ].join('\n\n');
  const out = await palmText({ model, profile: PALM_INTERPRET_PROFILE, prompt, userId: user.id });
  return { text, raw: false, answer: out.text.trim() };
}

function describeEvent(e: PalmEvent): string {
  const label: Record<PalmEventKind, string> = {
    marriage: 'Marriage',
    child: 'First child',
    careerChange: 'Career change',
    promotion: 'Big promotion',
    wealth: 'Wealth rise',
    relocation: 'Relocation / move abroad',
  };
  const ages = e.ages
    .map((a) => {
      const years = `${a.window.startDate.slice(0, 4)}-${a.window.endDate.slice(0, 4)}`;
      const how =
        a.agreement === 'match'
          ? `the hand reads ${a.palmAge} and the chart's window (${years}) agrees`
          : a.agreement === 'adjusted'
            ? `the hand reads ${a.palmAge}; the chart's nearest window is ${years}, so age ${a.age} is used`
            : `the hand shows it, the chart times it (${years})`;
      return `age ${a.age}${a.past ? ' (already passed)' : ''} — ${how}`;
    })
    .join('; ');
  return `${label[e.kind]} (${e.source}${e.mark ? `, ${e.mark}` : ''}): ${ages}`;
}

/** PAID phase — Stage B (interpret) + Stage C (synthesize) on the admin-picked text model, with
 * the dated events and chart facts in the grounding so the text matches the photo and the kundli. */
async function runInterpretationPhase(
  user: UserRow,
  claimed: PalmReadingRow,
  claimedAt: Date,
): Promise<void> {
  const readingId = claimed.id;
  const stored = claimed.observations as {
    primary: PalmHandObservations;
    secondary?: PalmHandObservations;
    events?: PalmEvent[];
    eventTally?: TimingTally | null;
  };
  const primaryHand = claimed.primaryHand as 'left' | 'right';
  const primaryObs = stored.primary;
  const mountRelief = claimed.mountRelief as {
    primary?: Record<string, number>;
    secondary?: Record<string, number>;
  } | null;

  const primaryFacts = matchPalmRules(primaryObs, mountRelief?.primary);

  const kundli = await findKundliByUserId(user.id, claimed.birthProfileId);
  const chartFacts = buildPalmChartFacts(kundli);
  const chart = kundli?.status === 'ready' ? kundli.chartData : null;

  // Events dated at scan time are reused so the unlocked report shows exactly what the teaser
  // promised; a scan made before the chart was ready gets them now.
  let events = stored.events ?? [];
  let tally = stored.eventTally ?? null;
  if (events.length === 0 && chart) {
    ({ events, tally } = await datePalmEvents(user, claimed, primaryObs, kundli).catch(() => ({
      events: [] as PalmEvent[],
      tally: null,
    })));
  }

  const chartCrossChecks = chart ? crossCheckPalmAgainstChart(primaryObs, chart) : [];
  const chartScores = chartDomainScores(chart);

  const interpretModel = await modelForUser(user.id, PALM_INTERPRET_MODEL_KEY, MODEL);
  const interpretPrompt = buildInterpretPrompt({
    primaryHand,
    facts: [...primaryFacts, ...chartCrossChecks],
    chartFacts,
    chartScores,
    lifeEvents: events.map(describeEvent),
    language: 'en',
  });

  const interpretRaw = await palmText({
    model: interpretModel,
    profile: PALM_INTERPRET_PROFILE,
    prompt: interpretPrompt,
    userId: user.id,
  });
  const interpretation = parseInterpretResponse(interpretRaw.text);
  if (!interpretation) throw new Error('Stage B (interpret) returned unparseable output');
  const { sections, lineNotes } = interpretation;
  const scores = clampToChart(interpretation.scores, chartScores);

  const kundliMatch = computeKundliMatch({
    tally,
    palmScores: interpretation.scores,
    chartScores,
    chartFacts: chartCrossChecks,
  });

  await markPalmReadingReady(readingId, claimedAt, {
    content: { sections, scores, lineNotes, chartScores, events, kundliMatch },
    model: interpretRaw.model,
  });
  await notifyPalmReadingReady(user.id, readingId);
}

async function notifyPalmReadingReady(userId: string, readingId: string): Promise<void> {
  await notifyUser(userId, {
    title: '🖐️ Your palm reading is ready',
    body: 'Tap to see what your hand reveals.',
    type: 'palm_reading_ready',
    link: `/palm/${readingId}`,
  });
}

/** Stored observations minus the dated events, which only reach the client through `events`
 * (ages withheld until the reading is paid for). */
function publicObservations(observations: Record<string, unknown>): Record<string, unknown> {
  const { events: _events, eventTally: _tally, question: _question, ...rest } = observations;
  return rest;
}

function toDto(
  row: PalmReadingRow,
  sections?: ReportSection[],
  lineNotes?: Record<string, PalmLineNote>,
): PalmReadingDto {
  const content = row.content as {
    sections?: ReportSection[];
    scores?: Record<string, number>;
    synthesis?: unknown;
    lineNotes?: Record<string, PalmLineNote>;
    chartScores?: Record<string, number>;
    events?: PalmEvent[];
    kundliMatch?: KundliMatch | null;
  } | null;
  const observations = row.observations as {
    primary?: PalmHandObservations;
    events?: PalmEvent[];
  } | null;
  // Built as a loose record and cast at the boundary — PalmReadingResponseSchema documents
  // this DTO as intentionally loosely typed on the wire, and constructing it field-by-field
  // like this avoids fighting exactOptionalPropertyTypes over which optional keys are present
  // per status branch (ready/failed carry different extra fields, pending/generating carry none).
  const dto: Record<string, unknown> = {
    id: row.id,
    status: row.status,
    primaryHand: row.primaryHand,
    frames: row.frames,
    unlocked: row.unlocked,
    confidenceScore: row.confidenceScore,
  };
  // Which hand the photo actually shows, so the app can say so when it isn't the one asked for.
  const questionAnswer = (row.observations as { question?: unknown } | null)?.question;
  if (questionAnswer && (row.status === 'observed' || row.status === 'ready'))
    dto.question = questionAnswer;
  if (observations?.primary?.detectedHand) {
    dto.handCheck = { expected: row.primaryHand, detected: observations.primary.detectedHand };
  }
  // 'observed' = free teaser: the annotated overlay (snapped line polylines, mount development) is
  // real data from Stage A, safe to show unlocked, and so is WHICH events the hand shows and where.
  // Their ages, sections, scores and synthesis stay withheld until 'ready' (paid).
  if (row.status === 'observed' && row.observations) {
    dto.observations = publicObservations(row.observations);
    if (row.mountRelief) dto.mountRelief = row.mountRelief;
    dto.events = (observations?.events ?? []).map((e) => ({
      kind: e.kind,
      source: e.source,
      ...(e.mark ? { mark: e.mark } : {}),
      anchor: e.anchor,
      ages: [],
      locked: true,
    }));
  }
  if (row.status === 'ready') {
    dto.sections = sections ?? content?.sections ?? [];
    if (row.observations) dto.observations = publicObservations(row.observations);
    if (row.mountRelief) dto.mountRelief = row.mountRelief;
    if (content?.scores) dto.scores = content.scores;
    if (content?.synthesis !== undefined) dto.synthesis = content.synthesis;
    // What the user sees when they tap a line or mount on their own photograph.
    const notes = lineNotes ?? content?.lineNotes;
    if (notes) dto.lineNotes = notes;
    // The chart's own verdict on the same six areas — shown beside the palm scores so any
    // remaining gap is visible rather than hidden (the palm score is already clamped to it).
    if (content?.chartScores) dto.chartScores = content.chartScores;
    if (content?.events) dto.events = content.events;
    if (content?.kundliMatch) dto.kundliMatch = content.kundliMatch;
  }
  // Keep the raw provider error in the DB column for ops/debugging — never echo verbatim.
  if (row.status === 'failed') {
    dto.error = 'Reading generation failed. Any amount charged has been automatically refunded.';
    if (row.error?.startsWith('NOT_A_PALM')) dto.errorCode = 'NOT_A_PALM';
  }
  return dto as PalmReadingDto;
}

/** Puts a translated answer to the reader's question on the DTO (a copy: the row stays English). */
function withQuestionAnswer(dto: PalmReadingDto, answer: string | undefined): void {
  const loose = dto as Record<string, unknown>;
  const question = loose.question as { answer?: string } | undefined;
  if (answer && question) loose.question = { ...question, answer };
}

export async function getPalmReadingForUser(
  userId: string,
  readingId: string,
  language: string,
): Promise<PalmReadingDto> {
  const row = await loadOwnedReading(userId, readingId);
  if (row.status === 'observed' && !row.unlocked) {
    const dto = toDto(row);
    dto.allowance = await palmAllowance(userId, readingId);
    return dto;
  }
  if (row.status !== 'ready' || language === 'en') return toDto(row);

  const content = row.content as {
    sections?: ReportSection[];
    lineNotes?: Record<string, PalmLineNote>;
    synthesis?: unknown;
  } | null;

  const rawObs = row.observations;
  const rawQ = rawObs?.question as { answer?: string } | undefined;
  const storedAnswer = typeof rawQ?.answer === 'string' ? rawQ.answer : undefined;

  const cached = row.translations?.[language] as
    | {
        sections?: ReportSection[];
        lineNotes?: Record<string, PalmLineNote>;
        synthesis?: unknown;
        questionAnswer?: string;
      }
    | undefined;

  const needsSynthesis = content?.synthesis !== undefined && cached?.synthesis === undefined;
  const needsQuestion = Boolean(storedAnswer && cached?.questionAnswer === undefined);

  if (cached?.sections && !needsSynthesis && !needsQuestion) {
    const dto = toDto(row, cached.sections, cached.lineNotes);
    if (cached.synthesis !== undefined) dto.synthesis = cached.synthesis as Record<string, unknown>;
    withQuestionAnswer(dto, cached.questionAnswer);
    return dto;
  }

  const englishSections = content?.sections ?? [];
  const englishNotes = content?.lineNotes ?? {};
  try {
    const payloadToTranslate: Record<string, unknown> = {
      sections: englishSections,
      lineNotes: englishNotes,
    };
    if (content?.synthesis) payloadToTranslate.synthesis = content.synthesis;
    if (storedAnswer) payloadToTranslate.questionAnswer = storedAnswer;

    // Every key in the payload is asked back, so one call fills the whole cache entry.
    const prompt =
      `Translate the following JSON into ${language}, preserving the exact same shape ` +
      `{ "sections": [{ "heading": string, "paragraphs": string[] }], "lineNotes": { "<id>": { "meaning": string, "prediction": string } }` +
      (payloadToTranslate.synthesis
        ? `, "synthesis": (the same keys as given; translate only the string values)`
        : '') +
      (payloadToTranslate.questionAnswer ? `, "questionAnswer": string` : '') +
      ` }. Do not add or remove keys, sections, paragraphs or lineNotes entries, and keep every lineNotes key EXACTLY as given (they are ids, not text). Numbers stay numbers.\n\n` +
      JSON.stringify(payloadToTranslate);
    const raw = await generate({
      profile: PALM_TRANSLATION_PROFILE,
      messages: [{ role: 'user', content: prompt }],
      userId,
    });
    const translated = JSON.parse(cleanJsonString(raw)) as {
      sections?: ReportSection[];
      lineNotes?: Record<string, PalmLineNote>;
      synthesis?: unknown;
      questionAnswer?: string;
    };
    if (translated.sections) {
      // A key the model dropped is cached in English rather than left out: a missing key makes
      // every later open of this reading translate (and pay for) the whole reading again.
      const payload = {
        sections: translated.sections,
        lineNotes: translated.lineNotes ?? englishNotes,
        ...(content?.synthesis ? { synthesis: translated.synthesis ?? content.synthesis } : {}),
        ...(storedAnswer ? { questionAnswer: translated.questionAnswer ?? storedAnswer } : {}),
      };
      await savePalmTranslation(readingId, language, payload);
      const dto = toDto(row, payload.sections, payload.lineNotes);
      if (payload.synthesis) dto.synthesis = payload.synthesis as Record<string, unknown>;
      withQuestionAnswer(dto, payload.questionAnswer);
      return dto;
    }
  } catch (err) {
    logger.warn({ err, readingId, language }, 'failed to translate palm reading');
  }
  return toDto(row, englishSections, englishNotes);
}

export async function listPalmReadings(
  userId: string,
  birthProfileId: string | null,
): Promise<PalmReadingDto[]> {
  const rows = await listPalmReadingsForUser(userId, birthProfileId);
  return rows.map((r) => toDto(r));
}

/** Self-heals any palm_readings row stuck at 'generating' because the process that claimed
 * it crashed mid-run — same shape as reports.service.ts's reapStaleReports, wired to run
 * every 5 minutes via the OS crontab (see scripts/cron-palm-reap-stale.sh). */
export async function reapStalePalmReadings(): Promise<{ reaped: number }> {
  const staleRows = await findStaleGeneratingPalmReadings();
  let reaped = 0;

  for (const row of staleRows) {
    if (!row.startedAt) continue; // claimPalmGeneration always stamps 'generating' rows with startedAt — defensive only.
    try {
      await markPalmReadingFailed(row.id, row.startedAt, 'Generation timed out (stale)');
      if (row.pricePaidPaise) {
        await addWalletBalance(row.userId, row.pricePaidPaise, 'refund:palm_unlock').catch(
          (refundErr: unknown) =>
            logger.error(
              { err: refundErr, readingId: row.id },
              'stale palm reading reap refund failed',
            ),
        );
      }
      reaped++;
    } catch (err) {
      logger.error({ err, readingId: row.id }, 'stale palm reading reap failed');
    }
  }

  return { reaped };
}

/** Returns one frame's raw bytes for the authenticated frame-read route to stream back —
 * replaces the earlier signed-read-URL, since there's no cloud storage service issuing those
 * anymore (see storage.ts's module header). */
export async function getFrameBytes(
  userId: string,
  readingId: string,
  slot: string,
): Promise<Buffer> {
  const row = await loadOwnedReading(userId, readingId);
  const frame = (row.frames as Record<string, { path: string }>)[slot];
  if (!frame) throw Errors.notFound('Frame not found');
  return downloadFrame(frame.path);
}
