# AROHA ASTROLOGY — MASTER CLAUDE INSTRUCTION

## Purpose

You are taking over the technical and astrological audit of Aroha Astrology's specification:

`AROHA_E2E_FEATURES_AND_CALCULATIONS.md`

Your job is to produce a **historically disciplined, implementation-ready, source-audited calculation specification**.

Do NOT merely rewrite the document. Audit every rule, formula, classification, and feature first, then correct only what can be supported.

---

# 1. NON-NEGOTIABLE SOURCE POLICY

The owner explicitly wants **ancient/classical primary-source verification**.

Therefore:

### Primary authority

Prefer, in this order:

1. The original/primary Sanskrit or classical text itself.
2. A reliable scholarly/critical edition of the original text.
3. A translation that clearly identifies the original chapter/verse and allows the passage to be checked.

Examples of classical material that may be used where directly relevant include:

- Bṛhat Jātaka
- Bṛhat Saṃhitā
- Yavanajātaka
- Āryabhaṭīya
- other early/classical Jyotiṣa/Siddhānta/Vāstu texts
- the classical Parāśara/Jaimini corpus ONLY where the relevant text/verse can actually be verified

### Secondary material is NOT authority

Do NOT use as proof:

- modern astrologer blogs
- modern astrologer YouTube videos
- recent pundit websites
- commercial astrology calculators
- random GitHub implementations
- Reddit
- Quora
- modern “expert” articles
- AI-generated astrology content

A secondary source may help locate a verse, but the final justification must trace back to the old/classical text.

### If a rule cannot be verified

Do NOT fill the gap from memory.

Write:

`ANCIENT SOURCE NOT VERIFIED`

and classify it as:

- `LATER_TRADITION`
- `MODERN_SYSTEM`
- `AROHA_PROPRIETARY`
- or `UNVERIFIED`

depending on what can actually be established.

Never turn uncertainty into a confident rule.

---

# 2. IMPORTANT HISTORICAL RULE

Do NOT pretend that every feature in the current Aroha document belongs to one ancient Vedic system.

Separate the specification into:

## A. ANCIENT / CLASSICAL CORE

Rules that can be directly supported from early/classical texts.

## B. LATER CLASSICAL / REGIONAL TRADITIONS

Systems that have traditional roots but are not part of the earliest/core material being audited.

## C. MODERN ASTROLOGICAL SYSTEMS

Examples include:

- KP
- Lal Kitab
- modern astrocartography
- modern numerology systems

## D. AROHA PROPRIETARY / MODERN ENGINEERING

Examples:

- Aroha Bonds
- Aroha Harmony Score
- palm/Kundli reconciliation
- birth-time rectification scoring
- report scoring
- AI orchestration
- decision windows

A feature may be valuable even if it is modern. The requirement is simply that it is labelled honestly.

---

# 3. REQUIRED AUDIT FIELDS FOR EVERY FEATURE

For EVERY major calculation/rule, add or maintain these fields:

- Feature
- Classification
- Primary Source
- Source Chapter / Verse
- Source URL or bibliographic reference
- Exact Rule/Formula from Source
- Aroha Rule/Formula
- Accuracy %
- Verification Confidence %
- Implementation Status
- Variants / School Differences
- Notes

Use percentages carefully.

`Accuracy %` means how closely Aroha's current implementation matches the verified rule.

`Verification Confidence %` means how confident you are that your historical/source assessment is correct.

Do NOT present these percentages as scientific probabilities.

---

# 4. ABSOLUTE REQUIREMENT: DO NOT “NORMALIZE AWAY” TRADITIONAL VARIANTS

If two old/classical traditions genuinely use different rules:

DO NOT choose one silently.

Create an explicit profile/configuration.

Example:

```ts
type AstrologyRuleProfile = {
  sourceFamily: string;
  tradition: string;
  ayanamsa: string;
  houseSystem: string;
  shadbalaVariant?: string;
  dashaVariant?: string;
  ashtakavargaVariant?: string;
  vargaVariant?: string;
  muhurtaVariant?: string;
};
```

Then document which profile Aroha uses.

---

# 5. CRITICAL CORRECTIONS TO VERIFY AND IMPLEMENT

The following issues were identified in the current specification. Re-check each one against primary/classical sources before changing it, but do not ignore them.

## 5.1 Shadbala

Audit and correct:

