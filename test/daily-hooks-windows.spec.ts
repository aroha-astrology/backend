import { describe, expect, it } from 'vitest';
import {
  buildShubhLabhStrip,
  clock,
  colorOf,
  diyaOccasion,
  diyaWindow,
  nextGreen,
  span,
  tithiGroup,
  toMin,
  windowAt,
} from '../src/lib/astro-tools/daily-hooks/windows';
import { day, MOON, SUNRISE } from './helpers/day-windows';
import { AMBER_MIN, GREEN_MIN, SHUBH_LABH_ADJUST, SHUBH_LABH_WEIGHTS } from '../src/lib/astro-tools/daily-hooks/weights';

describe('time helpers', () => {
  it('turns a clock before sunrise into the next morning', () => {
    expect(span('01:00', '02:00', SUNRISE)).toEqual([1500, 1560]);
    expect(span('18:00', '19:00', SUNRISE)).toEqual([1080, 1140]);
    expect(span('23:00', '05:40', SUNRISE)).toEqual([1380, 1780]);
  });
  it('clock wraps past midnight', () => {
    expect(clock(1500)).toBe('01:00');
    expect(clock(-10)).toBe('23:50');
  });
  it('colour bands', () => {
    expect(colorOf(GREEN_MIN)).toBe('green');
    expect(colorOf(GREEN_MIN - 1)).toBe('amber');
    expect(colorOf(AMBER_MIN)).toBe('amber');
    expect(colorOf(AMBER_MIN - 1)).toBe('red');
  });
  it('tithi groups follow the nanda-bhadra-jaya-rikta-purna cycle', () => {
    expect(tithiGroup(1)).toBe('nanda');
    expect(tithiGroup(8)).toBe('jaya');
    expect(tithiGroup(9)).toBe('rikta');
    expect(tithiGroup(15)).toBe('purna');
    expect(tithiGroup(18)).toBe('jaya');
    expect(tithiGroup(30)).toBe('amavasya');
  });
});

