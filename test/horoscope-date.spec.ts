import { describe, it, expect } from 'vitest';
import { dateInTz } from '../src/modules/horoscope/horoscope.service.js';

describe('dateInTz (IST horoscope dating)', () => {
  it('dates the CRON instant (18:31 UTC) as the NEXT IST calendar day', () => {
    // The cron fires at 18:31 UTC = 00:01 IST of the following day.
    expect(dateInTz(new Date('2026-06-25T18:31:00Z'), 'Asia/Kolkata')).toBe('2026-06-26');
  });

  it('rolls over correctly across month/year boundaries', () => {
    expect(dateInTz(new Date('2026-12-31T18:31:00Z'), 'Asia/Kolkata')).toBe('2027-01-01');
  });

  it('stays on the same day before the IST midnight boundary', () => {
    // 18:00 UTC = 23:30 IST, still the 25th.
    expect(dateInTz(new Date('2026-06-25T18:00:00Z'), 'Asia/Kolkata')).toBe('2026-06-25');
  });
});
