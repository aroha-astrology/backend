import { describe, it, expect } from 'vitest';
import { currentPeriodStart } from '../src/modules/horoscope/horoscope.service.js';

// A horoscope's day is the reader's own day: a user abroad gets their new
// day at their own midnight, not India's. Each instant below is written in
// UTC with the wall-clock time it is in each zone worked out by hand.

describe('currentPeriodStart on the reader clock', () => {
  // 2026-10-20 20:00 UTC = 01:30 IST on the 21st, 16:00 in New York on the 20th.
  const lateEvening = new Date('2026-10-20T20:00:00Z');

  it('keeps a New York reader on their own day after India has rolled over', () => {
    expect(currentPeriodStart('daily', 'Asia/Kolkata', lateEvening)).toBe('2026-10-21');
    expect(currentPeriodStart('daily', 'America/New_York', lateEvening)).toBe('2026-10-20');
    expect(currentPeriodStart('tomorrow', 'America/New_York', lateEvening)).toBe('2026-10-21');
  });

  it('moves a Sydney reader to the next day before India gets there', () => {
    // 2026-10-20 14:00 UTC = 19:30 IST on the 20th, 01:00 AEDT on the 21st.
    const at = new Date('2026-10-20T14:00:00Z');
    expect(currentPeriodStart('daily', 'Asia/Kolkata', at)).toBe('2026-10-20');
    expect(currentPeriodStart('daily', 'Australia/Sydney', at)).toBe('2026-10-21');
  });

  it('starts the week on the reader Monday', () => {
    // 2026-10-25 20:00 UTC = Monday 26th 01:30 IST, Sunday 25th 16:00 in New York.
    const at = new Date('2026-10-25T20:00:00Z');
    expect(currentPeriodStart('weekly', 'Asia/Kolkata', at)).toBe('2026-10-26');
    expect(currentPeriodStart('weekly', 'America/New_York', at)).toBe('2026-10-19');
  });

  it('keeps the old month and year until the reader midnight', () => {
    // 2026-12-31 20:00 UTC = 1 Jan 2027 01:30 IST, 31 Dec 15:00 in New York.
    const at = new Date('2026-12-31T20:00:00Z');
    expect(currentPeriodStart('monthly', 'Asia/Kolkata', at)).toBe('2027-01-01');
    expect(currentPeriodStart('yearly', 'Asia/Kolkata', at)).toBe('2027-01-01');
    expect(currentPeriodStart('monthly', 'America/New_York', at)).toBe('2026-12-01');
    expect(currentPeriodStart('yearly', 'America/New_York', at)).toBe('2026-01-01');
  });

  it('reads IST when no zone or an unknown zone is given', () => {
    expect(currentPeriodStart('daily', undefined, lateEvening)).toBe('2026-10-21');
    expect(currentPeriodStart('daily', 'Not/AZone', lateEvening)).toBe('2026-10-21');
  });
});
