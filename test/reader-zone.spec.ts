import { describe, expect, it } from 'vitest';
import { midnightInZone, noonInZone, readerZone } from '../src/lib/user-time-zone.js';

describe('readerZone', () => {
  it("takes the device's zone, then the saved one, then IST", () => {
    expect(readerZone('America/New_York', 'Europe/London')).toBe('America/New_York');
    expect(readerZone(undefined, 'Europe/London')).toBe('Europe/London');
    expect(readerZone('Not/AZone', 'Europe/London')).toBe('Europe/London');
    expect(readerZone(undefined, null)).toBe('Asia/Kolkata');
    expect(readerZone('Not/AZone', 'Also/Not')).toBe('Asia/Kolkata');
  });
});

describe('midnightInZone / noonInZone', () => {
  it('starts an IST day at 18:30 UTC the evening before', () => {
    expect(midnightInZone('2026-10-21', 'Asia/Kolkata').toISOString()).toBe(
      '2026-10-20T18:30:00.000Z',
    );
  });

  it('starts a New York day at its own midnight, on either side of daylight saving', () => {
    // EDT (UTC-4) until 02:00 on 1 Nov 2026, EST (UTC-5) after.
    expect(midnightInZone('2026-10-21', 'America/New_York').toISOString()).toBe(
      '2026-10-21T04:00:00.000Z',
    );
    expect(midnightInZone('2026-11-01', 'America/New_York').toISOString()).toBe(
      '2026-11-01T04:00:00.000Z',
    );
    expect(midnightInZone('2026-11-02', 'America/New_York').toISOString()).toBe(
      '2026-11-02T05:00:00.000Z',
    );
  });

  it("reads a day's sky at noon on the reader's clock", () => {
    expect(noonInZone('2026-10-21', 'Pacific/Honolulu').toISOString()).toBe(
      '2026-10-21T22:00:00.000Z',
    );
  });
});
