// =============================================================================
// Name Change report — segment-aware spelling variants
// =============================================================================
// Deterministic, synchronous, no LLM call — same discipline as name-lookup.ts.
//
// Replaces `generateDeterministicVariants` (numerology/nameCorrection.ts) as
// this report's variant source. That one applies ~10 fixed edits blindly to the
// whole name string, which can't do the two things this report now needs:
//   1. Keep an edit inside ONE segment (first name vs surname), so the report
//      can promise "half of these only touch your first name".
//   2. Yield enough target-hitting candidates to fill a 12-item section — a
//      cartesian of (one inner edit or none) x (one suffix or none) gives a few
//      hundred plausible spellings instead of ten.
// It stays exported from astro-engine/index.ts for any other caller.
//
// Every candidate is validated by the SAME `variantHitsTarget` the rest of the
// report uses — a variant is only ever returned if the FULL resulting name
// reduces to one of the reader's target numbers.
// =============================================================================

import { variantHitsTarget } from '../numerology/nameCorrection.js';

export interface SpellingVariant {
  /** The FULL name with the edit applied — e.g. "Subeer Ghosh", not "Subeer". */
  variant: string;
  /** Reduced Chaldean number of the full `variant`, straight off `variantHitsTarget`. */
  chaldean: number;
  /** Human-readable description of the exact edit, rendered verbatim as the card's `note` —
   * e.g. `first name — replaced "i" with "ee"`. Must read as a sentence fragment. */
  change: string;
}

/** Trailing additions, all common Indic transliteration endings. */
const SUFFIXES = ['a', 'aa', 'h', 'ah', 'ee', 'i', 'y'] as const;

/**
 * Which suffixes actually produce a spelling a person could plausibly carry, given what `seg`
 * already ends in. Without this the generator happily emits "Priyaee" and "Rameshh" — numerically
 * valid, but nothing anyone would put on a passport, and this list is shown to paying readers.
 */
function suffixesFor(seg: string): readonly string[] {
  const last = seg.slice(-1).toLowerCase();
  // Already ends in a vowel: only a doubling vowel or the honorific "h" reads naturally.
  if (VOWELS.includes(last)) return ['a', 'h'];
  // Already ends in "h": stacking another "h" (or "ah") gives "shh"/"hah".
  if (last === 'h') return ['a', 'aa', 'ee', 'i', 'y'];
  return SUFFIXES;
}

/** Letter-level swaps that produce a genuinely used alternative spelling of the same sound —
 * applied one occurrence at a time (see `substitutionEdits`), never globally. */
const SUBSTITUTIONS: ReadonlyArray<readonly [string, string]> = [
  ['i', 'ee'],
  ['ee', 'i'],
  ['a', 'aa'],
  ['aa', 'a'],
  ['u', 'oo'],
  ['oo', 'u'],
  ['s', 'sh'],
  ['k', 'ck'],
  ['t', 'th'],
  ['d', 'dh'],
  ['v', 'w'],
];

const VOWELS = 'aeiou';

interface SegmentEdit {
  text: string;
  change: string;
  /** False for edits that a trailing suffix would contradict — dropping a trailing vowel only to
   * append one back gives nonsense like "Priya" -> "Priyh". */
  combinable: boolean;
}

/** Every single-occurrence application of every SUBSTITUTIONS pair, preserving the original case. */
function substitutionEdits(seg: string): SegmentEdit[] {
  const lower = seg.toLowerCase();
  const out: SegmentEdit[] = [];
  for (const [from, to] of SUBSTITUTIONS) {
    let at = lower.indexOf(from);
    while (at !== -1) {
      // Skip when the text already reads as the replacement here ("Ramesh" already has the "sh"
      // that s->sh would add, so applying it gives "Rameshh").
      if (!lower.startsWith(to, at)) {
        const cased = seg[at] === seg[at]?.toUpperCase() ? to[0]!.toUpperCase() + to.slice(1) : to;
        out.push({
          text: seg.slice(0, at) + cased + seg.slice(at + from.length),
          change: `replaced "${from}" with "${to}"`,
          combinable: true,
        });
      }
      at = lower.indexOf(from, at + 1);
    }
  }
  return out;
}

