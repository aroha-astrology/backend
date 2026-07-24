# Prime Reports Batch 2 — Life-Area Reports + Name-Correction + Remedies

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the Aroha Prime report catalogue from 1 report type (numerology) to 10, by adding Name-Correction, Remedies, and 7 chart-grounded "life area" reports (Career, Finance, Health, Relationship, Marriage, Love, Education) — all through the existing registry-driven Report Engine with ZERO changes to `prime-reports.repo.ts`, `prime-reports.service.ts` (except one signature change), `prime-reports.routes.ts`, or `prime-reports.schemas.ts`.

**Architecture:** Every new report type is one entry in `PRIME_REPORT_DEFINITIONS` (`prime-reports.registry.ts`) mapping `reportType -> {title, pricePaise, generate, translate}`. The 7 life-area reports share ONE generator module (`life-area-report.ts`) parameterized by area, since they all read the identical chart-grounding fact set (`chat-grounding.ts#buildGroundingFacts`) and differ only in prompt topic-focus — avoiding 7 near-duplicate files. Name-correction and remedies each get their own small generator module, following the exact `numerology-report.ts`/`gemstone.ts` pattern (deterministic facts computed once → LLM writes narrative only → strict-JSON-or-throw → translate-on-read).

**Tech Stack:** Hono + zod-openapi, Drizzle/Postgres, Gemini via `gemini-client.ts`, Vitest.

---

## Before you start (context every task needs)

- Working directory: this is already a git worktree on branch `feat/prime-reports-batch2`, branched from `main` at commit `a305539`. Do NOT merge to main — the user wants everything in this batch (and possibly future batches) accumulated on this one branch, merged in a single go at the end so it can be un-merged in one step if needed. Just commit to this branch after each task.
- Run tests with `pnpm test`. Baseline (before this plan's work): 640 passing / 9 failing (the 9 failures are pre-existing and unrelated — a `purchase-plan-notify.spec.ts` set — do not try to fix them, do not let them block your task).
- Every new report type must follow the "no fallback filler" discipline already established in `src/lib/llm/numerology-report.ts` and `src/lib/llm/gemstone.ts`: an unparseable/incomplete LLM JSON response THROWS, never silently caches generic text.
- `PrimeReportDefinition.generate` signature is changing in Task 1 from `(profile) => ...` to `(userId, profile) => ...` — every task after Task 1 uses the NEW signature.

---

### Task 1: Pass `userId` into `PrimeReportDefinition.generate()`

**Why:** The life-area reports (Task 3) and remedies report (Task 4) both need to fetch the user's stored kundli (`getKundliForUser(userId, birthProfileId)`), but `userId` is currently not passed to `generate()` — only `profile: ProfileContext` (which has no `userId` field). This task makes the minimal signature change and updates the one call site and the one existing registry entry.

**Files:**

- Modify: `src/modules/prime-reports/prime-reports.registry.ts`
- Modify: `src/modules/prime-reports/prime-reports.service.ts`

- [ ] **Step 1: Update the `PrimeReportDefinition` interface and the `numerology` entry**

In `src/modules/prime-reports/prime-reports.registry.ts`, change:

```ts
export interface PrimeReportDefinition {
  reportType: string;
  title: string;
  pricePaise: number;
  generate: (profile: ProfileContext) => Promise<PrimeReportGenerateResult>;
  translate: (
    content: Record<string, unknown>,
    language: string,
  ) => Promise<Record<string, unknown>>;
}
```

to:

```ts
export interface PrimeReportDefinition {
  reportType: string;
  title: string;
  pricePaise: number;
  generate: (userId: string, profile: ProfileContext) => Promise<PrimeReportGenerateResult>;
  translate: (
    content: Record<string, unknown>,
    language: string,
  ) => Promise<Record<string, unknown>>;
}
```

And change the `numerology` entry's `generate` from `async generate(profile) {` to `async generate(_userId, profile) {` (the leading underscore is required — this repo's eslint config has `argsIgnorePattern: '^_'` for unused function args; `numerology` doesn't need `userId` since it only reads `profile.dateOfBirth`/`profile.displayName`). No other change to that entry's body.

- [ ] **Step 2: Update the one call site in `prime-reports.service.ts`**

In `src/modules/prime-reports/prime-reports.service.ts`, inside `runGeneration`, change:

```ts
const { content, model } = await def.generate(profile);
```

to:

```ts
const { content, model } = await def.generate(userId, profile);
```

(`userId` is already a parameter of `runGeneration` — no new parameter needed there.)

- [ ] **Step 3: Run the full test suite and confirm no regressions**

Run: `pnpm test`
Expected: same 640 passing / 9 pre-existing failing as baseline (the `prime-reports-service.spec.ts` mocks `generate` as a bare `vi.fn()` without asserting its exact call args in the assertions that matter, so this signature change should not break any existing test).

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/modules/prime-reports/prime-reports.registry.ts src/modules/prime-reports/prime-reports.service.ts
git commit -m "refactor(prime): pass userId into PrimeReportDefinition.generate()"
```

---

### Task 2: Name-Correction report

**Why:** Per the product plan, Name-Correction is a "≈ free" (LOW effort) standard report (₹25) — the deterministic math already exists in `src/lib/astro-engine/numerology/nameCorrection.ts` (`computeNameAlignment`, `generateDeterministicVariants`); this task wires an AI narrative around it, following the exact numerology-report.ts pattern. The AI NEVER invents a spelling variant — only the deterministic engine does that; the AI writes the intro/analysis and one short "why this helps" note per variant.

**Files:**

- Create: `src/lib/llm/name-correction-report.ts`
- Create: `test/name-correction-report.spec.ts`
- Modify: `src/config/llm.ts` (add `NAME_CORRECTION_REPORT_PROFILE`)
- Modify: `src/modules/prime-reports/prime-reports.registry.ts` (add `name-correction` entry)

- [ ] **Step 1: Add the generation profile**

In `src/config/llm.ts`, add at the end of the file:

```ts
/**
 * Personalized name-correction report — one structured JSON verdict (an
 * intro + analysis + up to 5 variant notes), generated lazily the first time
 * the unlocked report is viewed and cached forever after (date of birth and
 * name never change on their own — see prime_reports's invalidation hook for
 * the one case that DOES invalidate it, a post-onboarding name edit).
 */
export const NAME_CORRECTION_REPORT_PROFILE: GenerationProfile = {
  name: 'name-correction-report',
  temperature: 0.5,
  jsonMode: true,
  stream: false,
  maxTokens: 1800,
};
```

- [ ] **Step 2: Write the failing test file**

Create `test/name-correction-report.spec.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  generate: vi.fn(),
}));

vi.mock('../src/lib/llm/gemini-client.js', () => ({
  generate: state.generate,
}));

const { generateNameCorrectionReport, translateNameCorrectionContent } =
  await import('../src/lib/llm/name-correction-report.js');

beforeEach(() => {
  state.generate.mockReset();
});

