#!/bin/bash
# Deployment script for expense-ai-service
#
# Usage:
#   On VPS: cd ~/projects/finance-spreadsheet/expense-ai-service && bash scripts/deploy.sh
#   Remote: ssh mugnimaestra@155.94.154.237 'cd ~/projects/finance-spreadsheet/expense-ai-service && bash scripts/deploy.sh'

set -e

# Non-interactive SSH sessions don't load .bashrc/.profile, so bun and opencode
# won't be on PATH. Export them explicitly.
export PATH="/home/mugnimaestra/.bun/bin:/home/mugnimaestra/.opencode/bin:$PATH"

# systemctl --user requires XDG_RUNTIME_DIR, which may not be set in
# non-interactive SSH sessions.
export XDG_RUNTIME_DIR="/run/user/$(id -u)"

# Configuration
REPO_DIR=~/projects/finance-spreadsheet
SERVICE_DIR="$REPO_DIR/expense-ai-service"
SERVICE_NAME=expense-ai-service
SERVICE_PORT=3001

echo "=== expense-ai-service deployment ==="
echo "Date: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo ""

# Navigate to repo root for git pull
cd "$REPO_DIR"

# Pull latest changes
echo "[1/5] Pulling latest changes..."
git pull origin main
echo ""

# Install dependencies
echo "[2/5] Installing dependencies..."
cd "$SERVICE_DIR"
bun install
echo ""

# Sync OpenCode agent configuration
echo "[3/5] Syncing OpenCode agent configuration..."
bash "$SERVICE_DIR/scripts/setup-opencode-config.sh"
echo ""

# Restart service
echo "[4/5] Restarting service..."
systemctl --user restart "$SERVICE_NAME"
echo ""

# Check status
echo "[5/5] Checking service status..."
sleep 2
systemctl --user status "$SERVICE_NAME" --no-pager
echo ""

# Quick health check
echo "Health check:"
curl -sf http://127.0.0.1:${SERVICE_PORT}/health && echo "" || echo "WARNING: Health check failed"
echo ""

echo "=== Deployment complete ==="