- Uchcha Bala angular-distance formula
- circular 0°/360° normalization
- Saptavargaja Bala values
- Ojhayugma
- Kendradi
- Drekkana Bala
- Dig Bala
- Nathonnatha Bala
- Paksha Bala
- Tribhaga Bala
- Vara/Masa/Abda/Hora Bala
- Ayana Bala
- Yuddha-related Kala Bala handling
- Chesta Bala
- Naisargika Bala
- Drik Bala
- minimum required strength thresholds

Do not reduce continuous quantities to simplistic binary values unless the primary source actually does so.

For example, do NOT blindly retain:

```text
Retrograde = 60
Slow = 30–45
Fast = 15–45
```

without verifying the actual classical calculation.

Likewise, do not implement Drik Bala merely as:

```text
benefic aspects - malefic aspects
```

if the classical rule uses quantitative aspect strength.

---

# 5.2 Ashtakavarga

This is a mandatory deep audit.

Verify against classical Ashtakavarga material:

- BAV contributor tables
- 337 total
- Sarva Ashtakavarga
- Trikona Shodhana
- Ekadhipatya Shodhana
- Rashi Gunakara
- Graha Gunakara
- Rasi Pinda
- Graha Pinda
- Shodhya Pinda

The current document contains a likely error in Graha Pinda:

CURRENT:

```text
Graha Pinda =
(sum of all reduced bindus) × Graha Gunakar
```

Do not retain this unless the primary source explicitly supports it.

Also re-check:

- one occupied / one vacant sign in Ekadhipatya Shodhana
- both vacant signs
- both occupied signs
- zero handling in Trikona Shodhana

Provide worked numerical test vectors.

---

# 5.3 Divisional Charts

Audit D1 through D60.

For each:

- division size
- counting direction
- starting sign
- odd/even/movable/fixed/dual behavior
- exact source
- source variant

Pay special attention to D30, D40, D45 and D60.

If multiple classical variants exist, do NOT force one universal rule.

---

# 5.4 Vimshottari Dasha

Verify:

- 120-year cycle
- planetary durations
- birth nakshatra starting lord
- balance at birth
- antardasha formula
- pratyantar
- sookshma
- prana

Keep absolute timestamps internally rather than assuming fixed calendar lengths for “months/weeks”.

---

# 5.5 Chara Dasha

Audit completely.

The current specification is incomplete.

Verify:

- 7 vs 8 karaka scheme
- Atmakaraka through Darakaraka
- sign progression
- odd/even sign direction
- Scorpio/Aquarius special handling
- sign duration
- antardasha derivation
- starting sign
- variant differences

Do not claim a complete implementation until every required rule is specified.

---

# 5.6 Yogini Dasha

Verify:

- eight Yoginis
- durations
- planetary assignments
- starting Yogini formula
- recursive periods
- indexing convention

Explicitly define whether Nakshatra indexes are 0–26 or 1–27.

---

# 5.7 Doshas

Do NOT assume every modern “dosha” package is ancient.

Deep-audit individually:

- Mangal / Kuja
- Kaal Sarp
- Pitra Dosha
- Guru Chandal
- Grahan
- Kemadruma
- Sade Sati
- Dhaiya

For each, determine:

1. Is the exact rule present in an old primary source?
2. Is it a later traditional development?
3. Is it modern?

Especially verify the current:

- Kaal Sarp 12-name classification
- partial Kaal Sarp
- Udit/Anudit
- 10 Mangal cancellation rules
- Kemadruma cancellation claims

If an exact rule is not ancient-source-verifiable, label it accordingly.

Do not use the phrase “classical” casually.

---

# 5.8 Yoga Engine

Deep-audit:

- Pancha Mahapurusha
- Raja Yoga
- Dharma-Karmadhipati
- Kendra-Trikona relationships
- Viparita Raja Yoga
- Neechabhanga
- Dhana Yogas
- Lakshmi
- Vasumathi
- Chandra-Mangal
- Indu Lagna
- Gajakesari
- Sunapha
- Anapha
- Durudhara
- Adhi
- Budhaditya

For each:

- exact source
- exact condition
- exceptions/cancellations
- whether the Aroha condition is too broad or too narrow

Do not reduce nuanced yogas to a simplistic boolean when source conditions are richer.

---

# 5.9 Ashtakoota / Matchmaking

Separate:

- old/classical marriage compatibility factors
  from
- the later standardized 36-point scoring model.

Verify:

- Varna
- Vashya
- Tara
- Yoni
- Graha Maitri
- Gana
- Bhakoot
- Nadi

Do NOT claim that “18 = approved” or “28 = exceptional” is an ancient universal rule unless primary evidence exists.

