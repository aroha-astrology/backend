# Marriage Report Spouse Details Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** let a married user optionally supply their spouse's real birth details when generating the Marriage Report, and have the report's scoring and narrative genuinely reflect both charts (synastry), by reusing the Kundli Milan matching machinery instead of building a second one.

**Architecture:** Backend: a new `acceptsOptionalPartner` flag on `marriage`'s `ReportDef` lets `partner` ride the existing, already-protected `PartnerBirthDetailsSchema`/`ctx.partnerChart` pipeline (no new dedupe/charge logic — see `[[aroha-reports-table-wiped-2026-08-26]]`-class risk this avoids). A new pure `computeSpouseSynastry` helper wraps the exact functions `kundli-milan.ts` already uses (Ashtakoota, Dashakoota, Mangal Dosha, `computeMatchRiskFactors`, partner D9) and is called from `computeMarriageScores` only when a partner chart is present. The 4-call marriage narrative gets small, additive fact/prompt insertions per call so spouse data is woven into the existing sections rather than bolted on as a 5th call. Frontend: `ReportPurchaseDrawer.tsx` grows a `marriage_spouse` mode (same inline-form pattern already used for Kundli Milan) that appears only for `relationshipStatus === 'married'`, is optional (never blocks purchase), and pre-fills from the most recently purchased marriage report's own stored partner input — no new "saved profile" system, deliberately avoiding the paid/identity-switching `/v1/profiles` system.

**Tech Stack:** Hono + drizzle-orm + Postgres + Zod (`jyotish-backend`), Next.js + React + i18next (`frontend`), vitest for both.

---

## Context

Full design rationale is in `docs/superpowers/specs/2026-08-30-marriage-report-spouse-details-design.md` (committed `84f20cd`). Key facts that shape this plan:

