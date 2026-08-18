// =============================================================================
// Shared 1-9 friendly/enemy number compatibility tables
// =============================================================================
// One classical Chaldean-derived friendly/enemy chart, used by every module in
// this app that judges whether a number is auspicious relative to a person's
// Mulank/Bhagyank: name correction (nameCorrection.ts) and phone-number
// numerology (mobileNumber.ts). Previously duplicated byte-for-byte in both —
// extracted here so the two surfaces can never silently drift apart on which
// numbers are considered friendly to which.
//
// This is ONE classical school's table, not a claim that every numerology
// tradition agrees on it — sources on "which numbers are friendly to which"
// disagree with each other (see mobileNumber.ts's own doc comment on the
// digit-pair/zero rules, which cites the same caveat). Naming the school this
// app has committed to in one place, rather than re-deriving or re-justifying
// it per module, is the point of this file existing.
// =============================================================================

export const FRIENDLY_MAP: Readonly<Record<number, readonly number[]>> = {
  1: [1, 3, 5, 9],
  2: [2, 7, 9],
  3: [1, 3, 5, 9],
  4: [1, 4, 6, 8],
  5: [1, 3, 5, 9],
  6: [3, 6, 9],
  7: [2, 7, 9],
  8: [4, 6, 8],
  9: [1, 3, 5, 6, 9],
};

export const ENEMY_MAP: Readonly<Record<number, readonly number[]>> = {
  1: [2, 4, 8],
  2: [4, 5, 8],
  3: [4, 6, 8],
  4: [2, 3, 5, 7, 9],
  5: [2, 4, 6, 8],
  6: [1, 2, 5, 7, 8],
  7: [1, 3, 4, 5, 6, 8],
  8: [1, 2, 3, 5, 7, 9],
  9: [2, 4, 7, 8],
};
