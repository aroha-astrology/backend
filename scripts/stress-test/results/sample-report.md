# 🔬 Stress Test Report

**Run ID**: `run-2026-05-03T10-30-00-000Z` *(SAMPLE — run the real test to replace this)*
**Date**: 3/5/2026, 4:00:00 PM IST
**Total duration**: 18.4 min
**Target**: https://jyotish-ai-web.vercel.app ⚠️ **PRODUCTION**

---

## ⚙️ Configuration

| Parameter | Value |
|-----------|-------|
| Target URL | https://jyotish-ai-web.vercel.app |
| Reports backend | NVIDIA NIM `llama-3.3-nemotron-super-49b-v1` |
| Chat backend | NVIDIA NIM (separate key pool — keys 3+4) |
| NIM report keys | 2 (NVIDIA_NIM_REPORT_API_KEY + NVIDIA_NIM_API_KEY) |
| NIM concurrency cap | 12 parallel calls per report process route |
| Dummy users seeded | 10 (stresstest+0..9@jyotish.local) |
| Credits per user | 25 (signup 2 + top-up 23) |
| Poll interval | 2000ms |
| Max wait per report | 600s |

### Round Config

| Round | Users | Indices | Tier | Credits/user | Chat msgs |
|-------|-------|---------|------|-------------|-----------|
| round_1 | 3 | 0,1,2 | kundli_basic (1 cr) | 1 | 0 |
| round_2 | 5 | 0,1,2,3,4 | kundli_standard (2 cr) | 2 | 0 |
| round_3 | 5 | 5,6,7,8,9 | kundli_basic (1 cr) + chat | 1+1 (session) | 3 |

---

## 📊 Round Summary

| Round | Tier | Total | ✅ OK | ❌ Fail | Rate | Min | Avg | p50 | p95 | p99 | Max |
|-------|------|-------|-------|---------|------|-----|-----|-----|-----|-----|-----|
| round_1 | basic | 3 | 3 | 0 | 100% | 1m 38s | 1m 52s | 1m 55s | 2m 08s | 2m 08s | 2m 08s |
| round_2 | standard | 5 | 4 | 1 | 80% | 2m 14s | 3m 42s | 3m 35s | 5m 12s | 5m 12s | 5m 12s |
| round_3 | basic+chat | 5 | 5 | 0 | 100% | 1m 44s | 2m 06s | 2m 02s | 2m 31s | 2m 31s | 2m 31s |

---

## ⏱ Phase Latency Breakdown

> **t_generate** = API call duration (queue POST → 200 returned)
> **t_queue** = time between generate returning and report entering `generating` state (Vercel `after()` dispatch delay)
> **t_process** = `generating` → `ai_ready` (20 parallel NIM calls)
> **t_render** = `ai_ready` → `completed` (PDF generation)

| Round | Phase | Min | Avg | p50 | p95 | Max |
|-------|-------|-----|-----|-----|-----|-----|
| round_1 | **t_generate** | 312ms | 387ms | 401ms | 442ms | 442ms |
| | **t_queue** | 4.2s | 6.8s | 7.1s | 9.3s | 9.3s |
| | **t_process** | 82s | 96s | 98s | 118s | 118s |
| | **t_render** | 8.2s | 10.4s | 10.1s | 13.6s | 13.6s |
| round_2 | **t_generate** | 298ms | 421ms | 415ms | 561ms | 561ms |
| | **t_queue** | 5.1s | 8.4s | 8.2s | 11.7s | 11.7s |
| | **t_process** | 134s | 188s | 182s | 298s | 298s |
| | **t_render** | 9.4s | 12.1s | 11.8s | 16.3s | 16.3s |
| round_3 | **t_generate** | 341ms | 374ms | 368ms | 421ms | 421ms |
| | **t_queue** | 4.8s | 7.2s | 7.0s | 9.8s | 9.8s |
| | **t_process** | 78s | 102s | 99s | 131s | 131s |
| | **t_render** | 7.9s | 11.2s | 10.8s | 14.7s | 14.7s |

---

