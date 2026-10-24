// Admin -> Gemini Keys: list, add, rename, switch off, reorder, test and delete
// the keys the Gemini pool uses. See lib/llm/gemini-keys.ts for how the table
// and .env combine, and gemini-key-pool.ts for how a key is picked.
//
// A key's secret never leaves the server: the list shows its last 4
// characters, and audit-log entries carry its name and id only.

import { env } from '../../config/env.js';
import type { GeminiKeyRow } from '../../db/schema.js';
import { encryptField, decryptField } from '../../lib/crypto/field-encryption.js';
import { Errors } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { isCoolingDown } from '../../lib/llm/gemini-key-pool.js';
import {
  envGeminiKeys,
  fingerprintOf,
  invalidateGeminiKeys,
  type GeminiKey,
  type KeyTier,
} from '../../lib/llm/gemini-keys.js';
import { logAdminAction } from './admin.repo.js';
import {
  deleteGeminiKeyRow,
  findGeminiKeyRow,
  insertGeminiKeyRow,
  insertMissingGeminiKeyRows,
  listGeminiKeyRows,
  recordGeminiKeyTest,
  updateGeminiKeyRow,
} from './gemini-keys.repo.js';

const TEST_TIMEOUT_MS = 20_000;
/**
 * Only catches text that is plainly not a key (spaces, a pasted sentence).
 * The real check is the test call: Google changes the key format (AIza...,
 * then AQ.Ab... from 2026, which has a dot), so the shape is not ours to judge.
 */
const KEY_PATTERN = /^[A-Za-z0-9._~+/=-]+$/;

export interface GeminiKeyDto {
  id: string;
  name: string;
  tier: KeyTier;
  source: 'env' | 'admin';
  enabled: boolean;
  paidPosition: number | null;
  last4: string;
  available: boolean;
  coolingDown: boolean;
  lastTestedAt: string | null;
  lastTestOk: boolean | null;
  lastTestMessage: string | null;
  createdAt: string;
}

function tierOf(row: GeminiKeyRow): KeyTier {
  return row.tier === 'paid' ? 'paid' : 'free';
}

/** The secret behind a row: from .env for an 'env' row, decrypted for an 'admin' one. */
function secretOf(row: GeminiKeyRow, envByFingerprint: Map<string, GeminiKey>): string | null {
  if (row.source === 'env') return envByFingerprint.get(row.fingerprint)?.key ?? null;
  try {
    return decryptField(row.secret);
  } catch (err) {
    logger.error({ err, id: row.id }, 'gemini-keys: could not decrypt a stored key');
    return null;
  }
}

/**
 * Every row, after giving each .env key one (with its default name, tier and
 * paid order) so it can be edited like any other. Sorted the way the pool
 * spends them: free keys, then paid keys in their order.
 */
async function loadRows(): Promise<{
  rows: GeminiKeyRow[];
  envByFingerprint: Map<string, GeminiKey>;
}> {
  const envKeys = envGeminiKeys();
  await insertMissingGeminiKeyRows(
    envKeys.map((key) => ({
      fingerprint: key.fingerprint,
      source: 'env',
      name: key.name,
      tier: key.tier,
      secret: null,
      enabled: true,
      paidRank: key.paidRank,
    })),
  );
  const rows = await listGeminiKeyRows();
  const free = rows.filter((row) => tierOf(row) === 'free');
  const paid = rows
    .map((row, position) => ({ row, position }))
    .filter(({ row }) => tierOf(row) === 'paid')
    .sort((a, b) => a.row.paidRank - b.row.paidRank || a.position - b.position)
    .map(({ row }) => row);
  return {
    rows: [...free, ...paid],
    envByFingerprint: new Map(envKeys.map((key) => [key.fingerprint, key])),
  };
}

export async function listGeminiKeys(): Promise<GeminiKeyDto[]> {
  const { rows, envByFingerprint } = await loadRows();
  let paidPosition = 0;
  return Promise.all(
    rows.map(async (row) => {
      const secret = secretOf(row, envByFingerprint);
      const tier = tierOf(row);
      // Counts only the paid keys the pool can actually use, so #1 is always
      // the key billed first right now; a switched-off key has no number.
      const inUse = row.enabled && secret !== null;
      return {
        id: row.id,
        name: row.name,
        tier,
        source: row.source === 'admin' ? ('admin' as const) : ('env' as const),
        enabled: row.enabled,
        paidPosition: tier === 'paid' && inUse ? ++paidPosition : null,
        last4: secret ? secret.slice(-4) : '????',
        available: secret !== null,
        coolingDown: secret ? await isCoolingDown(row.fingerprint) : false,
        lastTestedAt: row.lastTestedAt?.toISOString() ?? null,
        lastTestOk: row.lastTestOk,
        lastTestMessage: row.lastTestMessage,
        createdAt: row.createdAt.toISOString(),
      };
    }),
  );
}