Also avoid presenting Nadi as a scientifically validated genetic test.

---

# 5.10 South Indian Dashakoota

Verify individually:

- Dina
- Gana
- Mahendra
- Stree Deergha
- Yoni
- Rasi
- Rasiyadhipathi
- Vashya
- Rajju
- Vedha

Identify exactly which parts are ancient and which belong to later regional practice.

---

# 5.11 Panchanga

Audit:

- Tithi
- Vara
- Nakshatra
- Yoga
- Karana
- sunrise
- sunset
- solar noon
- Rahu Kala
- Gulika
- Yamaganda
- Abhijit
- Choghadiya
- Hora

Fix the Yoga implementation so it has an explicit floor/index convention.

Use actual local solar day/night duration for Choghadiya/Hora timing, not a fixed 1.5-hour assumption.

For every Muhurta exclusion, distinguish:

- directly classical
- later tradition
- Aroha policy

---

# 5.12 Find My Date / Muhurta

Do not automatically treat all of these as universal prohibitions:

- Mercury retrograde
- Jupiter/Venus combustion
- Kharmas
- Abhijit exceptions
- Chandrashtama
- eclipse windows

Verify each against the relevant classical source and create a configurable rule profile.

The final scoring layer may be proprietary:

```text
Aroha Muhurta Score = proprietary
```

but its underlying filters must be source-labelled.

---

# 5.13 KP

This must be classified as a LATER/MODERN ASTROLOGICAL SYSTEM, NOT ancient Vedic core.

Correct the document's:

```text
249/2193
```

Do not retain `2193` without an extremely strong primary-source justification.

Explicitly distinguish:

- 27 Nakshatras
- 9 subs per Nakshatra
- 243 underlying Nakshatra/Sub divisions
- KP's 1–249 horary numbering convention

Audit:

- cusp sub-lord
- significators
- star lord
- ruling planets
- marriage judgement
- horary number mapping

Do not pretend the KP package is ancient.

---

# 5.14 Varshaphal / Tajika

Classify Tajika/Varshaphal correctly as a later tradition.

Audit:

- exact solar return
- Muntha
- Varsheshwara
- Panchavargiya Bala
- Sahams

Do not call a return epoch “exact to the microsecond” unless the numerical implementation actually supports and justifies that precision.

Do not use one generic Saham formula if classical sources define individual Sahams separately.

---

# 5.15 Lal Kitab

Treat Lal Kitab as a later system.

Audit separately:

- fixed Aries house scheme
- Pakka Ghar
- Andha/Blind Teva
- Dharmi/Sleeping concepts
- Rin/debts
- remedies

Do not mix “Pakka Ghar” with ordinary planetary lordship.

If multiple Lal Kitab editions disagree, identify the exact edition/profile.

---

# 5.16 Numerology

Separate these from Vedic Jyotisha.

Audit and classify:

- Mulank
- Bhagyank
- Chaldean
- Pythagorean
- Lo Shu
- Kua
- Soul Urge
- Personality
- name correction
- mobile-number numerology

Do not call modern alphabet-number mappings ancient Vedic rules unless primary evidence actually proves it.

---

# 5.17 Astrocartography

Classify as modern.

The modern global AC/DC/MC/IC map can remain as an Aroha feature, but it must not be described as an ancient Vedic computation.

---

# 5.18 Vastu

Vastu has genuinely old textual roots.

Audit:

- Vastu Purusha
- cardinal directions
- Mandala
- room placement
- entrance
- water
- fire
- Brahmasthana
- traditional zoning

Separate ancient source rules from Aroha's proprietary:

```text
Harmony Score 0–100
```

and from later remedy systems.

---

# 5.19 Palmistry

Separate:

- ancient Indian bodily-mark/physiognomic material
  from
- modern computer vision
  from
- Aroha's proprietary Kundli-Palm reconciliation.

Do not describe an AI “confidence score” as ancient.

---

# 5.20 Gemstones

Verify the ancient gem/planet/remedy material.

Do not automatically assume every modern rule such as:

- never strengthen 6th lord
- never strengthen 8th lord
- never strengthen 12th lord
- never strengthen Maraka
  is universal ancient doctrine.

Create configurable prescription profiles.

Add a safety boundary for health-related claims.

---

# 5.21 Yantras

Verify the exact planetary magic-square tables.

Do NOT call one selected numerical table “the classical Navagraha Magic Squares” if multiple traditions exist.

Document:

- source
- square size
- constants
- mapping
- mantra
- deity association