## 👤 Per-User Detail

> Each row = one user × one round. Users 0–2 appear twice (round_1 + round_2).

| | Idx | Name | Round | Tier | ReportID | Status | Error | t_gen | t_queue | t_process | t_render | t_e2e | Polls | NIM Progress |
|---|-----|------|-------|------|----------|--------|-------|-------|---------|----------|---------|-------|-------|-------------|
| ✅ | u0 | Aarav | round_1 | basic | `a1b2c3d4` | completed | — | 401ms | 7.1s | 1m 38s | 10.1s | 1m 56s | 58 | 5/20 → 12/20 → 18/20 |
| ✅ | u1 | Diya | round_1 | basic | `b2c3d4e5` | completed | — | 442ms | 9.3s | 1m 55s | 13.6s | 2m 08s | 64 | 4/20 → 10/20 → 17/20 |
| ✅ | u2 | Vihaan | round_1 | basic | `c3d4e5f6` | completed | — | 312ms | 4.2s | 1m 38s | 8.2s | 1m 50s | 55 | 6/20 → 14/20 → 20/20 |
| ✅ | u0 | Aarav | round_2 | standard | `d4e5f6g7` | completed | — | 415ms | 8.2s | 2m 14s | 11.8s | 2m 34s | 77 | 3/20 → 8/20 → 15/20 |
| ✅ | u1 | Diya | round_2 | standard | `e5f6g7h8` | completed | — | 561ms | 11.7s | 3m 35s | 16.3s | 3m 52s | 116 | 2/20 → 6/20 → 11/20 |
| ✅ | u2 | Vihaan | round_2 | standard | `f6g7h8i9` | completed | — | 298ms | 5.1s | 3m 02s | 9.4s | 3m 12s | 96 | 3/20 → 9/20 → 16/20 |
| ✅ | u3 | Ananya | round_2 | standard | `g7h8i9j0` | completed | — | 388ms | 6.9s | 2m 48s | 10.7s | 2m 59s | 90 | 4/20 → 11/20 → 18/20 |
| ❌ | u4 | Kabir | round_2 | standard | `h8i9j0k1` | error | ERROR_STATUS | 421ms | — | — | — | — | 8 | — |
| ✅ | u5 | Saanvi | round_3 | basic | `i9j0k1l2` | completed | — | 368ms | 7.0s | 1m 18s | 10.8s | 1m 36s | 48 | 7/20 → 15/20 → 20/20 |
| ✅ | u6 | Arjun | round_3 | basic | `j0k1l2m3` | completed | — | 341ms | 4.8s | 1m 44s | 11.4s | 2m 00s | 60 | 5/20 → 12/20 → 19/20 |
| ✅ | u7 | Myra | round_3 | basic | `k1l2m3n4` | completed | — | 421ms | 9.8s | 2m 11s | 14.7s | 2m 31s | 75 | 4/20 → 9/20 → 17/20 |
| ✅ | u8 | Reyansh | round_3 | basic | `l2m3n4o5` | completed | — | 374ms | 7.4s | 1m 22s | 7.9s | 1m 38s | 49 | 8/20 → 16/20 → 20/20 |
| ✅ | u9 | Aaradhya | round_3 | basic | `m3n4o5p6` | completed | — | 358ms | 6.8s | 1m 42s | 9.6s | 1m 58s | 59 | 6/20 → 13/20 → 19/20 |

---

## 🕐 Per-User Poll Timelines

### u0 — Aarav (round_1, basic) ✅

**Report ID**: `a1b2c3d4`  **Status**: completed  **e2e**: 1m 56s

| Offset | Status | NIM Progress | Timeline (each █ ≈ 5s) |
|--------|--------|-------------|------------------------|
| 2.4s | pending | — |  |
| 4.4s | pending | — |  |
| 6.6s | generating | — | █ |
| 8.6s | generating | 5/20 | █ |
| 18.6s | generating | 12/20 | ███ |
| 38.6s | generating | 18/20 | ████████ |
| 58.6s | generating | 18/20 | ████████████ |
| 1m 38s | ai_ready | — | ████████████████████ |
| 1m 46s | completed | — | █████████████████████ |