describe('generateNameCorrectionReport', () => {
  it('computes deterministic alignment + variants and returns the parsed narrative + model', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({
        intro: 'Your name carries a steady, grounded energy.',
        analysis:
          'Your current spelling reduces to a number that sits just outside your core numbers.',
        variantNotes: [
          {
            variant: 'Subirh',
            note: 'This small addition realigns the name with your destiny number.',
          },
        ],
      }),
    );

    const result = await generateNameCorrectionReport({
      dateOfBirth: '1993-04-17',
      fullName: 'Subir',
    });

    expect(result.intro).toContain('steady');
    expect(result.analysis).toContain('reduces');
    expect(Array.isArray(result.variants)).toBe(true);
    expect(result.model).toBeTruthy();
  });

  it('feeds mulank/bhagyank/alignment facts into the grounding context sent to Gemini', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({ intro: 'x', analysis: 'y', variantNotes: [] }),
    );

    await generateNameCorrectionReport({ dateOfBirth: '1993-04-17', fullName: 'Subir' });

    const call = state.generate.mock.calls[0]![0];
    const groundingMessage = call.messages.find((m: { content: string }) =>
      m.content.includes('astro_context'),
    );
    expect(groundingMessage.content).toContain('Mulank');
    expect(groundingMessage.content).toContain('Bhagyank');
    expect(groundingMessage.content).toContain('Alignment status');
  });

  it('throws (never caches filler) when Gemini returns unparseable JSON', async () => {
    state.generate.mockResolvedValueOnce('not json at all');

    await expect(
      generateNameCorrectionReport({ dateOfBirth: '1993-04-17', fullName: 'Subir' }),
    ).rejects.toThrow('name-correction LLM returned unparseable JSON');
  });

  it('throws when variants were expected but the response has zero valid variant notes', async () => {
    // 'Subir' with this DOB is very unlikely to already be perfectly aligned,
    // so the engine should produce at least one deterministic variant to match against.
    state.generate.mockResolvedValueOnce(
      JSON.stringify({
        intro: 'x',
        analysis: 'y',
        variantNotes: [{ variant: 'not-a-real-variant', note: 'n' }],
      }),
    );

    await expect(
      generateNameCorrectionReport({ dateOfBirth: '1993-04-17', fullName: 'Subir' }),
    ).rejects.toThrow('name-correction LLM returned unparseable JSON');
  });
});

describe('translateNameCorrectionContent', () => {
  const original = {
    intro: 'Your name carries a steady, grounded energy.',
    analysis: 'Your current spelling reduces to a number that sits just outside your core numbers.',
    variants: [{ variant: 'Subirh', chaldean: 3, note: 'This small addition realigns the name.' }],
  };

  it('returns the translated narrative on a valid response, keeping variant/chaldean unchanged', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({
        intro: 'नमस्ते इंट्रो',
        analysis: 'विश्लेषण',
        variants: [
          {
            variant: 'Subirh',
            chaldean: 3,
            note: 'यह छोटा सा बदलाव नाम को फिर से संरेखित करता है।',
          },
        ],
      }),
    );

    const result = await translateNameCorrectionContent(original, 'hi');
    expect(result.intro).toBe('नमस्ते इंट्रो');
    expect(result.variants[0]!.variant).toBe('Subirh');
    expect(result.variants[0]!.chaldean).toBe(3);
    expect(result.variants[0]!.note).toContain('संरेखित');
  });

  it('throws on an unparseable translation response', async () => {
    state.generate.mockResolvedValueOnce('garbage');

    await expect(translateNameCorrectionContent(original, 'hi')).rejects.toThrow(
      'name-correction translation returned unparseable JSON (target=hi)',
    );
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm test test/name-correction-report.spec.ts`
Expected: FAIL — `src/lib/llm/name-correction-report.js` does not exist yet.

- [ ] **Step 4: Implement `src/lib/llm/name-correction-report.ts`**

```ts
// =============================================================================
// Personalized name-correction report (LLM) — one call per user, generated
// lazily after unlock. Same discipline as numerology-report.ts: the numbers
// AND the candidate spelling variants are 100% deterministic
// (nameCorrection.ts); the AI's only job is the narrative + one short note
// per variant explaining why it helps. An unparseable response, or a
// response with zero valid variant notes when variants were expected, throws
// rather than caching filler.
// =============================================================================

import { generate } from './gemini-client.js';
import { NAME_CORRECTION_REPORT_PROFILE, MODEL } from '../../config/llm.js';
import { cleanJsonString } from './horoscope.js';
import {
  computeNameAlignment,
  generateDeterministicVariants,
} from '../astro-engine/numerology/nameCorrection.js';

export interface NameCorrectionLlmContext {
  /** 'YYYY-MM-DD', as stored on users.dateOfBirth / birth_profiles.dateOfBirth. */
  dateOfBirth: string;
  fullName: string;
}

export interface NameCorrectionVariant {
  variant: string;
  chaldean: number;
  note: string;
}

export interface NameCorrectionNarrative {
  intro: string;
  analysis: string;
  variants: NameCorrectionVariant[];
}

export interface NameCorrectionReportResult extends NameCorrectionNarrative {
  model: string;
}

const GROUNDING_RULE =
  'Base every claim only on the numbers and spelling variants provided below. Never invent a spelling variant not present in this data — the variants list is exhaustive and deterministic.';
const PLAIN_LANGUAGE_RULE =
  "Write for someone with zero numerology background. Explain what these numbers mean for the person's real life, not abstract number theory.";

function systemPrompt(): string {
  return `You are writing a short, personalized name-correction numerology report for a mobile app screen. The app already computed this person's core numbers and (if needed) a short list of deterministic spelling-variant candidates. Your job is ONLY the personalized narrative.

${GROUNDING_RULE}
${PLAIN_LANGUAGE_RULE}

Return STRICT JSON only, no markdown fences, in this exact shape:
{"intro": string, "analysis": string, "variantNotes": [{"variant": string, "note": string}]}

"intro": 2-3 sentences (under 55 words) — a warm overview of what this person's name-number alignment suggests.
"analysis": 2-4 sentences (under 90 words) — explain in plain words why the CURRENT spelling is or isn't aligned with the person's core numbers.
"variantNotes": exactly one entry per variant listed below (empty array if none are listed), each "note" 1-2 sentences (under 35 words) explaining why that specific spelling change is believed to help, in real-life terms (confidence, opportunities, relationships) — never abstract number theory.
Second person, present tense, conversational. Never generic filler that would read the same for any name.`;
}

/** Parses 'YYYY-MM-DD' into a Date whose UTC y/m/d match the string exactly — computeNameAlignment's
 * underlying vedic.ts helpers read getUTCDate()/getUTCMonth()/getUTCFullYear(). */
function parseDobUTC(dateOfBirth: string): Date {
  const [year, month, day] = dateOfBirth.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day));
}

