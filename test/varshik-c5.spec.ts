// Varshik C5: Indian calendar correctness.
//   1. Eclipses: type and magnitude against NASA's 2027 tables, local contacts against the C5 plan's
//      table (Swiss Ephemeris, checked 2026-11-09) and drikpanchang, Grahan / Upachchaya / not
//      visible, Sutak only for a Grahan.
//   2. The no-muhurat periods (Shukra and Guru Asta, Kharmas, Chaturmas) and the decision rows that
//      must never get a "go" window inside them.
//   3. The verify-claims rules for house references, eclipses and closures.
import { beforeAll, describe, expect, it } from 'vitest';
import {
  classifyEclipse,
  eclipsesBetween,
  INDIA_ECLIPSE_CITIES,
  type EclipseEvent,
} from '../src/lib/astro-engine/panchang/eclipse.js';
import { findCombustionEvents } from '../src/lib/astro-engine/varshphal/year-events.js';
import { chaturmasOf } from '../src/lib/astro-engine/reports/varshik-muhurta.js';
import { preflightVarshikFacts, type VarshikFacts } from '../src/lib/astro-engine/reports/varshik-facts.js';
import { buildFactIndex, c5ClaimHits } from '../src/lib/llm/reports/verify-varshik-text.js';

const IST = (d: Date) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

// NASA SEdecade2021 / LEdecade2021 (TD of greatest eclipse; magnitudes as printed).
const NASA = [
  { kind: 'solar', td: '2027-02-06T16:00:47Z', subtype: 'annular', magnitude: 0.928 },
  { kind: 'lunar', td: '2027-02-20T23:14:06Z', subtype: 'penumbral' },
  { kind: 'lunar', td: '2027-07-18T16:04:09Z', subtype: 'penumbral' },
  { kind: 'solar', td: '2027-08-02T10:07:49Z', subtype: 'total', magnitude: 1.079 },
  { kind: 'lunar', td: '2027-08-17T07:14:59Z', subtype: 'penumbral' },
] as const;
const DELTA_T_MS = 70_000; // about 70 s in 2027; the match window below is 3 minutes

let eclipses: EclipseEvent[];
beforeAll(async () => {
  eclipses = await eclipsesBetween(new Date('2027-01-01T00:00:00Z'), new Date('2028-01-01T00:00:00Z'));
});

describe('2027 eclipses: type and magnitude (NASA)', () => {
  it('finds the five NASA eclipses with their type and magnitude', () => {
    expect(eclipses.length).toBe(5);
    for (const n of NASA) {
      const ut = Date.parse(n.td) - DELTA_T_MS;
      const e = eclipses.find((x) => x.kind === n.kind && Math.abs(x.at.getTime() - ut) < 3 * 60_000);
      expect(e, n.td).toBeTruthy();
      expect(e!.subtype).toBe(n.subtype);
      if ('magnitude' in n) expect(e!.magnitude).toBeCloseTo(n.magnitude, 2);
    }
  });

  it('21 Feb penumbral magnitude is about 0.93 (drikpanchang prints 0.91), contacts 02:42 to 06:43 IST', () => {
    const e = eclipses.find((x) => x.kind === 'lunar' && x.at.getUTCMonth() === 1)!;
    expect(e.penumbralMagnitude!).toBeGreaterThan(0.9);
    expect(e.penumbralMagnitude!).toBeLessThan(0.95);
    // drikpanchang New Delhi: first contact 02:43, last 06:42.
    expect(Math.abs(minutes(IST(e.startsAt)) - minutes('02:43'))).toBeLessThanOrEqual(2);
    expect(Math.abs(minutes(IST(e.endsAt)) - minutes('06:42'))).toBeLessThanOrEqual(2);
  });
});

