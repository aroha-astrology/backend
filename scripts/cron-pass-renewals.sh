#!/usr/bin/env bash
#
# Aroha Pass renewals: renews wallet Passes that are due from the user's
# balance, ends the ones the balance can't cover, sends the "ends in 3 days"
# reminders, and expires lapsed Passes. Play Store Passes are kept in step by
# the RTDN webhook instead; this only expires them if Google went quiet.
#
# Usage: ./cron-pass-renewals.sh [--dry-run]
#
# Only needed once the Aroha Pass is switched on (nav.arohaPass). Suggested
# crontab (box runs UTC):
#   30 0 * * *    cron-pass-renewals.sh   # 06:00 IST
#
# Reads CRON_SECRET from the app's .env (never hard-coded in the crontab).
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${PORT:-3000}"
SECRET="$(grep -E '^CRON_SECRET=' "$DIR/.env" 2>/dev/null | cut -d= -f2- | tr -d '"' || true)"
TELEGRAM_BOT_TOKEN="$(grep -E '^TELEGRAM_BOT_TOKEN=' "$DIR/.env" 2>/dev/null | cut -d= -f2- | tr -d '"' || true)"
TELEGRAM_ALERT_CHAT_ID="$(grep -E '^TELEGRAM_ALERT_CHAT_ID=' "$DIR/.env" 2>/dev/null | cut -d= -f2- | tr -d '"' || true)"

DRY_RUN_JSON="false"
if [ "${1:-}" = "--dry-run" ]; then
  DRY_RUN_JSON="true"
fi

if [ -z "$SECRET" ]; then
  echo "$(date -u +%FT%TZ) ERROR: CRON_SECRET not set in $DIR/.env" >&2
  exit 1
fi

echo "$(date -u +%FT%TZ) starting pass-renewals (dryRun=$DRY_RUN_JSON)"
CURL_EXIT=0
curl -fsS --max-time 600 -X POST \
  -H "X-Cron-Secret: $SECRET" \
  -H 'Content-Type: application/json' \
  -d "{\"dryRun\":${DRY_RUN_JSON}}" \
  "http://127.0.0.1:${PORT}/internal/cron/pass-renewals" || CURL_EXIT=$?
echo

if [ "$CURL_EXIT" -ne 0 ]; then
  echo "$(date -u +%FT%TZ) ERROR: cron-pass-renewals.sh failed (curl exit $CURL_EXIT)" >&2
  if [ -n "$TELEGRAM_BOT_TOKEN" ] && [ -n "$TELEGRAM_ALERT_CHAT_ID" ]; then
    curl -fsS --max-time 10 -X POST \
      -H 'Content-Type: application/json' \
      -d "{\"chat_id\":\"${TELEGRAM_ALERT_CHAT_ID}\",\"text\":\"cron-pass-renewals.sh failed (curl exit ${CURL_EXIT})\"}" \
      "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
      >/dev/null 2>&1 || echo "$(date -u +%FT%TZ) WARN: Telegram alert POST failed" >&2
  fi
  exit "$CURL_EXIT"
fi

echo "$(date -u +%FT%TZ) done"
