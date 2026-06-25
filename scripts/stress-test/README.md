# Stress Test — 10 Dummy Users × 3 Rounds (Production)

Tests the report generation pipeline and AI chat under concurrent load.

## Prerequisites

- `apps/web/.env.local` must contain `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `INTERNAL_PROCESS_KEY`
- The production app must be live and reachable

## Run order

```powershell
# Step 1 — Create 10 dummy users in production, top up credits, generate kundlis
npx tsx scripts/stress-test/seed.ts --prod

# Step 2 — Run 3 concurrent rounds and generate a report
npx tsx scripts/stress-test/run.ts --prod

# Step 3 — Inspect the report
#   results/run-<timestamp>/report.md

# Step 4 — Clean up all test users and their data
npx tsx scripts/stress-test/cleanup.ts --prod
```

## Rounds

| Round | Users | Tier | Chat |
|-------|-------|------|------|
| 1 | 3 (users 0-2) | kundli_basic | None |
| 2 | 5 (users 0-4) | kundli_standard | None |
| 3 | 5 (users 5-9) | kundli_basic | 3 msgs each (parallel with report) |

## Output

`results/run-<timestamp>/`
- `report.md` — full markdown report with latency tables, error breakdown, bottleneck verdict
- `events.jsonl` — raw per-user events
- `summary.json` — run metadata

## Safety

- All dummy users use `stresstest+<n>@jyotish.local` emails
- `--prod` flag + interactive confirmation required for seed and run
- `cleanup.ts` deletes from `public.users` (cascades to all dependent tables) then `auth.users`
- `results/users.json` and `run-*/` are gitignored
