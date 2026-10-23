import { describe, it, expect } from 'vitest';
import {
  CHECK_IN_HOUR,
  canConfirmEvent,
  displayFact,
  isPoliteHour,
  isValidDateString,
  planEvent,
} from '../src/modules/memory/memory-rules';

const IST = 'Asia/Kolkata';
// 2026-10-23 12:00 IST
const NOW = new Date('2026-10-23T06:30:00Z');

function plan(over: Partial<Parameters<typeof planEvent>[0]> = {}) {
  return planEvent({
    fact: 'has a job interview on 5 November 2026',
    followUpQuestion: 'How did the interview go?',
    eventKind: 'interview',
    eventDate: '2026-11-05',
    timeZone: IST,
    now: NOW,
    ...over,
  });
}

describe('isValidDateString', () => {
  it('accepts a real date and refuses an impossible or malformed one', () => {
    expect(isValidDateString('2026-11-05')).toBe(true);
    expect(isValidDateString('2026-02-30')).toBe(false);
    expect(isValidDateString('5 Nov 2026')).toBe(false);
    expect(isValidDateString(null)).toBe(false);
  });
});

describe('planEvent', () => {
  it('plans the one check-in for 10:00 the morning after, on the reader\'s own clock', () => {
    const p = plan();
    expect(p.eventKind).toBe('interview');
    expect(p.eventDate).toBe('2026-11-05');
    // 6 Nov 10:00 IST = 04:30 UTC
    expect(p.followUpAt?.toISOString()).toBe('2026-11-06T04:30:00.000Z');
    expect(CHECK_IN_HOUR).toBe(10);
  });

  it('uses the reader\'s zone, not India\'s', () => {
    const p = plan({ timeZone: 'America/New_York' });
    // 6 Nov 10:00 EST (UTC-5) = 15:00 UTC
    expect(p.followUpAt?.toISOString()).toBe('2026-11-06T15:00:00.000Z');
  });

  it('keeps a past event date but never plans a check-in for it', () => {
    const p = plan({ eventDate: '2026-09-01' });
    expect(p.eventDate).toBe('2026-09-01');
    expect(p.followUpAt).toBeNull();
  });

  it('plans nothing for a day more than a year away', () => {
    expect(plan({ eventDate: '2028-01-01' }).followUpAt).toBeNull();
  });

  it('plans nothing without a known kind', () => {
    const p = plan({ eventKind: 'surgery' });
    expect(p.followUpAt).toBeNull();
    expect(p.eventKind).toBeNull();
  });

  it('drops the date entirely for a private topic', () => {
    const p = plan({ fact: 'has a court hearing on 5 November 2026', followUpQuestion: null });
    expect(p).toEqual({ eventKind: null, eventDate: null, followUpAt: null });
    const health = plan({ fact: 'has a medical check on 5 November 2026', followUpQuestion: null });
    expect(health.followUpAt).toBeNull();
    expect(health.eventDate).toBeNull();
  });

  it('ignores a date that is not a real calendar date', () => {
    expect(plan({ eventDate: '2026-02-30' })).toEqual({ eventKind: null, eventDate: null, followUpAt: null });
    expect(plan({ eventDate: 'next Friday' })).toEqual({ eventKind: null, eventDate: null, followUpAt: null });
  });

  it('an event today still gets tomorrow\'s check-in', () => {
    const p = plan({ eventDate: '2026-10-23' });
    expect(p.followUpAt?.toISOString()).toBe('2026-10-24T04:30:00.000Z');
  });
});

describe('isPoliteHour', () => {
  it('is true in the middle of a local day', () => {
    // 12:00 IST
    expect(isPoliteHour(NOW, IST, null)).toBe(true);
  });

  it('is false before 9:00 and from 20:00 on, local time', () => {
    expect(isPoliteHour(new Date('2026-10-23T02:30:00Z'), IST, null)).toBe(false); // 08:00 IST
    expect(isPoliteHour(new Date('2026-10-23T03:30:00Z'), IST, null)).toBe(true); // 09:00 IST
    expect(isPoliteHour(new Date('2026-10-23T14:30:00Z'), IST, null)).toBe(false); // 20:00 IST
  });

  it('follows the reader\'s own zone', () => {
    // 12:00 IST is 02:30 in New York: not a polite hour there
    expect(isPoliteHour(NOW, 'America/New_York', null)).toBe(false);
  });

  it('never fires inside the reader\'s quiet hours', () => {
    expect(isPoliteHour(NOW, IST, { start: '11:00', end: '13:00' })).toBe(false);
    expect(isPoliteHour(NOW, IST, { start: '22:00', end: '07:00' })).toBe(true);
  });
});

describe('canConfirmEvent', () => {
  it('lets the reader confirm only an event that is not in the future', () => {
    expect(canConfirmEvent('2026-10-22', IST, NOW)).toBe(true);
    expect(canConfirmEvent('2026-10-23', IST, NOW)).toBe(true);
    expect(canConfirmEvent('2026-10-24', IST, NOW)).toBe(false);
    expect(canConfirmEvent(null, IST, NOW)).toBe(false);
  });
});

describe('displayFact', () => {
  it('hides the internal marker the extractor writes', () => {
    expect(displayFact('PREVIOUSLY TOLD THEM: their marriage window is October 2026')).toEqual({
      text: 'their marriage window is October 2026',
      toldByGuide: true,
    });
    expect(displayFact('works as a designer')).toEqual({ text: 'works as a designer', toldByGuide: false });
  });
});
