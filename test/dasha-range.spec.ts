import { describe, expect, it } from 'vitest';
import { calculateVimshottariDasha } from '../src/lib/astro-engine/dashas/vimshottari.js';
import { dashaPeriodsInRange } from '../src/lib/astro-engine/dashas/dasha-range.js';
import { computeFreshAntardashas } from '../src/lib/astro-engine/reports/monthly-dasha-context.js';

const birth = new Date('1990-05-15T09:00:00Z');
const tree = calculateVimshottariDasha(123.4, birth);
/** What comes back out of kundlis.dasha_data jsonb: dates as ISO strings. */
const stored = JSON.parse(JSON.stringify(tree.mahadashas)) as Array<{
  planet: string;
  startDate: string;
  endDate: string;
}>;

describe('dashaPeriodsInRange', () => {
  it('returns contiguous antardashas that cover the whole range, from stored (string-dated) mahadashas', () => {
    const from = new Date('2030-01-01T00:00:00Z');
    const to = new Date('2034-01-01T00:00:00Z');
    const spans = dashaPeriodsInRange(stored, from, to, 1);

    expect(spans.length).toBeGreaterThan(0);
    expect(spans.every((s) => s.level === 'antardasha' && s.lords.length === 2)).toBe(true);
    expect(spans[0]!.startDate.getTime()).toBeLessThanOrEqual(from.getTime());
    expect(spans.at(-1)!.endDate.getTime()).toBeGreaterThanOrEqual(to.getTime());
    for (let i = 1; i < spans.length; i++) {
      expect(spans[i]!.startDate.getTime()).toBe(spans[i - 1]!.endDate.getTime());
    }
  });

  it('matches computeFreshAntardashas exactly, so it agrees with what reports show', () => {
    const md = tree.mahadashas[2]!;
    const expected = computeFreshAntardashas(md);
    const spans = dashaPeriodsInRange(stored, md.startDate, md.endDate, 1);

    expect(spans.map((s) => s.planet)).toEqual(expected.map((p) => p.planet));
    expect(spans.map((s) => s.startDate.toISOString())).toEqual(
      expected.map((p) => new Date(p.startDate).toISOString()),
    );
  });

  it('carries the full lord chain at pratyantar depth and the current branch agrees with the stored tree', () => {
    const now = new Date();
    const spans = dashaPeriodsInRange(stored, now, new Date(now.getTime() + 1), 2);

    expect(spans).toHaveLength(1);
    const [maha, antar, pratyantar] = spans[0]!.lords;
    expect(maha).toBe(tree.currentMahadasha.planet);
    expect(antar).toBe(tree.currentAntardasha.planet);
    expect(pratyantar).toBe(tree.currentPratyantardasha.planet);
  });

  it('returns mahadashas themselves at depth 0 and nothing outside the range', () => {
    const spans = dashaPeriodsInRange(
      stored,
      new Date('1990-05-15T09:00:00Z'),
      new Date('1990-05-16T00:00:00Z'),
      0,
    );
    expect(spans).toHaveLength(1);
    expect(spans[0]!.planet).toBe(tree.mahadashas[0]!.planet);
    expect(dashaPeriodsInRange(stored, new Date('2300-01-01'), new Date('2301-01-01'), 1)).toEqual(
      [],
    );
  });
});
