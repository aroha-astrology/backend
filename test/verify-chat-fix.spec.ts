import { describe, it, expect } from 'vitest';
import {
  calculateChart,
  calculateVimshottariDasha,
  detectAllYogas,
  calculateAshtakavarga,
} from '../src/lib/astro-engine/index.js';
import { analyzeAllDoshas } from '../src/lib/astro-engine/doshas/index.js';
import { buildGroundingFacts, type GroundingSource } from '../src/lib/chat-grounding.js';
import { buildChatMessages } from '../src/lib/swarm/agents/scholar.js';
import { newState } from '../src/lib/swarm/state.js';

/**
 * End-to-end verification (not a permanent regression test — exercises the
 * REAL kundli computation + grounding + prompt-assembly pipeline against a
 * real birth chart, printing the actual output for manual inspection) that
 * the childbirth-hallucination fix produces correct, complete, dated grounding
 * and the right system-prompt instructions for the exact reported question.
 */
describe('verify: childbirth chat-fix end-to-end', () => {
  it('produces complete, correctly-dated grounding facts and prompt instructions', async () => {
    // Aarav fixture (real stress-test birth data): 1985-03-12, 04:32 IST, Mumbai.
    const chart = await calculateChart(1985, 3, 12, 4, 32, 5.5, 19.076, 72.8777);
    const moon = chart.planets.find((p) => p.planet === 'Moon')!;
    const saturn = chart.planets.find((p) => p.planet === 'Saturn')!;
    const birthDate = new Date(Date.UTC(1985, 2, 11, 23, 2)); // 04:32 IST -> UTC
    const vimshottari = calculateVimshottariDasha(moon.longitude, birthDate);
    const yogas = { yogas: detectAllYogas(chart) };
    const doshas = analyzeAllDoshas(chart, saturn.longitude);
    const ashtakavarga = calculateAshtakavarga(chart);

    const src: GroundingSource = {
      chart: chart as unknown as Record<string, unknown>,
      dasha: { vimshottari },
      yogas: yogas,
      doshas: doshas as unknown as Record<string, unknown>,
      ashtakavarga: ashtakavarga as unknown as Record<string, unknown>,
    };

    const now = new Date(); // real "today"
    const facts = await buildGroundingFacts(src, undefined, now);

    console.log('=== FACT COUNT ===', facts.length);
    console.log('=== FIRST FACT (must be date anchor) ===\n', facts[0]);

    // 1. Date anchor is present and first, with TODAY'S real date.
    const todayIST = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    expect(facts[0]).toContain(todayIST);
    expect(facts[0]).toMatch(/^TODAY'S DATE:/);

    // 2. D7 (progeny) varga data is present -- the actual root-cause gap.
    const d7Fact = facts.find((f) => f.startsWith('D7 '));
    console.log('=== D7 fact ===\n', d7Fact);
    expect(d7Fact).toBeDefined();
    expect(d7Fact).toContain('children');

    // 3. All 24 vargas present.
    const vargaKeys = [
      'D1',
      'D2',
      'D3',
      'D4',
      'D5',
      'D6',
      'D7',
      'D8',
      'D9',
      'D10',
      'D11',
      'D12',
      'D14',
      'D16',
      'D20',
      'D21',
      'D24',
      'D27',
      'D30',
      'D40',
      'D45',
      'D60',
      'D81',
      'D108',
    ];
    for (const k of vargaKeys) {
      expect(
        facts.some((f) => f.startsWith(`${k} (`)),
        `missing varga ${k}`,
      ).toBe(true);
    }

    // 4. All 14 domain confidence facts present (not just career/love/health).
    const domainLabels = [
      'Career Window Confidence',
      'Relationship Window Confidence',
      'Health Vigilance Required',
      'Progeny Window Confidence',
      'Wealth Window Confidence',
      'Education Window Confidence',
      'Property/Home Window Confidence',
      'Vehicle Window Confidence',
      'Siblings Window Confidence',
      'Parents Window Confidence',
      'Legal/Dispute Window Confidence',
      'Foreign Travel/Relocation Window Confidence',
      'Spirituality Window Confidence',
      'Business/Partnership Window Confidence',
    ];
    for (const label of domainLabels) {
      expect(
        facts.some((f) => f.startsWith(label)),
        `missing domain fact ${label}`,
      ).toBe(true);
    }
    const progenyFact = facts.find((f) => f.startsWith('Progeny Window Confidence'));
    console.log('=== Progeny Window Confidence fact ===\n', progenyFact);

    // 5. Jaimini points + Chandra/Surya Kundali + full Gochar present.
    expect(facts.some((f) => f.startsWith('Arudha Lagna'))).toBe(true);
    expect(facts.some((f) => f.startsWith('Upapada Lagna'))).toBe(true);
    expect(facts.some((f) => f.startsWith('Atmakaraka'))).toBe(true);
    expect(facts.some((f) => f.startsWith('Chandra Kundali'))).toBe(true);
    expect(facts.some((f) => f.startsWith('Surya Kundali'))).toBe(true);
    expect(facts.some((f) => f.startsWith('Full Gochar'))).toBe(true);

    // 6. Fact block fits comfortably under the raised MAX_CONTEXT_CHARS cap
    // (24000) -- nothing silently truncated (Trap B from the plan).
    const chartDataBlockChars = facts.map((f) => `- ${f}`).join('\n').length;
    console.log('=== Total CHART DATA block size (chars) ===', chartDataBlockChars);
    expect(chartDataBlockChars).toBeLessThan(24000);

    // 7. Build the ACTUAL messages array scholarStream sends to Gemini, for
    // the exact reported question.
    const state = newState({ requestId: 'verify' });
    const messages = buildChatMessages(
      state,
      'Child birth is when as per charts',
      facts,
      false,
      'direct',
      'en',
      [],
      now,
    );
    const systemPromptContent = messages[0]!.content;
    console.log('=== SYSTEM PROMPT length (chars) ===', systemPromptContent.length);

    expect(systemPromptContent).toContain(`Today is ${todayIST}`);
    expect(systemPromptContent).toContain("Never invent or presume the user's life circumstances");
    expect(systemPromptContent).toContain('legitimate accuracy check');
    expect(systemPromptContent).toContain('STRONGEST FIRST');
    expect(systemPromptContent).toContain('not deflection and not a hedge');
    expect(systemPromptContent.replace(/\s+/g, ' ')).toContain(
      'are you currently planning for a child',
    );

    console.log('=== TEMPORAL_ANCHOR (tail of prompt) ===\n', systemPromptContent.slice(-900));
  });
});
