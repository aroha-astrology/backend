# A — Executive Verdict

**Date opened:** 2026-10-06  
**Engine version:** CALCULATION_VERSION 2026.08.1  
**Branch:** feat/engine-source-audit

---

## Summary

The audit compares three things for every rule: the old primary text, the live engine code (`backend/src/lib`), and the specification document (`AROHA_E2E_FEATURES_AND_CALCULATIONS.md`).

The engine is in production and working. The purpose of this verdict is to label every rule honestly before any wording appears in an app or a prompt, and to record which parts need correction.

---

## Status legend

| Tag            | Meaning                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------- |
| ✅ CORRECT     | Code and verified source agree; document agrees                                             |
| ⚠️ INCORRECT   | Code disagrees with the verified source, or doc claims something the code does not do       |
| 🔵 AMBIGUOUS   | Two classical traditions differ; Aroha uses one without saying so                           |
| 🕐 LATER       | Rule is from a later tradition (Tajika, KP, Lal Kitab, etc.) correctly used but mislabelled |
| 🔒 PROPRIETARY | Aroha's own algorithm; no classical precedent claimed                                       |
| 🔍 UNVERIFIED  | Source check not yet completed for this batch                                               |

---

## Verdict by section

> All sections start as UNVERIFIED at R0. Each batch updates this file.