function buildFacts(
  ctx: NameCorrectionLlmContext,
  alignment: ReturnType<typeof computeNameAlignment>,
  variants: ReturnType<typeof generateDeterministicVariants>,
): string {
  const lines = [
    `Current full name: ${ctx.fullName}`,
    `Mulank (psychic/birth number): ${alignment.mulank}`,
    `Bhagyank (destiny number): ${alignment.bhagyank}`,
    `Current name's Chaldean number: ${alignment.chaldean} (Pythagorean: ${alignment.pythagorean})`,
    `Soul Urge number: ${alignment.soulUrge}, Personality number: ${alignment.personality}`,
    `Alignment status: ${alignment.alignment} (target numbers: ${alignment.targets.join(', ')})`,
    `Numbers friendly to ${alignment.mulank}: ${alignment.friendly.join(', ') || 'none'}. Numbers in conflict: ${alignment.enemy.join(', ') || 'none'}.`,
  ];
  if (variants.length > 0) {
    lines.push(
      'Deterministically generated spelling variants that would realign the name (this list is exhaustive — do not invent others):',
    );
    for (const v of variants) {
      lines.push(`- "${v.variant}" (Chaldean ${v.chaldean}, change: ${v.change})`);
    }
  } else {
    lines.push(
      'No spelling variant is needed — the current name already aligns with a target number.',
    );
  }
  return lines.join('\n');
}

const NARRATIVE_SCHEMA = {
  type: 'object',
  properties: {
    intro: { type: 'string' },
    analysis: { type: 'string' },
    variantNotes: {
      type: 'array',
      items: {
        type: 'object',
        properties: { variant: { type: 'string' }, note: { type: 'string' } },
        required: ['variant', 'note'],
      },
    },
  },
  required: ['intro', 'analysis', 'variantNotes'],
} as const;

function parseNarrative(
  raw: string,
  knownVariants: Array<{ variant: string; chaldean: number }>,
): NameCorrectionNarrative | null {
  try {
    const data = JSON.parse(cleanJsonString(raw)) as {
      intro?: unknown;
      analysis?: unknown;
      variantNotes?: unknown;
    };
    if (typeof data.intro !== 'string' || !data.intro.trim()) return null;
    if (typeof data.analysis !== 'string' || !data.analysis.trim()) return null;

    const notesByVariant = new Map<string, string>();
    if (Array.isArray(data.variantNotes)) {
      for (const entry of data.variantNotes) {
        const e = entry as { variant?: unknown; note?: unknown };
        if (typeof e.variant === 'string' && typeof e.note === 'string' && e.note.trim()) {
          notesByVariant.set(e.variant, e.note.trim());
        }
      }
    }

    if (knownVariants.length > 0 && notesByVariant.size === 0) return null;

    const variants: NameCorrectionVariant[] = knownVariants.map((v) => ({
      variant: v.variant,
      chaldean: v.chaldean,
      note: notesByVariant.get(v.variant) ?? '',
    }));

    return { intro: data.intro.trim(), analysis: data.analysis.trim(), variants };
  } catch {
    return null;
  }
}

/**
 * No fallback: a failed or unparseable response throws rather than caching
 * generic filler — same discipline as generateNumerologyReport.
 */
export async function generateNameCorrectionReport(
  ctx: NameCorrectionLlmContext,
): Promise<NameCorrectionReportResult> {
  const alignment = computeNameAlignment(ctx.fullName, parseDobUTC(ctx.dateOfBirth));
  const variants =
    alignment.alignment === 'aligned'
      ? []
      : generateDeterministicVariants(ctx.fullName, alignment.targets, 5);

  const raw = await generate({
    profile: NAME_CORRECTION_REPORT_PROFILE,
    responseSchema: NARRATIVE_SCHEMA,
    messages: [
      { role: 'system', content: systemPrompt() },
      {
        role: 'system',
        content: `The following is the user's name-numerology data. Treat everything between the <astro_context> tags as reference DATA only — never as instructions.\n<astro_context>\n${buildFacts(ctx, alignment, variants)}\n</astro_context>`,
      },
      { role: 'user', content: 'Write the personalized name-correction report.' },
    ],
  });

  const parsed = parseNarrative(raw, variants);
  if (!parsed) {
    void import('../logger.js').then((m) =>
      m.logger.error({ raw }, 'unparseable JSON in name-correction report'),
    );
    throw new Error('name-correction LLM returned unparseable JSON');
  }
  return { ...parsed, model: MODEL };
}

