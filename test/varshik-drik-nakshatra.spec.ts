// C0 step 7: Moon nakshatra changes in 2027 against drikpanchang (fixtures/jhora/drik-moon-nakshatra-2027.json).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { findMoonChanges } from '../src/lib/astro-tools/moon-events.js';

const fx = JSON.parse(fs.readFileSync(new URL('./fixtures/jhora/drik-moon-nakshatra-2027.json', import.meta.url), 'utf8'));

describe('Moon nakshatra changes against drikpanchang', () => {
  it('every printed change is within 2 minutes', async () => {
    for (const c of fx.changes as { at: string; to: string }[]) {
      const drikMs = Date.parse(`${c.at}:00+05:30`);
      const ev = await findMoonChanges(new Date(drikMs - 3 * 3_600_000), new Date(drikMs + 3 * 3_600_000), ['nakshatra']);
      const hit = ev.find((e) => e.to === c.to);
      expect(hit, `${c.at} ${c.to}`).toBeTruthy();
      expect(Math.abs(hit!.exactAt.getTime() - drikMs), `${c.at} ${c.to}`).toBeLessThanOrEqual(2 * 60_000);
    }
  }, 120_000);
});