### u1 — Diya (round_1, basic) ✅

**Report ID**: `b2c3d4e5`  **Status**: completed  **e2e**: 2m 08s

| Offset | Status | NIM Progress | Timeline (each █ ≈ 5s) |
|--------|--------|-------------|------------------------|
| 2.4s | pending | — |  |
| 4.4s | pending | — |  |
| 8.2s | pending | — | █ |
| 10.3s | generating | — | ██ |
| 20.3s | generating | 4/20 | ████ |
| 40.3s | generating | 10/20 | ████████ |
| 1m 20s | generating | 17/20 | ████████████████ |
| 1m 55s | ai_ready | — | ███████████████████████ |
| 2m 08s | completed | — | █████████████████████████ |

### u2 — Vihaan (round_1, basic) ✅

**Report ID**: `c3d4e5f6`  **Status**: completed  **e2e**: 1m 50s

| Offset | Status | NIM Progress | Timeline (each █ ≈ 5s) |
|--------|--------|-------------|------------------------|
| 2.3s | pending | — |  |
| 4.3s | generating | — |  |
| 6.3s | generating | 6/20 | █ |
| 16.3s | generating | 14/20 | ███ |
| 36.3s | generating | 20/20 | ███████ |
| 56.3s | ai_ready | — | ███████████ |
| 1m 05s | completed | — | █████████████ |

### u0 — Aarav (round_2, standard) ✅

**Report ID**: `d4e5f6g7`  **Status**: completed  **e2e**: 2m 34s

| Offset | Status | NIM Progress | Timeline (each █ ≈ 5s) |
|--------|--------|-------------|------------------------|
| 2.5s | pending | — |  |
| 4.5s | pending | — |  |
| 6.5s | pending | — | █ |
| 8.7s | generating | — | █ |
| 18.7s | generating | 3/20 | ███ |
| 38.7s | generating | 8/20 | ███████ |
| 1m 18s | generating | 15/20 | ███████████████ |
| 2m 14s | ai_ready | — | ██████████████████████████ |
| 2m 26s | completed | — | ████████████████████████████ |

### u1 — Diya (round_2, standard) ✅

**Report ID**: `e5f6g7h8`  **Status**: completed  **e2e**: 3m 52s

| Offset | Status | NIM Progress | Timeline (each █ ≈ 5s) |
|--------|--------|-------------|------------------------|
| 2.6s | pending | — |  |
| 4.6s | pending | — |  |
| 10.4s | pending | — | ██ |
| 12.5s | generating | — | ██ |
| 22.5s | generating | 2/20 | ████ |
| 42.5s | generating | 6/20 | ████████ |
| 1m 42s | generating | 11/20 | ████████████████████ |
| 3m 35s | ai_ready | — | ██████████████████████████████████████████ |
| 3m 52s | completed | — | ████████████████████████████████████████████ |

### u2 — Vihaan (round_2, standard) ✅

**Report ID**: `f6g7h8i9`  **Status**: completed  **e2e**: 3m 12s

| Offset | Status | NIM Progress | Timeline (each █ ≈ 5s) |
|--------|--------|-------------|------------------------|
| 2.4s | pending | — |  |
| 5.2s | generating | — | █ |
| 15.2s | generating | 3/20 | ███ |
| 35.2s | generating | 9/20 | ███████ |
| 1m 15s | generating | 16/20 | ███████████████ |
| 3m 02s | ai_ready | — | ██████████████████████████████████ |
| 3m 12s | completed | — | ████████████████████████████████████ |

### u3 — Ananya (round_2, standard) ✅

**Report ID**: `g7h8i9j0`  **Status**: completed  **e2e**: 2m 59s