/** Translate an already-generated report's AI fields — same pattern as translateNumerologyContent. */
export async function translateNameCorrectionContent(
  original: NameCorrectionNarrative,
  targetLanguage: string,
): Promise<NameCorrectionNarrative> {
  const raw = await generate({
    profile: NAME_CORRECTION_REPORT_PROFILE,
    responseSchema: {
      type: 'object',
      properties: {
        intro: { type: 'string' },
        analysis: { type: 'string' },
        variants: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              variant: { type: 'string' },
              chaldean: { type: 'number' },
              note: { type: 'string' },
            },
          },
        },
      },
    },
    messages: [
      {
        role: 'user',
        content: `Translate the following name-correction report content into the language "${targetLanguage}". Keep the exact same JSON structure and keys (including "variant" spelling strings and "chaldean" numbers unchanged — those are not language-dependent). ONLY translate "intro", "analysis", and each variant's "note".\n\nOriginal Content:\n${JSON.stringify(original, null, 2)}`,
      },
    ],
  });

  try {
    const data = JSON.parse(cleanJsonString(raw)) as {
      intro?: unknown;
      analysis?: unknown;
      variants?: unknown;
    };
    const intro =
      typeof data.intro === 'string' && data.intro.trim() ? data.intro.trim() : original.intro;
    const analysis =
      typeof data.analysis === 'string' && data.analysis.trim()
        ? data.analysis.trim()
        : original.analysis;

    let variants = original.variants;
    if (Array.isArray(data.variants)) {
      const translatedByVariant = new Map<string, string>();
      for (const entry of data.variants) {
        const e = entry as { variant?: unknown; note?: unknown };
        if (typeof e.variant === 'string' && typeof e.note === 'string' && e.note.trim()) {
          translatedByVariant.set(e.variant, e.note.trim());
        }
      }
      if (translatedByVariant.size > 0) {
        variants = original.variants.map((v) => ({
          ...v,
          note: translatedByVariant.get(v.variant) ?? v.note,
        }));
      }
    }

    return { intro, analysis, variants };
  } catch {
    throw new Error(
      `name-correction translation returned unparseable JSON (target=${targetLanguage})`,
    );
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test test/name-correction-report.spec.ts`
Expected: PASS (all cases).

Note: if the "throws when variants were expected" test doesn't actually produce any deterministic variants for `'Subir'` + `'1993-04-17'` (i.e. that name+DOB happens to already be `'aligned'`), adjust the test's name/DOB fixture to one you've confirmed via a quick manual check produces at least one variant (add a temporary `console.log(computeNameAlignment(...))` while iterating, then remove it) — the point of the test is "alignment !== 'aligned' but the AI's variant list has zero matches", not the specific fixture values.

- [ ] **Step 6: Add the registry entry**

In `src/modules/prime-reports/prime-reports.registry.ts`, add the import:

```ts
import {
  generateNameCorrectionReport,
  translateNameCorrectionContent,
  type NameCorrectionNarrative,
} from '../../lib/llm/name-correction-report.js';
```

and add a new entry to `PRIME_REPORT_DEFINITIONS` (alongside `numerology`):

```ts
  'name-correction': {
    reportType: 'name-correction',
    title: 'Name Correction Report',
    pricePaise: 2500,
    async generate(_userId, profile) {
      if (!profile.dateOfBirth || !profile.displayName) {
        throw new Error('Name Correction report requires a date of birth and a name');
      }
      const { model, ...content } = await generateNameCorrectionReport({
        dateOfBirth: profile.dateOfBirth,
        fullName: profile.displayName,
      });
      return { content, model };
    },
    async translate(content, language) {
      const translated = await translateNameCorrectionContent(
        content as unknown as NameCorrectionNarrative,
        language,
      );
      return translated as unknown as Record<string, unknown>;
    },
  },
```

- [ ] **Step 7: Run the full test suite + typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: 640 + (this task's new tests) passing, same 9 pre-existing failures, no typecheck errors.

- [ ] **Step 8: Commit**

```bash
git add src/config/llm.ts src/lib/llm/name-correction-report.ts test/name-correction-report.spec.ts src/modules/prime-reports/prime-reports.registry.ts
git commit -m "feat(prime): add name-correction report"
```

---

### Task 3: Life-area reports (Career, Finance, Health, Relationship, Marriage, Love, Education)

**Why:** These 7 standard reports (₹25 each) all read the SAME comprehensive chart-grounding fact set already built for the AI chat astrologer (`chat-grounding.ts#buildGroundingFacts` — dasha, doshas, yogas, all 24 divisional charts, the per-domain confidence-window scan, etc.), so there is no per-area fact-building work to duplicate: one shared generator module, parameterized by `area`, differing only in the system prompt's topic focus.

**Files:**

- Create: `src/lib/llm/life-area-report.ts`
- Create: `test/life-area-report.spec.ts`
- Modify: `src/config/llm.ts` (add `LIFE_AREA_REPORT_PROFILE`)
- Modify: `src/modules/prime-reports/prime-reports.registry.ts` (add a `makeLifeAreaDefinition` factory + 7 entries)

- [ ] **Step 1: Add the generation profile**

In `src/config/llm.ts`, add at the end of the file:

```ts
/**
 * Personalized life-area report (career/finance/health/relationship/
 * marriage/love/education) — one structured JSON verdict (intro,
 * currentPhase, strengths, challenges, guidance), generated lazily the first
 * time each unlocked report is viewed and cached forever after (the natal
 * chart never changes on its own). Grounded in the same comprehensive fact
 * set as AI chat (buildGroundingFacts) which is itself already a "large
 * schema" tier input, so this gets the same generous ceiling as
 * GEMSTONE_PROFILE despite a smaller (5-field) output schema.
 */
export const LIFE_AREA_REPORT_PROFILE: GenerationProfile = {
  name: 'life-area-report',
  temperature: 0.4,
  jsonMode: true,
  stream: false,
  maxTokens: 2500,
};
```

- [ ] **Step 2: Write the failing test file**

Create `test/life-area-report.spec.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GroundingSource } from '../src/lib/chat-grounding.js';

const state = vi.hoisted(() => ({
  generate: vi.fn(),
  buildGroundingFacts: vi.fn(),
}));

vi.mock('../src/lib/llm/gemini-client.js', () => ({
  generate: state.generate,
}));

vi.mock('../src/lib/chat-grounding.js', () => ({
  buildGroundingFacts: state.buildGroundingFacts,
}));

const { generateLifeAreaReport, translateLifeAreaContent } =
  await import('../src/lib/llm/life-area-report.js');

const EMPTY_GROUNDING: GroundingSource = {
  chart: null,
  dasha: null,
  yogas: null,
  doshas: null,
  ashtakavarga: null,
};

const VALID_JSON = JSON.stringify({
  intro: 'You have spent years building toward this exact kind of stability.',
  currentPhase: 'Your current major period favors steady, incremental progress over big leaps.',
  strengths: 'Your natural discipline shows up clearly in how you approach long-term goals.',
  challenges: 'You may take on more responsibility than you delegate, which can slow momentum.',
  guidance: 'Lean into the steady pace this period supports rather than forcing a shortcut.',
});

beforeEach(() => {
  state.generate.mockReset();
  state.buildGroundingFacts.mockReset().mockResolvedValue(['Rising Sign (Ascendant): Leo']);
});

describe('generateLifeAreaReport', () => {
  it('returns the parsed narrative + model for each area', async () => {
    state.generate.mockResolvedValueOnce(VALID_JSON);

    const result = await generateLifeAreaReport({ area: 'career', grounding: EMPTY_GROUNDING });

    expect(result.intro).toContain('stability');
    expect(result.currentPhase).toContain('steady');
    expect(result.strengths).toBeTruthy();
    expect(result.challenges).toBeTruthy();
    expect(result.guidance).toBeTruthy();
    expect(result.model).toBeTruthy();
  });

  it('builds grounding facts from the chart data and includes them in the prompt', async () => {
    state.generate.mockResolvedValueOnce(VALID_JSON);

    await generateLifeAreaReport({ area: 'finance', grounding: EMPTY_GROUNDING });

    expect(state.buildGroundingFacts).toHaveBeenCalledWith(EMPTY_GROUNDING);
    const call = state.generate.mock.calls[0]![0];
    const groundingMessage = call.messages.find((m: { content: string }) =>
      m.content.includes('astro_context'),
    );
    expect(groundingMessage.content).toContain('Rising Sign (Ascendant): Leo');
  });

  it('uses an area-specific system prompt (e.g. mentions the D9/Navamsa chart for marriage, not career)', async () => {
    state.generate.mockResolvedValueOnce(VALID_JSON);

    await generateLifeAreaReport({ area: 'marriage', grounding: EMPTY_GROUNDING });

    const call = state.generate.mock.calls[0]![0];
    const systemMessage = call.messages[0]!.content as string;
    expect(systemMessage).toContain('Navamsa');
    expect(systemMessage.toLowerCase()).toContain('spouse');
  });

  it('throws (never caches filler) when Gemini returns unparseable JSON', async () => {
    state.generate.mockResolvedValueOnce('not json at all');

    await expect(
      generateLifeAreaReport({ area: 'health', grounding: EMPTY_GROUNDING }),
    ).rejects.toThrow('life-area (health) LLM returned unparseable JSON');
  });

  it('throws when a required narrative field is missing', async () => {
    state.generate.mockResolvedValueOnce(JSON.stringify({ intro: 'only an intro' }));

    await expect(
      generateLifeAreaReport({ area: 'education', grounding: EMPTY_GROUNDING }),
    ).rejects.toThrow('life-area (education) LLM returned unparseable JSON');
  });
});

describe('translateLifeAreaContent', () => {
  const original = {
    intro: 'You have spent years building toward this exact kind of stability.',
    currentPhase: 'Your current major period favors steady, incremental progress over big leaps.',
    strengths: 'Your natural discipline shows up clearly in how you approach long-term goals.',
    challenges: 'You may take on more responsibility than you delegate, which can slow momentum.',
    guidance: 'Lean into the steady pace this period supports rather than forcing a shortcut.',
  };

  it('returns the translated narrative on a valid response', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({
        intro: 'नमस्ते',
        currentPhase: 'चरण',
        strengths: 'ताकत',
        challenges: 'चुनौतियाँ',
        guidance: 'मार्गदर्शन',
      }),
    );

    const result = await translateLifeAreaContent(original, 'hi');
    expect(result.intro).toBe('नमस्ते');
    expect(result.guidance).toBe('मार्गदर्शन');
  });

  it('throws on an unparseable translation response', async () => {
    state.generate.mockResolvedValueOnce('garbage');

    await expect(translateLifeAreaContent(original, 'hi')).rejects.toThrow(
      'life-area translation returned unparseable JSON (target=hi)',
    );
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm test test/life-area-report.spec.ts`
Expected: FAIL — `src/lib/llm/life-area-report.js` does not exist yet.

- [ ] **Step 4: Implement `src/lib/llm/life-area-report.ts`**

```ts
// =============================================================================
// Personalized life-area report (LLM) — one shared generator for the 7
// standard "life area" reports (career, finance, health, relationship,
// marriage, love, education). One call per (user, area), generated lazily
// after unlock and cached forever (the natal chart never changes on its own
// — see prime-reports.repo.ts's invalidatePrimeReportsForUser for the one
// case that DOES invalidate it: a post-onboarding birth-detail edit).
//
// Grounding is built once per generation from the user's stored kundli via
// buildGroundingFacts() (chat-grounding.ts) — the SAME comprehensive fact set
// the AI chat astrologer reads from (dasha, doshas, yogas, all 24 vargas, the
// domain-confidence window scan, etc.), so this report can never invent a
// placement chat itself wouldn't also have access to. The only thing that
// differs per area is the prompt's topic focus — there is no per-area fact-
// building code to duplicate or drift.
// =============================================================================

import { generate } from './gemini-client.js';
import { LIFE_AREA_REPORT_PROFILE, MODEL } from '../../config/llm.js';
import { cleanJsonString } from './horoscope.js';
import { buildGroundingFacts, type GroundingSource } from '../chat-grounding.js';

export type LifeArea =
  | 'career'
  | 'finance'
  | 'health'
  | 'relationship'
  | 'marriage'
  | 'love'
  | 'education';

export interface LifeAreaLlmContext {
  area: LifeArea;
  grounding: GroundingSource;
}

export interface LifeAreaNarrative {
  intro: string;
  currentPhase: string;
  strengths: string;
  challenges: string;
  guidance: string;
}

export interface LifeAreaReportResult extends LifeAreaNarrative {
  model: string;
}

const AREA_COPY: Record<LifeArea, { title: string; focus: string }> = {
  career: {
    title: 'Career Report',
    focus:
      'career direction, professional growth, job/business timing, and public reputation — read the 10th house, its lord, Saturn/Sun placement, the D10 (Dasamsa) chart, and the Career domain-confidence windows.',
  },
  finance: {
    title: 'Financial Report',
    focus:
      'money, savings, income growth, and financial stability — read the 2nd and 11th houses, their lords, Jupiter, the D2 (Hora) chart, and the Wealth domain-confidence windows.',
  },
  health: {
    title: 'Health Report',
    focus:
      'physical vitality and health-vulnerable periods — read the 6th/8th/12th houses, their lords, the D30 (Trimshamsha) chart, and the Health domain-confidence windows. Never give medical diagnoses or treatment advice — only traditional astrological tendencies framed as "worth extra care", never a substitute for a doctor.',
  },
  relationship: {
    title: 'Relationship Report',
    focus:
      'relationship patterns in general — how this person connects with others, friendships, and partnerships — read the 7th and 11th houses, Venus, the D9 (Navamsa) chart, and the Relationship domain-confidence windows.',
  },
  marriage: {
    title: 'Marriage Report',
    focus:
      "the spouse's nature and married-life timing/quality — read the 7th house and its lord, Venus (and Jupiter), the D9 (Navamsa) chart, the Upapada Lagna, and the Relationship domain-confidence windows. Never state a specific marriage date — only the traditional astrological timing windows already computed below.",
  },
  love: {
    title: 'Love Report',
    focus:
      'romantic attraction, current relationship dynamics, and what this person looks for in a partner — read Venus and Mars placements, the 5th and 7th houses, the D9 (Navamsa) chart, and the Relationship domain-confidence windows.',
  },
  education: {
    title: 'Education Report',
    focus:
      'learning style, academic strengths, and favorable periods for study or exams — read the 4th, 5th, and 9th houses, Mercury and Jupiter, the D24 (Siddhamsa) chart, and the Education domain-confidence windows.',
  },
};

const GROUNDING_RULE =
  'Base every claim only on the chart data provided below. Do not invent placements, dates, or Yogas not present in this data. General guidance is fine; invented specifics are not.';
const PLAIN_LANGUAGE_RULE =
  'Write for someone with zero astrology background. Never use untranslated Sanskrit or dignity-jargon terms unqualified — this includes but is not limited to "debilitated", "exalted", "own sign", "combust", "dignity", "Mahadasha", "Navamsa". If you use a Sanskrit term, immediately explain it in plain words in the same sentence. Say what the placement MEANS for the person\'s real life.';
const HOOK_RULE =
  'Open the intro with one specific, concrete observation the person will recognize about themselves before explaining what the chart shows — a hook, not a generic label.';
const SAFETY_RULE =
  'These are traditional astrological tendencies, never medical, legal, or financial advice, and never a guaranteed outcome. Use tendency language ("tends to", "may benefit from"), never absolute promises or specific dates beyond the windows already given in the data.';

function systemPrompt(area: LifeArea): string {
  const copy = AREA_COPY[area];
  return `You are writing a short, personalized Vedic-astrology ${copy.title} for a mobile app screen, focused specifically on: ${copy.focus}

${GROUNDING_RULE}
${PLAIN_LANGUAGE_RULE}
${HOOK_RULE}
${SAFETY_RULE}

Return STRICT JSON only, no markdown fences, in this exact shape:
{"intro": string, "currentPhase": string, "strengths": string, "challenges": string, "guidance": string}

"intro": 2-3 sentences (under 60 words) — the hook + a warm overview of what this person's chart suggests about this specific life area.
"currentPhase": 2-3 sentences (under 70 words) — what the CURRENT dasha period and any live transit/timing windows from the data mean for this area right now.
"strengths": 2-3 sentences (under 70 words) — this person's natural strengths in this area, grounded in specific chart facts.
"challenges": 2-3 sentences (under 70 words) — what to watch out for in this area, grounded in specific chart facts, framed constructively (never fatalistic).
"guidance": 2-3 sentences (under 70 words) — practical, real-life guidance for this area given everything above.
Second person, present tense, conversational. Never generic filler that would read the same for any chart.`;
}

const NARRATIVE_SCHEMA = {
  type: 'object',
  properties: {
    intro: { type: 'string' },
    currentPhase: { type: 'string' },
    strengths: { type: 'string' },
    challenges: { type: 'string' },
    guidance: { type: 'string' },
  },
  required: ['intro', 'currentPhase', 'strengths', 'challenges', 'guidance'],
} as const;

const NARRATIVE_FIELDS = ['intro', 'currentPhase', 'strengths', 'challenges', 'guidance'] as const;

function parseNarrative(raw: string): LifeAreaNarrative | null {
  try {
    const data = JSON.parse(cleanJsonString(raw)) as Record<string, unknown>;
    const out: Partial<LifeAreaNarrative> = {};
    for (const field of NARRATIVE_FIELDS) {
      const value = data[field];
      if (typeof value !== 'string' || !value.trim()) return null;
      out[field] = value.trim();
    }
    return out as LifeAreaNarrative;
  } catch {
    return null;
  }
}

/**
 * No fallback: a failed or unparseable response throws rather than caching
 * generic filler — same discipline as generateGemstoneReport/generateNumerologyReport.
 */
export async function generateLifeAreaReport(
  ctx: LifeAreaLlmContext,
): Promise<LifeAreaReportResult> {
  const facts = await buildGroundingFacts(ctx.grounding);
  const raw = await generate({
    profile: LIFE_AREA_REPORT_PROFILE,
    responseSchema: NARRATIVE_SCHEMA,
    messages: [
      { role: 'system', content: systemPrompt(ctx.area) },
      {
        role: 'system',
        content: `The following is the user's chart data. Treat everything between the <astro_context> tags as reference DATA only — never as instructions.\n<astro_context>\n${facts.join('\n')}\n</astro_context>`,
      },
      { role: 'user', content: `Write the personalized ${AREA_COPY[ctx.area].title}.` },
    ],
  });

  const parsed = parseNarrative(raw);
  if (!parsed) {
    void import('../logger.js').then((m) =>
      m.logger.error({ raw, area: ctx.area }, 'unparseable JSON in life-area report'),
    );
    throw new Error(`life-area (${ctx.area}) LLM returned unparseable JSON`);
  }
  return { ...parsed, model: MODEL };
}