| Section (E2E doc §)  | Feature                       | Verdict        | Fault ids | Notes                                            |
| -------------------- | ----------------------------- | -------------- | --------- | ------------------------------------------------ |
| §4 Shadbala          | Uchcha Bala                   | 🔍 UNVERIFIED  | —         |                                                  |
| §4 Shadbala          | Saptavargaja Bala             | ⚠️ INCORRECT   | S3        | Code uses D1 only; document claims 7-varga       |
| §4 Shadbala          | Tribhaga Bala                 | ⚠️ INCORRECT   | S4        | Code gives 60, document says 30                  |
| §4 Shadbala          | Natonnata day/night           | ⚠️ INCORRECT   | S1        | Sun house heuristic; real sunrise not used       |
| §4 Shadbala          | Hora Bala                     | ⚠️ INCORRECT   | S1        | Sunrise assumed 06:00 UT                         |
| §4 Shadbala          | Ayana Bala                    | ⚠️ INCORRECT   | S6        | Missing from code entirely                       |
| §4 Shadbala          | Chesta Bala                   | ⚠️ INCORRECT   | S7        | Sun/Moon flat 30; speed-ratio formula unverified |
| §4 Shadbala          | Dig Bala                      | ⚠️ INCORRECT   | S5        | Whole-house; continuous formula expected         |
| §4 Shadbala          | Drik Bala                     | ⚠️ INCORRECT   | S8        | Binary aspects; graded strength expected         |
| §5 Ashtakavarga      | Graha Pinda                   | ⚠️ INCORRECT   | A2        | sum×Gunakar formula likely wrong                 |
| §5 Ashtakavarga      | Ekadhipatya rules             | 🔵 AMBIGUOUS   | A1        | Convention credited to Raman; unverified         |
| §6 Divisional charts | D30                           | ⚠️ INCORRECT   | V1        | Maps ruler to odd sign in both odd and even      |
| §6 Divisional charts | D5/D6/D8/D11/D14/D21/D81/D108 | 🔍 UNVERIFIED  | V2        | Generic rule; no known source                    |
| §7 Vimshottari       | Year length                   | 🔵 AMBIGUOUS   | —         | 365.25 days; Surya Siddhanta differs             |
| §7 Chara Dasha       | Antardasha, karakas           | ⚠️ INCORRECT   | Y3        | Both missing                                     |
| §7 Yogini            | Start formula                 | ⚠️ INCORRECT   | Y4        | (nakshatra+3)%8 unverified                       |
| §8 Doshas            | Mangal cancellations          | ⚠️ INCORRECT   | D1        | 10-rule list not in known primary texts          |
| §8 Doshas            | Kaal Sarp 12 names            | 🕐 LATER       | D2        | Modern framework; label MODERN_ASTROLOGICAL      |
| §8 Doshas            | Kemadruma cancellations       | ⚠️ INCORRECT   | D3        | Conditions differ from code                      |
| §9 Yogas             | Shakata                       | ⚠️ INCORRECT   | Y1        | Requires Jupiter 7th from Moon; false positives  |
| §10 Matchmaking      | Nadi, Gana, Rajju, Yoni       | 🔍 UNVERIFIED  | —         | Formulae need source check                       |
| §11 Bonds            | All                           | 🔒 PROPRIETARY | —         | Aroha's own                                      |
| §12 Panchanga        | Yoga index                    | ⚠️ INCORRECT   | PN1       | Floor/index convention missing                   |
| §12 Panchanga        | Rahu Kala                     | ✅ CORRECT     | DOC       | Uses real sunrise; document wrong                |
| §12 Panchanga        | Choghadiya                    | ✅ CORRECT     | DOC       | Uses real day length; document wrong             |
| §14 KP               | Classification                | 🕐 LATER       | K1        | Must be MODERN_ASTROLOGICAL                      |
| §14 KP               | 1-249 table                   | ⚠️ INCORRECT   | K2        | Not in code; 2193 is wrong                       |
| §15 Varshaphal       | Classification                | 🕐 LATER       | —         | Later tradition                                  |
| §15 Varshaphal       | Sahams                        | ⚠️ INCORRECT   | X3        | 5 sahams with separate formulas vs 8 in doc      |
| §16 Lal Kitab        | Pakka Ghar                    | ⚠️ INCORRECT   | L1        | Mixed with ordinary lordship                     |
| §17 Numerology       | Chaldean / Pythagorean        | 🕐 LATER       | —         | Not ancient Vedic                                |
| §18 Astrocartography | All                           | 🕐 LATER       | —         | Modern                                           |
| §19 Vastu            | Harmony Score                 | 🔒 PROPRIETARY | —         | Aroha 0-100 scale                                |
| §20 Palmistry        | CV / reconciliation           | 🔒 PROPRIETARY | —         | Aroha AI layer                                   |
| §21 Gemstones        | Prescription                  | 🔍 UNVERIFIED  | G1        | Depends on Shadbala; blocked until R2            |
| §22 Yantras          | Magic squares                 | 🔍 UNVERIFIED  | E1        | One table called "classical" without source      |
| §23 Pancha Pakshi    | Yamas                         | ✅ CORRECT     | DOC       | Uses real sunrise                                |
| §24 Rectification    | Scoring                       | 🔒 PROPRIETARY | —         | Aroha minute-by-minute engine                    |
| §26 AI chat          | Metrologist                   | ⚠️ INCORRECT   | ARCH      | Name implies LLM; code is deterministic          |
| §25/various          | Reports (16)                  | 🔒 PROPRIETARY | RP1       | Provenance blocks missing                        |

---

## Safety flags

| Flag | Scope                                             | Action                                                |
| ---- | ------------------------------------------------- | ----------------------------------------------------- |
| SF1  | Health report, match health risk, surgery muhurta | Add provenance + safety_classification block          |
| SF2  | Progeny / fertility report                        | Remove unverified sex-tendency and child-count claims |
| SF3  | Past-life report, dosha on baby-name              | Soften factual language; add provenance               |

---

## Document / code discrepancies (where code is RIGHT)

| Area          | Code                      | Document    | Action                             |
| ------------- | ------------------------- | ----------- | ---------------------------------- |
| Tribhaga      | 60 Virupas                | 30 Virupas  | Fix document                       |
| Choghadiya    | Real day length           | Fixed 1.5 h | Fix document                       |
| Pancha Pakshi | Real sunrise              | Fixed 2.4 h | Fix document                       |
| Uchcha wrap   | Circular difference       | Linear      | Verify source, likely fix document |
| Yoga count    | 57 named yogas            | "100+"      | Fix document                       |
| Rectification | ±60 min in 4-minute steps | Vague       | Clarify document                   |

---

_This file is updated at the close of each batch. See B-accuracy-matrix.md for per-feature tracking._