function assertNameFree(rows: GeminiKeyRow[], name: string, exceptId?: string): void {
  const taken = rows.find(
    (row) => row.id !== exceptId && row.name.toLowerCase() === name.toLowerCase(),
  );
  if (taken) throw Errors.conflict(`Another key is already called "${taken.name}"`);
}

export async function addGeminiKey(
  input: { name: string; tier: KeyTier; key: string },
  adminPhone: string,
): Promise<GeminiKeyDto> {
  const key = input.key.trim();
  if (!KEY_PATTERN.test(key)) {
    throw Errors.badRequest(
      'That does not look like a Gemini API key (it has spaces or other characters a key never has)',
    );
  }
  const { rows } = await loadRows();
  assertNameFree(rows, input.name);

  const fingerprint = fingerprintOf(key);
  const existing = rows.find((row) => row.fingerprint === fingerprint);
  if (existing) throw Errors.conflict(`This key is already in the list, as "${existing.name}"`);

  // A new paid key goes last, so adding one never changes which key bills first.
  const lastPaidRank = Math.max(
    -1,
    ...rows.filter((row) => tierOf(row) === 'paid').map((row) => row.paidRank),
  );
  const inserted = await insertGeminiKeyRow({
    fingerprint,
    source: 'admin',
    name: input.name,
    tier: input.tier,
    secret: encryptField(key),
    enabled: true,
    paidRank: lastPaidRank + 1,
    updatedBy: adminPhone,
  });
  if (!inserted) throw Errors.conflict('This key is already in the list');

  await invalidateGeminiKeys();
  await logAdminAction(adminPhone, 'POST /v1/admin/gemini-keys', {
    id: inserted.id,
    name: inserted.name,
    tier: inserted.tier,
  });
  return dtoById(inserted.id);
}

async function dtoById(id: string): Promise<GeminiKeyDto> {
  const dto = (await listGeminiKeys()).find((row) => row.id === id);
  if (!dto) throw Errors.notFound('Key not found');
  return dto;
}

/** Refuses a change that would leave the pool without a single usable key. */
function assertSomeKeyLeft(
  rows: GeminiKeyRow[],
  envByFingerprint: Map<string, GeminiKey>,
  changedId: string,
  removedOrOff: boolean,
): void {
  if (!removedOrOff) return;
  const usableLeft = rows.filter(
    (row) => row.id !== changedId && row.enabled && secretOf(row, envByFingerprint) !== null,
  );
  if (usableLeft.length === 0) {
    throw Errors.badRequest(
      'That would leave no Gemini key switched on, so every AI feature would stop',
    );
  }
}

export async function updateGeminiKey(
  id: string,
  patch: { name?: string; tier?: KeyTier; enabled?: boolean },
  adminPhone: string,
): Promise<GeminiKeyDto> {
  const { rows, envByFingerprint } = await loadRows();
  const row = rows.find((r) => r.id === id);
  if (!row) throw Errors.notFound('Key not found');
  if (patch.name !== undefined) assertNameFree(rows, patch.name, id);
  assertSomeKeyLeft(rows, envByFingerprint, id, patch.enabled === false);

  const next: { name?: string; tier?: KeyTier; enabled?: boolean; paidRank?: number } = {
    ...patch,
  };
  // A key moved into the paid tier joins at the end of the paid order.
  if (patch.tier === 'paid' && tierOf(row) !== 'paid') {
    next.paidRank =
      Math.max(-1, ...rows.filter((r) => tierOf(r) === 'paid').map((r) => r.paidRank)) + 1;
  }
  await updateGeminiKeyRow(id, next, adminPhone);
  await invalidateGeminiKeys();
  await logAdminAction(adminPhone, 'PATCH /v1/admin/gemini-keys/:id', {
    id,
    name: row.name,
    ...patch,
  });
  return dtoById(id);
}

/** The paid row with this id plus every paid row in the order the pool tries them. */
async function paidOrderFor(id: string): Promise<{ row: GeminiKeyRow; paid: GeminiKeyRow[] }> {
  const { rows } = await loadRows();
  const row = rows.find((r) => r.id === id);
  if (!row) throw Errors.notFound('Key not found');
  if (tierOf(row) !== 'paid')
    throw Errors.badRequest('Only a paid key has an order; free keys take turns');
  // loadRows already sorts the paid keys by their rank.
  return { row, paid: rows.filter((r) => tierOf(r) === 'paid') };
}

/** Saves a paid order as ranks 0, 1, 2... touching only the rows whose rank changes. */
async function savePaidOrder(ordered: GeminiKeyRow[], adminPhone: string): Promise<void> {
  for (const [i, key] of ordered.entries()) {
    if (key.paidRank !== i) await updateGeminiKeyRow(key.id, { paidRank: i }, adminPhone);
  }
  await invalidateGeminiKeys();
}

