#!/usr/bin/env bash
#
# Reconciles Razorpay orders that were captured on Razorpay's side but never confirmed
# client-side — browser killed or connectivity lost between checkout.js closing and the
# POST /billing/razorpay/verify call landing (see RAZORPAY_RECONCILE_STALE_MS in
# billing.repo.ts and reconcileStaleRazorpayOrders in billing.service.ts).
#
# Wired into the EC2 crontab to run every 10 minutes:
#   */10 * * * * /home/ec2-user/aroha-backend/scripts/cron-billing-razorpay-reconcile.sh \
#     >> /home/ec2-user/cron-billing-razorpay-reconcile.log 2>&1
#
# Reads CRON_SECRET from the app's .env (never hard-coded in the crontab) and
# calls the internal, secret-protected endpoint on localhost. Most ticks are
# expected to reconcile zero orders — this is a self-heal sweep, not a signal
# of a problem on its own.
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
curl -fsS --max-time 30 -X POST \
  -H "X-Cron-Secret: $SECRET" \
  -H 'Content-Type: application/json' \
  -d '{}' \
  "http://127.0.0.1:${PORT}/internal/cron/billing-razorpay-reconcile" || CURL_EXIT=$?

if [ "$CURL_EXIT" -ne 0 ]; then
  echo "$(date -u +%FT%TZ) ERROR: cron-billing-razorpay-reconcile.sh failed (curl exit $CURL_EXIT)" >&2
  if [ -n "$TELEGRAM_BOT_TOKEN" ] && [ -n "$TELEGRAM_ALERT_CHAT_ID" ]; then
    curl -fsS --max-time 10 -X POST \
      -H 'Content-Type: application/json' \
      -d "{\"chat_id\":\"${TELEGRAM_ALERT_CHAT_ID}\",\"text\":\"cron-billing-razorpay-reconcile.sh failed (curl exit ${CURL_EXIT})\"}" \
      "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
      >/dev/null 2>&1 || echo "$(date -u +%FT%TZ) WARN: Telegram alert POST failed" >&2
  fi
  exit "$CURL_EXIT"
fi
