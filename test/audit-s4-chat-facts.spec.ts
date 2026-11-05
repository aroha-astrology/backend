import { describe, it, expect } from 'vitest';
import {
  calculateChart,
  calculateVimshottariDasha,
  calculateYoginiDasha,
  detectAllYogas,
  calculateAshtakavarga,
} from '../src/lib/astro-engine/index.js';
import { analyzeAllDoshasAt } from '../src/lib/astro-engine/doshas/index.js';
import { buildGroundingFacts, doshaFacts } from '../src/lib/chat-grounding.js';

// Audit Sprint 4: M2 (no flat "severe"), M3 (Saturn's bindus in the sign it transits), M4 (Lagna
// lord, 3rd house, Mercury/Rahu/Ketu), M5 (Dhaiya themes, read from the Moon), M10 (Yogini by date).

// Leo Moon, Aquarius rising, Ashtama Shani active (Saturn in Pisces).
const [y, m, d, h, mi, tz, lat, lon] = [1990, 1, 15, 10, 0, 5.5, 28.61, 77.21];
const NOW = new Date('2026-11-04T06:00:00Z');

async function leoFacts(dashaAsOf: Date = NOW) {
  const chart = await calculateChart(y, m, d, h, mi, tz, lat, lon);
  const moon = chart.planets.find((p) => p.planet === 'Moon')!;
  const birth = new Date(Date.UTC(y, m - 1, d, h, mi) - tz * 3600e3);
  // As stored in the DB: dates as text, "current" flags frozen at the build date.
  const dasha = JSON.parse(
    JSON.stringify({
      vimshottari: calculateVimshottariDasha(moon.longitude, birth),
      yogini: calculateYoginiDasha(moon.longitude, birth, dashaAsOf),
    }),
  );
  const ashtakavarga = calculateAshtakavarga(chart);
  const doshas = await analyzeAllDoshasAt(chart, NOW);
  const facts = await buildGroundingFacts(
    {
      chart: chart as unknown as Record<string, unknown>,
      dasha,
      yogas: { yogas: detectAllYogas(chart) },
      doshas: doshas as unknown as Record<string, unknown>,
      ashtakavarga: ashtakavarga as unknown as Record<string, unknown>,
      timeZone: 'Asia/Kolkata',
    },
    undefined,
    NOW,
  );
  return { chart, moon, birth, ashtakavarga, facts };
}

describe('M4: every house lord, the Lagna lord named, all nine placements', () => {
  it('states the 1st house as the Lagna lord with its placement, and the 3rd house', async () => {
    const { facts } = await leoFacts();
    expect(facts).toContain(
      '1st house (self, body, overall direction) sign: Aquarius, lord: Saturn (the Lagna lord)',
    );
    expect(
      facts.some((f) =>
        f.startsWith('3rd house (siblings, courage, effort, short travel) sign: Aries, lord: Mars'),
      ),
    ).toBe(true);
    expect(
      facts.some((f) =>
        /^Saturn \(Lagna lord\) is natally placed in house 11 \(Sagittarius\)/.test(f),
      ),
    ).toBe(true);
    for (const p of ['Mercury', 'Rahu', 'Ketu']) {
      expect(
        facts.some((f) => f.startsWith(`${p} is natally in house `)),
        p,
      ).toBe(true);
    }
  });
});

describe('M5: Dhaiya themes, and Saturn read from the Moon', () => {
  it('the Dhaiya line carries the 8th-from-Moon themes', async () => {
    const { facts } = await leoFacts();
    const dhaiya = facts.find((f) => f.startsWith('Shani Dhaiya: ACTIVE'))!;
    expect(dhaiya).toContain('health, sudden obstacles and long-held plans');
    expect(dhaiya).not.toContain('home, mother');
  });

  it('says once which frame to use: the Moon for Saturn results, the Lagna only for a house question', async () => {
    const { facts } = await leoFacts();
    const rule = facts.filter((f) => f.startsWith('How to read Saturn:'));
    expect(rule).toHaveLength(1);
    expect(rule[0]).toContain('8th from the natal Moon');
    expect(rule[0]).toContain('2nd from the Lagna');
    expect(rule[0]).toMatch(/only for a question about that house/);
  });
});

