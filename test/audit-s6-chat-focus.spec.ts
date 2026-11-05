import { describe, it, expect } from 'vitest';
import {
  calculateChart,
  calculateVimshottariDasha,
  calculateYoginiDasha,
  detectAllYogas,
  calculateAshtakavarga,
} from '../src/lib/astro-engine/index.js';
import { analyzeAllDoshasAt } from '../src/lib/astro-engine/doshas/index.js';
import { buildGroundingSections, assembleChatFacts } from '../src/lib/chat-grounding.js';
import { chatFocusFor } from '../src/lib/chat-focus.js';
import { classifyQuestionAreas } from '../src/lib/intelligence/question-area.js';

// Audit Sprint 6, O2: send only the divisional charts and window lines the question needs.
// Measured 2026-11-05 on three test charts: 24 vargas = ~4,500 chars, the other reference lines
// ~1,700, the 15 timing-domain lines ~11,700 (of ~89,000 chars sent per chat turn).

describe('classifyQuestionAreas: every area a question touches, not only the first', () => {
  it('finds career and relocation in one question', () => {
    expect(classifyQuestionAreas('When will I get a job abroad?')).toEqual(
      expect.arrayContaining(['career', 'relocation']),
    );
  });
  it('is empty when nothing matches', () => {
    expect(classifyQuestionAreas('Tell me about my chart')).toEqual([]);
  });
});

describe('chatFocusFor', () => {
  it('career question: career + business windows, D10 + the always-kept D1/D9, not health vargas', () => {
    const f = chatFocusFor('When will I get a job?')!;
    expect([...f.domains].sort()).toEqual(['business', 'career']);
    for (const v of ['D1', 'D9', 'D10']) expect(f.vargas.has(v)).toBe(true);
    expect(f.vargas.has('D30')).toBe(false);
  });
  it('marriage question: relationship window and D7/D9', () => {
    const f = chatFocusFor('Will my marriage be happy?')!;
    expect(f.domains.has('love')).toBe(true);
    expect(f.domains.has('career')).toBe(false);
    expect(f.vargas.has('D7')).toBe(true);
  });
  it('reads Hindi in roman and native script', () => {
    expect(chatFocusFor('meri naukri kab lagegi')!.domains.has('career')).toBe(true);
    expect(chatFocusFor('शादी कब होगी')!.domains.has('love')).toBe(true);
  });
  it('a question touching two areas keeps both', () => {
    const f = chatFocusFor('When will I get a job abroad?')!;
    expect(f.domains.has('career')).toBe(true);
    expect(f.domains.has('foreign')).toBe(true);
  });
  it('falls back to everything when the message names no area', () => {
    expect(chatFocusFor('and when will that happen?')).toBeNull();
    expect(chatFocusFor('Tell me about my life')).toBeNull();
    expect(chatFocusFor('yes')).toBeNull();
  });
  it('falls back to everything when the reader names a divisional chart or a chart table', () => {
    expect(chatFocusFor('What does my D9 say about my career?')).toBeNull();
    expect(chatFocusFor('Explain my navamsa and job prospects')).toBeNull();
    expect(chatFocusFor('How many bindus does Saturn have for my career?')).toBeNull();
  });
  it('falls back to everything for a broad question across many areas', () => {
    expect(chatFocusFor('Tell me about my career, marriage, health, money and family')).toBeNull();
  });
});

const NOW = new Date('2026-11-05T06:00:00Z');
async function leoSource() {
  const [y, m, d, h, mi, tz, lat, lon] = [1990, 1, 15, 10, 0, 5.5, 28.61, 77.21];
  const chart = await calculateChart(y, m, d, h, mi, tz, lat, lon);
  const moon = chart.planets.find((p) => p.planet === 'Moon')!;
  const birth = new Date(Date.UTC(y, m - 1, d, h, mi) - tz * 3600e3);
  const dasha = JSON.parse(
    JSON.stringify({
      vimshottari: calculateVimshottariDasha(moon.longitude, birth),
      yogini: calculateYoginiDasha(moon.longitude, birth, NOW),
    }),
  );
  return {
    chart: chart as unknown as Record<string, unknown>,
    dasha,
    yogas: { yogas: detectAllYogas(chart) },
    doshas: (await analyzeAllDoshasAt(chart, NOW)) as unknown as Record<string, unknown>,
    ashtakavarga: calculateAshtakavarga(chart) as unknown as Record<string, unknown>,
    timeZone: 'Asia/Kolkata',
  };
}
const size = (l: string[]) => l.reduce((n, x) => n + x.length + 3, 0);
const domainLines = (l: string[]) => l.filter((x) => /\(cross-read with D\d+\)/.test(x));
const vargaLines = (l: string[]) => l.filter((x) => /^D\d+ \(/.test(x));

describe('buildGroundingSections with a focus', () => {
  it('without a focus nothing changes: 15 window lines and 24 vargas', async () => {
    const s = await buildGroundingSections(await leoSource(), undefined, NOW);
    expect(domainLines(s.core)).toHaveLength(15);
    expect(vargaLines(s.reference)).toHaveLength(24);
  });

  it('career focus: only the focused window lines and vargas, plus a note saying the rest is left out', async () => {
    const src = await leoSource();
    const focus = chatFocusFor('When will I get a job?')!;
    const sink = { windows: [] as Array<{ domain: string }> };
    const s = await buildGroundingSections(src, undefined, NOW, null, sink as never, 'full', focus);
    expect(domainLines(s.core)).toHaveLength(2);
    expect(domainLines(s.core).some((l) => l.startsWith('Career Window Confidence'))).toBe(true);
    const keptVargas = vargaLines(s.reference).map((l) => /^(D\d+)/.exec(l)![1]);
    expect(keptVargas).toEqual(expect.arrayContaining(['D1', 'D9', 'D10']));
    expect(keptVargas).not.toContain('D30');
    expect(keptVargas.length).toBeLessThan(10);
    // Predictions are recorded only for what the model was shown.
    expect(new Set(sink.windows.map((w) => w.domain))).toEqual(new Set(['career', 'business']));
    // The model is told what is missing, so it never invents a window for another area.
    expect(s.core.some((l) => /left out of this reply/i.test(l))).toBe(true);
  });

  it('keeps every non-window, non-varga fact exactly as it was', async () => {
    const src = await leoSource();
    const full = await buildGroundingSections(src, undefined, NOW);
    const focus = chatFocusFor('Will my marriage be happy?')!;
    const cut = await buildGroundingSections(src, undefined, NOW, null, undefined, 'full', focus);
    const keep = (l: string) => !/\(cross-read with D\d+\)/.test(l);
    const coreFull = full.core.filter(keep);
    const coreCut = cut.core.filter((l) => keep(l) && !/left out of this reply/i.test(l));
    expect(coreCut).toEqual(coreFull);
    expect(cut.live).toEqual(full.live);
  });

  it('shrinks the chat block by well over 10,000 characters for a career question', async () => {
    const src = await leoSource();
    const full = assembleChatFacts(await buildGroundingSections(src, undefined, NOW));
    const focus = chatFocusFor('When will I get a job?')!;
    const cut = assembleChatFacts(
      await buildGroundingSections(src, undefined, NOW, null, undefined, 'full', focus),
    );

    console.log(`O2 career: ${size(full)} -> ${size(cut)} chars (-${size(full) - size(cut)})`);
    expect(size(full) - size(cut)).toBeGreaterThan(10_000);
  });
});
