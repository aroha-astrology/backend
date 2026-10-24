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
import { addWalletBalance, deductWalletBalance } from '../users/users.repo.js';
import { refundKeysOn, refundOf } from '../billing/refund-keys.js';
import { passEntitlement, passPeriodStart, requirePass } from '../../lib/entitlements.js';
import { listGroupIdsForUser } from '../user-groups/user-groups.repo.js';
import { PALM_READINGS_PER_PERIOD } from '../pass/pass.config.js';
import { resolveFeaturesForUser, modelForUser } from '../features/features.service.js';
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
  clearPalmUnlock,
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
  datePalmEventsFromHand,
  type PalmEvent,
  type PalmEventKind,
} from '../../lib/astro-engine/palm/palm-timing.js';
import { loadPalmPerson, personFactsBlock, type PalmPerson } from './palm-person.js';
import { isOxionModel, oxionChat, oxionConfigured } from '../../lib/llm/oxion-client.js';
import {
  computeFramesHash,
  ALL_SLOTS,
  REQUIRED_SLOTS,
  type PalmCaptureSlot,
} from '../../lib/palm/storage-paths.js';
import { matchPalmRules } from '../../lib/astro-engine/palm/palm-rules.js';
import { computePalmBiometrics } from '../../lib/astro-engine/palm/palm-biometrics.js';
import type { PalmMountReliefData, PalmLandmarksData } from '../../db/schema.js';
import { buildInterpretPrompt, parseInterpretResponse } from '../../lib/llm/palm/interpret.js';
import type { PalmHandObservations } from '../../lib/astro-engine/palm/palm-types.js';
import type { PalmLineNote } from '../../lib/llm/palm/interpret.js';
import type { ReportSection } from '../../modules/reports/report-generator.types.js';
import type { UserRow, PalmReadingRow } from '../../db/schema.js';
import type { PalmReadingDto } from './palm.schemas.js';

export const PALM_FEATURE_KEY = 'paid.palmReading';
/** The normal price of a full reading when the admin has not set one: Rs 199 (owner, 2026-10-24). */
export const DEFAULT_PALM_PRICE_PAISE = 19_900;
/** Admin -> Features model pickers (see config/features.ts's `ai` group). Both resolve to
 * the global MODEL until someone picks a model in the dashboard. */
const PALM_VISION_MODEL_KEY = 'ai.palmVisionModel';
const PALM_INTERPRET_MODEL_KEY = 'ai.palmInterpretModel';
const PALM_QUESTION_MODEL_KEY = 'ai.palmQuestionModel';
const PALM_TRANSLATE_MODEL_KEY = 'ai.palmTranslateModel';

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
 * Members of an admin user group are never limited or charged for palm readings (owner,
 * 2026-10-24): they are the team and testers, so every reading is free and none is counted.
 */
async function inAdminGroup(userId: string): Promise<boolean> {
  try {
    return (await listGroupIdsForUser(userId)).length > 0;
  } catch {
    return false;
  }
}

/**
 * Where this reader's free reading is counted from: the start of their Pass period, or the moment
 * admin last reset their count, whichever is later.
 */
async function freeAllowanceStart(user: UserRow): Promise<Date> {
  const periodStart = await passPeriodStart(user.id);
  const reset = user.palmFreeResetAt;
  return reset && reset > periodStart ? reset : periodStart;
}

/**
 * The "unlock the full report" half, open to everyone (owner, 2026-10-24). A reader pays the normal
 * price from the wallet; an Aroha Pass member (any tier) gets PALM_READINGS_PER_PERIOD reading free
 * per Pass period (admin can reset that count) and pays the normal price for any further one.
 * Requires Stage A to have already completed ('observed'), then runs Stage B using the
 * ALREADY-STORED observations — no re-download, no re-running vision.
 *
 * Throws 409 INSUFFICIENT_CREDITS when the wallet is short. A reading that failed after a free
 * unlock is retried free and does not count again; one that failed after a paid unlock was
 * refunded in full and asks for payment again.
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
  const pricePaise = features[PALM_FEATURE_KEY]?.pricePaise ?? DEFAULT_PALM_PRICE_PAISE;

  // How this unlock is paid for. A retry of an already-unlocked reading (failed after a free
  // unlock) is not paid for again.
  let chargePaise = 0;
  let charged = false;
  if (!row.unlocked && !(await inAdminGroup(user.id))) {
    const pass = await passEntitlement(user.id);
    const free =
      pass?.features.includes('palm') === true &&
      (await countPalmUnlocksSince(user.id, await freeAllowanceStart(user), readingId)) <
        PALM_READINGS_PER_PERIOD;
    if (!free) {
      chargePaise = pricePaise;
      charged = await deductWalletBalance(user.id, chargePaise, 'palm_unlock');
      if (!charged) throw Errors.conflict('INSUFFICIENT_CREDITS');
    }
  }

  const claimed = await claimPalmGeneration(readingId, ['observed', 'failed']);
  if (!claimed) {
    if (charged) await addWalletBalance(user.id, chargePaise, 'refund:palm_unlock');
    throw Errors.conflict('Reading is already being unlocked');
  }
  // Price 0 for a free (Pass) reading and for a retry: a stored price would be refunded again if
  // a retry that was already refunded fails once more.
  await markPalmReadingUnlocked(readingId, chargePaise);

  void runPalmGeneration(user, claimed).catch((err) => {
    logger.error({ err, readingId }, 'palm unlock background failure escaped runPalmGeneration');
  });

  return { status: 'generating' };
}

/**
 * What unlocking this reading would cost this reader right now, so the page can say so before a
 * tap: whether it is free (a Pass member with this period's reading still unused), or the price.
 */
