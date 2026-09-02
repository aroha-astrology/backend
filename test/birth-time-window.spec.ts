import { describe, it, expect } from 'vitest';
import { BIRTH_TIME_WINDOWS, birthTimeWindowFor } from '../src/lib/birth-time-window';
import { buildProfileFacts } from '../src/lib/chat-grounding';

describe('birthTimeWindowFor', () => {
  // The whole no-column design rests on this: the window is recovered from the
  // stored midpoint, so a midpoint that bucketed elsewhere would silently tell
  // the reader (and the LLM) the wrong part of the day.
  it('round-trips every window midpoint back to its own window', () => {
    for (const w of BIRTH_TIME_WINDOWS) {
      expect(birthTimeWindowFor(w.mid)?.key, `${w.key} midpoint ${w.mid}`).toBe(w.key);
    }
  });

  it('covers all 24 hours with exactly one window each', () => {
    for (let h = 0; h < 24; h++) {
      const hh = String(h).padStart(2, '0');
      const matches = BIRTH_TIME_WINDOWS.filter((w) => h >= w.startH && h < w.endH);
      expect(matches, `hour ${hh}`).toHaveLength(1);
      expect(birthTimeWindowFor(`${hh}:00`)?.key).toBe(matches[0]?.key);
    }
  });

  it('accepts HH:mm:ss as well as HH:mm', () => {
    expect(birthTimeWindowFor('09:30:00')?.key).toBe('morning');
  });

  it('returns null for missing or unparseable values', () => {
    for (const bad of [null, undefined, '', 'not-a-time', '99:00', '-1:00']) {
      expect(birthTimeWindowFor(bad), String(bad)).toBeNull();
    }
  });
});

describe('buildProfileFacts — unknown birth time', () => {
  // The whole point of the window path: the model must be told to stop asserting
  // the ascendant. A silently-dropped caveat here is invisible in production —
  // the reading just quietly goes back to narrating a ~33%-accurate lagna.
  it('emits the Chandra Lagna instruction, naming the window, when accuracy is unknown', () => {
    const facts = buildProfileFacts({ birthTimeAccuracy: 'unknown', timeOfBirth: '09:00' }, {});
    const caveat = facts.find((f) => f.startsWith('BIRTH TIME NOT KNOWN'));
    expect(caveat).toBeDefined();
    expect(caveat).toContain('morning');
    expect(caveat).toContain('06:00-12:00'.replace('-', '–'));
    expect(caveat).toMatch(/CHANDRA LAGNA/);
  });

  it('leaves the existing approximate caveat alone, and says nothing when accuracy is unset', () => {
    const approx = buildProfileFacts({ birthTimeAccuracy: 'approximate' }, {});
    expect(approx.some((f) => f.startsWith('BIRTH TIME CONFIDENCE'))).toBe(true);
    expect(approx.some((f) => f.startsWith('BIRTH TIME NOT KNOWN'))).toBe(false);

    const unset = buildProfileFacts({ timeOfBirth: '09:00' }, {});
    expect(unset.some((f) => f.startsWith('BIRTH TIME'))).toBe(false);
  });
});