- A prior spouse-detail form (`SpouseBirthCard.tsx`) posted into the marriage report's generic `answers` field, which had no backend handler — the purchase deduped, the wallet was debited and refunded, and no reading was produced. This plan routes spouse data through the existing first-class `partner`/`ctx.partnerChart` pipeline instead, which already has real charge/dedupe protection.
- `relationshipStatus` is already collected at onboarding and already returned by `GET /v1/me` (`users.schemas.ts:240`) — it is simply missing from the frontend's `User` TypeScript type today. No backend change needed to read it; Task 8 below adds the missing frontend type field.
- The account-level saved-profile system (`/v1/profiles`, `frontend/lib/api.ts`'s `Profile`/`CreateProfileBody`) charges money and **auto-switches which person's chart drives the whole app** on creation. It must NOT be used to remember spouse details — doing so would silently switch the user's own active identity to their spouse. Pre-fill instead comes from the marriage report's own purchase history (`reports.input`), which already exists and costs nothing extra to read.

## File Structure

**Backend (`jyotish-backend`):**

- Modify: `src/modules/reports/reports.schemas.ts` — add `name`/`placeLabel` to `PartnerBirthDetailsSchema`.
- Modify: `src/config/reports.ts` — add `acceptsOptionalPartner` to `ReportDef`, set on `marriage`.
- Modify: `src/modules/reports/reports.service.ts` — `validatePurchaseShape`, `partnerInput` construction, `buildReportScoreContext` (add `partnerName`), `getReportCatalogueForUser` (add `lastSpouseDetails`).
- Modify: `src/modules/reports/report-generator.types.ts` — add `partnerName` to `ReportScoreContext`.
- Modify: `src/modules/reports/reports.schemas.ts` — add `lastSpouseDetails` to `ReportCatalogueEntrySchema`.
- Modify: `src/lib/astro-engine/reports/kundli-milan.ts` — export `compatibilityBandFromGunaScore`.
- Create: `src/lib/astro-engine/reports/marriage-spouse-synastry.ts` — `computeSpouseSynastry`.
- Modify: `src/lib/astro-engine/reports/marriage.ts` — call it from `computeMarriageScores`, extend `MarriageScores`.
- Modify: `src/lib/llm/reports/marriage.ts` — weave spouse facts into all 4 calls' fact-builders and prompts.
- Test: `test/reports-service.spec.ts` (append — reuse its existing `state`/`vi.mock` harness rather than building a new one), `test/marriage-spouse-synastry.spec.ts` (new), `test/report-marriage-scores.spec.ts`, `test/report-marriage-llm.spec.ts`.

**Frontend (`frontend`):**

- Modify: `lib/api.ts` — add `relationshipStatus` to `User`.
- Modify: `lib/reports-api.ts` — add `name`/`placeLabel` to `ReportPartnerInput`, add `lastSpouseDetails` to `ReportCatalogueEntry`.
- Modify: `lib/reports-logic.ts` — add `shouldShowSpouseSection`.
- Modify: `components/reports/ReportPurchaseDrawer.tsx` — add the spouse-details inline section.
- Modify: `i18n/resources.ts` — add 4 new keys × 7 languages.
- Test: `lib/reports-logic.test.ts`.

---

## Task 1: `acceptsOptionalPartner` flag + purchase-shape validation

**Files:**

- Modify: `src/config/reports.ts:32-71`
- Modify: `src/modules/reports/reports.service.ts:198-217, 949-951`
- Modify: `test/reports-service.spec.ts` — add `purchaseReportShapeCheck` and `getReportDef` to the existing destructured `await import(...)` block at line 126-137 (the file already imports `../src/config/reports.js`'s `getReportDef`? check first — if not, add a second `const { getReportDef } = await import('../src/config/reports.js');` near the top-level `makeUser`/`makeReportRow` helpers, since `vi.mock` for that module isn't set up in this file — it's real, deterministic config, nothing to mock).

- [ ] **Step 1: Write the failing tests**

Add near the top of `test/reports-service.spec.ts`, after the `makeReportRow` helper (~line 166):

```typescript
import { getReportDef } from '../src/config/reports.js';
```

Then add a new `describe` block, e.g. right before `describe('getReportCatalogueForUser', ...)`:

```typescript
describe('purchaseReportShapeCheck — optional partner (marriage)', () => {
  it('allows marriage purchase with no partner', () => {
    const def = getReportDef('marriage')!;
    expect(() => purchaseReportShapeCheck(def, { reportKey: 'marriage' })).not.toThrow();
  });

  it('allows marriage purchase WITH a partner (unlike today, where it 400s)', () => {
    const def = getReportDef('marriage')!;
    expect(() =>
      purchaseReportShapeCheck(def, {
        reportKey: 'marriage',
        partner: {
          dateOfBirth: '1990-01-01',
          timeOfBirth: '10:00',
          latitude: 12.9,
          longitude: 77.6,
          timezone: 'Asia/Kolkata',
        },
      }),
    ).not.toThrow();
  });

  it('still rejects a partner on a report with neither flag set (e.g. wealth)', () => {
    const def = getReportDef('wealth')!;
    expect(() =>
      purchaseReportShapeCheck(def, {
        reportKey: 'wealth',
        partner: {
          dateOfBirth: '1990-01-01',
          timeOfBirth: '10:00',
          latitude: 12.9,
          longitude: 77.6,
          timezone: 'Asia/Kolkata',
        },
      }),
    ).toThrow();
  });

  it('still requires a partner on kundli_milan (requiresPartner, unaffected by this change)', () => {
    const def = getReportDef('kundli_milan')!;
    expect(() => purchaseReportShapeCheck(def, { reportKey: 'kundli_milan' })).toThrow();
  });
});
```

Add `purchaseReportShapeCheck` to the existing destructured import at line 126-137 (it becomes exported in Step 4 below):

```typescript
const {
  purchaseReport,
  purchaseReportShapeCheck,
  previewReport,
  getReportCatalogueForUser,
  getReportForUser,
  getReportStats,
  notifyReportReady,
  reapStaleReports,
  regenerateReportContent,
  hashSections,
  MAX_REPORT_GENERATION_ATTEMPTS,
} = await import('../src/modules/reports/reports.service.js');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/reports-service.spec.ts`
Expected: FAIL — `purchaseReportShapeCheck` is `undefined` (not exported yet), and `acceptsOptionalPartner` isn't wired.

- [ ] **Step 3: Add the flag to `ReportDef` and set it on marriage**

In `src/config/reports.ts`, add to the `ReportDef` interface (right after the existing `requiresPartner` field, around line 57):

```typescript
  /** True for kundli_milan and match_report — the two reports that take a second person's birth details. */
  requiresPartner: boolean;
  /**
   * True ONLY for marriage: a partner is optional, not required, and only shown to a user whose
   * own relationshipStatus is 'married' (see frontend's ReportPurchaseDrawer). Deliberately a
   * SEPARATE flag from requiresPartner rather than reusing it — requiresPartner blocks purchase
   * without a partner (correct for kundli_milan/match_report, wrong for marriage, whose majority
   * of buyers are unmarried people asking about a future spouse they cannot supply details for).
   */
  acceptsOptionalPartner?: boolean;
```

Then on the `marriage` entry (line ~65-72):

```typescript
  {
    key: 'marriage',
    featureFlagKey: 'reports.marriage',
    label: 'Marriage Report',
    isMonthly: false,
    isYearly: true,
    requiresPartner: false,
    acceptsOptionalPartner: true,
    basePricePaise: 9900,
  },
```

- [ ] **Step 4: Rename/export the validation function and widen the partner checks**

In `src/modules/reports/reports.service.ts`, rename `validatePurchaseShape` to `purchaseReportShapeCheck` and export it (it has no other callers to update except the one inside this file at line 929):

```typescript
export function purchaseReportShapeCheck(def: ReportDef, body: PurchaseReportBody): void {
  const months = body.months ?? [];
  if (def.isMonthly && months.length === 0) {
    throw Errors.badRequest(`${def.key} is a monthly report — "months" (YYYY-MM[]) is required`);
  }
  if (!def.isMonthly && months.length > 0) {
    throw Errors.badRequest(`${def.key} is a one-time report and does not accept "months"`);
  }
  for (const m of months) {
    if (!MONTH_KEY_RE.test(m)) {
      throw Errors.badRequest(`Invalid month "${m}" in "months" — expected YYYY-MM`);
    }
  }
  const partnerAllowed = def.requiresPartner || def.acceptsOptionalPartner === true;
  if (def.requiresPartner && !body.partner) {
    throw Errors.badRequest(`${def.key} requires "partner" birth details`);
  }
  if (!partnerAllowed && body.partner) {
    throw Errors.badRequest(`${def.key} does not accept "partner" birth details`);
  }
}
```

Update the one call site (line 929): `validatePurchaseShape(def, body);` → `purchaseReportShapeCheck(def, body);`

- [ ] **Step 5: Widen the `partnerInput` construction so marriage actually persists what it's allowed to accept**

At line ~949-951 in the same file:

```typescript
const partnerInput =
  def.requiresPartner || def.acceptsOptionalPartner
    ? ((body.partner as unknown as Record<string, unknown>) ?? null)
    : null;
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run test/reports-service.spec.ts`
Expected: PASS (all 4 new tests, plus every pre-existing test in this file still passing)

- [ ] **Step 7: Run the full backend suite to check nothing else referenced the old name**

Run: `npx vitest run`
Expected: same baseline pass count as before this change (no new failures) — see `[[aroha-architecture-review-2026-08-11]]` for the last known baseline if a diff needs sanity-checking.

- [ ] **Step 8: Commit**

```bash
git add src/config/reports.ts src/modules/reports/reports.service.ts test/reports-service.spec.ts
git commit -m "feat(reports): let marriage report accept an optional partner"
```

---

## Task 2: Partner name/place-label fields + `ReportScoreContext.partnerName`

**Files:**

- Modify: `src/modules/reports/reports.schemas.ts:10-18`
- Modify: `src/modules/reports/report-generator.types.ts:1-98`
- Modify: `src/modules/reports/reports.service.ts:540-556`
- Modify: `test/reports-service.spec.ts`

- [ ] **Step 1: Write the failing test**

Add `buildReportScoreContext` to the shared destructured import from Task 1 Step 1:

```typescript
const {
  purchaseReport,
  purchaseReportShapeCheck,
  buildReportScoreContext,
  previewReport,
  getReportCatalogueForUser,
  getReportForUser,
  getReportStats,
  notifyReportReady,
  reapStaleReports,
  regenerateReportContent,
  hashSections,
  MAX_REPORT_GENERATION_ATTEMPTS,
} = await import('../src/modules/reports/reports.service.js');
```

Add a new `describe` block. `findActiveUserById`/`resolveProfileContext` are already mocked in this file's `state` object and default to returning `undefined` when unconfigured — `buildReportScoreContext` catches that internally (see `fetchPersonContext`'s try/catch) and falls back to null person fields, which doesn't affect `partnerName` at all, so no extra mock setup is needed for these two tests:

```typescript
describe('buildReportScoreContext — partnerName', () => {
  it('reads partnerName off row.input.name when present', async () => {
    const ctx = await buildReportScoreContext(
      { userId: 'u1', birthProfileId: null, input: { dateOfBirth: '1990-01-01', name: 'Priya' } },
      null,
      null,
    );
    expect(ctx.partnerName).toBe('Priya');
  });

  it('is null when input has no name', async () => {
    const ctx = await buildReportScoreContext(
      { userId: 'u1', birthProfileId: null, input: null },
      null,
      null,
    );
    expect(ctx.partnerName).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/reports-service.spec.ts`
Expected: FAIL — `ctx.partnerName` is `undefined`, not typed/populated yet.

- [ ] **Step 3: Add `name`/`placeLabel` to `PartnerBirthDetailsSchema`**

In `src/modules/reports/reports.schemas.ts`:

```typescript
export const PartnerBirthDetailsSchema = z
  .object({
    dateOfBirth: z.string(),
    timeOfBirth: z.string(),
    latitude: z.number(),
    longitude: z.number(),
    timezone: z.string(),
    /** Optional — marriage only (kundli_milan/match_report don't collect this). Used purely for
     * narrative personalization ("your spouse, Priya") and pre-fill display, never for chart math. */
    name: z.string().optional(),
    /** Optional — marriage only. Display label for the resolved place (e.g. "Mumbai, India"),
     * used purely to pre-fill the place-autocomplete input on a later purchase; never used for
     * chart computation (latitude/longitude/timezone already carry that). */
    placeLabel: z.string().optional(),
  })
  .openapi('PartnerBirthDetails');
```

- [ ] **Step 4: Add `partnerName` to `ReportScoreContext`**

In `src/modules/reports/report-generator.types.ts`, right after the `partnerChart` field (line 8):

```typescript
  /** Partner's computed chart — kundli_milan only, undefined/null for every other report key. */
  partnerChart?: Record<string, unknown> | null;
  /** The partner's given name, if the purchaser supplied one — marriage only (optional there),
   * never present for kundli_milan/match_report today. Sourced from `row.input.name` inside
   * `buildReportScoreContext`, never from `partnerInputToBirthRecord` (which only reads the 5
   * chart-math fields). Used purely for narrative personalization, never chart computation. */
  partnerName?: string | null;
```

- [ ] **Step 5: Populate it inside `buildReportScoreContext`**

In `src/modules/reports/reports.service.ts`, in `buildReportScoreContext` (around line 546-555):

```typescript
export async function buildReportScoreContext(
  row: Pick<ReportRow, 'userId' | 'birthProfileId' | 'input'>,
  kundli: KundliRow | null | undefined,
  partnerChart: Record<string, unknown> | null,
): Promise<ReportScoreContext> {
  const personContext = await fetchPersonContext(row.userId, row.birthProfileId);
  const partnerName = typeof row.input?.name === 'string' ? row.input.name : null;
  return {
    chart: kundli?.chartData ?? null,
    partnerChart,
    partnerName,
    doshaData: kundli?.doshaData ?? null,
    yogaData: kundli?.yogaData ?? null,
    ashtakavargaData: kundli?.ashtakavargaData ?? null,
    dashaData: kundli?.dashaData ?? null,
    ...personContext,
    userAnswers: answersFromInput(row.input),
  };
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run test/reports-service.spec.ts`
Expected: PASS (6 new tests total across Tasks 1-2, plus every pre-existing test)

- [ ] **Step 7: Commit**

```bash
git add src/modules/reports/reports.schemas.ts src/modules/reports/report-generator.types.ts src/modules/reports/reports.service.ts test/reports-service.spec.ts
git commit -m "feat(reports): thread an optional partner name through ReportScoreContext"
```

---

## Task 3: Surface `lastSpouseDetails` on the marriage catalogue entry

**Files:**

- Modify: `src/modules/reports/reports.schemas.ts` (`ReportCatalogueEntrySchema`)
- Modify: `src/modules/reports/reports.service.ts` (`getReportCatalogueForUser`, `hasPartnerBirthInput` import already present)
- Modify: `test/reports-service.spec.ts` — append to the existing `describe('getReportCatalogueForUser', ...)` block (~line 1312), reusing `makeUser`/`makeReportRow`/`state.listReportsForUser`/`state.resolveFeaturesForUser` exactly as its 3 existing tests do.

- [ ] **Step 1: Write the failing test**

Append two tests inside the existing `describe('getReportCatalogueForUser', ...)` block, right after its third `it(...)` (before the closing `});` at line 1358):

```typescript
it("surfaces the most recent marriage purchase's stored partner input as lastSpouseDetails", async () => {
  state.resolveFeaturesForUser.mockResolvedValue({});
  state.listReportsForUser.mockResolvedValue([
    makeReportRow({
      id: 'older',
      reportKey: 'marriage',
      input: {
        dateOfBirth: '1988-02-02',
        timeOfBirth: '06:00',
        latitude: 1,
        longitude: 1,
        timezone: 'UTC',
      },
      createdAt: new Date('2025-01-01T00:00:00Z'),
    }),
    makeReportRow({
      id: 'newer',
      reportKey: 'marriage',
      input: {
        dateOfBirth: '1991-05-04',
        timeOfBirth: '08:30',
        latitude: 19.07,
        longitude: 72.87,
        timezone: 'Asia/Kolkata',
        name: 'Priya',
        placeLabel: 'Mumbai, India',
      },
      createdAt: new Date('2026-01-01T00:00:00Z'),
    }),
  ]);

  const catalogue = await getReportCatalogueForUser(makeUser(), null);
  const marriage = catalogue.find((c) => c.key === 'marriage')!;
  expect(marriage.lastSpouseDetails).toEqual({
    dateOfBirth: '1991-05-04',
    timeOfBirth: '08:30',
    latitude: 19.07,
    longitude: 72.87,
    timezone: 'Asia/Kolkata',
    name: 'Priya',
    placeLabel: 'Mumbai, India',
  });
});

it('is null for every other report key, and for marriage with no partner input on file', async () => {
  state.resolveFeaturesForUser.mockResolvedValue({});
  state.listReportsForUser.mockResolvedValue([
    makeReportRow({ reportKey: 'marriage', input: null }),
  ]);

  const catalogue = await getReportCatalogueForUser(makeUser(), null);
  expect(catalogue.find((c) => c.key === 'marriage')!.lastSpouseDetails).toBeNull();
  expect(catalogue.find((c) => c.key === 'wealth')!.lastSpouseDetails).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/reports-service.spec.ts`
Expected: FAIL — `lastSpouseDetails` doesn't exist on the returned entry.

- [ ] **Step 3: Add the field to the schema**

In `src/modules/reports/reports.schemas.ts`, add near `PartnerBirthDetailsSchema` (after it) and reference it from `ReportCatalogueEntrySchema`:

```typescript
export const LastSpouseDetailsSchema = PartnerBirthDetailsSchema.nullable();
```

In `ReportCatalogueEntrySchema` (around line 80-97), add one field:

```typescript
export const ReportCatalogueEntrySchema = z
  .object({
    key: z.string(),
    label: z.string(),
    isMonthly: z.boolean(),
    isYearly: z.boolean(),
    requiresPartner: z.boolean(),
    enabled: z.boolean(),
    pricePaise: z.number().int(),
    originalPricePaise: z.number().int().nullable(),
    purchases: z.array(ReportCataloguePurchaseSchema),
    /** marriage only — the most recently purchased marriage report's own stored spouse birth
     * details, for pre-filling the optional spouse-details section on a later purchase. Always
     * null for every other report key. */
    lastSpouseDetails: LastSpouseDetailsSchema,
  })
  .openapi('ReportCatalogueEntry');
```

- [ ] **Step 4: Populate it in `getReportCatalogueForUser`**

In `src/modules/reports/reports.service.ts`, inside `getReportCatalogueForUser`'s `REPORT_CATALOGUE.map(...)` (around line 1171-1188):

```typescript
return REPORT_CATALOGUE.map((def) => {
  const resolved = features[def.featureFlagKey];
  const ownRows = rows.filter((r) => r.reportKey === def.key);
  const lastPartnerRow =
    def.key === 'marriage'
      ? [...ownRows]
          .filter((r) => hasPartnerBirthInput(r.input))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]
      : undefined;
  return {
    key: def.key,
    label: def.label,
    isMonthly: def.isMonthly,
    isYearly: def.isYearly ?? false,
    requiresPartner: def.requiresPartner,
    enabled: resolved?.enabled ?? true,
    pricePaise: resolved?.pricePaise ?? def.basePricePaise,
    originalPricePaise: resolved?.originalPricePaise ?? null,
    purchases: ownRows.map((r) => ({
      id: r.id,
      periodMonth: r.periodMonth,
      status: publicStatus(r.status),
    })),
    lastSpouseDetails: lastPartnerRow
      ? {
          dateOfBirth: lastPartnerRow.input!.dateOfBirth as string,
          timeOfBirth: lastPartnerRow.input!.timeOfBirth as string,
          latitude: lastPartnerRow.input!.latitude as number,
          longitude: lastPartnerRow.input!.longitude as number,
          timezone: lastPartnerRow.input!.timezone as string,
          name: (lastPartnerRow.input!.name as string | undefined) ?? undefined,
          placeLabel: (lastPartnerRow.input!.placeLabel as string | undefined) ?? undefined,
        }
      : null,
  };
});
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run test/reports-service.spec.ts`
Expected: PASS (8 new tests total across Tasks 1-3, plus every pre-existing test)

- [ ] **Step 6: Run the full backend suite**

Run: `npx vitest run`
Expected: no new failures beyond the known baseline.

- [ ] **Step 7: Commit**

```bash
git add src/modules/reports/reports.schemas.ts src/modules/reports/reports.service.ts test/reports-service.spec.ts
git commit -m "feat(reports): surface the last-purchased marriage report's spouse details for pre-fill"
```

---

## Task 4: `computeSpouseSynastry` — reuse Kundli Milan's matching machinery

**Files:**

- Modify: `src/lib/astro-engine/reports/kundli-milan.ts:60-65` (export the band function)
- Create: `src/lib/astro-engine/reports/marriage-spouse-synastry.ts`
- Test: `test/marriage-spouse-synastry.spec.ts` (new)

- [ ] **Step 1: Export `compatibilityBandFromGunaScore`**

In `src/lib/astro-engine/reports/kundli-milan.ts`, change:

```typescript
function compatibilityBandFromGunaScore(score: number): CompatibilityBand {
```

to:

```typescript
export function compatibilityBandFromGunaScore(score: number): CompatibilityBand {
```

- [ ] **Step 2: Write the failing test**

```typescript
// test/marriage-spouse-synastry.spec.ts
import { describe, expect, it } from 'vitest';
import { computeSpouseSynastry } from '../src/lib/astro-engine/reports/marriage-spouse-synastry.js';

function makeChart(moonSign: string, moonNakshatraIndex: number): Record<string, unknown> {
  return {
    ascendant: { signIndex: 0 },
    planets: [
      { planet: 'Moon', sign: moonSign, nakshatraIndex: moonNakshatraIndex, house: 1 },
      { planet: 'Mars', sign: 'Aries', house: 1 },
    ],
    houses: [],
  };
}

describe('computeSpouseSynastry', () => {
  it('returns null when either chart is missing', () => {
    expect(computeSpouseSynastry(null, makeChart('Aries', 0), null)).toBeNull();
    expect(computeSpouseSynastry(makeChart('Aries', 0), null, null)).toBeNull();
  });

  it('computes guna milan, dashakoota, manglik, risk factors and spouse navamsa for two real charts', () => {
    const self = makeChart('Cancer', 6);
    const spouse = makeChart('Taurus', 3);
    const result = computeSpouseSynastry(self, spouse, null);
    expect(result).not.toBeNull();
    expect(result!.gunaMilanScore).toBeGreaterThanOrEqual(0);
    expect(result!.gunaMaxScore).toBe(36);
    expect(result!.gunaBreakdown.length).toBeGreaterThan(0);
    expect(['poor', 'average', 'good', 'excellent']).toContain(result!.compatibilityBand);
    expect(result!.dashakootaMaxScore).toBeGreaterThan(0);
    expect(typeof result!.manglikStatus.self).toBe('boolean');
    expect(typeof result!.manglikStatus.spouse).toBe('boolean');
    expect(result!.riskFactors.length).toBe(8);
    expect(Array.isArray(result!.spouseNavamsa)).toBe(true);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run test/marriage-spouse-synastry.spec.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 4: Write the implementation**

```typescript
// src/lib/astro-engine/reports/marriage-spouse-synastry.ts
// =============================================================================
// Marriage report — spouse synastry (optional, only when the purchaser supplied
// real spouse birth details — see config/reports.ts's acceptsOptionalPartner).
// =============================================================================
// Deliberately reuses the SAME Ashtakoota/Dashakoota/Mangal-Dosha/risk-factor
// functions kundli-milan.ts already calls, rather than a second implementation
// — two independent Guna Milan calculators for the same couple would risk
// silently disagreeing. Pure, synchronous — no LLM call, no DB access, same
// contract as computeMarriageScores/computeKundliMilanScores.
// =============================================================================

import { calculateAshtakoota } from '../matching/ashtakoota.js';
import { calculateDashakoota } from '../matching/dashakoota.js';
import { detectMangalDosha } from '../doshas/mangalDosha.js';
import { computeMatchRiskFactors, type MatchRiskFactor } from '../matching/match-risks.js';
import { computeReportVargas, type ReportVarga } from './report-vargas.js';
import {
  getMoonPlacement,
  compatibilityBandFromGunaScore,
  type CompatibilityBand,
  type KootaBreakdownEntry,
  type KundliMilanScores,
} from './kundli-milan.js';

export interface SpouseSynastry {
  gunaMilanScore: number;
  gunaMaxScore: number;
  gunaBreakdown: KootaBreakdownEntry[];
  compatibilityBand: CompatibilityBand;
  dashakootaScore: number;
  dashakootaMaxScore: number;
  dashakootaCompatibility: ReturnType<typeof calculateDashakoota>['overallCompatibility'];
  manglikStatus: { self: boolean; spouse: boolean; cancelled: boolean };
  /** Same 8 life-area synastry read (wealth/health/children/harmony/career/timing/intimacy/
   * inlaws) kundli_milan/match_report already use — see match-risks.ts. */
  riskFactors: MatchRiskFactor[];
  /** The spouse's own Navamsa (D9) — `[]` if it can't be computed from the given chart. */
  spouseNavamsa: ReportVarga[];
}

/**
 * `selfChart` is the marriage-report purchaser's own chart (`ctx.chart`); `spouseChart` is
 * `ctx.partnerChart`, computed fresh from the purchaser-supplied birth details (see
 * reports.service.ts's `hasPartnerBirthInput`/`partnerInputToBirthRecord`). Returns `null`
 * when either chart is missing — i.e. for every marriage report generated without spouse data,
 * which must keep behaving exactly as it did before this feature existed.
 */
export function computeSpouseSynastry(
  selfChart: Record<string, unknown> | null,
  spouseChart: Record<string, unknown> | null,
  dashaData: Record<string, unknown> | null,
): SpouseSynastry | null {
  if (!selfChart || !spouseChart) return null;

  const moonSelf = getMoonPlacement(selfChart);
  const moonSpouse = getMoonPlacement(spouseChart);

  const ashtakoota = calculateAshtakoota(
    moonSelf.nakshatraIndex,
    moonSpouse.nakshatraIndex,
    moonSelf.sign,
    moonSpouse.sign,
  );
  const dashakoota = calculateDashakoota(
    moonSelf.nakshatraIndex,
    moonSpouse.nakshatraIndex,
    moonSelf.sign,
    moonSpouse.sign,
  );

  const mangalSelf = detectMangalDosha(
    selfChart as unknown as Parameters<typeof detectMangalDosha>[0],
  );
  const mangalSpouse = detectMangalDosha(
    spouseChart as unknown as Parameters<typeof detectMangalDosha>[0],
  );
  const cancelled = mangalSelf.type === 'cancelled' || mangalSpouse.type === 'cancelled';

  const gunaBreakdown: KootaBreakdownEntry[] = ashtakoota.scores.map((s) => ({
    name: s.koota,
    score: s.score,
    maxScore: s.maxScore,
    description: s.description,
  }));
  const compatibilityBand = compatibilityBandFromGunaScore(ashtakoota.totalScore);

  // computeMatchRiskFactors reads exactly these 5 fields off its 3rd param (see its
  // computeHarmonyFactor helper) — person1/person2 naming here is required by that function's
  // own contract, kept internal to this call only; the public SpouseSynastry.manglikStatus below
  // uses the friendlier self/spouse naming for the narrative layer.
  const riskFactorInput = {
    gunaMilanScore: ashtakoota.totalScore,
    gunaMaxScore: ashtakoota.maxTotal,
    gunaBreakdown,
    manglikStatus: { person1: mangalSelf.present, person2: mangalSpouse.present, cancelled },
    compatibilityBand,
  } as unknown as KundliMilanScores;

  const riskFactors = computeMatchRiskFactors(selfChart, spouseChart, riskFactorInput, dashaData);

  return {
    gunaMilanScore: ashtakoota.totalScore,
    gunaMaxScore: ashtakoota.maxTotal,
    gunaBreakdown,
    compatibilityBand,
    dashakootaScore: dashakoota.totalScore,
    dashakootaMaxScore: dashakoota.maxTotal,
    dashakootaCompatibility: dashakoota.overallCompatibility,
    manglikStatus: { self: mangalSelf.present, spouse: mangalSpouse.present, cancelled },
    riskFactors,
    spouseNavamsa: computeReportVargas(spouseChart, ['D9']),
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run test/marriage-spouse-synastry.spec.ts`
Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add src/lib/astro-engine/reports/kundli-milan.ts src/lib/astro-engine/reports/marriage-spouse-synastry.ts test/marriage-spouse-synastry.spec.ts
git commit -m "feat(reports): add computeSpouseSynastry, reusing Kundli Milan's matching functions"
```

---

## Task 5: Wire spouse synastry into `computeMarriageScores`

**Files:**

- Modify: `src/lib/astro-engine/reports/marriage.ts:1-125, 241-422`
- Test: `test/report-marriage-scores.spec.ts`

- [ ] **Step 1: Write the failing test**

Add to `test/report-marriage-scores.spec.ts` (reuse its existing `makeChart` helper already in that file):

```typescript
describe('computeMarriageScores — spouse synastry', () => {
  it('spouseSynastry is null when ctx.partnerChart is absent (unchanged existing behavior)', () => {
    const chart = makeChart({ moon: { sign: 'Cancer', house: 4 } });
    const scores = computeMarriageScores({ chart, partnerChart: null }, null);
    expect(scores.spouseSynastry).toBeNull();
    expect(scores.spouseName).toBeNull();
  });

  it('spouseSynastry is populated when ctx.partnerChart is present', () => {
    const chart = makeChart({ moon: { sign: 'Cancer', house: 4 } });
    const partnerChart = makeChart({ moon: { sign: 'Taurus', house: 4 } });
    const scores = computeMarriageScores({ chart, partnerChart, partnerName: 'Priya' }, null);
    expect(scores.spouseSynastry).not.toBeNull();
    expect(scores.spouseSynastry!.riskFactors.length).toBe(8);
    expect(scores.spouseName).toBe('Priya');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/report-marriage-scores.spec.ts`
Expected: FAIL — `spouseSynastry`/`spouseName` don't exist on `MarriageScores` yet.

- [ ] **Step 3: Extend `MarriageScores` and wire the call**

In `src/lib/astro-engine/reports/marriage.ts`, add the import (near the other astro-engine imports, ~line 44):

```typescript
import { computeSpouseSynastry, type SpouseSynastry } from './marriage-spouse-synastry.js';
```

Add two fields to the `MarriageScores` interface (after `modernRealities`, end of the interface, ~line 124):

```typescript
  modernRealities: {
    lateMarriageLeaning: boolean;
    rahuHouse: number | undefined;
    seventhHousePlanetCount: number;
  };

  /** Present only when the purchaser supplied real spouse birth details (married users,
   * optional — see config/reports.ts's acceptsOptionalPartner). Null for every report
   * generated without spouse data, including every report generated before this feature
   * existed — narrative modules must treat null exactly like "no spouse data given". */
  spouseSynastry: SpouseSynastry | null;
  /** The spouse's given name, if supplied — same additive-only, null-safe contract as
   * spouseSynastry above. */
  spouseName: string | null;
}
```

In `computeMarriageScores`, right before the `return` statement (~line 388-389):

```typescript
  const ashtakavargaSummary = ashtakavargaFacts(
    ctx.ashtakavargaData ?? null,
    getAscendantSignIndex(chart),
  );

  const spouseSynastry = computeSpouseSynastry(chart, ctx.partnerChart ?? null, ctx.dashaData ?? null);

  return {
    header,
    lifeContext,
    planetRemedies,
    vargas,
    ashtakavargaSummary,
    marriageScore,
    band,
    manglik,
    seventhLord,
    seventhLordStrength,
    venusStrength,
    venusHouse,
    jupiterStrength,
    jupiterHouse,
    seventhHouseSign,
    seventhHouseTemperament,
    fourthLordStrength,
    windows,
    jupiterDharmaWindow,
    ageBands,
    seventhLordReason,
    venusReason,
    jupiterReason,
    doshaYoga,
    partnerArchetype,
    marriageQualityArc,
    loveOrArrange,
    relationshipStatus: ctx.personRelationshipStatus ?? null,
    inLaws,
    moneyAfterMarriage,
    modernRealities,
    spouseSynastry,
    spouseName: ctx.partnerName ?? null,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/report-marriage-scores.spec.ts`
Expected: PASS — including every pre-existing test in this file (they never set `partnerChart`, so `spouseSynastry` must come back `null` for them without any other field changing).

- [ ] **Step 5: Commit**

```bash
git add src/lib/astro-engine/reports/marriage.ts test/report-marriage-scores.spec.ts
git commit -m "feat(reports): wire computeSpouseSynastry into computeMarriageScores"
```

---

## Task 6: Weave spouse facts into the marriage narrative's 4 calls

**Files:**

- Modify: `src/lib/llm/reports/marriage.ts`
- Test: `test/report-marriage-llm.spec.ts`

- [ ] **Step 1: Write the failing tests**

Add to `test/report-marriage-llm.spec.ts`, reusing its existing `makeScores` helper:

```typescript
function makeSpouseSynastry(): NonNullable<MarriageScores['spouseSynastry']> {
  return {
    gunaMilanScore: 24,
    gunaMaxScore: 36,
    gunaBreakdown: [{ name: 'Nadi', score: 8, maxScore: 8, description: 'No Nadi dosha.' }],
    compatibilityBand: 'good',
    dashakootaScore: 60,
    dashakootaMaxScore: 72,
    dashakootaCompatibility: 'good',
    manglikStatus: { self: false, spouse: false, cancelled: false },
    riskFactors: [
      { key: 'wealth', severity: 'benefit', evidence: ['2nd lords are mutually well placed.'] },
      { key: 'health', severity: 'neutral', evidence: ['No major flags.'] },
      { key: 'children', severity: 'benefit', evidence: ['5th house synastry is supportive.'] },
      { key: 'harmony', severity: 'caution', evidence: ['Bhakoot koota is weak.'] },
      { key: 'career', severity: 'neutral', evidence: ['No major flags.'] },
      { key: 'timing', severity: 'benefit', evidence: ['Current dashas favor stability.'] },
      { key: 'intimacy', severity: 'benefit', evidence: ['Venus-Mars synastry is supportive.'] },
      { key: 'inlaws', severity: 'neutral', evidence: ['No major flags.'] },
    ],
    spouseNavamsa: [],
  };
}

describe('generateMarriageNarrative — spouse synastry woven in', () => {
  it('embeds guna milan + spouse manglik in call 1 only when spouseSynastry is given', async () => {
    state.generate
      .mockResolvedValueOnce(jsonSections('H1a', 'H1b'))
      .mockResolvedValueOnce(jsonSections('H2a', 'H2b'))
      .mockResolvedValueOnce(jsonSections('H3a', 'H3b'))
      .mockResolvedValueOnce(jsonSections('H4a', 'H4b'));

    await generateMarriageNarrative(
      makeScores({ spouseSynastry: makeSpouseSynastry(), spouseName: 'Priya' }),
    );

    const content = JSON.stringify(state.generate.mock.calls[0]![0]);
    expect(content).toContain('24');
    expect(content).toContain('Priya');
  });

  it('omits spouse facts entirely when spouseSynastry is null (unchanged existing behavior)', async () => {
    state.generate
      .mockResolvedValueOnce(jsonSections('H1a', 'H1b'))
      .mockResolvedValueOnce(jsonSections('H2a', 'H2b'))
      .mockResolvedValueOnce(jsonSections('H3a', 'H3b'))
      .mockResolvedValueOnce(jsonSections('H4a', 'H4b'));

    await generateMarriageNarrative(makeScores({ spouseSynastry: null, spouseName: null }));

    const content = JSON.stringify(state.generate.mock.calls[0]![0]);
    expect(content).not.toContain('SPOUSE DATA PROVIDED');
  });

  it('embeds spouse navamsa + harmony/inlaws risk factors in call 2', async () => {
    state.generate
      .mockResolvedValueOnce(jsonSections('H1a', 'H1b'))
      .mockResolvedValueOnce(jsonSections('H2a', 'H2b'))
      .mockResolvedValueOnce(jsonSections('H3a', 'H3b'))
      .mockResolvedValueOnce(jsonSections('H4a', 'H4b'));

    await generateMarriageNarrative(makeScores({ spouseSynastry: makeSpouseSynastry() }));

    const content = JSON.stringify(state.generate.mock.calls[1]![0]);
    expect(content).toContain('Bhakoot koota is weak');
  });

  it('embeds wealth/career risk factors in call 3', async () => {
    state.generate
      .mockResolvedValueOnce(jsonSections('H1a', 'H1b'))
      .mockResolvedValueOnce(jsonSections('H2a', 'H2b'))
      .mockResolvedValueOnce(jsonSections('H3a', 'H3b'))
      .mockResolvedValueOnce(jsonSections('H4a', 'H4b'));

    await generateMarriageNarrative(makeScores({ spouseSynastry: makeSpouseSynastry() }));

    const content = JSON.stringify(state.generate.mock.calls[2]![0]);
    expect(content).toContain('2nd lords are mutually well placed');
  });

  it('embeds children/timing/intimacy/health risk factors in call 4', async () => {
    state.generate
      .mockResolvedValueOnce(jsonSections('H1a', 'H1b'))
      .mockResolvedValueOnce(jsonSections('H2a', 'H2b'))
      .mockResolvedValueOnce(jsonSections('H3a', 'H3b'))
      .mockResolvedValueOnce(jsonSections('H4a', 'H4b'));

    await generateMarriageNarrative(makeScores({ spouseSynastry: makeSpouseSynastry() }));

    const content = JSON.stringify(state.generate.mock.calls[3]![0]);
    expect(content).toContain('5th house synastry is supportive');
    expect(content).toContain('Current dashas favor stability');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/report-marriage-llm.spec.ts`
Expected: FAIL — `makeScores`'s base fixture has no `spouseSynastry`/`spouseName` fields yet (add them as `null` defaults to the existing `makeScores` helper's returned object first, matching the interface change from Task 5), and none of the new facts are emitted yet.

In `test/report-marriage-llm.spec.ts`, update `makeScores`'s returned object at line 90-91 to include the two new fields as defaults, immediately before the existing `...overrides` spread:

```typescript
    modernRealities: { lateMarriageLeaning: false, rahuHouse: 9, seventhHousePlanetCount: 1 },
    spouseSynastry: null,
    spouseName: null,
    ...overrides,
  } as unknown as MarriageScores;
```

- [ ] **Step 3: Add the fact-lines and prompt instructions**

In `src/lib/llm/reports/marriage.ts`:

In `buildFactsCall1`, right after the Jupiter-dharma-window line (~line 176):

```typescript
lines.push(
  `Jupiter's own separate dasha window (supplementary dharma/marriage-karaka color only — NOT a second, competing timing answer): ${formatWindow(scores.jupiterDharmaWindow)}.`,
);
if (scores.spouseSynastry) {
  lines.push(
    `SPOUSE DATA PROVIDED — this reader is married and supplied their real spouse's birth details. Guna Milan compatibility: ${scores.spouseSynastry.gunaMilanScore}/${scores.spouseSynastry.gunaMaxScore} (${scores.spouseSynastry.compatibilityBand}). Spouse's own Manglik status: ${scores.spouseSynastry.manglikStatus.spouse ? 'present' : 'not present'}${scores.spouseSynastry.manglikStatus.spouse ? `, classically cancelled: ${scores.spouseSynastry.manglikStatus.cancelled ? 'yes' : 'no'}` : ''}.${scores.spouseName ? ` Spouse's name: ${scores.spouseName}.` : ''}`,
  );
}
```

In `narrativeSystemPromptCall1()`, add one sentence right before the `Return STRICT JSON` line:

```
If SPOUSE DATA PROVIDED facts are given below, this reader is already married and supplied their real spouse's chart — weave the given Guna Milan compatibility score and spouse Manglik status into section 1 as an added, corroborating layer on top of the existing band/Manglik discussion (use the spouse's name if given, instead of the generic "your spouse"), rather than a separate topic.
```

In `buildFactsCall2`, right after the in-laws-note line (~line 219):

```typescript
lines.push(
  `In-laws note (4th house sign: ${scores.inLaws.fourthHouseSign ?? 'unavailable'}): ${scores.inLaws.note}`,
);
if (scores.spouseSynastry) {
  const spouseNavamsa = scores.spouseSynastry.spouseNavamsa[0];
  lines.push(
    `SPOUSE DATA PROVIDED. Spouse's Navamsa (D9): ${spouseNavamsa ? formatReportVarga(spouseNavamsa) : 'unavailable on the spouse chart'}.`,
  );
  const harmony = scores.spouseSynastry.riskFactors.find((f) => f.key === 'harmony');
  const inlaws = scores.spouseSynastry.riskFactors.find((f) => f.key === 'inlaws');
  if (harmony)
    lines.push(
      `Harmony synastry read (GIVEN): ${harmony.severity} — ${harmony.evidence.join('; ')}`,
    );
  if (inlaws)
    lines.push(`In-laws synastry read (GIVEN): ${inlaws.severity} — ${inlaws.evidence.join('; ')}`);
}
```

In `narrativeSystemPromptCall2()`, add one sentence before `Return STRICT JSON`:

```
If SPOUSE DATA PROVIDED facts are given below, reframe section 1 from "who you will marry" speculation to "who your spouse is" — weave in the spouse's own Navamsa and the given harmony synastry read as corroborating, real-chart evidence rather than generic archetype lore, and weave the given in-laws synastry read into section 2 alongside the existing 4th-lord fact. Use the spouse's name if given.
```

In `buildFactsCall3`, right after the cautions line (~line 243):

```typescript
lines.push(`What to hold carefully (present doshas needing awareness): ${cautions}.`);
if (scores.spouseSynastry) {
  const wealth = scores.spouseSynastry.riskFactors.find((f) => f.key === 'wealth');
  const career = scores.spouseSynastry.riskFactors.find((f) => f.key === 'career');
  if (wealth)
    lines.push(
      `SPOUSE DATA PROVIDED. Wealth synastry read (GIVEN): ${wealth.severity} — ${wealth.evidence.join('; ')}`,
    );
  if (career)
    lines.push(`Career synastry read (GIVEN): ${career.severity} — ${career.evidence.join('; ')}`);
}
```

In `narrativeSystemPromptCall3()`, add one sentence before `Return STRICT JSON`:

```
If SPOUSE DATA PROVIDED facts are given below, weave the given wealth and career synastry reads into the "Money After Marriage" section as real-couple evidence, alongside the existing 2nd/11th house facts.
```

In `buildFactsCall4`, at the end of the function, before `return lines.join('\n')` (~line 262):

```typescript
lines.push(
  `Number of natal planets occupying the 7th house: ${scores.modernRealities.seventhHousePlanetCount}.`,
);
if (scores.spouseSynastry) {
  const remainingKeys: ReadonlyArray<(typeof scores.spouseSynastry.riskFactors)[number]['key']> = [
    'children',
    'timing',
    'intimacy',
    'health',
  ];
  const rest = scores.spouseSynastry.riskFactors.filter((f) => remainingKeys.includes(f.key));
  if (rest.length > 0) {
    lines.push('SPOUSE DATA PROVIDED. Additional synastry reads (GIVEN):');
    for (const f of rest) lines.push(`- ${f.key}: ${f.severity} — ${f.evidence.join('; ')}`);
  }
}
return lines.join('\n');
```

In `narrativeSystemPromptCall4()`, add one sentence before `Return STRICT JSON`:

```
If SPOUSE DATA PROVIDED additional synastry reads are given below, weave them into the "Modern Realities" section as a closing, real-couple layer alongside the existing tendencies.
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/report-marriage-llm.spec.ts`
Expected: PASS — all pre-existing tests in this file plus the 5 new ones.

- [ ] **Step 5: Run the full backend suite**

Run: `npx vitest run`
Expected: no new failures beyond the known baseline.

- [ ] **Step 6: Commit**

```bash
git add src/lib/llm/reports/marriage.ts test/report-marriage-llm.spec.ts
git commit -m "feat(reports): weave spouse synastry facts into all 4 marriage narrative calls"
```

---

## Task 7: Frontend types — `User.relationshipStatus`, partner name/place-label, `lastSpouseDetails`

**Files:**

- Modify: `frontend/lib/api.ts`
- Modify: `frontend/lib/reports-api.ts`

- [ ] **Step 1: Add `relationshipStatus` to `User`**

In `frontend/lib/api.ts`, inside the `User` interface (near `dataProcessingConsentActive`, since both are account-level onboarding fields):

```typescript
/** Gates onboarding-analysis/chat/forecast/matchmaking server-side (requireConsent). */
dataProcessingConsentActive: boolean;
/** users.relationship_status — single/in_relationship/engaged/married/divorced/widowed/
 * separated/complicated/prefer_not_to_say, or null if not yet answered at onboarding. */
