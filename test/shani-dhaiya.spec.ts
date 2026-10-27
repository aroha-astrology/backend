import { describe, it, expect } from 'vitest';
import {
  detectRealDhaiya,
  detectRealSadeSati,
  mergeDhaiyaWindows,
  buildSaturnPhaseTimeline,
} from '../src/lib/astro-engine/doshas/saturnPhaseTimeline.js';
import { detectCurrentDhaiya } from '../src/lib/astro-engine/doshas/dhaiya.js';
import { detectCurrentSadeSati } from '../src/lib/astro-engine/doshas/sadeSati.js';
import { withLiveSaturnTransits } from '../src/modules/kundli/kundli.service.js';
import { doshaFacts } from '../src/lib/chat-grounding.js';
import { computeDoshaYogaSummary } from '../src/lib/astro-engine/reports/report-dosha-yoga-summary.js';
import { buildSaturnPhaseAlertCopy } from '../src/modules/cron/saturn-phase-alert.service.js';

// Shani Dhaiya (Saturn in the 4th or 8th sign from the Moon), checked against almanac dates.
// AstroSage (astrosage.com/sadesati/leo.asp, virgo.asp, taurus.asp) and PanchangBodh list Leo's
// Dhaiya as two stays, 29/30 Mar 2025 - 2/3 Jun 2027 and 20 Oct 2027 - 23 Feb 2028, with Saturn in
// Aries (Virgo's 8th) in between. The app used to join the two into one unbroken Dhaiya, so from
// June to October 2027 it called both Leo and Virgo "in Dhaiya", and chat had no Dhaiya fact at all.

const LEO = 4;
const VIRGO = 5;
const SCORPIO = 7;
const ist = (d: Date | null | undefined) =>
  d ? new Date(d.getTime() + 5.5 * 3_600_000).toISOString().slice(0, 10) : null;
const at = (s: string) => new Date(`${s}T06:00:00Z`);

describe('Dhaiya stays and breaks (live ephemeris vs almanacs)', () => {
  it("keeps Leo's 2025-28 Dhaiya as two stays with the 2027 retrograde break", async () => {
    const timeline = await buildSaturnPhaseTimeline(LEO, new Date('2024-06-01'), new Date('2029-01-01'));
    const [window] = mergeDhaiyaWindows(timeline);
    expect(window!.phase).toBe('dhaiya-8th');
    expect(window!.stays.map((s) => [ist(s.startDate), ist(s.endDate)])).toEqual([
      ['2025-03-29', '2027-06-03'],
      ['2027-10-20', '2028-02-23'],
    ]);
  });

  it('is not active for Leo while Saturn is in Aries, and says when it resumes', async () => {
    const r = await detectRealDhaiya(LEO, at('2027-08-01'));
    expect(r.active).toBe(false);
    expect(r.phase).toBe('none');
    expect(ist(r.resumesOn)).toBe('2027-10-20');
    expect(ist(r.window?.endDate)).toBe('2028-02-23');
  });

  it('gives that same stretch to Virgo (Aries is its 8th), so only one sign holds it', async () => {
    const r = await detectRealDhaiya(VIRGO, at('2027-08-01'));
    expect(r.active).toBe(true);
    expect(r.phase).toBe('dhaiya-8th');
    // AstroSage virgo.asp: 3 Jun 2027 - 19 Oct 2027, 24 Feb 2028 - 7 Aug 2029, 6 Oct 2029 - 16 Apr 2030.
    expect(r.window!.stays.map((s) => ist(s.startDate))).toEqual(['2027-06-03', '2028-02-23', '2029-10-05']);
  });

  it("keeps Scorpio's 2041 Sade Sati whole across a 7-month retrograde gap", async () => {
    // AstroSage: Saturn in Libra 28 Jan - 5 Feb 2041, back in Virgo until 25 Sep 2041. The old
    // 200-day bridge cut this Sade Sati down to one week.
    const r = await detectRealSadeSati(SCORPIO, at('2026-10-27'), 9, 33);
    expect(ist(r.next?.startDate)).toBe('2041-01-29');
    expect(ist(r.next?.endDate)).toBe('2049-12-04');
  });
});

describe('detectCurrentDhaiya', () => {
  it('names Leo in 2026 as Ashtama Shani with real dates and the break', async () => {
    const d = await detectCurrentDhaiya('Leo', at('2026-10-27'));
    expect(d).toMatchObject({ active: true, phase: '8th', name: 'Ashtama Shani', saturnSign: 'Pisces' });
    expect(d.description).toContain('from 2025-03-29 to 2028-02-23');
    expect(d.description).toContain('from 2027-06-03 to 2027-10-20');
  });

  it('names Sagittarius in 2026 as Kantaka Shani (4th)', async () => {
    const d = await detectCurrentDhaiya('Sagittarius', at('2026-10-27'));
    expect(d).toMatchObject({ active: true, phase: '4th', name: 'Kantaka Shani' });
  });

  it('gives the next one for a sign not in Dhaiya (Virgo: 8th from 3 Jun 2027)', async () => {
    const d = await detectCurrentDhaiya('Virgo', at('2026-10-27'));
    expect(d.active).toBe(false);
    expect(d.next?.phase).toBe('8th');
    expect(ist(d.next?.startDate)).toBe('2027-06-03');
  });
});

