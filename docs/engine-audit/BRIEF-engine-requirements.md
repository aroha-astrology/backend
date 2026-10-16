# AROHA ASTROLOGY — SOURCE-AUDITED ENGINE REQUIREMENTS

## Objective

Convert `AROHA_E2E_FEATURES_AND_CALCULATIONS.md` into a source-audited, implementation-ready astrology engine specification.

The specification must distinguish:

1. Ancient/Classical rules
2. Later classical/regional traditions
3. Modern astrological systems
4. Aroha proprietary algorithms
5. Unverified claims

---

## Mandatory Source Standard

Use primary/classical texts wherever possible.

Preferred sources include:

- Bṛhat Jātaka
- Bṛhat Saṃhitā
- Yavanajātaka
- Āryabhaṭīya
- Classical Siddhānta/Jyotiṣa material
- Classical Parāśara/Jaimini material only where the relevant passage can actually be verified

Modern astrologer blogs, pundit pages, YouTube, Reddit, Quora, commercial calculators, and AI-generated material are not acceptable as proof of an ancient rule.

A secondary source may be used only to locate/identify a primary passage.

If a rule cannot be verified from a primary/classical text, label it `UNVERIFIED`, `LATER_CLASSICAL`, `MODERN_ASTROLOGICAL`, or `AROHA_PROPRIETARY` as appropriate.

---

# Critical Mathematical Corrections

## 1. Shadbala

Audit and correct:

- Uchcha Bala
- circular angular difference
- Saptavargaja Bala
- Ojhayugma
- Kendradi
- Drekkana Bala
- Dig Bala
- Nathonnatha Bala
- Paksha Bala
- Tribhaga Bala
- Vara/Masa/Abda/Hora
- Ayana
- Chesta Bala
- Naisargika Bala
- Drik Bala
- minimum strength thresholds

Do not reduce continuous classical calculations to binary day/night or retrograde/non-retrograde values unless explicitly supported by the source.

---

## 2. Ashtakavarga

The seven BAV totals must be verified:

- Sun 48
- Moon 49
- Mars 39
- Mercury 54
- Jupiter 56
- Venus 52
- Saturn 39
- Total 337

Deep-audit:

- Trikona Shodhana
- Ekadhipatya Shodhana
- Rasi Gunakara
- Graha Gunakara
- Rasi Pinda
- Graha Pinda
- Shodhya Pinda

### Current formula requiring verification

Current document:

`Graha Pinda = sum(all reduced bindus) × Graha Gunakar`

Do not retain unless primary/classical evidence proves it.

Create numerical test cases.

---

## 3. Divisional Charts

Audit D1, D2, D3, D4, D7, D9, D10, D12, D16, D20, D24, D27, D30, D40, D45 and D60.

For each, specify:

- degree range
- counting direction
- starting sign
- odd/even/movable/fixed/dual rule
- exact source
- source variant

D60 must be treated especially carefully because of variant traditions.

---

## 4. Vimshottari

Verify:

- 120-year cycle
- planetary durations
- starting Nakshatra lord
- birth balance
- Antardasha
- Pratyantardasha
- Sookshma
- Prana

Use absolute timestamps internally.

---

## 5. Chara Dasha

Complete the missing rules:

- 7/8 Karaka profile
- AK/DK ordering
- sign progression
- direction rules
- Scorpio/Aquarius treatment
- sign durations
- starting sign
- antardashas
- variant profile

---

## 6. Yogini Dasha

Verify:

- 8 Yoginis
- duration
- planet mapping
- start calculation
- indexing
- recursive subperiods

---

# Historical Classification Requirements

## Kaal Sarp

Do not automatically call the current 12-variety framework ancient/classical.

Verify the exact primary source.

If not verified, label it later/modern.

## Mangal Dosha

Verify whether the exact three-reference-point + ten-cancellation-rule system is actually present in the old primary texts.

Do not label it “classical” without proof.

## Kemadruma

Use primary text wording and check cancellation rules carefully.

## KP

Classify as `MODERN_ASTROLOGICAL`.

Correct the `249/2193` wording.

Document:

- 27 Nakshatras
- 9 subs
- 243 underlying divisions
- 249 horary numbering

## Tajika / Varshaphal

Classify as a later tradition.

Audit Muntha, Varsheshwara, Panchavargiya Bala, and individual Sahams.

## Lal Kitab

Classify as a later system.

Do not mix Pakka Ghar with ordinary planetary lordship.

## Numerology

Separate from classical Jyotiṣa.

Do not label modern Pythagorean/Chaldean alphabet mappings as ancient Vedic rules.

## Astrocartography

Classify as modern.

## Vastu

Vastu has genuine ancient textual roots. Separate those source-backed rules from modern 0–100 scoring and later remedies.

## Palmistry

Separate ancient physiognomic/hand-tradition material from modern computer vision and Aroha's reconciliation algorithm.

## Pancha Pakshi

Verify the exact ancient/old source for every timing rule before calling it ancient.

---

# Panchanga Requirements

Verify:

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

Yoga must have explicit floor/index handling.

Choghadiya must use actual day/night duration rather than assuming every period is always 1.5 hours.

---

# Muhurta Requirements

For every prohibition/filter, identify whether it is:

- ancient/classical
- later tradition
- Aroha proprietary

Do not automatically reject days because of Mercury retrograde, combustion, Kharmas, etc. without source verification.

---

# Vastu Requirements

Separate:

`ANCIENT_VASTU_RULE`

from:

`AROHA_HARMONY_SCORE`

The 0–100 score is proprietary unless a historical source genuinely defines such a scale.

---

# Gemstone Requirements

Verify ancient gem/planet/remedy principles.

Do not assume every modern functional-benefic/malefic prescription is universal ancient doctrine.

Use configurable prescription profiles where traditions differ.

---

# Yantra Requirements

Verify the exact magic-square tables and constants.

Do not label one numerical table “the classical Navagraha Magic Squares” without source proof.

---

# Birth-Time Rectification

Separate classical rectification principles from Aroha's modern minute-by-minute scoring engine.

Output:

- best candidate
- confidence
- alternatives
- evidence
- uncertainty interval

Do not claim mathematical proof of true birth time.

---

# AI Architecture

Maintain:

`Swiss Ephemeris`
→ `Deterministic Calculations`
→ `Rules Engine`
→ `Validated Fact Object`
→ `Source-labelled Interpretation`
→ `LLM Narrative`

LLM must never independently calculate:

- planetary positions
- houses
- Vargas
- dashas
- Shadbala
- Ashtakavarga
- KP sub-lords
- exact timing

---

# Mandatory Accuracy Table

Every major feature requires:

| Feature | Current Accuracy % | Ancient Support % | Verification Confidence % | Classification | Status |
| ------- | -----------------: | ----------------: | ------------------------: | -------------- | ------ |

Percentages describe specification fidelity and verification confidence, not scientific validity.

---

# Mandatory Test Vectors

Create test vectors for:

- planetary positions
- house cusps
- divisional charts
- Shadbala
- Ashtakavarga
- Vimshottari
- Yogini
- Chara Dasha
- Panchanga
- Muhurta
- KP
- Varshaphal

Every formula should have at least one worked numerical example.

---

# Final Quality Bar

The final specification must be:

- historically honest
- mathematically reproducible
- explicit about variants
- source-cited
- deterministic
- testable
- safe around health/fertility/medical claims
- clear about what is ancient versus later versus proprietary
