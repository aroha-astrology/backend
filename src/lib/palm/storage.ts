// =============================================================================
// Palm photograph storage — local disk on the same EC2 instance the API
// process runs on. Palm images are biometric data; never served publicly —
// every read goes through the authenticated frame route (requireUser +
// ownership check in palm.service.ts), same as any other protected resource
// in this app. No cloud storage service, no signed URLs: uploads arrive as a
// raw POST body (see palm.routes.ts) and reads stream the file back directly.
//
// Thin wrapper around node:fs — not unit-tested directly (same posture this
// codebase already takes toward other I/O-touching repo/storage layers); the
// pure, testable logic (path construction, hash) lives in storage-paths.ts
// and IS unit-tested.
// =============================================================================

import { mkdir, readFile, writeFile, access, rm } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { env } from '../../config/env.js';
import { buildFramePath, type PalmCaptureSlot } from './storage-paths.js';

/** Resolved lazily (not as a module-scope constant) so importing this module never touches
 * `env.PALM_UPLOAD_DIR` until a storage function actually runs — several unrelated route
 * tests mock config/env.js with a hand-rolled fake object that predates this field, and a
 * top-level `resolve(process.cwd(), env.PALM_UPLOAD_DIR)` would throw at import time for all
 * of them the moment `env.PALM_UPLOAD_DIR` is undefined, regardless of whether that test ever
 * touches palm storage. */
function uploadRoot(): string {
  return resolve(process.cwd(), env.PALM_UPLOAD_DIR);
}

/** Resolves a relative frame path (as stored in palm_readings.frames) against the upload
 * root, with a containment check as defense-in-depth — buildFramePath() already validates the
 * slot against a fixed enum and userId/readingId come from authenticated context/UUIDs, not
 * raw user input, so traversal isn't reachable in practice, but this fails loudly rather than
 * silently if that assumption is ever violated. */
function resolveDiskPath(relativePath: string): string {
  const root = uploadRoot();
  const full = resolve(root, relativePath);
  if (!full.startsWith(root + sep) && full !== root) {
    throw new Error(`Refusing to resolve palm frame path outside upload root: ${relativePath}`);
  }
  return full;
}

export function frameRelativePath(
  userId: string,
  readingId: string,
  slot: PalmCaptureSlot,
): string {
  return buildFramePath(userId, readingId, slot);
}

/** Writes one captured frame to disk, creating any missing parent directories. */
export async function writeFrame(relativePath: string, bytes: Buffer): Promise<void> {
  const full = resolveDiskPath(relativePath);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, bytes);
}

/** Reads a frame's raw bytes — used both to build the Stage-A vision message and to serve the
 * authenticated frame-read route. */
export async function downloadFrame(relativePath: string): Promise<Buffer> {
  return readFile(resolveDiskPath(relativePath));
}

export async function frameExists(relativePath: string): Promise<boolean> {
  try {
    await access(resolveDiskPath(relativePath));
    return true;
  } catch {
    return false;
  }
}

/** Deletes every frame for one reading. Used by the 90-day retention reaper and by the
 * hard-delete/anonymize user-erasure paths — see the privacy requirements in the plan. */
export async function deleteReadingFrames(userId: string, readingId: string): Promise<void> {
  const dir = resolveDiskPath(join('palm', userId, readingId));
  await rm(dir, { recursive: true, force: true });
}

/** Deletes every palm photograph ever captured by a user, across all readings. Used by
 * hardDeleteUserById/anonymizeUserById so erasure doesn't orphan biometric images. */
export async function deleteAllUserFrames(userId: string): Promise<void> {
  const dir = resolveDiskPath(join('palm', userId));
  await rm(dir, { recursive: true, force: true });
}