relationshipStatus: string | null;
```

- [ ] **Step 2: Add `name`/`placeLabel` to `ReportPartnerInput` and `lastSpouseDetails` to `ReportCatalogueEntry`**

In `frontend/lib/reports-api.ts`:

```typescript
/** Raw partner birth data for a Kundli Milan purchase, or an optional spouse for a marriage
 * purchase — the partner/spouse is NOT a saved profile. */
export interface ReportPartnerInput {
  dateOfBirth: string; // YYYY-MM-DD
  timeOfBirth: string; // HH:mm
  latitude: number;
  longitude: number;
  timezone: string;
  /** marriage only. */
  name?: string;
  /** marriage only — display label for the resolved place, used purely to pre-fill the
   * place-autocomplete input on a later purchase. */
  placeLabel?: string;
}
```

```typescript
export interface ReportCatalogueEntry {
  key: string;
  label: string;
  isMonthly: boolean;
  isYearly: boolean;
  requiresPartner: boolean;
  enabled: boolean;
  pricePaise: number;
  originalPricePaise: number | null;
  purchases: ReportPurchaseSummary[];
  /** marriage only — the most recently purchased marriage report's own stored spouse birth
   * details, for pre-filling the optional spouse-details section on a later purchase. Null for
   * every other report key, and for a marriage report with no spouse data on file yet. */
  lastSpouseDetails: ReportPartnerInput | null;
}
```

```typescript
export interface PurchaseReportBody {
  reportKey: string;
  months?: string[];
  birthProfileId?: string | null;
  /** kundli_milan (required) or marriage (optional, married users only). */
  partner?: ReportPartnerInput;
  answers?: Record<string, string>;
}
```

No tests for this task — pure type additions, exercised by Task 8's test.

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/api.ts frontend/lib/reports-api.ts
git commit -m "feat(reports): add relationshipStatus + spouse-detail fields to frontend types"
```

