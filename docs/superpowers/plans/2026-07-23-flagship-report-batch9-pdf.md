# Flagship Life Report — Batch 9: PDF Rendering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `GET /v1/prime/reports/flagship-life-report/pdf` endpoint that renders the ALREADY-CACHED flagship report content (`prime_reports.analysis`, produced by Batch 8's `assembleFlagshipReport`) into a downloadable PDF — no new AI calls, no new database writes, no regeneration. This is the last piece needed before the ₹149 flagship Life Report is a complete, shippable product.

**Architecture:** A pure rendering function, `renderFlagshipReportPdf(content, meta) => Promise<Buffer>`, built with `pdfkit` (pure JS, no native deps, no headless Chromium — this backend runs on a memory-constrained EC2 box with pm2 cluster mode, so a ~300MB Chromium dependency for one feature is the wrong tradeoff; see the perf-hardening history in this repo). The renderer takes ONLY the `FlagshipReportContent` object already stored in `prime_reports.analysis` (all 16 keys — deterministic sections AND AI narrative sections are both fully present in that stored JSON by generation time) plus three primitive strings (`fullName`, `dateOfBirth`, `gender`) for the cover page. It does **not** re-fetch the kundli, re-call `getRemedies`, or touch the database — every value the PDF prints comes from data already sitting in the row. A new route reuses the exact same unlock/ready-state guards as the existing `GET /prime/reports/{reportType}` route, then streams the rendered PDF back with `Content-Type: application/pdf`.

**Explicitly out of scope for this batch:** translation (the flagship report's `translate()` is already a documented no-op returning English content unchanged — the PDF is English-only, matching that); PDF for any report type other than `flagship-life-report` (no other report type has a PDF need today — adding a speculative `registry.renderPdf` field for 18 report types that don't use it is not justified by anything in this plan); caching the rendered PDF bytes (rendering from already-cached JSON via `pdfkit` is CPU-only and takes well under a second — persisting a binary blob in Postgres for that would be pure waste).