describe('M2/M3: what softens or sharpens the Saturn transit', () => {
  it("states Saturn's own bindus and the Sarva in the sign it transits, its dignity and Lagna role", async () => {
    const { facts, ashtakavarga } = await leoFacts();
    const satBav = ashtakavarga.bhinna.find((b) => b.planet === 'Saturn')!.bindus;
    const line = facts.find((f) => f.startsWith('Saturn transit strength:'))!;
    expect(line).toBeDefined();
    expect(line).toContain(
      `Pisces (where Saturn is now): Saturn's own bindus ${satBav[11]} of 8, Sarva ${ashtakavarga.sarva.bindus[11]}`,
    );
    expect(line).toContain('neutral sign for Saturn');
    expect(line).toMatch(/Saturn is the Lagna lord for Aquarius rising/);
    expect(line).toMatch(/5 or more of 8/);
    expect(line).toMatch(/above 28/);
  });

  it('a peak Sade Sati no longer reads "severe severity"', () => {
    const peak = {
      active: true,
      phase: 'peak',
      severity: 'severe',
      saturnSign: 'Pisces',
      moonSign: 'Pisces',
      startDate: '2025-03-29T00:00:00Z',
      endDate: '2032-06-01T00:00:00Z',
      stays: [],
    };
    const line = doshaFacts({ sadeSati: peak }, 'Asia/Kolkata')[0]!;
    expect(line).not.toMatch(/severe/);
    expect(line).toContain('traditionally the hardest phase');
  });

  it('names which Sade Sati of life it is when the engine gives the cycle', () => {
    const line = doshaFacts(
      {
        sadeSati: {
          active: false,
          phase: 'none',
          severity: 'none',
          saturnSign: 'Pisces',
          moonSign: 'Leo',
          next: { startDate: '2034-08-01T00:00:00Z', endDate: '2041-10-01T00:00:00Z', cycle: 2 },
        },
      },
      'Asia/Kolkata',
    )[0]!;
    expect(line).toContain('the 2nd Sade Sati of this life');
  });
});

describe('M10: Yogini dasha resolved by date', () => {
  it('names the Yogini running today, not the one frozen when the chart was built', async () => {
    const built2000 = new Date('2000-06-01T00:00:00Z');
    const { facts, moon, birth } = await leoFacts(built2000);
    const live = calculateYoginiDasha(moon.longitude, birth, NOW);
    const frozen = calculateYoginiDasha(moon.longitude, birth, built2000);
    expect(live.currentYogini.deity).not.toBe(frozen.currentYogini.deity); // the test only bites if they differ
    const activeAntar = live.currentYogini.subPeriods.find((s) => s.isActive)!;
    const line = facts.find((f) => f.startsWith('Concurrent Yogini Dasha'))!;
    expect(line).toContain(`${live.currentYogini.deity} (${live.currentYogini.planet})`);
    expect(line).toContain(`${activeAntar.deity} Yogini sub-period`);
  });
});

describe('M2/M4: the prompt says to weigh the Saturn strength line', () => {
  it('chat and voice both carry the rule', async () => {
    const { buildChatMessages, buildVoiceSystemInstruction } =
      await import('../src/lib/swarm/agents/scholar.js');
    const { newState } = await import('../src/lib/swarm/state.js');
    const chat = buildChatMessages(newState({ requestId: 's4' }), 'q', ['x'])[0]!.content;
    const voice = buildVoiceSystemInstruction({ groundingFacts: ['x'] });
    for (const prompt of [chat, voice]) {
      expect(prompt).toContain('"Saturn transit strength" line');
      expect(prompt).toContain('Never call it uniformly "severe"');
    }
  });
});
