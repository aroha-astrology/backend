# B — Accuracy Matrix

> Progress tracker. One row per feature. Update Status when the feature closes.
>
> **Percentages describe fidelity to the verified text, not scientific validity.**
>
> - **Accuracy %** = sub-conditions the code reproduces exactly ÷ all sub-conditions of the verified rule. "n/a" when no source has been verified.
> - **Ancient Support %** = sub-rules with a verified old passage ÷ all sub-rules of the feature.
> - **Verification Confidence %**: 90+ = original text + translation both read and agreeing; 70–89 = one translation with verse identified; 40–69 = reached via secondary pointer only; <40 = not verified.
>
> **Status values:** `OPEN` | `IN-PROGRESS` | `CLOSED` | `LABEL-ONLY`
>
> **Superseded for current state (2026-10-11).** The tags and statuses below are the ones from the start of the audit and were not kept up to date row by row. The current label of every feature is in `src/lib/astro-engine/rules/provenance.ts`, shown in `docs/AROHA_E2E_FEATURES_AND_CALCULATIONS_AUDITED.md` (regenerate with `npx tsx scripts/audit-feature-doc.ts`), and what was changed for each fault id is in `C-critical-corrections.md`.

---

## Batch 0 — Setup (R0)

| Feature id | Feature name                             | Classification | Accuracy % | Ancient Support % | Confidence % | Status | Fault ids | Notes             |
| ---------- | ---------------------------------------- | -------------- | ---------: | ----------------: | -----------: | ------ | --------- | ----------------- |
| (all)      | Rules/ folder, audit docs, impact script | R0 foundations |        n/a |               n/a |          n/a | CLOSED | —         | No output changes |

---

## Batch 1 — Core mathematics

### Shadbala

| Feature id  | Feature name            | Classification | Accuracy % | Ancient Support % | Confidence % | Status | Fault ids | Notes               |
| ----------- | ----------------------- | -------------- | ---------: | ----------------: | -----------: | ------ | --------- | ------------------- |
| SHB-UCH     | Uchcha Bala             | UNVERIFIED     |        n/a |               n/a |          n/a | OPEN   | —         |                     |
| SHB-SAP     | Saptavargaja Bala       | UNVERIFIED     |        n/a |               n/a |          n/a | OPEN   | S3        | Code uses D1 only   |
| SHB-OJH     | Ojhayugma Bala          | UNVERIFIED     |        n/a |               n/a |          n/a | OPEN   | —         |                     |
| SHB-KEN     | Kendradi Bala           | UNVERIFIED     |        n/a |               n/a |          n/a | OPEN   | —         |                     |
| SHB-DRK_pos | Drekkana Bala           | UNVERIFIED     |        n/a |               n/a |          n/a | OPEN   | —         |                     |
| SHB-DIG     | Dig Bala                | UNVERIFIED     |        n/a |               n/a |          n/a | OPEN   | S5        | Whole-house         |
| SHB-NAT     | Natonnata Bala          | UNVERIFIED     |        n/a |               n/a |          n/a | OPEN   | S1        | Sun-house heuristic |
| SHB-PAK     | Paksha Bala             | UNVERIFIED     |        n/a |               n/a |          n/a | OPEN   | —         |                     |
| SHB-TRI     | Tribhaga Bala           | UNVERIFIED     |        n/a |               n/a |          n/a | OPEN   | S4        | Code=60, doc=30     |
| SHB-VAR     | Vara Bala               | UNVERIFIED     |        n/a |               n/a |          n/a | OPEN   | —         |                     |
| SHB-MAS     | Masa Bala               | UNVERIFIED     |        n/a |               n/a |          n/a | OPEN   | —         |                     |
| SHB-ABD     | Abda Bala               | UNVERIFIED     |        n/a |               n/a |          n/a | OPEN   | —         |                     |
| SHB-HOR     | Hora Bala               | UNVERIFIED     |        n/a |               n/a |          n/a | OPEN   | S1        | Sunrise fixed 06:00 |
| SHB-AYA     | Ayana Bala              | UNVERIFIED     |          0 |               n/a |          n/a | OPEN   | S6        | Missing from code   |
| SHB-CHE     | Chesta Bala             | UNVERIFIED     |        n/a |               n/a |          n/a | OPEN   | S7        |                     |
| SHB-NAI     | Naisargika Bala         | UNVERIFIED     |        n/a |               n/a |          n/a | OPEN   | —         |                     |
| SHB-DRK     | Drik Bala               | UNVERIFIED     |        n/a |               n/a |          n/a | OPEN   | S8        | Binary only         |
| SHB-THR     | Min-strength thresholds | UNVERIFIED     |        n/a |               n/a |          n/a | OPEN   | —         |                     |

