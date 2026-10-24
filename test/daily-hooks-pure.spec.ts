import { describe, expect, it } from 'vitest';
import { dailyLunarAssessment } from '../src/lib/astro-tools/tara-bala';
import { contact, separation } from '../src/lib/astro-tools/daily-hooks/aspects';
import { BEEJ_MANTRA, nakshatraLord, pickKavach, type KavachCandidate } from '../src/lib/astro-tools/daily-hooks/kavach';
import { buildReceipts, shareLine } from '../src/lib/astro-tools/daily-hooks/receipts';
import { pickPublicChart, PUBLIC_CHARTS, rankMystery } from '../src/lib/astro-tools/daily-hooks/mystery';
import { sleepPattern, sleepReport, type SleepNight } from '../src/lib/astro-tools/daily-hooks/sleep';
import { buildTextTiming, decode, scoreAt, textColor } from '../src/lib/astro-tools/daily-hooks/text-timing';
import { TEXT_TIMING_WEIGHTS } from '../src/lib/astro-tools/daily-hooks/weights';

const sweep = (start: number, perDay = 13.2) =>
  Array.from({ length: 48 }, (_, i) => ({ atMin: i * 30, longitude: (start + (perDay / 1440) * i * 30) % 360 }));

describe('aspects', () => {
  it('separation is the short way round', () => {
    expect(separation(10, 350)).toBe(20);
    expect(separation(0, 180)).toBe(180);
    expect(separation(90, 270)).toBe(180);
  });
  it('contact: trine warm, square tense, nothing neutral, blended at the edge of the orb', () => {
    expect(contact(0, 120)).toEqual({ value: 1, aspect: 'trine', orbDeg: 0 });
    expect(contact(0, 90).value).toBe(0.2);
    expect(contact(0, 45)).toEqual({ value: 0.5, aspect: null, orbDeg: null });
    const edge = contact(0, 126);
    expect(edge.aspect).toBe('trine');
    expect(edge.value).toBeCloseTo(0.5, 5);
    expect(contact(0, 123).value).toBeCloseTo(0.75, 5);
  });
});

describe('Ghar Ka Kavach', () => {
  // find index combinations with a known quality instead of trusting hand arithmetic
  function find(quality: string): { nak: number; sign: number; tNak: number; tSign: number } {
    for (let nak = 0; nak < 27; nak++)
      for (let tNak = 0; tNak < 27; tNak++)
        for (let sign = 0; sign < 12; sign++)
          for (let tSign = 0; tSign < 12; tSign++)
            if (dailyLunarAssessment(nak, sign, tNak, tSign).overallQuality === quality) return { nak, sign, tNak, tSign };
    throw new Error(`no ${quality} combination`);
  }
  const poor = find('poor');
  const good = find('good');
  const cand = (id: string, name: string, c: ReturnType<typeof find>, pulse: number | null = 50): KavachCandidate => ({
    id, name, natalNakshatra: c.nak, natalSign: c.sign, todayNakshatra: c.tNak, todaySign: c.tSign, pulse,
  });

  it('nobody -> no pick', () => expect(pickKavach([])).toBeNull());

  it('picks the member with the poorest day and says which Tara', () => {
    const pick = pickKavach([cand('a', 'Asha', good), cand('b', 'Bhanu', poor)])!;
    expect(pick.id).toBe('b');
    expect(pick.quality).toBe('poor');
    expect(pick.ranked.map((r) => r.id)).toEqual(['b', 'a']);
    expect(pick.beads).toBe(11);
    expect(pick.taraName.length).toBeGreaterThan(2);
  });

  it('ties go to the lower circle pulse, then to the name, so the pick is stable', () => {
    const a = cand('a', 'Asha', poor, 70);
    const b = cand('b', 'Bhanu', poor, 40);
    expect(pickKavach([a, b])!.id).toBe('b');
    expect(pickKavach([b, a])!.id).toBe('b');
    const c = cand('c', 'Chitra', poor, 40);
    expect(pickKavach([c, b])!.id).toBe('b'); // same pulse: Bhanu before Chitra
  });

  it('the planet is the lord of the nakshatra the Moon is in today, with its beej mantra', () => {
    expect(nakshatraLord(0)).toBe('Ketu');
    expect(nakshatraLord(3)).toBe('Moon'); // Rohini
    expect(nakshatraLord(9)).toBe('Ketu'); // Magha
    expect(nakshatraLord(26)).toBe('Mercury'); // Revati
    const pick = pickKavach([cand('b', 'Bhanu', { ...poor, tNak: 26 })])!;
    expect(pick.planet).toBe('Mercury');
    expect(pick.mantra).toBe(BEEJ_MANTRA.Mercury);
    expect(Object.keys(BEEJ_MANTRA)).toHaveLength(9);
  });
});

