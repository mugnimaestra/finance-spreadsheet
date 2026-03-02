#!/bin/bash
# Deployment script for expense-ai-service
#
# Usage:
#   On VPS: cd ~/projects/finance-spreadsheet/expense-ai-service && bash scripts/deploy.sh
#   Remote: ssh mugnimaestra@155.94.154.237 'cd ~/projects/finance-spreadsheet/expense-ai-service && bash scripts/deploy.sh'

set -e

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
echo "[1/4] Pulling latest changes..."
git pull origin main
echo ""

# Install dependencies
echo "[2/4] Installing dependencies..."
cd "$SERVICE_DIR"
bun install
echo ""

# Restart service
echo "[3/4] Restarting service..."
sudo systemctl restart "$SERVICE_NAME"
echo ""

# Check status
echo "[4/4] Checking service status..."
sleep 2
sudo systemctl status "$SERVICE_NAME" --no-pager
echo ""

# Quick health check
echo "Health check:"
curl -sf http://127.0.0.1:${SERVICE_PORT}/health && echo "" || echo "WARNING: Health check failed"
echo ""

echo "=== Deployment complete ==="
