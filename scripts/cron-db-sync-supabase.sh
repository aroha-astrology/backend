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
timeout 30m npx tsx scripts/db/sync-to-supabase.ts "$@" || EXIT=$?
echo "$(date -u +%FT%TZ) end (exit $EXIT)"

# 0 = OK, 2 = FAILED and already reported by the script.
if [ "$EXIT" -ne 0 ] && [ "$EXIT" -ne 2 ]; then
  notify "DB copy to Supabase: FAILED - script crashed or timed out (exit ${EXIT}), see ~/cron-db-sync-supabase.log. Supabase keeps the previous copy."
fi
exit "$EXIT"