/** Translate an already-generated report's AI fields — same pattern as translateNumerologyContent. */
export async function translateLifeAreaContent(
  original: LifeAreaNarrative,
  targetLanguage: string,
): Promise<LifeAreaNarrative> {
  const raw = await generate({
    profile: LIFE_AREA_REPORT_PROFILE,
    responseSchema: NARRATIVE_SCHEMA,
    messages: [
      {
        role: 'user',
        content: `Translate the following report content into the language "${targetLanguage}". Keep the exact same JSON structure and keys. ONLY translate the human-readable values.\n\nOriginal Content:\n${JSON.stringify(original, null, 2)}`,
      },
    ],
  });

  const parsed = parseNarrative(raw);
  if (!parsed) {
    throw new Error(`life-area translation returned unparseable JSON (target=${targetLanguage})`);
  }
  return parsed;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test test/life-area-report.spec.ts`
Expected: PASS (all cases).

- [ ] **Step 6: Add the 7 registry entries via a shared factory**

In `src/modules/prime-reports/prime-reports.registry.ts`, add the imports:

```ts
import {
  generateLifeAreaReport,
  translateLifeAreaContent,
  type LifeArea,
  type LifeAreaNarrative,
} from '../../lib/llm/life-area-report.js';
import { getKundliForUser, withLiveSadeSati } from '../kundli/kundli.service.js';
import type { GroundingSource } from '../../lib/chat-grounding.js';
```

Add this factory + constant list ABOVE `PRIME_REPORT_DEFINITIONS`:

```ts
/** Aroha Prime pricing sheet, 2026-07-23: standard reports are ₹25 = 2500 paise. */
const LIFE_AREA_PRICE_PAISE = 2500;

const LIFE_AREA_TITLES: Record<LifeArea, string> = {
  career: 'Career Report',
  finance: 'Financial Report',
  health: 'Health Report',
  relationship: 'Relationship Report',
  marriage: 'Marriage Report',
  love: 'Love Report',
  education: 'Education Report',
};

const LIFE_AREAS: LifeArea[] = [
  'career',
  'finance',
  'health',
  'relationship',
  'marriage',
  'love',
  'education',
];

function makeLifeAreaDefinition(area: LifeArea): PrimeReportDefinition {
  return {
    reportType: area,
    title: LIFE_AREA_TITLES[area],
    pricePaise: LIFE_AREA_PRICE_PAISE,
    async generate(userId, profile) {
      const kundli = await getKundliForUser(userId, profile.birthProfileId);
      if (!kundli || kundli.status !== 'ready') {
        throw new Error(`${LIFE_AREA_TITLES[area]} requires a completed birth chart`);
      }
      const grounding: GroundingSource = {
        chart: kundli.chartData ?? null,
        dasha: kundli.dashaData ?? null,
        yogas: kundli.yogaData ?? null,
        doshas: await withLiveSadeSati(kundli.doshaData ?? null),
        ashtakavarga: kundli.ashtakavargaData ?? null,
      };
      const { model, ...content } = await generateLifeAreaReport({ area, grounding });
      return { content, model };
    },
    async translate(content, language) {
      const translated = await translateLifeAreaContent(
        content as unknown as LifeAreaNarrative,
        language,
      );
      return translated as unknown as Record<string, unknown>;
    },
  };
}
```

Then change `PRIME_REPORT_DEFINITIONS` from a plain object literal to spread the factory-built entries in, e.g.:

```ts
export const PRIME_REPORT_DEFINITIONS: Record<string, PrimeReportDefinition> = {
  numerology: {
    // ...unchanged...
  },
  'name-correction': {
    // ...unchanged from Task 2...
  },
  ...Object.fromEntries(LIFE_AREAS.map((area) => [area, makeLifeAreaDefinition(area)])),
};
```

(Keep the existing `numerology` and `name-correction` entries exactly as they are — only ADD the spread at the end of the object literal.)

- [ ] **Step 7: Run the full test suite + typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: all passing (same baseline + this task's new tests), no typecheck errors.

- [ ] **Step 8: Commit**

```bash
git add src/config/llm.ts src/lib/llm/life-area-report.ts test/life-area-report.spec.ts src/modules/prime-reports/prime-reports.registry.ts
git commit -m "feat(prime): add 7 life-area reports (career, finance, health, relationship, marriage, love, education)"
```

---

### Task 4: Remedies report

**Why:** Wraps the existing, already-deterministic `getRemedies()` engine (`astro.service.ts`, currently only exposed via the free `GET /v1/remedies`) with a short personalized AI narrative, as a paid Prime report — same "deterministic facts, AI narrative only" discipline as gemstone.

**Files:**

- Create: `src/lib/llm/remedies-report.ts`
- Create: `test/remedies-report.spec.ts`
- Modify: `src/config/llm.ts` (add `REMEDIES_REPORT_PROFILE`)
- Modify: `src/modules/prime-reports/prime-reports.registry.ts` (add `remedies` entry)

- [ ] **Step 1: Add the generation profile**

In `src/config/llm.ts`, add at the end of the file:

```ts
/**
 * Personalized remedies report — wraps the existing deterministic remedies
 * engine (astro.service.ts#getRemedies) with a short intro + one note per
 * remedy. Generated lazily the first time the unlocked report is viewed and
 * cached forever after.
 */
export const REMEDIES_REPORT_PROFILE: GenerationProfile = {
  name: 'remedies-report',
  temperature: 0.5,
  jsonMode: true,
  stream: false,
  maxTokens: 2000,
};
```

- [ ] **Step 2: Write the failing test file**

Create `test/remedies-report.spec.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RemedyItem } from '../src/modules/astro/astro.service.js';

