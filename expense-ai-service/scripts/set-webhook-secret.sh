#!/usr/bin/env bash
# set-webhook-secret.sh - Add or update WEBHOOK_SECRET on VPS
# Usage: bash scripts/set-webhook-secret.sh <secret-value>
#
# This also needs to be set on the Cloudflare Worker:
#   cd ~/personal/telegram-bot-cloudflare
#   npx wrangler secret put WEBHOOK_SECRET
#   (paste the same secret value when prompted)

set -euo pipefail

SECRET="${1:?Usage: $0 <webhook-secret-value>}"
VPS_USER="mugnimaestra"
VPS_HOST="155.94.154.237"
ENV_FILE="~/projects/finance-spreadsheet/expense-ai-service/.env"

echo "==> Setting WEBHOOK_SECRET on VPS ($VPS_HOST)..."

ssh "${VPS_USER}@${VPS_HOST}" bash -s "$SECRET" "$ENV_FILE" <<'REMOTE_SCRIPT'
SECRET="$1"
ENV_FILE="$2"
ENV_FILE="${ENV_FILE/#\~/$HOME}"

# Remove existing WEBHOOK_SECRET line if present
if grep -q '^WEBHOOK_SECRET=' "$ENV_FILE" 2>/dev/null; then
  echo "    Updating existing WEBHOOK_SECRET..."
  sed -i "s|^WEBHOOK_SECRET=.*|WEBHOOK_SECRET=${SECRET}|" "$ENV_FILE"
else
  echo "    Adding WEBHOOK_SECRET..."
  echo "" >> "$ENV_FILE"
  echo "# Webhook authentication secret - must match Cloudflare Worker" >> "$ENV_FILE"
  echo "WEBHOOK_SECRET=${SECRET}" >> "$ENV_FILE"
fi

echo "==> Restarting expense-ai-service..."
systemctl --user restart expense-ai-service
sleep 2

echo "==> Service status:"
systemctl --user status expense-ai-service --no-pager -l | head -15

echo ""
echo "==> Current .env (redacted):"
grep -v '^#' "$ENV_FILE" | grep -v '^$' | sed 's/=.*/=***REDACTED***/'

echo ""
echo "==> Done! WEBHOOK_SECRET has been set on VPS."
echo "    Remember to also set it on the Cloudflare Worker:"
echo "    cd ~/personal/telegram-bot-cloudflare && npx wrangler secret put WEBHOOK_SECRET"
REMOTE_SCRIPT
