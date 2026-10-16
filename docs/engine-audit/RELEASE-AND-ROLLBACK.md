# Release and rollback of the engine audit

Everything from the audit is on the branch `feat/engine-source-audit` and nothing has been merged, pushed or deployed. This note says how it goes live, and how to take it back.

## The one fact that shapes everything

The backend deploys itself: a cron job on the server pulls `main` every two minutes, builds and reloads (`scripts/cron-auto-deploy.sh`). So **merging into `main` is going live.** There is no staging step in between, and a rollback is the same thing run backwards: a revert commit on `main`, which the server pulls the same way.

## Marker for the starting point

`pre-engine-audit` is a tag on `30d4052`, the tip of `main` when the audit began (2026-10-06). The branch was cut from that commit and `main` has not moved, so a merge is a plain one and the tag is the exact state to compare against. The tag is local until someone pushes it (`git push origin pre-engine-audit`); it is harmless to push.

## How to merge so that it can be undone in one step

```
git checkout main
git merge --no-ff feat/engine-source-audit -m "feat(engine): source-audited calculation engine"
```

`--no-ff` forces one merge commit M that holds the whole audit. To take all of it back:

```
git revert -m 1 M
git push origin main        # the server pulls it within two minutes
```

The branch's commits stay on the branch, so the work is not lost and can be merged again after a fix. If the audit is merged in stages (one release at a time), use one `--no-ff` merge per release and tag each (`engine-audit-r1`, `r2`, ...) so each can be reverted alone.

A single fix can also be reverted on its own: every commit on the branch is one finding (`git log --oneline main..feat/engine-source-audit`). Later commits build on earlier ones in four places, so revert in reverse order when taking out more than one:

| Commit area                                       | Depends on                                                                                                        |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Shadbala (rewrite)                                | `rules/day.ts`, `rules/nature.ts`, `rules/ahargana.ts`, `calculations/mean-longitudes.ts`, midheaven in the chart |
| Yogas (Moon yogas, Amala and others)              | `rules/nature.ts`                                                                                                 |
| Find My Date, Decisions, the connector's calendar | `getLocalSunTimes` in `panchang/index.ts`                                                                         |
| Kundli generation                                 | `rules/day.ts` (`getAstroDay`)                                                                                    |

## What the merge does not do by itself: two version switches

Stored data is keyed by version numbers, so the new rules only show once these are raised, and rolling back restores the old ones.

1. **`CALCULATION_VERSION`** (`src/lib/astro-engine/version.ts`, now `2026.08.1`). It is folded into every stored kundli's hash. Without a bump, kundlis already in the database keep their old yogas, dashas, doshas and Shadbala while new ones get the new ones. A bump makes every kundli regenerate on next use, which also deletes that profile's cached horoscopes and re-runs its AI house insights: a real cost in AI calls, spread over time as users return. **Raise it once, with the merge that goes live.** Rolling back puts the constant back to `2026.08.1`, which is the "no version key" hash format, so every kundli built under the new rules stops matching and regenerates under the old ones. Do not "fix" the baseline constants beside it (see the comment in that file).
2. **`CACHE_VERSION`** in `src/modules/astro/panchang-cache.repo.ts`, already raised from `v4` to `v5` on the branch. The daily Panchang is cached per day and place under that key; the new sunrise-based times would otherwise be hidden by rows warmed before the deploy. Rolling back restores `v4`, and the old rows are still in the table, so they are served again.

The branch changes **no database schema and adds no migration**, so nothing needs migrating forwards or backwards (the server's auto-deploy would have skipped a push that touched `src/db/migrations/`).

## What stays behind after a rollback

These are written once and not recomputed, so a revert does not change them:

- Paid reports already written: the narrative text stays. Their scores are recomputed on each read from the code in force, so those follow the rollback.
- Find My Date and Decision results saved to a user's history (`decision_queries`): saved as returned at the time.
- Palm readings: the "Kundli Match %" is saved with the reading.
- Push notifications and emails already sent.
- AI text already generated from kundlis built under the new rules until those kundlis regenerate.

Daily horoscopes are made per day and replaced the next day; they follow within a day.

## Before merging: the checks

1. `npx vitest run` (the one known failure is `test/admin-demographics.spec.ts`, which also fails on `main`), `npx tsc --noEmit` (99 errors is the existing baseline), `npx eslint` on the touched files.
2. `npx tsx scripts/audit-impact.ts`: read the table. It compares 300 synthetic births against the pre-audit engine. The Shadbala "strong" counts roughly double; that is expected (see C-critical-corrections, Group 2) and is the part to look at with care.
3. Decide the open owner choices listed in `C-critical-corrections.md` (the 36-point band table, the daily lucky number, Kemadruma's extra exemptions, water east and north-west in Vastu). None blocks the merge; each leaves the current behaviour in place until decided.

## After merging: what to look at

- `~/aroha-backend/.deployed-rev` on the server matches the merge commit; `/healthz` and `/readyz` are green.
- Panchang for today in a known city: sunrise within two minutes of an almanac, Rahu Kaal starting at an eighth of the day.
- A fresh kundli: the yoga list, the Mahadasha/Antardasha dates for a recent birth, and the strength card.
- The connector's `generate_birth_chart` and `get_panchang` for the same birth and place.

## If something is wrong

1. `git revert -m 1 M` on `main` and push. Confirm `.deployed-rev` moves to the revert commit.
2. Check that kundlis regenerate (open one; its `calculationVersion` in the chart data is `2026.08.1` again).
3. Nothing needs a database fix. If the AI cost of regenerating is a concern, do the revert in a quiet hour.