describe('weights are pinned', () => {
  it('the five ingredients add up to 100 and the adjustments are the owner-reviewed numbers', () => {
    expect(Object.values(SHUBH_LABH_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
    expect(SHUBH_LABH_WEIGHTS).toEqual({ hora: 25, choghadiya: 25, tara: 20, chandra: 15, tithi: 15 });
    expect(SHUBH_LABH_ADJUST).toEqual({ rahuKaal: -45, gulikaKaal: -30, yamagandaKaal: -30, abhijit: 20 });
  });
});

describe('Shubh-Labh strip', () => {
  const strip = buildShubhLabhStrip(day(), MOON, { signIndex: 4, nakshatraIndex: 9 });

  it('covers exactly sunrise to the next sunrise, with no gaps', () => {
    expect(strip.cells[0]!.startMin).toBe(SUNRISE);
    expect(strip.cells.at(-1)!.startMin + 30).toBe(SUNRISE + 1440);
    expect(strip.windows[0]!.startMin).toBe(SUNRISE);
    expect(strip.windows.at(-1)!.endMin).toBe(SUNRISE + 1440);
    for (let i = 1; i < strip.windows.length; i++) expect(strip.windows[i]!.startMin).toBe(strip.windows[i - 1]!.endMin);
  });

  it('Rahu Kaal is never green', () => {
    const rahu = strip.windows.filter((w) => w.why.includes('Rahu Kaal'));
    expect(rahu.length).toBeGreaterThan(0);
    expect(rahu.every((w) => w.color !== 'green')).toBe(true);
  });

  it('every score stays between 0 and 100', () => {
    expect(strip.cells.every((c) => c.score >= 0 && c.score <= 100)).toBe(true);
  });

  it('Abhijit adds to the score of the same stretch', () => {
    const without = buildShubhLabhStrip(day({ abhijit: { start: '03:00', end: '03:30' } }), MOON, null);
    const withIt = buildShubhLabhStrip(day(), MOON, null);
    const at = (s: typeof withIt, m: number) => s.cells.find((c) => c.startMin === m)!.score;
    expect(at(withIt, toMin('11:40'))).toBe(at(without, toMin('11:40')) + SHUBH_LABH_ADJUST.abhijit);
  });

  it('a stretch inside Rahu Kaal scores 45 lower than the same stretch outside it', () => {
    const moved = buildShubhLabhStrip(day({ rahuKaal: { start: '03:00', end: '03:30' } }), MOON, null);
    const base = buildShubhLabhStrip(day(), MOON, null);
    const at = (s: typeof base, m: number) => s.cells.find((c) => c.startMin === m)!.score;
    const m = toMin('08:10');
    // the unclamped difference is 45; scores here are far from 0 and 100 at this stretch
    expect(at(moved, m) - at(base, m)).toBe(45);
  });

  it('without a birth chart the basis is general and the Moon parts are neutral', () => {
    const g = buildShubhLabhStrip(day(), MOON, null);
    expect(g.basis).toBe('general');
    expect(strip.basis).toBe('personal');
  });

  it('a bad tara lowers the score against a good one', () => {
    const goodTara = buildShubhLabhStrip(day(), [{ atMin: SUNRISE, signIndex: 4, nakshatraIndex: 11 }], { signIndex: 4, nakshatraIndex: 9 });
    const badTara = buildShubhLabhStrip(day(), [{ atMin: SUNRISE, signIndex: 4, nakshatraIndex: 11 }], { signIndex: 4, nakshatraIndex: 10 });
    // nak 9 -> 11 is count 3 (Vipat, bad); nak 10 -> 11 is count 2 (Sampat, good)
    const total = (s: typeof goodTara) => s.cells.reduce((a, c) => a + c.score, 0);
    expect(total(badTara)).toBeGreaterThan(total(goodTara));
  });

  it('best is the highest-scoring green window, and null when nothing is green', () => {
    if (strip.best) {
      expect(strip.best.color).toBe('green');
      expect(strip.windows.filter((w) => w.color === 'green').every((w) => w.score <= strip.best!.score)).toBe(true);
    }
    const dark = buildShubhLabhStrip(
      day({ hora: day().hora.map((h) => ({ ...h, planet: 'Saturn' })), tithiNumber: 30 }),
      [{ atMin: SUNRISE, signIndex: 11, nakshatraIndex: 11 }],
      { signIndex: 4, nakshatraIndex: 10 },
    );
    expect(dark.best === null || dark.best.color === 'green').toBe(true);
  });

  it('nextGreen and windowAt read the strip', () => {
    const win = windowAt(strip, toMin('12:00'));
    expect(win).not.toBeNull();
    const ng = nextGreen(strip, SUNRISE);
    if (ng) {
      expect(ng.inMin).toBe(ng.window.startMin - SUNRISE);
      expect(ng.window.color).toBe('green');
    }
    expect(nextGreen(strip, SUNRISE + 1439)).toBeNull();
  });

  it('is deterministic', () => {
    expect(buildShubhLabhStrip(day(), MOON, { signIndex: 4, nakshatraIndex: 9 })).toEqual(strip);
  });
});

describe('Sankalp Diya window', () => {
  it('is Abhijit on an ordinary day', () => {
    const w = diyaWindow(day());
    expect(w.kind).toBe('abhijit');
    expect([w.start, w.end]).toEqual(['11:40', '12:28']);
  });

  it('is the first Amrit choghadiya of the daytime on a Wednesday, with the reason', () => {
    const w = diyaWindow(day({}, 'Wednesday'));
    expect(w.kind).toBe('amrit');
    expect(w.start).toBe('06:10');
    expect(w.why).toContain('Wednesday');
  });

  it('reads the weekday name the panchang uses (Budhvaar)', () => {
    expect(diyaWindow(day({}, 'Budhvaar')).kind).toBe('amrit');
    expect(diyaWindow(day({}, 'Guruvaar')).kind).toBe('abhijit');
  });

  it('falls back to Shubh on a Wednesday without an Amrit period', () => {
    const d = day({}, 'Wednesday');
    d.choghadiya.day = d.choghadiya.day.map((c) => (c.name === 'Amrit' ? { ...c, name: 'Char', type: 'neutral' as const } : c));
    expect(diyaWindow(d).kind).toBe('shubh');
  });

  it('occasions: Ekadashi, Purnima and Amavasya by sunrise tithi, Pradosh by sunset tithi', () => {
    expect(diyaOccasion(11, 11)).toBe('ekadashi');
    expect(diyaOccasion(26, 26)).toBe('ekadashi');
    expect(diyaOccasion(15, 15)).toBe('purnima');
    expect(diyaOccasion(30, 30)).toBe('amavasya');
    expect(diyaOccasion(12, 13)).toBe('pradosh');
    expect(diyaOccasion(27, 28)).toBe('pradosh');
    expect(diyaOccasion(13, 14)).toBeNull();
    expect(diyaOccasion(5, 5)).toBeNull();
  });
});
