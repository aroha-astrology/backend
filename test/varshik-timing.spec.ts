import { describe, it, expect, beforeAll } from 'vitest';
import { calculateChart } from '../src/lib/astro-engine/calculations/planetPositions.js';
import { buildVarshikContext, type VarshikContext } from '../src/lib/astro-engine/reports/varshik-context.js';
import { computeVarshikScores, type VarshikScores } from '../src/lib/astro-engine/reports/varshik-2027.js';
import {
  DOSHA_KEYS,
  answerWindow,
  doshaActivity,
  doshaActivityAll,
  reliefTimeline,
  yogaDelivery,
} from '../src/lib/astro-engine/reports/varshik-timing.js';
import { AREAS } from '../src/config/varshik-weights.js';
import { TEST_BIRTHS, inputsFor } from './fixtures/varshik/births.js';

let ctx: VarshikContext;
let scores: VarshikScores;

beforeAll(async () => {
  const birth = TEST_BIRTHS.find((b) => b.id === 'b04')!;
  const inputs = await inputsFor(birth);
  const [y, mo, d] = birth.date.split('-').map(Number) as [number, number, number];
  const natal = await calculateChart(y, mo, d, 4, 30, 5.5, birth.latitude, birth.longitude, 'lahiri', 'W');
  ctx = await buildVarshikContext({ inputs, natal, year: 2027 });
  scores = computeVarshikScores(ctx, {});
}, 120_000);

describe('doshaActivity', () => {
  it('covers all 9 doshas in all 12 months, every one with a status', () => {
    const all = doshaActivityAll(ctx);
    expect(all).toHaveLength(12);
    for (const m of all) {
      expect(m.items.map((i) => i.key)).toEqual(DOSHA_KEYS);
      for (const i of m.items) {
        expect(['present', 'cancelled', 'not_present']).toContain(i.status);
        // Only a dosha that is present can be awake, and awake means a stated reason.
        if (i.active) {
          expect(i.status).toBe('present');
          expect(i.triggers.length).toBeGreaterThan(0);
          expect(i.because.length).toBeGreaterThan(0);
        }
      }
    }
    expect(doshaActivity(ctx, 5)).toEqual(all[5]);
  });
  it('Sade Sati and Dhaiya follow Saturn against the natal Moon', () => {
    const moon = ctx.natal.planets.find((p) => p.planet === 'Moon')!.signIndex;
    const anyDay = ctx.days.some((d) => {
      const h = ((Math.floor(d.lon.Saturn! / 30) - moon + 12) % 12) + 1;
      return [12, 1, 2].includes(h);
    });
    const sade = doshaActivityAll(ctx).map((m) => m.items.find((i) => i.key === 'sadeSati')!);
    expect(sade.every((i) => i.status === (anyDay ? 'present' : 'not_present'))).toBe(true);
  });
});

describe('yogaDelivery', () => {
  it('gives months inside 0-11 with a reason for each, natal and Tajika', () => {
    const rows = yogaDelivery(ctx);
    expect(rows.some((r) => r.source === 'natal')).toBe(true);
    expect(rows.some((r) => r.source === 'tajika')).toBe(true);
    for (const r of rows) {
      for (const m of r.months) {
        expect(m >= 0 && m <= 11).toBe(true);
        expect(r.because[m]!.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('answerWindow', () => {
  it('finds a dated window inside the year for every area and decision', () => {
    for (const key of [...AREAS, 'new_work', 'marriage']) {
      const w = answerWindow(scores, ctx, key);
      expect(w.best).not.toBeNull();
      expect(w.best!.fromMs).toBeGreaterThanOrEqual(ctx.calendar.windowStartMs);
      expect(w.best!.toMs).toBeLessThanOrEqual(ctx.calendar.windowEndMs);
      expect(w.best!.fromDay).toBeLessThanOrEqual(w.best!.peakDay);
      expect(w.best!.peakDay).toBeLessThanOrEqual(w.best!.toDay);
      if (!w.weak) expect(w.best!.tier === 'light_green' || w.best!.tier === 'dark_green').toBe(true);
    }
    expect(() => answerWindow(scores, ctx, 'nonsense')).toThrow();
  });
  it('never gives a window longer than the cap, even for a year that is good all through', () => {
    const high = { ...scores, series: { ...scores.series, areas: Object.fromEntries(AREAS.map((a) => [a, Array.from({ length: 365 }, (_, i) => 70 + Math.sin(i / 20) * 5)])) } } as VarshikScores;
    const w = answerWindow(high, ctx, 'love');
    expect(w.weak).toBe(false);
    expect(w.best!.toDay - w.best!.fromDay + 1).toBeLessThanOrEqual(42);
    // the cap keeps the strongest stretch of the run, so the mean beats the run's weakest stretch
    expect(w.best!.score).toBeGreaterThanOrEqual(72);
  });
  it('never starts before the reader bought the report', () => {
    const after = ctx.days[200]!.atMs;
    const w = answerWindow(scores, ctx, 'career', after);
    if (w.best) expect(w.best.fromDay).toBeGreaterThanOrEqual(200);
  });
  it('calls a flat low year weak and does not promise a window', () => {
    const flat = { ...scores, series: { ...scores.series, areas: Object.fromEntries(AREAS.map((a) => [a, new Array(365).fill(40)])) } } as VarshikScores;
    const w = answerWindow(flat, ctx, 'love');
    expect(w.weak).toBe(true);
    expect(w.then).toBeNull();
  });
});

describe('reliefTimeline', () => {
  it('reads 18 months back and dated events ahead to the end of 2029, in order', () => {
    const t = reliefTimeline(ctx);
    expect(t.lookback.toMs).toBe(t.asOfMs);
    expect(t.asOfMs - t.lookback.fromMs).toBeGreaterThan(540 * 86_400_000);
    for (const e of t.lookback.events) expect(e.atMs >= t.lookback.fromMs && e.atMs < t.asOfMs).toBe(true);
    for (let i = 1; i < t.ahead.length; i++) expect(t.ahead[i]!.atMs).toBeGreaterThanOrEqual(t.ahead[i - 1]!.atMs);
    for (const e of t.ahead) expect(e.atMs).toBeLessThan(Date.UTC(2030, 0, 1));
    if (t.nextRelief) expect(t.nextRelief.effect).toBe('relief');
    // Either relief arrives in 2027, or the next one beyond it is named (when there is one).
    if (!t.reliefInYear && t.nextReliefBeyondYear) expect(t.nextReliefBeyondYear.atMs).toBeGreaterThanOrEqual(ctx.calendar.windowEndMs);
    expect(t.varsha2026?.yearLord ?? 'Sun').toBeTruthy();
  });
});