**Tech Stack:** `pdfkit` (PDF generation), `pdf-parse@1.1.4` (test-only — extracts text back out of the generated PDF so tests can assert on real rendered content, not just "didn't throw"; pinned to the 1.x line deliberately — `pdf-parse@2.x` is a ground-up rewrite with a different API surface that hasn't been verified against this plan), Hono (raw non-`.openapi()` route — see Task 3 for why), Vitest.

---

## Before you start (context every task needs)

- Working directory: `C:\dev\aroha-astrology\jyotish-backend\.worktrees\prime-reports-batch2` — a git worktree, still on branch `feat/prime-reports-batch2`. Do NOT merge to main.
- Run tests with `pnpm test`. Baseline immediately before this plan's work (confirmed by running it): **797 total / 788 passing / 9 failing** (pre-existing, unrelated — `billing-google-play`, `health-report`, `horoscope-jargon`, `purchase-plan-notify` specs). `pnpm typecheck` baseline: **104 pre-existing errors**, none in any file this plan touches. Your job is zero NEW failures/errors, not fixing the pre-existing ones.
- `pdfkit@0.19.1`, `@types/pdfkit@0.17.6`, `pdf-parse@1.1.4`, `@types/pdf-parse@1.1.5` are all confirmed to exist on the npm registry as of this plan being written (verified via `npm view <pkg> version`) — install with the exact commands in Task 1, don't let a package manager silently resolve `pdf-parse` to the 2.x line.
- The full shape of `FlagshipReportContent` (what `content` will always be, cast from `prime_reports.analysis`, when this route runs) — read `src/lib/flagship/orchestrator.ts` to confirm this hasn't drifted, but as of this plan:
  ```ts
  interface FlagshipReportContent {
    avkahada: {
      varna: string;
      vashya: string;
      yoni: string;
      gana: string;
      nadi: string;
      paya: 'Gold' | 'Silver' | 'Copper' | 'Iron';
      namingSyllable: string;
      moonSign: string;
      moonNakshatra: string;
    };
    planetPositions: Array<{
      planet: string;
      sign: string;
      house: number;
      nakshatra: string;
      nakshatraPada: number;
      isRetrograde: boolean;
    }>;
    houseTable: Array<{ house: number; sign: string; lord: string }>;
    yogas: Array<{ name: string; type: string; description: string; strength: number }>; // already filtered to only present=true yogas, sorted strongest-first
    doshas: Array<{ name: string; present: boolean; severity: string; description: string }>; // NOT pre-filtered — includes present:false rows, the renderer must filter
    dashaTimeline: Array<{
      planet: string;
      startDate: string;
      endDate: string;
      isCurrent: boolean;
    }>;
    ashtakavarga: { bySign: Array<{ sign: string; bindus: number }> };
    shadbala: Array<{
      planet: string;
      sthanaBala: number;
      digBala: number;
      kalaBala: number;
      cheshtaBala: number;
      naisargikaBala: number;
      drikBala: number;
      totalVirupas: number;
      requiredVirupas: number;
      isStrong: boolean;
    }>;
    ascendant: {
      intro: string;
      personalityTraits: string;
      appearance: string;
      temperament: string;
      model: string;
    };
    numerology: {
      intro: string;
      lifePathStory: string;
      expressionStory: string;
      soulUrgeStory: string;
      personalityStory: string;
      model: string;
    };
    career: {
      intro: string;
      currentPhase: string;
      strengths: string;
      challenges: string;
      guidance: string;
      model: string;
    };
    finance: /* same shape as career */ typeof career;
    health: /* same shape as career */ typeof career;
    love: /* same shape as career */ typeof career;
    education: /* same shape as career */ typeof career;
    remedies: { intro: string; notes: Record<string, string>; model: string }; // notes is keyed by remedy title
    executiveSummary: {
      overallSummary: string;
      keyStrengths: string;
      areasToWatch: string;
      closingGuidance: string;
      model: string;
    };
  }
  ```
- `src/modules/prime-reports/prime-reports.routes.ts` — read this whole file before Task 3. Every existing route uses `createRoute` + `.openapi(...)` from `@hono/zod-openapi`, which requires a Zod schema for every response's `content`. There is no existing binary-response route in this codebase to model that on, and forcing a `application/pdf` binary body through a Zod-validated JSON-shaped response schema is the wrong fit. Task 3 instead registers a **plain Hono route** directly on the same `primeReportsRouter` instance (`OpenAPIHono` extends `Hono`, so `.get(path, ...middleware, handler)` works exactly like on a plain `Hono` instance) — this exact pattern (a plain route bypassing `.openapi()`, middleware passed positionally) already exists in this codebase at `src/modules/telegram-bot/telegram-bot.routes.ts:8` (`telegramBotRouter.post('/telegram/webhook', requireTelegramWebhookSecret, async (c) => {...})`). The route simply won't appear in the generated OpenAPI/Swagger spec — acceptable for a binary download endpoint.
- `requireUser` (`src/middleware/auth.ts`) is a standard `MiddlewareHandler` — puts `UserRow` at `c.get('user')`.
- `resolveActiveProfileContext(user)` (`src/modules/birth-profiles/profile-context.ts`) resolves the active profile; `ProfileContext.displayName` / `.dateOfBirth` / `.gender` are `string | null` (same nullable types as the underlying `UserRow` columns).
- `findPrimeReport(userId, birthProfileId, reportType, period)` (`src/modules/prime-reports/prime-reports.repo.ts`) returns the row or `undefined`. `LIFETIME_PERIOD` (`src/modules/prime-reports/prime-reports.service.ts`) is the string constant `'lifetime'` — the flagship report has no period variants, so the PDF route always uses this directly (no `period` query param needed, unlike the JSON GET route).
- Hono's `c.body(data, status, headers)` accepts a `Uint8Array` directly — a Node `Buffer` IS a `Uint8Array` subclass, so `c.body(pdfBuffer, 200, { 'Content-Type': 'application/pdf', ... })` works with no conversion.

---

## File structure

| File                                                | Action | Responsibility                                                                          |
| --------------------------------------------------- | ------ | --------------------------------------------------------------------------------------- |
| `package.json`                                      | Modify | Add `pdfkit` (prod dep) and `pdf-parse`, `@types/pdfkit`, `@types/pdf-parse` (dev deps) |
| `src/lib/flagship/pdfRenderer.ts`                   | Create | Pure function: `FlagshipReportContent` + meta → PDF `Buffer`                            |
| `test/flagship-pdfRenderer.spec.ts`                 | Create | Tests using `pdf-parse` to assert real rendered content                                 |
| `src/modules/prime-reports/prime-reports.routes.ts` | Modify | Add `GET /prime/reports/flagship-life-report/pdf`                                       |
| `test/prime-reports-routes.spec.ts`                 | Modify | Add route-level tests for the new PDF endpoint                                          |

---

### Task 1: Add dependencies

**Files:**

- Modify: `package.json`

- [ ] **Step 1: Install the exact versions**

Run:

```bash
pnpm add pdfkit@0.19.1
pnpm add -D @types/pdfkit@0.17.6 pdf-parse@1.1.4 @types/pdf-parse@1.1.5
```

- [ ] **Step 2: Verify the install**

Run: `pnpm typecheck`
Expected: still exactly 104 pre-existing errors (no new ones from the dependency add itself — a plain install with no imports yet cannot introduce type errors).

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore(flagship): add pdfkit + pdf-parse dependencies for report PDF rendering"
```

---

### Task 2: PDF renderer (TDD)

**Files:**

- Create: `src/lib/flagship/pdfRenderer.ts`
- Test: `test/flagship-pdfRenderer.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `test/flagship-pdfRenderer.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import pdfParse from 'pdf-parse';
import { renderFlagshipReportPdf } from '../src/lib/flagship/pdfRenderer.js';
import type { FlagshipReportContent } from '../src/lib/flagship/orchestrator.js';

const CONTENT: FlagshipReportContent = {
  avkahada: {
    varna: 'Kshatriya',
    vashya: 'Chatushpada',
    yoni: 'Ashwa',
    gana: 'Deva',
    nadi: 'Antya',
    paya: 'Gold',
    namingSyllable: 'Ro',
    moonSign: 'Taurus',
    moonNakshatra: 'Rohini',
  },
  planetPositions: [
    {
      planet: 'Sun',
      sign: 'Capricorn',
      house: 10,
      nakshatra: 'Uttara Ashadha',
      nakshatraPada: 2,
      isRetrograde: false,
    },
    {
      planet: 'Moon',
      sign: 'Taurus',
      house: 4,
      nakshatra: 'Rohini',
      nakshatraPada: 1,
      isRetrograde: false,
    },
    {
      planet: 'Saturn',
      sign: 'Libra',
      house: 7,
      nakshatra: 'Vishakha',
      nakshatraPada: 3,
      isRetrograde: true,
    },
  ],
  houseTable: [
    { house: 1, sign: 'Leo', lord: 'Sun' },
    { house: 2, sign: 'Virgo', lord: 'Mercury' },
  ],
  yogas: [
    {
      name: 'Gajakesari Yoga',
      type: 'raja',
      description: 'Moon-Jupiter angular relationship brings wisdom and reputation.',
      strength: 8,
    },
  ],
  doshas: [
    {
      name: 'Mangal Dosha',
      present: true,
      severity: 'high',
      description: 'Mars afflicts the 7th house of partnerships.',
    },
    {
      name: 'Kaal Sarp Dosha',
      present: false,
      severity: 'none',
      description: 'No qualifying planetary configuration found.',
    },
  ],
  dashaTimeline: [
    { planet: 'Venus', startDate: '2020-01-01', endDate: '2040-01-01', isCurrent: true },
    { planet: 'Sun', startDate: '2040-01-01', endDate: '2046-01-01', isCurrent: false },
  ],
  ashtakavarga: {
    bySign: [
      { sign: 'Aries', bindus: 28 },
      { sign: 'Taurus', bindus: 30 },
    ],
  },
  shadbala: [
    {
      planet: 'Sun',
      sthanaBala: 120,
      digBala: 40,
      kalaBala: 80,
      cheshtaBala: 30,
      naisargikaBala: 60,
      drikBala: 10,
      totalVirupas: 340,
      requiredVirupas: 390,
      isStrong: false,
    },
    {
      planet: 'Moon',
      sthanaBala: 150,
      digBala: 50,
      kalaBala: 90,
      cheshtaBala: 40,
      naisargikaBala: 51.43,
      drikBala: 5,
      totalVirupas: 386.43,
      requiredVirupas: 360,
      isStrong: true,
    },
  ],
  ascendant: {
    intro:
      'Your Leo ascendant gives you a natural warmth people notice within minutes of meeting you.',
    personalityTraits: 'Confident, generous, and drawn to leadership roles.',
    appearance: 'A strong, upright bearing with expressive eyes.',
    temperament: 'Fire-driven and quick to act, softened by genuine warmth.',
    model: 'gemini-mock',
  },
  numerology: {
    intro: 'Your numbers point to a life built on steady, patient effort.',
    lifePathStory: 'You keep circling back to the same lesson: finish what you start.',
    expressionStory: 'People already come to you first when something needs organizing.',
    soulUrgeStory: 'Underneath the plans, what you actually want is to feel needed.',
    personalityStory: 'Strangers read you as calm before they ever hear you speak.',
    model: 'gemini-mock',
  },
  career: {
    intro:
      'Your career runs on visible, structured effort rather than quiet behind-the-scenes work.',
    currentPhase: 'A consolidation phase after several years of rapid change.',
    strengths: 'Organizational clarity and a talent for turning chaos into a plan.',
    challenges: 'A tendency to take on too much before delegating.',
    guidance: 'Say yes to the leadership opportunity that surfaces this year.',
    model: 'gemini-mock',
  },
  finance: {
    intro: 'Money moves toward you through steady accumulation, not windfalls.',
    currentPhase: 'A saving-focused stretch after a period of higher spending.',
    strengths: 'Discipline once a budget is actually written down.',
    challenges: 'Impulse purchases tied to stress, not genuine want.',
    guidance: 'Automate savings before the next salary revision lands.',
    model: 'gemini-mock',
  },
  health: {
    intro:
      'Your vitality tracks closely with how well you are sleeping, more than diet or exercise alone.',
    currentPhase: 'A generally stable period with one area needing attention.',
    strengths: 'Fast physical recovery once you actually rest.',
    challenges: 'Skipping sleep to finish "one more thing."',
    guidance: 'Protect a fixed wind-down hour, even on demanding weeks.',
    model: 'gemini-mock',
  },
  love: {
    intro: 'You show love through action long before you say it out loud.',
    currentPhase: 'A season favoring deepening an existing bond over starting new ones.',
    strengths: 'Loyalty and follow-through once you commit.',
    challenges: 'Waiting too long to name what you actually need.',
    guidance: 'Say the thing you have been rehearsing in your head.',
    model: 'gemini-mock',
  },
  education: {
    intro: 'You learn best by teaching the material back to someone else.',
    currentPhase: 'A strong window for finishing a long-delayed certification.',
    strengths: 'Deep focus once a topic actually interests you.',
    challenges: 'Losing momentum on subjects that feel purely obligatory.',
    guidance: 'Pair the delayed certification with a study partner this month.',
    model: 'gemini-mock',
  },
  remedies: {
    intro: 'These remedies are chosen specifically for the placements found in your chart above.',
    notes: {
      'Pacify Saturn':
        'Saturn sits weak in your chart, so this remedy directly supports the area it governs.',
    },
    model: 'gemini-mock',
  },
  executiveSummary: {
    overallSummary:
      'This chart describes someone who builds a good life through consistency rather than luck.',
    keyStrengths: 'Discipline, loyalty, and a talent for turning plans into results.',
    areasToWatch: 'Overcommitting before delegating, and delaying honest conversations.',
    closingGuidance:
      'The next two years reward finishing what is already in motion over starting anything new.',
    model: 'gemini-mock',
  },
};

const META = {
  fullName: 'Subir Dutta',
  dateOfBirth: '1993-04-17',
  gender: 'male' as string | null,
};

describe('renderFlagshipReportPdf', () => {
  it('produces a buffer starting with the PDF magic header', async () => {
    const buffer = await renderFlagshipReportPdf(CONTENT, META);
    expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  });

  it('includes the cover page name and date of birth', async () => {
    const buffer = await renderFlagshipReportPdf(CONTENT, META);
    const { text } = await pdfParse(buffer);
    expect(text).toContain('Subir Dutta');
    expect(text).toContain('1993-04-17');
  });

  it('includes every Avkahada Chakra value', async () => {
    const buffer = await renderFlagshipReportPdf(CONTENT, META);
    const { text } = await pdfParse(buffer);
    expect(text).toContain('Kshatriya');
    expect(text).toContain('Chatushpada');
    expect(text).toContain('Ashwa');
    expect(text).toContain('Antya');
    expect(text).toContain('Gold');
    expect(text).toContain('Rohini');
  });

  it('includes the Executive Summary and Ascendant narrative text verbatim', async () => {
    const buffer = await renderFlagshipReportPdf(CONTENT, META);
    const { text } = await pdfParse(buffer);
    expect(text).toContain('builds a good life through consistency rather than luck');
    expect(text).toContain('natural warmth people notice within minutes');
  });

  it('includes all 5 life-area section intros', async () => {
    const buffer = await renderFlagshipReportPdf(CONTENT, META);
    const { text } = await pdfParse(buffer);
    expect(text).toContain('Your career runs on visible, structured effort');
    expect(text).toContain('Money moves toward you through steady accumulation');
    expect(text).toContain('Your vitality tracks closely with how well you are sleeping');
    expect(text).toContain('You show love through action long before you say it out loud');
    expect(text).toContain('You learn best by teaching the material back to someone else');
  });

  it('includes the numerology narrative', async () => {
    const buffer = await renderFlagshipReportPdf(CONTENT, META);
    const { text } = await pdfParse(buffer);
    expect(text).toContain('finish what you start');
  });

  it('includes only the present dosha, not the absent one', async () => {
    const buffer = await renderFlagshipReportPdf(CONTENT, META);
    const { text } = await pdfParse(buffer);
    expect(text).toContain('Mangal Dosha');
    expect(text).not.toContain('Kaal Sarp Dosha');
  });

  it('includes the yoga name and dasha timeline planet names', async () => {
    const buffer = await renderFlagshipReportPdf(CONTENT, META);
    const { text } = await pdfParse(buffer);
    expect(text).toContain('Gajakesari Yoga');
    expect(text).toContain('Venus');
  });

  it('includes the remedies section title and personalized note', async () => {
    const buffer = await renderFlagshipReportPdf(CONTENT, META);
    const { text } = await pdfParse(buffer);
    expect(text).toContain('Pacify Saturn');
    expect(text).toContain('directly supports the area it governs');
  });

  it('includes Shadbala planet names', async () => {
    const buffer = await renderFlagshipReportPdf(CONTENT, META);
    const { text } = await pdfParse(buffer);
    expect(text).toContain('Sun');
    expect(text).toContain('Moon');
  });

  it('renders a report with zero present doshas without throwing, and says so', async () => {
    const noDoshaContent: FlagshipReportContent = {
      ...CONTENT,
      doshas: [
        { name: 'Mangal Dosha', present: false, severity: 'none', description: 'Not present.' },
      ],
    };
    const buffer = await renderFlagshipReportPdf(noDoshaContent, META);
    const { text } = await pdfParse(buffer);
    expect(text).toContain('No significant doshas identified');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run test/flagship-pdfRenderer.spec.ts`
Expected: FAIL — `Cannot find module '../src/lib/flagship/pdfRenderer.js'`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/flagship/pdfRenderer.ts`:

```ts
// =============================================================================
// Flagship Life Report — PDF renderer. Pure function: takes the ALREADY-
// CACHED FlagshipReportContent (everything this file touches was already
// computed once by assembleFlagshipReport and stored in prime_reports.analysis
// — no AI calls, no database reads, no re-fetching of kundli/remedies data
// happen here) plus three cover-page strings, and returns a PDF Buffer.
//
// Uses pdfkit (pure JS, no native/Chromium dependency) rather than an
// HTML-to-PDF headless-browser approach — this backend runs on a memory-
// constrained EC2 box (see perf-hardening history in this repo), and a
// ~300MB Chromium install for one feature is the wrong tradeoff.
//
// English-only: matches the flagship report's registry `translate()`, which
// is already a documented no-op for this batch.
// =============================================================================

import PDFDocument from 'pdfkit';
import type { FlagshipReportContent } from './orchestrator.js';

export interface FlagshipPdfMeta {
  fullName: string;
  dateOfBirth: string;
  gender: string | null;
}

const PAGE_MARGIN = 50;
const HEADING_COLOR = '#4a2e6b';
const BODY_COLOR = '#222222';
const MUTED_COLOR = '#666666';

function addSectionHeading(doc: PDFKit.PDFDocument, title: string): void {
  doc.fontSize(18).fillColor(HEADING_COLOR).font('Helvetica-Bold').text(title, { align: 'left' });
  doc.moveDown(0.5);
  doc.fillColor(BODY_COLOR).font('Helvetica');
}

function addSubheading(doc: PDFKit.PDFDocument, title: string): void {
  doc.moveDown(0.3);
  doc.fontSize(12).font('Helvetica-Bold').fillColor(BODY_COLOR).text(title);
  doc.font('Helvetica');
}

function addParagraph(doc: PDFKit.PDFDocument, text: string): void {
  doc.fontSize(11).fillColor(BODY_COLOR).text(text, { align: 'left' });
  doc.moveDown(0.5);
}

function addLabelValueLine(doc: PDFKit.PDFDocument, label: string, value: string): void {
  doc
    .fontSize(11)
    .fillColor(MUTED_COLOR)
    .text(`${label}: `, { continued: true })
    .fillColor(BODY_COLOR)
    .text(value);
}

function addBullet(doc: PDFKit.PDFDocument, text: string): void {
  doc.fontSize(11).fillColor(BODY_COLOR).text(`•  ${text}`);
}

function addLifeAreaSection(
  doc: PDFKit.PDFDocument,
  title: string,
  area: {
    intro: string;
    currentPhase: string;
    strengths: string;
    challenges: string;
    guidance: string;
  },
): void {
  doc.addPage();
  addSectionHeading(doc, title);
  addParagraph(doc, area.intro);
  addSubheading(doc, 'Current Phase');
  addParagraph(doc, area.currentPhase);
  addSubheading(doc, 'Strengths');
  addParagraph(doc, area.strengths);
  addSubheading(doc, 'Challenges');
  addParagraph(doc, area.challenges);
  addSubheading(doc, 'Guidance');
  addParagraph(doc, area.guidance);
}

export async function renderFlagshipReportPdf(
  content: FlagshipReportContent,
  meta: FlagshipPdfMeta,
): Promise<Buffer> {
  const doc = new PDFDocument({ margin: PAGE_MARGIN, autoFirstPage: true, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  // --- Cover page ---
  doc
    .fontSize(26)
    .font('Helvetica-Bold')
    .fillColor(HEADING_COLOR)
    .text('Aroha Prime', { align: 'center' });
  doc
    .fontSize(18)
    .font('Helvetica')
    .fillColor(BODY_COLOR)
    .text('Complete Life Report', { align: 'center' });
  doc.moveDown(2);
  doc.fontSize(16).font('Helvetica-Bold').text(meta.fullName, { align: 'center' });
  doc.fontSize(11).font('Helvetica').fillColor(MUTED_COLOR);
  doc.text(`Date of Birth: ${meta.dateOfBirth}`, { align: 'center' });
  if (meta.gender) doc.text(`Gender: ${meta.gender}`, { align: 'center' });

  // --- Executive Summary ---
  doc.addPage();
  addSectionHeading(doc, 'Executive Summary');
  addParagraph(doc, content.executiveSummary.overallSummary);
  addSubheading(doc, 'Key Strengths');
  addParagraph(doc, content.executiveSummary.keyStrengths);
  addSubheading(doc, 'Areas to Watch');
  addParagraph(doc, content.executiveSummary.areasToWatch);
  addSubheading(doc, 'Closing Guidance');
  addParagraph(doc, content.executiveSummary.closingGuidance);

  // --- Avkahada Chakra ---
  doc.addPage();
  addSectionHeading(doc, 'Avkahada Chakra');
  addLabelValueLine(doc, 'Varna', content.avkahada.varna);
  addLabelValueLine(doc, 'Vashya', content.avkahada.vashya);
  addLabelValueLine(doc, 'Yoni', content.avkahada.yoni);
  addLabelValueLine(doc, 'Gana', content.avkahada.gana);
  addLabelValueLine(doc, 'Nadi', content.avkahada.nadi);
  addLabelValueLine(doc, 'Paya', content.avkahada.paya);
  addLabelValueLine(doc, 'Naming Syllable', content.avkahada.namingSyllable);
  addLabelValueLine(doc, 'Moon Sign', content.avkahada.moonSign);
  addLabelValueLine(doc, 'Moon Nakshatra', content.avkahada.moonNakshatra);

  // --- Ascendant Analysis ---
  doc.addPage();
  addSectionHeading(doc, 'Ascendant Analysis');
  addParagraph(doc, content.ascendant.intro);
  addSubheading(doc, 'Personality Traits');
  addParagraph(doc, content.ascendant.personalityTraits);
  addSubheading(doc, 'Appearance');
  addParagraph(doc, content.ascendant.appearance);
  addSubheading(doc, 'Temperament');
  addParagraph(doc, content.ascendant.temperament);

  // --- Planetary Positions ---
  doc.addPage();
  addSectionHeading(doc, 'Planetary Positions');
  for (const p of content.planetPositions) {
    addBullet(
      doc,
      `${p.planet} — ${p.sign}, House ${p.house}, ${p.nakshatra} Pada ${p.nakshatraPada}${p.isRetrograde ? ' (Retrograde)' : ''}`,
    );
  }

  // --- House Table ---
  doc.moveDown();
  addSubheading(doc, 'House Table');
  for (const h of content.houseTable) {
    addBullet(doc, `House ${h.house}: ${h.sign} (Lord: ${h.lord})`);
  }

  // --- Yogas ---
  doc.addPage();
  addSectionHeading(doc, 'Yogas');
  if (content.yogas.length === 0) {
    addParagraph(doc, 'No significant yogas identified in this chart.');
  } else {
    for (const y of content.yogas) {
      addSubheading(doc, y.name);
      addParagraph(doc, y.description);
    }
  }

  // --- Doshas ---
  doc.addPage();
  addSectionHeading(doc, 'Doshas');
  const presentDoshas = content.doshas.filter((d) => d.present);
  if (presentDoshas.length === 0) {
    addParagraph(doc, 'No significant doshas identified in this chart.');
  } else {
    for (const d of presentDoshas) {
      addSubheading(doc, `${d.name} (${d.severity})`);
      addParagraph(doc, d.description);
    }
  }

  // --- Dasha Timeline ---
  doc.addPage();
  addSectionHeading(doc, 'Dasha Timeline');
  for (const d of content.dashaTimeline) {
    addBullet(doc, `${d.planet}: ${d.startDate} to ${d.endDate}${d.isCurrent ? ' (Current)' : ''}`);
  }

  // --- Ashtakavarga ---
  doc.addPage();
  addSectionHeading(doc, 'Ashtakavarga (Sarvashtakavarga)');
  for (const row of content.ashtakavarga.bySign) {
    addBullet(doc, `${row.sign}: ${row.bindus} bindus`);
  }

  // --- Shadbala ---
  doc.addPage();
  addSectionHeading(doc, 'Shadbala (Six-Fold Planetary Strength)');
  for (const s of content.shadbala) {
    addBullet(
      doc,
      `${s.planet}: ${s.totalVirupas.toFixed(1)} / ${s.requiredVirupas} virupas — ${s.isStrong ? 'Strong' : 'Below required strength'}`,
    );
  }

  // --- Numerology ---
  doc.addPage();
  addSectionHeading(doc, 'Numerology');
  addParagraph(doc, content.numerology.intro);
  addSubheading(doc, 'Life Path');
  addParagraph(doc, content.numerology.lifePathStory);
  addSubheading(doc, 'Expression');
  addParagraph(doc, content.numerology.expressionStory);
  addSubheading(doc, 'Soul Urge');
  addParagraph(doc, content.numerology.soulUrgeStory);
  addSubheading(doc, 'Personality');
  addParagraph(doc, content.numerology.personalityStory);

  // --- Life Areas ---
  addLifeAreaSection(doc, 'Career', content.career);
  addLifeAreaSection(doc, 'Finance', content.finance);
  addLifeAreaSection(doc, 'Health', content.health);
  addLifeAreaSection(doc, 'Love', content.love);
  addLifeAreaSection(doc, 'Education', content.education);

  // --- Remedies ---
  doc.addPage();
  addSectionHeading(doc, 'Remedies');
  addParagraph(doc, content.remedies.intro);
  for (const [title, note] of Object.entries(content.remedies.notes)) {
    addSubheading(doc, title);
    addParagraph(doc, note);
  }

  doc.end();
  return finished;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run test/flagship-pdfRenderer.spec.ts`
Expected: PASS (12 tests). If `pdf-parse` throws an import error, confirm `package.json` pinned exactly `pdf-parse@1.1.4` (not `^1.1.4`, which could still resolve wrong if a 2.x prerelease matches — check `pnpm-lock.yaml` shows `pdf-parse: 1.1.4` resolved) and that the import is `import pdfParse from 'pdf-parse'` (default export, CJS interop).

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: no new errors (still 104 pre-existing). If `PDFKit.PDFDocument` isn't recognized as an ambient type, confirm `@types/pdfkit` installed correctly and that `tsconfig.json`'s `types`/`include` picks up `node_modules/@types` (it does by default with no explicit `types` array restricting it — check `tsconfig.json` doesn't have a `"types": [...]` allowlist; if it does, add `"pdfkit"` to it).

- [ ] **Step 6: Commit**

```bash
git add src/lib/flagship/pdfRenderer.ts test/flagship-pdfRenderer.spec.ts
git commit -m "feat(flagship): add PDF renderer for the Life Report content"
```

---

### Task 3: Wire the PDF route (TDD)

**Files:**

- Modify: `src/modules/prime-reports/prime-reports.routes.ts`
- Modify: `test/prime-reports-routes.spec.ts`

- [ ] **Step 1: Read the existing route test file's mock setup first**

Open `test/prime-reports-routes.spec.ts` and read its `vi.mock(...)` calls for `prime-reports.service.js`, `prime-reports.registry.js`, and `birth-profiles/profile-context.js`, plus how it constructs the Hono `app` under test (likely via `createApp()` or directly mounting `primeReportsRouter`) — match that exact setup in Step 2 below rather than guessing at a different mocking shape.

- [ ] **Step 2: Write the failing tests**

Add to the end of `test/prime-reports-routes.spec.ts` (adjust the mock-import lines at the top of this new `describe` block to match whatever mock variable names the existing file already uses for `findPrimeReport` and `resolveActiveProfileContext` — do not introduce a second, differently-named mock for something already mocked above):

```ts
describe('GET /v1/prime/reports/flagship-life-report/pdf', () => {
  it('returns 404 for a report type that does not support PDF', async () => {
    const res = await app.request('/v1/prime/reports/numerology/pdf', {
      headers: { Authorization: 'Bearer test-token' },
    });
    expect(res.status).toBe(404);
  });

  it('returns 403 when the flagship report has not been unlocked', async () => {
    state.findPrimeReport.mockResolvedValueOnce(undefined);

    const res = await app.request('/v1/prime/reports/flagship-life-report/pdf', {
      headers: { Authorization: 'Bearer test-token' },
    });
    expect(res.status).toBe(403);
  });

  it('returns 409 when the flagship report is not yet ready', async () => {
    state.findPrimeReport.mockResolvedValueOnce({
      status: 'generating',
      analysis: null,
    });

    const res = await app.request('/v1/prime/reports/flagship-life-report/pdf', {
      headers: { Authorization: 'Bearer test-token' },
    });
    expect(res.status).toBe(409);
  });

  it('returns a PDF binary with the right content-type when the report is ready', async () => {
    state.findPrimeReport.mockResolvedValueOnce({
      status: 'ready',
      analysis: MINIMAL_FLAGSHIP_CONTENT,
    });

    const res = await app.request('/v1/prime/reports/flagship-life-report/pdf', {
      headers: { Authorization: 'Bearer test-token' },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  });
});
```

Above that `describe` block (still inside the test file, near its other top-level fixtures), add the fixture it references:

```ts
const MINIMAL_FLAGSHIP_CONTENT = {
  avkahada: {
    varna: 'Kshatriya',
    vashya: 'Chatushpada',
    yoni: 'Ashwa',
    gana: 'Deva',
    nadi: 'Antya',
    paya: 'Gold',
    namingSyllable: 'Ro',
    moonSign: 'Taurus',
    moonNakshatra: 'Rohini',
  },
  planetPositions: [],
  houseTable: [],
  yogas: [],
  doshas: [],
  dashaTimeline: [],
  ashtakavarga: { bySign: [] },
  shadbala: [],
  ascendant: { intro: 'i', personalityTraits: 't', appearance: 'a', temperament: 'te', model: 'm' },
  numerology: {
    intro: 'i',
    lifePathStory: 'l',
    expressionStory: 'e',
    soulUrgeStory: 's',
    personalityStory: 'p',
    model: 'm',
  },
  career: {
    intro: 'i',
    currentPhase: 'c',
    strengths: 's',
    challenges: 'ch',
    guidance: 'g',
    model: 'm',
  },
  finance: {
    intro: 'i',
    currentPhase: 'c',
    strengths: 's',
    challenges: 'ch',
    guidance: 'g',
    model: 'm',
  },
  health: {
    intro: 'i',
    currentPhase: 'c',
    strengths: 's',
    challenges: 'ch',
    guidance: 'g',
    model: 'm',
  },
  love: {
    intro: 'i',
    currentPhase: 'c',
    strengths: 's',
    challenges: 'ch',
    guidance: 'g',
    model: 'm',
  },
  education: {
    intro: 'i',
    currentPhase: 'c',
    strengths: 's',
    challenges: 'ch',
    guidance: 'g',
    model: 'm',
  },
  remedies: { intro: 'i', notes: {}, model: 'm' },
  executiveSummary: {
    overallSummary: 'o',
    keyStrengths: 'k',
    areasToWatch: 'a',
    closingGuidance: 'c',
    model: 'm',
  },
};
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm vitest run test/prime-reports-routes.spec.ts`
Expected: FAIL — the new `/pdf` path 404s for ALL cases right now (route doesn't exist yet), so the 403/409/200 tests fail while the 404 test may already accidentally pass; that's fine, the point is the suite is red before Step 4.

- [ ] **Step 4: Write the implementation**

In `src/modules/prime-reports/prime-reports.routes.ts`, add these imports at the top (alongside the existing ones):

```ts
import { renderFlagshipReportPdf } from '../../lib/flagship/pdfRenderer.js';
import type { FlagshipReportContent } from '../../lib/flagship/orchestrator.js';
```

Add this constant near the top of the file, after `export const primeReportsRouter = new OpenAPIHono();`:

```ts
const FLAGSHIP_PDF_REPORT_TYPE = 'flagship-life-report';
```

Add this route at the end of the file (after the existing `unlockRoute` handler — a plain route, not `.openapi()`, per the "Before you start" note above):

```ts
primeReportsRouter.get('/prime/reports/:reportType/pdf', requireUser, async (c) => {
  const reportType = c.req.param('reportType');
  if (reportType !== FLAGSHIP_PDF_REPORT_TYPE) {
    return c.json(
      {
        error: {
          code: 'NOT_FOUND',
          message: 'PDF rendering is not available for this report type.',
        },
      },
      404,
    );
  }

  const user = c.get('user');
  const profile = await resolveActiveProfileContext(user);
  const existing = await findPrimeReport(
    user.id,
    profile.birthProfileId,
    reportType,
    LIFETIME_PERIOD,
  );

  if (!existing) {
    return c.json(
      { error: { code: 'FORBIDDEN', message: 'This report is not unlocked yet.' } },
      403,
    );
  }

  if (existing.status !== 'ready' || !existing.analysis) {
    return c.json(
      {
        error: {
          code: 'CONFLICT',
          message:
            'This report is still generating or failed — check GET /v1/prime/reports/flagship-life-report first.',
        },
      },
      409,
    );
  }

  if (!profile.displayName || !profile.dateOfBirth) {
    throw new Error('Flagship report exists but the active profile is missing name/date of birth');
  }

  const pdfBuffer = await renderFlagshipReportPdf(
    existing.analysis as unknown as FlagshipReportContent,
    {
      fullName: profile.displayName,
      dateOfBirth: profile.dateOfBirth,
      gender: profile.gender,
    },
  );

  return c.body(pdfBuffer, 200, {
    'Content-Type': 'application/pdf',
    'Content-Disposition': 'attachment; filename="aroha-prime-life-report.pdf"',
  });
});
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm vitest run test/prime-reports-routes.spec.ts`
Expected: PASS (all tests, including the 4 new ones).

- [ ] **Step 6: Run the full suite + typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: same 9 pre-existing failures (nothing new), same 104 pre-existing typecheck errors (nothing new).

- [ ] **Step 7: Commit**

```bash
git add src/modules/prime-reports/prime-reports.routes.ts test/prime-reports-routes.spec.ts
git commit -m "feat(flagship): add GET /v1/prime/reports/flagship-life-report/pdf"
```

---

### Task 4: Manual smoke check (not automated — do this yourself before declaring the batch done)

- [ ] **Step 1:** Confirm `pnpm test && pnpm typecheck` are both clean (same baseline as documented above) on the final commit of this batch.
- [ ] **Step 2:** Re-read `src/lib/flagship/pdfRenderer.ts` once fully top to bottom and confirm every one of `FlagshipReportContent`'s 16 keys is referenced somewhere in the render function — cross-check against the interface in "Before you start" above. If a future field gets added to `FlagshipReportContent` upstream in Batch 8's files, this file will NOT fail to compile (it doesn't destructure the whole object), so this manual check is the only thing that will catch a silently-unrendered new section.
- [ ] **Step 3:** This step does not require running the live server or a real Gemini/DB call — the renderer is a pure function fully covered by Task 2's tests and the route is fully covered by Task 3's tests. Do not attempt to hit the live route through `pnpm dev` unless you also have a real unlocked flagship report in a real database to test against; that is out of scope for this batch's verification.

---

## Self-review notes (for whoever executes this plan)

- Every `FlagshipReportContent` key from the "Before you start" interface appears in `pdfRenderer.ts`'s render function — verified while writing this plan (avkahada, planetPositions, houseTable, yogas, doshas, dashaTimeline, ashtakavarga, shadbala, ascendant, numerology, career, finance, health, love, education, remedies, executiveSummary — 17 keys, all present).
- `doshas` is deliberately filtered to `present === true` in the renderer (unlike `yogas`, which `chartSummary.ts`'s `buildYogaList` already pre-filters) — this asymmetry is intentional and tested (see the "includes only the present dosha" test).
- The PDF route reuses `LIFETIME_PERIOD` directly with no `period` query param, matching that the flagship report has no period variants (confirmed: its registry entry in `prime-reports.registry.ts` has no period-variant logic, unlike the Batch 5 period-variant report types).
- No new database writes, migrations, or registry changes in this batch — purely additive rendering + one new route.