describe('2027 eclipses: India classes, local times and Sutak', () => {
  it('classifies 6 Feb not visible, 21 Feb and 18 Jul Upachchaya, 2 Aug Grahan, 17 Aug not visible', async () => {
    const got = await Promise.all(eclipses.map((e) => classifyEclipse(e, INDIA_ECLIPSE_CITIES, 'india')));
    expect(got.map((c) => `${c.at.toISOString().slice(5, 10)} ${c.class}`)).toEqual([
      '02-06 not_visible',
      '02-20 upachchaya',
      '07-18 upachchaya',
      '08-02 grahan',
      '08-17 not_visible',
    ]);
    for (const c of got) {
      expect(c.personalTrigger).toBe(c.class === 'grahan');
      if (c.class !== 'grahan') expect(c.sutak).toEqual([]);
    }
  });

  it('2 Aug local contacts and magnitude match the C5 table (Delhi 15:54-17:03 17%, Mumbai 15:47-17:32 43%, Guwahati 16:26-16:53 3%)', async () => {
    const aug = eclipses.find((e) => e.kind === 'solar' && e.at.getUTCMonth() === 7)!;
    const table = [
      { name: 'Delhi', lat: 28.6139, lon: 77.209, from: '15:54', to: '17:03', pct: 17 },
      { name: 'Mumbai', lat: 19.076, lon: 72.8777, from: '15:47', to: '17:32', pct: 43 },
      { name: 'Guwahati', lat: 26.1445, lon: 91.7362, from: '16:26', to: '16:53', pct: 3 },
    ];
    const c = await classifyEclipse(aug, table, 'india');
    for (const row of table) {
      const l = c.local.find((x) => x.place.name === row.name)!;
      expect(l.visible).toBe(true);
      expect(Math.abs(minutes(IST(l.fromAt!)) - minutes(row.from))).toBeLessThanOrEqual(2);
      expect(Math.abs(minutes(IST(l.toAt!)) - minutes(row.to))).toBeLessThanOrEqual(2);
      expect(Math.abs(l.magnitude! * 100 - row.pct)).toBeLessThanOrEqual(1.5);
      // Sutak: 12 hours (4 prahar) before local first contact.
      const s = c.sutak.find((x) => x.place === row.name)!;
      expect(l.fromAt!.getTime() - s.fromAt.getTime()).toBe(12 * 3_600_000);
    }
  });

  it('uses the reader\'s own place when given: the 2 Aug eclipse is not seen from Sydney', async () => {
    const aug = eclipses.find((e) => e.kind === 'solar' && e.at.getUTCMonth() === 7)!;
    const c = await classifyEclipse(aug, [{ name: 'Sydney', lat: -33.87, lon: 151.21 }], 'reader');
    expect(c.class).toBe('not_visible');
    expect(c.scope).toBe('reader');
    expect(c.personalTrigger).toBe(false);
  });
});

describe('a contact below the horizon', () => {
  it('Madrid, 28 Aug 2026: the Moon sets during the partial lunar eclipse, so it is a Grahan seen until moonset', async () => {
    const [e] = (await eclipsesBetween(new Date('2026-08-27T00:00:00Z'), new Date('2026-08-29T00:00:00Z'))).filter((x) => x.kind === 'lunar');
    const c = await classifyEclipse(e!, [{ name: 'Madrid', lat: 40.4168, lon: -3.7038 }], 'reader');
    expect(c.class).toBe('grahan');
    const l = c.local[0]!;
    expect(l.fromAt!.toISOString().slice(11, 16)).toBe('02:33');
    expect(l.toAt!.toISOString().slice(11, 16)).toBe('05:44'); // moonset, before the umbral end at 05:52
    expect(c.sutak[0]!.fromAt.getTime()).toBe(l.fromAt!.getTime() - 9 * 3_600_000);
  });
});

