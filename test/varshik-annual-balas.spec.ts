// C2: Harsha bala and Dwadashavargiya bala against Jagannatha Hora (fixtures/jhora/<id>.partial.json).
// Each Varsha chart is cast at JHora's own return instant.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { calculateChart } from '../src/lib/astro-engine/calculations/planetPositions.js';
import {
  harshaBala, dwadashavargiyaBala, BALA_PLANETS, DWADASHAVARGIYA_JHORA_VERIFIED,
} from '../src/lib/astro-engine/varshphal/annual-balas.js';
import { getAstroDay, dayContextAt } from '../src/lib/astro-engine/rules/day.js';
import { TEST_BIRTHS } from './fixtures/varshik/births.js';

const dir = new URL('./fixtures/jhora/', import.meta.url);
const offsetMin = (s: string) => {
  const m = s.match(/\(([+-])(\d\d):(\d\d)\)/)!;
  return (m[1] === '-' ? -1 : 1) * (+m[2]! * 60 + +m[3]!);
};
const toMs = (l: string, o: number) => {
  const m = l.match(/^(\d{4})-(\d\d)-(\d\d) (\d\d):(\d\d):(\d\d)/)!;
  return Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!, +m[6]!) - o * 60_000;
};

const files = fs.readdirSync(dir).filter((f) => /^b\d+\.partial\.json$/.test(f));
describe.each(files)('%s', (f) => {
  const fx = JSON.parse(fs.readFileSync(new URL(f, dir), 'utf8'));
  const birth = TEST_BIRTHS.find((b) => b.id === fx.id)!;
  it.each(['2026', '2027'])('Harsha (all 7) and Dwadashavargiya (Sun, Mars, Jupiter, Venus, Saturn) equal JHora in %s', async (yr) => {
    const rec = fx.varsha[yr];
    const t = new Date(toMs(rec.solarReturnLocal, offsetMin(rec.solarReturnLocal)));
    const c = await calculateChart(
      t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate(), t.getUTCHours(),
      t.getUTCMinutes() + t.getUTCSeconds() / 60, 0, birth.latitude, birth.longitude, 'lahiri', 'W',
    );
    const ad = await getAstroDay(t, birth.latitude, birth.longitude, birth.longitude / 15);
    const dc = ad ? dayContextAt(ad, t) : null;
    const h = harshaBala(c, dc ? dc.isDay : true);
    const d = dwadashavargiyaBala(c);
    for (const p of BALA_PLANETS) {
      expect(h[p].total, `Harsha ${p}`).toBe(rec.harsha.values[p]);
      if (DWADASHAVARGIYA_JHORA_VERIFIED.has(p)) expect(d[p].score, `Dwadashavargiya ${p}`).toBe(rec.dwadashavargiya.values[p]);
      expect(d[p].jhoraVerified).toBe(DWADASHAVARGIYA_JHORA_VERIFIED.has(p));
    }
  });
});

describe('Harsha bala by hand (Mehta, Nehru 1947: only Mars in its own sign, Sun and Mars male in the 10th, Moon female in the 7th)', () => {
  it('rules', () => {
    const chart: any = {
      ascendant: { signIndex: 10 },
      planets: [
        { planet: 'Sun', signIndex: 7 }, { planet: 'Moon', signIndex: 4 }, { planet: 'Mars', signIndex: 7 },
        { planet: 'Mercury', signIndex: 7 }, { planet: 'Jupiter', signIndex: 6 }, { planet: 'Venus', signIndex: 7 },
        { planet: 'Saturn', signIndex: 3 },
      ],
    };
    const h = harshaBala(chart, true);
    expect(h.Mars.swakshetra).toBe(5);
    expect(h.Sun.strIPurusha).toBe(5);
    expect(h.Mars.strIPurusha).toBe(5);
    expect(h.Moon.strIPurusha).toBe(5);
    expect(h.Sun.dinaRatri).toBe(5);
    expect(h.Moon.dinaRatri).toBe(0);
    expect(h.Mars.total).toBe(15);
  });
});
