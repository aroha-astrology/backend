import { VOICE_SLICE_SECONDS } from '../../config/money.js';

/**
 * Voice calls billed in 15-second slices (v7 spec, switch `money.voiceSlices`).
 *
 * A paid minute is still charged the moment it is granted (the token for it is minted then, which is
 * the only step this server sees). What changes is the END of the call: the last paid minute is only
 * paid for in whole slices of 15 seconds, so someone who hangs up 20 seconds into a paid minute pays
 * 2 slices (10 coins at the default price) instead of the full 20, and the rest is given back. Every
 * earlier minute was used in full, so the result is the same as billing slice by slice.
 */

export const SLICES_PER_MINUTE = 60 / VOICE_SLICE_SECONDS;

/**
 * How many slices a stretch of `elapsedMs` costs: a slice that has started is paid for, at least
 * one, at most a whole minute's worth.
 */
export function slicesUsed(elapsedMs: number): number {
  const started = Math.ceil(Math.max(elapsedMs, 0) / (VOICE_SLICE_SECONDS * 1000));
  return Math.min(Math.max(started, 1), SLICES_PER_MINUTE);
}

/**
 * What to give back for the unused slices of the last paid minute: the minute's price less the slices
 * actually used at `slicePaise` each, never negative. A slice price that makes a full minute cost
 * more than the minute was charged (an admin set them apart) gives back nothing, never takes more.
 */
export function unusedSliceRefundPaise(params: {
  elapsedMs: number;
  /** What the minute was charged (the `paid.voiceChat` price). */
  pricePaise: number;
  /** One 15-second slice (the `money.voiceSlice` price). */
  slicePaise: number;
}): number {
  const owed = slicesUsed(params.elapsedMs) * params.slicePaise;
  return Math.max(params.pricePaise - owed, 0);
}
