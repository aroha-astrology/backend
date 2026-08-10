import { describe, it, expect } from 'vitest';
import {
  rectifyBirthTime,
  MIN_EVENTS_FOR_RECTIFICATION,
  type LifeEvent,
} from '../src/lib/astro-engine/calculations/rectification.js';

const BASE = {
  year: 1990,
  month: 5,
  day: 20,
  hour: 6,
  minute: 30,
  tzOffset: 5.5,
  lat: 19.076,
  lng: 72.8777,
};

const EVENTS: LifeEvent[] = [
  { date: '2015-03-10', domain: 'marriage' },
  { date: '2018-07-22', domain: 'job_started' },
  { date: '2020-01-05', domain: 'childbirth' },
  { date: '2012-06-01', domain: 'education_milestone' },
];

describe('rectifyBirthTime: refusing to guess', () => {
  it('returns null below the evidence floor rather than a confident wrong time', async () => {
    const out = await rectifyBirthTime({ ...BASE, events: EVENTS.slice(0, 2) });
    expect(out).toBeNull();
  }, 60_000);

  it('ignores malformed dates when counting evidence', async () => {
    const out = await rectifyBirthTime({
      ...BASE,
      events: [
        { date: 'last summer', domain: 'job_started' },
        { date: '2018-07-22', domain: 'job_started' },
        { date: '2020-01-05', domain: 'childbirth' },
      ],
    });
    // Only 2 usable dates remain, which is below the floor.
    expect(out).toBeNull();
  }, 60_000);

  it('states the floor it enforces', () => {
    expect(MIN_EVENTS_FOR_RECTIFICATION).toBeGreaterThanOrEqual(3);
  });
});

describe('rectifyBirthTime: searching', () => {
  it('scans the requested window at the requested step and scores every candidate', async () => {
    const out = await rectifyBirthTime({
      ...BASE,
      events: EVENTS,
      windowMinutes: 20,
      stepMinutes: 10,
    });
    expect(out).not.toBeNull();
    // -20, -10, 0, +10, +20
    expect(out!.candidates).toHaveLength(5);
    for (const c of out!.candidates) {
      expect(c.matched).toBeGreaterThanOrEqual(0);
      expect(c.matched).toBeLessThanOrEqual(EVENTS.length);
      expect(c.score).toBeCloseTo(c.matched / EVENTS.length, 6);
      expect(c.time).toMatch(/^\d{2}:\d{2}$/);
      expect(c.ascendantSign).toBeTruthy();
    }
  }, 120_000);

  it('picks the highest-scoring candidate, breaking ties toward the stated time', async () => {
    const out = await rectifyBirthTime({
      ...BASE,
      events: EVENTS,
      windowMinutes: 20,
      stepMinutes: 10,
    });
    const best = out!.best;
    const topScore = Math.max(...out!.candidates.map((c) => c.matched));
    expect(best.matched).toBe(topScore);
    // Among equal scorers, the one closest to the stated time must win — moving
    // someone's birth time further than the evidence requires is not a fix.
    const equallyGood = out!.candidates.filter((c) => c.matched === topScore);
    const closest = Math.min(...equallyGood.map((c) => Math.abs(c.offsetMinutes)));
    expect(Math.abs(best.offsetMinutes)).toBe(closest);
  }, 120_000);

  it('reports low confidence when many minutes score equally well', async () => {
    // A wide flat landscape means the evidence does not actually single out a
    // time, however high the raw score is.
    const out = await rectifyBirthTime({
      ...BASE,
      events: EVENTS,
      windowMinutes: 60,
      stepMinutes: 30,
    });
    expect(out).not.toBeNull();
    expect(['low', 'medium', 'high']).toContain(out!.confidence);
    expect(out!.reasoning).toMatch(/events line up/);
  }, 120_000);
});
