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
import { deductWalletBalance, addWalletBalance } from '../users/users.repo.js';
import { resolveFeaturesForUser, modelOf } from '../features/features.service.js';
import { findKundliByUserId } from '../kundli/kundli.repo.js';
import { analyzePlanetStrengths } from '../../lib/astro-engine/gemstones.js';
import { getVimshottariDashaFromChart } from '../../lib/astro-engine/reports/chart-facts.js';
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
  savePalmTranslation,
  findStaleGeneratingPalmReadings,
  saveMountRelief,
  saveObservations,
} from './palm.repo.js';
import { writeFrame, downloadFrame, frameRelativePath } from '../../lib/palm/storage.js';
import { computeFramesHash, type PalmCaptureSlot } from '../../lib/palm/storage-paths.js';
import { matchPalmRules, type PalmRuleFact } from '../../lib/astro-engine/palm/palm-rules.js';
import {
  chartDomainScores,
  clampToChart,
  crossCheckPalmAgainstChart,
} from '../../lib/astro-engine/palm/palm-chart.js';
import { buildObserveMessages, parseObserveResponse } from '../../lib/llm/palm/observe.js';
import { buildInterpretPrompt, parseInterpretResponse } from '../../lib/llm/palm/interpret.js';
import { buildSynthesizePrompt, parseSynthesizeResponse } from '../../lib/llm/palm/synthesize.js';
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
const DEFAULT_PALM_PRICE_PAISE = 9900;

const PRIMARY_SLOTS = [
  'primaryFront',
  'primaryPercussion',
  'primaryDorsal',
  'primaryFingertips',
] as const;
const SECONDARY_SLOTS = ['secondaryFront', 'secondaryPercussion'] as const;
const ALL_SLOTS = [...PRIMARY_SLOTS, ...SECONDARY_SLOTS] as const;

/** Male -> right hand, female -> left hand (classical Indian rule). 'other'/unset defaults to
 * right — documented, not hidden — since the tradition has no third-gender convention. */
export function resolvePrimaryHand(gender: UserRow['gender']): 'left' | 'right' {
  return gender === 'female' ? 'left' : 'right';
}

function secondaryHandOf(primaryHand: 'left' | 'right'): 'left' | 'right' {
  return primaryHand === 'left' ? 'right' : 'left';
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

function factsSummary(facts: PalmRuleFact[]): string {
  return (
    facts.map((f) => `- ${f.evidence} => ${f.meaning}`).join('\n') ||
    '(no notable markings observed)'
  );
}

export async function createPalmReading(
  user: UserRow,
  birthProfileId: string | null,
): Promise<{ readingId: string; primaryHand: string }> {
  const primaryHand = resolvePrimaryHand(user.gender);
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
    // Same trust-boundary posture as the scores above: clamp into the normalized range and
    // drop anything that isn't a finite number, rather than letting a bad payload put an
    // overlay dot off-canvas on the user's own photograph.
    const { cx, cy, radius } = region;
    if (![cx, cy, radius].every((n) => typeof n === 'number' && Number.isFinite(n))) continue;
    cleanRegions[key] = {
      cx: Math.max(0, Math.min(1, cx)),
      cy: Math.max(0, Math.min(1, cy)),
      radius: Math.max(0, Math.min(0.5, radius)),
    };
  }
  if (Object.keys(clean).length === 0 && Object.keys(cleanRegions).length === 0) return;
  await saveMountRelief(
    readingId,
    hand,
    clean,
    Object.keys(cleanRegions).length > 0 ? cleanRegions : undefined,
  );
}

function missingSlots(frames: Record<string, unknown>): string[] {
  return ALL_SLOTS.filter((slot) => !frames[slot]);
}

/**
 * FREE — triggers Stage A only, once all 6 frames are uploaded. No wallet charge: this is the
 * "scan is free" half of the plan's monetization design. Produces the teaser (hand element,
 * confidence score, annotated line/mount overlay); the interpretation text stays locked until
 * unlockPalmReading is called.
 */
