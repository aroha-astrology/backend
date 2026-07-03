#!/usr/bin/env bash
#
# Pre-populates panchang_cache for the 5 named reference cities (see
# src/lib/astro-tools/panchang-reference-points.ts) so the first user request
# of the day for any of them is a cache hit, not a fresh compute.
#
# Wire into the EC2 crontab to run once daily, shortly after midnight IST —
# e.g. at 00:05 IST (= 18:35 UTC, the box is UTC), just after daily-horoscopes:
#   35 18 * * * /home/ec2-user/aroha-backend/scripts/cron-panchang-warmup.sh \
#     >> /home/ec2-user/cron-panchang-warmup.log 2>&1
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

echo "$(date -u +%FT%TZ) starting panchang-warmup run"
curl -fsS -X POST \
  -H "X-Cron-Secret: $SECRET" \
  -H 'Content-Type: application/json' \
  -d '{}' \
  "http://127.0.0.1:${PORT}/internal/cron/panchang-warmup"
echo
echo "$(date -u +%FT%TZ) done"
