#!/usr/bin/env bash
#
# Polls origin/main every 2 minutes; if it has moved, fast-forwards, builds,
# and reloads pm2 automatically. Wired into the EC2 crontab:
#   */2 * * * * /home/ec2-user/aroha-backend/scripts/cron-auto-deploy.sh \
#     >> /home/ec2-user/cron-auto-deploy.log 2>&1
#
# Safety rules (deliberate, do not remove):
#  - never `reset --hard` (would revert any locally-modified exec bit on
#    scripts/*.sh, see aroha-shlokas-japs-feature memory) — ff-only merge only.
#  - never auto-run DB migrations unattended — if src/db/migrations/ changed,
#    alert and stop; a human deploys that one by hand.
#  - flock guard so a slow build never overlaps the next 2-minute tick.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

exec 200>"$DIR/.auto-deploy.lock"
flock -n 200 || exit 0

PORT="${PORT:-3000}"
TELEGRAM_BOT_TOKEN="$(grep -E '^TELEGRAM_BOT_TOKEN=' "$DIR/.env" 2>/dev/null | cut -d= -f2- | tr -d '"' || true)"
TELEGRAM_ALERT_CHAT_ID="$(grep -E '^TELEGRAM_ALERT_CHAT_ID=' "$DIR/.env" 2>/dev/null | cut -d= -f2- | tr -d '"' || true)"

notify() {
  [ -n "$TELEGRAM_BOT_TOKEN" ] && [ -n "$TELEGRAM_ALERT_CHAT_ID" ] || return 0
  curl -fsS --max-time 10 -X POST \
    -H 'Content-Type: application/json' \
    -d "{\"chat_id\":\"${TELEGRAM_ALERT_CHAT_ID}\",\"text\":\"$1\"}" \
    "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    >/dev/null 2>&1 || echo "$(date -u +%FT%TZ) WARN: Telegram alert POST failed" >&2
}

git fetch origin main -q

LOCAL="$(git rev-parse HEAD)"
REMOTE="$(git rev-parse origin/main)"
[ "$LOCAL" = "$REMOTE" ] && exit 0

echo "$(date -u +%FT%TZ) main moved: ${LOCAL:0:7} -> ${REMOTE:0:7}"

if ! git diff --quiet "$LOCAL" "$REMOTE" -- src/db/migrations/; then
  notify "aroha-backend: main has new commits (${REMOTE:0:7}) that include DB migrations - NOT auto-deployed, deploy manually."
  exit 0
fi

if ! git merge --ff-only origin/main -q; then
  notify "aroha-backend: main moved to ${REMOTE:0:7} but ff-only merge failed (local changes on box) - deploy manually."
  exit 1
fi

chmod +x scripts/*.sh

if ! git diff --quiet "$LOCAL" "$REMOTE" -- package-lock.json; then
  npm ci
fi

npm run build
echo "$REMOTE" > .deployed-rev

pm2 reload aroha-api
pm2 save

sleep 3
if curl -fsS --max-time 10 "http://127.0.0.1:${PORT}/healthz" >/dev/null 2>&1; then
  notify "aroha-backend auto-deployed ${LOCAL:0:7} -> ${REMOTE:0:7}"
else
  notify "aroha-backend auto-deploy to ${REMOTE:0:7} FAILED healthz check - investigate now"
  exit 1
fi
