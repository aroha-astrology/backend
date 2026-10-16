import { describe, it, expect } from 'vitest';
import {
  aharganaMod2520,
  dinaLordIndex,
  masaLordIndex,
  varshaLordIndex,
} from '../../src/lib/astro-engine/rules/ahargana.js';

// =============================================================================
// BPHS 27.13: lords of the year, month and day (register BPHS-27.13)
// =============================================================================
// The expectations come from the book's worked example (R. Santhanam's
// translation, Ch. 27 notes), not from running the code.
//
//   1 June 1984. Abbreviated Ahargana for "January 0" 1984 = 65,142, plus 153
//   days to 1 June = 65,295.
//   Day lord:   65,295 mod 7 = 6                              -> Friday
//   Year lord:  65,295 / 360 = 181 (whole), x 3 = 543, + 1 = 544, mod 7 = 5
//               -> Thursday (Jupiter)
//   Month lord: 65,295 / 30 = 2176 (whole), x 2 = 4352, + 1 = 4353, mod 7 = 6
//               -> Friday (Venus)
// Weekday indices below: 0 = Sunday ... 6 = Saturday.
// =============================================================================

describe('[BPHS 27.13] Ahargana and the lords of the year, month and day', () => {
  const june1984 = { year: 1984, month: 6, day: 1 };

  it('the abbreviated count for 31 December 1983 is 65,142, so 1 June 1984 is 65,295 (mod 2520)', () => {
    expect(aharganaMod2520({ year: 1983, month: 12, day: 31 })).toBe(65_142 % 2520);
    expect(aharganaMod2520(june1984)).toBe(65_295 % 2520);
  });

  it('the book’s example: day lord Friday, year lord Thursday, month lord Friday', () => {
    expect(dinaLordIndex(june1984)).toBe(5);
    expect(varshaLordIndex(june1984)).toBe(4);
    expect(masaLordIndex(june1984)).toBe(5);
  });

  it('the day lord is the real weekday on every date (the book’s own check on the count)', () => {
    // 1 January of every year from 1900 to 2100, and the 15th of every month in 2026.
    const dates: Array<{ year: number; month: number; day: number }> = [];
    for (let year = 1900; year <= 2100; year++) dates.push({ year, month: 1, day: 1 });
    for (let month = 1; month <= 12; month++) dates.push({ year: 2026, month, day: 15 });
    for (const d of dates) {
      const real = new Date(Date.UTC(d.year, d.month - 1, d.day)).getUTCDay();
      expect(dinaLordIndex(d), `${d.year}-${d.month}-${d.day}`).toBe(real);
    }
  });

  it('the year lord holds for 360 days, then the next year lord is three weekdays on', () => {
    // 360 days = 51 weeks + 3 days, so the day lord moves on by three each year of 360 days;
    // the year lord moves by three too (x 3 in the formula), but in the lord's own count.
    const a = { year: 1984, month: 6, day: 1 };
    const inSameYear = { year: 1984, month: 6, day: 2 };
    expect(varshaLordIndex(inSameYear)).toBe(varshaLordIndex(a)); // 65,296 / 360 is still 181
    // 65,295 is 135 days into the 360-day year (65,295 - 181 x 360 = 135): the year turns after 225 more days.
    const turns = new Date(Date.UTC(1984, 5, 1) + 225 * 86_400_000);
    const nextYear = {
      year: turns.getUTCFullYear(),
      month: turns.getUTCMonth() + 1,
      day: turns.getUTCDate(),
    };
    expect(varshaLordIndex(nextYear)).toBe((varshaLordIndex(a) + 3) % 7);
  });

  it('the month lord changes every 30 days', () => {
    const a = { year: 1984, month: 6, day: 1 };
    // 65,295 mod 30 = 15, so the month turns after 15 more days.
    const before = new Date(Date.UTC(1984, 5, 1) + 14 * 86_400_000);
    const after = new Date(Date.UTC(1984, 5, 1) + 15 * 86_400_000);
    const ymd = (d: Date) => ({
      year: d.getUTCFullYear(),
      month: d.getUTCMonth() + 1,
      day: d.getUTCDate(),
    });
    expect(masaLordIndex(ymd(before))).toBe(masaLordIndex(a));
    expect(masaLordIndex(ymd(after))).toBe((masaLordIndex(a) + 2) % 7);
  });
});
