// C0: the 2027 sky events (sign and nakshatra changes, stations, eclipses) checked by machine.
// Reference: scripts/ephemeris-check/events_2027.py, which runs the native pyswisseph build with its
// own event finder, independent of the engine's wasm build. Set PYJHORA_PYTHON (any Python with
// pyswisseph); without it the file is skipped. Eclipses are also pinned to NASA's published table.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { findTransitEvents, findNakshatraChanges } from '../src/lib/astro-tools/transit-events.js';
import { eclipsesBetween } from '../src/lib/astro-engine/panchang/eclipse.js';

const PY = process.env.PYJHORA_PYTHON;
const here = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(here, '..', 'scripts', 'ephemeris-check', 'events_2027.py');
const FROM = new Date('2026-12-31T18:30:00Z'); // 1 Jan 2027, 00:00 IST
const TO = new Date('2027-12-31T18:30:00Z');
const norm = (s: string | null) => (s ?? '').toLowerCase().replace(/[^a-z]/g, '');

interface RefEvent { planet: string; kind: string; to: string | null; at: string }
interface Ref { events: RefEvent[]; eclipses: { kind: string; atUt: string; deltaTSec: number }[] }

function reference(): Ref {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ev27-')), 'ev.json');
  execFileSync(PY!, [SCRIPT, out], { stdio: 'ignore' });
  return JSON.parse(fs.readFileSync(out, 'utf8'));
}

/** NASA, Five Millennium Catalog decade tables, read 2026-11-08. Times are "TD of Greatest Eclipse". */
const NASA_2027 = [
  { kind: 'solar', td: '2027-02-06T16:00:47Z' }, // Annular
  { kind: 'solar', td: '2027-08-02T10:07:49Z' }, // Total
  { kind: 'lunar', td: '2027-02-20T23:14:06Z' }, // Penumbral
  { kind: 'lunar', td: '2027-07-18T16:04:09Z' }, // Penumbral
  { kind: 'lunar', td: '2027-08-17T07:14:59Z' }, // Penumbral
];

describe.skipIf(!PY)('2027 sky events against an independent Swiss Ephemeris run', () => {
  const ref = PY ? reference() : ({ events: [], eclipses: [] } as Ref);

  it('every sign change (Sun to Ketu) and station: same events, within 15 minutes', async () => {
    const eng = await findTransitEvents(FROM, TO);
    const want = ref.events.filter((e) => e.kind === 'sign' || e.kind === 'retrograde' || e.kind === 'direct');
    const got = eng.map((e) => ({ planet: e.planet, kind: e.eventType === 'ingress' ? 'sign' : e.eventType, to: e.toSign, at: e.exactAt.getTime() }));
    expect(got.length, 'event count').toBe(want.length);
    for (const w of want) {
      const g = got.find((x) => x.planet === w.planet && x.kind === w.kind && norm(x.to) === norm(w.to) && Math.abs(x.at - Date.parse(w.at)) < 15 * 60_000);
      expect(g, `${w.planet} ${w.kind} ${w.to} ${w.at}`).toBeTruthy();
    }
  }, 600_000);

  it('every nakshatra change of Sun, Mercury, Venus, Mars, Jupiter, Saturn, Rahu, Ketu: same events, within 5 minutes', async () => {
    const planets = ['Sun', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Rahu', 'Ketu'];
    const eng = await findNakshatraChanges(FROM, TO, planets);
    const want = ref.events.filter((e) => e.kind === 'nakshatra');
    expect(eng.length, 'event count').toBe(want.length);
    for (const w of want) {
      const g = eng.find((x) => x.planet === w.planet && norm(x.toNakshatra) === norm(w.to) && Math.abs(x.exactAt.getTime() - Date.parse(w.at)) < 5 * 60_000);
      expect(g, `${w.planet} -> ${w.to} ${w.at}`).toBeTruthy();
    }
  }, 600_000);

  it('anchor: Drik Panchang prints the Sun leaving Dhanu at 09:14 PM IST on 14 Jan 2027 (standard Lahiri would be 8 minutes early)', async () => {
    const eng = await findTransitEvents(new Date('2027-01-14T00:00:00Z'), new Date('2027-01-16T00:00:00Z'));
    const sun = eng.find((e) => e.planet === 'Sun' && e.eventType === 'ingress')!;
    const drik = Date.parse('2027-01-14T21:14:00+05:30');
    expect(Math.abs(sun.exactAt.getTime() - drik)).toBeLessThanOrEqual(2 * 60_000);
  });

  it('eclipses: engine, reference and NASA agree (NASA times are TD, so ΔT is taken off)', async () => {
    const eng = await eclipsesBetween(FROM, TO);
    expect(eng.length).toBe(NASA_2027.length);
    for (const n of NASA_2027) {
      const dT = ref.eclipses[0]!.deltaTSec;
      const nasaUt = Date.parse(n.td) - dT * 1000;
      const e = eng.find((x) => x.kind === n.kind && Math.abs(x.at.getTime() - nasaUt) < 3 * 60_000);
      expect(e, `engine ${n.kind} ${n.td}`).toBeTruthy();
      const r = ref.eclipses.find((x) => x.kind === n.kind && Math.abs(Date.parse(x.atUt) - nasaUt) < 3 * 60_000);
      expect(r, `reference ${n.kind} ${n.td}`).toBeTruthy();
    }
  }, 600_000);
});
