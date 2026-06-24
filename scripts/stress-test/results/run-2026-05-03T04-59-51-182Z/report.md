# 🔬 Stress Test Report

**Run ID**: `run-2026-05-03T04-59-51-182Z`
**Date**: 3/5/2026, 10:29:51 am IST
**Total duration**: 118.9s
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
| round_1 | basic | 0 | 0 | 0 | 0% | N/A | N/A | N/A | N/A | N/A | N/A |
| round_2 | standard | 0 | 0 | 0 | 0% | N/A | N/A | N/A | N/A | N/A | N/A |
| round_3 | basic+chat | 5 | 5 | 0 | 100% | 100.5s | 106.2s | 104.0s | 117.0s | 117.0s | 117.0s |

---

## ⏱ Phase Latency Breakdown

> **t_generate** = API call duration (queue POST → 200 returned)
> **t_queue** = time between generate returning and report entering `generating` state (Vercel `after()` dispatch delay)
> **t_process** = `generating` → `ai_ready` (20 parallel NIM calls)
> **t_render** = `ai_ready` → `completed` (PDF generation)

| Round | Phase | Min | Avg | p50 | p95 | Max |
|-------|-------|-----|-----|-----|-----|-----|
| round_1 | — | — | — | — | — | — |
| round_2 | — | — | — | — | — | — |
| round_3 | **t_generate** | 4.5s | 5.1s | 5.0s | 5.8s | 5.8s |
| | **t_queue** | 3.1s | 3.2s | 3.2s | 3.4s | 3.4s |
| | **t_process** | 77.6s | 86.8s | 87.0s | 99.2s | 99.2s |
| | **t_render** | 9.2s | 11.2s | 9.6s | 15.5s | 15.5s |

---

## 👤 Per-User Detail

| | Idx | Name | Round | Tier | ReportID | Status | Error | t_gen | t_queue | t_process | t_render | t_e2e | Polls | NIM Progress |
|---|-----|------|-------|------|----------|--------|-------|-------|---------|----------|---------|-------|-------|-------------|
| ✅ | u5 | Saanvi | round_3 | basic | `63f871ec` | completed | — | 5.6s | 3.2s | 79.4s | 12.3s | 100.5s | 28 | — |
| ✅ | u8 | Reyansh | round_3 | basic | `605d0170` | completed | — | 5.8s | 3.4s | 77.6s | 15.5s | 102.4s | 29 | — |
| ✅ | u6 | Arjun | round_3 | basic | `6b13e8ef` | completed | — | 4.6s | 3.1s | 87.0s | 9.2s | 104.0s | 30 | — |
| ✅ | u7 | Myra | round_3 | basic | `332370f2` | completed | — | 4.5s | 3.2s | 90.5s | 9.2s | 107.4s | 31 | — |
| ✅ | u9 | Aaradhya | round_3 | basic | `d8745089` | completed | — | 5.0s | 3.1s | 99.2s | 9.6s | 117.0s | 33 | — |

---

## 🕐 Per-User Poll Timelines

### u5 — Saanvi (round_3, basic) ✅

**Report ID**: `63f871ec-66b1-4f2f-81b5-4bb003581d0d`  **Status**: completed  **e2e**: 100.5s

| Offset | Status | NIM Progress | Timeline (each █ ≈ 5s) |
|--------|--------|-------------|------------------------|
|    8.8s | generating   | — | ██ |
|   11.9s | generating   | — | ██ |
|   15.0s | generating   | — | ███ |
|   18.0s | generating   | — | ████ |
|   25.3s | generating   | — | █████ |
|   29.5s | generating   | — | ██████ |
|   33.1s | generating   | — | ███████ |
|   36.1s | generating   | — | ███████ |
|   39.3s | generating   | — | ████████ |
|   42.3s | generating   | — | ████████ |
|   45.4s | generating   | — | █████████ |
|   49.0s | generating   | — | ██████████ |
|   52.4s | generating   | — | ██████████ |
|   55.5s | generating   | — | ███████████ |
|   58.6s | generating   | — | ████████████ |
|   61.7s | generating   | — | ████████████ |
|   64.8s | generating   | — | █████████████ |
|   67.9s | generating   | — | ██████████████ |
|   71.0s | generating   | — | ██████████████ |
|   74.0s | generating   | — | ███████████████ |
|   77.1s | generating   | — | ███████████████ |
|   81.7s | generating   | — | ████████████████ |
|   85.1s | generating   | — | █████████████████ |
|   88.2s | ai_ready     | — | ██████████████████ |
|   91.3s | ai_ready     | — | ██████████████████ |
|   94.4s | ai_ready     | — | ███████████████████ |
|   97.5s | ai_ready     | — | ███████████████████ |
|  100.5s | ready        | — | ████████████████████ |

