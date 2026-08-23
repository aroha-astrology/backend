import { describe, it, expect } from 'vitest';
import { streakRun, positionInCycle, amountForDay } from '../src/modules/rewards/rewards.service';

const BASE = 500; // ₹5
const BONUS = 2100; // ₹21

describe('amountForDay', () => {
  it('day 1 is the base amount', () => {
    expect(amountForDay(1, BASE, BONUS)).toBe(500);
  });

  it('adds ₹1 (100 paise) per day up to day 6', () => {
    expect(amountForDay(2, BASE, BONUS)).toBe(600);
    expect(amountForDay(6, BASE, BONUS)).toBe(1000);
  });

  it('day 7 includes the streak bonus on top of the ladder amount', () => {
    expect(amountForDay(7, BASE, BONUS)).toBe(1100 + 2100); // ₹11 + ₹21 = ₹32
  });
});

describe('streakRun + positionInCycle — the claim flow', () => {
  it('fresh start (no prior claims) resolves to day 1', () => {
    const run = streakRun([], '2026-08-23');
    expect(positionInCycle(run, false)).toBe(1);
  });

  it('consecutive daily claims walk 1 → 7', () => {
    const dates: string[] = [];
    let day = 1;
    let d = '2026-08-17';
    for (; day <= 6; day++) {
      dates.push(d);
      const next = new Date(d + 'T00:00:00Z');
      next.setUTCDate(next.getUTCDate() + 1);
      d = next.toISOString().slice(0, 10);
    }
    // dates now holds 6 consecutive claimed days (08-17 .. 08-22); today (08-23) not yet claimed.
    const today = '2026-08-23';
    const run = streakRun(dates, today);
    expect(positionInCycle(run, false)).toBe(7);
  });

  it('a gap resets the streak to day 1', () => {
    // claimed day1 only, then skipped a day, trying on day 3
    const dates = ['2026-08-17'];
    const run = streakRun(dates, '2026-08-19');
    expect(positionInCycle(run, false)).toBe(1);
  });

  it('day 8 after a completed 7-day cycle folds back to day 1', () => {
    const dates = [
      '2026-08-17',
      '2026-08-18',
      '2026-08-19',
      '2026-08-20',
      '2026-08-21',
      '2026-08-22',
      '2026-08-23',
    ];
    const run = streakRun(dates, '2026-08-24');
    expect(positionInCycle(run, false)).toBe(1);
  });

  it('does not double-count a day already claimed today', () => {
    const dates = ['2026-08-23'];
    const run = streakRun(dates, '2026-08-23');
    // claimedToday=true: today's own slot stays day 1, not advanced to day 2.
    expect(positionInCycle(run, true)).toBe(1);
  });
});