describe('no-muhurat periods 2027', () => {
  it('Chaturmas is Devshayani (14 Jul) to the day before Devuthani (10 Nov, drikpanchang Smarta)', () => {
    expect(chaturmasOf(2027)).toEqual({ from: '2027-07-14', to: '2027-11-09' });
    expect(chaturmasOf(2026)).toEqual({ from: '2026-07-25', to: '2026-11-19' });
  });

  it('the scoring keeps the Surya Siddhanta orbs (10 and 11 degrees): Venus and Jupiter cross them on these dates', async () => {
    const ev = await findCombustionEvents(Date.parse('2027-06-01T00:00:00Z'), Date.parse('2027-10-01T00:00:00Z'));
    const day = (planet: string, kind: string) =>
      new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(ev.find((e) => e.planet === planet && e.kind === kind)!.atMs));
    expect(day('Venus', 'combust-in')).toBe('2027-07-06');
    expect(day('Venus', 'combust-out')).toBe('2027-09-17');
    expect(day('Jupiter', 'combust-in')).toBe('2027-08-16');
    expect(day('Jupiter', 'combust-out')).toBe('2027-09-15');
  });
});

describe('facts: closures, decision rows, eclipse blocks, house references', () => {
  let facts: VarshikFacts;
  beforeAll(async () => {
    const { buildVarshikFactsForReader } = await import('../src/modules/reports/generators/varshik-2027.generator.js');
    facts = await buildVarshikFactsForReader({
      name: 'C5',
      birthDate: '1990-03-14',
      birthTime: '09:20',
      place: { lat: 28.61, lon: 77.21, tz: 'Asia/Kolkata' },
      // single, buying a home: the marriage, commitment, move-in and property rows are all shown
      answers: { relationship: 'single', occupation: 'working', home: 'buying_or_building', mainDecision: 'relationship' },
      facts: [],
    });
  }, 600_000);

  it('passes preflight', () => {
    const pre = preflightVarshikFacts(facts);
    expect(pre.failures).toEqual([]);
  });

  it('lists the closures: Asta from drikpanchang\'s published dates (owner 2026-11-09), any part of a day closes it', () => {
    expect(facts.calendar.closures).toEqual([
      { reason: 'kharmas', from: '2027-01-01', to: '2027-01-14' },
      { reason: 'kharmas', from: '2027-03-15', to: '2027-04-14' },
      { reason: 'chaturmas', from: '2027-07-14', to: '2027-11-09' },
      // drik: Venus Tara Asta 21 Jul 05:08 to 9 Sep 19:00; Jupiter 17 Aug 19:32 to 13 Sep 05:22 (IST)
      { reason: 'shukra_asta', from: '2027-07-21', to: '2027-09-09' },
      { reason: 'guru_asta', from: '2027-08-17', to: '2027-09-13' },
      { reason: 'kharmas', from: '2027-12-16', to: '2027-12-31' },
    ]);
  });

  it('weddings keep out of all four periods; move-ins only out of Asta; engagement and property out of none', () => {
    const row = (key: string) => facts.scores.decisionTable.find((d) => d.key === key)!;
    const closed = facts.scores.decisionTable.filter((d) => d.closed);
    expect(closed.map((d) => d.key).sort()).toEqual(['marriage', 'move_home']);

    const marriage = row('marriage');
    expect(new Set(marriage.closures.map((c) => c.reason))).toEqual(new Set(['shukra_asta', 'guru_asta', 'kharmas', 'chaturmas']));
    for (const m of [marriage.best.from, marriage.best.to]) expect([7, 8, 9]).not.toContain(m); // Aug-Oct: under 7 open days

    const move = row('move_home');
    expect(new Set(move.closures.map((c) => c.reason))).toEqual(new Set(['shukra_asta', 'guru_asta']));
    for (const m of [move.best.from, move.best.to]) expect(m).not.toBe(7); // only August is shut by Asta
    expect(move.note).toBe('move_custom');

    const commit = row('commit_relationship');
    expect(commit.closed).toBe(false);
    expect(commit.closures).toEqual([]);
    expect(commit.note).toBe('sagai_custom');

    const property = row('buy_property');
    expect(property).toBeTruthy();
    expect(property.closed).toBe(false);
    expect(property.closures).toEqual([]);
    expect(property.note).toBeNull();

    for (const d of closed) {
      expect(d.ruleSource.every((r) => r === 'panchang')).toBe(true);
      for (const sp of d.openSpans) {
        for (const c of d.closures) expect(sp.from > c.to || sp.to < c.from, `${d.key} ${sp.from}`).toBe(true);
      }
    }
  });

  it('7 to 13 July 2027 is open for a wedding (drik lists 7, 8, 9, 11 and 12 Jul); Chaturmas closes it from 14 July', () => {
    const marriage = facts.scores.decisionTable.find((d) => d.key === 'marriage')!;
    const closedOn = (iso: string) => marriage.closures.some((c) => iso >= c.from && iso <= c.to);
    for (const d of ['2027-07-07', '2027-07-08', '2027-07-09', '2027-07-11', '2027-07-12', '2027-07-13']) expect(closedOn(d), d).toBe(false);
    expect(closedOn('2027-07-14')).toBe(true);
  });

  it('every sky event has a Moon house, every eclipse its block; eclipses default to the India summary', () => {
    for (const e of facts.skyEvents) expect(e.moonHouse).toBeGreaterThanOrEqual(1);
    const ecl = facts.skyEvents.filter((e) => e.kind.startsWith('eclipse'));
    expect(ecl.length).toBe(5);
    expect(ecl.every((e) => e.eclipse)).toBe(true);
    expect(facts.reader.eclipsePlace.scope).toBe('india');
    expect(ecl.filter((e) => e.eclipse!.personalTrigger).map((e) => e.date)).toEqual(['2027-08-02']);
  });

  it('verify: Lagna and Moon references are checked against their own index', () => {
    const index = buildFactIndex(facts);
    const saturn = facts.skyEvents.find((e) => e.planet === 'Saturn')!;
    const ord = (n: number) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;
    const good = `Saturn moves on, the ${ord(saturn.natalHouse)} from your Lagna and the ${ord(saturn.moonHouse)} from your Moon.`;
    expect(c5ClaimHits(good, index)).toEqual([]);
    const wrongMoon = ((saturn.moonHouse % 12) + 1) as number;
    const okAsLagna = facts.skyEvents.some((e) => e.planet === 'Saturn' && e.moonHouse === wrongMoon) || facts.ashtakavarga.transits.some((t) => t.planet === 'Saturn' && t.moonHouse === wrongMoon) || facts.stars.monthStars.some((m) => m.rows.some((r) => r.planet === 'Saturn' && r.houseFromMoon === wrongMoon));
    if (!okAsLagna) {
      expect(c5ClaimHits(`Saturn stands in the ${ord(wrongMoon)} from your Moon.`, index).length).toBe(1);
    }
    expect(c5ClaimHits('Saturn enters Pisces, your 6th house.', index).map((h) => h.text)[0]).toMatch(/Lagna or your Moon/);
  });

  it('verify: no Sutak or trigger for a penumbral or unseen eclipse; no wedding window in a closure', () => {
    const index = buildFactIndex(facts);
    expect(c5ClaimHits('Observe the Sutak before the eclipse on 21 February.', index).length).toBeGreaterThan(0);
    expect(c5ClaimHits('The eclipse on 21 February brings no Sutak.', index)).toEqual([]);
    expect(c5ClaimHits('The eclipse on 17 August stirs your 5th house.', index).length).toBeGreaterThan(0);
    expect(c5ClaimHits('Sutak for the eclipse on 2 August starts early that morning.', index)).toEqual([]);
    expect(c5ClaimHits('August is the best month for the wedding.', index).length).toBeGreaterThan(0);
    expect(c5ClaimHits('The best time for the wedding is 20 August.', index).length).toBeGreaterThan(0);
    expect(c5ClaimHits('Hold the wedding until Venus is out of combustion on 9 September.', index)).toEqual([]);
    expect(c5ClaimHits('The best time for the wedding is 20 November.', index)).toEqual([]);
    // Move-ins: only Asta closes them. Engagement and property: nothing does.
    expect(c5ClaimHits('The best time for moving into a new home is 20 August.', index).length).toBeGreaterThan(0);
    expect(c5ClaimHits('The best time for moving into a new home is 20 December.', index)).toEqual([]);
    expect(c5ClaimHits('The best time for an engagement is 20 August.', index)).toEqual([]);
    expect(c5ClaimHits('August is a good month to buy property.', index)).toEqual([]);
  });
});