### u8 — Reyansh (round_3, basic) ✅

**Report ID**: `605d0170-9d4c-49aa-b294-abf03085a231`  **Status**: completed  **e2e**: 102.4s

| Offset | Status | NIM Progress | Timeline (each █ ≈ 5s) |
|--------|--------|-------------|------------------------|
|    9.2s | generating   | — | ██ |
|   12.2s | generating   | — | ██ |
|   15.2s | generating   | — | ███ |
|   18.3s | generating   | — | ████ |
|   25.2s | generating   | — | █████ |
|   28.6s | generating   | — | ██████ |
|   32.7s | generating   | — | ███████ |
|   35.7s | generating   | — | ███████ |
|   38.8s | generating   | — | ████████ |
|   41.8s | generating   | — | ████████ |
|   44.9s | generating   | — | █████████ |
|   48.0s | generating   | — | ██████████ |
|   51.1s | generating   | — | ██████████ |
|   54.1s | generating   | — | ███████████ |
|   57.2s | generating   | — | ███████████ |
|   60.3s | generating   | — | ████████████ |
|   63.4s | generating   | — | █████████████ |
|   66.4s | generating   | — | █████████████ |
|   69.5s | generating   | — | ██████████████ |
|   72.5s | generating   | — | ███████████████ |
|   75.6s | generating   | — | ███████████████ |
|   78.6s | generating   | — | ████████████████ |
|   83.7s | generating   | — | █████████████████ |
|   86.8s | ai_ready     | — | █████████████████ |
|   89.9s | ai_ready     | — | ██████████████████ |
|   93.0s | ai_ready     | — | ███████████████████ |
|   96.0s | ai_ready     | — | ███████████████████ |
|   99.2s | ai_ready     | — | ████████████████████ |
|  102.4s | ready        | — | ████████████████████ |

### u6 — Arjun (round_3, basic) ✅

**Report ID**: `6b13e8ef-5bd1-4b1a-b8d1-0c5c373b9a2e`  **Status**: completed  **e2e**: 104.0s

| Offset | Status | NIM Progress | Timeline (each █ ≈ 5s) |
|--------|--------|-------------|------------------------|
|    7.7s | generating   | — | ██ |
|   10.7s | generating   | — | ██ |
|   14.3s | generating   | — | ███ |
|   17.7s | generating   | — | ████ |
|   23.9s | generating   | — | █████ |
|   27.1s | generating   | — | █████ |
|   30.2s | generating   | — | ██████ |
|   33.3s | generating   | — | ███████ |
|   37.4s | generating   | — | ███████ |
|   40.4s | generating   | — | ████████ |
|   43.5s | generating   | — | █████████ |
|   46.6s | generating   | — | █████████ |
|   49.6s | generating   | — | ██████████ |
|   52.7s | generating   | — | ███████████ |
|   55.8s | generating   | — | ███████████ |
|   58.8s | generating   | — | ████████████ |
|   61.9s | generating   | — | ████████████ |
|   65.4s | generating   | — | █████████████ |
|   68.6s | generating   | — | ██████████████ |
|   71.7s | generating   | — | ██████████████ |
|   74.7s | generating   | — | ███████████████ |
|   77.8s | generating   | — | ████████████████ |
|   82.5s | generating   | — | █████████████████ |
|   85.6s | generating   | — | █████████████████ |
|   88.6s | generating   | — | ██████████████████ |
|   91.7s | generating   | — | ██████████████████ |
|   94.8s | ai_ready     | — | ███████████████████ |
|   97.8s | ai_ready     | — | ████████████████████ |
|  100.9s | ai_ready     | — | ████████████████████ |
|  104.0s | ready        | — | █████████████████████ |

### u7 — Myra (round_3, basic) ✅

