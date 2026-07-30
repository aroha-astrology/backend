// =============================================================================
// Report `scores` prose translation — the ONE piece of `scores` this codebase
// deliberately never translated (see reports.service.ts's recomputeScoresForRead
// doc comment): `scores` is recomputed fresh from the live chart on every
// read, and most of its fields are structural/enum/numeric values a
// general-purpose translator could silently corrupt (the exact failure class
// horoscope.ts's restoreNonTranslatableFields exists to guard against).
//
// This module translates ONLY an explicit, hand-maintained per-report-type
// allowlist of dot-paths — never a heuristic ("looks like a sentence") — so a
// future report field is safe-by-default (stays English until deliberately
// added here) rather than silently mistranslated. See SCORES_PROSE_ALLOWLIST.
//
// Caching: since `scores` is recomputed fresh every read (never persisted),
// naively translating on every request would be a repeated LLM cost. Callers
// hash the extracted leaf strings and cache {hash, values} in the report's
// existing `translations[language].scoresProse` — a cache hit (same hash)
// splices the cached translated values back in with zero LLM calls; a miss
// (first view, or the underlying deterministic computation changed) pays one
// LLM round-trip and re-caches.
// =============================================================================

import { generate } from './gemini-client.js';
import { REPORT_TRANSLATION_PROFILE } from '../../config/llm.js';
import { cleanJsonString } from './horoscope.js';
import crypto from 'node:crypto';

/**
 * Per-report-type allowlist of translatable `scores` dot-paths. `field[].sub`
 * means "for every entry in the `field` array, translate its `sub` property."
 * Deliberately scoped to marriage + kundli_milan/match_report for now — the
 * two report types in the original bug report — not all 10 report types;
 * extending to another report type needs the same trace-and-allowlist
 * exercise, not a blanket heuristic.
 */
export const SCORES_PROSE_ALLOWLIST: Record<string, string[]> = {
  marriage: [
    'venusReason',
    'jupiterReason',
    'seventhLordReason',
    'doshaYoga.positives[].label',
    'doshaYoga.positives[].detail',
    'doshaYoga.cautions[].label',
    'doshaYoga.cautions[].detail',
    'partnerArchetype.label',
    'partnerArchetype.description',
    'partnerArchetype.traits[].label',
    'inLaws.note',
    'moneyAfterMarriage.note',
    // Generation-time LLM one-liner (see lib/llm/reports/window-summary.ts) — spliced onto
    // `windows[].summary` by reports.service.ts's getReportForUser BEFORE this translation step
    // runs, so it's present in `scores` here exactly like any other prose field.
    'windows[].summary',
  ],
  kundli_milan: [
    'primaryDoshaYoga.positives[].label',
    'primaryDoshaYoga.positives[].detail',
    'primaryDoshaYoga.cautions[].label',
    'primaryDoshaYoga.cautions[].detail',
  ],
  match_report: [
    'primaryDoshaYoga.positives[].label',
    'primaryDoshaYoga.positives[].detail',
    'primaryDoshaYoga.cautions[].label',
    'primaryDoshaYoga.cautions[].detail',
  ],
  true_love: ['windows[].summary'],
  wealth: ['windows[].summary'],
};

interface ExtractedLeaf {
  /** The allowlist path spec this leaf came from, e.g. "doshaYoga.positives[].detail". */
  path: string;
  /** Present only for a `field[].sub` path — which array entry this leaf came from. */
  arrayIndex?: number;
  value: string;
}

function getAt(obj: unknown, segments: string[]): unknown {
  let cur = obj;
  for (const seg of segments) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

function setAt(root: Record<string, unknown>, segments: string[], value: string): void {
  let cur: Record<string, unknown> = root;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i]!;
    const next = cur[seg];
    if (typeof next !== 'object' || next === null) return;
    cur = next as Record<string, unknown>;
  }
  const last = segments[segments.length - 1]!;
  if (last in cur) cur[last] = value;
}