describe('Cosmic Receipts', () => {
  const natal = [{ planet: 'Sun', longitude: 348.25 }];

  it('finds the tightest aspect in the part and the time it peaks', () => {
    const cards = buildReceipts(natal, sweep(100));
    expect(cards.map((c) => c.part)).toEqual(['morning', 'afternoon', 'evening']);
    const aft = cards[1]!;
    expect(aft.aspect).toMatchObject({ name: 'trine', natalPlanet: 'Sun', tone: 'easy', peakMin: 900 });
    expect(aft.aspect!.orbDeg).toBeLessThan(0.2);
    expect(aft.proof).toContain('trine natal Sun');
    expect(aft.proof).toContain('18°15′ Pisces'); // the natal Sun at 348.25
  });

  it('a part with no aspect inside the orb is a quiet window and says so', () => {
    const cards = buildReceipts([{ planet: 'Sun', longitude: 160 }], sweep(100));
    expect(cards.every((c) => c.aspect === null)).toBe(true);
    expect(cards[0]!.headline).toBe('A quiet window');
  });

  it('leaves Rahu and Ketu out of aspects', () => {
    const cards = buildReceipts([{ planet: 'Rahu', longitude: 348.25 }], sweep(100));
    expect(cards.every((c) => c.aspect === null)).toBe(true);
  });

  it('is deterministic and refuses a track that does not cover the day', () => {
    expect(buildReceipts(natal, sweep(100))).toEqual(buildReceipts(natal, sweep(100)));
    expect(() => buildReceipts(natal, sweep(100).slice(0, 10))).toThrow();
  });

  it('the words are tendencies and never carry a percentage', () => {
    const text = JSON.stringify(buildReceipts(natal, sweep(100)));
    expect(text).not.toMatch(/%|guarantee|will definitely|accura/i);
  });

  it('the share line counts the reader\'s own marks only', () => {
    expect(shareLine({ morning: 'nailed', evening: 'missed' })).toEqual({ rated: 2, nailed: 1, partly: 0, missed: 1 });
    expect(shareLine({})).toEqual({ rated: 0, nailed: 0, partly: 0, missed: 0 });
  });
});

describe('Text them now?', () => {
  const P = 100;
  const other = { moon: P, venus: P, mercury: P };

  it('the weights add up to 100 and are pinned', () => {
    expect(TEXT_TIMING_WEIGHTS).toEqual({ moonToMoon: 40, moonToVenus: 25, moonToMercury: 20, ownMoon: 15 });
  });

  it('a Moon in trine to all three, comfortable for the reader, scores 100 (green); in square it is red', () => {
    const ownSign = Math.floor((P + 120) / 30); // house 1 from the transit Moon: favourable
    expect(scoreAt(P + 120, ownSign, other).score).toBe(100);
    const sq = scoreAt(P + 90, Math.floor((P + 90) / 30), other).score;
    expect(sq).toBeLessThan(40);
    expect(textColor(100)).toBe('green');
    expect(textColor(sq)).toBe('red');
  });

  it('builds runs that cover the day, and says "best until" when the clock is in a green run', () => {
    const track = sweep(P + 100, 13.2); // the Moon drifts across the trine point during the day
    const t = buildTextTiming(track, 3, other, 600);
    expect(t.runs[0]!.startMin).toBe(0);
    expect(t.runs.at(-1)!.endMin).toBe(1440);
    for (let i = 1; i < t.runs.length; i++) expect(t.runs[i]!.startMin).toBe(t.runs[i - 1]!.endMin);
    if (t.current?.color === 'green') {
      expect(t.bestUntil).toBe(t.current.end);
      expect(t.nextGreen).toBeNull();
    } else {
      expect(t.bestUntil).toBeNull();
    }
  });

  it('with the day over there is no best stretch', () => {
    expect(buildTextTiming(sweep(P), 3, other, 1440).best).toBeNull();
  });

  it('the decoder has four cards with proof, and never says what they feel', () => {
    const track = sweep(P + 100);
    const t = buildTextTiming(track, 3, other, 600);
    const cards = decode(t, track[20]!.longitude, 3, other);
    expect(cards.map((c) => c.id)).toEqual(['now', 'window', 'moon', 'tone']);
    expect(cards.every((c) => c.proof.length > 5)).toBe(true);
    expect(JSON.stringify(cards)).not.toMatch(/\b(feels?|loves?|wants you|misses you)\b/i);
  });
});

