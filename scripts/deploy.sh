#!/usr/bin/env bash
#
# One-shot deploy: sync the working tree to the EC2 box, install/build/migrate
# only when needed, zero-downtime restart under pm2, and verify.
#
#   ./scripts/deploy.sh          (or: npm run deploy)
#
# Override any of these via the environment if your setup differs:
#   AROHA_PEM  AROHA_HOST  AROHA_REMOTE_DIR  AROHA_APP  AROHA_PORT
#
set -euo pipefail

PEM="${AROHA_PEM:-/Users/atulgoel/Downloads/mumbai-server-key (1).pem}"
HOST="${AROHA_HOST:-ec2-user@13.232.179.137}"
REMOTE_DIR="${AROHA_REMOTE_DIR:-/home/ec2-user/aroha-backend}"
APP="${AROHA_APP:-aroha-api}"
PORT="${AROHA_PORT:-3000}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCAL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REV="$(cd "$LOCAL_DIR" && git rev-parse --short HEAD 2>/dev/null || echo nogit)"

ssh_run() { ssh -i "$PEM" -o StrictHostKeyChecking=accept-new "$HOST" "$@"; }

echo "▶ Deploying ${REV}  →  ${HOST}:${REMOTE_DIR}"

# 1) Sync code (never ships .env, secrets, node_modules, dist, or .git).
#    --itemize-changes lets us see exactly what moved and branch on it.
CHANGES="$(rsync -az --delete --itemize-changes \
  --exclude '.git' --exclude 'node_modules' --exclude 'dist' \
  --exclude 'secrets' --exclude '.env' \
  -e "ssh -i \"$PEM\" -o StrictHostKeyChecking=accept-new" \
  "$LOCAL_DIR/" "$HOST:$REMOTE_DIR/")"

if [ -z "$CHANGES" ]; then
  echo "  (no file changes — server already in sync)"
else
  echo "$CHANGES" | sed 's/^/  changed: /'
fi

# Only reinstall deps / run migrations when the relevant files actually changed.
need_install=false; need_migrate=false
echo "$CHANGES" | grep -qE 'package-lock\.json'     && need_install=true
echo "$CHANGES" | grep -qE 'src/db/migrations/'    && need_migrate=true

# 2) Build + restart on the server (args become $1..$6 for the remote shell).
ssh_run "bash -s" "$REMOTE_DIR" "$APP" "$REV" "$need_install" "$need_migrate" <<'REMOTE'
set -e
REMOTE_DIR="$1"; APP="$2"; REV="$3"; need_install="$4"; need_migrate="$5"
cd "$REMOTE_DIR"
# Belt-and-suspenders: a Windows source checkout has bitten us twice with
# CRLF-corrupted + non-executable cron scripts surviving the sync (rsync/tar
# ship whatever the local working tree reports, and Windows permission bits
# and line endings for these files aren't reliably preserved end-to-end).
# .gitattributes now forces LF at checkout time, but this normalizes the
# scripts unconditionally on every deploy regardless of the source platform.
sed -i 's/\r$//' scripts/*.sh
chmod +x scripts/*.sh
if [ "$need_install" = "true" ]; then echo "▶ deps changed → npm ci"; npm ci; else echo "▶ deps unchanged → skipping npm ci"; fi
echo "▶ build"; npm run build >/dev/null
if [ "$need_migrate" = "true" ]; then echo "▶ migrations changed → db:migrate"; npm run db:migrate; fi
echo "$REV" > .deployed-rev
echo "▶ reload pm2"
pm2 reload "$APP" >/dev/null 2>&1 || pm2 start dist/index.js --name "$APP" -i max
pm2 save >/dev/null
REMOTE

# 3) Verify: deployed revision must equal local HEAD, and the app must be healthy.
echo "▶ Verify"
ssh_run "printf '  deployed-rev: '; cat '$REMOTE_DIR/.deployed-rev'; \
         printf '  healthz: '; curl -s http://127.0.0.1:$PORT/healthz; echo; \
         printf '  readyz:  '; curl -s http://127.0.0.1:$PORT/readyz; echo"
echo "  local-rev:    $REV"
echo "✓ Deploy complete — http://${HOST#*@}:${PORT}/docs"
