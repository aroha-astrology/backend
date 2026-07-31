#!/usr/bin/env bash
#
# Transit pre-alerts: tells every user two days ahead that a planet is about
# to change sign or station, in copy written per (event x natal Moon sign x
# language).
#
# Usage: ./cron-transit-alerts.sh <detect|draft|send>
#
# The three phases are separate so a failure in one cannot silently become a
# bad send in another — in particular, copy is drafted a full day before it is
# delivered, so a Gemini outage degrades to static fallback copy with time to
# spare instead of at 19:00 with none.
#
# Wired into the EC2 crontab (box runs UTC). Spaced clear of the daily reading
# broadcast at 07:00 IST / 01:30 UTC so the two never land together:
#   0   2 1 * *   cron-transit-alerts.sh detect   # 07:30 IST, 1st of month
#   30  3 * * *   cron-transit-alerts.sh draft    # 09:00 IST, daily
#   30 13 * * *   cron-transit-alerts.sh send     # 19:00 IST, daily
#
# `send` is idempotent per IST date (cron_batch_runs jobName='transit-alert'),
# so a retry or a duplicate cron firing is a no-op rather than a second push.
# Set FORCE=1 to override that, and DRY_RUN=1 to resolve recipients and copy
# without calling FCM.
#
# Reads CRON_SECRET from the app's .env (never hard-coded in the crontab).
set -euo pipefail

ACTION="${1:-}"
case "$ACTION" in
  detect|draft|send) ;;
  *)
    echo "$(date -u +%FT%TZ) ERROR: usage: $0 <detect|draft|send>" >&2
    exit 2
    ;;
esac

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${PORT:-3000}"
SECRET="$(grep -E '^CRON_SECRET=' "$DIR/.env" 2>/dev/null | cut -d= -f2- | tr -d '"' || true)"
TELEGRAM_BOT_TOKEN="$(grep -E '^TELEGRAM_BOT_TOKEN=' "$DIR/.env" 2>/dev/null | cut -d= -f2- | tr -d '"' || true)"
TELEGRAM_ALERT_CHAT_ID="$(grep -E '^TELEGRAM_ALERT_CHAT_ID=' "$DIR/.env" 2>/dev/null | cut -d= -f2- | tr -d '"' || true)"

if [ -z "$SECRET" ]; then
  echo "$(date -u +%FT%TZ) ERROR: CRON_SECRET not set in $DIR/.env" >&2
  exit 1
fi

PAYLOAD="{\"action\":\"${ACTION}\""
[ "${FORCE:-}" = "1" ]   && PAYLOAD="${PAYLOAD},\"force\":true"
[ "${DRY_RUN:-}" = "1" ] && PAYLOAD="${PAYLOAD},\"dryRun\":true"
PAYLOAD="${PAYLOAD}}"

echo "$(date -u +%FT%TZ) starting transit-alerts (action=$ACTION)"
CURL_EXIT=0
# `detect` walks ~400 days of ephemeris and can run for minutes; the long
# timeout is sized for it, not for the sub-second send.
curl -fsS --max-time 3600 -X POST \
  -H "X-Cron-Secret: $SECRET" \
  -H 'Content-Type: application/json' \
  -d "$PAYLOAD" \
  "http://127.0.0.1:${PORT}/internal/cron/transit-alerts" || CURL_EXIT=$?
echo

if [ "$CURL_EXIT" -ne 0 ]; then
  echo "$(date -u +%FT%TZ) ERROR: cron-transit-alerts.sh failed for action=$ACTION (curl exit $CURL_EXIT)" >&2
  if [ -n "$TELEGRAM_BOT_TOKEN" ] && [ -n "$TELEGRAM_ALERT_CHAT_ID" ]; then
    curl -fsS --max-time 10 -X POST \
      -H 'Content-Type: application/json' \
      -d "{\"chat_id\":\"${TELEGRAM_ALERT_CHAT_ID}\",\"text\":\"cron-transit-alerts.sh failed for action=${ACTION} (curl exit ${CURL_EXIT})\"}" \
      "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
      >/dev/null 2>&1 || echo "$(date -u +%FT%TZ) WARN: Telegram alert POST failed" >&2
  else
    echo "$(date -u +%FT%TZ) WARN: TELEGRAM_BOT_TOKEN/TELEGRAM_ALERT_CHAT_ID not set in $DIR/.env; no alert sent" >&2
  fi
  exit "$CURL_EXIT"
fi

echo "$(date -u +%FT%TZ) done (action=$ACTION)"