async function palmAllowance(
  user: UserRow,
  readingId: string,
): Promise<{ passMember: boolean; left: number; pricePaise: number; unlimited?: boolean }> {
  const features = await resolveFeaturesForUser(user.id);
  const pricePaise = features[PALM_FEATURE_KEY]?.pricePaise ?? DEFAULT_PALM_PRICE_PAISE;
  if (await inAdminGroup(user.id)) {
    return { passMember: true, left: PALM_READINGS_PER_PERIOD, pricePaise, unlimited: true };
  }
  const pass = await passEntitlement(user.id);
  if (!pass?.features.includes('palm')) return { passMember: false, left: 0, pricePaise };
  const used = await countPalmUnlocksSince(user.id, await freeAllowanceStart(user), readingId);
  return { passMember: true, left: Math.max(0, PALM_READINGS_PER_PERIOD - used), pricePaise };
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

/** One hand on an Oxion model: same contact sheet, prompt, schema and parser as Gemini. */
async function observeHandOxion(
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
  const { text } = await oxionChat({
    model,
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
    temperature: PALM_OBSERVE_PROFILE.temperature,
    // Thinking models spend part of the ceiling reasoning before the JSON starts.
    maxTokens: PALM_OBSERVE_PROFILE.maxTokens + 16_384,
    json: true,
    agent: PALM_OBSERVE_PROFILE.name,
    userId,
    timeoutMs: PALM_GEMINI_ATTEMPT_MS,
  });
  let answer: unknown;
  try {
    answer = JSON.parse(cleanJsonString(text));
  } catch {
    throw new Error(`Oxion observe returned unparseable output for ${hand} hand`);
  }
  if ((answer as { isPalm?: unknown } | null)?.isPalm === false) throw new NotAPalmError();
  const parsed = parseOmnirushObservation(answer, sheet);
  if (!parsed) throw new Error(`Oxion observe returned unusable output for ${hand} hand`);
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
  if (isOxionModel(model)) {
    if (oxionConfigured()) {
      try {
        return {
          obs: await observeHandOxion(hand, slots, buffers, userId, model, trace),
          model,
        };
      } catch (err) {
        if (err instanceof NotAPalmError) throw err;
        logger.warn({ err, hand, model }, 'palm: Oxion observe failed, falling back to Gemini');
      }
    }
    return {
      obs: await observeHandGemini(hand, slots, buffers, userId, MODEL, trace),
      model: MODEL,
    };
  }
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
      await addWalletBalance(
        user.id,
        row.pricePaidPaise,
        'refund:palm_unlock',
        ...(await palmRefundOf(user.id, readingId)),
      );
      // Refunded in full, so opening it again asks for payment again (never a second free try).
      await clearPalmUnlock(readingId);
    }
  }
}

/**
 * The refund key of a reading's wallet unlock (money.refundKeys). Only readings bought from the
 * wallet before the Pass carry a price, each was charged once, so one refund per reading is right:
 * the failure path and the stale-row reaper can no longer both pay it.
 */
async function palmRefundOf(userId: string, readingId: string) {
  return (await refundKeysOn(userId)) ? refundOf(`palm_unlock:${readingId}`) : [];
}

/** Dated events for the primary hand: the hand alone plus what the reader says about themselves.
 * No chart window is consulted (owner, 2026-10-24). See palm-timing.ts's datePalmEventsFromHand. */
