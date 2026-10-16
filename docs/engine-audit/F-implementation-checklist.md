# F — Implementation Checklist

> For every rule that has been source-verified, this file records:
>
> - The exact formula or condition from the source
> - The constants, index conventions, and edge cases
> - The rule profile variant used by Aroha
> - A hand-worked numerical example (expected values NEVER come from running the engine)
> - The test vector derived from that example
>
> Rows are added as each batch is completed.

---

## How to use this file

1. Open the primary text passage (which must already be in D-source-register.md).
2. Write down exactly what the passage says: formula, constants, index base, rounding.
3. Work one numerical example by hand from that formula.
4. Write the test vector below (input → expected output).
5. The test in `test/audit/<area>.audit.spec.ts` uses exactly this expected output.

Expected values come from the source and your hand calculation, **never** from running the engine or from a website.

---

## Section template

````
### [FEATURE-ID] Feature name

**Source:** [text, edition, chapter, verse, source-id from D-register]

**Formula from source:**

> (quote the formula / verse exactly)

**Constants:**

| Name | Value | Unit |
|---|---|---|

**Index convention:** (e.g. signs 1-12 or 0-11; planets 0-based or named)

**Edge cases:**
- …

**Rule profile variant:** [which profile field controls this; what the default is]

**Worked example:**

| Input | Value |
|---|---|

Working (show each step):

1. …

| Output | Expected value |
|---|---|

**Test vector:**
```ts
// in test/audit/<area>.audit.spec.ts
it('[FEATURE-ID] formula name', () => {
  expect(fn(inputs)).toEqual(expectedOutput);
});
````

```

---

> No entries yet. Added as each batch is audited.
```
