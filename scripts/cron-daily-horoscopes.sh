#!/usr/bin/env bash
#
# Triggers the daily personalized-horoscope generation for all users.
#
# Wired into the EC2 crontab to run at 00:01 IST (= 18:31 UTC, the box is UTC):
#   31 18 * * * /home/ec2-user/aroha-backend/scripts/cron-daily-horoscopes.sh \
#     >> /home/ec2-user/cron-horoscopes.log 2>&1
#
# Reads CRON_SECRET from the app's .env (never hard-coded in the crontab) and
# calls the internal, secret-protected endpoint on localhost.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${PORT:-3000}"
SECRET="$(grep -E '^CRON_SECRET=' "$DIR/.env" 2>/dev/null | cut -d= -f2- | tr -d '"' || true)"

if [ -z "$SECRET" ]; then
  echo "$(date -u +%FT%TZ) ERROR: CRON_SECRET not set in $DIR/.env" >&2
  exit 1
fi

echo "$(date -u +%FT%TZ) starting daily-horoscopes run"
curl -fsS -X POST \
  -H "X-Cron-Secret: $SECRET" \
  -H 'Content-Type: application/json' \
  -d '{}' \
  "http://127.0.0.1:${PORT}/internal/cron/daily-horoscopes"
echo
echo "$(date -u +%FT%TZ) done"
