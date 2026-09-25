import { beforeEach, describe, expect, it, vi } from 'vitest';
import { calculateChart } from '../src/lib/astro-engine/calculations/planetPositions.js';
import { calculateAshtakavarga } from '../src/lib/astro-engine/calculations/ashtakavarga.js';
import { makeUserRow } from './helpers/mocks.js';

const held = vi.hoisted((): { kundli: unknown; level: string; pass: boolean } => ({
  kundli: undefined,
  level: 'high',
  pass: true,
}));

vi.mock('../src/modules/kundli/kundli.repo.js', () => ({
  findKundliByUserId: () => Promise.resolve(held.kundli),
}));
vi.mock('../src/modules/birth-profiles/profile-context.js', async () => {
  const { makeProfileContext: profile } = await import('./helpers/mocks.js');
  return {
    resolveActiveProfileContext: () =>
      Promise.resolve(
        profile({ placeOfBirth: { name: 'Delhi', lat: 28.6139, lon: 77.209, tz: 'Asia/Kolkata' } }),
      ),
  };
});
vi.mock('../src/modules/insights/insights.service.js', () => ({
  confidenceFor: () =>
    Promise.resolve({
      pct: held.level === 'low' ? 30 : 85,
      level: held.level,
      basis: 'stated_exact',
    }),
}));
vi.mock('../src/modules/pass/pass.repo.js', () => ({
  findActivePass: () => Promise.resolve(held.pass ? { id: 'pass-1' } : null),
}));

import {
  dignityOf,
  relocateChart,
  scoreRelocationAreas,
} from '../src/lib/astro-engine/astrocartography/relocation-areas.js';
import {
  compareRelocation,
  getRelocationStatus,
} from '../src/modules/relocation/relocation.service.js';

async function natal() {
  return calculateChart(1990, 5, 15, 14, 30, 5.5, 28.6139, 77.209, 'lahiri', 'W');
}

beforeEach(async () => {
  held.level = 'high';
  held.pass = true;
  if (!held.kundli)
    held.kundli = {
      status: 'ready',
      chartData: JSON.parse(JSON.stringify(await natal())) as unknown,
    };
});

describe('dignityOf', () => {
  it('knows exaltation, own sign and debilitation', () => {
    expect(dignityOf('Jupiter', 3)).toBe(1); // exalted in Cancer
    expect(dignityOf('Jupiter', 8)).toBe(1); // own sign Sagittarius
    expect(dignityOf('Jupiter', 9)).toBe(-1); // debilitated in Capricorn
    expect(dignityOf('Saturn', 0)).toBe(-1);
    expect(dignityOf('Mars', 5)).toBe(0);
  });
});

describe('relocating a real chart', () => {
  it('keeps the planets, moves the Ascendant and houses, and keeps the Ashtakavarga total', async () => {
    const chart = await natal();
    const home = await relocateChart(chart, 28.6139, 77.209);
    const away = await relocateChart(chart, 40.7128, -74.006); // New York
    expect(home.ascendant.signIndex).toBe(chart.ascendant.signIndex);
    expect(away.ascendant.signIndex).not.toBe(home.ascendant.signIndex);
    expect(away.planets.map((p) => p.longitude)).toEqual(chart.planets.map((p) => p.longitude));
    for (const p of away.planets) {
      expect(p.house).toBe(((p.signIndex - away.ascendant.signIndex + 12) % 12) + 1);
    }
    expect(away.houses[0]!.signIndex).toBe(away.ascendant.signIndex);
    expect(calculateAshtakavarga(away).sarva.total).toBe(calculateAshtakavarga(home).sarva.total);
  }, 60_000);

  it('scores six areas 0-100 with reasons', async () => {
    const areas = scoreRelocationAreas(await relocateChart(await natal(), 51.5074, -0.1278));
    expect(Object.keys(areas).sort()).toEqual([
      'career',
      'education',
      'family',
      'finance',
      'lifestyle',
      'relationships',
    ]);
    for (const a of Object.values(areas)) {
      expect(a.score).toBeGreaterThanOrEqual(0);
      expect(a.score).toBeLessThanOrEqual(100);
      expect(['strong', 'good', 'mixed', 'weak']).toContain(a.level);
      for (const f of a.why) expect(f.textKey).toMatch(/^relocation\.why\./);
    }
  }, 60_000);
});

describe('relocation service', () => {
  it('reports the birth-time gate', async () => {
    held.level = 'low';
    const s = await getRelocationStatus(makeUserRow());
    expect(s.blocked).toBe(true);
    expect(s.birthPlace).toEqual({ name: 'Delhi' });
  });

  it('compares the birth place first, then each chosen place', async () => {
    const res = await compareRelocation(makeUserRow(), [
      { name: 'London', lat: 51.5074, lon: -0.1278 },
      { name: 'Dubai', lat: 25.2048, lon: 55.2708 },
    ]);
    expect(res.places.map((p) => [p.name, p.isBirthPlace])).toEqual([
      ['Delhi', true],
      ['London', false],
      ['Dubai', false],
    ]);
    for (const p of res.places) expect(p.overall).toBeGreaterThanOrEqual(0);
  }, 60_000);

  it('refuses without the Aroha Pass or while the birth time is too uncertain', async () => {
    held.pass = false;
    await expect(getRelocationStatus(makeUserRow())).rejects.toThrow('PASS_REQUIRED');
    await expect(compareRelocation(makeUserRow(), [{ name: 'X', lat: 0, lon: 0 }])).rejects.toThrow(
      'PASS_REQUIRED',
    );
    held.pass = true;
    held.level = 'low';
    await expect(compareRelocation(makeUserRow(), [{ name: 'X', lat: 0, lon: 0 }])).rejects.toThrow(
      'BIRTH_TIME_TOO_UNCERTAIN',
    );
  });
});