### Ashtakavarga

| Feature id | Feature name           | Classification | Accuracy % | Ancient Support % | Confidence % | Status | Fault ids | Notes            |
| ---------- | ---------------------- | -------------- | ---------: | ----------------: | -----------: | ------ | --------- | ---------------- |
| AKV-BAV    | BAV tables (337 total) | UNVERIFIED     |        n/a |               n/a |          n/a | OPEN   | —         |                  |
| AKV-TRI    | Trikona Shodhana       | UNVERIFIED     |        n/a |               n/a |          n/a | OPEN   | —         |                  |
| AKV-EKA    | Ekadhipatya Shodhana   | UNVERIFIED     |        n/a |               n/a |          n/a | OPEN   | A1        | Raman convention |
| AKV-RGK    | Rasi Gunakara          | UNVERIFIED     |        n/a |               n/a |          n/a | OPEN   | —         |                  |
| AKV-GGK    | Graha Gunakara         | UNVERIFIED     |        n/a |               n/a |          n/a | OPEN   | —         |                  |
| AKV-RP     | Rasi Pinda             | UNVERIFIED     |        n/a |               n/a |          n/a | OPEN   | —         |                  |
| AKV-GP     | Graha Pinda            | UNVERIFIED     |        n/a |               n/a |          n/a | OPEN   | A2        | sum×Gunakar      |
| AKV-SP     | Shodhya Pinda          | UNVERIFIED     |        n/a |               n/a |          n/a | OPEN   | —         |                  |

### Divisional charts

| Feature id | Feature name                  | Classification | Accuracy % | Ancient Support % | Confidence % | Status     | Fault ids | Notes                 |
| ---------- | ----------------------------- | -------------- | ---------: | ----------------: | -----------: | ---------- | --------- | --------------------- |
| VCH-D1     | D1 Rasi                       | UNVERIFIED     |        n/a |               n/a |          n/a | OPEN       | —         |                       |
| VCH-D2     | D2 Hora                       | UNVERIFIED     |        n/a |               n/a |          n/a | OPEN       | —         |                       |
| VCH-D3     | D3 Drekkana                   | UNVERIFIED     |        n/a |               n/a |          n/a | OPEN       | —         |                       |
| VCH-D4     | D4 Chaturthamsa               | UNVERIFIED     |        n/a |               n/a |          n/a | OPEN       | —         |                       |
| VCH-D7     | D7 Saptamsa                   | UNVERIFIED     |        n/a |               n/a |          n/a | OPEN       | —         |                       |
| VCH-D9     | D9 Navamsa                    | UNVERIFIED     |        n/a |               n/a |          n/a | OPEN       | —         |                       |
| VCH-D10    | D10 Dasamsa                   | UNVERIFIED     |        n/a |               n/a |          n/a | OPEN       | —         |                       |
| VCH-D12    | D12 Dwadasamsa                | UNVERIFIED     |        n/a |               n/a |          n/a | OPEN       | —         |                       |
| VCH-D16    | D16 Shodasamsa                | UNVERIFIED     |        n/a |               n/a |          n/a | OPEN       | —         |                       |
| VCH-D20    | D20 Vimsamsa                  | UNVERIFIED     |        n/a |               n/a |          n/a | OPEN       | —         |                       |
| VCH-D24    | D24 Siddhamsa                 | UNVERIFIED     |        n/a |               n/a |          n/a | OPEN       | —         |                       |
| VCH-D27    | D27 Bhamsa                    | UNVERIFIED     |        n/a |               n/a |          n/a | OPEN       | —         |                       |
| VCH-D30    | D30 Trimsamsa                 | UNVERIFIED     |        n/a |               n/a |          n/a | OPEN       | V1        | Odd-sign rule wrong   |
| VCH-D40    | D40 Khavedamsa                | UNVERIFIED     |        n/a |               n/a |          n/a | OPEN       | —         |                       |
| VCH-D45    | D45 Akshavedamsa              | UNVERIFIED     |        n/a |               n/a |          n/a | OPEN       | —         |                       |
| VCH-D60    | D60 Shastiamsa                | UNVERIFIED     |        n/a |               n/a |          n/a | OPEN       | —         |                       |
| VCH-EXT    | D5/D6/D8/D11/D14/D21/D81/D108 | UNVERIFIED     |        n/a |                 0 |          n/a | LABEL-ONLY | V2        | No source; label only |

