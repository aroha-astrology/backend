# Load test — production capacity

Finds the sustained request ceiling of the production box (single t4g.micro
running API + Postgres + Redis + nginx) and translates it into a rough DAU
figure. See the plan this was built from for full context.

## Prerequisites

- `TRUST_PROXY=true` set in the box's `.env` and `pm2 reload aroha-api` run —
  required so each virtual user gets its own rate-limit bucket via
  `X-Forwarded-For` instead of collapsing onto the load generator's one IP.
  **Revert this the moment the run finishes.**
- `scripts/load-test/remote-sample.mjs` and (for tier 2/3) `seed-users.ts` /
  `cleanup.ts` copied to the box (`scp` — no build/deploy needed, they're run
  directly with `tsx`/`node` against the already-installed `node_modules`).

## Run order

```bash
# Tier 1 — anonymous cached reads, the main event
for c in 5 10 25 50 100 200; do
  npx tsx scripts/load-test/run.ts --tier 1 --concurrency $c --duration-sec 60 \
    --out results/run-<ts>/tier1-c$c.jsonl --abort-file results/run-<ts>/ABORT
  # check server health between steps before continuing
done
# then hold the last clean concurrency for 15 min (background) while
# scripts/load-test/monitor.ts samples the box every 5s

# Tier 2 — authenticated + chart compute (~20 users, seeded on the box)
ssh <box> 'cd aroha-backend && npx tsx scripts/load-test/seed-users.ts --start 1 --count 20 > tokens.jsonl'
scp <box>:aroha-backend/tokens.jsonl results/run-<ts>/tokens.jsonl
npx tsx scripts/load-test/run.ts --tier 2 --concurrency 20 --duration-sec 180 \
  --tokens results/run-<ts>/tokens.jsonl --out results/run-<ts>/tier2-c20.jsonl

# Tier 3 — AI chat, small scale (needs wallet credits granted during seeding)
npx tsx scripts/load-test/run.ts --tier 3 --concurrency 5 --count 20 \
  --tokens results/run-<ts>/tokens.jsonl --out results/run-<ts>/tier3-c5.jsonl

# Report
npx tsx scripts/load-test/report.ts --run-dir results/run-<ts>

# Cleanup
ssh <box> 'cd aroha-backend && npx tsx scripts/load-test/cleanup.ts --fire'
```

## Safety

- All seeded users use `loadtest-<n>` Firebase uids / `+9190000<nnn>` phones.
- `cleanup.ts` deletes from `public.users` (cascades) then the matching
  Firebase Auth user. Always dry-run first (no `--fire`).
- `results/` is gitignored.