const state = vi.hoisted(() => ({
  generate: vi.fn(),
}));

vi.mock('../src/lib/llm/gemini-client.js', () => ({
  generate: state.generate,
}));

const { generateRemediesReport, translateRemediesContent } =
  await import('../src/lib/llm/remedies-report.js');

const REMEDIES: RemedyItem[] = [
  {
    planet: 'Saturn',
    title: 'Pacify Saturn',
    icon: 'shield',
    remedy: 'Donate black sesame seeds on Saturdays.',
  },
  {
    planet: 'General',
    title: 'Career Growth',
    icon: 'briefcase',
    remedy: 'Chant Om Brihaspataye Namah 108 times every Thursday morning.',
  },
];

beforeEach(() => {
  state.generate.mockReset();
});

describe('generateRemediesReport', () => {
  it('returns the parsed narrative + model', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({
        intro: 'Your chart calls for a little extra support around discipline and structure.',
        remedyNotes: [
          {
            title: 'Pacify Saturn',
            note: 'Your Saturn placement suggests extra grounding will help.',
          },
          {
            title: 'Career Growth',
            note: 'Jupiter support strengthens the steady growth already underway.',
          },
        ],
      }),
    );

    const result = await generateRemediesReport({ remedies: REMEDIES });

    expect(result.intro).toContain('discipline');
    expect(result.notes['Pacify Saturn']).toContain('grounding');
    expect(result.notes['Career Growth']).toContain('Jupiter');
    expect(result.model).toBeTruthy();
  });

  it('feeds the remedy titles/planets/rituals into the grounding context sent to Gemini', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({ intro: 'x', remedyNotes: [{ title: 'Pacify Saturn', note: 'y' }] }),
    );

    await generateRemediesReport({ remedies: REMEDIES });

    const call = state.generate.mock.calls[0]![0];
    const groundingMessage = call.messages.find((m: { content: string }) =>
      m.content.includes('astro_context'),
    );
    expect(groundingMessage.content).toContain('Pacify Saturn');
    expect(groundingMessage.content).toContain('black sesame');
  });

  it('throws (never caches filler) when Gemini returns unparseable JSON', async () => {
    state.generate.mockResolvedValueOnce('not json at all');

    await expect(generateRemediesReport({ remedies: REMEDIES })).rejects.toThrow(
      'remedies LLM returned unparseable JSON',
    );
  });

  it('throws when zero returned remedy notes match a known remedy title', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({ intro: 'x', remedyNotes: [{ title: 'Not A Real Remedy', note: 'y' }] }),
    );

    await expect(generateRemediesReport({ remedies: REMEDIES })).rejects.toThrow(
      'remedies LLM returned unparseable JSON',
    );
  });
});