### Dashas

| Feature id | Feature name                    | Classification | Accuracy % | Ancient Support % | Confidence % | Status | Fault ids | Notes              |
| ---------- | ------------------------------- | -------------- | ---------: | ----------------: | -----------: | ------ | --------- | ------------------ |
| VMD-CYC    | Vimshottari 120-year cycle      | UNVERIFIED     |        n/a |               n/a |          n/a | OPEN   | —         |                    |
| VMD-DUR    | Vimshottari planetary durations | UNVERIFIED     |        n/a |               n/a |          n/a | OPEN   | —         |                    |
| VMD-BAL    | Vimshottari birth balance       | UNVERIFIED     |        n/a |               n/a |          n/a | OPEN   | —         |                    |
| VMD-ANT    | Vimshottari antardasha          | UNVERIFIED     |        n/a |               n/a |          n/a | OPEN   | —         |                    |
| VMD-PRA    | Vimshottari pratyantardasha     | UNVERIFIED     |        n/a |               n/a |          n/a | OPEN   | —         |                    |
| VMD-SOO    | Vimshottari sookshma            | UNVERIFIED     |        n/a |               n/a |          n/a | OPEN   | —         |                    |
| VMD-PRA2   | Vimshottari prana               | UNVERIFIED     |        n/a |               n/a |          n/a | OPEN   | —         |                    |
| CHD-FULL   | Chara Dasha (complete)          | UNVERIFIED     |        n/a |               n/a |          n/a | OPEN   | Y3        | Antardasha missing |
| YGN-FULL   | Yogini Dasha                    | UNVERIFIED     |        n/a |               n/a |          n/a | OPEN   | Y4        | Start formula      |

---

## Batch 2 — Judgement rules

| Feature id | Feature name                  | Classification      | Accuracy % | Ancient Support % | Confidence % | Status     | Fault ids | Notes          |
| ---------- | ----------------------------- | ------------------- | ---------: | ----------------: | -----------: | ---------- | --------- | -------------- |
| DOH-MNG    | Mangal Dosha                  | UNVERIFIED          |        n/a |               n/a |          n/a | OPEN       | D1        |                |
| DOH-KAL    | Kaal Sarp                     | MODERN_ASTROLOGICAL |        n/a |                 0 |          n/a | LABEL-ONLY | D2        |                |
| DOH-PIT    | Pitra Dosha                   | UNVERIFIED          |        n/a |               n/a |          n/a | OPEN       | —         |                |
| DOH-GCH    | Guru Chandal                  | UNVERIFIED          |        n/a |               n/a |          n/a | OPEN       | —         |                |
| DOH-GRH    | Grahan Dosha                  | UNVERIFIED          |        n/a |               n/a |          n/a | OPEN       | —         |                |
| DOH-KEM    | Kemadruma Dosha               | UNVERIFIED          |        n/a |               n/a |          n/a | OPEN       | D3        |                |
| DOH-SAD    | Sade Sati                     | UNVERIFIED          |        n/a |               n/a |          n/a | OPEN       | —         |                |
| DOH-DHA    | Dhaiya                        | UNVERIFIED          |        n/a |               n/a |          n/a | OPEN       | —         |                |
| YGA-PMP    | Pancha Mahapurusha            | UNVERIFIED          |        n/a |               n/a |          n/a | OPEN       | —         |                |
| YGA-RAJ    | Raja Yoga                     | UNVERIFIED          |        n/a |               n/a |          n/a | OPEN       | —         |                |
| YGA-DKA    | Dharma-Karmadhipati           | UNVERIFIED          |        n/a |               n/a |          n/a | OPEN       | —         |                |
| YGA-VIP    | Viparita Raja Yoga            | UNVERIFIED          |        n/a |               n/a |          n/a | OPEN       | —         |                |
| YGA-NEE    | Neechabhanga                  | UNVERIFIED          |        n/a |               n/a |          n/a | OPEN       | —         |                |
| YGA-DHA    | Dhana Yogas                   | UNVERIFIED          |        n/a |               n/a |          n/a | OPEN       | —         |                |
| YGA-LAK    | Lakshmi Yoga                  | UNVERIFIED          |        n/a |               n/a |          n/a | OPEN       | —         |                |
| YGA-GJK    | Gajakesari / Shakata          | UNVERIFIED          |        n/a |               n/a |          n/a | OPEN       | Y1        | False positive |
| YGA-SHA    | Sunapha/Anapha/Durudhara/Adhi | UNVERIFIED          |        n/a |               n/a |          n/a | OPEN       | —         |                |
| YGA-BUD    | Budhaditya Yoga               | UNVERIFIED          |        n/a |               n/a |          n/a | OPEN       | —         |                |
| MT-ASH     | Ashtakoota                    | UNVERIFIED          |        n/a |               n/a |          n/a | OPEN       | —         |                |
| MT-DSH     | Dashakoota                    | UNVERIFIED          |        n/a |               n/a |          n/a | OPEN       | —         |                |
| MT-RIS     | Match risk scoring            | AROHA_PROPRIETARY   |        n/a |                 0 |          n/a | LABEL-ONLY | M1, MT5   |                |

