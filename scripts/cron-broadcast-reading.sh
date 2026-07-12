#!/usr/bin/env bash
#
# Broadcasts "Today's Reading is Ready" to all active device tokens.
# Uses a rotating set of 7 Vedic-themed push hooks — one per day of the week —
# so the notification is different every day and never feels like spam.
#
# Wired into the EC2 crontab to run at 07:00 IST (= 01:30 UTC, box is UTC):
#   30 1 * * * /home/ec2-user/aroha-backend/scripts/cron-broadcast-reading.sh \
#     >> /home/ec2-user/cron-broadcast-reading.log 2>&1
#
# NOTE: Must run AFTER the horoscope generation cron (00:01 IST / 18:31 UTC)
# so readings are ready before the notification lands. The 7-hour gap is enough.
#
# Reads CRON_SECRET from the app's .env (never hard-coded in the crontab).
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${PORT:-3000}"
SECRET="$(grep -E '^CRON_SECRET=' "$DIR/.env" 2>/dev/null | cut -d= -f2- | tr -d '"' || true)"

if [ -z "$SECRET" ]; then
  echo "$(date -u +%FT%TZ) ERROR: CRON_SECRET not set in $DIR/.env" >&2
  exit 1
fi

echo "$(date -u +%FT%TZ) starting broadcast-daily-reading"
curl -fsS -X POST \
  -H "X-Cron-Secret: $SECRET" \
  -H 'Content-Type: application/json' \
  -d '{}' \
  "http://127.0.0.1:${PORT}/internal/cron/broadcast-daily-reading"
echo
echo "$(date -u +%FT%TZ) done"