/** Makes a paid key the first one tried; the rest keep their order behind it. */
export async function useGeminiKeyFirst(id: string, adminPhone: string): Promise<GeminiKeyDto[]> {
  const { row, paid } = await paidOrderFor(id);
  await savePaidOrder([row, ...paid.filter((r) => r.id !== id)], adminPhone);
  await logAdminAction(adminPhone, 'POST /v1/admin/gemini-keys/:id/use-first', {
    id,
    name: row.name,
  });
  return listGeminiKeys();
}

/** Swaps a paid key with its neighbour above or below; at either end nothing changes. */
export async function moveGeminiKey(
  id: string,
  direction: 'up' | 'down',
  adminPhone: string,
): Promise<GeminiKeyDto[]> {
  const { row, paid } = await paidOrderFor(id);
  const from = paid.findIndex((r) => r.id === id);
  const to = direction === 'up' ? from - 1 : from + 1;
  if (to >= 0 && to < paid.length) {
    const ordered = [...paid];
    [ordered[from], ordered[to]] = [ordered[to]!, ordered[from]!];
    await savePaidOrder(ordered, adminPhone);
    await logAdminAction(adminPhone, 'POST /v1/admin/gemini-keys/:id/move', {
      id,
      name: row.name,
      direction,
    });
  }
  return listGeminiKeys();
}

export async function deleteGeminiKey(id: string, adminPhone: string): Promise<void> {
  const { rows, envByFingerprint } = await loadRows();
  const row = rows.find((r) => r.id === id);
  if (!row) throw Errors.notFound('Key not found');
  if (row.source === 'env' && envByFingerprint.has(row.fingerprint)) {
    throw Errors.badRequest('This key comes from the server .env file. Switch it off here instead');
  }
  assertSomeKeyLeft(rows, envByFingerprint, id, true);
  await deleteGeminiKeyRow(id);
  await invalidateGeminiKeys();
  await logAdminAction(adminPhone, 'DELETE /v1/admin/gemini-keys/:id', { id, name: row.name });
}

function googleMessage(body: string): string {
  try {
    const parsed = JSON.parse(body) as unknown;
    const first = Array.isArray(parsed) ? (parsed[0] as unknown) : parsed;
    const message = (first as { error?: { message?: unknown } } | null)?.error?.message;
    if (typeof message === 'string' && message) return message.slice(0, 300);
  } catch {
    // not JSON; fall through to the raw text
  }
  return body.slice(0, 300) || 'no details';
}

/**
 * Sends one tiny real request on this key with the app's default model, so a
 * pass means the key is valid AND has quota left. A paid key is billed for it
 * (a few tokens). Records the result on the row for the list to show.
 */
export async function testGeminiKey(
  id: string,
  adminPhone: string,
): Promise<{ ok: boolean; status: number | null; latencyMs: number; message: string }> {
  const row = await findGeminiKeyRow(id);
  if (!row) throw Errors.notFound('Key not found');
  const envByFingerprint = new Map(envGeminiKeys().map((key) => [key.fingerprint, key]));
  const secret = secretOf(row, envByFingerprint);
  if (!secret)
    throw Errors.badRequest(
      'This key is no longer in the server .env file, so it cannot be tested',
    );

  const started = Date.now();
  let result: { ok: boolean; status: number | null; message: string };
  try {
    const res = await fetch(`${env.GEMINI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
      body: JSON.stringify({
        model: env.GEMINI_MODEL,
        messages: [{ role: 'user', content: 'Reply with the single word OK.' }],
      }),
      signal: AbortSignal.timeout(TEST_TIMEOUT_MS),
    });
    const ms = Date.now() - started;
    if (res.ok) {
      result = {
        ok: true,
        status: res.status,
        message: `Works — answered in ${ms} ms on ${env.GEMINI_MODEL}`,
      };
    } else {
      const detail = googleMessage(await res.text());
      const what =
        res.status === 429
          ? 'Out of quota or rate limited'
          : res.status === 400 || res.status === 401 || res.status === 403
            ? 'Key rejected'
            : 'Gemini error';
      result = { ok: false, status: res.status, message: `${what} (${res.status}): ${detail}` };
    }
  } catch (err) {
    const timedOut =
      err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
    result = {
      ok: false,
      status: null,
      message: timedOut
        ? `No answer within ${TEST_TIMEOUT_MS / 1000} s`
        : `Could not reach Gemini: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  const latencyMs = Date.now() - started;

  await recordGeminiKeyTest(id, result.ok, result.message);
  await logAdminAction(adminPhone, 'POST /v1/admin/gemini-keys/:id/test', {
    id,
    name: row.name,
    ok: result.ok,
    status: result.status,
  });
  return { ...result, latencyMs };
}
