#!/usr/bin/env bash
#
# Fact-based re-engagement nudge: for every user with a saved user_facts row,
# reminds them of a dated window the assistant already committed to or an
# unanswered follow-up question — or sends nothing that cycle, if neither
# qualifies. See fact-nudge.service.ts.
#
# Wired into the EC2 crontab to fire every Sunday, 11:30 IST — the service
# itself only acts on the 1st/3rd Sunday of the month (isNudgeSunday() in
# lib/llm/fact-nudge.ts) and no-ops otherwise, since Vixie cron ORs
# day-of-month against day-of-week and can't express "1st or 3rd Sunday"
# directly:
#   0 6 * * 0   /home/ec2-user/aroha-backend/scripts/cron-fact-nudge.sh \
#     >> /home/ec2-user/cron-fact-nudge.log 2>&1
#
# No-op unless FACT_NUDGE_ENABLED=true in .env — verify with DRY_RUN=1 first.
# Reads CRON_SECRET from the app's .env (never hard-coded in the crontab) and
# calls the internal, secret-protected endpoint on localhost.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${PORT:-3000}"
SECRET="$(grep -E '^CRON_SECRET=' "$DIR/.env" 2>/dev/null | cut -d= -f2- | tr -d '"' || true)"
TELEGRAM_BOT_TOKEN="$(grep -E '^TELEGRAM_BOT_TOKEN=' "$DIR/.env" 2>/dev/null | cut -d= -f2- | tr -d '"' || true)"
TELEGRAM_ALERT_CHAT_ID="$(grep -E '^TELEGRAM_ALERT_CHAT_ID=' "$DIR/.env" 2>/dev/null | cut -d= -f2- | tr -d '"' || true)"

if [ -z "$SECRET" ]; then
  echo "$(date -u +%FT%TZ) ERROR: CRON_SECRET not set in $DIR/.env" >&2
  exit 1
fi

PAYLOAD="{"
[ "${FORCE:-}" = "1" ]   && PAYLOAD="${PAYLOAD}\"force\":true,"
[ "${DRY_RUN:-}" = "1" ] && PAYLOAD="${PAYLOAD}\"dryRun\":true,"
PAYLOAD="${PAYLOAD%,}}"

CURL_EXIT=0
curl -fsS --max-time 300 -X POST \
  -H "X-Cron-Secret: $SECRET" \
  -H 'Content-Type: application/json' \
  -d "$PAYLOAD" \
  "http://127.0.0.1:${PORT}/internal/cron/fact-nudge" || CURL_EXIT=$?
echo

if [ "$CURL_EXIT" -ne 0 ]; then
  echo "$(date -u +%FT%TZ) ERROR: cron-fact-nudge.sh failed (curl exit $CURL_EXIT)" >&2
  if [ -n "$TELEGRAM_BOT_TOKEN" ] && [ -n "$TELEGRAM_ALERT_CHAT_ID" ]; then
    curl -fsS --max-time 10 -X POST \
      -H 'Content-Type: application/json' \
      -d "{\"chat_id\":\"${TELEGRAM_ALERT_CHAT_ID}\",\"text\":\"cron-fact-nudge.sh failed (curl exit ${CURL_EXIT})\"}" \
      "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
      >/dev/null 2>&1 || echo "$(date -u +%FT%TZ) WARN: Telegram alert POST failed" >&2
  fi
  exit "$CURL_EXIT"
fi