Anything not source-verified should be labelled Aroha/traditional-profile.

---

# 5.22 Pancha Pakshi

Deep-audit the exact source.

Verify:

- five birds
- bird assignment
- waxing/waning rules
- activities
- time divisions
- day/night segmentation

Do not hard-code five equal 2.4-hour periods unless the traditional rule truly says so independent of actual sunrise/sunset.

---

# 5.23 Birth-Time Rectification

Treat the exact scoring algorithm as Aroha proprietary.

Classical principles may support event-based rectification, but the minute-by-minute scoring engine is modern.

The system should output:

- best candidate
- confidence
- alternatives
- supporting events
- conflicting events
- uncertainty interval

Never claim the algorithm has scientifically proved the true birth time.

---

# 5.24 Reports

For each commercial report, document the calculation provenance.

Add:

```text
calculation_basis
source_profile
traditional_rules
aroha_proprietary_rules
safety_classification
```

Pay special attention to:

- health
- fertility/progeny
- medical procedures
- past-life claims

Do not turn traditional divination into medical diagnosis or factual historical claims.

---

# 6. ARCHITECTURE REQUIREMENT

Preserve the core principle already present in Aroha:

LLMs must NOT calculate:

- planetary degrees
- houses
- Vargas
- dashas
- Shadbala
- Ashtakavarga
- KP sub-lords
- dates/timelines

Instead:

```text
Swiss Ephemeris
        ↓
Deterministic Astronomy
        ↓
Deterministic Astrology Rules
        ↓
Validated Fact Object
        ↓
Source-labelled Interpretation Object
        ↓
LLM
        ↓
Natural-language explanation
```

Rename any LLM “Metrologist Agent” that performs calculations into a deterministic service/tool.

The LLM may explain calculations, but must not invent them.

---

# 7. REQUIRED TESTING

For every calculation module create test vectors.

Examples:

## Shadbala

Known chart:

- input birth data
- expected planet positions
- expected subcomponents
- expected total Virupa
- expected Rupa
- expected ratio

## Ashtakavarga

Include:

- BAV
- SAV
- Trikona Shodhana
- Ekadhipatya Shodhana
- Rasi Pinda
- Graha Pinda
- Shodhya Pinda

## Vimshottari

Include:

- Moon longitude
- Nakshatra
- starting lord
- balance
- Maha/Antar/Pratyantar start/end timestamps

## Panchanga

Include:

- Tithi
- Nakshatra
- Yoga
- Karana
- Vara
- sunrise/sunset
- Rahu Kala

## Divisional charts

At least one test per division.

## KP

At least one test for:

- cusp
- star lord
- sub lord
- 1–249 mapping

---

# 8. REQUIRED OUTPUT

Do NOT simply return “looks good.”

Produce:

## A. Executive Verdict

- what is correct
- what is incorrect
- what is ambiguous
- what is later/modern
- what is proprietary

## B. Accuracy Matrix

One row per feature:

| Feature | Current Accuracy | Ancient Support | Verification Confidence | Status |

## C. Critical Corrections

Only issues that actually require code/spec changes.

## D. Source Register

For every ancient/classical rule:

- text
- chapter
- verse/page if available
- source link
- brief reason it supports the rule

## E. Replacement Specification

Produce corrected MD sections, preserving the current document's organization as much as possible.

## F. Implementation Checklist

- exact formulas
- constants
- indexes
- edge cases
- test vectors
- profiles/variants

## G. Historical Classification

Every section must be tagged:

- `ANCIENT_CLASSICAL`
- `LATER_CLASSICAL`
- `MODERN_ASTROLOGICAL`
- `AROHA_PROPRIETARY`
- `UNVERIFIED`

---

# 9. ABSOLUTE BEHAVIOR RULE

If a point cannot be verified from an ancient/classical source:

DO NOT “fix” it using a modern astrologer's opinion.

Instead write:

> Ancient source not verified; implementation should not be labelled classical.

This is more important than making the specification look complete.

---

# 10. FINAL TARGET

The final Aroha specification should answer, for every rule:

1. Where did this rule come from?
2. Is that source genuinely old/classical?
3. What exactly does the source say?
4. What exactly does Aroha calculate?
5. Are they mathematically identical?
6. If not, what needs changing?
7. Which parts are later traditions?
8. Which parts are Aroha inventions?
9. What test proves the implementation?

Do not optimize for agreement with the current document.

Optimize for **historical accuracy, mathematical correctness, reproducibility, and honest provenance**.