export async function analyzePalmReading(
  user: UserRow,
  readingId: string,
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

  void runPalmGeneration(user, claimed).catch((err) => {
    logger.error(
      { err, readingId },
      'palm observation background failure escaped runPalmGeneration',
    );
  });

  return { status: 'generating' };
}

/**
 * PAID — the "unlock the full report" half. Requires Stage A to have already completed
 * ('observed'). Charges the wallet, then triggers Stage B/C using the ALREADY-STORED
 * observations — no re-download, no re-running vision, so the unlock call is cheap and fast
 * relative to the free scan.
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

  const charged = await deductWalletBalance(user.id, pricePaise, 'palm_unlock');
  if (!charged) throw Errors.conflict('INSUFFICIENT_CREDITS');

  const claimed = await claimPalmGeneration(readingId, ['observed', 'failed']);
  if (!claimed) {
    await addWalletBalance(user.id, pricePaise, 'refund:palm_unlock');
    throw Errors.conflict('Reading is already being unlocked');
  }
  await markPalmReadingUnlocked(readingId, pricePaise);

  void runPalmGeneration(user, claimed).catch((err) => {
    logger.error({ err, readingId }, 'palm unlock background failure escaped runPalmGeneration');
  });

  return { status: 'generating' };
}

async function observeHand(
  hand: 'left' | 'right',
  slots: readonly string[],
  frames: Record<string, { path: string }>,
  userId: string,
  model: string,
): Promise<PalmHandObservations> {
  const frameInputs = await Promise.all(
    slots.map(async (slot) => {
      const frame = frames[slot];
      if (!frame) throw new Error(`Missing frame for slot ${slot}`);
      const buffer = await downloadFrame(frame.path);
      return { slot, dataUrl: `data:image/jpeg;base64,${buffer.toString('base64')}` };
    }),
  );

  const messages = buildObserveMessages({ hand, frames: frameInputs });
  const raw = await generate({
    profile: PALM_OBSERVE_PROFILE,
    messages,
    // Admin-selectable (Admin -> Features -> "Palm — vision model"); resolves to the global
    // MODEL until a model is picked there. Line tracing is the ceiling on the whole feature —
    // the polylines are drawn straight onto the user's own photograph — so this is the one
    // call worth spending a larger model on.
    model,
    userId,
    timeoutMs: 90_000,
  });
  const parsed = parseObserveResponse(raw);
  if (!parsed) throw new Error(`Stage A (observe) returned unparseable output for ${hand} hand`);
  return parsed;
}

/** Dispatches to the correct phase based on what's already stored on the claimed row — see
 * this module's header for the two-phase lifecycle. */