---

## Batch 3 — Time

| Feature id | Feature name        | Classification | Accuracy % | Ancient Support % | Confidence % | Status     | Fault ids | Notes        |
| ---------- | ------------------- | -------------- | ---------: | ----------------: | -----------: | ---------- | --------- | ------------ |
| PAN-TTH    | Tithi               | UNVERIFIED     |        n/a |               n/a |          n/a | OPEN       | —         |              |
| PAN-VAR    | Vara                | UNVERIFIED     |        n/a |               n/a |          n/a | OPEN       | —         |              |
| PAN-NAK    | Nakshatra           | UNVERIFIED     |        n/a |               n/a |          n/a | OPEN       | —         |              |
| PAN-YOG    | Yoga (Panchanga)    | UNVERIFIED     |        n/a |               n/a |          n/a | OPEN       | PN1       |              |
| PAN-KAR    | Karana              | UNVERIFIED     |        n/a |               n/a |          n/a | OPEN       | —         |              |
| PAN-RIS    | Sunrise/sunset      | UNVERIFIED     |        n/a |               n/a |          n/a | OPEN       | —         |              |
| PAN-RHK    | Rahu Kala           | UNVERIFIED     |        n/a |               n/a |          n/a | LABEL-ONLY | DOC       | Code correct |
| PAN-GUL    | Gulika              | UNVERIFIED     |        n/a |               n/a |          n/a | OPEN       | —         |              |
| PAN-YAM    | Yamaganda           | UNVERIFIED     |        n/a |               n/a |          n/a | OPEN       | —         |              |
| PAN-ABH    | Abhijit             | UNVERIFIED     |        n/a |               n/a |          n/a | OPEN       | —         |              |
| PAN-CHO    | Choghadiya          | UNVERIFIED     |        n/a |               n/a |          n/a | LABEL-ONLY | DOC       | Code correct |
| PAN-HOR    | Hora                | UNVERIFIED     |        n/a |               n/a |          n/a | OPEN       | —         |              |
| MUH-FLT    | Muhurta filters     | UNVERIFIED     |        n/a |               n/a |          n/a | OPEN       | —         |              |
| PPK-BRD    | Pancha Pakshi birds | UNVERIFIED     |        n/a |               n/a |          n/a | OPEN       | —         |              |
| PPK-YAM    | Pancha Pakshi yamas | UNVERIFIED     |        n/a |               n/a |          n/a | LABEL-ONLY | DOC       | Code correct |

---

## Batch 4 — Later and modern systems