function datePalmEvents(
  claimed: PalmReadingRow,
  primaryObs: PalmHandObservations,
  person: PalmPerson,
): PalmEvent[] {
  return datePalmEventsFromHand(primaryObs, claimed.primaryHand as 'left' | 'right', {
    age: person.age,
    marital: person.marital,
  });
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

  const person = await loadPalmPerson(user, claimed.birthProfileId);
  let events: PalmEvent[] = [];
  try {
    events = datePalmEvents(claimed, primaryObs, person);
  } catch (err) {
    logger.warn(
      { err, readingId },
      'palm: dating life events failed, reading continues without them',
    );
  }

  const questionAnswer = question
    ? await answerPalmQuestion(
        user,
        question,
        frameBuffers.primaryFront!,
        primaryObs,
        primaryHand,
        person,
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
      eventTally: null,
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
 * reader's own facts and the hand-dated events, like the rest of the reading (no chart).
 */
async function answerPalmQuestion(
  user: UserRow,
  question: string,
  frontBytes: Buffer,
  primaryObs: PalmHandObservations,
  primaryHand: 'left' | 'right',
  person: PalmPerson,
  events: PalmEvent[],
): Promise<{ text: string; raw: boolean; answer: string }> {
  const raw = RAW_QUESTION.test(question);
  const text = question.slice(0, 500);
  const model = await modelForUser(user.id, PALM_QUESTION_MODEL_KEY, MODEL);
  if (raw) {
    const prompt = 'Describe this palm photograph and what it shows, plainly and directly.';
    if (isOxionModel(model) && oxionConfigured()) {
      const front = await buildContactSheet({ label: 'FRONT', bytes: frontBytes }, []);
      const out = await oxionChat({
        model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              {
                type: 'image_url',
                image_url: { url: `data:image/jpeg;base64,${front.jpeg.toString('base64')}` },
              },
            ],
          },
        ],
        maxTokens: 4096,
        agent: 'palm-raw',
        userId: user.id,
      });
      return { text, raw: true, answer: out.text };
    }
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
  const personFacts = personFactsBlock(person);
  const data = [
    facts || '(no notable markings)',
    personFacts ? `About the reader:\n${personFacts}` : '',
    events.length ? `Dated events:\n${events.map(describeEvent).join('\n')}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
  const prompt = [
    `You are a Hasta Samudrika palmist answering ONE question from a person whose ${primaryHand} hand was scanned.`,
    "Use only the measured facts, the reader's own facts and the dated events between the <data> tags; never invent a feature, and never say anything that contradicts the reader's own facts (someone who is not married has not married). Tendency language, no fatalism. Answer in 3-6 sentences.",
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
      const how =
        a.agreement === 'later'
          ? `the hand reads ${a.palmAge} on the usual scale, which is behind them, so the later scale is used`
          : 'read from the hand';
      return `age ${a.age}${a.past ? ' (already passed)' : ''} — ${how}`;
    })
    .join('; ');
  return `${label[e.kind]} (${e.source}${e.mark ? `, ${e.mark}` : ''}): ${ages || 'shown on the hand, no age'}`;
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
  };
  const primaryHand = claimed.primaryHand as 'left' | 'right';
  const primaryObs = stored.primary;
  const mountRelief = claimed.mountRelief as {
    primary?: Record<string, number>;
    secondary?: Record<string, number>;
  } | null;

  const primaryFacts = matchPalmRules(primaryObs, mountRelief?.primary);

  const person = await loadPalmPerson(user, claimed.birthProfileId);

  // The events dated at scan time are reused so the unlocked report shows exactly what the teaser
  // promised; a scan made by an older build (or with none stored) is dated now, from the hand.
  let events = stored.events ?? [];
  if (events.length === 0) {
    try {
      events = datePalmEvents(claimed, primaryObs, person);
    } catch (err) {
      logger.warn(
        { err, readingId },
        'palm: dating life events failed, reading continues without them',
      );
    }
  }

  const interpretModel = await modelForUser(user.id, PALM_INTERPRET_MODEL_KEY, MODEL);
  const interpretPrompt = buildInterpretPrompt({
    primaryHand,
    facts: primaryFacts,
    person,
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
  const scores = interpretation.scores;

  await markPalmReadingReady(readingId, claimedAt, {
    content: { sections, scores, lineNotes, events },
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
    events?: PalmEvent[];
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
    // Palmistry stands alone (owner, 2026-10-24): readings made before that still carry a stored
    // chartScores / kundliMatch, and neither is sent any more.
    if (content?.events) dto.events = content.events;
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
  user: UserRow,
  readingId: string,
  language: string,
): Promise<PalmReadingDto> {
  const userId = user.id;
  const row = await loadOwnedReading(userId, readingId);
  if (row.status === 'observed' && !row.unlocked) {
    const dto = toDto(row);
    dto.allowance = await palmAllowance(user, readingId);
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
    const translateModel = await modelForUser(userId, PALM_TRANSLATE_MODEL_KEY, MODEL);
    const { text: raw } = await palmText({
      model: translateModel,
      profile: PALM_TRANSLATION_PROFILE,
      prompt,
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
        await addWalletBalance(
          row.userId,
          row.pricePaidPaise,
          'refund:palm_unlock',
          ...(await palmRefundOf(row.userId, row.id)),
        ).catch(
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