**Report ID**: `332370f2-165b-43bc-91e4-3d6634691479`  **Status**: completed  **e2e**: 107.4s

| Offset | Status | NIM Progress | Timeline (each █ ≈ 5s) |
|--------|--------|-------------|------------------------|
|    7.7s | generating   | — | ██ |
|   10.8s | generating   | — | ██ |
|   13.9s | generating   | — | ███ |
|   16.9s | generating   | — | ███ |
|   24.1s | generating   | — | █████ |
|   28.0s | generating   | — | ██████ |
|   31.0s | generating   | — | ██████ |
|   34.0s | generating   | — | ███████ |
|   37.1s | generating   | — | ███████ |
|   40.2s | generating   | — | ████████ |
|   43.2s | generating   | — | █████████ |
|   46.3s | generating   | — | █████████ |
|   49.9s | generating   | — | ██████████ |
|   52.9s | generating   | — | ███████████ |
|   56.1s | generating   | — | ███████████ |
|   59.1s | generating   | — | ████████████ |
|   62.2s | generating   | — | ████████████ |
|   65.3s | generating   | — | █████████████ |
|   68.3s | generating   | — | ██████████████ |
|   71.4s | generating   | — | ██████████████ |
|   74.5s | generating   | — | ███████████████ |
|   77.5s | generating   | — | ████████████████ |
|   82.8s | generating   | — | █████████████████ |
|   85.9s | generating   | — | █████████████████ |
|   89.0s | generating   | — | ██████████████████ |
|   92.0s | generating   | — | ██████████████████ |
|   95.1s | generating   | — | ███████████████████ |
|   98.2s | ai_ready     | — | ████████████████████ |
|  101.3s | ai_ready     | — | ████████████████████ |
|  104.3s | ai_ready     | — | █████████████████████ |
|  107.4s | ready        | — | █████████████████████ |

### u9 — Aaradhya (round_3, basic) ✅

**Report ID**: `d8745089-e5aa-46fa-a172-19eeae276148`  **Status**: completed  **e2e**: 117.0s

| Offset | Status | NIM Progress | Timeline (each █ ≈ 5s) |
|--------|--------|-------------|------------------------|
|    8.2s | generating   | — | ██ |
|   11.2s | generating   | — | ██ |
|   14.3s | generating   | — | ███ |
|   17.3s | generating   | — | ███ |
|   24.2s | generating   | — | █████ |
|   28.1s | generating   | — | ██████ |
|   31.7s | generating   | — | ██████ |
|   34.8s | generating   | — | ███████ |
|   38.9s | generating   | — | ████████ |
|   42.0s | generating   | — | ████████ |
|   45.1s | generating   | — | █████████ |
|   48.2s | generating   | — | ██████████ |
|   51.2s | generating   | — | ██████████ |
|   54.3s | generating   | — | ███████████ |
|   57.4s | generating   | — | ███████████ |
|   60.5s | generating   | — | ████████████ |
|   63.6s | generating   | — | █████████████ |
|   66.7s | generating   | — | █████████████ |
|   69.8s | generating   | — | ██████████████ |
|   72.8s | generating   | — | ███████████████ |
|   75.8s | generating   | — | ███████████████ |
|   82.6s | generating   | — | █████████████████ |
|   85.8s | generating   | — | █████████████████ |
|   88.9s | generating   | — | ██████████████████ |
|   92.0s | generating   | — | ██████████████████ |
|   95.1s | generating   | — | ███████████████████ |
|   98.2s | generating   | — | ████████████████████ |
|  101.3s | generating   | — | ████████████████████ |
|  104.3s | generating   | — | █████████████████████ |
|  107.4s | ai_ready     | — | █████████████████████ |
|  110.4s | ai_ready     | — | ██████████████████████ |
|  113.5s | ai_ready     | — | ███████████████████████ |
|  117.0s | ready        | — | ███████████████████████ |
---

## 🔄 Cross-Round Comparison (Users 0–2: R1 basic vs R2 standard)

Users 0–2 ran in **both** round_1 (basic, 1 credit) and round_2 (standard, 2 credits).
This compares their t_process and e2e between rounds, isolating the effect of tier/concurrency.

| Idx | Name | R1 t_process | R2 t_process | Δ process | R1 e2e | R2 e2e |
|-----|------|-------------|-------------|----------|--------|--------|
_No data_