| Feature id | Feature name             | Classification      | Accuracy % | Ancient Support % | Confidence % | Status     | Fault ids | Notes       |
| ---------- | ------------------------ | ------------------- | ---------: | ----------------: | -----------: | ---------- | --------- | ----------- |
| KP-CLS     | KP classification        | MODERN_ASTROLOGICAL |        n/a |                 0 |          n/a | LABEL-ONLY | —         |             |
| KP-SUB     | KP 243 sub-divisions     | MODERN_ASTROLOGICAL |        n/a |                 0 |          n/a | OPEN       | —         |             |
| KP-249     | KP 1-249 horary          | MODERN_ASTROLOGICAL |          0 |                 0 |          n/a | OPEN       | K1, K2    | Not in code |
| TAJ-SR     | Solar return             | LATER_CLASSICAL     |        n/a |               n/a |          n/a | OPEN       | —         |             |
| TAJ-MUN    | Muntha                   | LATER_CLASSICAL     |        n/a |               n/a |          n/a | OPEN       | —         |             |
| TAJ-VRE    | Varsheshwara             | LATER_CLASSICAL     |        n/a |               n/a |          n/a | OPEN       | —         |             |
| TAJ-PVB    | Panchavargiya Bala       | LATER_CLASSICAL     |        n/a |               n/a |          n/a | OPEN       | —         |             |
| TAJ-SAH    | Sahams                   | LATER_CLASSICAL     |        n/a |               n/a |          n/a | OPEN       | X3        | 5 vs 8      |
| LKB-CLS    | Lal Kitab classification | LATER_CLASSICAL     |        n/a |                 0 |          n/a | LABEL-ONLY | —         |             |
| LKB-PKG    | Pakka Ghar               | LATER_CLASSICAL     |        n/a |               n/a |          n/a | OPEN       | L1        |             |
| LKB-DEB    | Lal Kitab debts          | LATER_CLASSICAL     |        n/a |               n/a |          n/a | OPEN       | —         |             |
| NUM-VED    | Vedic numerology         | UNVERIFIED          |        n/a |               n/a |          n/a | OPEN       | —         |             |
| NUM-CHL    | Chaldean                 | MODERN_ASTROLOGICAL |        n/a |                 0 |          n/a | LABEL-ONLY | —         |             |
| NUM-PYT    | Pythagorean              | MODERN_ASTROLOGICAL |        n/a |                 0 |          n/a | LABEL-ONLY | —         |             |
| NUM-LKY    | Lucky number             | UNVERIFIED          |        n/a |               n/a |          n/a | OPEN       | P2        |             |
| ACG-MAP    | Astrocartography         | MODERN_ASTROLOGICAL |        n/a |                 0 |          n/a | LABEL-ONLY | —         |             |

---

## Batch 5 — The rest

| Feature id | Feature name                      | Classification    | Accuracy % | Ancient Support % | Confidence % | Status     | Fault ids | Notes                    |
| ---------- | --------------------------------- | ----------------- | ---------: | ----------------: | -----------: | ---------- | --------- | ------------------------ |
| VST-ANC    | Vastu ancient rules               | UNVERIFIED        |        n/a |               n/a |          n/a | OPEN       | —         |                          |
| VST-SCR    | Vastu Harmony Score               | AROHA_PROPRIETARY |        n/a |                 0 |          n/a | LABEL-ONLY | —         |                          |
| PLM-ANC    | Ancient bodily-mark material      | UNVERIFIED        |        n/a |               n/a |          n/a | OPEN       | —         |                          |
| PLM-CV     | Computer vision / palm            | AROHA_PROPRIETARY |        n/a |                 0 |          n/a | LABEL-ONLY | —         |                          |
| PLM-REC    | Kundli-palm reconciliation        | AROHA_PROPRIETARY |        n/a |                 0 |          n/a | LABEL-ONLY | —         |                          |
| GEM-ANC    | Ancient gem/planet principles     | UNVERIFIED        |        n/a |               n/a |          n/a | OPEN       | —         |                          |
| GEM-PRX    | Gemstone prescription             | UNVERIFIED        |        n/a |               n/a |          n/a | OPEN       | G1        |                          |
| YNT-TBL    | Yantra magic squares              | UNVERIFIED        |        n/a |               n/a |          n/a | OPEN       | E1        |                          |
| REC-SCR    | Rectification scoring             | AROHA_PROPRIETARY |        n/a |                 0 |          n/a | LABEL-ONLY | —         |                          |
| RPT-HLT    | Health report/risk                | AROHA_PROPRIETARY |        n/a |                 0 |          n/a | OPEN       | SF1       | Provenance block missing |
| RPT-PRG    | Progeny/fertility report          | UNVERIFIED        |        n/a |               n/a |          n/a | OPEN       | SF2       |                          |
| RPT-PL     | Past-life report                  | UNVERIFIED        |        n/a |               n/a |          n/a | OPEN       | SF3       |                          |
| RPT-RPT    | All 16 reports (provenance block) | AROHA_PROPRIETARY |        n/a |               n/a |          n/a | OPEN       | RP1       |                          |
| ARCH-MET   | Metrologist rename                | AROHA_PROPRIETARY |        n/a |               n/a |          n/a | OPEN       | ARCH      |                          |
| ARCH-DEC   | Decision engine                   | AROHA_PROPRIETARY |        n/a |                 0 |          n/a | LABEL-ONLY | —         |                          |
| ARCH-BON   | Aroha Bonds                       | AROHA_PROPRIETARY |        n/a |                 0 |          n/a | LABEL-ONLY | —         |                          |
