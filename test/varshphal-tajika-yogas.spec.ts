import { describe, it, expect } from 'vitest';
import {
  computeTajikaYogas,
  yogasBetween,
  type TajikaYoga,
  type TajikaYogaKind,
} from '../src/lib/astro-engine/varshphal/tajika-yogas.js';
import type { ChartData } from '@aroha-astrology/shared';

// Every longitude and degree below was worked out by hand; sign = floor(lon / 30).
function chart(planets: Array<[string, number, boolean?]>): ChartData {
  return {
    planets: planets.map(([planet, longitude, retro]) => ({
      planet,
      longitude,
      isRetrograde: retro ?? false,
    })),
  } as unknown as ChartData;
}

const find = (yogas: TajikaYoga[], kind: TajikaYogaKind, planets: string[]) =>
  yogas.find((y) => y.kind === kind && y.planets.join() === planets.join());

describe('Tajika yogas', () => {
  it('Ithasala: the faster planet is behind the slower, inside the orb', () => {
    const y = computeTajikaYogas(chart([['Moon', 5], ['Mercury', 100]]));
    expect(find(y, 'ithasala', ['Moon', 'Mercury'])?.gapDeg).toBe(5);
    expect(y.some((x) => x.kind === 'ishrafa')).toBe(false);
  });

  it('Ishrafa: the faster planet is ahead of the slower', () => {
    const y = computeTajikaYogas(chart([['Moon', 20], ['Mercury', 105]]));
    expect(find(y, 'ishrafa', ['Moon', 'Mercury'])?.gapDeg).toBe(5);
    expect(y.some((x) => x.kind === 'ithasala')).toBe(false);
  });

  it('nothing when the gap is outside the orb (10 > 9.5) or the signs do not aspect', () => {
    expect(computeTajikaYogas(chart([['Moon', 0], ['Mercury', 100]]))).toEqual([]);
    expect(computeTajikaYogas(chart([['Moon', 5], ['Mercury', 35]]))).toEqual([]);
  });

  it('Rahu and Ketu take no part', () => {
    const base = computeTajikaYogas(chart([['Moon', 5], ['Mercury', 100]]));
    const withNodes = computeTajikaYogas(
      chart([['Moon', 5], ['Mercury', 100], ['Rahu', 5], ['Ketu', 185]]),
    );
    expect(withNodes).toEqual(base);
  });

  it('Kamboola: an ithasala between two planets and the Moon in ithasala with one of them', () => {
    const y = computeTajikaYogas(chart([['Moon', 12], ['Mercury', 20], ['Saturn', 115]]));
    expect(find(y, 'ithasala', ['Mercury', 'Saturn'])).toBeDefined();
    expect(find(y, 'ithasala', ['Moon', 'Mercury'])).toBeDefined();
    const k = find(y, 'kamboola', ['Mercury', 'Saturn', 'Moon']);
    expect(k).toBeDefined();
    expect(k?.gapDeg).toBeNull();
  });

  it('no Kamboola when the Moon is not in ithasala with either', () => {
    const y = computeTajikaYogas(chart([['Mercury', 20], ['Saturn', 115]]));
    expect(find(y, 'ithasala', ['Mercury', 'Saturn'])).toBeDefined();
    expect(y.some((x) => x.kind === 'kamboola')).toBe(false);
  });

  it('Radda by retrograde, by combustion and by fall; none on a clean ithasala', () => {
    const retro = computeTajikaYogas(chart([['Moon', 5], ['Mercury', 100, true]]));
    expect(find(retro, 'ithasala', ['Moon', 'Mercury'])).toBeDefined();
    expect(find(retro, 'radda', ['Moon', 'Mercury'])?.reason).toBe('retrograde');

    const combust = computeTajikaYogas(chart([['Moon', 5], ['Mercury', 100], ['Sun', 104]]));
    expect(find(combust, 'radda', ['Moon', 'Mercury'])?.reason).toBe('combust');

    // Venus at 27 degrees of Virgo is in its fall; the Moon at 20 Virgo is behind it by 7.
    const fall = computeTajikaYogas(chart([['Moon', 170], ['Venus', 177]]));
    expect(find(fall, 'ithasala', ['Moon', 'Venus'])).toBeDefined();
    expect(find(fall, 'radda', ['Moon', 'Venus'])?.reason).toBe('fall');

    const clean = computeTajikaYogas(chart([['Moon', 5], ['Mercury', 100]]));
    expect(clean.some((x) => x.kind === 'radda')).toBe(false);
  });

  it('Nakta: a faster planet in ithasala with two planets that do not aspect each other', () => {
    const y = computeTajikaYogas(chart([['Moon', 122], ['Mercury', 8], ['Saturn', 38]]));
    expect(find(y, 'ithasala', ['Moon', 'Mercury'])).toBeDefined();
    expect(find(y, 'ithasala', ['Moon', 'Saturn'])).toBeDefined();
    expect(find(y, 'nakta', ['Mercury', 'Saturn', 'Moon'])).toBeDefined();
    expect(find(y, 'ithasala', ['Mercury', 'Saturn'])).toBeUndefined();
    expect(find(y, 'ishrafa', ['Mercury', 'Saturn'])).toBeUndefined();
  });

  it('Yamaya: a slower planet that two non-aspecting planets are both applying to', () => {
    const y = computeTajikaYogas(chart([['Mercury', 10], ['Venus', 42], ['Saturn', 134]]));
    expect(find(y, 'ithasala', ['Mercury', 'Saturn'])).toBeDefined();
    expect(find(y, 'ithasala', ['Venus', 'Saturn'])).toBeDefined();
    expect(find(y, 'yamaya', ['Mercury', 'Venus', 'Saturn'])).toBeDefined();
  });

  it('yogasBetween keeps the yogas that involve both planets', () => {
    const y = computeTajikaYogas(chart([['Moon', 122], ['Mercury', 8], ['Saturn', 38]]));
    const moonMercury = yogasBetween(y, 'Moon', 'Mercury');
    expect(moonMercury.some((x) => x.kind === 'ithasala')).toBe(true);
    expect(moonMercury.some((x) => x.kind === 'nakta')).toBe(true);
    const mercurySaturn = yogasBetween(y, 'Mercury', 'Saturn');
    expect(mercurySaturn.some((x) => x.kind === 'nakta')).toBe(true);
    expect(mercurySaturn.some((x) => x.kind === 'ithasala' || x.kind === 'ishrafa')).toBe(false);
  });
});