> If R2 t_process is much slower, the bottleneck is NIM saturation (5 concurrent users × more calls/token).

---

## 💬 Chat Performance (Round 3)

> Chat uses NIM keys 3+4 (separate from report keys 1+2).
> Credit: 1 token per **3-minute session** — all 3 messages within 3 min = 1 credit total.

### Summary

| Metric | First Token | Full Response |
|--------|------------|---------------|
| Min | 2.6s | 3.6s |
| Avg | 3.7s | 5.2s |
| p50 | 2.8s | 4.3s |
| p95 | 5.8s | 7.6s |
| Max | 5.8s | 7.6s |

### Per-Message Detail

| | User | Name | Msg | Question | HTTP | Error | First Token | Full | Tokens |
|---|------|------|-----|----------|------|-------|------------|------|--------|
| ✅ | u5 | Saanvi | 1 | _What does my career look like in the nex…_ | 200 | — | 5.8s | 7.5s | 276 |
| ✅ | u5 | Saanvi | 2 | _When will I get married?_ | 200 | — | 3.9s | 5.4s | 272 |
| ✅ | u5 | Saanvi | 3 | _What remedies should I do for Saturn?_ | 200 | — | 2.6s | 4.2s | 280 |
| ✅ | u8 | Reyansh | 1 | _What does my career look like in the nex…_ | 200 | — | 5.8s | 7.6s | 277 |
| ✅ | u8 | Reyansh | 2 | _When will I get married?_ | 200 | — | 2.7s | 3.9s | 210 |
| ✅ | u8 | Reyansh | 3 | _What remedies should I do for Saturn?_ | 200 | — | 2.6s | 4.2s | 276 |
| ✅ | u6 | Arjun | 1 | _What does my career look like in the nex…_ | 200 | — | 4.3s | 5.8s | 274 |
| ✅ | u6 | Arjun | 2 | _When will I get married?_ | 200 | — | 2.6s | 4.2s | 272 |
| ✅ | u6 | Arjun | 3 | _What remedies should I do for Saturn?_ | 200 | — | 2.7s | 4.3s | 276 |
| ✅ | u7 | Myra | 1 | _What does my career look like in the nex…_ | 200 | — | 5.2s | 6.7s | 276 |
| ✅ | u7 | Myra | 2 | _When will I get married?_ | 200 | — | 2.8s | 3.6s | 154 |
| ✅ | u7 | Myra | 3 | _What remedies should I do for Saturn?_ | 200 | — | 2.6s | 4.2s | 276 |
| ✅ | u9 | Aaradhya | 1 | _What does my career look like in the nex…_ | 200 | — | 5.1s | 6.6s | 276 |
| ✅ | u9 | Aaradhya | 2 | _When will I get married?_ | 200 | — | 4.1s | 5.5s | 246 |
| ✅ | u9 | Aaradhya | 3 | _What remedies should I do for Saturn?_ | 200 | — | 2.6s | 4.1s | 280 |

---

## 🚨 Error Breakdown

**No errors.** All requests completed successfully.

---

## 🗄️ Database Verification

### generated_reports

Expected total rows: **13** (3 basic + 5 standard + 5 basic = 13 distinct reports)
Actual rows: **18** ⚠️ expected 13

| User | report_type | status | count |
|------|-------------|--------|-------|
| u7 (Myra) | kundli_basic | ready | 2 |
| u6 (Arjun) | kundli_basic | ready | 2 |
| u5 (Saanvi) | kundli_basic | ready | 2 |
| u2 (Vihaan) | kundli_basic | ready | 1 |
| u2 (Vihaan) | kundli_standard | ready | 1 |
| u4 (Kabir) | kundli_standard | ready | 1 |
| u9 (Aaradhya) | kundli_basic | ready | 2 |
| u1 (Diya) | kundli_basic | ready | 1 |
| u1 (Diya) | kundli_standard | ready | 1 |
| u3 (Ananya) | kundli_standard | ready | 1 |
| u8 (Reyansh) | kundli_basic | ready | 2 |
| u0 (Aarav) | kundli_basic | ready | 1 |
| u0 (Aarav) | kundli_standard | ready | 1 |

### Credit Accounting