describe('Sleep Sync', () => {
  const night = (d: number, score: number, nak: number, sign = nak % 12): SleepNight => ({
    localDate: `2026-10-${String(d).padStart(2, '0')}`, score, nakshatraIndex: nak, signIndex: sign,
  });

  it('shows nothing ranked before 7 nights', () => {
    const p = sleepPattern([1, 2, 3, 4, 5, 6].map((d) => night(d, 3, d)));
    expect(p.ready).toBe(false);
    expect(p.top).toEqual([]);
    expect(p.nights).toBe(6);
  });

  it('after 7 nights ranks top and bottom three and warns the pattern is early', () => {
    const scores = [5, 4, 3, 2, 1, 4, 2];
    const p = sleepPattern(scores.map((s, i) => night(i + 1, s, i)));
    expect(p.ready).toBe(true);
    expect(p.top.map((r) => r.nakshatraIndex)).toEqual([0, 1, 5]);
    expect(p.bottom.map((r) => r.nakshatraIndex)).toEqual([4, 3, 6]);
    expect(p.confidence).toBe('early');
    expect(p.average).toBeCloseTo(3, 0);
  });

  it('top and bottom never share a nakshatra', () => {
    const p = sleepPattern(Array.from({ length: 7 }, (_, i) => night(i + 1, 3, i)));
    const all = [...p.top, ...p.bottom].map((r) => r.nakshatraIndex);
    expect(new Set(all).size).toBe(all.length);
  });

  it('repeat visits firm the pattern up', () => {
    const rows = [...[1, 2, 3].map((d) => night(d, 5, 10)), ...[4, 5, 6].map((d) => night(d, 1, 11)), night(7, 3, 12), night(8, 3, 12), night(9, 3, 12)];
    expect(sleepPattern(rows).confidence).toBe('firming');
  });

  it('the 30-day report stays inside the window and finds the longest good run', () => {
    const rows = [night(1, 2, 1), night(2, 4, 2), night(3, 5, 3), night(4, 4, 4), night(5, 1, 5), night(6, 4, 6)];
    const old: SleepNight = { localDate: '2026-08-01', score: 1, nakshatraIndex: 0, signIndex: 0 };
    const r = sleepReport([...rows, old], '2026-10-06');
    expect(r.nights).toBe(6);
    expect(r.longestGoodRun).toBe(3);
    expect(r.bestNights[0]!.score).toBe(5);
    expect(r.lowestNights[0]!.score).toBe(1);
    expect(r.byNakshatra).toHaveLength(6);
    expect(r.bySign.every((s) => s.nights >= 1)).toBe(true);
  });

  it('an empty report is empty, not an error', () => {
    const r = sleepReport([], '2026-10-06');
    expect(r.nights).toBe(0);
    expect(r.average).toBeNull();
  });
});

describe('Mystery Synastry', () => {
  it('ranks by 60% compatibility and 40% how kindly the evening Moon sits', () => {
    // evening Moon trine both natal Moons: the second factor is 1.0 for both
    const eve = 220;
    const ranked = rankMystery(
      [
        { id: 'a', name: 'Asha', compatibility: 70, moon: 100 },
        { id: 'b', name: 'Bhanu', compatibility: 90, moon: 100 },
      ],
      100,
      eve,
    );
    expect(ranked[0]!.id).toBe('b');
    expect(ranked[0]!.score).toBe(Math.round(0.6 * 90 + 0.4 * 100));
    expect(ranked[0]!.why).toHaveLength(2);
    expect(ranked[0]!.why[1]).toContain('trine');
  });

  it('a kind evening Moon can lift a lower compatibility above a higher one', () => {
    const ranked = rankMystery(
      [
        { id: 'tense', name: 'Tara', compatibility: 80, moon: 190 }, // evening 220 is 30 from it: no aspect (neutral)
        { id: 'kind', name: 'Kiran', compatibility: 72, moon: 100 }, // trine to 220
      ],
      100,
      220,
    );
    expect(ranked.map((r) => r.id)).toEqual(['kind', 'tense']);
  });

  it('is stable on ties (by name)', () => {
    const p = [
      { id: 'b', name: 'Bhanu', compatibility: 60, moon: 10 },
      { id: 'a', name: 'Asha', compatibility: 60, moon: 10 },
    ];
    expect(rankMystery(p, 10, 10).map((r) => r.name)).toEqual(['Asha', 'Bhanu']);
  });

  it('public charts: each has a recorded source note, and one is picked deterministically', () => {
    expect(PUBLIC_CHARTS).toHaveLength(3);
    for (const c of PUBLIC_CHARTS) {
      expect(c.note).toMatch(/Rodden AA/);
      expect(Number.isNaN(Date.parse(c.instant))).toBe(false);
    }
    const moons = { einstein: 100, jobs: 220, diana: 340 };
    const a = pickPublicChart(100, 220, moons);
    expect(a).toEqual(pickPublicChart(100, 220, moons));
    expect(['Albert Einstein', 'Steve Jobs', 'Diana, Princess of Wales']).toContain(a.name);
  });
});