/** Extracts every non-empty string at the allowlisted paths, in a stable order (same order every call for the same `scores` shape — required for the hash+splice-by-position scheme to be correct). */
export function extractScoresProse(
  scores: Record<string, unknown>,
  paths: string[],
): ExtractedLeaf[] {
  const leaves: ExtractedLeaf[] = [];
  for (const path of paths) {
    if (path.includes('[].')) {
      const [arrayPath, fieldPath] = path.split('[].') as [string, string];
      const arr = getAt(scores, arrayPath.split('.'));
      if (Array.isArray(arr)) {
        arr.forEach((item, index) => {
          const value = getAt(item, fieldPath.split('.'));
          if (typeof value === 'string' && value.trim()) {
            leaves.push({ path, arrayIndex: index, value });
          }
        });
      }
    } else {
      const value = getAt(scores, path.split('.'));
      if (typeof value === 'string' && value.trim()) {
        leaves.push({ path, value });
      }
    }
  }
  return leaves;
}

/** Deep-clones `scores` and overwrites ONLY the exact leaf positions `leaves` came from — every other field, and any leaf whose translated counterpart is missing/empty, is left byte-for-byte as in the original. */
export function spliceScoresProse(
  scores: Record<string, unknown>,
  leaves: ExtractedLeaf[],
  translatedValues: string[],
): Record<string, unknown> {
  const clone = structuredClone(scores);
  leaves.forEach((leaf, i) => {
    const translated = translatedValues[i];
    if (!translated) return;
    if (leaf.arrayIndex !== undefined) {
      const [arrayPath, fieldPath] = leaf.path.split('[].') as [string, string];
      const arr = getAt(clone, arrayPath.split('.'));
      if (Array.isArray(arr) && arr[leaf.arrayIndex] && typeof arr[leaf.arrayIndex] === 'object') {
        setAt(arr[leaf.arrayIndex] as Record<string, unknown>, fieldPath.split('.'), translated);
      }
    } else {
      setAt(clone, leaf.path.split('.'), translated);
    }
  });
  return clone;
}

/** Hashes the CURRENT English leaf values — used to detect whether a cached translation is still valid (the underlying deterministic computation may have changed between reads, e.g. a scoring-algorithm tweak) without needing any other invalidation trigger. */
export function hashLeafValues(leaves: ExtractedLeaf[]): string {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(leaves.map((l) => l.value)))
    .digest('hex');
}

/**
 * Translates an ordered list of strings to `targetLanguage`, returned in the
 * SAME order/count — no fallback on a parse failure or count mismatch, same
 * discipline as every other translate-on-read consumer: throws, caller must
 * catch and fall back to the untranslated English values rather than
 * splicing a misaligned or corrupted translation back in.
 */
export async function translateScoresProse(
  values: string[],
  targetLanguage: string,
): Promise<string[]> {
  const raw = await generate({
    profile: REPORT_TRANSLATION_PROFILE,
    responseSchema: { type: 'array', items: { type: 'string' } },
    messages: [
      {
        role: 'user',
        content: `Translate each string in this JSON array into the language "${targetLanguage}". Return a JSON array with EXACTLY the same number of strings, in the same order — one translated string per input string, nothing merged or split.\n\nInput:\n${JSON.stringify(values, null, 2)}`,
      },
    ],
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleanJsonString(raw));
  } catch {
    throw new Error(
      `report scores-prose translation returned unparseable JSON (target=${targetLanguage})`,
    );
  }
  if (
    !Array.isArray(parsed) ||
    parsed.length !== values.length ||
    !parsed.every((v) => typeof v === 'string')
  ) {
    throw new Error(
      `report scores-prose translation returned a mismatched array (target=${targetLanguage}, expected=${values.length}, got=${Array.isArray(parsed) ? parsed.length : typeof parsed})`,
    );
  }
  return parsed;
}
