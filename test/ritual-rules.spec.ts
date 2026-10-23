import { describe, it, expect } from 'vitest';
import {
  daysUntilNext,
  earnedOnRun,
  padaIndexOf,
  PRASHNA_CARDS,
  prashnaCardIndex,
  shieldGap,
} from '../src/modules/ritual/ritual-rules';

describe('padaIndexOf', () => {
  it('cuts the zodiac into 108 padas of 3°20′', () => {
    expect(padaIndexOf(0)).toBe(0);
    expect(padaIndexOf(3.3333)).toBe(0);
    expect(padaIndexOf(3.3334)).toBe(1);
    expect(padaIndexOf(13.3333)).toBe(3); // the last pada of Ashwini ends at 13°20′
    expect(padaIndexOf(13.34)).toBe(4); // Bharani begins
    expect(padaIndexOf(359.99)).toBe(107);
  });

  it('wraps a longitude outside 0-360', () => {
    expect(padaIndexOf(360)).toBe(0);
    expect(padaIndexOf(-0.01)).toBe(107);
    expect(padaIndexOf(725)).toBe(padaIndexOf(5));
  });
});

describe('prashnaCardIndex', () => {
  it('without a reliable birth time the card follows the Moon alone', () => {
    expect(prashnaCardIndex(40, null)).toBe(padaIndexOf(40));
    expect(prashnaCardIndex(40, null)).toBe(prashnaCardIndex(40, 0));
  });

  it('moves on nine cards (the width of a sign) per sign of the Ascendant', () => {
    expect(prashnaCardIndex(40, 1)).toBe((padaIndexOf(40) + 9) % PRASHNA_CARDS);
    expect(prashnaCardIndex(40, 11)).toBe((padaIndexOf(40) + 99) % PRASHNA_CARDS);
  });

  it('always lands on a card 0-107', () => {
    for (let lon = 0; lon < 360; lon += 1.7) {
      for (let lagna = 0; lagna < 12; lagna++) {
        const i = prashnaCardIndex(lon, lagna);
        expect(i).toBeGreaterThanOrEqual(0);
        expect(i).toBeLessThan(PRASHNA_CARDS);
      }
    }
  });

  it('the twelve Ascendants give twelve different cards for one Moon', () => {
    const cards = new Set(Array.from({ length: 12 }, (_, l) => prashnaCardIndex(100, l)));
    expect(cards.size).toBe(12);
  });
});

describe('earnedOnRun', () => {
  it('a Cosmic Key on every 3rd day, a shield on every 7th', () => {
    expect(earnedOnRun(1)).toEqual({ key: false, shield: false });
    expect(earnedOnRun(3)).toEqual({ key: true, shield: false });
    expect(earnedOnRun(6)).toEqual({ key: true, shield: false });
    expect(earnedOnRun(7)).toEqual({ key: false, shield: true });
    expect(earnedOnRun(21)).toEqual({ key: true, shield: true });
  });

  it('earns nothing on a run of 0', () => {
    expect(earnedOnRun(0)).toEqual({ key: false, shield: false });
  });
});

describe('daysUntilNext', () => {
  it('counts ritual days to the next multiple, a full cycle away when on one', () => {
    expect(daysUntilNext(0, 3)).toBe(3);
    expect(daysUntilNext(1, 3)).toBe(2);
    expect(daysUntilNext(2, 3)).toBe(1);
    expect(daysUntilNext(3, 3)).toBe(3);
    expect(daysUntilNext(5, 7)).toBe(2);
  });
});

describe('shieldGap', () => {
  const claimed = (...d: string[]) => new Set(d);

  it('covers exactly one missed day, with a claimed day before it', () => {
    expect(shieldGap(claimed('2026-10-20', '2026-10-21'), '2026-10-23', 1)).toBe('2026-10-22');
  });

  it('does nothing when yesterday was claimed, or today already is', () => {
    expect(shieldGap(claimed('2026-10-22'), '2026-10-23', 1)).toBeNull();
    expect(shieldGap(claimed('2026-10-21', '2026-10-23'), '2026-10-23', 1)).toBeNull();
  });

  it('two missed days in a row break the streak, shield or not', () => {
    expect(shieldGap(claimed('2026-10-20'), '2026-10-23', 2)).toBeNull();
  });

  it('needs a shield in hand', () => {
    expect(shieldGap(claimed('2026-10-21'), '2026-10-23', 0)).toBeNull();
  });

  it('a first-ever ritual has nothing to cover', () => {
    expect(shieldGap(claimed(), '2026-10-23', 2)).toBeNull();
  });

  it('works across a month end', () => {
    expect(shieldGap(claimed('2026-10-30'), '2026-11-01', 1)).toBe('2026-10-31');
  });
});