async function runPalmGeneration(user: UserRow, claimed: PalmReadingRow): Promise<void> {
  const readingId = claimed.id;
  const claimedAt = claimed.startedAt!;
  try {
    if (!claimed.observations) {
      await runObservationPhase(user, claimed, claimedAt);
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

/** FREE phase — Stage A (vision measurement) for both hands. */
async function runObservationPhase(
  user: UserRow,
  claimed: PalmReadingRow,
  claimedAt: Date,
): Promise<void> {
  const readingId = claimed.id;
  const frames = claimed.frames as Record<string, { path: string }>;
  const frameBuffers: Record<string, Buffer> = {};
  for (const slot of ALL_SLOTS) {
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
  const secondaryHand = secondaryHandOf(primaryHand);

  // The FREE scan deliberately stays on the default model: it is uncapped and sends six images
  // per reading, so a premium model here is unbounded cost. The paid phase re-observes the
  // primary hand on the admin-selected model instead (see runInterpretationPhase).
  const primaryObs = await observeHand(primaryHand, PRIMARY_SLOTS, frames, user.id, MODEL);
  const secondaryObs = await observeHand(secondaryHand, SECONDARY_SLOTS, frames, user.id, MODEL);

  const confidenceScore = Math.round(
    ((primaryObs.imageQuality.score + secondaryObs.imageQuality.score) / 2) * 10,
  );

  await markPalmReadingObserved(readingId, claimedAt, {
    observations: { primary: primaryObs, secondary: secondaryObs },
    confidenceScore,
    model: MODEL,
  });
}

/** PAID phase — an optional Stage-A re-observation on the admin-selected vision model, then
 * Stage B (interpret) + Stage C (synthesize). Re-observing is skipped entirely when the
 * selected model is the one the free scan already used, so the default configuration behaves
 * exactly as before. */
async function runInterpretationPhase(
  user: UserRow,
  claimed: PalmReadingRow,
  claimedAt: Date,
): Promise<void> {
  const readingId = claimed.id;
  const stored = claimed.observations as {
    primary: PalmHandObservations;
    secondary: PalmHandObservations;
  };
  const primaryHand = claimed.primaryHand as 'left' | 'right';
  const secondaryHand = secondaryHandOf(primaryHand);
  const secondaryObs = stored.secondary;

  // Re-measure the PRIMARY hand on the better model now that this reading is paid for: the
  // primary hand is the one whose photograph gets the drawn overlay and carries the bulk of the
  // reading. Best-effort — a failure here keeps the free scan's observations rather than
  // failing (and refunding) a reading that has everything it needs to proceed.
  const visionModel = await modelOf(PALM_VISION_MODEL_KEY, MODEL);
  let primaryObs = stored.primary;
  if (visionModel !== MODEL) {
    try {
      primaryObs = await observeHand(
        primaryHand,
        PRIMARY_SLOTS,
        claimed.frames as Record<string, { path: string }>,
        user.id,
        visionModel,
      );
      await saveObservations(readingId, { primary: primaryObs, secondary: secondaryObs });
    } catch (err) {
      logger.warn(
        { err, readingId, visionModel },
        'palm: paid re-observation failed, keeping the free scan observations',
      );
      primaryObs = stored.primary;
    }
  }
  const mountRelief = claimed.mountRelief as {
    primary?: Record<string, number>;
    secondary?: Record<string, number>;
  } | null;

  const primaryFacts = matchPalmRules(primaryObs, mountRelief?.primary);
  const secondaryFacts = matchPalmRules(secondaryObs, mountRelief?.secondary);

  const kundli = await findKundliByUserId(user.id, claimed.birthProfileId);
  const chartFacts = buildPalmChartFacts(kundli);
  const chart = kundli?.status === 'ready' ? kundli.chartData : null;

  // Palm/chart reconciliation. The mount-vs-planet facts go into the SAME grounding block as
  // every other fact so the reading has to speak to them; the six domain scores are then
  // clamped to the chart's own (palm-chart.ts) so the palm screen can never show a number that
  // contradicts what the Wealth/Marriage/Career reports show for the same person.
  const chartCrossChecks = chart ? crossCheckPalmAgainstChart(primaryObs, chart) : [];
  const chartScores = chartDomainScores(chart);

  const interpretModel = await modelOf(PALM_INTERPRET_MODEL_KEY, MODEL);
  const interpretPrompt = buildInterpretPrompt({
    primaryHand,
    facts: [...primaryFacts, ...chartCrossChecks],
    chartFacts,
    chartScores,
    language: 'en',
  });
  const interpretRaw = await generate({
    profile: PALM_INTERPRET_PROFILE,
    messages: [{ role: 'user', content: interpretPrompt }],
    model: interpretModel,
    userId: user.id,
  });
  const interpretation = parseInterpretResponse(interpretRaw);
  if (!interpretation) throw new Error('Stage B (interpret) returned unparseable output');
  const { sections, lineNotes } = interpretation;
  const scores = clampToChart(interpretation.scores, chartScores);

  const synthesizePrompt = buildSynthesizePrompt({
    primaryHandLabel: `${primaryHand} hand — vartamana karma (current, lived path)`,
    secondaryHandLabel: `${secondaryHand} hand — purvakarma (inherited blueprint)`,
    primaryFactsSummary: factsSummary(primaryFacts),
    secondaryFactsSummary: factsSummary(secondaryFacts),
  });
  const synthesizeRaw = await generate({
    profile: PALM_INTERPRET_PROFILE,
    messages: [{ role: 'user', content: synthesizePrompt }],
    model: interpretModel,
    userId: user.id,
  });
  const synthesis = parseSynthesizeResponse(synthesizeRaw);
  if (!synthesis) throw new Error('Stage C (synthesize) returned unparseable output');

  await markPalmReadingReady(readingId, claimedAt, {
    content: { sections, scores, synthesis, lineNotes, chartScores },
    model: interpretModel,
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
  // 'observed' = free teaser: the annotated overlay (line polylines, mount development) is
  // real data from Stage A, safe to show unlocked. Sections/scores/synthesis stay withheld
  // until 'ready' (paid).
  if (row.status === 'observed' && row.observations) {
    dto.observations = row.observations;
    if (row.mountRelief) dto.mountRelief = row.mountRelief;
  }
  if (row.status === 'ready') {
    dto.sections = sections ?? content?.sections ?? [];
    if (row.observations) dto.observations = row.observations;
    if (row.mountRelief) dto.mountRelief = row.mountRelief;
    if (content?.scores) dto.scores = content.scores;
    if (content?.synthesis !== undefined) dto.synthesis = content.synthesis;
    // What the user sees when they tap a line or mount on their own photograph.
    const notes = lineNotes ?? content?.lineNotes;
    if (notes) dto.lineNotes = notes;
    // The chart's own verdict on the same six areas — shown beside the palm scores so any
    // remaining gap is visible rather than hidden (the palm score is already clamped to it).
    if (content?.chartScores) dto.chartScores = content.chartScores;
  }
  // Keep the raw provider error in the DB column for ops/debugging — never echo verbatim.
  if (row.status === 'failed')
    dto.error = 'Reading generation failed. Any amount charged has been automatically refunded.';
  return dto as PalmReadingDto;
}

export async function getPalmReadingForUser(
  userId: string,
  readingId: string,
  language: string,
): Promise<PalmReadingDto> {
  const row = await loadOwnedReading(userId, readingId);
  if (row.status !== 'ready' || language === 'en') return toDto(row);

  const cached = row.translations?.[language] as
    | { sections?: ReportSection[]; lineNotes?: Record<string, PalmLineNote> }
    | undefined;
  if (cached?.sections) return toDto(row, cached.sections, cached.lineNotes);

  const content = row.content as {
    sections?: ReportSection[];
    lineNotes?: Record<string, PalmLineNote>;
  } | null;
  const englishSections = content?.sections ?? [];
  const englishNotes = content?.lineNotes ?? {};
  try {
    // Sections AND lineNotes go through in ONE call: the tap-a-line cards are the same
    // reading in miniature, and translating them separately would double the cost while
    // letting the two drift apart in tone and terminology.
    const prompt =
      `Translate the following JSON into ${language}, preserving the exact same shape ` +
      `{ "sections": [{ "heading": string, "paragraphs": string[] }], "lineNotes": { "<id>": { "meaning": string, "prediction": string } } }. ` +
      `Do not add or remove sections, paragraphs or lineNotes entries, and keep every lineNotes key EXACTLY as given (they are ids, not text).\n\n` +
      JSON.stringify({ sections: englishSections, lineNotes: englishNotes });
    const raw = await generate({
      profile: PALM_TRANSLATION_PROFILE,
      messages: [{ role: 'user', content: prompt }],
      userId,
    });
    const translated = JSON.parse(cleanJsonString(raw)) as {
      sections?: ReportSection[];
      lineNotes?: Record<string, PalmLineNote>;
    };
    if (translated.sections) {
      const payload = {
        sections: translated.sections,
        lineNotes: translated.lineNotes ?? englishNotes,
      };
      await savePalmTranslation(readingId, language, payload);
      return toDto(row, payload.sections, payload.lineNotes);
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
