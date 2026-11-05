import { describe, it, expect } from 'vitest';
import {
  calculateChart,
  calculateVimshottariDasha,
  detectAllYogas,
  calculateAshtakavarga,
} from '../src/lib/astro-engine/index.js';
import { analyzeAllDoshas } from '../src/lib/astro-engine/doshas/index.js';
import {
  buildGroundingFacts,
  buildGroundingSections,
  assembleChatFacts,
  CHAT_CONTEXT_MAX_CHARS,
  type GroundingSource,
} from '../src/lib/chat-grounding.js';
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

    // 6. Fact block fits comfortably under the MAX_CONTEXT_CHARS cap (28000 —
    // scholar.ts's clip() applies this ceiling to <astro_context> and
    // <user_facts> INDEPENDENTLY, each getting the full budget, not a
    // combined one). Threshold raised 24000 -> 26000 here: scoreDomainWindows's
    // nearTerm path (chat-grounding.ts) now scores genuinely near windows,
    // which more often fall inside the ~13-month transit-relevance check and
    // so more often carry real (non-empty) transit reasoning text than the
    // old unbounded search's far antardasha-tier windows did — a deliberate,
    // informative growth, not bloat. 26000 keeps a real 2000-char margin
    // below the actual clip() ceiling rather than pinning the exact number.
    // Raised again 26000 -> 34000 with MAX_CONTEXT_CHARS 28000 -> 36000, when the
    // UPCOMING TRANSITS block (~5,000 chars of dated sign and nakshatra changes)
    // joined the facts; same 2000-char margin below the new ceiling.
    const chartDataBlockChars = facts.map((f) => `- ${f}`).join('\n').length;
    console.log('=== Total CHART DATA block size (chars) ===', chartDataBlockChars);
    expect(chartDataBlockChars).toBeLessThan(34000);

    // 7. Build the ACTUAL messages array scholarStream sends to Gemini, for
    // the exact reported question.
    const state = newState({ requestId: 'verify' });
    const messages = buildChatMessages(
      state,
      'Child birth is when as per charts',
      facts,
      false,
      'en',
      [],
      now,
    );
    const systemPromptContent = messages[0]!.content;
    console.log('=== SYSTEM PROMPT length (chars) ===', systemPromptContent.length);

    expect(systemPromptContent).toContain(`formatted as ${todayIST}, on the user's own clock, IST`);
    expect(systemPromptContent).toContain("Never invent or presume the user's life circumstances");
    expect(systemPromptContent).toContain('legitimate accuracy check');
    expect(systemPromptContent).toContain('CURRENT/NEXT/THEN');
    expect(systemPromptContent).toContain('not deflection and not a hedge');
    expect(systemPromptContent.replace(/\s+/g, ' ')).toContain(
      'are you currently planning for a child',
    );

    console.log('=== TEMPORAL_ANCHOR (tail of prompt) ===\n', systemPromptContent.slice(-900));
  });

  // Audit M1: with a second chart and a match report attached, the flat block went past the
  // 36,000-character cut and the reader's relocation and purchase facts at its tail were silently
  // dropped. The full composite block must keep every account and per-message fact, put the fixed
  // parts first (so a prompt cache can reuse them) and give up the least-used varga lines instead.
  it('keeps the whole composite block: second chart + match report + relocation + purchases', async () => {
    const chart = await calculateChart(1985, 3, 12, 4, 32, 5.5, 19.076, 72.8777);
    const moon = chart.planets.find((p) => p.planet === 'Moon')!;
    const saturn = chart.planets.find((p) => p.planet === 'Saturn')!;
    const vimshottari = calculateVimshottariDasha(
      moon.longitude,
      new Date(Date.UTC(1985, 2, 11, 23, 2)),
    );
    const src: GroundingSource = {
      chart: chart as unknown as Record<string, unknown>,
      dasha: { vimshottari },
      yogas: { yogas: detectAllYogas(chart) },
      doshas: analyzeAllDoshas(chart, saturn.longitude) as unknown as Record<string, unknown>,
      ashtakavarga: calculateAshtakavarga(chart) as unknown as Record<string, unknown>,
    };
    const now = new Date();
    const sections = await buildGroundingSections(src, undefined, now);

    const lines = (tag: string, n: number) =>
      Array.from({ length: n }, (_, i) => `${tag} ${i + 1}: ${'detail '.repeat(28)}`);
    const PROFILE = 'User profile: gender female, relationship status married';
    const PURCHASE = 'The user ALREADY PURCHASED the Career Report (read it on 2 Oct 2026)';
    const PANCHANG = "Today's Panchang: Tithi Panchami";
    const RELOCATION = 'Relocation scan: Bengaluru strengthens the 10th house';
    // Real worst case: the synastry line plus the Bonds lines (capped at 4 + 2) is about 2,000
    // characters; a match report (score, risk lines, one 240-character opening per section) about
    // 4,000. On main this pushed the flat block past 36,000 and cut the purchases at its tail.
    const secondChart = lines('SECOND CHART fact', 9);
    const matchReport = lines('MATCH REPORT fact', 19);

    const assembled = assembleChatFacts({
      ...sections,
      account: [PROFILE, PURCHASE],
      daily: [PANCHANG],
      perMessage: [...secondChart, ...matchReport, RELOCATION],
    });
    const messages = buildChatMessages(
      newState({ requestId: 'm1' }),
      'Should I move?',
      assembled,
      false,
      'en',
      [],
      now,
    );
    const ctx = messages.find((m) => m.content.includes('<astro_context>'))!.content;

    // The same inputs as main assembled them (chart facts, then a flat list of extras) are cut,
    // and the purchase line at the tail is lost: the bug this fixes.
    const flat = [
      ...sections.core,
      ...sections.reference,
      ...sections.live,
      PROFILE,
      PANCHANG,
      ...secondChart,
      ...matchReport,
      RELOCATION,
      PURCHASE,
    ];
    const flatCtx = buildChatMessages(
      newState({ requestId: 'm1-old' }),
      'Should I move?',
      flat,
      false,
      'en',
      [],
      now,
    ).find((m) => m.content.includes('<astro_context>'))!.content;
    expect(flatCtx).toContain('[truncated]');
    expect(flatCtx).not.toContain(PURCHASE);

    // Nothing is cut, and every account and per-message fact is there.
    expect(ctx).not.toContain('[truncated]');
    for (const f of [PROFILE, PURCHASE, PANCHANG, RELOCATION, ...secondChart, ...matchReport]) {
      expect(ctx, f.slice(0, 30)).toContain(f);
    }
    // Every core chart fact survives; only reference lines (vargas etc.) may give way.
    for (const f of sections.core) expect(ctx).toContain(f);
    expect(assembled.join('\n').length).toBeLessThanOrEqual(CHAT_CONTEXT_MAX_CHARS);

    // Fixed parts first: profile and purchases before the vargas; per-message facts last.
    const at = (s: string) => assembled.indexOf(s);
    const firstVarga = assembled.findIndex((f) => /^D\d+ \(/.test(f));
    expect(at(PURCHASE)).toBeLessThan(firstVarga);
    expect(at(PROFILE)).toBeLessThan(firstVarga);
    expect(at(secondChart[0]!)).toBeGreaterThan(at(PANCHANG));
    expect(at(RELOCATION)).toBe(assembled.length - 1);

    // The least-used vargas went first; the marriage and career charts stayed.
    expect(assembled.some((f) => f.startsWith('D108 ('))).toBe(false);
    expect(assembled.some((f) => f.startsWith('D9 ('))).toBe(true);
    expect(assembled.some((f) => f.startsWith('D10 ('))).toBe(true);
    console.log(
      '=== M1 composite block (chars) ===',
      assembled.map((f) => `- ${f}`).join('\n').length,
      'reference lines kept',
      sections.reference.filter((f) => assembled.includes(f)).length,
      'of',
      sections.reference.length,
    );
  });
});
