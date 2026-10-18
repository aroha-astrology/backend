import { describe, expect, it } from 'vitest';
import {
  SLICES_PER_MINUTE,
  slicesUsed,
  unusedSliceRefundPaise,
} from '../src/modules/voice/voice-slices.js';

// Voice calls in 15-second slices (money.voiceSlices): the last paid minute is paid for in whole
// slices of 15 s, so hanging up early gives back the unused ones. 5 coins a slice, 20 a minute.

const PRICE = 2000;
const SLICE = 500;

describe('slicesUsed', () => {
  it('a minute is four slices', () => {
    expect(SLICES_PER_MINUTE).toBe(4);
  });

  it('counts a slice as soon as it has started, and always at least one', () => {
    expect(slicesUsed(0)).toBe(1);
    expect(slicesUsed(1)).toBe(1);
    expect(slicesUsed(15_000)).toBe(1);
    expect(slicesUsed(15_001)).toBe(2);
    expect(slicesUsed(30_000)).toBe(2);
    expect(slicesUsed(44_999)).toBe(3);
    expect(slicesUsed(45_001)).toBe(4);
  });

  it('never counts more than a whole minute, however late the hang-up reached the server', () => {
    expect(slicesUsed(60_000)).toBe(4);
    expect(slicesUsed(5 * 60_000)).toBe(4);
  });

  it('treats a clock that ran backwards as the one slice minimum', () => {
    expect(slicesUsed(-5_000)).toBe(1);
  });
});

describe('unusedSliceRefundPaise', () => {
  it('a call hung up after 20 seconds pays 2 slices (10 coins) and gets the other 10 back', () => {
    expect(unusedSliceRefundPaise({ elapsedMs: 20_000, pricePaise: PRICE, slicePaise: SLICE })).toBe(1000);
  });

  it('hanging up within the first slice pays one slice and gets 15 coins back', () => {
    expect(unusedSliceRefundPaise({ elapsedMs: 3_000, pricePaise: PRICE, slicePaise: SLICE })).toBe(1500);
  });

  it('a minute used to the end gives nothing back', () => {
    expect(unusedSliceRefundPaise({ elapsedMs: 58_000, pricePaise: PRICE, slicePaise: SLICE })).toBe(0);
    expect(unusedSliceRefundPaise({ elapsedMs: 90_000, pricePaise: PRICE, slicePaise: SLICE })).toBe(0);
  });

  it('never gives back more than the minute cost, and never a negative amount', () => {
    // A slice price an admin set above a quarter of the minute: a full minute would cost more than was charged.
    expect(unusedSliceRefundPaise({ elapsedMs: 59_000, pricePaise: PRICE, slicePaise: 800 })).toBe(0);
    expect(unusedSliceRefundPaise({ elapsedMs: 1_000, pricePaise: PRICE, slicePaise: 0 })).toBe(PRICE);
  });
});
