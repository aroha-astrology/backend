import { describe, it, expect } from 'vitest';
import {
  tomorrowIstDate,
  festivalForAlert,
  buildFestivalAlertCopy,
} from '../src/modules/cron/festival-alert.service';
import { HINDU_FESTIVALS } from '../src/config/hindu-festivals';

describe('tomorrowIstDate', () => {
  it('adds one IST calendar day regardless of time of day', () => {
    // 2026-08-27 10:00 UTC = 15:30 IST — well before midnight IST.
    expect(tomorrowIstDate(new Date('2026-08-27T10:00:00Z'))).toBe('2026-08-28');
    // 2026-08-27 20:00 UTC = 01:30 IST on Aug 28 already — "tomorrow" from there is Aug 29.
    expect(tomorrowIstDate(new Date('2026-08-27T20:00:00Z'))).toBe('2026-08-29');
  });

  it('rolls over month/year boundaries correctly', () => {
    expect(tomorrowIstDate(new Date('2027-12-31T10:00:00Z'))).toBe('2028-01-01');
  });
});

describe('festivalForAlert', () => {
  it('returns the major festival for a date that has one', () => {
    const f = festivalForAlert('2026-09-14'); // Ganesh Chaturthi, major
    expect(f?.name).toBe('Ganesh Chaturthi');
  });

  it('returns null for a date with only minor festivals', () => {
    expect(festivalForAlert('2026-01-26')).toBeNull(); // Republic Day, minor
  });

  it('returns null for a date with no festival at all', () => {
    expect(festivalForAlert('2026-08-27')).toBeNull();
  });

  it('never returns a minor-only entry for any date in the table', () => {
    for (const [date, festivals] of Object.entries(HINDU_FESTIVALS)) {
      const hasMajor = festivals.some((f) => f.importance === 'major');
      const picked = festivalForAlert(date);
      expect(picked !== null).toBe(hasMajor);
    }
  });
});

describe('buildFestivalAlertCopy', () => {
  it('includes the muhurat window in 12h format when present', () => {
    const { title, body } = buildFestivalAlertCopy({
      name: 'Diwali (Lakshmi Puja)',
      emoji: '🪔',
      importance: 'major',
      muhurat: { start: '18:34', end: '19:05', label: 'Lakshmi Puja Muhurat' },
    });
    expect(title).toBe('🪔 Diwali (Lakshmi Puja) is tomorrow!');
    expect(body).toBe('Lakshmi Puja Muhurat: 6:34 PM – 7:05 PM');
  });

  it('falls back to a generic body when there is no muhurat', () => {
    const { body } = buildFestivalAlertCopy({ name: 'Holi', emoji: '🎨', importance: 'major' });
    expect(body).toBe('Wishing you a blessed Holi.');
  });

  it('falls back to "Muhurat" when a window has no label', () => {
    const { body } = buildFestivalAlertCopy({
      name: 'Test Festival',
      emoji: '🪔',
      importance: 'major',
      muhurat: { start: '00:00', end: '01:00' },
    });
    expect(body).toBe('Muhurat: 12:00 AM – 1:00 AM');
  });
});
