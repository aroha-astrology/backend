#!/usr/bin/env bash
#
# Drains the support Gmail inbox and applies what it finds — see
# support-mail.service.ts. A reply to a ticket mail is appended to that
# ticket's note (visible to the user in the app, and pushed to them); a reply
# carrying APPROVE/REJECT plus its signing token decides a pending
# account-deletion request. Mail matching neither is left unread and untouched.
#
# No-ops when SUPPORT_EMAIL_USER/SUPPORT_EMAIL_APP_PASSWORD are unset, so this
# is safe to leave in the crontab on a box with no mailbox configured.
#
# Wired into the EC2 crontab every 5 minutes:
#   */5 * * * * /home/ec2-user/aroha-backend/scripts/cron-support-mail-poll.sh \
#     >> /home/ec2-user/cron-support-mail-poll.log 2>&1
#
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

CURL_EXIT=0
# --max-time is generous: one poll opens an IMAP connection and parses every
# unread message, which is slower than the other cron endpoints' pure DB work.
RESPONSE="$(curl -fsS --max-time 120 -X POST \
  -H "X-Cron-Secret: $SECRET" \
  -H 'Content-Type: application/json' \
  -d '{}' \
  "http://127.0.0.1:${PORT}/internal/cron/support-mail-poll")" || CURL_EXIT=$?

if [ "$CURL_EXIT" -ne 0 ]; then
  echo "$(date -u +%FT%TZ) ERROR: cron-support-mail-poll.sh failed (curl exit $CURL_EXIT)" >&2
  if [ -n "$TELEGRAM_BOT_TOKEN" ] && [ -n "$TELEGRAM_ALERT_CHAT_ID" ]; then
    curl -fsS --max-time 10 -X POST \
      -H 'Content-Type: application/json' \
      -d "{\"chat_id\":\"${TELEGRAM_ALERT_CHAT_ID}\",\"text\":\"cron-support-mail-poll.sh failed (curl exit ${CURL_EXIT})\"}" \
      "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
      >/dev/null 2>&1 || echo "$(date -u +%FT%TZ) WARN: Telegram alert POST failed" >&2
  fi
  exit "$CURL_EXIT"
fi

# Only logged when something actually happened, so the every-5-minutes log
# doesn't grow a line per run forever (there is no log rotation on this box).
case "$RESPONSE" in
  *'"replies":0'*'"decisions":0'*) ;;
  *) echo "$(date -u +%FT%TZ) $RESPONSE" ;;
esac
