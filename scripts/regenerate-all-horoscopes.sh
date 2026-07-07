#!/usr/bin/env bash
#
# Force-regenerate ALL horoscopes for all users across all periods.
# This will call the LLM for every (user, period) combination, bypassing the reuse optimization.
#
# WARNING: This is expensive (many LLM calls) and should only be run when necessary.
#
# Usage:
#   ./scripts/regenerate-all-horoscopes.sh              # Regenerate all 5 periods
#   ./scripts/regenerate-all-horoscopes.sh daily        # Only regenerate 'daily'
#   ./scripts/regenerate-all-horoscopes.sh daily tomorrow # Only these two periods
#
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${PORT:-3000}"
SECRET="$(grep -E '^CRON_SECRET=' "$DIR/.env" 2>/dev/null | cut -d= -f2- | tr -d '"' || true)"

if [ -z "$SECRET" ]; then
  echo "$(date -u +%FT%TZ) ERROR: CRON_SECRET not set in $DIR/.env" >&2
  exit 1
fi

# Default: regenerate all 5 periods
PERIODS=("daily" "tomorrow" "weekly" "monthly" "yearly")

# If user specified periods, use those instead
if [ $# -gt 0 ]; then
  PERIODS=("$@")
fi

echo "$(date -u +%FT%TZ) regenerating horoscopes with force=true for periods: ${PERIODS[*]}"

for period in "${PERIODS[@]}"; do
  echo "$(date -u +%FT%TZ) starting regeneration for period: $period"
  curl -fsS -X POST \
    -H "X-Cron-Secret: $SECRET" \
    -H 'Content-Type: application/json' \
    -d "{\"period\":\"$period\",\"force\":true}" \
    "http://127.0.0.1:${PORT}/internal/cron/horoscopes" | jq '.'
  echo "$(date -u +%FT%TZ) completed regeneration for period: $period"
done

echo "$(date -u +%FT%TZ) all regenerations done"
