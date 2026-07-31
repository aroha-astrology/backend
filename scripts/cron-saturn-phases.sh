#!/usr/bin/env bash
#
# Detects each user's current Sade Sati / Dhaiya phase from the real-ingress
# Saturn timeline, persists it to saturn_phases, and pushes a notification to
# anyone whose phase changed since the last run. Single combined action
# (unlike the transit-alerts pipeline) since the copy is static, not
# Gemini-drafted — there's no separate draft step to isolate.
#
# Usage: ./cron-saturn-phases.sh [--dry-run]
#
# Phase transitions are rare (Sade Sati/Dhaiya windows last years), so a
# daily run is cheap and safe to re-run — a day with no transitions just
# persists refreshed lastCheckedAt/window bounds for every ready kundli.
#
# Suggested crontab (box runs UTC): run once daily, clear of the other
# nightly jobs —
#   0  20 * * *    cron-saturn-phases.sh   # 01:30 IST (next day)
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

echo "$(date -u +%FT%TZ) starting saturn-phases (dryRun=$DRY_RUN_JSON)"
CURL_EXIT=0
curl -fsS --max-time 3600 -X POST \
  -H "X-Cron-Secret: $SECRET" \
  -H 'Content-Type: application/json' \
  -d "{\"dryRun\":${DRY_RUN_JSON}}" \
  "http://127.0.0.1:${PORT}/internal/cron/saturn-phases" || CURL_EXIT=$?
echo

if [ "$CURL_EXIT" -ne 0 ]; then
  echo "$(date -u +%FT%TZ) ERROR: cron-saturn-phases.sh failed (curl exit $CURL_EXIT)" >&2
  if [ -n "$TELEGRAM_BOT_TOKEN" ] && [ -n "$TELEGRAM_ALERT_CHAT_ID" ]; then
    curl -fsS --max-time 10 -X POST \
      -H 'Content-Type: application/json' \
      -d "{\"chat_id\":\"${TELEGRAM_ALERT_CHAT_ID}\",\"text\":\"cron-saturn-phases.sh failed (curl exit ${CURL_EXIT})\"}" \
      "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
      >/dev/null 2>&1 || echo "$(date -u +%FT%TZ) WARN: Telegram alert POST failed" >&2
  else
    echo "$(date -u +%FT%TZ) WARN: TELEGRAM_BOT_TOKEN/TELEGRAM_ALERT_CHAT_ID not set in $DIR/.env; no alert sent" >&2
  fi
  exit "$CURL_EXIT"
fi

echo "$(date -u +%FT%TZ) done"