describe('Sade Sati dates', () => {
  it("writes India's calendar date: Taurus begins on 3 Jun 2027 (06:17 IST), not 2 Jun", async () => {
    const s = await detectCurrentSadeSati('Taurus', at('2027-07-01'));
    expect(s.active).toBe(true);
    expect(s.description).toContain('from 2027-06-03');
  });

  it('is not active on a retrograde break and gives the return date (Taurus, Nov 2027)', async () => {
    const s = await detectCurrentSadeSati('Taurus', at('2027-11-15'));
    expect(s.active).toBe(false);
    expect(ist(s.resumesOn ?? null)).toBe('2028-02-23');
  });
});

describe('the read path adds Dhaiya to every kundli', () => {
  it('withLiveSaturnTransits adds a live dhaiya even to a kundli saved before it existed', async () => {
    const saved = { sadeSati: { active: false, phase: 'none', moonSign: 'Leo', saturnSign: 'Aries' } };
    const live = await withLiveSaturnTransits(saved, at('2026-10-27'));
    expect(live?.dhaiya).toMatchObject({ active: true, phase: '8th' });
  });
});

describe('chat facts', () => {
  it('gives chat a dated Dhaiya line counted from the Moon, and dates on Sade Sati', async () => {
    const doshas = await withLiveSaturnTransits(
      { sadeSati: { active: false, phase: 'none', moonSign: 'Leo', saturnSign: 'Pisces' } },
      at('2026-10-27'),
    );
    const facts = doshaFacts(doshas, 'Asia/Kolkata');
    const dhaiya = facts.find((f) => f.startsWith('Shani Dhaiya:'))!;
    expect(dhaiya).toContain('ACTIVE');
    expect(dhaiya).toContain('8th from the Moon');
    expect(dhaiya).toContain('29 Mar 2025 to 23 Feb 2028');
    expect(dhaiya).toContain('3 Jun 2027 to 20 Oct 2027');
    expect(dhaiya).toContain('never from the Lagna');
    expect(facts.find((f) => f.startsWith('Sade Sati:'))).toContain('the next Sade Sati runs 13 Jul 2034');
  });

  it('dates an active Sade Sati (Pisces, peak)', async () => {
    const doshas = await withLiveSaturnTransits(
      { sadeSati: { active: false, phase: 'none', moonSign: 'Pisces', saturnSign: 'Pisces' } },
      at('2026-10-27'),
    );
    const line = doshaFacts(doshas, 'Asia/Kolkata').find((f) => f.startsWith('Sade Sati:'))!;
    expect(line).toContain('peak phase');
    expect(line).toContain('runs 29 Apr 2022 to 17 Apr 2030');
  });
});

describe('reports and push alerts', () => {
  it('lists a running Dhaiya among a report’s cautions', () => {
    const { cautions } = computeDoshaYogaSummary(
      { dhaiya: { active: true, name: 'Ashtama Shani', phase: '8th', severity: 'moderate' } },
      null,
      ['dhaiya'],
      [],
    );
    expect(cautions).toEqual([
      { label: 'Shani Dhaiya', detail: 'Ashtama Shani, Saturn in the 8th sign from the Moon, moderate severity' },
    ]);
  });

  it('calls a step out on a retrograde a pause, not an end', () => {
    const copy = buildSaturnPhaseAlertCopy('dhaiya-8th', 'none', {
      resumesOn: new Date('2027-10-20T00:47:00Z'),
      windowEnd: new Date('2028-02-23T14:22:00Z'),
    });
    expect(copy?.title).toBe('Your Saturn Dhaiya pauses for a while');
    expect(copy?.body).toContain('20 Oct 2027');
    expect(copy?.body).toContain('23 Feb 2028');
  });

  it('calls the return the last stretch, not a fresh 2.5 years', () => {
    const copy = buildSaturnPhaseAlertCopy('none', 'dhaiya-8th', { isReturn: true });
    expect(copy?.title).toBe('Your Saturn Dhaiya resumes');
    expect(copy?.body).not.toContain('2.5 years');
  });

  it('does not say "Your Sade Sati begins" when Saturn steps back from the Moon sign', () => {
    const copy = buildSaturnPhaseAlertCopy('sade-sati-peak', 'sade-sati-rising');
    expect(copy?.title).toBe('Sade Sati: Saturn steps back');
  });

  it('still says ended when there is no return', () => {
    expect(buildSaturnPhaseAlertCopy('dhaiya-4th', 'none')?.title).toBe('Your Saturn Dhaiya has ended');
  });
});
