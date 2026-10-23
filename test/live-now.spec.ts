import { describe, it, expect } from 'vitest';
import { buildHoraSchedule } from '../src/lib/astro-engine/panchang/hora';
import { calculateChoghadiya } from '../src/lib/astro-engine/panchang/choghadiya';
import {
  buildLiveNow,
  inWindow,
  localClock,
  LIVE_NOW_MAX_BYTES,
  LiveNowCache,
  slotOf,
  roundCoord,
} from '../src/modules/widgets/live-now';

// A Wednesday (3): sunrise 06:30, sunset 18:30, so a muhurta is 48 minutes and Abhijit runs 12:06-12:54.
const SUNRISE = '06:30';
const SUNSET = '18:30';
const choghadiya = calculateChoghadiya(SUNRISE, SUNSET, 3);

const panchang = {
  tithi: { number: 12, name: 'Dwadashi', paksha: 'Shukla' as const, deity: 'Vishnu', isAuspicious: true },
  nakshatra: { index: 4, name: 'Mrigashira' as never, lord: 'Mars' as never, pada: 2, deity: 'Soma' },
  vara: 'Budhvaar',
  rahuKaal: { start: '12:00', end: '13:30' },
  abhijitMuhurta: { start: '12:06', end: '12:54' },
  sunriseTime: SUNRISE,
  sunsetTime: SUNSET,
  choghadiya: { day: choghadiya.slice(0, 8), night: choghadiya.slice(8, 16) },
  hora: buildHoraSchedule(SUNRISE, SUNSET, 3),
};

/** 2026-10-23 at the given Kolkata clock, as a UTC instant. */
const kolkata = (hhmm: string) => new Date(`2026-10-23T${hhmm}:00+05:30`);

describe('inWindow', () => {
  it('is half open: the start counts, the end does not', () => {
    expect(inWindow(60, 120, 60)).toBe(true);
    expect(inWindow(60, 120, 119)).toBe(true);
    expect(inWindow(60, 120, 120)).toBe(false);
  });

  it('wraps past midnight', () => {
    expect(inWindow(23 * 60, 60, 30)).toBe(true);
    expect(inWindow(23 * 60, 60, 23 * 60 + 30)).toBe(true);
    expect(inWindow(23 * 60, 60, 12 * 60)).toBe(false);
  });

  it('an empty window is never on', () => {
    expect(inWindow(100, 100, 100)).toBe(false);
  });
});

describe('localClock', () => {
  it('reads the date and clock on the zone, not on the server', () => {
    const at = new Date('2026-10-23T20:00:00Z');
    expect(localClock(at, 'Asia/Kolkata')).toEqual({ date: '2026-10-24', minutes: 90, clock: '01:30' });
    expect(localClock(at, 'America/New_York')).toEqual({ date: '2026-10-23', minutes: 960, clock: '16:00' });
  });

  it('shows midnight as 00:xx, never 24:xx', () => {
    expect(localClock(new Date('2026-10-23T18:35:00Z'), 'Asia/Kolkata').clock).toBe('00:05');
  });
});

describe('buildLiveNow', () => {
  it('reports the hora, the choghadiya and Abhijit that are running at 12:20', () => {
    const live = buildLiveNow(panchang, kolkata('12:20'), 'Asia/Kolkata');
    expect(live.clock).toBe('12:20');
    expect(live.hora).not.toBeNull();
    expect(live.hora!.start <= '12:20' && '12:20' < live.hora!.end).toBe(true);
    expect(live.choghadiya).not.toBeNull();
    expect(live.abhijit.on).toBe(true);
    expect(live.rahuKaal.on).toBe(true);
  });

  it('knows Rahu Kaal is not on at 10:00 and counts the minutes until it starts', () => {
    const live = buildLiveNow(panchang, kolkata('10:00'), 'Asia/Kolkata');
    expect(live.rahuKaal.on).toBe(false);
    expect(live.nextCaution).toEqual({ label: 'Rahu Kaal', start: '12:00', inMin: 120 });
  });

  it('has no next caution once Rahu Kaal has begun', () => {
    expect(buildLiveNow(panchang, kolkata('14:00'), 'Asia/Kolkata').nextCaution).toBeNull();
  });

  it('the next good stretch is the soonest good choghadiya or Abhijit, still to come', () => {
    const live = buildLiveNow(panchang, kolkata('10:00'), 'Asia/Kolkata');
    expect(live.nextGood).not.toBeNull();
    expect(live.nextGood!.inMin).toBeGreaterThan(0);
    const goodStarts = [
      ...choghadiya.filter((c) => c.type === 'good').map((c) => c.startTime),
      '12:06',
    ].filter((s) => s > '10:00');
    expect(live.nextGood!.start).toBe(goodStarts.sort()[0]);
  });

  it('finds the night hora that runs past midnight', () => {
    // The 12th night hora ends at 06:30 next morning; 00:10 sits inside one that wraps or not, but one is found.
    const live = buildLiveNow(panchang, kolkata('00:10'), 'Asia/Kolkata');
    expect(live.hora).not.toBeNull();
    expect(live.choghadiya).not.toBeNull();
  });

  it('stays under 2 KB even with long names', () => {
    const long = {
      ...panchang,
      tithi: { ...panchang.tithi, name: 'Krishna Chaturdashi (Shiva Ratri) '.repeat(2) },
    };
    const bytes = Buffer.byteLength(JSON.stringify(buildLiveNow(long, kolkata('12:20'), 'America/Argentina/ComodRivadavia')));
    expect(bytes).toBeLessThan(LIVE_NOW_MAX_BYTES);
  });

  it('is a plain JSON answer with a version', () => {
    const live = buildLiveNow(panchang, kolkata('09:00'), 'Asia/Kolkata');
    expect(JSON.parse(JSON.stringify(live)).v).toBe(1);
  });
});

describe('LiveNowCache', () => {
  const live = buildLiveNow(panchang, kolkata('09:00'), 'Asia/Kolkata');

  it('serves the same answer within a 15-minute slot, for a nearby point', () => {
    const cache = new LiveNowCache();
    const t = new Date('2026-10-23T09:00:00Z');
    cache.set(28.6139, 77.209, 'Asia/Kolkata', t, live);
    expect(cache.get(28.6141, 77.2091, 'Asia/Kolkata', new Date(t.getTime() + 14 * 60_000))).toBe(live);
  });

  it('misses in the next slot, and a different zone', () => {
    const cache = new LiveNowCache();
    const t = new Date('2026-10-23T09:00:00Z');
    cache.set(28.61, 77.21, 'Asia/Kolkata', t, live);
    expect(slotOf(new Date(t.getTime() + 15 * 60_000))).toBe(slotOf(t) + 1);
    expect(cache.get(28.61, 77.21, 'Asia/Kolkata', new Date(t.getTime() + 15 * 60_000))).toBeUndefined();
    expect(cache.get(28.61, 77.21, 'Asia/Dubai', t)).toBeUndefined();
  });

  it('drops older slots when a newer one is written, so it never grows without bound', () => {
    const cache = new LiveNowCache();
    const t = new Date('2026-10-23T09:00:00Z');
    for (let i = 0; i < 20; i++) cache.set(i, i, 'UTC', t, live);
    expect(cache.size).toBe(20);
    cache.set(1, 1, 'UTC', new Date(t.getTime() + 20 * 60_000), live);
    expect(cache.size).toBe(1);
  });

  it('rounds coordinates to two decimals', () => {
    expect(roundCoord(28.61389)).toBe(28.61);
    expect(roundCoord(-77.209)).toBe(-77.21);
  });
});