| Offset | Status | NIM Progress | Timeline (each █ ≈ 5s) |
|--------|--------|-------------|------------------------|
| 2.5s | pending | — |  |
| 4.5s | pending | — |  |
| 7.1s | generating | — | █ |
| 17.1s | generating | 4/20 | ███ |
| 37.1s | generating | 11/20 | ███████ |
| 1m 17s | generating | 18/20 | ███████████████ |
| 2m 48s | ai_ready | — | ████████████████████████████████ |
| 2m 59s | completed | — | ██████████████████████████████████ |

### u4 — Kabir (round_2, standard) ❌

**Report ID**: `h8i9j0k1`  **Status**: error  **e2e**: N/A

| Offset | Status | NIM Progress | Timeline (each █ ≈ 5s) |
|--------|--------|-------------|------------------------|
| 2.3s | pending | — |  |
| 4.3s | generating | — |  |
| 14.3s | error | — | ██ |

### u5 — Saanvi (round_3, basic) ✅

**Report ID**: `i9j0k1l2`  **Status**: completed  **e2e**: 1m 36s

| Offset | Status | NIM Progress | Timeline (each █ ≈ 5s) |
|--------|--------|-------------|------------------------|
| 2.3s | pending | — |  |
| 4.5s | generating | — |  |
| 14.5s | generating | 7/20 | ██ |
| 34.5s | generating | 15/20 | ██████ |
| 54.5s | generating | 20/20 | ██████████ |
| 1m 18s | ai_ready | — | ███████████████ |
| 1m 29s | completed | — | █████████████████ |

### u6 — Arjun (round_3, basic) ✅

**Report ID**: `j0k1l2m3`  **Status**: completed  **e2e**: 2m 00s

| Offset | Status | NIM Progress | Timeline (each █ ≈ 5s) |
|--------|--------|-------------|------------------------|
| 2.4s | pending | — |  |
| 4.8s | pending | — |  |
| 6.8s | generating | — | █ |
| 16.8s | generating | 5/20 | ███ |
| 36.8s | generating | 12/20 | ███████ |
| 56.8s | generating | 19/20 | ███████████ |
| 1m 44s | ai_ready | — | █████████████████████ |
| 1m 55s | completed | — | ███████████████████████ |

### u7 — Myra (round_3, basic) ✅

**Report ID**: `k1l2m3n4`  **Status**: completed  **e2e**: 2m 31s

| Offset | Status | NIM Progress | Timeline (each █ ≈ 5s) |
|--------|--------|-------------|------------------------|
| 2.6s | pending | — |  |
| 4.6s | pending | — |  |
| 9.6s | pending | — | █ |
| 11.6s | generating | — | ██ |
| 21.6s | generating | 4/20 | ████ |
| 41.6s | generating | 9/20 | ████████ |
| 1m 41s | generating | 17/20 | ████████████████████ |
| 2m 11s | ai_ready | — | ██████████████████████████ |
| 2m 25s | completed | — | █████████████████████████████ |

### u8 — Reyansh (round_3, basic) ✅

**Report ID**: `l2m3n4o5`  **Status**: completed  **e2e**: 1m 38s

| Offset | Status | NIM Progress | Timeline (each █ ≈ 5s) |
|--------|--------|-------------|------------------------|
| 2.3s | pending | — |  |
| 4.3s | generating | — |  |
| 6.3s | generating | 8/20 | █ |
| 16.3s | generating | 16/20 | ███ |
| 36.3s | generating | 20/20 | ███████ |
| 56.3s | ai_ready | — | ███████████ |
| 1m 06s | completed | — | █████████████ |

### u9 — Aaradhya (round_3, basic) ✅

**Report ID**: `m3n4o5p6`  **Status**: completed  **e2e**: 1m 58s

| Offset | Status | NIM Progress | Timeline (each █ ≈ 5s) |
|--------|--------|-------------|------------------------|
| 2.4s | pending | — |  |
| 4.4s | pending | — |  |
| 7.0s | generating | — | █ |
| 17.0s | generating | 6/20 | ███ |
| 37.0s | generating | 13/20 | ███████ |
| 57.0s | generating | 19/20 | ███████████ |
| 1m 42s | ai_ready | — | ████████████████████ |
| 1m 52s | completed | — | ██████████████████████ |

---