Expected total debited: **23** (R1: 3×1=3, R2: 5×2=10, R3: 5×(1+1)=10)
Actual total debited: **23** ✅

| User | Credits in (signup+topup) | Credits debited | Expected | Drift |
|------|--------------------------|----------------|---------|-------|
| u0 (Aarav) | 2 | 3 | 3 | ✅ 0 |
| u1 (Diya) | 2 | 3 | 3 | ✅ 0 |
| u2 (Vihaan) | 2 | 3 | 3 | ✅ 0 |
| u3 (Ananya) | 2 | 2 | 2 | ✅ 0 |
| u4 (Kabir) | 2 | 2 | 2 | ✅ 0 |
| u5 (Saanvi) | 2 | 2 | 2 | ✅ 0 |
| u6 (Arjun) | 2 | 2 | 2 | ✅ 0 |
| u7 (Myra) | 2 | 2 | 2 | ✅ 0 |
| u8 (Reyansh) | 2 | 2 | 2 | ✅ 0 |
| u9 (Aaradhya) | 2 | 2 | 2 | ✅ 0 |

> Note: R3 chat deducts **1 credit per 3-min session** (not per message). All 3 chat messages within 3 min = 1 session debit.

---

## 🎯 Bottleneck Analysis

### Verdict

Stack handled load well under 5 total user-rounds. p95 t_process: 99.2s, p95 t_render: 15.5s.

### Observations

- 🟢 All phases within normal bounds.

### Key Numbers

| Metric | Value |
|--------|-------|
| Slowest report | u9 (Aaradhya) — 117.0s e2e |
| Fastest report | u5 (Saanvi) — 100.5s e2e |
| p95 t_process (all rounds) | 99.2s |
| p95 t_render (all rounds) | 15.5s |
| p50 t_queue (all rounds) | 3.2s |
| Total failed reports | 0 / 5 |
| Total failed chats | 0 / 15 |

### Recommendations


1. Stack is performing well under this concurrency level.
2. Run the same test with 10 concurrent users to find the actual saturation point.


---

## 📎 Appendix

### User Roster

| Idx | Name | DOB | TOB | City | Email | Chart ID |
|-----|------|-----|-----|------|-------|---------|
| 0 | Aarav | 1985-03-12 | 04:32 | 0 | stresstest+0@jyotish.local | `a781444c` |
| 1 | Diya | 1992-07-21 | 11:18 | 1 | stresstest+1@jyotish.local | `82e4d773` |
| 2 | Vihaan | 1988-11-08 | 22:05 | 2 | stresstest+2@jyotish.local | `0d09de89` |
| 3 | Ananya | 1995-01-30 | 06:47 | 3 | stresstest+3@jyotish.local | `a97a271f` |
| 4 | Kabir | 1990-09-15 | 14:22 | 4 | stresstest+4@jyotish.local | `086c1006` |
| 5 | Saanvi | 1998-06-04 | 08:55 | 5 | stresstest+5@jyotish.local | `b4098f19` |
| 6 | Arjun | 1983-12-19 | 19:40 | 6 | stresstest+6@jyotish.local | `13403c84` |
| 7 | Myra | 1996-04-27 | 02:15 | 7 | stresstest+7@jyotish.local | `22443fda` |
| 8 | Reyansh | 1987-10-03 | 16:08 | 8 | stresstest+8@jyotish.local | `f1541f6b` |
| 9 | Aaradhya | 1993-02-14 | 05:33 | 9 | stresstest+9@jyotish.local | `8b6f5c0c` |

### How to Read This Report

- **t_generate**: time for the POST /api/reports/generate call to return 200 (should be <2s — just writes DB + fires after())
- **t_queue**: gap between generate returning and the process route starting (Vercel after() dispatch latency)
- **t_process**: time NIM takes to complete all 20 AI section calls (main bottleneck under load)
- **t_render**: PDF generation time after AI is done
- **t_e2e**: total wall time from user firing generate to report reaching `completed`
- **NIM Progress**: snapshots of "X/20" seen during polling — shows how far NIM got

### Cleanup

```powershell
npx tsx scripts/stress-test/cleanup.ts --prod
```

This deletes all 10 test users + cascades to all dependent tables (birth_profiles, kundli_charts, generated_reports, credit_transactions, etc.).

---
*Generated by scripts/stress-test/run.ts*
