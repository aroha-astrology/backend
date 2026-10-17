#!/usr/bin/env bash
#
# Nightly copy of the production database into Supabase (production stays on
# EC2; the copy is for the planned move). Runs scripts/db/sync-to-supabase.ts,
# which dumps, loads, verifies and reports to Telegram itself — OK or FAILED.
#
# Wired into the EC2 crontab (box runs UTC) at 17:33 UTC = 23:03 IST. Not :30:
# the 2/5/10-minute jobs and the auto-deploy build all fire on :30.
#   33 17 * * * /home/ec2-user/aroha-backend/scripts/cron-db-sync-supabase.sh \
#     >> /home/ec2-user/cron-db-sync-supabase.log 2>&1
#
# Holds the auto-deploy lock while it runs, so a deploy never swaps
# node_modules under it (cron-auto-deploy.sh skips a tick while it's held).
# Alerts here only when the node script crashed before it could report.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

TELEGRAM_BOT_TOKEN="$(grep -E '^TELEGRAM_BOT_TOKEN=' "$DIR/.env" 2>/dev/null | cut -d= -f2- | tr -d '"' || true)"
TELEGRAM_ALERT_CHAT_ID="$(grep -E '^TELEGRAM_ALERT_CHAT_ID=' "$DIR/.env" 2>/dev/null | cut -d= -f2- | tr -d '"' || true)"

notify() {
  [ -n "$TELEGRAM_BOT_TOKEN" ] && [ -n "$TELEGRAM_ALERT_CHAT_ID" ] || return 0
  curl -fsS --max-time 10 -X POST \
    -H 'Content-Type: application/json' \
    -d "{\"chat_id\":\"${TELEGRAM_ALERT_CHAT_ID}\",\"text\":\"$1\"}" \
    "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    >/dev/null 2>&1 || echo "$(date -u +%FT%TZ) WARN: Telegram alert POST failed" >&2
}

# One copy at a time.
exec 201>"$DIR/.db-sync.lock"
if ! flock -n 201; then
  echo "$(date -u +%FT%TZ) another DB copy is still running, skipping"
  notify "DB copy to Supabase: SKIPPED - the previous run is still going"
  exit 0
fi

# Wait up to 10 minutes for a deploy in progress to finish, then hold its lock.
exec 200>"$DIR/.auto-deploy.lock"
if ! flock -w 600 200; then
  echo "$(date -u +%FT%TZ) ERROR: auto-deploy lock busy for 10 min" >&2
  notify "DB copy to Supabase: FAILED - a deploy held the lock for 10 minutes, copy not made tonight"
  exit 1
fi

echo "$(date -u +%FT%TZ) start"
EXIT=0
# timeout signals the whole process group (npx, node, pg_dump, psql), and
# SIGKILLs it a minute later if anything ignored that — nothing may outlive the
# run while holding the deploy lock. An unfinished load rolls back.
timeout --kill-after=60s 30m npx tsx scripts/db/sync-to-supabase.ts "$@" || EXIT=$?
echo "$(date -u +%FT%TZ) end (exit $EXIT)"

# Exit codes from the script: 0 OK + reported, 2 FAILED + reported,
# 10 OK but its Telegram message didn't go out, 11 FAILED and not reported.
# 124/137 = timed out; anything else = crashed.
case "$EXIT" in
  0|2) ;;
  10) notify "DB copy to Supabase: OK (the detailed message failed to send, see ~/cron-db-sync-supabase.log)" ;;
  11) notify "DB copy to Supabase: FAILED - see ~/cron-db-sync-supabase.log. Supabase keeps the previous copy." ;;
  124|137) notify "DB copy to Supabase: FAILED - timed out after 30 min. Supabase keeps the previous copy." ;;
  *) notify "DB copy to Supabase: FAILED - script crashed (exit ${EXIT}), see ~/cron-db-sync-supabase.log. Supabase keeps the previous copy." ;;
esac
[ "$EXIT" -eq 10 ] && exit 0
exit "$EXIT"
