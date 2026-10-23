// =============================================================================
// Pure path/hash helpers for palm-reading storage — no I/O, unit-tested in
// isolation. The actual GCS calls (storage.ts) are a thin, untested wrapper
// around these, same posture this codebase already takes toward DB-touching
// repo functions (e.g. reports.repo.ts has no direct unit tests; only its
// pure logic does).
// =============================================================================

import { createHash } from 'node:crypto';

/**
 * The photos the app captures, in order (owner, 2026-10-23: five). The thumb close-up and the
 * low-angle mounts view were added after the first three; a scan needs only REQUIRED_SLOTS, so a
 * capture started on an older app (three photos) still finishes, and the scan reads whichever of
 * the other two are there.
 */
export const PALM_CAPTURE_SLOTS = [
  'primaryFront',
  'primaryPercussion',
  'primaryFingertips',
  'primaryThumb',
  'primaryMounts',
] as const;

export type PalmCaptureSlot = (typeof PALM_CAPTURE_SLOTS)[number];

/** The photos a scan cannot run without. */
export const REQUIRED_SLOTS = ['primaryFront', 'primaryPercussion', 'primaryFingertips'] as const;
export const PRIMARY_SLOTS = PALM_CAPTURE_SLOTS;
export const ALL_SLOTS = PALM_CAPTURE_SLOTS;

/**
 * Old slot names that existed before the 6→3 reduction (2026-10).  The upload
 * route still accepts them so that a user who started a capture on an older app
 * version can finish without an error.  They are NOT part of PALM_CAPTURE_SLOTS
 * and are not required for analyze().
 */
export const LEGACY_SLOTS = ['primaryDorsal', 'secondaryFront', 'secondaryPercussion'] as const;

export type LegacyPalmCaptureSlot = (typeof LEGACY_SLOTS)[number];

const SLOT_SET = new Set<string>([...PALM_CAPTURE_SLOTS, ...LEGACY_SLOTS]);

/** Private bucket path for one captured frame. Slot is validated against the
 * fixed known set — never interpolated from unchecked user input — so this
 * can't be used for path traversal even if a caller forgets to validate
 * upstream. */
export function buildFramePath(userId: string, readingId: string, slot: string): string {
  if (!SLOT_SET.has(slot)) {
    throw new Error(`Unknown palm capture slot: ${slot}`);
  }
  return `palm/${userId}/${readingId}/${slot}.jpg`;
}

/**
 * SHA-256 over the full captured frame set, order-independent (sorted by slot
 * key) so upload order never affects the hash. Used to dedupe an identical
 * re-upload — see palm_readings.frames_hash — so a repeat submission skips
 * the vision call entirely.
 */
export function computeFramesHash(frames: Partial<Record<string, Buffer>>): string {
  const hash = createHash('sha256');
  const slots = Object.keys(frames).sort();
  for (const slot of slots) {
    hash.update(slot);
    hash.update(frames[slot]!);
  }
  return hash.digest('hex');
}