(run this `git add`/`git commit` from inside `C:\dev\aroha-astrology\frontend`, not the backend repo — these are two separate git repositories.)

---

## Task 8: `shouldShowSpouseSection` pure helper

**Files:**

- Modify: `frontend/lib/reports-logic.ts`
- Test: `frontend/lib/reports-logic.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `frontend/lib/reports-logic.test.ts`:

```typescript
import { shouldShowSpouseSection } from './reports-logic';

describe('shouldShowSpouseSection', () => {
  it('is true for marriage + married', () => {
    expect(shouldShowSpouseSection('marriage', 'married')).toBe(true);
  });

  it('is false for marriage + any other status', () => {
    expect(shouldShowSpouseSection('marriage', 'single')).toBe(false);
    expect(shouldShowSpouseSection('marriage', null)).toBe(false);
    expect(shouldShowSpouseSection('marriage', undefined)).toBe(false);
  });

  it('is false for every other report key, even when married', () => {
    expect(shouldShowSpouseSection('wealth', 'married')).toBe(false);
    expect(shouldShowSpouseSection('kundli_milan', 'married')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `frontend/`): `npx vitest run lib/reports-logic.test.ts`
Expected: FAIL — `shouldShowSpouseSection` is not exported.

- [ ] **Step 3: Write the implementation**

In `frontend/lib/reports-logic.ts`, add near the other small predicate/state helpers:

```typescript
/**
 * Whether the marriage-report purchase drawer should show its optional spouse-details section —
 * ONLY for the marriage report key, and ONLY for a user whose own relationshipStatus is
 * "married". Every other report key/status combination gets today's unchanged behavior.
 */
export function shouldShowSpouseSection(
  reportKey: string,
  relationshipStatus: string | null | undefined,
): boolean {
  return reportKey === 'marriage' && relationshipStatus === 'married';
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/reports-logic.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/reports-logic.ts lib/reports-logic.test.ts
git commit -m "feat(reports): add shouldShowSpouseSection helper"
```

---

## Task 9: Wire the spouse-details section into `ReportPurchaseDrawer`

**Files:**

- Modify: `frontend/components/reports/ReportPurchaseDrawer.tsx`
- Modify: `frontend/i18n/resources.ts` (7 languages)

- [ ] **Step 1: Add the 4 new i18n keys to all 7 languages**

In `frontend/i18n/resources.ts`, next to each existing `partnerTitle`/`partnerConsent` pair (7 occurrences — English ~line 135, Hindi ~2453, Bengali ~4672, Marathi ~6893, Telugu ~9115, Tamil ~11333, Gujarati ~13557), add 4 sibling keys. English version:

```typescript
          partnerTitle: "Partner's Birth Details",
          partnerConsent: "I confirm the partner has consented to their birth details being used for this report.",
          spouseTitle: "Spouse's Birth Details (optional)",
          spouseHint: "Add your spouse's real birth details for a report that reflects both charts together — or skip this and get the report based on your own chart alone.",
          spouseName: "Spouse's Name",
          spouseConsent: "I confirm my spouse has consented to their birth details being used for this report.",
```

Translate `spouseTitle`/`spouseHint`/`spouseName`/`spouseConsent` into Hindi, Bengali, Marathi, Telugu, Tamil, and Gujarati at each of the other 6 occurrences, matching the tone/register of that language's existing `partnerTitle`/`partnerConsent` pair already there. (Per `[[i18n-translate-all-strings]]` — no hardcoded UI text; every new user-facing string needs a `t()` key in all 7 languages, not just English.)

- [ ] **Step 2: Add the spouse mode to the drawer**

In `frontend/components/reports/ReportPurchaseDrawer.tsx`:

Add the import (near the other lib imports):

```typescript
import { currentMonthKey, shouldShowSpouseSection } from '@/lib/reports-logic';
```

Change the `mode` derivation (line ~52-56) to a 4th variant:

```typescript
const showSpouseSection = shouldShowSpouseSection(entry.key, user?.relationshipStatus);
const mode: 'simple' | 'kundli_milan' | 'monthly' | 'marriage_spouse' = entry.requiresPartner
  ? 'kundli_milan'
  : showSpouseSection
    ? 'marriage_spouse'
    : entry.isMonthly
      ? 'monthly'
      : 'simple';
```

Add spouse-section state, right after the existing Kundli Milan partner-form state (line ~59-63):

```typescript
// ── Marriage report's optional spouse-details section ────────────────
const [spouseName, setSpouseName] = useState(entry.lastSpouseDetails?.name ?? '');
const [spouseDob, setSpouseDob] = useState(entry.lastSpouseDetails?.dateOfBirth ?? '');
const [spouseTob, setSpouseTob] = useState(entry.lastSpouseDetails?.timeOfBirth ?? '');
const [resolvedSpousePlace, setResolvedSpousePlace] = useState<PlaceOfBirth | null>(
  entry.lastSpouseDetails
    ? {
        name: entry.lastSpouseDetails.placeLabel ?? '',
        lat: entry.lastSpouseDetails.latitude,
        lon: entry.lastSpouseDetails.longitude,
        tz: entry.lastSpouseDetails.timezone,
      }
    : null,
);
const [spouseConsented, setSpouseConsented] = useState(!!entry.lastSpouseDetails);
// Optional and never blocks purchase: complete (dob+place+consent) or entirely empty are both
// valid; a half-filled section is the only invalid state, since it can't build a real chart.
const spouseSectionEmpty = !spouseDob && !resolvedSpousePlace;
const spouseSectionComplete = !!spouseDob && !!resolvedSpousePlace && spouseConsented;
const spouseSectionValid = spouseSectionEmpty || spouseSectionComplete;
```

Update `canSubmit` (line ~82-84) to also gate on the spouse section being either empty or complete:

```typescript
const costPaise = entry.pricePaise;
const canSubmit =
  mode === 'kundli_milan'
    ? partnerValid
    : mode === 'monthly'
      ? !currentMonthAlreadyPurchased
      : mode === 'marriage_spouse'
        ? spouseSectionValid
        : true;
```

Update `handlePurchase` (inside the `try` block, right after the existing `if (mode === "kundli_milan" ...)` block, ~line 97-105) to include the spouse partner data when filled in:

```typescript
if (mode === 'kundli_milan' && resolvedPartnerPlace) {
  body.partner = {
    dateOfBirth: partnerDob,
    timeOfBirth: partnerTob || '12:00',
    latitude: resolvedPartnerPlace.lat,
    longitude: resolvedPartnerPlace.lon,
    timezone: resolvedPartnerPlace.tz,
  };
}
if (mode === 'marriage_spouse' && spouseSectionComplete && resolvedSpousePlace) {
  body.partner = {
    dateOfBirth: spouseDob,
    timeOfBirth: spouseTob || '12:00',
    latitude: resolvedSpousePlace.lat,
    longitude: resolvedSpousePlace.lon,
    timezone: resolvedSpousePlace.tz,
    ...(spouseName.trim() ? { name: spouseName.trim() } : {}),
    ...(resolvedSpousePlace.name ? { placeLabel: resolvedSpousePlace.name } : {}),
  };
}
```

Add the section's markup right after the existing `{mode === "kundli_milan" && (...)}` block (~line 260, before `{mode === "monthly" && ...}`):

```tsx
{
  mode === 'marriage_spouse' && (
    <div className="flex flex-col gap-3">
      <p className="text-xs font-semibold text-gold uppercase tracking-wider">
        {t('reports.purchase.spouseTitle')}
      </p>
      <p className="text-[11px] text-muted leading-relaxed">{t('reports.purchase.spouseHint')}</p>
      <div>
        <label className="text-xs text-muted ml-1 mb-1 block">
          {t('reports.purchase.spouseName')}
        </label>
        <input
          type="text"
          value={spouseName}
          onChange={(e) => setSpouseName(e.target.value)}
          className={inputClass}
          style={style}
        />
      </div>
      <div>
        <label className="text-xs text-muted ml-1 mb-1 block">{t('compatibilityPage.dob')}</label>
        <input
          type="date"
          value={spouseDob}
          onChange={(e) => setSpouseDob(e.target.value)}
          className={inputClass}
          style={style}
        />
      </div>
      <div>
        <label className="text-xs text-muted ml-1 mb-1 block">{t('compatibilityPage.tob')}</label>
        <input
          type="time"
          value={spouseTob}
          onChange={(e) => setSpouseTob(e.target.value)}
          className={inputClass}
          style={style}
        />
      </div>
      <PlaceAutocomplete
        placeholder={t('compatibilityPage.birthPlace')}
        inputClassName={inputClass}
        inputStyle={style}
        worldwide={!user?.phoneE164}
        defaultQuery={entry.lastSpouseDetails?.placeLabel ?? ''}
        onSelect={(place) => setResolvedSpousePlace(place)}
      />
      <label className="flex items-start gap-2.5 px-1 text-xs leading-relaxed cursor-pointer text-muted">
        <input
          type="checkbox"
          checked={spouseConsented}
          onChange={(e) => setSpouseConsented(e.target.checked)}
          className="mt-0.5 w-4 h-4 shrink-0 accent-yellow-500"
        />
        {t('reports.purchase.spouseConsent')}
      </label>
    </div>
  );
}
```

- [ ] **Step 3: Manual verification (no automated component test — see Task 8 for the tested logic)**

Run: `cd frontend && npm run dev` (or the project's existing dev-server command)

In a browser:

1. Sign in as a test user with `relationshipStatus` NOT set to `married` → open the Marriage Report purchase drawer → confirm no spouse section appears, purchase flow unchanged.
2. Set that user's relationship status to `married` (Settings/onboarding edit) → reopen the drawer → confirm the spouse section appears, is optional (purchase button enabled with it empty), and typing a DOB without a place keeps the button disabled (half-filled state).
3. Fill in name/DOB/TOB/place, complete the checkbox, purchase → confirm success and that the report generates.
4. Reopen the drawer for a second purchase of the same report type (or check `entry.lastSpouseDetails` via the network tab on `GET /v1/reports`) → confirm the spouse section is pre-filled from what was just entered.

- [ ] **Step 4: Run the frontend test suite**

Run: `npx vitest run`
Expected: no new failures.

- [ ] **Step 5: Commit**

```bash
git add components/reports/ReportPurchaseDrawer.tsx i18n/resources.ts
git commit -m "feat(reports): add optional spouse-details section to the marriage report purchase drawer"
```

---

## Task 10: End-to-end verification

- [ ] **Step 1: Run both full test suites**

Backend: `cd jyotish-backend && npx vitest run`
Frontend: `cd frontend && npx vitest run`
Expected: no new failures beyond each suite's known pre-existing baseline (see `[[aroha-architecture-review-2026-08-11]]` for the last recorded backend baseline — re-check it's still roughly accurate, don't assume it's exact months later).

- [ ] **Step 2: Typecheck both**

Backend: `npx tsc --noEmit`
Frontend: `npx tsc --noEmit`
Expected: no new errors (both repos have known pre-existing tsc error counts — a new error introduced by this feature is a real regression to fix, not baseline noise).

- [ ] **Step 3: Manual end-to-end pass (see Task 9 Step 3's 4 scenarios) — do not skip this even if all automated tests pass**

The automated tests cover the deterministic scoring/narrative-facts layer and the frontend gating logic in isolation; they do not exercise the real Gemini call, the real purchase→wallet→generation pipeline, or the real UI. Follow `[[aroha-vercel-deploy-gotchas]]`'s "a curl/HTTP-200 check is not sufficient" lesson — a real purchase, from a real signed-in married test account, generating a real report, is the only thing that actually confirms this works end to end.