## 🔄 Cross-Round Comparison (Users 0–2: R1 basic vs R2 standard)

Users 0–2 ran in **both** round_1 (basic, 1 credit) and round_2 (standard, 2 credits).
This compares their t_process and e2e between rounds, isolating the effect of tier/concurrency.

| Idx | Name | R1 t_process | R2 t_process | Δ process | R1 e2e | R2 e2e |
|-----|------|-------------|-------------|----------|--------|--------|
| u0 | Aarav | 1m 38s | 2m 14s | +36s slower | 1m 56s | 2m 34s |
| u1 | Diya | 1m 55s | 3m 35s | +1m 40s slower | 2m 08s | 3m 52s |
| u2 | Vihaan | 1m 38s | 3m 02s | +1m 24s slower | 1m 50s | 3m 12s |

> Round 2 t_process is 46–87% slower than round 1 — clear NIM key saturation under 5-user concurrent load.

---

## 💬 Chat Performance (Round 3)

> Chat uses NIM keys 3+4 (separate from report keys 1+2).
> Credit: 1 token per **3-minute session** — all 3 messages within 3 min = 1 credit total.

### Summary

| Metric | First Token | Full Response |
|--------|------------|---------------|
| Min | 612ms | 3.1s |
| Avg | 894ms | 4.8s |
| p50 | 881ms | 4.7s |
| p95 | 1.2s | 6.9s |
| Max | 1.3s | 7.2s |

### Per-Message Detail

| | User | Name | Msg | Question | HTTP | Error | First Token | Full | Tokens |
|---|------|------|-----|----------|------|-------|------------|------|--------|
| ✅ | u5 | Saanvi | 1 | _What does my career look like in the next ye…_ | 200 | — | 742ms | 4.2s | 87 |
| ✅ | u5 | Saanvi | 2 | _When will I get married?_ | 200 | — | 612ms | 3.1s | 64 |
| ✅ | u5 | Saanvi | 3 | _What remedies should I do for Saturn?_ | 200 | — | 881ms | 4.8s | 92 |
| ✅ | u6 | Arjun | 1 | _What does my career look like in the next ye…_ | 200 | — | 958ms | 5.1s | 91 |
| ✅ | u6 | Arjun | 2 | _When will I get married?_ | 200 | — | 834ms | 4.4s | 68 |
| ✅ | u6 | Arjun | 3 | _What remedies should I do for Saturn?_ | 200 | — | 1.1s | 6.2s | 98 |
| ✅ | u7 | Myra | 1 | _What does my career look like in the next ye…_ | 200 | — | 1.2s | 6.9s | 103 |
| ✅ | u7 | Myra | 2 | _When will I get married?_ | 200 | — | 891ms | 4.9s | 71 |
| ✅ | u7 | Myra | 3 | _What remedies should I do for Saturn?_ | 200 | — | 1.3s | 7.2s | 96 |
| ✅ | u8 | Reyansh | 1 | _What does my career look like in the next ye…_ | 200 | — | 728ms | 3.9s | 84 |
| ✅ | u8 | Reyansh | 2 | _When will I get married?_ | 200 | — | 671ms | 3.6s | 67 |
| ✅ | u8 | Reyansh | 3 | _What remedies should I do for Saturn?_ | 200 | — | 948ms | 5.3s | 94 |
| ✅ | u9 | Aaradhya | 1 | _What does my career look like in the next ye…_ | 200 | — | 812ms | 4.4s | 89 |
| ✅ | u9 | Aaradhya | 2 | _When will I get married?_ | 200 | — | 694ms | 3.8s | 66 |
| ✅ | u9 | Aaradhya | 3 | _What remedies should I do for Saturn?_ | 200 | — | 1.0s | 5.7s | 97 |

---

## 🚨 Error Breakdown

### Error Count Summary

| Error Code | Count |
|-----------|-------|
| `ERROR_STATUS` | 1 |

### Error Detail

- **u4** (Kabir) round_2: `ERROR_STATUS` — NIM returned 500: upstream model timeout after 14s (single section call)

---

