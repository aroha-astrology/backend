#!/usr/bin/env bash
#
# Broadcasts "your reading is ready" to all active device tokens, localized
# per device locale (English fallback). Idempotent per (period, IST date) —
# safe to re-run; a second call for the same period/day is a no-op unless
# FORCE=1 is set.
#
# Usage: ./cron-broadcast-reading.sh [period]   (period defaults to daily)
#
# Wired into the EC2 crontab (box runs UTC) — schedule chosen so no two
# periods land within 3h of each other and at most 2 pushes go out on any
# single day (yearly > monthly > weekly precedence is enforced server-side
# by shouldBroadcast() in broadcast.service.ts, so a stray/duplicate cron
# firing on the wrong day is a harmless no-op, not a bad send):
#   30  1 * * *    cron-broadcast-reading.sh daily     # 07:00 IST, every day
#   30  4 * * 1    cron-broadcast-reading.sh weekly    # 10:00 IST, Mondays
#   30  5 1 * *    cron-broadcast-reading.sh monthly   # 11:00 IST, 1st of month
#   30 12 1 1 *    cron-broadcast-reading.sh yearly    # 18:00 IST, Jan 1
#
# NOTE: Must run AFTER the horoscope generation cron (00:01 IST / 18:31 UTC)
# so readings are ready before the notification lands.
#
# Reads CRON_SECRET from the app's .env (never hard-coded in the crontab).
set -euo pipefail

PERIOD="${1:-daily}"

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${PORT:-3000}"
SECRET="$(grep -E '^CRON_SECRET=' "$DIR/.env" 2>/dev/null | cut -d= -f2- | tr -d '"' || true)"
TELEGRAM_BOT_TOKEN="$(grep -E '^TELEGRAM_BOT_TOKEN=' "$DIR/.env" 2>/dev/null | cut -d= -f2- | tr -d '"' || true)"
TELEGRAM_ALERT_CHAT_ID="$(grep -E '^TELEGRAM_ALERT_CHAT_ID=' "$DIR/.env" 2>/dev/null | cut -d= -f2- | tr -d '"' || true)"

if [ -z "$SECRET" ]; then
  echo "$(date -u +%FT%TZ) ERROR: CRON_SECRET not set in $DIR/.env" >&2
  exit 1
fi

echo "$(date -u +%FT%TZ) starting broadcast-reading (period=$PERIOD)"
CURL_EXIT=0
curl -fsS --max-time 3600 -X POST \
  -H "X-Cron-Secret: $SECRET" \
  -H 'Content-Type: application/json' \
  -d "{\"period\":\"${PERIOD}\"$( [ "${FORCE:-}" = "1" ] && echo ',"force":true' )}" \
  "http://127.0.0.1:${PORT}/internal/cron/broadcast-reading" || CURL_EXIT=$?
echo

if [ "$CURL_EXIT" -ne 0 ]; then
  echo "$(date -u +%FT%TZ) ERROR: cron-broadcast-reading.sh failed for period=$PERIOD (curl exit $CURL_EXIT)" >&2
  if [ -n "$TELEGRAM_BOT_TOKEN" ] && [ -n "$TELEGRAM_ALERT_CHAT_ID" ]; then
    curl -fsS --max-time 10 -X POST \
      -H 'Content-Type: application/json' \
      -d "{\"chat_id\":\"${TELEGRAM_ALERT_CHAT_ID}\",\"text\":\"cron-broadcast-reading.sh failed for period=${PERIOD} (curl exit ${CURL_EXIT})\"}" \
      "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
      >/dev/null 2>&1 || echo "$(date -u +%FT%TZ) WARN: Telegram alert POST failed" >&2
  else
    echo "$(date -u +%FT%TZ) WARN: TELEGRAM_BOT_TOKEN/TELEGRAM_ALERT_CHAT_ID not set in $DIR/.env; no alert sent" >&2
  fi
  exit "$CURL_EXIT"
fi

echo "$(date -u +%FT%TZ) done (period=$PERIOD)"