/** Doubling a consonant, un-doubling an already-doubled one, and dropping a trailing vowel. */
function structuralEdits(seg: string): SegmentEdit[] {
  const lower = seg.toLowerCase();
  const out: SegmentEdit[] = [];

  // From index 1: doubling the leading letter ("SSubir") is not a spelling anyone carries.
  for (let i = 1; i < seg.length; i++) {
    const ch = lower[i] as string;
    // "h" is the aspirate half of kh/gh/sh/th/dh — doubling it ("Rameshh") is never a spelling.
    if (VOWELS.includes(ch) || ch === 'h') continue;
    // Skip if it already sits next to a copy of itself — that's the un-double case below.
    if (lower[i - 1] === ch || lower[i + 1] === ch) continue;
    out.push({
      text: seg.slice(0, i) + seg[i] + seg.slice(i),
      change: `doubled the "${seg[i]}"`,
      combinable: true,
    });
  }

  for (let i = 0; i < seg.length - 1; i++) {
    if (lower[i] !== lower[i + 1]) continue;
    out.push({
      text: seg.slice(0, i) + seg.slice(i + 1),
      change: `simplified "${seg.slice(i, i + 2)}" to a single "${seg[i]}"`,
      combinable: true,
    });
  }

  if (seg.length > 3 && VOWELS.includes(lower[lower.length - 1] as string)) {
    out.push({
      text: seg.slice(0, -1),
      change: `dropped the trailing "${seg[seg.length - 1]}"`,
      combinable: false,
    });
  }

  return out;
}

/**
 * Every candidate spelling of `seg`, ordered so the most natural-looking shifts surface first:
 * letter swaps and doubling (which read as ordinary alternative transliterations), then plain
 * suffixes, then two-edit combinations. The unchanged segment is never returned. Ordering matters
 * — the caller truncates to what it needs, so whatever sorts first is what the reader sees.
 */
function candidateSpellings(seg: string): SegmentEdit[] {
  const inner: SegmentEdit[] = [...substitutionEdits(seg), ...structuralEdits(seg)];

  const suffixOnly = suffixesFor(seg).map((suffix) => ({
    text: seg + suffix,
    change: `added "${suffix}" at the end`,
    combinable: false,
  }));

  const combo: SegmentEdit[] = [];
  for (const base of inner) {
    if (!base.combinable) continue;
    for (const suffix of suffixesFor(base.text)) {
      combo.push({
        text: base.text + suffix,
        change: `${base.change} and added "${suffix}" at the end`,
        combinable: false,
      });
    }
  }

  return [...inner, ...suffixOnly, ...combo];
}

/** Rebuilds the full name with one segment swapped out. */
function withSegment(parts: string[], index: number, replacement: string): string {
  return parts.map((p, i) => (i === index ? replacement : p)).join(' ');
}

/** Every candidate edit of `parts[index]` whose FULL resulting name hits a target number. */
function hitsForSegment(
  parts: string[],
  index: number,
  targets: number[],
  label: string,
  seen: Set<string>,
): SpellingVariant[] {
  const out: SpellingVariant[] = [];
  for (const edit of candidateSpellings(parts[index] as string)) {
    const variant = withSegment(parts, index, edit.text);
    const key = variant.toLowerCase();
    if (seen.has(key)) continue;
    const { chaldean, hits } = variantHitsTarget(variant, targets);
    if (!hits) continue;
    seen.add(key);
    out.push({ variant, chaldean, change: `${label} — ${edit.change}` });
  }
  return out;
}

/**
 * Up to `wanted` spelling variants of `fullName` that already land on one of `targets`, with at
 * least half of them confined to the FIRST name (the rest edit the surname). A single-word name
 * has no surname pool, so it legitimately returns 100% first-name variants.
 *
 * Returns fewer than `wanted` — or an empty array — when the deterministic pass finds no more
 * target-hitting spellings. The narrative layer must say so plainly rather than invent one (see
 * EMPTY_VARIANTS_RULE in llm/reports/name-change.ts).
 */
export function generateSpellingVariants(
  fullName: string,
  targets: number[],
  wanted: number,
): SpellingVariant[] {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0 || targets.length === 0 || wanted <= 0) return [];

  const seen = new Set<string>([fullName.trim().toLowerCase()]);
  const firstPool = hitsForSegment(parts, 0, targets, 'first name', seen);
  const surnamePool =
    parts.length > 1 ? hitsForSegment(parts, parts.length - 1, targets, 'surname', seen) : [];

  // Half from the first name (rounded up), the rest from the surname, then top up from
  // whichever pool still has stock so a thin surname pool doesn't shrink the whole section.
  const firstQuota = Math.ceil(wanted / 2);
  let takenFirst = Math.min(firstQuota, firstPool.length);
  let takenSurname = Math.min(wanted - takenFirst, surnamePool.length);
  takenFirst = Math.min(firstPool.length, takenFirst + (wanted - takenFirst - takenSurname));
  takenSurname = Math.min(surnamePool.length, wanted - takenFirst);
  return [...firstPool.slice(0, takenFirst), ...surnamePool.slice(0, takenSurname)];
}