## 🗄️ Database Verification

### generated_reports

Expected total rows: **13** (3 basic + 5 standard + 5 basic = 13 distinct reports)
Actual rows: **12** ⚠️ expected 13 *(u4 Kabir's report failed — row stuck in `error` status)*

| User | report_type | status | count |
|------|-------------|--------|-------|
| u0 (Aarav) | kundli_basic | completed | 1 |
| u0 (Aarav) | kundli_standard | completed | 1 |
| u1 (Diya) | kundli_basic | completed | 1 |
| u1 (Diya) | kundli_standard | completed | 1 |
| u2 (Vihaan) | kundli_basic | completed | 1 |
| u2 (Vihaan) | kundli_standard | completed | 1 |
| u3 (Ananya) | kundli_standard | completed | 1 |
| u4 (Kabir) | kundli_standard | error | 1 |
| u5 (Saanvi) | kundli_basic | completed | 1 |
| u6 (Arjun) | kundli_basic | completed | 1 |
| u7 (Myra) | kundli_basic | completed | 1 |
| u8 (Reyansh) | kundli_basic | completed | 1 |
| u9 (Aaradhya) | kundli_basic | completed | 1 |

### Credit Accounting

Expected total debited: **23** (R1: 3×1=3, R2: 5×2=10, R3: 5×(1+1)=10)
Actual total debited: **21** ⚠️ drift=-2 *(u4 Kabir's 2 credits were deducted before failure — no refund)*

| User | Credits in (signup+topup) | Credits debited | Expected | Drift |
|------|--------------------------|----------------|---------|-------|
| u0 (Aarav) | 25 | 3 | 3 | ✅ 0 |
| u1 (Diya) | 25 | 3 | 3 | ✅ 0 |
| u2 (Vihaan) | 25 | 3 | 3 | ✅ 0 |
| u3 (Ananya) | 25 | 2 | 2 | ✅ 0 |
| u4 (Kabir) | 25 | 2 | 2 | ✅ 0 |
| u5 (Saanvi) | 25 | 2 | 2 | ✅ 0 |
| u6 (Arjun) | 25 | 2 | 2 | ✅ 0 |
| u7 (Myra) | 25 | 2 | 2 | ✅ 0 |
| u8 (Reyansh) | 25 | 2 | 2 | ✅ 0 |
| u9 (Aaradhya) | 25 | 2 | 2 | ✅ 0 |

> Note: R3 chat deducts **1 credit per 3-min session** (not per message). All 3 chat messages within 3 min = 1 session debit.

---

## 🎯 Bottleneck Analysis

### Verdict

**Primary bottleneck: NIM rate limiting.** Under 5 concurrent users (round_2), t_process ballooned from ~96s avg to ~188s avg — a 96% increase. The root cause is only 2 NIM report keys competing for ~100 simultaneous calls (5 users × 20 calls each). The 12-call concurrency cap per report helps limit per-report burst, but multiple reports queuing the same 2 keys creates cumulative 429 backpressure.

### Observations

- 🔴 Round 2 t_process is **96% slower** than round 1 under 5-user load — NIM key saturation confirmed.
- 🟡 u4 (Kabir) failed with a single NIM 500 error (upstream model timeout on one section call) — no retry logic in process route.
- 🟢 Round 3 (different 5 users, fresh keys) performed similar to round 1, confirming the bottleneck is key contention not system degradation.
- 🟢 Chat (keys 3+4) was completely unaffected — first token < 1s throughout, confirming key isolation works.
- 🟢 t_queue (after() dispatch) was consistently 5–12s across all rounds — Vercel background invocations are healthy.
- 🟢 t_render (PDF) was 8–16s — no concern.

### Key Numbers

| Metric | Value |
|--------|-------|
| Slowest report | u1 Diya (round_2) — 3m 52s e2e |
| Fastest report | u5 Saanvi (round_3) — 1m 36s e2e |
| p95 t_process (all rounds) | 298s (round_2) |
| p95 t_render (all rounds) | 16.3s |
| p50 t_queue (all rounds) | 7.1s |
| Total failed reports | 1 / 13 |
| Total failed chats | 0 / 15 |

### Recommendations

1. **Add more NIM report API keys** — with 2 keys and 5 concurrent users each needing 20 calls, you have 100 simultaneous NIM requests. Adding 3–4 more keys (or upgrading NIM tier) directly cuts p95 t_process from ~298s → ~90s.
2. **Add retry on NIM 500** — u4 Kabir's report failed on a single transient 500 from the model. The process route has no retry logic; one bad call fails the entire report and loses 2 credits permanently.
3. **Consider credit refund on server error** — a NIM 500 is not the user's fault. Add a refund path in the error branch of process/route.ts.

---

## 📎 Appendix

### User Roster

| Idx | Name | DOB | TOB | City | Email | Chart ID |
|-----|------|-----|-----|------|-------|---------|
| 0 | Aarav | 1985-03-12 | 04:32 | Mumbai | stresstest+0@jyotish.local | `a1b2c3d4` |
| 1 | Diya | 1992-07-21 | 11:18 | New Delhi | stresstest+1@jyotish.local | `b2c3d4e5` |
| 2 | Vihaan | 1988-11-08 | 22:05 | Bengaluru | stresstest+2@jyotish.local | `c3d4e5f6` |
| 3 | Ananya | 1995-01-30 | 06:47 | Chennai | stresstest+3@jyotish.local | `d4e5f6g7` |
| 4 | Kabir | 1990-09-15 | 14:22 | Kolkata | stresstest+4@jyotish.local | `e5f6g7h8` |
| 5 | Saanvi | 1998-06-04 | 08:55 | Hyderabad | stresstest+5@jyotish.local | `f6g7h8i9` |
| 6 | Arjun | 1983-12-19 | 19:40 | Pune | stresstest+6@jyotish.local | `g7h8i9j0` |
| 7 | Myra | 1996-04-27 | 02:15 | Ahmedabad | stresstest+7@jyotish.local | `h8i9j0k1` |
| 8 | Reyansh | 1987-10-03 | 16:08 | Jaipur | stresstest+8@jyotish.local | `i9j0k1l2` |
| 9 | Aaradhya | 1993-02-14 | 05:33 | Lucknow | stresstest+9@jyotish.local | `j0k1l2m3` |

### Round Assignment

| User | Round 1 (3 users, basic) | Round 2 (5 users, standard) | Round 3 (5 users, basic+chat) |
|------|--------------------------|-----------------------------|-----------------------------|
| u0 Aarav | ✅ | ✅ | — |
| u1 Diya | ✅ | ✅ | — |
| u2 Vihaan | ✅ | ✅ | — |
| u3 Ananya | — | ✅ | — |
| u4 Kabir | — | ✅ | — |
| u5 Saanvi | — | — | ✅ (report + 3 chats) |
| u6 Arjun | — | — | ✅ (report + 3 chats) |
| u7 Myra | — | — | ✅ (report + 3 chats) |
| u8 Reyansh | — | — | ✅ (report + 3 chats) |
| u9 Aaradhya | — | — | ✅ (report + 3 chats) |

### How to Read This Report

- **t_generate**: time for the POST /api/reports/generate call to return 200 (should be <2s — just writes DB + fires after())
- **t_queue**: gap between generate returning and the process route starting (Vercel after() dispatch latency)
- **t_process**: time NIM takes to complete all 20 AI section calls (main bottleneck under load)
- **t_render**: PDF generation time after AI is done
- **t_e2e**: total wall time from user firing generate to report reaching `completed`
- **NIM Progress**: snapshots of "X/20" seen during polling — shows how far NIM got before a 429 stall

### Cleanup

```powershell
npx tsx scripts/stress-test/cleanup.ts --prod
```

This deletes all 10 test users + cascades to all dependent tables.

---
*This is a SAMPLE report with realistic mock data. Run the real test to replace it:*
```powershell
npx tsx scripts/stress-test/seed.ts --prod
npx tsx scripts/stress-test/run.ts --prod
```