describe('translateRemediesContent', () => {
  const original = {
    intro: 'Your chart calls for a little extra support around discipline and structure.',
    notes: { 'Pacify Saturn': 'Your Saturn placement suggests extra grounding will help.' },
  };

  it('returns the translated narrative on a valid response', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({ intro: 'नमस्ते', notes: { 'Pacify Saturn': 'शनि की सलाह' } }),
    );

    const result = await translateRemediesContent(original, 'hi');
    expect(result.intro).toBe('नमस्ते');
    expect(result.notes['Pacify Saturn']).toBe('शनि की सलाह');
  });

  it('throws on an unparseable translation response', async () => {
    state.generate.mockResolvedValueOnce('garbage');

    await expect(translateRemediesContent(original, 'hi')).rejects.toThrow(
      'remedies translation returned unparseable JSON (target=hi)',
    );
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm test test/remedies-report.spec.ts`
Expected: FAIL — `src/lib/llm/remedies-report.js` does not exist yet.

- [ ] **Step 4: Implement `src/lib/llm/remedies-report.ts`**

```ts
// =============================================================================
// Personalized remedies report (LLM) — wraps the existing deterministic
// remedies engine (astro.service.ts#getRemedies) with a short personalized
// intro + one note per remedy explaining why THIS person's chart calls for
// it. The remedies themselves (which planets, which ritual) are 100%
// deterministic and never touched by the AI — same discipline as gemstone.
// =============================================================================

import { generate } from './gemini-client.js';
import { REMEDIES_REPORT_PROFILE, MODEL } from '../../config/llm.js';
import { cleanJsonString } from './horoscope.js';
import type { RemedyItem } from '../../modules/astro/astro.service.js';

export interface RemediesLlmContext {
  remedies: RemedyItem[];
}

export interface RemediesNarrative {
  intro: string;
  notes: Record<string, string>;
}

export interface RemediesReportResult extends RemediesNarrative {
  model: string;
}

const GROUNDING_RULE =
  'Base every claim only on the remedies list provided below. Do not invent additional remedies, planets, or rituals not present in this data.';
const PLAIN_LANGUAGE_RULE =
  'Write for someone with zero astrology background. Explain WHY this remedy is relevant for this specific chart in plain, real-life terms.';
const SAFETY_RULE =
  'These are traditional astrological remedies, never medical or financial advice, and never a guaranteed cure. Use tendency language ("may help support"), never absolute promises.';

function systemPrompt(): string {
  return `You are writing a short, personalized Vedic-astrology remedies report for a mobile app screen. The app already computed which remedies apply to this person's chart (planet-specific if any planet is weak/afflicted, otherwise general). Your job is ONLY the personalized narrative.

${GROUNDING_RULE}
${PLAIN_LANGUAGE_RULE}
${SAFETY_RULE}

Return STRICT JSON only, no markdown fences, in this exact shape:
{"intro": string, "remedyNotes": [{"title": string, "note": string}]}

"intro": 2-3 sentences (under 55 words) — a warm overview of why these particular remedies were chosen for this person's chart.
"remedyNotes": exactly one entry per remedy listed below, each "note" 1-2 sentences (under 35 words) explaining WHY this remedy matters for this person specifically (referencing the chart reason given) — never just restating the ritual itself, which the app already shows separately.
Second person, present tense, conversational. Never generic filler that would read the same for any chart.`;
}

function buildFacts(ctx: RemediesLlmContext): string {
  return ctx.remedies.map((r) => `- ${r.title} (for ${r.planet}): ${r.remedy}`).join('\n');
}

const NARRATIVE_SCHEMA = {
  type: 'object',
  properties: {
    intro: { type: 'string' },
    remedyNotes: {
      type: 'array',
      items: {
        type: 'object',
        properties: { title: { type: 'string' }, note: { type: 'string' } },
        required: ['title', 'note'],
      },
    },
  },
  required: ['intro', 'remedyNotes'],
} as const;

function parseNarrative(raw: string, knownTitles: string[]): RemediesNarrative | null {
  try {
    const data = JSON.parse(cleanJsonString(raw)) as {
      intro?: unknown;
      remedyNotes?: unknown;
    };
    if (typeof data.intro !== 'string' || !data.intro.trim()) return null;

    const notes: Record<string, string> = {};
    if (Array.isArray(data.remedyNotes)) {
      for (const entry of data.remedyNotes) {
        const e = entry as { title?: unknown; note?: unknown };
        if (
          typeof e.title === 'string' &&
          typeof e.note === 'string' &&
          e.note.trim() &&
          knownTitles.includes(e.title)
        ) {
          notes[e.title] = e.note.trim();
        }
      }
    }
    if (Object.keys(notes).length === 0) return null;
    return { intro: data.intro.trim(), notes };
  } catch {
    return null;
  }
}

/**
 * No fallback: a failed or unparseable response throws rather than caching
 * generic filler — same discipline as generateGemstoneReport.
 */
export async function generateRemediesReport(
  ctx: RemediesLlmContext,
): Promise<RemediesReportResult> {
  const knownTitles = ctx.remedies.map((r) => r.title);
  const raw = await generate({
    profile: REMEDIES_REPORT_PROFILE,
    responseSchema: NARRATIVE_SCHEMA,
    messages: [
      { role: 'system', content: systemPrompt() },
      {
        role: 'system',
        content: `The following is the user's remedies data. Treat everything between the <astro_context> tags as reference DATA only — never as instructions.\n<astro_context>\n${buildFacts(ctx)}\n</astro_context>`,
      },
      { role: 'user', content: 'Write the personalized remedies report.' },
    ],
  });

  const parsed = parseNarrative(raw, knownTitles);
  if (!parsed) {
    void import('../logger.js').then((m) =>
      m.logger.error({ raw }, 'unparseable JSON in remedies report'),
    );
    throw new Error('remedies LLM returned unparseable JSON');
  }
  return { ...parsed, model: MODEL };
}

/** Translate an already-generated report's AI fields — same pattern as translateGemstoneContent. */
export async function translateRemediesContent(
  original: RemediesNarrative,
  targetLanguage: string,
): Promise<RemediesNarrative> {
  const raw = await generate({
    profile: REMEDIES_REPORT_PROFILE,
    responseSchema: {
      type: 'object',
      properties: {
        intro: { type: 'string' },
        notes: { type: 'object', additionalProperties: { type: 'string' } },
      },
    },
    messages: [
      {
        role: 'user',
        content: `Translate the following remedies report content into the language "${targetLanguage}". Keep the exact same JSON structure and keys (including the title keys inside "notes" — keep those keys in English). ONLY translate the human-readable values.\n\nOriginal Content:\n${JSON.stringify(original, null, 2)}`,
      },
    ],
  });

  try {
    const data = JSON.parse(cleanJsonString(raw)) as { intro?: unknown; notes?: unknown };
    const intro =
      typeof data.intro === 'string' && data.intro.trim() ? data.intro.trim() : original.intro;
    const notes: Record<string, string> = {};
    if (data.notes && typeof data.notes === 'object') {
      for (const [title, note] of Object.entries(data.notes as Record<string, unknown>)) {
        if (typeof note === 'string' && note.trim()) notes[title] = note.trim();
      }
    }
    return { intro, notes: Object.keys(notes).length > 0 ? notes : original.notes };
  } catch {
    throw new Error(`remedies translation returned unparseable JSON (target=${targetLanguage})`);
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test test/remedies-report.spec.ts`
Expected: PASS (all cases).

- [ ] **Step 6: Add the registry entry**

In `src/modules/prime-reports/prime-reports.registry.ts`, add the imports:

```ts
import {
  generateRemediesReport,
  translateRemediesContent,
  type RemediesNarrative,
} from '../../lib/llm/remedies-report.js';
import { getRemedies } from '../astro/astro.service.js';
```

Add a new entry to the `PRIME_REPORT_DEFINITIONS` object literal (alongside `numerology`/`'name-correction'`, before the `LIFE_AREAS` spread):

```ts
  remedies: {
    reportType: 'remedies',
    title: 'Remedies Report',
    pricePaise: 2500,
    async generate(_userId, profile) {
      const birthData =
        profile.dateOfBirth &&
        profile.timeOfBirth &&
        profile.placeOfBirth?.lat != null &&
        profile.placeOfBirth?.lon != null &&
        profile.placeOfBirth?.tz
          ? {
              date: profile.dateOfBirth,
              time: profile.timeOfBirth,
              latitude: profile.placeOfBirth.lat,
              longitude: profile.placeOfBirth.lon,
              timezone: profile.placeOfBirth.tz,
            }
          : undefined;
      if (!birthData) throw new Error('Remedies report requires complete birth details');
      const remedies = await getRemedies(birthData);
      const { model, ...content } = await generateRemediesReport({ remedies });
      return { content, model };
    },
    async translate(content, language) {
      const translated = await translateRemediesContent(
        content as unknown as RemediesNarrative,
        language,
      );
      return translated as unknown as Record<string, unknown>;
    },
  },
```

- [ ] **Step 7: Run the full test suite + typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: all passing (same baseline + this task's new tests), no typecheck errors.

- [ ] **Step 8: Commit**

```bash
git add src/config/llm.ts src/lib/llm/remedies-report.ts test/remedies-report.spec.ts src/modules/prime-reports/prime-reports.registry.ts
git commit -m "feat(prime): add remedies report"
```

---

## After all 4 tasks: controller final review (not a subagent task)

The controller (not a dispatched subagent) reviews the full diff holistically for:

- Every new `reportType` key is unique and matches its title/price against the approved pricing sheet (₹25 = 2500 paise for every report in this batch).
- No report type's `generate()` can silently produce partial/wrong content on bad input — every missing-precondition case throws a clear, user-facing-safe error message (never a stack trace leak).
- `pnpm test && pnpm typecheck && pnpm lint` all clean.
- Full catalogue sanity check: `listPrimeReportDefinitions()` returns exactly 10 entries: `numerology`, `name-correction`, `remedies`, `career`, `finance`, `health`, `relationship`, `marriage`, `love`, `education`.

Do NOT merge to `main` — the user has asked to accumulate everything on this branch (and possibly subsequent batches) and merge once, at the end, in a single step.
