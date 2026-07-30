// =============================================================================
// Pure path/hash helpers for palm-reading storage — no I/O, unit-tested in
// isolation. The actual GCS calls (storage.ts) are a thin, untested wrapper
// around these, same posture this codebase already takes toward DB-touching
// repo functions (e.g. reports.repo.ts has no direct unit tests; only its
// pure logic does).
// =============================================================================

import { createHash } from 'node:crypto';

export const PALM_CAPTURE_SLOTS = [
  'primaryFront',
  'primaryPercussion',
  'primaryDorsal',
  'primaryFingertips',
  'secondaryFront',
  'secondaryPercussion',
] as const;

export type PalmCaptureSlot = (typeof PALM_CAPTURE_SLOTS)[number];

const SLOT_SET = new Set<string>(PALM_CAPTURE_SLOTS);

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
export function computeFramesHash(frames: Partial<Record<PalmCaptureSlot, Buffer>>): string {
  const hash = createHash('sha256');
  const slots = Object.keys(frames).sort();
  for (const slot of slots) {
    hash.update(slot);
    hash.update(frames[slot as PalmCaptureSlot]!);
  }
  return hash.digest('hex');
}
