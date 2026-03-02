#!/bin/bash
# Deployment script for expense-ai-service
# Usage: ssh to VPS, then run: bash scripts/deploy.sh
# Or remotely: ssh mugnimaestra@155.94.154.237 'cd ~/projects/expense-ai-service && bash scripts/deploy.sh'

set -e

PROJECT_DIR=~/projects/expense-ai-service
SERVICE_NAME=expense-ai-service

echo "=== expense-ai-service deployment ==="
echo "Date: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo ""

# Navigate to project directory
cd "$PROJECT_DIR"

# Pull latest changes
echo "[1/4] Pulling latest changes..."
git pull origin main
echo ""

# Install dependencies
echo "[2/4] Installing dependencies..."
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
curl -sf http://127.0.0.1:3001/health && echo "" || echo "WARNING: Health check failed"
echo ""

echo "=== Deployment complete ==="
